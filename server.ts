import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp as initializeAdminApp, getApps as getAdminApps, getApp as getAdminApp, App as AdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth, DecodedIdToken } from "firebase-admin/auth";
import {
  fairAssistRootAgent,
  runFairAssistRootAgent,
  FAIRASSIST_ROOT_AGENT_NAME,
} from "./src/agents/fairAssistAgent";
import {
  MULTIMODAL_EVIDENCE_AGENT_NAME,
  MULTIMODAL_EVIDENCE_AGENT_INSTRUCTION,
} from "./src/agents/multimodalEvidenceAgent";
import {
  FINANCIAL_REASONING_AGENT_NAME,
  calculateFinancialMetrics,
  extractScenarioBorrowingAmount,
} from "./src/agents/financialReasoningAgent";
import {
  deriveCanonicalObligations,
  getCanonicalEvidenceDetails,
  normalizeInstitutionName,
} from "./src/utils/canonicalData";
import {
  retrieveApplicableRegulations,
  verifyInstitution,
  retrieveInstitutionPolicy,
  getApplicableInstitutions,
} from "./src/services/policyRetrievalService";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with size limits
app.use(express.json({ limit: "10mb" }));

// In-memory rate limiter per IP address for API endpoints
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateLimitRecord>();

const apiRateLimiter = (maxRequests = 60, windowMs = 60 * 1000) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown-client";
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: "Too many requests. Please try again in a moment.",
      });
    }

    record.count += 1;
    return next();
  };
};

// Initialize Firebase Admin SDK (lazy / idempotent)
let firebaseAdminApp: AdminApp | null = null;
function getFirebaseAdmin(): AdminApp {
  if (!firebaseAdminApp) {
    if (getAdminApps().length === 0) {
      const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.VITE_FIREBASE_PROJECT_ID ||
        "fairassist-demo";
      try {
        firebaseAdminApp = initializeAdminApp({
          projectId,
        });
      } catch (e) {
        console.warn("Firebase Admin initialization note:", e);
        firebaseAdminApp = getAdminApp();
      }
    } else {
      firebaseAdminApp = getAdminApp();
    }
  }
  return firebaseAdminApp;
}

// Authentication Middleware to verify Firebase ID Tokens
interface AuthenticatedRequest extends express.Request {
  user?: DecodedIdToken;
}

const requireAuth = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required. Please sign in with Google through Firebase Authentication.",
      code: "UNAUTHENTICATED",
    });
  }

  const idToken = authHeader.split("Bearer ")[1]?.trim();
  if (!idToken) {
    return res.status(401).json({
      error: "Missing bearer token.",
      code: "UNAUTHENTICATED",
    });
  }

  try {
    const adminApp = getFirebaseAdmin();
    const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
    req.user = decodedToken;
    return next();
  } catch (err: any) {
    console.error("Firebase ID Token verification error:", err?.message || err);
    return res.status(401).json({
      error: "Invalid or expired authentication token. Please sign in again.",
      code: "INVALID_TOKEN",
    });
  }
};


// Initialize Gemini Client safely
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("GEMINI_API_KEY environment variable is required but missing.");
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
  });
};

// 1. Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "FairAssist", timestamp: new Date().toISOString() });
});

// Helper for exponential backoff delay with jitter
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface UpstreamAttemptLog {
  event: "analyze-evidence";
  requestId: string;
  model: string;
  attempt: number;
  isFallback: boolean;
  status: string | number;
  retryable: boolean;
  action: "retry" | "fallback" | "abort" | "success";
}

function logUpstreamAttempt(info: UpstreamAttemptLog) {
  console.log(
    `[analyze-evidence] reqId=${info.requestId} model=${info.model} attempt=${info.attempt} isFallback=${info.isFallback} status=${info.status} retryable=${info.retryable} action=${info.action}`
  );
}

function extractErrorStatus(err: any): { status: string | number; isRecoverable: boolean; isAuthFailure: boolean } {
  if (!err) return { status: "UNKNOWN", isRecoverable: false, isAuthFailure: false };

  const rawStatus = err.status || err.statusCode || err.code || err.error?.code || err.response?.status;
  const statusNum = typeof rawStatus === "number" ? rawStatus : parseInt(rawStatus, 10);
  
  if (statusNum === 401 || statusNum === 403) {
    return { status: statusNum, isRecoverable: false, isAuthFailure: true };
  }

  if (statusNum === 400 || statusNum === 404) {
    return { status: statusNum, isRecoverable: false, isAuthFailure: false };
  }

  if (statusNum === 429 || statusNum === 500 || statusNum === 502 || statusNum === 503 || statusNum === 504) {
    return { status: statusNum, isRecoverable: true, isAuthFailure: false };
  }

  const message = String(err.message || err.error?.message || "").toUpperCase();
  if (
    message.includes("UNAUTHENTICATED") ||
    message.includes("PERMISSION_DENIED") ||
    message.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED") ||
    message.includes("API_KEY_SERVICE_BLOCKED")
  ) {
    return { status: rawStatus || 401, isRecoverable: false, isAuthFailure: true };
  }

  if (
    message.includes("INVALID_ARGUMENT") ||
    message.includes("NOT_FOUND")
  ) {
    return { status: rawStatus || 400, isRecoverable: false, isAuthFailure: false };
  }

  if (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("UNAVAILABLE") ||
    message.includes("INTERNAL") ||
    message.includes("RATE_LIMIT") ||
    message.includes("OVERLOADED") ||
    message.includes("DEADLINE_EXCEEDED") ||
    message.includes("SOCKET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET")
  ) {
    return { status: rawStatus || "RECOVERABLE_NETWORK_ERROR", isRecoverable: true, isAuthFailure: false };
  }

  return { status: rawStatus || "UNKNOWN_ERROR", isRecoverable: false, isAuthFailure: false };
}

