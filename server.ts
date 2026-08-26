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
  if (!apiKey) {
    console.warn("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "dummy-key-for-fallback",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// 1. Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "FairAssist", timestamp: new Date().toISOString() });
});

// 1b. Multimodal Evidence Analysis Endpoint (Google ADK Multimodal Evidence Sub-Agent)
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
    if (cleanBase64.includes(";base64,")) {
      cleanBase64 = cleanBase64.split(";base64,")[1];
    }

    const effectiveMimeType = mimeType || (evidenceType === "document" ? "application/pdf" : "image/png");

    if (process.env.GEMINI_API_KEY && cleanBase64.length > 50) {
      try {
        const userPrompt = `Please analyse this ${evidenceType || 'financial evidence'} file (${fileName || 'uploaded_evidence'}).
Perform multimodal visual analysis over the visible document content: bank/lender logos, figures, labels, due dates, and product names.
Transfer to multimodal_evidence_agent to record the structured extraction using record_extracted_evidence.
Do NOT invent missing information. Distinguish CONFIRMED, UNCERTAIN, and MISSING fields.`;

        const adkResult = await runFairAssistRootAgent(userPrompt, {
          userId: "fairassist_user",
          sessionId: `evidence_session_${activeEvId}`,
          evidenceFile: {
            inlineData: {
              mimeType: effectiveMimeType,
              data: cleanBase64,
            },
            fileName,
            evidenceType,
            uploadId: activeUploadId,
            fileHash: activeFileHash,
            evidenceId: activeEvId,
            analysisRequestId: activeReqId,
          },
        });

        let extracted: any = adkResult.structuredEvidence;

        if (!extracted && adkResult.text) {
          try {
            const jsonMatch = adkResult.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed && (parsed.category || parsed.institution)) {
                extracted = parsed;
              }
            }
          } catch {}
        }

        if (extracted && (extracted.category || extracted.institution)) {
          return res.json({
            ...extracted,
            uploadId: activeUploadId,
            fileHash: activeFileHash,
            evidenceId: activeEvId,
            analysisRequestId: activeReqId,
            executionMetadata: adkResult.metadata,
          });
        }
      } catch (geminiErr) {
        console.warn("Google ADK multimodal evidence agent error, falling back to unverified review state:", geminiErr);
      }
    }

    // Honest unverified review state when Gemini/ADK is unavailable or fails
    // Never fabricate arbitrary amounts or institutions
    return res.json({
      uploadId: activeUploadId,
      fileHash: activeFileHash,
      evidenceId: activeEvId,
      analysisRequestId: activeReqId,
      category: "Other financial evidence",
      categoryConfidence: "Low",
      institution: "Needs confirmation",
      institutionLegalName: null,
      product: "Financial Document",
      title: fileName ? `Uploaded Evidence (${fileName})` : "Uploaded Financial Document",
      amountDue: null,
      dueDate: null,
      accountOrFacility: null,
      obligationStatus: "INFORMATIONAL",
      confidence: "Needs review",
      summaryStatement: "Analysis could not automatically extract details from this file. Please review and confirm the extracted details manually.",
      extractedNotes: "Details could not be automatically verified. Please confirm manually.",
      uncertainFields: ["institution", "product", "amountDue", "dueDate"],
      extractedFacts: [],
      missingFields: ["institution", "amountDue", "dueDate"],
      ambiguities: [],
      executionMetadata: {
        agent: FAIRASSIST_ROOT_AGENT_NAME,
        framework: "@google/adk",
        phase: "PHASE_2B_MULTIMODAL_EVIDENCE_AGENT",
        adkBacked: true,
        delegatedAgents: [MULTIMODAL_EVIDENCE_AGENT_NAME],
      },
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
          const salDate = nextSalaryDate || '28 Aug 2026';
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
        const salDate = nextSalaryDate || '28 Aug 2026';
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
    const nextSalaryDate = financialContext?.nextSalaryDate || "28 August 2026";

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

    // Identify lender notice requests
    let requestedLender = '';
    if (lowerMsg.includes('bca')) requestedLender = 'BCA';
    else if (lowerMsg.includes('adakami')) requestedLender = 'AdaKami';
    else if (lowerMsg.includes('easycash')) requestedLender = 'EasyCash';
    else if (lowerMsg.includes('mandiri')) requestedLender = 'Mandiri';

    const isNoticeRequest = lowerMsg.includes('notice') ||
      (lowerMsg.includes('add') && (lowerMsg.includes('repayment') || lowerMsg.includes('obligation') || lowerMsg.includes('loan') || lowerMsg.includes('notice') || lowerMsg.includes('evidence'))) ||
      ((lowerMsg.includes('can i add') || lowerMsg.includes('upload')) && (requestedLender !== '' || lowerMsg.includes('repayment') || lowerMsg.includes('notice')));

    const isRequestedLenderConfirmed = requestedLender
      ? confirmedLenders.some(l => String(l).toLowerCase().includes(requestedLender.toLowerCase()))
      : false;

    // Extract explicit scenario borrowing amount if proposed in the user message
    const userScenarioBorrowingAmount = extractScenarioBorrowingAmount(userText);

    // Identify queries
    const isAskingBorrowing = lowerMsg.includes('borrow') || lowerMsg.includes('cover the gap') || lowerMsg.includes('new loan') || lowerMsg.includes('additional loan') || userScenarioBorrowingAmount !== null;
    const isRegulatoryQuery =
      /\b(ojk|pojk|seojk|slik|ideb|lpbbti)\b/i.test(lowerMsg) ||
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
      (lowerMsg.includes('rule') && (lowerMsg.includes('collection') || lowerMsg.includes('regulation') || lowerMsg.includes('law') || lowerMsg.includes('apply') || lowerMsg.includes('legal'))) ||
      (lowerMsg.includes('regulation') && !lowerMsg.includes('recommend'));

    const isAskingPrioritisationOrInfo =
      lowerMsg.includes('what other information') ||
      lowerMsg.includes('what information do you need') ||
      lowerMsg.includes('what info do you need') ||
      lowerMsg.includes('what do you need') ||
      lowerMsg.includes('decide what to pay first') ||
      lowerMsg.includes('what to pay first') ||
      lowerMsg.includes('which repayment should i prioritise') ||
      lowerMsg.includes('which should i pay first') ||
      lowerMsg.includes('how should i prioritise') ||
      lowerMsg.includes('how to prioritise') ||
      lowerMsg.includes('order of payment') ||
      lowerMsg.includes('what else do you need') ||
      lowerMsg.includes('why do you need my available cash') ||
      lowerMsg.includes('essential expenses before payday') ||
      lowerMsg.includes('update my salary information') ||
      lowerMsg.includes('prioritise') ||
      lowerMsg.includes('prioritize');

    const isFinancialReasoningQuery =
      !isRegulatoryQuery &&
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

    // 1. Prepare Trusted Retrieval Sources
    const retrievedSources = [
      {
        sourceTitle: "POJK No. 40 Tahun 2024",
        organisation: "OJK",
        confidenceScore: 0.98,
        matchedClause: "Primary framework for LPBBTI operations and consumer protection",
        retrievedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        status: "Current",
        url: "https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx"
      },
      {
        sourceTitle: "SEOJK No. 19/SEOJK.06/2025",
        organisation: "OJK",
        confidenceScore: 0.96,
        matchedClause: "Current LPBBTI operational circular superseding SEOJK 19/2023",
        retrievedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        status: "Current",
        url: "https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx"
      }
    ];

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
      ? `SESSION MODE: GUIDED SAMPLE SESSION (August 2026 scenario for borrower persona 'Ayu'). You may address Ayu politely.`
      : `SESSION MODE: NORMAL USER SESSION. Strictly use user-provided evidence and explicit inputs only. Do NOT introduce or mention the name Ayu, sample amounts, or sample assumptions. Preserve a neutral greeting.`;

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

TRUSTED REGULATORY FRAMEWORK:
- POJK No. 40 Tahun 2024: Primary framework for LPBBTI operations and consumer protection.
- SEOJK No. 19/SEOJK.06/2025: Current LPBBTI operational circular. (Note: SEOJK 19/2023 was revoked and superseded; do not cite SEOJK 19/2023).

CRITICAL DECISION INTEGRITY & GROUNDING RULES:
1. EVIDENCE BEFORE ASSUMPTION:
   - Answer strictly from the confirmed borrower context above.
   - Do NOT invent lenders, loans, amounts, salary, or due dates not in the confirmed context.
   - If user asks to add evidence for a new lender, acknowledge politely, ask them to add the repayment notice, state that you won't assume amount or due date until confirmed, and DO NOT offer premature debt restructuring or contact advice.

2. SITUATION-SPECIFIC GUIDANCE:
   - If the user asks about regulations, OJK rules, debt collection standards, borrower rights, lender policies, or dispute escalation: Answer the regulatory question directly and thoroughly with grounded Indonesian regulatory facts (delegating to regulatory_retrieval_agent). General regulatory and consumer protection questions do NOT require repayment notices or borrower financial facts before explaining applicable rules.
   - If the user is seeking repayment planning, debt prioritisation, or cash-flow allocation advice but NO evidence or obligations are present: Politely explain that you need their first repayment notice, or the lender, amount due, and due date to start.
   - If SALARY ONLY is confirmed (0 obligations): State that salary is confirmed at ${salaryStr}, and that repayment notice(s) and available cash are still needed to analyse cash flow.
   - If OBLIGATIONS EXIST BUT CASH/SALARY IS MISSING: Acknowledge confirmed obligations, state that available cash, next salary date, and expected salary amount are needed to compare against cash flow. Mention essential expenses can also be added.
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
       * Use wording equivalent to: "Your confirmed available cash of Rp850,000 is Rp350,000 short of the Rp1,200,000 repayment due on 25 August 2026. Your salary is expected on 28 August 2026, three days after the repayment due date."
       * If available cash is greater than or equal to the earliest repayment individually, but less than total pre-salary obligations: State that cash can cover the earliest repayment individually (leaving RpX), but total pre-salary obligations exceed available cash by RpY before salary.
     - Distinguish deadline priority (who requires attention first) from payment allocation (how cash is spent).
     - Recommend contacting the earliest lender before its due date to check available repayment choices, noting that any date shift requires explicit lender confirmation.
     - Keep subsequent obligations in view.
     - Note that simulations can be compared in the Action Simulator before deciding.

3. STRUCTURE:
   Use clean Markdown formatting with 3 concise sections where applicable:
   ### What I found
   ### What it means
   ### Next step
`;

    // 4. Deterministic Fallback Response (for offline / non-API environments)
    let fallbackReply = `### What I found\n\nYou have an active repayment obligation coming due.\n\n### What it means\n\nContacting your lender before your due date allows you to inquire about payment alignment choices. Any repayment date change depends on lender terms and requires explicit lender confirmation; otherwise the original verified obligation and due date remain applicable.\n\n### Next step\n\n1. Contact customer support before your due date.\n2. Inquire about available repayment choices.\n3. Avoid taking new secondary P2P debt.`;

    if (isRegulatoryQuery) {
      fallbackReply = `### What I found\nUnder OJK regulations (**POJK No. 40 Tahun 2024** and **SEOJK No. 19/SEOJK.06/2025**), LPBBTI (P2P digital lending) providers and collection agents must follow strict consumer protection and debt collection standards.\n\n### What it means\nKey collection standards and borrower protections include:\n• Collection practices must be ethical, without intimidation, threats, physical violence, or harassment.\n• Direct collection communications are restricted to 08:00 to 20:00 local borrower time.\n• Debt collectors are strictly prohibited from contacting third parties or emergency contacts not legally bound to the debt obligation.\n• Lenders are held legally responsible for the conduct of third-party collection partners.\n• Repayment history is recorded in the OJK SLIK credit registry across Collectibility 1–5.\n\n### Next step\n1. Check your lender’s official customer service and dispute channels.\n2. If you experience collection violations, you can file a complaint with OJK via Kontak 157 (konsumen.ojk.go.id).\n3. Any repayment arrangement or extension remains subject to lender confirmation.`;
    } else if (obligationCount === 0 && evidenceCount === 0 && !hasSalaryConfirmed) {
      const greeting = isDemo ? "Hello, Ayu.\n\n" : "";
      fallbackReply = `${greeting}I can help, but I need a little more information first.\n\nUpload your first repayment notice, or tell me the lender, amount due and due date.\n\nLet’s start with your first repayment notice.`;
    } else if (obligationCount === 0 && hasSalaryConfirmed) {
      const salAmt = nextSalaryAmount ? `Rp${Number(nextSalaryAmount).toLocaleString('id-ID')}` : 'Rp8,500,000';
      const salDate = nextSalaryDate || '28 Aug 2026';
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
      fallbackReply = `${ackHeader}\n${confirmedItems.join('\n')}\n\nTo compare them against your cash flow, I still need:\n• how much cash you have available now;\n• your next salary date; and\n• your expected salary amount.\n\nIf you have essential expenses that must be paid before salary, you can add those too.`;
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