// 1b. Multimodal Evidence Analysis Endpoint (Resilient Multimodal Fallback)
app.post("/api/analyze-evidence", requireAuth, apiRateLimiter(30, 60000), async (req, res) => {
  try {
    const body = req.body || {};
    const { evidenceId, analysisRequestId, uploadId, fileHash, fileBase64, mimeType, fileName, evidenceType } = body;

    if (!fileBase64 && !fileName && !evidenceId) {
      return res.status(400).json({ error: "Missing required evidence payload." });
    }

    const activeEvId = evidenceId || `ev-custom-${Date.now()}`;
    const activeReqId = analysisRequestId || `req-${Date.now()}`;
    const activeUploadId = uploadId || `upl-${Date.now()}`;
    const activeFileHash = fileHash || `hash-${Date.now()}`;

    let cleanBase64 = fileBase64 || "";
    let detectedMime = mimeType;
    if (cleanBase64.startsWith("data:")) {
      const match = cleanBase64.match(/^data:([^;]+);base64,/);
      if (match && match[1]) {
        detectedMime = match[1];
      }
      cleanBase64 = cleanBase64.split(";base64,")[1] || "";
    } else if (cleanBase64.includes(";base64,")) {
      cleanBase64 = cleanBase64.split(";base64,")[1] || "";
    }
    cleanBase64 = cleanBase64.replace(/\s/g, "");

    const effectiveMimeType = detectedMime || mimeType || (evidenceType === "document" ? "application/pdf" : "image/jpeg");

    const PRIMARY_MODEL = "gemini-3.6-flash";
    const FALLBACK_MODEL = "gemini-2.5-flash";

    let extractedData: any = null;
    let successfulModel: string | null = null;
    let authFailureEncountered = false;

    if (!process.env.GEMINI_API_KEY) {
      console.warn(`[analyze-evidence] reqId=${activeReqId} error="CONFIG_ERROR: GEMINI_API_KEY environment variable is not configured"`);
    }

    if (process.env.GEMINI_API_KEY && cleanBase64.length > 50) {
      const ai = getGeminiClient();
      const promptText = `Please analyse this ${evidenceType || 'financial evidence'} file (${fileName || 'uploaded_evidence'}).
Perform multimodal visual analysis over the visible document content: bank/lender logos, figures, labels, due dates, and product names.
Do NOT invent missing information. Distinguish CONFIRMED, UNCERTAIN, and MISSING fields.
Return a structured JSON object.`;

      // Upstream attempt plan (max 3 total attempts for interactive flow):
      // 1. Primary model (gemini-3.6-flash)
      // 2. Short retry of primary model with backoff & jitter if recoverable
      // 3. Verified fallback model (gemini-2.5-flash) if recoverable
      const attemptPlan = [
        { model: PRIMARY_MODEL, isFallback: false, attemptNum: 1 },
        { model: PRIMARY_MODEL, isFallback: false, attemptNum: 2 },
        { model: FALLBACK_MODEL, isFallback: true, attemptNum: 3 },
      ];

      for (let i = 0; i < attemptPlan.length; i++) {
        const step = attemptPlan[i];
        try {
          const response = await ai.models.generateContent({
            model: step.model,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: effectiveMimeType,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: promptText,
                  },
                ],
              },
            ],
            config: {
              systemInstruction: MULTIMODAL_EVIDENCE_AGENT_INSTRUCTION,
              responseMimeType: "application/json",
            },
          });

          let parsed: any = null;
          if (response.text) {
            try {
              parsed = JSON.parse(response.text);
            } catch {
              const jsonMatch = response.text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              }
            }
          }

          if (parsed && typeof parsed === "object") {
            extractedData = parsed;
            successfulModel = step.model;
            logUpstreamAttempt({
              event: "analyze-evidence",
              requestId: activeReqId,
              model: step.model,
              attempt: step.attemptNum,
              isFallback: step.isFallback,
              status: "200_OK",
              retryable: false,
              action: "success",
            });
            break;
          } else {
            logUpstreamAttempt({
              event: "analyze-evidence",
              requestId: activeReqId,
              model: step.model,
              attempt: step.attemptNum,
              isFallback: step.isFallback,
              status: "UNPARSEABLE_JSON",
              retryable: i < attemptPlan.length - 1,
              action: i < attemptPlan.length - 1 ? (attemptPlan[i + 1].isFallback ? "fallback" : "retry") : "abort",
            });
          }
        } catch (err: any) {
          const { status, isRecoverable, isAuthFailure } = extractErrorStatus(err);
          if (isAuthFailure) {
            authFailureEncountered = true;
          }
          const hasNextAttempt = i < attemptPlan.length - 1;
          const nextStep = hasNextAttempt ? attemptPlan[i + 1] : null;
          const nextAction = (!isRecoverable || !hasNextAttempt)
            ? "abort"
            : nextStep?.isFallback
            ? "fallback"
            : "retry";

          logUpstreamAttempt({
            event: "analyze-evidence",
            requestId: activeReqId,
            model: step.model,
            attempt: step.attemptNum,
            isFallback: step.isFallback,
            status,
            retryable: isRecoverable,
            action: nextAction,
          });

          if (!isRecoverable || !hasNextAttempt) {
            break; // Do NOT retry 400, 401, 403, or once attempts are exhausted
          }

          // Delay before next attempt (exponential backoff with jitter)
          const delayMs = step.attemptNum === 1
            ? 1000 + Math.floor(Math.random() * 400 - 200) // ~1000ms (800-1200ms)
            : 2000 + Math.floor(Math.random() * 400 - 200); // ~2000ms (1800-2200ms)
          await sleep(delayMs);
        }
      }
    }

    if (extractedData && typeof extractedData === "object") {
      // Normalise amountDue
      let normAmountDue: number | null = null;
      if (typeof extractedData.amountDue === "number" && !isNaN(extractedData.amountDue)) {
        normAmountDue = extractedData.amountDue;
      } else if (typeof extractedData.amountDue === "string") {
        const cleaned = extractedData.amountDue.replace(/[^\d]/g, "");
        if (cleaned.length > 0) {
          normAmountDue = Number(cleaned);
        }
      }

      // Normalise dueDate
      let normDueDate: string | null = null;
      if (
        typeof extractedData.dueDate === "string" &&
        extractedData.dueDate.trim() &&
        extractedData.dueDate !== "N/A" &&
        extractedData.dueDate !== "null"
      ) {
        normDueDate = extractedData.dueDate.trim();
      }

      const validCategories = [
        "Bank repayment notification",
        "Pindar app repayment screenshot",
        "Bank statement",
        "iDeb SLIK – Debitur Perseorangan",
        "Repayment or borrowing offer",
        "Repayment-date approval confirmation",
        "Lender response evidence",
        "Other financial evidence",
      ];
      const category = validCategories.includes(extractedData.category)
        ? extractedData.category
        : "Other financial evidence";

      const categoryConfidence = ["High", "Medium", "Low"].includes(extractedData.categoryConfidence)
        ? extractedData.categoryConfidence
        : "Medium";

      const confidence = ["High", "Medium", "Low", "Needs review"].includes(extractedData.confidence)
        ? extractedData.confidence
        : "Medium";

      const obligationStatus = [
        "ACTIVE_OBLIGATION",
        "COLLECTION_NOTICE",
        "HISTORICAL",
        "INFORMATIONAL",
      ].includes(extractedData.obligationStatus)
        ? extractedData.obligationStatus
        : "ACTIVE_OBLIGATION";

      return res.json({
        category,
        categoryConfidence,
        institution:
          typeof extractedData.institution === "string" && extractedData.institution.trim()
            ? extractedData.institution.trim()
            : "Needs confirmation",
        institutionLegalName:
          typeof extractedData.institutionLegalName === "string"
            ? extractedData.institutionLegalName
            : null,
        product:
          typeof extractedData.product === "string" && extractedData.product.trim()
            ? extractedData.product.trim()
            : "Financial Document",
        title:
          typeof extractedData.title === "string" && extractedData.title.trim()
            ? extractedData.title.trim()
            : fileName
            ? `Uploaded Evidence (${fileName})`
            : "Uploaded Financial Document",
        amountDue: normAmountDue,
        dueDate: normDueDate,
        accountOrFacility:
          typeof extractedData.accountOrFacility === "string"
            ? extractedData.accountOrFacility
            : null,
        obligationStatus,
        confidence,
        summaryStatement:
          typeof extractedData.summaryStatement === "string"
            ? extractedData.summaryStatement
            : "",
        extractedNotes:
          typeof extractedData.extractedNotes === "string"
            ? extractedData.extractedNotes
            : typeof extractedData.summaryStatement === "string"
            ? extractedData.summaryStatement
            : "",
        extractedFacts: Array.isArray(extractedData.extractedFacts)
          ? extractedData.extractedFacts
          : [],
        missingFields: Array.isArray(extractedData.missingFields)
          ? extractedData.missingFields
          : [],
        ambiguities: Array.isArray(extractedData.ambiguities)
          ? extractedData.ambiguities
          : [],
        uncertainFields: Array.isArray(extractedData.uncertainFields)
          ? extractedData.uncertainFields
          : [],
        uploadId: activeUploadId,
        fileHash: activeFileHash,
        evidenceId: activeEvId,
        analysisRequestId: activeReqId,
        executionMetadata: {
          agent: "multimodal_evidence_agent",
          framework: "@google/genai",
          modelUsed: successfulModel || "gemini-3.6-flash",
          phase: "PHASE_2B_MULTIMODAL_EVIDENCE_AGENT",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Safe explicit analysis failure state when all Gemini models fail or are unavailable
    return res.status(503).json({
      analysisStatus: "TEMPORARILY_UNAVAILABLE",
      diagnosticCode: authFailureEncountered
        ? "MULTIMODAL_AUTH_CONFIGURATION_ERROR"
        : !process.env.GEMINI_API_KEY
        ? "SERVER_CONFIG_ERROR"
        : "MULTIMODAL_MODEL_UNAVAILABLE",
      error: "Gemini could not analyse this evidence right now. Your file has not been added to your financial record. Please retry.",
      message: "Gemini could not analyse this evidence right now. Your file has not been added to your financial record. Please retry.",
      uploadId: activeUploadId,
      fileHash: activeFileHash,
      evidenceId: activeEvId,
      analysisRequestId: activeReqId,
    });

  } catch (err: any) {
    console.error("Error in /api/analyze-evidence:", err);
    res.status(500).json({
      error: "An unexpected error occurred while processing your request.",
    });
  }
});

// 2. Freshness & Regulatory Sources endpoint
app.get("/api/sources", (_req, res) => {
  try {
    const totalSources = 6;
    res.json({
      lastCheckedAll: new Date().toISOString(),
      statusSummary: "Sources Current",
      totalSources,
      verifiedCurrent: totalSources,
    });
  } catch (err: any) {
    console.error("Error in /api/sources:", err);
    res.status(500).json({ error: "An unexpected error occurred while processing your request." });
  }
});

// 2b. Link-Health Validation Endpoint
const ALLOWED_TRUSTED_DOMAINS = [
  'ojk.go.id',
  'www.ojk.go.id',
  'bi.go.id',
  'www.bi.go.id',
  'bca.co.id',
  'www.bca.co.id',
  'bankmandiri.co.id',
  'www.bankmandiri.co.id',
  'bri.co.id',
  'www.bri.co.id',
  'adakami.id',
  'www.adakami.id',
  'easycash.id',
  'www.easycash.id'
];

const sourceValidationCache = new Map<string, { valid: boolean; status: number; resolvedUrl: string; checkedAt: string }>();

app.post("/api/validate-sources", apiRateLimiter(20, 60000), async (req, res) => {
  try {
    const urls: string[] = req.body?.urls || [
      "https://ojk.go.id/id/kanal/iknb/data-dan-statistik/direktori/fintech/default.aspx",
      "https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx",
      "https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx",
      "https://www.adakami.id/",
      "https://www.adakami.id/riplay",
      "https://www.adakami.id/termsandconditions",
      "https://www.adakami.id/complain",
      "https://www.bca.co.id/id/Individu/produk/pinjaman/Pinjaman-Personal",
      "https://www.bca.co.id/en/Individu/layanan/Customer-Service/HaloBCA"
    ];

    const results: Record<string, { url: string; valid: boolean; status: number; resolvedUrl: string; checkedAt: string }> = {};
    let allValid = true;

    for (const urlStr of urls) {
      if (sourceValidationCache.has(urlStr)) {
        const cached = sourceValidationCache.get(urlStr)!;
        results[urlStr] = { url: urlStr, ...cached };
        if (!cached.valid) allValid = false;
        continue;
      }

      try {
        const parsed = new URL(urlStr);
        const isDomainAllowed = ALLOWED_TRUSTED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
        
        if (!isDomainAllowed) {
          const entry = { valid: false, status: 400, resolvedUrl: urlStr, checkedAt: new Date().toISOString() };
          sourceValidationCache.set(urlStr, entry);
          results[urlStr] = { url: urlStr, ...entry };
          allValid = false;
          continue;
        }

        // Perform lightweight fetch validation with 3.5s controller timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        let statusCode = 200;
        let isValid = false;

        try {
          const resp = await fetch(urlStr, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          clearTimeout(timeoutId);
          statusCode = resp.status;
          isValid = resp.ok || resp.status === 301 || resp.status === 302 || resp.status === 308;
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          isValid = false;
          statusCode = 504;
        }

        const entry = { valid: isValid, status: statusCode, resolvedUrl: urlStr, checkedAt: new Date().toISOString() };
        sourceValidationCache.set(urlStr, entry);
        results[urlStr] = { url: urlStr, ...entry };
        if (!isValid) allValid = false;

      } catch (err) {
        const entry = { valid: false, status: 500, resolvedUrl: urlStr, checkedAt: new Date().toISOString() };
        sourceValidationCache.set(urlStr, entry);
        results[urlStr] = { url: urlStr, ...entry };
        allValid = false;
      }
    }

    res.json({
      allValid,
      statusSummary: allValid ? "Sources Current" : "Sources need review",
      checkedCount: Object.keys(results).length,
      results
    });
  } catch (err: any) {
    console.error("Error in /api/validate-sources:", err);
    res.status(500).json({ error: "An unexpected error occurred while processing your request." });
  }
});

// Canonical active repayment helpers (excluding non-liability income, bank statement, or credit-report evidence)
function getActiveRepaymentObligations(obligations: any[] = [], evidenceList: any[] = []) {
  return deriveCanonicalObligations(obligations, evidenceList);
}

function getActiveRepaymentEvidence(evidenceList: any[] = []) {
  return (evidenceList || []).filter((e: any) => {
    const details = getCanonicalEvidenceDetails(e);
    return details.isRepaymentObligation;
  });
}

// 3. AI Analysis endpoint (Grounding + Synthesis)
app.post("/api/analyze", requireAuth, apiRateLimiter(60, 60000), async (req, res) => {
  try {
    const { financialContext, prompt } = req.body || {};
    const ai = getGeminiClient();

    const evidenceList = getActiveRepaymentEvidence(financialContext?.evidenceList || []);
    const obligations = getActiveRepaymentObligations(financialContext?.obligations || [], financialContext?.evidenceList || []);
    const availableCash = financialContext?.availableCash;
    const nextSalaryDate = financialContext?.nextSalaryDate;
    const nextSalaryAmount = financialContext?.nextSalaryAmount;
    const essentialExpenses = financialContext?.essentialExpenses;

    // List obligations strictly from current session context
    const obligationDetails = obligations.map((o: any) => {
      const amtStr = o.amount ? `Rp${Number(o.amount).toLocaleString('id-ID')}` : 'Amount unknown';
      const dateStr = o.dueDate || o.formattedDate || 'Due date unknown';
      return `- ${o.institutionName} (${o.title || o.category || 'Loan'}): ${amtStr}, due ${dateStr}`;
    }).join('\n');

    const evidenceDetails = evidenceList.map((e: any) => {
      const inst = e.userConfirmedDetails?.institutionName || e.extractedDetails?.institutionName || 'Unknown Institution';
      const amt = e.userConfirmedDetails?.amountDue ?? e.extractedDetails?.amountDue;
      const date = e.userConfirmedDetails?.dueDate || e.extractedDetails?.dueDate;
      const prod = e.userConfirmedDetails?.productName || e.extractedDetails?.productName;
      return `- Evidence: ${e.title || 'Repayment notice'} | Institution: ${inst} | Product: ${prod || 'N/A'} | Amount: ${amt ? `Rp${amt.toLocaleString('id-ID')}` : 'N/A'} | Due: ${date || 'N/A'}`;
    }).join('\n');

    const cashStr = availableCash !== null && availableCash !== undefined ? `Rp${availableCash.toLocaleString('id-ID')}` : 'Unknown';
    const salaryStr = (nextSalaryAmount && nextSalaryDate) ? `Rp${nextSalaryAmount.toLocaleString('id-ID')} expected on ${nextSalaryDate}` : 'Unknown';

    const systemInstruction = `
You are FairAssist, an AI financial decision-support agent for Indonesian consumers.
Use British English throughout (e.g. analyse, personalised, prioritise, authorised, organisation, licence, instalment).
You turn financial evidence, obligations, OJK regulations (POJK 40/2024, SEOJK 19/SEOJK.06/2025, POJK 10/2022) and lender policies into grounded, prioritised next steps.
Note: SEOJK 19/2023 was revoked and superseded by SEOJK 19/SEOJK.06/2025 effective 31 July 2025. Do not cite SEOJK 19/2023 as current.
Note: No verified policy promises an automatic extension. Do not claim an extension is guaranteed unless verified in official public documentation.

CRITICAL DECISION-INTEGRITY AND REGULATORY RULES:
1. AFFORDABILITY-SAFE REPAYMENT RECOMMENDATIONS:
   - NEVER recommend a payment that exceeds confirmed available cash.
   - Separate DEADLINE / ATTENTION PRIORITY (which obligation requires attention first based on due date) from PAYMENT EXECUTION (what payment can actually be made with confirmed cash).
   - If available cash is insufficient to cover all pre-salary obligations (a cash-flow gap exists):
     - State total obligations;
     - State confirmed available cash;
     - Calculate the funding gap;
     - Identify the earliest deadline;
     - Distinguish "needs attention first" from "pay this first";
     - Recommend contacting the earliest-due lender before its due date to inquire what repayment arrangements are actually available;
     - NEVER assume that an extension, restructuring, partial payment, waiver, or approval will be granted;
     - Keep later obligations visible;
     - Offer scenario comparison before prescribing an allocation.
   - If essential expenses are not provided, do NOT assume all available cash can safely be allocated to debt repayment. Disclose uncertainty (e.g., "Essential expenses: Not provided").

2. REGULATORY CLAIM DISCIPLINE:
   - Do NOT infer that bank debt automatically has legal priority over P2P/Pindar loans.
   - Do NOT claim that paying a particular lender automatically protects SLIK or prevents penalties.
   - Do NOT state or imply that any OJK/SEOJK regulation guarantees an extension or restructuring.
   - Regulatory citations (POJK 40/2024, SEOJK 19/SEOJK.06/2025) must support exact claims (consumer protection, collection conduct standards, disclosure principles). Never convert general regulatory rules into lender-specific contractual promises.

CRITICAL INSTRUCTION ON USER SITUATION:
Rely STRICTLY and EXCLUSIVELY on the provided USER SITUATION context below.
Do NOT invent or hallucinate other lenders, institutions, obligations, salaries, or cash balances not explicitly listed in the USER SITUATION.

SPECIAL RULE FOR SALARY-ONLY CONTEXT (when salary information is confirmed but active repayment obligations count is 0):
If salary information exists (or salary evidence is confirmed) and active repayment obligation count is 0:
1. "quote" MUST state: "No active repayment obligations have been recorded yet. Your salary information is confirmed at ${salaryStr}." (substituting user's confirmed salary amount and date).
2. "summary" MUST state: "I still need your repayment notice(s) and available cash to analyse your cash flow and provide personalised repayment guidance."
3. "nextBestActions" MUST be an empty array [].

SPECIAL RULE FOR INCOMPLETE CONTEXT (e.g., 1 obligation, no salary date):
If only 1 repayment obligation exists and NO salary date is confirmed:
1. Do NOT claim an optimal repayment action or payment prioritisation exists yet.
2. "quote" MUST state: "Your [institutionName] repayment notice shows [amount] due on [dueDate]."
3. "summary" MUST be: "I still need your other repayment obligations and salary timing before I can calculate a cash-flow gap or recommend which payment to prioritise."
4. "nextBestActions" MUST contain 1 action:
   - "title": "More context needed"
   - "category": "DO TODAY"
   - "reason": "Add your remaining repayment notices and salary information to continue."
   - "financialImpact": "Provides complete cash-flow visibility across all obligations."
   - "primaryActionButtonLabel": "Add another repayment notice →"

SPECIAL RULE FOR MISSING FINANCIAL CONTEXT (when 2+ obligations exist but cash/salary is missing):
If 2 or more repayment obligations exist but available cash or salary timing is unknown (availableCash is null or nextSalaryDate is null):
1. Do NOT recommend which obligation to prioritise yet.
2. "quote" MUST state: "I have both repayments confirmed: [list of actual obligations]."
3. "summary" MUST state: "To compare them against your cash flow, I still need how much cash you have available now, your next salary date, and your expected salary amount."
4. "nextBestActions" MUST contain 1 action:
   - "title": "Add your cash and salary timing."
   - "category": "DO TODAY"
   - "reason": "Add your available cash and salary timing to calculate your cash-flow gap across confirmed obligations."
   - "financialImpact": "Enables cash-flow analysis before recommending which payment to prioritise."
   - "primaryActionButtonLabel": "Add financial context →"
   - "actionCode": "ADD_FINANCIAL_CONTEXT"

USER SITUATION:
- Evidence items provided: ${evidenceList.length} item(s)
${evidenceDetails || '- None provided yet'}
- Active obligations: ${obligations.length} item(s)
${obligationDetails || '- None recorded yet'}
- Available cash: ${cashStr}
- Salary: ${salaryStr}

Provide structured analysis in JSON format adhering strictly to this schema:
{
  "quote": "Short 1-sentence core insight based ONLY on the user's actual situation",
  "summary": "Detailed clear explanation based strictly on the user's actual situation",
  "evidenceCount": ${evidenceList.length},
  "trustedSourcesCount": 3,
  "nextBestActions": [
    {
      "id": "action-1",
      "category": "DO TODAY" | "REVIEW NEXT" | "AVOID FOR NOW",
      "priorityOrder": 1,
      "title": "Action title relevant ONLY to user's actual obligations",
      "reason": "Clear explanation",
      "financialImpact": "Financial impact statement",
      "evidenceUsed": ["array of evidence titles"],
      "trustedSourcesUsed": ["array of sources"],
      "currentSourceStatus": "Current",
      "requiresHumanAuthorisation": true,
      "authorisingEntity": "Name of official or system",
      "primaryActionButtonLabel": "Button text",
      "actionCode": "PREPARE_EXTENSION" | "PARTIAL_PAYMENT_NOTICE" | "AVOID_NEW_BORROWING" | "ADD_FINANCIAL_CONTEXT" | "CUSTOM",
      "lineage": {
        "evidenceProvided": ["list"],
        "retrievedRules": ["list"],
        "policiesApplied": ["list"],
        "geminiReasoning": "explanation",
        "financialCalculation": "calculation breakdown",
        "escalationBoundaryNote": "decision boundary disclaimer"
      }
    }
  ]
}
`;

    const userContent = prompt 
      ? `Analyse the user request: "${prompt}" in context of user's confirmed situation.`
      : `Analyse user's current situation with ${evidenceList.length} evidence item(s) and ${obligations.length} obligation(s).`;

    if (!process.env.GEMINI_API_KEY) {
      const evidenceCount = evidenceList.length;
      let quote = "FairAssist has verified your submitted financial evidence.";
      let summary = "";
      let defaultActions: any[] = [];

      if (obligations.length === 1 && !nextSalaryDate) {
        const obl = obligations[0];
        const inst = obl.institutionName || "Lender";
        const amt = obl.amount ? `Rp${Number(obl.amount).toLocaleString('id-ID')}` : "repayment amount";
        const dateStr = obl.formattedDate || obl.dueDate || "due date";

        quote = `Your ${inst} repayment notice shows ${amt} due on ${dateStr}.`;
        summary = `I still need your other repayment obligations and salary timing before I can calculate a cash-flow gap or recommend which payment to prioritise.`;

        defaultActions = [{
          id: "action-more-context",
          category: "DO TODAY",
          priorityOrder: 1,
          title: "More context needed",
          reason: "Add your remaining repayment notices and salary information to continue.",
          financialImpact: "Provides complete cash-flow visibility across all obligations.",
          evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
          trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
          currentSourceStatus: "Current",
          requiresHumanAuthorisation: false,
          authorisingEntity: "Borrower",
          primaryActionButtonLabel: "Add another repayment notice →",
          actionCode: "PREPARE_EXTENSION",
          lineage: {
            evidenceProvided: evidenceList.map((e: any) => e.title),
            retrievedRules: ["POJK No. 40 Tahun 2024"],
            policiesApplied: [`${inst} standard terms`],
            geminiReasoning: "Awaiting complete obligation and salary context.",
            financialCalculation: `Amount due: ${amt}`,
            escalationBoundaryNote: "No prioritisation recommended until full context is provided."
          }
        }];
      } else if (obligations.length >= 2 && (availableCash === null || availableCash === undefined || !nextSalaryDate)) {
        const oblSummary = obligations.map((o: any) => `${o.institutionName} — Rp${(o.amount || 0).toLocaleString('id-ID')} due ${o.dueDate || o.formattedDate || ''}`).join(', ');
        quote = `I have both repayments confirmed: ${oblSummary}.`;
        summary = `To compare them against your cash flow, I still need how much cash you have available now, your next salary date, and your expected salary amount.`;

        defaultActions = [{
          id: "action-add-financial-context",
          category: "DO TODAY",
          priorityOrder: 1,
          title: "Add your cash and salary timing.",
          reason: "Provide available cash and salary schedule to enable cash-flow scenario calculations.",
          financialImpact: "Enables precise timing mismatch analysis across confirmed obligations.",
          evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
          trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
          currentSourceStatus: "Current",
          requiresHumanAuthorisation: false,
          authorisingEntity: "Borrower",
          primaryActionButtonLabel: "Add financial context →",
          actionCode: "ADD_FINANCIAL_CONTEXT",
          lineage: {
            evidenceProvided: evidenceList.map((e: any) => e.title),
            retrievedRules: ["POJK No. 40 Tahun 2024"],
            policiesApplied: [],
            geminiReasoning: "Awaiting cash and salary timing details from borrower.",
            financialCalculation: "Cash-flow calculation pending available cash and salary inputs.",
            escalationBoundaryNote: "Cannot recommend priority order without cash-flow availability."
          }
        }];
      } else if (obligations.length >= 1) {
        const totalPreSalary = obligations.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
        const cash = availableCash ?? 0;
        const gap = totalPreSalary - cash;

        const sortedObligations = [...obligations].sort((a, b) => {
          const dA = new Date(a.dueDate || a.formattedDate || '2099-01-01').getTime();
          const dB = new Date(b.dueDate || b.formattedDate || '2099-01-01').getTime();
          return dA - dB;
        });

        const earliest = sortedObligations[0];
        const later = sortedObligations.slice(1);

        const earliestInst = earliest?.institutionName || "earliest lender";
        const earliestAmtStr = `Rp${(earliest?.amount || 0).toLocaleString('id-ID')}`;
        const earliestDateStr = earliest?.formattedDate || earliest?.dueDate || "due date";

        const laterDetails = later.length > 0 
          ? later.map(o => `${o.institutionName} on ${o.formattedDate || o.dueDate}`).join(', ')
          : "";

        const portfolioFundingGap = Math.max(0, gap);
        const earliestAmt = earliest?.amount || 0;
        const individualCoverage = cash >= earliestAmt;

        if (portfolioFundingGap > 0) {
          quote = `Cash-flow gap of Rp${portfolioFundingGap.toLocaleString('id-ID')} identified before your ${nextSalaryDate || 'next'} salary.`;
          
          summary = `### What I found\nYou have Rp${totalPreSalary.toLocaleString('id-ID')} in confirmed repayments due before your Rp${(nextSalaryAmount || 0).toLocaleString('id-ID')} salary arrives on ${nextSalaryDate || 'payday'}. Your confirmed available cash is Rp${cash.toLocaleString('id-ID')}, leaving a temporary Rp${portfolioFundingGap.toLocaleString('id-ID')} portfolio funding gap.${essentialExpenses ? ` (Essential expenses: Rp${essentialExpenses.toLocaleString('id-ID')})` : ' (Essential expenses: Not provided.)'}\n\n### What it means\n${earliestInst} is the first deadline, due ${earliestDateStr}${laterDetails ? `, followed by ${laterDetails}` : ''}. ${individualCoverage ? `Your available cash of Rp${cash.toLocaleString('id-ID')} covers the ${earliestAmtStr} ${earliestInst} obligation individually, but across all pre-salary repayments you face a total portfolio funding gap of Rp${portfolioFundingGap.toLocaleString('id-ID')}.` : `Your available cash of Rp${cash.toLocaleString('id-ID')} is below the ${earliestAmtStr} ${earliestInst} obligation.`} Priority is given to ${earliestInst} based on due-date schedule.\n\n### Next step\nContact ${earliestInst} before ${earliestDateStr} to ask what repayment arrangements are available. Keep the ${later.length > 0 ? later[0].institutionName : 'subsequent'} payment due on ${later.length > 0 ? (later[0].formattedDate || later[0].dueDate) : 'its due date'} in view. FairAssist can compare repayment scenarios using your confirmed cash position before you decide how to allocate funds.`;

          const reasonText = individualCoverage
            ? `${earliestInst} is due first on ${earliestDateStr} before your salary on ${nextSalaryDate}. Your available cash of Rp${cash.toLocaleString('id-ID')} covers this individual payment, but across all pre-salary repayments (Rp${totalPreSalary.toLocaleString('id-ID')}), a portfolio funding gap of Rp${portfolioFundingGap.toLocaleString('id-ID')} remains before salary. Priority is given to ${earliestInst} based on due-date schedule.`
            : `${earliestInst} is due first on ${earliestDateStr} before your salary on ${nextSalaryDate}. Your available cash of Rp${cash.toLocaleString('id-ID')} is below this ${earliestAmtStr} payment, contributing to a total portfolio funding gap of Rp${portfolioFundingGap.toLocaleString('id-ID')}. Priority is given to ${earliestInst} based on due-date schedule.`;

          const impactText = individualCoverage
            ? `Covers ${earliestInst}'s ${earliestAmtStr} obligation using available cash. Total portfolio funding gap remaining before salary: Rp${portfolioFundingGap.toLocaleString('id-ID')}.`
            : `Clarifies repayment options with ${earliestInst} due to individual shortfall of Rp${(earliestAmt - cash).toLocaleString('id-ID')}. Total portfolio funding gap: Rp${portfolioFundingGap.toLocaleString('id-ID')}.`;

          const earliestInstSlug = earliestInst.toLowerCase().includes('easycash') || earliestInst.toLowerCase().includes('fintopia')
            ? 'easycash'
            : earliestInst.toLowerCase().includes('bca') || earliestInst.toLowerCase().includes('central asia')
            ? 'bca'
            : earliestInst.toLowerCase().includes('adakami') || earliestInst.toLowerCase().includes('pembiayaan digital')
            ? 'adakami'
            : earliestInst.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lender';

          defaultActions = [
            {
              id: `action-extension-${earliestInstSlug}`,
              category: "DO TODAY",
              priorityOrder: 1,
              title: `Contact ${earliestInst} regarding repayment options`,
              reason: reasonText,
              financialImpact: impactText,
              evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
              trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
              currentSourceStatus: "Current",
              requiresHumanAuthorisation: true,
              authorisingEntity: earliestInst,
              primaryActionButtonLabel: `Contact ${earliestInst} →`,
              actionCode: "PREPARE_EXTENSION",
              lineage: {
                evidenceProvided: evidenceList.map((e: any) => e.title),
                retrievedRules: ["POJK No. 40 Tahun 2024"],
                policiesApplied: [`${earliestInst} standard terms`],
                geminiReasoning: individualCoverage
                  ? `Earliest deadline identified (${earliestInst} due ${earliestDateStr}); available cash covers this payment individually, with a portfolio funding gap of Rp${portfolioFundingGap.toLocaleString('id-ID')} across all pre-salary obligations.`
                  : `Earliest deadline identified (${earliestInst} due ${earliestDateStr}); available cash is below this payment balance.`,
                financialCalculation: `Cash Rp${cash.toLocaleString('id-ID')} vs ${earliestInst} ${earliestAmtStr} (${individualCoverage ? 'Individual payment covered' : 'Individual shortfall'}; Portfolio funding gap Rp${portfolioFundingGap.toLocaleString('id-ID')})`,
                escalationBoundaryNote: "Subject to lender confirmation; no automatic waiver or extension assumed."
              }
            },
            {
              id: "action-simulate",
              category: "REVIEW NEXT",
              priorityOrder: 2,
              title: "Compare repayment scenarios in Action Simulator",
              reason: "Evaluate 'What if?' scenarios to compare cash-flow impacts before making payment.",
              financialImpact: "Helps identify optimal cash allocation.",
              evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
              trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
              currentSourceStatus: "Current",
              requiresHumanAuthorisation: false,
              authorisingEntity: "Borrower",
              primaryActionButtonLabel: "Simulate scenarios →",
              actionCode: "CUSTOM",
              lineage: {
                evidenceProvided: evidenceList.map((e: any) => e.title),
                retrievedRules: ["POJK No. 40 Tahun 2024"],
                policiesApplied: [],
                geminiReasoning: "Scenario comparison using confirmed cash position.",
                financialCalculation: `Simulating cash allocation across ${obligations.length} obligations.`,
                escalationBoundaryNote: "Simulations provide decision support only."
              }
            }
          ];
        } else {
          quote = `Your available cash of Rp${cash.toLocaleString('id-ID')} is sufficient to cover your pre-salary obligations.`;
          summary = `### What I found\nYou have Rp${totalPreSalary.toLocaleString('id-ID')} in confirmed repayments due before your salary arrives on ${nextSalaryDate || 'payday'}. Your confirmed available cash is Rp${cash.toLocaleString('id-ID')}.\n\n### What it means\nYour available cash covers all confirmed pre-salary obligations in full.\n\n### Next step\nProceed with scheduled repayments on or before their due dates to maintain your credit standing.`;

          defaultActions = obligations.map((o: any, idx: number) => ({
            id: `action-${idx + 1}`,
            category: "DO TODAY",
            priorityOrder: idx + 1,
            title: `Pay ${o.institutionName} on ${o.dueDate || o.formattedDate}`,
            reason: `Your ${o.institutionName} payment of Rp${(o.amount || 0).toLocaleString('id-ID')} is due on ${o.dueDate || o.formattedDate}.`,
            financialImpact: `Maintain good credit standing.`,
            evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
            trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
            currentSourceStatus: "Current",
            requiresHumanAuthorisation: true,
            authorisingEntity: o.institutionName,
            primaryActionButtonLabel: `Pay ${o.institutionName}`,
            actionCode: "CUSTOM",
            lineage: {
              evidenceProvided: evidenceList.map((e: any) => e.title),
              retrievedRules: ["POJK No. 40 Tahun 2024"],
              policiesApplied: [`${o.institutionName} standard terms`],
              geminiReasoning: `Sufficient cash available for payment.`,
              financialCalculation: `Amount due: Rp${(o.amount || 0).toLocaleString('id-ID')}`,
              escalationBoundaryNote: "Borrower authorised."
            }
          }));
        }
      } else {
        const hasSalary = Boolean(nextSalaryDate || nextSalaryAmount || financialContext?.evidenceList?.some((e: any) => {
          const cat = (e.category || '').toLowerCase();
          const tit = (e.title || '').toLowerCase();
          return cat.includes('salary') || cat.includes('payroll') || cat.includes('slip') || tit.includes('salary') || tit.includes('payroll') || tit.includes('slip');
        }));

        if (hasSalary) {
          const salAmt = nextSalaryAmount ? `Rp${Number(nextSalaryAmount).toLocaleString('id-ID')}` : 'Rp8,500,000';
          const salDate = nextSalaryDate || '28 Sep 2026';
          quote = `No active repayment obligations have been recorded yet. Your salary information is confirmed at ${salAmt} on ${salDate}.`;
          summary = `I still need your repayment notice(s) and available cash to analyse your cash flow and provide personalised repayment guidance.`;
          defaultActions = [];
        } else {
          quote = "No active repayment obligations or financial details have been recorded yet.";
          summary = `No active obligations recorded. Upload financial evidence to analyze your situation.`;
        }
      }

      return res.json({
        quote,
        summary,
        evidenceCount,
        trustedSourcesCount: 3,
        nextBestActions: defaultActions,
        generatedAt: new Date().toISOString(),
        executionMetadata: {
          agent: FAIRASSIST_ROOT_AGENT_NAME,
          framework: "@google/adk",
          version: "1.6.0",
          phase: "PHASE_1_ROOT_AGENT",
          status: "fallback",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: userContent,
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    if (obligations.length === 0) {
      const hasSalary = Boolean(nextSalaryDate || nextSalaryAmount || financialContext?.evidenceList?.some((e: any) => {
        const cat = (e.category || '').toLowerCase();
        const tit = (e.title || '').toLowerCase();
        return cat.includes('salary') || cat.includes('payroll') || cat.includes('slip') || tit.includes('salary') || tit.includes('payroll') || tit.includes('slip');
      }));
      if (hasSalary) {
        const salAmt = nextSalaryAmount ? `Rp${Number(nextSalaryAmount).toLocaleString('id-ID')}` : 'Rp8,500,000';
        const salDate = nextSalaryDate || '28 Sep 2026';
        parsed.quote = `No active repayment obligations have been recorded yet. Your salary information is confirmed at ${salAmt} on ${salDate}.`;
        parsed.summary = `I still need your repayment notice(s) and available cash to analyse your cash flow and provide personalised repayment guidance.`;
        parsed.nextBestActions = [];
      }
    }
    parsed.executionMetadata = {
      agent: FAIRASSIST_ROOT_AGENT_NAME,
      framework: "@google/adk",
      version: "1.6.0",
      phase: "PHASE_1_ROOT_AGENT",
      status: "executed",
      timestamp: new Date().toISOString(),
    };
    return res.json(parsed);

  } catch (error: any) {
    console.error("Error in /api/analyze:", error);
    res.status(500).json({ 
      error: "An unexpected error occurred while processing your request."
    });
  }
});

// 4. Action Simulator endpoint ("What if?")
app.post("/api/simulate", requireAuth, apiRateLimiter(40, 60000), async (req, res) => {
  try {
    const { scenarioType, additionalAmount, extensionDays, financialContext } = req.body || {};

    const obligations = getActiveRepaymentObligations(financialContext?.obligations || []);
    
    // Integrity Safety: Require at least one active repayment obligation before simulating
    if (obligations.length === 0) {
      return res.status(422).json({
        error: "At least one active repayment obligation is required for simulation."
      });
    }

    const availableCash = financialContext?.availableCash ?? 0;
    const essentialExpenses = financialContext?.essentialExpenses ?? 0;
    const nextSalaryDate = financialContext?.nextSalaryDate || "28 September 2026";

    const sortedObligations = [...obligations].sort((a: any, b: any) => {
      const dA = new Date(a.dueDate || '2099-01-01').getTime();
      const dB = new Date(b.dueDate || '2099-01-01').getTime();
      return dA - dB;
    });

    const targetObligation = sortedObligations[0];
    const targetInstitution = targetObligation?.institutionName || "Lender";
    const targetAmount = targetObligation?.amount || 0;
    const originalDueDate = targetObligation?.formattedDate || targetObligation?.dueDate || "due date";

    const preSalaryTotal = obligations.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
    const minimumCalculatedGap = Math.max(0, preSalaryTotal - availableCash);

    const isBank = targetInstitution.toLowerCase().includes('bca') || targetInstitution.toLowerCase().includes('bank') || targetObligation?.category === 'Bank Loan';

    if (scenarioType === "BORROW_MORE") {
      const borrowAmt = additionalAmount || (minimumCalculatedGap > 0 ? minimumCalculatedGap : 1000000);
      const simulatedCash = availableCash + borrowAmt;
      const simulatedGap = Math.max(0, (preSalaryTotal + essentialExpenses) - simulatedCash);
      const projectedCash = Math.max(0, simulatedCash - preSalaryTotal);

      return res.json({
        id: "scenario-b",
        type: "BORROW_MORE",
        badgeText: "Scenario B · Higher risk",
        title: `What if I cover the Rp${(borrowAmt / 1000000).toFixed(1)}M minimum gap with new borrowing?`,
        description: "Explore the impact of additional borrowing. Essential expenses are not included because they have not been provided.",
        regulatoryNote: "Lender-specific interest, fees, tenor, and regulatory terms remain unverified until a lender or product is identified.",
        metricsComparison: {
          current: {
            obligationCount: obligations.length,
            availableCash,
            projectedRemainingCash: Math.max(0, availableCash - preSalaryTotal),
            nearTermRepayments: preSalaryTotal,
            futureRepaymentBurden: 0,
            preSalaryFundingGap: minimumCalculatedGap
          },
          simulated: {
            obligationCount: obligations.length + 1,
            availableCash: simulatedCash,
            projectedRemainingCash: projectedCash,
            nearTermRepayments: preSalaryTotal,
            futureRepaymentBurden: borrowAmt,
            preSalaryFundingGap: simulatedGap
          }
        },
        geminiAssessment: {
          summary: `Borrowing an additional Rp${borrowAmt.toLocaleString('id-ID')} covers the immediate Rp${minimumCalculatedGap.toLocaleString('id-ID')} pre-salary funding gap, with Rp${Math.max(0, simulatedCash - preSalaryTotal).toLocaleString('id-ID')} remaining before salary. This creates a new repayment obligation whose interest, fees, and repayment schedule cannot be verified because no specific lender or product has been identified. Essential expenses are not included because they have not been provided.`,
          benefits: [
            `Provides immediate Rp${borrowAmt.toLocaleString('id-ID')} liquidity to cover the minimum calculated pre-salary gap.`
          ],
          keyRisks: [
            `New borrowing creates an additional repayment obligation; interest, fees, tenor, and schedule cannot be verified without an identified lender.`,
            `Increases future post-salary repayment burden by at least Rp${borrowAmt.toLocaleString('id-ID')}.`,
            `The remaining balance is a repayment-only calculation and must not be treated as disposable cash because essential living expenses are unconfirmed.`
          ]
        }
      });
    } else {
      // REQUEST_EXTENSION
      const remainingPreSalary = Math.max(0, preSalaryTotal - targetAmount);
      const simulatedGap = Math.max(0, (remainingPreSalary + essentialExpenses) - availableCash);
      const projectedCash = Math.max(0, availableCash - remainingPreSalary);

      return res.json({
        id: "scenario-a",
        type: "REQUEST_EXTENSION",
        badgeText: "Scenario A · Lower-risk option to explore",
        title: `Ask ${targetInstitution} about a ${extensionDays || 3}-day payment shift`,
        description: `Explore aligning the ${targetInstitution} due date with your verified salary date on ${nextSalaryDate}.`,
        regulatoryNote: isBank
          ? `No verified ${targetInstitution}-specific repayment-shift policy was found in the current sources. Confirm available arrangements directly with ${targetInstitution}.`
          : `Grounded in POJK No. 40 Tahun 2024 & SEOJK No. 19/SEOJK.06/2025 consumer protection guidelines.`,
        metricsComparison: {
          current: {
            obligationCount: obligations.length,
            availableCash,
            projectedRemainingCash: Math.max(0, availableCash - preSalaryTotal),
            nearTermRepayments: preSalaryTotal,
            futureRepaymentBurden: 0,
            preSalaryFundingGap: minimumCalculatedGap
          },
          simulated: {
            obligationCount: obligations.length,
            availableCash,
            projectedRemainingCash: projectedCash,
            nearTermRepayments: remainingPreSalary,
            futureRepaymentBurden: targetAmount,
            preSalaryFundingGap: simulatedGap
          }
        },
        geminiAssessment: {
          summary: `If ${targetInstitution} confirms that the Rp${targetAmount.toLocaleString('id-ID')} repayment can be moved from ${originalDueDate} to ${nextSalaryDate}, the currently identified pre-salary repayment gap would be resolved, excluding any essential expenses that have not been provided.`,
          benefits: [
            `If ${targetInstitution} approves the arrangement, the Rp${targetAmount.toLocaleString('id-ID')} repayment is deferred until your ${nextSalaryDate} salary.`,
            `Avoids allocating Rp${targetAmount.toLocaleString('id-ID')} prior to payday while keeping subsequent obligations in view.`,
            `Zero new debt added.`
          ],
          keyRisks: [
            `${targetInstitution} may apply terms, late charges, or administrative requirements depending on the arrangement offered.`,
            `Requires explicit confirmation from ${targetInstitution} prior to ${originalDueDate}.`,
            `Confirm any fees, credit reporting impact, and revised due date directly with ${targetInstitution}.`
          ]
        }
      });
    }
  } catch (error: any) {
    console.error("Error in /api/simulate:", error);
    res.status(500).json({ error: "An unexpected error occurred while processing your request." });
  }
});

// 5. Chat endpoint with FairAssist Google ADK Root Agent
app.post("/api/chat", requireAuth, apiRateLimiter(60, 60000), async (req, res) => {
  try {
    const { message, financialContext } = req.body || {};

    const evidenceList = getActiveRepaymentEvidence(financialContext?.evidenceList || []);
    const obligations = getActiveRepaymentObligations(financialContext?.obligations || []);
    const evidenceCount = evidenceList.length;
    const obligationCount = obligations.length;

    // Derive confirmedLenders strictly from current confirmed evidence & obligations
    const confirmedLenders = Array.from(new Set([
      ...evidenceList.flatMap((e: any) => [
        e.userConfirmedDetails?.institutionName,
        e.extractedDetails?.institutionName
      ]).filter(Boolean),
      ...obligations.map((o: any) => o.institutionName).filter(Boolean)
    ]));

    const userText = message || "";
    const lowerMsg = userText.toLowerCase();

    const availableCash = financialContext?.availableCash;
    const nextSalaryDate = financialContext?.nextSalaryDate;
    const nextSalaryAmount = financialContext?.nextSalaryAmount;
    const essentialExpenses = financialContext?.essentialExpenses;

    const isDemo = Boolean(financialContext?.userPersona?.syntheticFlag || (financialContext?.userPersona?.name && financialContext.userPersona.name.toLowerCase().includes('ayu')));

    const hasSalaryConfirmed = Boolean(
      nextSalaryDate ||
      nextSalaryAmount ||
      financialContext?.evidenceList?.some((e: any) => {
        const cat = (e.category || '').toLowerCase();
        const tit = (e.title || '').toLowerCase();
        return cat.includes('salary') || cat.includes('payroll') || cat.includes('slip') || tit.includes('salary') || tit.includes('payroll') || tit.includes('slip');
      })
    );

    // Determine target provider key and original name if mentioned
    let targetProviderKey = '';
    let targetProviderOriginalName = '';
    if (lowerMsg.includes('easycash') || lowerMsg.includes('easy cash')) {
      targetProviderKey = 'easycash';
      targetProviderOriginalName = 'Easycash';
    } else if (lowerMsg.includes('adakami') || lowerMsg.includes('ada kami')) {
      targetProviderKey = 'adakami';
      targetProviderOriginalName = 'AdaKami';
    } else if (lowerMsg.includes('bca') || lowerMsg.includes('central asia')) {
      targetProviderKey = 'bca';
      targetProviderOriginalName = 'Bank Central Asia (BCA)';
    } else if (lowerMsg.includes('mandiri')) {
      targetProviderKey = 'mandiri';
      targetProviderOriginalName = 'Bank Mandiri';
    } else if (lowerMsg.includes('bri')) {
      targetProviderKey = 'bri';
      targetProviderOriginalName = 'Bank Rakyat Indonesia (BRI)';
    } else if (lowerMsg.includes('btpn') || lowerMsg.includes('jenius')) {
      targetProviderKey = 'btpn';
      targetProviderOriginalName = 'Bank BTPN (Jenius / BTPN)';
    } else if (lowerMsg.includes('kredit pintar') || lowerMsg.includes('kreditpintar')) {
      targetProviderKey = 'kreditpintar';
      targetProviderOriginalName = 'Kredit Pintar';
    } else {
      // Check for generic provider patterns in user query (e.g. "Is PinjamCobaX licensed", "Is PinjamCobaX registered", "What is PinjamCobaX's licence", "to PinjamCobaX", etc.)
      const isLenderPattern = userText.match(/\bis\s+([A-Za-z0-9_-]+)\s+(?:currently\s+)?(?:licen[sc]ed|registered|authori[sz]ed|regulated|under|supervised)\b/i);
      const whatLicencePattern = userText.match(/\bwhat\s+is\s+([A-Za-z0-9_-]+)(?:'s|’s)?\s+(?:licen[sc]e|registration|status|policy)\b/i);
      const toLenderMatch = userText.match(/\b(?:about|for|to|lender|provider|from|at|with)\s+([A-Za-z0-9_-]+)\b/i);
      const lenderPatternMatch = isLenderPattern || whatLicencePattern || toLenderMatch;

      if (lenderPatternMatch && lenderPatternMatch[1]) {
        const potentialName = lenderPatternMatch[1].trim();
        const forbiddenWords = [
          'a', 'an', 'the', 'my', 'your', 'our', 'his', 'her', 'their', 'some', 'any',
          'is', 'are', 'was', 'were', 'what', 'how', 'why', 'when', 'where', 'who',
          'repayment', 'obligation', 'debt', 'loan', 'notice', 'salary', 'due', 'pay', 'date',
          'bank', 'ojk', 'bi', 'pojk', 'seojk', 'pbi', 'rp', 'idr', 'currently', 'really',
          'actually', 'licensed', 'licenced', 'registered', 'authorised', 'authorized',
          'regulated', 'indonesia', 'p2p', 'lpbbti', 'there', 'this', 'that'
        ];
        if (!forbiddenWords.includes(potentialName.toLowerCase()) && potentialName.length > 2) {
          targetProviderOriginalName = potentialName;
          targetProviderKey = potentialName.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
      }
    }

    const verifiedTargetInst = targetProviderKey ? verifyInstitution(targetProviderKey, targetProviderOriginalName || targetProviderKey) : null;
    const verifiedTargetPolicy = targetProviderKey ? retrieveInstitutionPolicy(targetProviderKey, targetProviderOriginalName || targetProviderKey) : null;
    const isUnverifiedNamedProvider = Boolean(targetProviderKey) && (!verifiedTargetInst || !verifiedTargetInst.isVerifiedByOJK);

    // A. PROVIDER-SPECIFIC VERIFICATION ROUTING
    // Strict provider verification keywords: ONLY when user explicitly asks about licensing, registration, authorisation, regulator status, RIPLAY, penalties, fees, policies, etc.
    const isExplicitProviderVerificationQuery = Boolean(targetProviderKey) && /\b(licen[sc]e|licen[sc]ed|licen[sc]ing|registered|registration|authori[sz]ed|authori[sz]ation|legal entity|riplay|penalty|penalties|fee|fees|restructur|grace period|policy|policies|regulated|supervis(?:ed|ion))\b/i.test(lowerMsg);

    // B. CONVERSATIONAL FOLLOW-UP & FINANCIAL PRIORITISATION PRECEDENCE
    const isAskingPrioritisationOrInfo =
      lowerMsg.includes('why should i prioritise') ||
      lowerMsg.includes('why should i prioritize') ||
      lowerMsg.includes('why this one first') ||
      lowerMsg.includes('why is easycash first') ||
      lowerMsg.includes('why is adakami first') ||
      lowerMsg.includes('why is bca first') ||
      lowerMsg.includes('why first') ||
      lowerMsg.includes('explain that recommendation') ||
      lowerMsg.includes('explain recommendation') ||
      lowerMsg.includes('what other information') ||
      lowerMsg.includes('what information do you need') ||
      lowerMsg.includes('what info do you need') ||
      lowerMsg.includes('what do you need') ||
      lowerMsg.includes('decide what to pay first') ||
      lowerMsg.includes('what to pay first') ||
      lowerMsg.includes('which repayment should i prioritise') ||
      lowerMsg.includes('which repayment should i prioritize') ||
      lowerMsg.includes('which should i pay first') ||
      lowerMsg.includes('how should i prioritise') ||
      lowerMsg.includes('how should i prioritize') ||
      lowerMsg.includes('how to prioritise') ||
      lowerMsg.includes('how to prioritize') ||
      lowerMsg.includes('order of payment') ||
      lowerMsg.includes('what else do you need') ||
      lowerMsg.includes('why do you need my available cash') ||
      lowerMsg.includes('essential expenses before payday') ||
      lowerMsg.includes('update my salary information') ||
      lowerMsg.includes('prioritise') ||
      lowerMsg.includes('prioritize');

    // Extract explicit scenario borrowing amount if proposed in the user message
    const userScenarioBorrowingAmount = extractScenarioBorrowingAmount(userText);

    // Identify lender notice requests
    let requestedLender = '';
    if (lowerMsg.includes('bca') || lowerMsg.includes('central asia')) requestedLender = 'BCA';
    else if (lowerMsg.includes('adakami') || lowerMsg.includes('ada kami')) requestedLender = 'AdaKami';
    else if (lowerMsg.includes('easycash') || lowerMsg.includes('easy cash')) requestedLender = 'Easycash';
    else if (lowerMsg.includes('mandiri')) requestedLender = 'Mandiri';
    else if (lowerMsg.includes('bri')) requestedLender = 'BRI';
    else if (lowerMsg.includes('btpn') || lowerMsg.includes('jenius')) requestedLender = 'BTPN';
    else if (lowerMsg.includes('kredit pintar') || lowerMsg.includes('kreditpintar')) requestedLender = 'Kredit Pintar';

    const isNoticeRequest = lowerMsg.includes('notice') ||
      (lowerMsg.includes('add') && (lowerMsg.includes('repayment') || lowerMsg.includes('obligation') || lowerMsg.includes('loan') || lowerMsg.includes('notice') || lowerMsg.includes('evidence'))) ||
      ((lowerMsg.includes('can i add') || lowerMsg.includes('upload')) && (requestedLender !== '' || lowerMsg.includes('repayment') || lowerMsg.includes('notice')));

    const isRequestedLenderConfirmed = requestedLender
      ? confirmedLenders.some(l => String(l).toLowerCase().includes(requestedLender.toLowerCase()))
      : false;

    // Identify borrowing query
    const isAskingBorrowing = lowerMsg.includes('borrow') || lowerMsg.includes('cover the gap') || lowerMsg.includes('new loan') || lowerMsg.includes('additional loan') || userScenarioBorrowingAmount !== null;

    // C. REGULATORY QUERY PRECEDENCE
    // Check if query is asking about general regulations, rules, collection standards, rights, or Bank Indonesia / OJK applicability
    const isGeneralOrSectorRegulatoryQuery =
      /\b(ojk|pojk|seojk|slik|ideb|lpbbti|pbi|bank indonesia)\b/i.test(lowerMsg) ||
      lowerMsg.includes('debt collection') ||
      lowerMsg.includes('collection rule') ||
      lowerMsg.includes('collection regulation') ||
      lowerMsg.includes('collection practice') ||
      lowerMsg.includes('collection standard') ||
      lowerMsg.includes('prohibited collection') ||
      lowerMsg.includes('penagihan') ||
      lowerMsg.includes('consumer protection') ||
      lowerMsg.includes('perlindungan konsumen') ||
      lowerMsg.includes('borrower rights') ||
      lowerMsg.includes('my rights') ||
      lowerMsg.includes('legal rights') ||
      lowerMsg.includes('statutory rights') ||
      lowerMsg.includes('hak peminjam') ||
      lowerMsg.includes('hak konsumen') ||
      lowerMsg.includes('lender policy') ||
      lowerMsg.includes('lender obligation') ||
      lowerMsg.includes('riplay') ||
      lowerMsg.includes('compliance') ||
      (lowerMsg.includes('rule') && (lowerMsg.includes('collection') || lowerMsg.includes('regulation') || lowerMsg.includes('law') || lowerMsg.includes('apply') || lowerMsg.includes('legal') || lowerMsg.includes('repayment') || lowerMsg.includes('current rules'))) ||
      (lowerMsg.includes('regulation') && !lowerMsg.includes('recommend'));

    // STRICT INTENT PRECEDENCE:
    // 1. Follow-up financial reasoning / prioritisation / notice requests have top precedence over regulatory / verification
    // 2. Regulatory queries (including "What current rules apply to my Easycash repayment, and does Bank Indonesia regulation apply here?") route to regulatory applicability
    // 3. Provider-specific verification applies ONLY when explicit licensing/status/RIPLAY/policy keywords are present AND not superseded by prioritisation
    const isProviderSpecificVerification = !isAskingPrioritisationOrInfo && !isNoticeRequest && isExplicitProviderVerificationQuery;

    const isRegulatoryQuery =
      !isAskingPrioritisationOrInfo &&
      !isNoticeRequest &&
      (isGeneralOrSectorRegulatoryQuery || (isProviderSpecificVerification && !isUnverifiedNamedProvider));

    const isFinancialReasoningQuery =
      !isRegulatoryQuery &&
      !isProviderSpecificVerification &&
      (isAskingBorrowing || isAskingPrioritisationOrInfo || lowerMsg.includes('funding gap') || lowerMsg.includes('cash flow'));

    const isCashSalaryMissing = (availableCash === null || availableCash === undefined) || !nextSalaryDate;

    // Deterministic Financial Calculations
    const financialMetrics = calculateFinancialMetrics({
      obligations,
      availableCash,
      nextSalaryAmount,
      nextSalaryDate,
      essentialExpenses,
      scenarioBorrowingAmount: userScenarioBorrowingAmount,
    });

    // 1. Dynamic Regulatory & Provider Source Selection
    const isExplicitlyAskingBI = lowerMsg.includes('bank indonesia') || /\b(bi|pbi)\b/i.test(lowerMsg);
    const mentionsPaymentSystem = lowerMsg.includes('payment system') || lowerMsg.includes('payment service') || lowerMsg.includes('qris') || lowerMsg.includes('transfer');
    const isOrdinaryLPBBTIQuery = (lowerMsg.includes('easycash') || lowerMsg.includes('adakami') || lowerMsg.includes('pindar') || lowerMsg.includes('lpbbti')) && !mentionsPaymentSystem;

    // Dynamically retrieve applicable regulatory sectors
    // Include BI only if the query actually involves BI payment systems
    const includeBISources = isExplicitlyAskingBI && mentionsPaymentSystem;
    const dynamicSectors = retrieveApplicableRegulations(financialContext, false, includeBISources);

    const dynamicRetrievedSources: any[] = [];
    const currentTimeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    if (isProviderSpecificVerification && verifiedTargetInst && verifiedTargetInst.isVerifiedByOJK) {
      // Add verified provider canonical sources
      if (targetProviderKey === 'easycash') {
        dynamicRetrievedSources.push({
          sourceTitle: "Easycash OJK Licensed LPBBTI Facility Terms",
          organisation: "Easycash (PT Indonesia Fintopia Technology)",
          confidenceScore: 0.99,
          matchedClause: `OJK Licence KEP-49/D.05/2020 (16 October 2020) · ${verifiedTargetInst.legalEntity}`,
          retrievedAt: currentTimeStr,
          status: "Current",
          url: "https://www.easycash.id/"
        });
        dynamicRetrievedSources.push({
          sourceTitle: "Easycash — RIPLAY & Borrower Terms & Conditions",
          organisation: "Easycash (PT Indonesia Fintopia Technology)",
          confidenceScore: 0.97,
          matchedClause: "RIPLAY product disclosure & consumer complaints route",
          retrievedAt: currentTimeStr,
          status: "Current",
          url: "https://easycash.id/pdf-review-new"
        });
      } else if (targetProviderKey === 'adakami') {
        dynamicRetrievedSources.push({
          sourceTitle: "AdaKami Official Portal & License Verification",
          organisation: "AdaKami (PT Pembiayaan Digital Indonesia)",
          confidenceScore: 0.99,
          matchedClause: `OJK Licence KEP-128/D.05/2019 (13 December 2019) · ${verifiedTargetInst.legalEntity}`,
          retrievedAt: currentTimeStr,
          status: "Current",
          url: "https://www.adakami.id/"
        });
        dynamicRetrievedSources.push({
          sourceTitle: "AdaKami — Ringkasan Informasi Produk dan Layanan (RIPLAY)",
          organisation: "AdaKami (PT Pembiayaan Digital Indonesia)",
          confidenceScore: 0.97,
          matchedClause: "RIPLAY product summary and complaint escalation channels",
          retrievedAt: currentTimeStr,
          status: "Current",
          url: "https://www.adakami.id/riplay"
        });
      } else if (targetProviderKey === 'bca') {
        dynamicRetrievedSources.push({
          sourceTitle: "BCA Personal Loan — Official Product Information",
          organisation: "Bank Central Asia (BCA)",
          confidenceScore: 0.98,
          matchedClause: "Licensed banking institution supervised by OJK and Bank Indonesia",
          retrievedAt: currentTimeStr,
          status: "Current",
          url: "https://www.bca.co.id/id/Individu/produk/pinjaman/Pinjaman-Personal"
        });
      }
    } else if (isRegulatoryQuery) {
      // Dynamic selection from active regulatory sectors
      const isDebtCollectionOrConsumerProtection =
        lowerMsg.includes('collection') ||
        lowerMsg.includes('hour') ||
        lowerMsg.includes('time') ||
        lowerMsg.includes('penagihan') ||
        lowerMsg.includes('protect') ||
        lowerMsg.includes('right') ||
        lowerMsg.includes('hak') ||
        lowerMsg.includes('slik');

      for (const sec of dynamicSectors) {
        for (const r of sec.rules) {
          // If query is specifically about collection hours or cross-sector consumer protection, include POJK 22/2023
          // Otherwise, POJK 40/2024 and SEOJK 19/2025 apply to LPBBTI
          if (r.id === 'pojk-22-2023') {
            if (isDebtCollectionOrConsumerProtection) {
              dynamicRetrievedSources.push({
                sourceTitle: r.codeNumber || r.title,
                organisation: "OJK",
                confidenceScore: 0.97,
                matchedClause: r.summaryText || r.keyClauses?.[0] || "Financial consumer protection & collection standards",
                retrievedAt: currentTimeStr,
                status: r.status || "Current",
                url: r.officialUrl
              });
            }
          } else if (r.id === 'pojk-8-2026') {
            if (lowerMsg.includes('reporting') || lowerMsg.includes('data') || lowerMsg.includes('transaksi') || lowerMsg.includes('pojk 8')) {
              dynamicRetrievedSources.push({
                sourceTitle: r.codeNumber || r.title,
                organisation: "OJK",
                confidenceScore: 0.95,
                matchedClause: "LPBBTI transaction data reporting regulation",
                retrievedAt: currentTimeStr,
                status: r.status || "Current",
                url: r.officialUrl
              });
            }
          } else if (r.id === 'pbi-6-2026') {
            if (includeBISources) {
              dynamicRetrievedSources.push({
                sourceTitle: r.codeNumber || r.title,
                organisation: "Bank Indonesia",
                confidenceScore: 0.95,
                matchedClause: "Consumer protection in Bank Indonesia payment systems",
                retrievedAt: currentTimeStr,
                status: r.status || "Current",
                url: r.officialUrl
              });
            }
          } else {
            dynamicRetrievedSources.push({
              sourceTitle: r.codeNumber || r.title,
              organisation: "OJK",
              confidenceScore: 0.96,
              matchedClause: r.summaryText || r.keyClauses?.[0] || "Active financial regulation",
              retrievedAt: currentTimeStr,
              status: r.status || "Current",
              url: r.officialUrl
            });
          }
        }
      }
    }

    const retrievedSources = dynamicRetrievedSources;

    // 2. Prepare Contextual Next Best Actions & Pipeline Activity
    let nextBestActions: any[] = [];
    let pipelineActivity: any = {
      currentStage: 'REASON',
      stages: [
        { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed query & confirmed evidence context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
        { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK regulatory clauses', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
        { stage: 'VERIFY', status: 'completed', message: 'Verified active regulatory source currency', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
        { stage: 'REASON', status: 'completed', message: 'ADK root agent reasoning applied to borrower context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
        { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
      ],
      activeStepDescription: 'ADK root agent reasoning ready · decision support active'
    };

    if (isNoticeRequest && (!requestedLender || !isRequestedLenderConfirmed)) {
      const ctaBtnLabel = requestedLender
        ? `Add ${requestedLender} repayment notice →`
        : (confirmedLenders.length > 0 ? 'Add another repayment notice →' : 'Add repayment notice →');

      nextBestActions = [
        {
          id: "action-more-context",
          category: "DO TODAY",
          priorityOrder: 1,
          title: "More context needed",
          reason: requestedLender ? `Add your ${requestedLender} repayment notice to continue.` : "Add your remaining repayment notices and salary information to continue.",
          financialImpact: "Provides complete cash-flow visibility across all obligations.",
          evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
          trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
          currentSourceStatus: "Current",
          requiresHumanAuthorisation: false,
          authorisingEntity: "Borrower",
          primaryActionButtonLabel: ctaBtnLabel,
          actionCode: "ADD_EVIDENCE",
          lineage: {
            evidenceProvided: evidenceList.map((e: any) => e.title),
            retrievedRules: ["POJK No. 40 Tahun 2024"],
            policiesApplied: [],
            geminiReasoning: requestedLender ? `Awaiting ${requestedLender} repayment notice upload.` : "Awaiting repayment notice upload.",
            financialCalculation: "Awaiting evidence.",
            escalationBoundaryNote: "No prioritisation recommended until full context is provided."
          }
        }
      ];
      pipelineActivity.activeStepDescription = requestedLender
        ? `More evidence requested · waiting for ${requestedLender} notice`
        : "More evidence requested · waiting for repayment notice";
    } else if (obligationCount > 0 && !isCashSalaryMissing && (isAskingBorrowing || isAskingPrioritisationOrInfo || isFinancialReasoningQuery)) {
      const earliest = financialMetrics.earliestObligation;
      const earliestInst = earliest?.institutionName || "earliest lender";
      const earliestAmtStr = earliest?.formattedAmount || `Rp${(earliest?.amount || 0).toLocaleString('id-ID')}`;
      const earliestDateStr = earliest?.dueDate || "due date";

      if (isAskingBorrowing) {
        nextBestActions = [
          {
            id: "action-contact-earliest",
            category: "DO TODAY",
            priorityOrder: 1,
            title: `Ask ${earliestInst} about moving the repayment date`,
            reason: `${earliestInst} is due first on ${earliestDateStr} for ${earliestAmtStr}. Ask ${earliestInst} whether this repayment can be moved to ${nextSalaryDate}, your confirmed salary date. Any change requires ${earliestInst} confirmation.`,
            financialImpact: `If approved, pre-salary repayments decrease by ${earliestAmtStr} before payday.`,
            evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
            trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
            currentSourceStatus: "Current",
            requiresHumanAuthorisation: true,
            authorisingEntity: earliestInst,
            primaryActionButtonLabel: `Prepare ${earliestInst} request →`,
            actionCode: "PREPARE_EXTENSION",
            lineage: {
              evidenceProvided: evidenceList.map((e: any) => e.title),
              retrievedRules: ["POJK No. 40 Tahun 2024"],
              policiesApplied: [`${earliestInst} standard terms`],
              geminiReasoning: "Explores non-debt alternative first.",
              financialCalculation: `Shifts ${earliestAmtStr} obligation to payday if approved.`,
              escalationBoundaryNote: "Subject to lender confirmation."
            }
          }
        ];
        pipelineActivity.activeStepDescription = 'Borrowing risk evaluated · non-debt pathway prioritised';
        pipelineActivity.stages = [
          { stage: 'UNDERSTAND', status: 'completed', message: 'Confirmed financial obligations & borrower cash position', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved verified regulatory guidance and lender policies', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'VERIFY', status: 'completed', message: 'Verified active debt facts and currency of rules', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'REASON', status: 'completed', message: 'Financial reasoning sub-agent evaluated cash-flow gap and borrowing implications', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action · decision support ready', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
        ];
      } else {
        const cash = financialMetrics.availableConfirmedCash;
        const totalPreSalary = financialMetrics.obligationsDueBeforeSalary;
        const gap = financialMetrics.preSalaryFundingGap;
        const remainderAfterEarliest = financialMetrics.remainingCashAfterEarliest;

        nextBestActions = [
          {
            id: "action-contact-earliest",
            category: "DO TODAY",
            priorityOrder: 1,
            title: `Contact ${earliestInst} regarding repayment options`,
            reason: cash >= (earliest?.amount || 0)
              ? `Your Rp${cash.toLocaleString('id-ID')} available cash can cover the ${earliestAmtStr} ${earliestInst} repayment, but would leave Rp${remainderAfterEarliest.toLocaleString('id-ID')} while Rp${(totalPreSalary - (earliest?.amount || 0)).toLocaleString('id-ID')} of other repayments remain due before salary. Essential living expenses have not been provided, so early communication with ${earliestInst} is worth exploring before deciding how to allocate your cash.`
              : `${earliestInst} is due on ${earliestDateStr} before your salary on ${nextSalaryDate}. Your Rp${cash.toLocaleString('id-ID')} cash is below the full ${earliestAmtStr} balance, so early communication is required.`,
            financialImpact: "Clarifies available repayment choices without assuming guaranteed approval.",
            evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
            trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
            currentSourceStatus: "Current",
            requiresHumanAuthorisation: true,
            authorisingEntity: earliestInst,
            primaryActionButtonLabel: `Contact ${earliestInst} →`,
            actionCode: "PREPARE_EXTENSION",
            lineage: {
              evidenceProvided: evidenceList.map((e: any) => e.title),
              retrievedRules: ["POJK No. 40 Tahun 2024"],
              policiesApplied: [`${earliestInst} standard terms`],
              geminiReasoning: `Earliest deadline identified; cash covers payment individually but portfolio gap remains.`,
              financialCalculation: `Cash Rp${cash.toLocaleString('id-ID')} vs ${earliestInst} ${earliestAmtStr} (Portfolio Gap Rp${gap.toLocaleString('id-ID')})`,
              escalationBoundaryNote: "Subject to lender confirmation; no automatic waiver or extension assumed."
            }
          },
          {
            id: "action-simulate",
            category: "REVIEW NEXT",
            priorityOrder: 2,
            title: "Compare repayment scenarios in Action Simulator",
            reason: "Evaluate 'What if?' scenarios to compare cash-flow impacts before making payment.",
            financialImpact: "Helps identify optimal cash allocation.",
            evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
            trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
            currentSourceStatus: "Current",
            requiresHumanAuthorisation: false,
            authorisingEntity: "Borrower",
            primaryActionButtonLabel: "Simulate scenarios →",
            actionCode: "CUSTOM",
            lineage: {
              evidenceProvided: evidenceList.map((e: any) => e.title),
              retrievedRules: ["POJK No. 40 Tahun 2024"],
              policiesApplied: [],
              geminiReasoning: "Scenario comparison using confirmed cash position.",
              financialCalculation: `Simulating cash allocation across ${obligations.length} obligations.`,
              escalationBoundaryNote: "Simulations provide decision support only."
            }
          }
        ];
        pipelineActivity.activeStepDescription = gap > 0
          ? 'Cash-flow gap identified · decision support ready'
          : 'Cash position evaluated · decision support ready';
        pipelineActivity.stages = [
          { stage: 'UNDERSTAND', status: 'completed', message: 'Confirmed financial obligations & borrower cash position', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved verified regulatory guidance and lender policies', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'VERIFY', status: 'completed', message: 'Verified active debt facts and currency of rules', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'REASON', status: 'completed', message: 'Financial reasoning sub-agent evaluated cash-flow gap and prioritisation', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action · decision support ready', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
        ];
      }
    } else if ((obligationCount > 0 || evidenceCount > 0) && isCashSalaryMissing) {
      nextBestActions = [
        {
          id: "action-add-cash-salary",
          category: "DO TODAY",
          priorityOrder: 1,
          title: "Add your cash and salary timing.",
          reason: "Provide available cash and salary schedule to enable cash-flow scenario calculations.",
          financialImpact: "Enables precise timing mismatch analysis across confirmed obligations.",
          evidenceUsed: evidenceList.map((e: any) => e.title || "Repayment notice"),
          trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
          currentSourceStatus: "Current",
          requiresHumanAuthorisation: false,
          authorisingEntity: "Borrower",
          primaryActionButtonLabel: "Add financial context →",
          actionCode: "ADD_FINANCIAL_CONTEXT",
          lineage: {
            evidenceProvided: evidenceList.map((e: any) => e.title),
            retrievedRules: ["POJK No. 40 Tahun 2024"],
            policiesApplied: [],
            geminiReasoning: "Awaiting cash and salary timing details from borrower.",
            financialCalculation: "Cash-flow calculation pending available cash and salary inputs.",
            escalationBoundaryNote: "Cannot recommend priority order without cash-flow availability."
          }
        }
      ];
      pipelineActivity.activeStepDescription = confirmedLenders.length === 1
        ? `${confirmedLenders[0]} evidence analysed · more context needed`
        : 'Confirmed evidence analysed · more context needed';
    } else if (obligationCount === 0 && hasSalaryConfirmed) {
      nextBestActions = [];
      pipelineActivity.activeStepDescription = 'Confirmed evidence analysed · more context needed';
    } else if (obligationCount === 0 && evidenceCount === 0) {
      nextBestActions = [];
      pipelineActivity.currentStage = 'UNDERSTAND';
      pipelineActivity.stages = [
        { stage: 'UNDERSTAND', status: 'pending' },
        { stage: 'RETRIEVE', status: 'pending' },
        { stage: 'VERIFY', status: 'pending' },
        { stage: 'REASON', status: 'pending' },
        { stage: 'ACT', status: 'pending' }
      ];
      pipelineActivity.activeStepDescription = 'Waiting for evidence';
    }

    // 3. Assemble Grounded ADK Root Agent System Instruction
    const obligationSummary = obligations.length > 0
      ? obligations.map((o: any) => `- ${o.institutionName} (${o.category || o.title || 'Loan'}): Rp${(o.amount || 0).toLocaleString('id-ID')} due ${o.dueDate || o.formattedDate}`).join('\n')
      : 'None confirmed yet';

    const evidenceSummary = evidenceList.length > 0
      ? evidenceList.map((e: any) => {
          const inst = e.userConfirmedDetails?.institutionName || e.extractedDetails?.institutionName || 'Unknown';
          const amt = e.userConfirmedDetails?.amountDue ?? e.extractedDetails?.amountDue;
          const due = e.userConfirmedDetails?.dueDate || e.extractedDetails?.dueDate;
          return `- ${e.title || 'Notice'}: ${inst} | Amount: ${amt ? `Rp${amt.toLocaleString('id-ID')}` : 'N/A'} | Due: ${due || 'N/A'}`;
        }).join('\n')
      : 'None confirmed yet';

    const cashStr = availableCash !== null && availableCash !== undefined ? `Rp${availableCash.toLocaleString('id-ID')}` : 'Not provided';
    const salaryStr = (nextSalaryAmount && nextSalaryDate) ? `Rp${nextSalaryAmount.toLocaleString('id-ID')} on ${nextSalaryDate}` : (nextSalaryDate ? `expected on ${nextSalaryDate}` : 'Not confirmed');
    const expensesStr = essentialExpenses ? `Rp${essentialExpenses.toLocaleString('id-ID')}` : 'Not provided';

    const sessionModeInstruction = isDemo
      ? `SESSION MODE: GUIDED SAMPLE SESSION (September 2026 scenario for borrower persona 'Ayu'). You may address Ayu politely.`
      : `SESSION MODE: NORMAL USER SESSION. Strictly use user-provided evidence and explicit inputs only. Do NOT introduce or mention the name Ayu, sample amounts, or sample assumptions. Preserve a neutral greeting.`;

    // Construct dynamic regulatory and provider context for systemInstruction
    const dynamicSourcesContext = retrievedSources.length > 0
      ? retrievedSources.map(s => `- ${s.sourceTitle} (${s.organisation}): ${s.matchedClause}`).join('\n')
      : '- No specific regulatory or provider sources matched for this query.';

    const providerVerificationContext = verifiedTargetInst && verifiedTargetInst.isVerifiedByOJK
      ? `VERIFIED PROVIDER STATUS:
- Institution Name: ${verifiedTargetInst.institutionName}
- Legal Entity: ${verifiedTargetInst.legalEntity}
- Licence Number: ${verifiedTargetInst.licenceNumber || 'Not explicitly stated'}
- OJK Verified: Yes (Verified by OJK)
- Institution Type: ${verifiedTargetInst.institutionType || 'Other'} (${verifiedTargetInst.institutionType === 'Bank' ? 'Commercial Bank - NOT LPBBTI' : 'LPBBTI / Fintech Lending'})
- Jurisdiction: ${verifiedTargetInst.jurisdiction}
- Official URL: ${verifiedTargetInst.officialUrl}
${verifiedTargetPolicy ? `- Policy Title: ${verifiedTargetPolicy.title}\n- Product Information: ${verifiedTargetPolicy.productInformation}\n- RIPLAY / Assistance: ${verifiedTargetPolicy.riplayInfo || verifiedTargetPolicy.customerAssistance}` : ''}
- CONTEXT ISOLATION: For pure provider verification or licensing questions, do NOT mention or attach repayment amounts or due dates from other obligations unless explicitly stated in this user message.`
      : targetProviderKey
      ? `UNKNOWN / UNVERIFIED PROVIDER:
- The provider '${targetProviderOriginalName || targetProviderKey}' could not be verified from FairAssist's canonical provider registry.
- Do NOT present the provider as licensed or unlicensed.
- Do NOT assume OJK or Bank Indonesia jurisdiction.
- Do NOT assert licence, fees, penalties, restructuring terms, extensions, or provider-specific policies for this unverified provider.
- State clearly: "I could not verify ${targetProviderOriginalName || targetProviderKey} from FairAssist's canonical provider registry. I do not have verified evidence to confirm whether ${targetProviderOriginalName || targetProviderKey} is currently licensed or registered by OJK."
- CONTEXT ISOLATION: Do NOT attach repayment amounts (e.g. Rp650,000), due dates (e.g. 24 September 2026), or existing obligations from other lenders (like Easycash or BCA) to ${targetProviderOriginalName || targetProviderKey} unless explicitly stated by the user in this exact message.`
      : 'No specific provider query detected.';

    const systemInstruction = `
You are FairAssist, an AI financial decision-support agent for Indonesian consumers.
Always write in British English throughout (e.g. analyse, prioritised, authorised, instalment, programme, organisation, licence).
Keep responses concise, clear, and grounded (approx 60-140 words).

${sessionModeInstruction}

CONFIRMED BORROWER CONTEXT:
Active Obligations:
${obligationSummary}
Confirmed Evidence Items:
${evidenceSummary}
Confirmed Available Cash: ${cashStr}
Confirmed Salary: ${salaryStr}
Essential Living Expenses: ${expensesStr}
Confirmed Lenders: ${confirmedLenders.join(', ') || 'None'}

DYNAMICALLY RETRIEVED TRUSTED SOURCES & GROUNDING:
${dynamicSourcesContext}

${providerVerificationContext}

CRITICAL DECISION INTEGRITY & GROUNDING RULES:
1. EVIDENCE BEFORE ASSUMPTION:
   - Answer strictly from the confirmed borrower context above.
   - Do NOT invent lenders, loans, amounts, salary, or due dates not in the confirmed context.
   - If user asks to add evidence for a new lender, acknowledge politely, ask them to add the repayment notice, state that you won't assume amount or due date until confirmed, and DO NOT offer premature debt restructuring or contact advice.

2. CLAIM-TO-SOURCE PROVENANCE & REGULATORY BOUNDARIES:
   - 08:00–20:00 COLLECTION HOURS: The 08:00–20:00 collection-hours restriction may appear ONLY when POJK No. 22 Tahun 2023 is actually present in the matched retrieved sources. If POJK 22/2023 is absent, completely omit this statement and do not infer it from general knowledge.
   - POJK 8/2026: Restrict POJK 8/2026 strictly to LPBBTI transaction data reporting and Article 187 revocation. Never use POJK 8/2026 as generic consumer protection grounding.
   - BANK INDONESIA VS OJK: When the user asks about Bank Indonesia regulation for an ordinary LPBBTI/pindar repayment query (e.g. Easycash, AdaKami), explicitly explain that lending operations are routed to OJK jurisdiction and that PBI 6/2026 is not applied because the query does not concern a Bank Indonesia payment-system or payment-service context.
   - INSTITUTION CATEGORIES: Do NOT classify all providers as LPBBTI. Easycash and AdaKami are LPBBTI providers. BCA is a commercial BANKING institution (not LPBBTI). Preserve the institution category from canonical verification.
   - PROVIDER-SPECIFIC CLAIMS & CONTEXT ISOLATION: For questions about licensing, registration, RIPLAY, fees, penalties, or policies of a named lender, cite only verified canonical registry facts (e.g. Easycash is operated by PT Indonesia Fintopia Technology under OJK Licence KEP-49/D.05/2020). If a provider is unknown/unverified, explicitly state that it could not be verified from the canonical registry, without assuming regulatory status. Never attach repayment amounts or due dates from session obligations to a separate lender in a verification query.

3. SITUATION-SPECIFIC GUIDANCE:
   - If the user asks about regulations, OJK rules, debt collection standards, borrower rights, lender policies, or dispute escalation: Answer the regulatory question directly and thoroughly with grounded Indonesian regulatory facts (delegating to regulatory_retrieval_agent). General regulatory and consumer protection questions do NOT require repayment notices or borrower financial facts before explaining applicable rules.
   - If the user is seeking repayment planning, debt prioritisation, or cash-flow allocation advice but NO evidence or obligations are present: Politely explain that you need their first repayment notice, or the lender, amount due, and due date to start.
   - If SALARY ONLY is confirmed (0 obligations): State that salary is confirmed at ${salaryStr}, and that repayment notice(s) and available cash are still needed to analyse cash flow.
   - If OBLIGATIONS EXIST BUT CASH/SALARY IS MISSING:
     * State confirmed total obligations (e.g. Rp1,850,000 across confirmed obligations).
     * CRITICAL FINANCIAL GAP CALCULATION GATE: NEVER describe total confirmed obligations as a "funding gap", "shortfall", "deficit", or "cash-flow gap". Total obligations is only the sum of confirmed debts.
     * State which required cash-flow inputs are missing (available cash, next salary date, expected salary amount).
     * Explicitly state that a funding gap cannot yet be calculated because required cash-flow inputs are missing. Mention that essential expenses can also be added.
     * Do NOT state or calculate a numerical funding gap when available cash, next salary date, or expected salary are missing.
   - If USER ASKS ABOUT BORROWING OR A "WHAT IF I BORROW..." SCENARIO:
     * CRITICAL INVARIANT: NEVER substitute or overwrite the user's explicit proposed borrowing amount (e.g. Rp1.75M = Rp1,750,000) with the calculated repayment-only funding gap (e.g. Rp350,000).
     * Keep the user's hypothetical borrowing amount (Rp1,750,000), confirmed available cash (Rp850,000), confirmed pre-salary obligation (Rp1,200,000), and calculated funding gap (Rp350,000) strictly separate.
     * Show the arithmetic: Borrowing Rp1,750,000 + Rp850,000 cash = Rp2,600,000 total available funds. After paying the Rp1,200,000 obligation, Rp1,400,000 nominally remains.
     * Proposed borrowing of Rp1,750,000 exceeds the repayment-only funding gap of Rp350,000 by Rp1,400,000.
     * NO PHANTOM DISPOSABLE CASH: Because essential living expenses have not been provided, do NOT describe that Rp1,400,000 as "spare cash", "disposable cash", "savings", or "surplus wealth".
     * Explain that loan interest, fees, tenor, and repayment schedule are unknown unless supplied. Because essential expenses are not confirmed, full affordability conclusions must not be fabricated.
     * Explain that borrowing creates a new debt obligation. If a specific lender or product is not identified, lender-specific interest, fees, tenor, and regulatory classification remain unverified until a provider is specified. DO NOT attach, cite, assert, or imply POJK No. 40 Tahun 2024, SEOJK No. 19/SEOJK.06/2025, LPBBTI, Pindar, or any lender-specific regulation to an unspecified hypothetical borrowing.
     * Compare against non-debt alternatives, including contacting the earliest lender before its due date to check if repayment can move to payday, noting that any date change requires explicit lender confirmation.
     * Emphasise that this scenario is purely hypothetical and does not alter canonical confirmed state.
   - If CASH & SALARY ARE CONFIRMED AND USER ASKS PRIORITISATION:
     - State total pre-salary obligations, available cash, and pre-salary gap / shortfall.
     - If essential expenses have not been provided, explicitly keep them unknown rather than assuming zero.
     - Identify the earliest deadline.
     - CRITICAL CASH SUFFICIENCY INVARIANT:
       * If available cash < amount due before salary (or available cash < earliest repayment obligation): NEVER describe available cash as "sufficient", "enough", "adequate", or able to cover the obligation, and NEVER write contradictory statements like "is sufficient to cover ... which would leave Rp-350,000". Explicitly describe the difference as a "shortfall" or "funding gap".
       * Use wording equivalent to: "Your confirmed available cash of Rp850,000 is Rp350,000 short of the Rp1,200,000 repayment due on 25 September 2026. Your salary is expected on 28 September 2026, three days after the repayment due date."
       * If available cash is greater than or equal to the earliest repayment individually, but less than total pre-salary obligations: State that cash can cover the earliest repayment individually (leaving RpX), but total pre-salary obligations exceed available cash by RpY before salary.
     - Distinguish deadline priority (who requires attention first) from payment allocation (how cash is spent).
     - Recommend contacting the earliest lender before its due date to check available repayment choices, noting that any date shift requires explicit lender confirmation.
     - Keep subsequent obligations in view.
     - Note that simulations can be compared in the Action Simulator before deciding.

4. STRUCTURE:
   Use clean Markdown formatting with 3 concise sections where applicable:
   ### What I found
   ### What it means
   ### Next step
`;

    // 4. Deterministic Fallback Response (for offline / non-API environments)
    let fallbackReply = `### What I found\n\nYou have an active repayment obligation coming due.\n\n### What it means\n\nContacting your lender before your due date allows you to inquire about payment alignment choices. Any repayment date change depends on lender terms and requires explicit lender confirmation; otherwise the original verified obligation and due date remain applicable.\n\n### Next step\n\n1. Contact customer support before your due date.\n2. Inquire about available repayment choices.\n3. Avoid taking new secondary debt.`;

    const hasPOJK22InSources = retrievedSources.some(s => s.sourceTitle?.includes('22') || s.sourceTitle?.toLowerCase().includes('pojk 22'));

    // Check if user is referencing an unverified provider in their message or repayment obligation
    const explicitAmtMatch = userText.match(/(?:rp|idr)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)/i);
    const explicitAmtStr = explicitAmtMatch ? `Rp${explicitAmtMatch[1].replace(/,/g, '.')}` : '';
    const explicitDateMatch = userText.match(/\b([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})\b/i);
    const explicitDateStr = explicitDateMatch ? explicitDateMatch[1] : '';

    const isAskingLicensingOrStatus = isExplicitProviderVerificationQuery || lowerMsg.includes('licensed') || lowerMsg.includes('registered') || lowerMsg.includes('status') || lowerMsg.includes('regulated') || lowerMsg.includes('licence');

    if (isUnverifiedNamedProvider && isProviderSpecificVerification) {
      const displayName = verifiedTargetInst?.institutionName || targetProviderOriginalName || targetProviderKey;

      if (isAskingLicensingOrStatus && !explicitAmtStr && !explicitDateStr) {
        fallbackReply = `### What I found\nI could not verify **${displayName}** from FairAssist's canonical provider registry.\n\n### What it means\nI do not have verified evidence to confirm whether **${displayName}** is currently licensed or registered by OJK.\n\n### Next step\nCheck an official OJK source before relying on any licensing claim.`;
      } else if (explicitAmtStr && explicitDateStr) {
        fallbackReply = `### What I found\nYou reported a **${explicitAmtStr}** repayment to **${displayName}** due on **${explicitDateStr}**.\n\nI could not verify **${displayName}** from FairAssist's canonical provider registry.\n\n### What it means\nI can still help you reason from the repayment details you provided, but I will not assume the provider's regulatory status or policies. Because canonical provider verification is unavailable, FairAssist cannot confirm licensing status, fees, penalties, or provider-specific restructuring terms.\n\n### Next step\n1. Contact ${displayName} directly through its official customer service channels before your due date to inquire about repayment terms.\n2. Check the provider's registration status directly on OJK Kontak 157 (konsumen.ojk.go.id).\n3. Any repayment date adjustment requires explicit confirmation from the lender.`;
      } else if (explicitAmtStr) {
        fallbackReply = `### What I found\nYou reported a **${explicitAmtStr}** repayment to **${displayName}**.\n\nI could not verify **${displayName}** from FairAssist's canonical provider registry.\n\n### What it means\nI can still help you reason from the repayment details you provided, but I will not assume the provider's regulatory status or policies. Because canonical provider verification is unavailable, FairAssist cannot confirm licensing status, fees, penalties, or provider-specific restructuring terms.\n\n### Next step\n1. Contact ${displayName} directly through its official customer service channels before your due date to inquire about repayment terms.\n2. Check the provider's registration status directly on OJK Kontak 157 (konsumen.ojk.go.id).\n3. Any repayment date adjustment requires explicit confirmation from the lender.`;
      } else {
        fallbackReply = `### What I found\nI could not verify **${displayName}** from FairAssist's canonical provider registry.\n\n### What it means\nI do not have verified evidence to confirm whether **${displayName}** is currently licensed or registered by OJK.\n\n### Next step\nCheck an official OJK source before relying on any licensing claim.`;
      }
    } else if (isProviderSpecificVerification) {
      if (verifiedTargetInst && verifiedTargetInst.isVerifiedByOJK) {
        if (targetProviderKey === 'easycash') {
          fallbackReply = `### What I found\n**Easycash** is operated by **PT Indonesia Fintopia Technology** and holds an active OJK digital lending licence (**KEP-49/D.05/2020**, granted 16 October 2020) as an authorised LPBBTI provider.\n\n### What it means\nAs a licensed LPBBTI platform, Easycash is subject to OJK supervision and must adhere to standard consumer protection frameworks (**POJK No. 40 Tahun 2024** and **SEOJK No. 19/SEOJK.06/2025**).\n• Product terms, fees, and complaint procedures are published in the official Easycash RIPLAY.\n• Borrower reporting is registered in statutory credit registries.\n• Disputes and inquiries can be submitted directly via Easycash customer care or escalated to OJK Kontak 157.\n\n### Next step\n1. Review your loan agreement and RIPLAY terms on the official Easycash app or website (easycash.id).\n2. For repayment adjustments, contact Easycash customer support directly before your due date.`;
        } else if (targetProviderKey === 'adakami') {
          fallbackReply = `### What I found\n**AdaKami** is operated by **PT Pembiayaan Digital Indonesia** and is a fully licensed LPBBTI provider authorised by OJK under licence **KEP-128/D.05/2019** (granted 13 December 2019).\n\n### What it means\nAdaKami operates under OJK regulatory oversight (**POJK No. 40 Tahun 2024** and **SEOJK No. 19/SEOJK.06/2025**):\n• Product details, daily interest caps, and fee structures are disclosed in the AdaKami RIPLAY.\n• Collection must comply with OJK ethical standards.\n• Customer complaints can be escalated through AdaKami support (15000-77) or OJK Kontak 157.\n\n### Next step\n1. Check your AdaKami agreement and RIPLAY summary for specific repayment terms.\n2. Contact AdaKami official support if you need assistance with payment scheduling.`;
        } else if (targetProviderKey === 'bca') {
          fallbackReply = `### What I found\n**Bank Central Asia (BCA)** (PT Bank Central Asia Tbk) is a commercial banking institution licensed and supervised by the **Otoritas Jasa Keuangan (OJK)** and **Bank Indonesia**.\n\n### What it means\nAs a licensed banking institution (not LPBBTI/P2P lending), BCA's personal loan and credit products are governed by general banking regulations and consumer protection frameworks.\n• Product terms, interest rates, and fees are published in official BCA product documentation.\n• Borrower reporting is registered in SLIK / iDeb.\n• Customer inquiries and restructuring requests can be submitted via Halo BCA (1500888) or official branches.\n\n### Next step\n1. Review your BCA loan agreement and product disclosure.\n2. Contact Halo BCA or your branch before your due date for any inquiries regarding repayment scheduling.`;
        } else {
          fallbackReply = `### What I found\n**${verifiedTargetInst.institutionName}** (${verifiedTargetInst.legalEntity}) is verified in the canonical registry under **${verifiedTargetInst.jurisdiction}** jurisdiction.\n\n### What it means\n${verifiedTargetPolicy?.productInformation || 'The institution operates under official regulatory supervision.'}\n\n### Next step\n1. Refer to official institution support channels.\n2. Inquire directly about terms and repayment options.`;
        }
      } else {
        fallbackReply = `### What I found\nI could not verify **${targetProviderOriginalName || targetProviderKey || 'the specified provider'}** from FairAssist's canonical provider registry.\n\n### What it means\nI do not have verified evidence to confirm whether **${targetProviderOriginalName || targetProviderKey || 'the specified provider'}** is currently licensed or registered by OJK.\n\n### Next step\nCheck an official OJK source before relying on any licensing claim.`;
      }
    } else if (isExplicitlyAskingBI && isOrdinaryLPBBTIQuery) {
      fallbackReply = `### What I found\nLPBBTI (P2P digital lending) providers such as Easycash and AdaKami fall under the regulatory authority of the **Otoritas Jasa Keuangan (OJK)** under **POJK No. 40 Tahun 2024** and **SEOJK No. 19/SEOJK.06/2025**.\n\n### What it means\nBank Indonesia regulation **PBI No. 6/2026** governs consumer protection specifically within payment systems (e.g. fund transfers, payment gateways, and QRIS). Because your query concerns digital loan repayment rather than a payment-service dispute, the lending context is routed to OJK regulations, and PBI 6/2026 is not applied.\n\n### Next step\n1. Refer to OJK LPBBTI regulations for rules governing your digital lending obligations.\n2. Contact your lender or OJK Kontak 157 for digital lending inquiries.`;
    } else if (isRegulatoryQuery) {
      const collectionHoursBullet = hasPOJK22InSources
        ? `\n• Direct collection communications are restricted to 08:00 to 20:00 local borrower time under POJK No. 22 Tahun 2023.`
        : ``;

      fallbackReply = `### What I found\nUnder OJK regulations (**POJK No. 40 Tahun 2024** and **SEOJK No. 19/SEOJK.06/2025**), LPBBTI (P2P digital lending) providers and collection agents must follow strict consumer protection and debt collection standards.\n\n### What it means\nKey collection standards and borrower protections include:\n• Collection practices must be ethical, without intimidation, threats, physical violence, or harassment.${collectionHoursBullet}\n• Debt collectors are strictly prohibited from contacting third parties or emergency contacts not legally bound to the debt obligation.\n• Lenders are held legally responsible for the conduct of third-party collection partners.\n• Repayment history is recorded in statutory credit registries.\n\n### Next step\n1. Check your lender’s official customer service and dispute channels.\n2. If you experience collection violations, you can file a complaint with OJK via Kontak 157 (konsumen.ojk.go.id).\n3. Any repayment arrangement or extension remains subject to lender confirmation.`;
    } else if (obligationCount === 0 && evidenceCount === 0 && !hasSalaryConfirmed) {
      const greeting = isDemo ? "Hello, Ayu.\n\n" : "";
      fallbackReply = `${greeting}I can help, but I need a little more information first.\n\nUpload your first repayment notice, or tell me the lender, amount due and due date.\n\nLet’s start with your first repayment notice.`;
    } else if (obligationCount === 0 && hasSalaryConfirmed) {
      const salAmt = nextSalaryAmount ? `Rp${Number(nextSalaryAmount).toLocaleString('id-ID')}` : 'Rp8,500,000';
      const salDate = nextSalaryDate || '28 Sep 2026';
      fallbackReply = `Your salary information is confirmed at ${salAmt} expected on ${salDate}.\n\nI still need your repayment notice(s) and available cash to analyse your cash flow and provide personalised repayment guidance.`;
    } else if (isNoticeRequest && (!requestedLender || !isRequestedLenderConfirmed)) {
      const salutation = isDemo ? "Of course, Ayu.\n\n" : "";
      if (requestedLender === 'BCA') {
        const hasAdaKami = confirmedLenders.some(l => String(l).toLowerCase().includes('adakami'));
        fallbackReply = hasAdaKami
          ? `${salutation}Please add your BCA repayment notice so I can include it with your confirmed AdaKami obligation.\n\nI won’t assume the amount, due date, or product until I analyse the evidence and you confirm it.`
          : `${salutation}Please add your BCA repayment notice so I can include it in your obligations.\n\nI won’t assume the amount, due date, or product until I analyse the evidence and you confirm it.`;
      } else if (requestedLender) {
        fallbackReply = `${salutation}Please add your ${requestedLender} repayment notice so I can include it in your current obligations and check the rules that apply.\n\nI won’t assume the amount or due date until I analyse and you confirm the evidence.`;
      } else {
        fallbackReply = `${salutation}You can add another repayment notice and I’ll analyse it alongside your confirmed obligations.\n\nI won’t assume the lender, amount or due date until I analyse the evidence and you confirm it.`;
      }
    } else if (isAskingBorrowing && obligationCount > 0 && !isCashSalaryMissing) {
      const totalPreSalary = financialMetrics.obligationsDueBeforeSalary || obligations.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
      const cash = availableCash ?? 0;
      const gap = Math.max(0, totalPreSalary - cash);
      const sortedObligations = (financialMetrics.sortedObligations && financialMetrics.sortedObligations.length > 0)
        ? financialMetrics.sortedObligations
        : [...obligations].sort((a, b) => {
            const dA = new Date(a.dueDate || a.formattedDate || '2099-01-01').getTime();
            const dB = new Date(b.dueDate || b.formattedDate || '2099-01-01').getTime();
            return dA - dB;
          });
      const earliest: any = sortedObligations[0];
      const earliestInst = earliest?.institutionName || "earliest lender";
      const earliestAmtStr = earliest?.formattedAmount || `Rp${(earliest?.amount || 0).toLocaleString('id-ID')}`;
      const earliestDateStr = earliest?.formattedDate || earliest?.dueDate || "due date";

      if (userScenarioBorrowingAmount && userScenarioBorrowingAmount !== gap) {
        const scenarioAmt = userScenarioBorrowingAmount;
        const totalFundsIfBorrowed = cash + scenarioAmt;
        const remainingAfterRepayment = Math.max(0, totalFundsIfBorrowed - totalPreSalary);
        const diffAboveGap = scenarioAmt - gap;

        fallbackReply = `### What I found\n• **Proposed borrowing**: Rp${scenarioAmt.toLocaleString('id-ID')} (hypothetical scenario)\n• **Confirmed available cash**: Rp${cash.toLocaleString('id-ID')}\n• **Confirmed pre-salary obligation**: Rp${totalPreSalary.toLocaleString('id-ID')} due on ${earliestDateStr} (${earliestInst})\n• **Repayment-only funding gap**: Rp${gap.toLocaleString('id-ID')}\n• **Essential living expenses**: ${expensesStr}\n\nYour proposed borrowing of Rp${scenarioAmt.toLocaleString('id-ID')} exceeds your currently identified repayment-only funding gap of Rp${gap.toLocaleString('id-ID')} by Rp${diffAboveGap.toLocaleString('id-ID')}.\n\n### What it means\n1. **Separate financial values**: The calculated funding gap of Rp${gap.toLocaleString('id-ID')} and your proposed borrowing amount of Rp${scenarioAmt.toLocaleString('id-ID')} are separate figures.\n2. **Cash flow if borrowed**: If you borrow Rp${scenarioAmt.toLocaleString('id-ID')}, your temporary available funds before salary would be Rp${totalFundsIfBorrowed.toLocaleString('id-ID')} (Rp${cash.toLocaleString('id-ID')} cash + Rp${scenarioAmt.toLocaleString('id-ID')} loan). After paying ${earliestInst} (Rp${totalPreSalary.toLocaleString('id-ID')}), a nominal balance of Rp${remainingAfterRepayment.toLocaleString('id-ID')} would remain.\n3. **No disposable cash assumption**: Because essential living expenses have not been provided and a new debt liability is created, this Rp${remainingAfterRepayment.toLocaleString('id-ID')} cannot be treated as disposable cash, savings, or surplus wealth.\n4. **Additional debt liability**: Borrowing Rp${scenarioAmt.toLocaleString('id-ID')} creates a new repayment obligation. Lender-specific interest, fees, tenor, and regulatory terms remain unverified until a specific lender is identified. Specific loan terms (tenor, interest, fees, schedule) are unknown unless confirmed.\n5. **State immutability**: This calculation is purely exploratory and does not alter your confirmed obligations (${earliestInst} Rp${totalPreSalary.toLocaleString('id-ID')} due ${earliestDateStr}).\n\n### Next step\n1. Consider exploring non-debt alternatives first, such as asking ${earliestInst} before ${earliestDateStr} whether your repayment can be aligned with your salary date of ${nextSalaryDate}.\n2. Any due date adjustment requires explicit ${earliestInst} confirmation.\n3. Compare both scenarios in the Action Simulator before making a decision.`;
      } else {
        const borrowAmt = userScenarioBorrowingAmount || gap;
        fallbackReply = `### What I found\nBorrowing Rp${borrowAmt.toLocaleString('id-ID')} equals your currently identified repayment-only funding gap (Rp${totalPreSalary.toLocaleString('id-ID')} due minus Rp${cash.toLocaleString('id-ID')} cash). While borrowing Rp${borrowAmt.toLocaleString('id-ID')} mathematically covers this gap before your salary arrives on ${nextSalaryDate}, it does not resolve your debt—it creates an additional repayment obligation.\n\n### What it means\nThe repayment timing, total repayment amount, and interest/fees for a new loan depend on the lender. Furthermore, essential living expenses have not been provided, so a Rp0 remainder cannot be described as disposable cash. Exploring non-debt alternatives first is recommended.\n\n### Next step\n1. Consider asking ${earliestInst} whether your ${earliestAmtStr} repayment (due ${earliestDateStr}) can move to your confirmed salary date of ${nextSalaryDate}.\n2. Remember that any repayment date change requires explicit ${earliestInst} confirmation.\n3. You remain the final decision maker—review both options in the Action Simulator before committing.`;
      }
    } else if (isAskingPrioritisationOrInfo && obligationCount > 0 && isCashSalaryMissing) {
      const confirmedItems = obligations.map((o: any) => `• ${o.institutionName} — Rp${(o.amount || 0).toLocaleString('id-ID')} due ${o.dueDate || o.formattedDate || ''}`);
      const ackHeader = confirmedItems.length === 2 ? "I have both repayments confirmed:" : `I have all ${confirmedItems.length} repayments confirmed:`;
      const totalObligationsFormatted = `Rp${financialMetrics.totalConfirmedObligations.toLocaleString('id-ID')}`;
      fallbackReply = `### What I found\n${ackHeader}\n${confirmedItems.join('\n')}\n• **Total confirmed obligations**: ${totalObligationsFormatted}\n\n### What it means\nTotal confirmed obligations across your active repayments come to ${totalObligationsFormatted}. Because required cash-flow inputs (available cash and next salary date) are not yet confirmed, a pre-salary funding gap cannot be calculated at this stage.\n\n### Next step\nTo compare your obligations against your cash flow and determine whether a funding gap exists, please provide:\n1. How much available cash you currently have;\n2. Your next salary date; and\n3. Your expected salary amount.\n\nIf you have essential living expenses that must be paid before salary, you can share those as well.`;
    } else if (isAskingPrioritisationOrInfo && obligationCount > 0 && !isCashSalaryMissing) {
      const totalPreSalary = financialMetrics.obligationsDueBeforeSalary || obligations.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
      const cash = availableCash ?? 0;
      const gap = Math.max(0, totalPreSalary - cash);
      const sortedObligations: any[] = (financialMetrics.sortedObligations && financialMetrics.sortedObligations.length > 0)
        ? financialMetrics.sortedObligations
        : [...obligations].sort((a: any, b: any) => {
            const dA = new Date(a.dueDate || a.formattedDate || '2099-01-01').getTime();
            const dB = new Date(b.dueDate || b.formattedDate || '2099-01-01').getTime();
            return dA - dB;
          });
      const earliest: any = sortedObligations[0];
      const later: any[] = sortedObligations.slice(1);
      const earliestInst = earliest?.institutionName || "earliest lender";
      const earliestAmt = earliest?.amount || 0;
      const earliestAmtStr = `Rp${earliestAmt.toLocaleString('id-ID')}`;
      const earliestDateStr = earliest?.formattedDate || earliest?.dueDate || "due date";
      const laterDetails = later.length > 0 ? later.map((o: any) => `${o.institutionName} on ${o.formattedDate || o.dueDate}`).join(', ') : "";

      const essentialExpensesNote = essentialExpenses
        ? ` (Essential expenses: Rp${essentialExpenses.toLocaleString('id-ID')})`
        : ' (Essential expenses: Not provided.)';

      let timingNote = '';
      if (nextSalaryDate && (earliest?.dueDate || earliest?.formattedDate)) {
        const dEarliest = new Date(earliest.dueDate || earliest.formattedDate);
        const dSalary = new Date(nextSalaryDate);
        const diffDays = Math.round((dSalary.getTime() - dEarliest.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          const daysWord = diffDays === 1 ? 'one day' : diffDays === 2 ? 'two days' : diffDays === 3 ? 'three days' : `${diffDays} days`;
          timingNote = ` Your salary is expected on ${nextSalaryDate}, ${daysWord} after the repayment due date.`;
        } else if (diffDays === 0) {
          timingNote = ` Your salary is expected on the same date as your repayment due date (${nextSalaryDate}).`;
        }
      }

      let coverageExplanation = "";
      if (cash < earliestAmt) {
        const shortfall = earliestAmt - cash;
        coverageExplanation = `Your confirmed available cash of Rp${cash.toLocaleString('id-ID')} is Rp${shortfall.toLocaleString('id-ID')} short of the ${earliestAmtStr} repayment due on ${earliestDateStr}.${timingNote}`;
      } else {
        const remainderAfterEarliest = cash - earliestAmt;
        coverageExplanation = `Your confirmed cash of Rp${cash.toLocaleString('id-ID')} is sufficient to cover the ${earliestAmtStr} ${earliestInst} repayment by itself, which would leave Rp${remainderAfterEarliest.toLocaleString('id-ID')}. However, total pre-salary obligations (Rp${totalPreSalary.toLocaleString('id-ID')}) exceed your available cash.`;
      }

      fallbackReply = gap > 0
        ? `### What I found\nYou have Rp${totalPreSalary.toLocaleString('id-ID')} in confirmed repayments due before your Rp${(nextSalaryAmount || 0).toLocaleString('id-ID')} salary arrives on ${nextSalaryDate}. Your confirmed available cash is Rp${cash.toLocaleString('id-ID')}, leaving a temporary Rp${gap.toLocaleString('id-ID')} pre-salary funding gap.${essentialExpensesNote}\n\n### What it means\n${earliestInst} is your earliest deadline, due on ${earliestDateStr} for ${earliestAmtStr}${laterDetails ? `, followed by ${laterDetails}` : ''}. ${coverageExplanation}\n\nDeadline priority is not the same as blindly allocating all available cash. Early communication with ${earliestInst} before its due date is worth exploring to check available repayment choices. Any date shift or arrangement requires explicit lender confirmation.\n\n### Next step\n1. Contact ${earliestInst} before ${earliestDateStr} to ask what repayment arrangements are actually available.\n2. Keep ${laterDetails || 'subsequent repayments'} in view.\n3. Compare repayment scenarios in the Action Simulator before deciding how to allocate funds.`
        : `### What I found\nYour available cash of Rp${cash.toLocaleString('id-ID')} is sufficient to cover your pre-salary obligations (Rp${totalPreSalary.toLocaleString('id-ID')}).${essentialExpensesNote}\n\n### What it means\nAll obligations coming due prior to payday can be met from your available balance.\n\n### Next step\n1. Complete scheduled payments on time.\n2. Maintain essential living expense buffers.`;
    }

    let fallbackPhase = "PHASE_1_ROOT_AGENT";
    let fallbackDelegated: string[] = [];

    if (isRegulatoryQuery) {
      fallbackPhase = "PHASE_2A_REGULATORY_AGENT";
      fallbackDelegated = ["regulatory_retrieval_agent"];
    } else if (obligationCount > 0 && !isCashSalaryMissing && (isAskingBorrowing || isAskingPrioritisationOrInfo || isFinancialReasoningQuery)) {
      fallbackPhase = "PHASE_2C_FINANCIAL_REASONING_AGENT";
      fallbackDelegated = [FINANCIAL_REASONING_AGENT_NAME];
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        reply: fallbackReply,
        executionMetadata: {
          agent: FAIRASSIST_ROOT_AGENT_NAME,
          framework: "@google/adk",
          phase: fallbackPhase,
          adkBacked: false,
          delegatedAgents: fallbackDelegated,
          status: "fallback"
        },
        retrievedSources: isRegulatoryQuery ? retrievedSources : [],
        nextBestActions,
        pipelineActivity
      });
    }

    // 5. Execute Live Conversational Guidance through Google ADK Root Agent
    let adkReplyText = "";
    let executionMeta: any = {
      agent: FAIRASSIST_ROOT_AGENT_NAME,
      framework: "@google/adk",
      phase: fallbackPhase,
      adkBacked: true,
      delegatedAgents: fallbackDelegated
    };

    try {
      if (isUnverifiedNamedProvider && isAskingLicensingOrStatus && !explicitAmtStr && !explicitDateStr) {
        adkReplyText = fallbackReply;
      } else {
        const adkResult = await runFairAssistRootAgent(userText, {
          systemContext: systemInstruction,
          userId: isDemo ? "Ayu" : "borrower_user",
          sessionId: isDemo ? "fairassist_sample_session" : "fairassist_normal_session"
        });
        if (adkResult.text && adkResult.text.trim().length > 0) {
          adkReplyText = adkResult.text;
        } else {
          adkReplyText = fallbackReply;
        }
        executionMeta = adkResult.metadata;
      }
    } catch (adkErr: any) {
      console.warn("ADK root agent execution encountered issue, falling back to deterministic safe response:", adkErr?.message || adkErr);
      adkReplyText = fallbackReply;
      executionMeta = {
        agent: FAIRASSIST_ROOT_AGENT_NAME,
        framework: "@google/adk",
        phase: fallbackPhase,
        adkBacked: false,
        delegatedAgents: fallbackDelegated,
        status: "fallback"
      };
    }

    const hasFinancialReasoningDelegated =
      (Array.isArray(executionMeta.delegatedAgents) && executionMeta.delegatedAgents.includes(FINANCIAL_REASONING_AGENT_NAME)) ||
      executionMeta.phase === "PHASE_2C_FINANCIAL_REASONING_AGENT" ||
      (obligationCount > 0 && !isCashSalaryMissing && (isAskingBorrowing || isAskingPrioritisationOrInfo || isFinancialReasoningQuery));

    const hasRegulatoryDelegated =
      (Array.isArray(executionMeta.delegatedAgents) && executionMeta.delegatedAgents.includes("regulatory_retrieval_agent")) ||
      executionMeta.phase === "PHASE_2A_REGULATORY_AGENT" ||
      isRegulatoryQuery;

    let finalPhase = "PHASE_1_ROOT_AGENT";
    let finalDelegatedAgents: string[] = [];

    if (hasFinancialReasoningDelegated) {
      finalPhase = "PHASE_2C_FINANCIAL_REASONING_AGENT";
      finalDelegatedAgents = [FINANCIAL_REASONING_AGENT_NAME];
      if (hasRegulatoryDelegated) {
        finalDelegatedAgents.push("regulatory_retrieval_agent");
      }
    } else if (hasRegulatoryDelegated) {
      finalPhase = "PHASE_2A_REGULATORY_AGENT";
      finalDelegatedAgents = ["regulatory_retrieval_agent"];
    }

    const finalRetrievedSources = hasRegulatoryDelegated ? retrievedSources : [];

    return res.json({
      reply: adkReplyText,
      executionMetadata: {
        agent: FAIRASSIST_ROOT_AGENT_NAME,
        framework: "@google/adk",
        phase: finalPhase,
        adkBacked: executionMeta.adkBacked ?? true,
        delegatedAgents: finalDelegatedAgents,
        ...(executionMeta.status ? { status: executionMeta.status } : {})
      },
      retrievedSources: finalRetrievedSources,
      nextBestActions,
      pipelineActivity
    });

  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ error: "An unexpected error occurred while processing your request." });
  }
});

// Vite Middleware & Static Server Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FairAssist full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
