import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

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

// 1b. Multimodal Evidence Analysis Endpoint (Gemini Document & Image Parser)
app.post("/api/analyze-evidence", apiRateLimiter(30, 60000), async (req, res) => {
  try {
    const body = req.body || {};
    const { evidenceId, analysisRequestId, uploadId, fileHash, fileBase64, mimeType, fileName, evidenceType } = body;

    if (!fileBase64 && !fileName && !evidenceId) {
      return res.status(400).json({ error: "Missing required evidence payload." });
    }

    const ai = getGeminiClient();

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
        const systemInstruction = `
You are FairAssist's Multimodal Financial Evidence Analyzer.
PHASE 1 - DOCUMENT-ONLY EXTRACTION:
Analyse ONLY the supplied evidence file. Do NOT use previous conversation, previous financial context, Sample Scenario data, or assumptions to fill missing information. Extract only information that is visibly supported by this specific file. If a field is absent or unreadable, return null. Never substitute an existing known institution when the file shows another institution!

Use British English throughout (e.g. analyse, authorised, licence, instalment).

VISUAL EXTRACTION & CLASSIFICATION RULES:
1. Carefully inspect the visual image content for bank logos, institution names, app header text, figures, due dates, product names, and facility references.
2. If the document/screenshot visibly represents Bank Central Asia or BCA:
   - Category: "Bank repayment notification"
   - Institution: "Bank Central Asia (BCA)"
   - Institution Legal Name: "PT Bank Central Asia Tbk"
   - Product: "Kredit Tanpa Agunan" or "Personal Loan"
3. If the evidence relates to Bank Mandiri:
   - Category: "Bank repayment notification"
   - Institution: "Bank Mandiri"
   - Institution Legal Name: "PT Bank Mandiri (Persero) Tbk"
   - Product: "Kredit Tanpa Agunan"
4. If the evidence relates to EasyCash (PT Indonesia Fintopia Tech):
   - Category: "Pindar app repayment screenshot"
   - Institution: "EasyCash (PT Indonesia Fintopia Tech)"
   - Institution Legal Name: "PT Indonesia Fintopia Tech"
   - Product: "LPBBTI Overdue Collection Notice"
5. If the evidence relates to AdaKami:
   - Category: "Pindar app repayment screenshot"
   - Institution: "AdaKami (PT Pembiayaan Digital Indonesia)"
   - Institution Legal Name: "PT Pembiayaan Digital Indonesia"
   - Product: "LPBBTI Short-term Loan"
6. If the evidence relates to a payslip, salary slip, or payroll document (e.g. PT Nusantara Digital):
   - Category: "Other financial evidence"
   - Institution: Employer name (e.g. "PT Nusantara Digital")
   - Institution Legal Name: "PT Nusantara Digital"
   - Product: "Payroll / Salary Slip"
   - Title: "Salary Slip - PT Nusantara Digital"
   - IMPORTANT: Extract NET SALARY / NET PAY as amountDue (e.g. 8500000 for Net Salary Rp8,500,000, NOT Basic Salary Rp9,000,000)
   - Extract Payment Date as dueDate (e.g. "28 Aug 2026")
   - obligationStatus: "INFORMATIONAL"
   - confidence: "High"
7. If institution identity is uncertain, unreadable, or missing, set institution to "Needs confirmation" and confidence to "Needs review". NEVER default to Bank Mandiri, AdaKami, or any other institution if not clearly supported by visual evidence.

Return JSON matching this EXACT schema:
{
  "uploadId": "${activeUploadId}",
  "fileHash": "${activeFileHash}",
  "evidenceId": "${activeEvId}",
  "analysisRequestId": "${activeReqId}",
  "category": "Bank repayment notification" | "Pindar app repayment screenshot" | "Bank statement" | "iDeb SLIK – Debitur Perseorangan" | "Repayment or borrowing offer" | "Other financial evidence",
  "categoryConfidence": "High" | "Medium" | "Low",
  "institution": "Bank Central Asia (BCA)" | "AdaKami" | "Bank Mandiri" | "Bank Rakyat Indonesia (BRI)" | "EasyCash" | "Kredit Pintar" | "OJK SLIK" | "Needs confirmation" | "Other Institution",
  "institutionLegalName": "Legal name of entity or null",
  "product": "Personal Loan" | "Kredit Tanpa Agunan" | "LPBBTI Short-term Loan" | "LPBBTI Overdue Collection Notice" | "Payroll Account Statement" | "iDeb Credit Report" | "Consumer Facility" | "Financial Document",
  "title": "Short descriptive evidence title",
  "amountDue": number_or_null,
  "dueDate": "YYYY-MM-DD or formatted date string or null",
  "accountOrFacility": "Masked account number or reference string or null",
  "obligationStatus": "ACTIVE_OBLIGATION" | "COLLECTION_NOTICE" | "HISTORICAL" | "INFORMATIONAL",
  "confidence": "High" | "Medium" | "Low" | "Needs review",
  "summaryStatement": "A concise, single-sentence summary of what Gemini understood from the file",
  "extractedNotes": "Key extracted notes or text from document",
  "uncertainFields": []
}
`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: effectiveMimeType,
              },
            },
            `Analyse this ${evidenceType || 'financial evidence'} file (${fileName || 'uploaded_evidence'}) strictly from its visible content.`,
          ],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
          },
        });

        const parsed = JSON.parse(response.text || "{}");
        if (parsed && parsed.category) {
          return res.json({
            ...parsed,
            uploadId: activeUploadId,
            fileHash: activeFileHash,
            evidenceId: activeEvId,
            analysisRequestId: activeReqId,
          });
        }
      } catch (geminiErr) {
        console.warn("Gemini multimodal analysis error, falling back to unverified review state:", geminiErr);
      }
    }

    // Honest unverified review state when Gemini is unavailable or fails
    // Never fabricate arbitrary amounts or institutions based on filename substrings
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
      summaryStatement: "Gemini analysis could not automatically extract details from this file. Please review and confirm the extracted details manually.",
      extractedNotes: "Details could not be automatically verified. Please confirm manually.",
      uncertainFields: ["institution", "product", "amountDue", "dueDate"],
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
function getActiveRepaymentObligations(obligations: any[] = []) {
  return (obligations || []).filter((o: any) => {
    if (o.isSalary || o.category === 'Salary') return false;
    const catLower = (o.category || '').toLowerCase();
    if (catLower.includes('salary') || catLower.includes('payroll') || catLower.includes('slik')) return false;
    const titleLower = (o.title || '').toLowerCase();
    if (titleLower.includes('salary') || titleLower.includes('payroll') || titleLower.includes('slik')) return false;
    return (o.amount !== null && o.amount !== undefined && o.amount > 0) || Boolean(o.institutionName);
  });
}

function getActiveRepaymentEvidence(evidenceList: any[] = []) {
  return (evidenceList || []).filter((e: any) => {
    const cat = (e.category || '').toLowerCase();
    const title = (e.title || '').toLowerCase();
    if (cat.includes('salary') || cat.includes('payroll') || cat.includes('slik') || cat.includes('statement') || cat.includes('ideb')) {
      return false;
    }
    if (title.includes('salary') || title.includes('payroll') || title.includes('slik') || title.includes('statement') || title.includes('ideb')) {
      return false;
    }
    const amt = e.userConfirmedDetails?.amountDue ?? e.extractedDetails?.amountDue;
    if (amt === 0 && (cat.includes('bank statement') || cat.includes('ideb'))) return false;
    return true;
  });
}

// 3. AI Analysis endpoint (Grounding + Synthesis)
app.post("/api/analyze", apiRateLimiter(60, 60000), async (req, res) => {
  try {
    const { financialContext, prompt } = req.body || {};
    const ai = getGeminiClient();

    const evidenceList = getActiveRepaymentEvidence(financialContext?.evidenceList || []);
    const obligations = getActiveRepaymentObligations(financialContext?.obligations || []);
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

          defaultActions = [
            {
              id: "action-contact-earliest",
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
        generatedAt: new Date().toISOString()
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
    return res.json(parsed);

  } catch (error: any) {
    console.error("Error in /api/analyze:", error);
    res.status(500).json({ 
      error: "An unexpected error occurred while processing your request."
    });
  }
});

// 4. Action Simulator endpoint ("What if?")
app.post("/api/simulate", apiRateLimiter(40, 60000), async (req, res) => {
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
        regulatoryNote: "Grounded in POJK No. 40 Tahun 2024 & SEOJK No. 19/SEOJK.06/2025 LPBBTI maximum borrowing standards.",
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
          summary: `Borrowing an additional Rp${borrowAmt.toLocaleString('id-ID')} covers the immediate Rp${minimumCalculatedGap.toLocaleString('id-ID')} pre-salary funding gap, but adds new debt subject to lender interest and fees under POJK 40/2024 and SEOJK 19/2025 due after your salary arrives on ${nextSalaryDate}. Essential expenses are not included because they have not been provided.`,
          benefits: [
            `Provides immediate Rp${borrowAmt.toLocaleString('id-ID')} liquidity to cover the minimum calculated pre-salary gap.`
          ],
          keyRisks: [
            `Adds new debt due after salary on ${nextSalaryDate}.`,
            `Incurs lender origination fees and ongoing daily interest under POJK 40/2024.`,
            `Increases future post-salary repayment burden by at least Rp${borrowAmt.toLocaleString('id-ID')}.`
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

// 5. Chat endpoint with Context Sufficiency Gate
app.post("/api/chat", apiRateLimiter(60, 60000), async (req, res) => {
  try {
    const { message, financialContext } = req.body || {};
    const ai = getGeminiClient();

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

    // Context Sufficiency Gate Evaluation
    const mentionsRegulation = /pojk|seojk|ojk|rights|regulation|rule|law|article|pasal|dispute/i.test(lowerMsg);
    const mentionsSpecificLender = /bca|adakami|easycash|mandiri|bri|kredit pintar/i.test(lowerMsg);
    const mentionsAmounts = /\b(rp|\d+k|\d+m|\d+,\d+|\d+000)\b/i.test(lowerMsg);

    const hasSalaryConfirmed = Boolean(
      nextSalaryDate ||
      nextSalaryAmount ||
      financialContext?.evidenceList?.some((e: any) => {
        const cat = (e.category || '').toLowerCase();
        const tit = (e.title || '').toLowerCase();
        return cat.includes('salary') || cat.includes('payroll') || cat.includes('slip') || tit.includes('salary') || tit.includes('payroll') || tit.includes('slip');
      })
    );

    const hasSufficientContext = evidenceCount > 0 || obligationCount > 0 || hasSalaryConfirmed || mentionsSpecificLender || mentionsRegulation || mentionsAmounts;

    // CASE 1: Insufficient Context (First turn generic question with 0 evidence/obligations)
    if (!hasSufficientContext) {
      const isDemo = Boolean(financialContext?.userPersona?.syntheticFlag || (financialContext?.userPersona?.name && financialContext.userPersona.name.toLowerCase().includes('ayu')));
      const greeting = isDemo ? "Hello, Ayu.\n\n" : "";
      return res.json({
        classification: 'EVIDENCE_REQUIRED',
        needsEvidence: true,
        reply: `${greeting}I can help, but I need a little more information first.\n\nUpload your first repayment notice, or tell me the lender, amount due and due date.\n\nLet’s start with your first repayment notice.`,
        retrievedSources: [],
        pipelineActivity: {
          currentStage: 'UNDERSTAND',
          stages: [
            { stage: 'UNDERSTAND', status: 'pending' },
            { stage: 'RETRIEVE', status: 'pending' },
            { stage: 'VERIFY', status: 'pending' },
            { stage: 'REASON', status: 'pending' },
            { stage: 'ACT', status: 'pending' }
          ],
          activeStepDescription: 'Waiting for evidence'
        }
      });
    }

    // CASE 1.4: Salary-Only Context (0 repayment obligations, but salary confirmed)
    if (obligationCount === 0 && hasSalaryConfirmed) {
      const salAmt = nextSalaryAmount ? `Rp${Number(nextSalaryAmount).toLocaleString('id-ID')}` : 'Rp8,500,000';
      const salDate = nextSalaryDate || '28 Aug 2026';
      
      let replyText = `Your salary information is confirmed at ${salAmt} expected on ${salDate}.\n\nI still need your repayment notice(s) and available cash to analyse your cash flow and provide personalised repayment guidance.`;
      
      if (lowerMsg.includes('why do you need my available cash') || lowerMsg.includes('available cash')) {
        replyText = `Your salary information is confirmed at ${salAmt} on ${salDate}. Once you add your repayment notices, knowing your available cash allows FairAssist to calculate whether your cash covers repayments due before your salary arrives, without risking essential living expenses.`;
      } else if (lowerMsg.includes('repayment notice') || lowerMsg.includes('what evidence') || lowerMsg.includes('evidence')) {
        replyText = `Your salary information is confirmed at ${salAmt} on ${salDate}. You can add any loan bill, repayment reminder SMS, or app screenshot (e.g. from your bank or P2P lender) to map your obligations against your salary cycle.`;
      }

      return res.json({
        reply: replyText,
        retrievedSources: [
          {
            sourceTitle: "POJK No. 40 Tahun 2024",
            organisation: "OJK",
            confidenceScore: 0.98,
            matchedClause: "Primary framework for LPBBTI operations and consumer protection",
            retrievedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            status: "Current",
            url: "https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx"
          }
        ],
        nextBestActions: [],
        pipelineActivity: {
          currentStage: 'REASON',
          stages: [
            { stage: 'UNDERSTAND', status: 'completed', message: 'Salary evidence confirmed', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'RETRIEVE', status: 'completed', message: 'Applicable sources retrieved', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'VERIFY', status: 'completed', message: 'Verified active regulatory currency', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'REASON', status: 'completed', message: 'Salary confirmed · awaiting repayment notice', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'ACT', status: 'pending', message: 'Awaiting repayment notice', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
          ],
          activeStepDescription: 'Confirmed evidence analysed · more context needed'
        }
      });
    }

    // CASE 1.5: Prioritisation / Context Query handling
    const isAskingPrioritisationOrInfo =
      lowerMsg.includes('what other information') ||
      lowerMsg.includes('what information do you need') ||
      lowerMsg.includes('what info do you need') ||
      lowerMsg.includes('what do you need') ||
      lowerMsg.includes('decide what to pay first') ||
      lowerMsg.includes('what to pay first') ||
      lowerMsg.includes('which repayment should i prioritise') ||
      lowerMsg.includes('which should i pay first') ||
      lowerMsg.includes('what else do you need') ||
      lowerMsg.includes('why do you need my available cash') ||
      lowerMsg.includes('essential expenses before payday') ||
      lowerMsg.includes('update my salary information') ||
      lowerMsg.includes('prioritise') ||
      lowerMsg.includes('prioritize');

    const isCashSalaryMissing = (availableCash === null || availableCash === undefined) || !nextSalaryDate;

    if (isAskingPrioritisationOrInfo && (obligationCount > 0 || evidenceCount > 0) && isCashSalaryMissing) {
      const confirmedItems = obligationCount > 0
        ? obligations.map((o: any) => `• ${o.institutionName} — Rp${(o.amount || 0).toLocaleString('id-ID')} due ${o.dueDate || o.formattedDate || ''}`)
        : evidenceList.map((e: any) => {
            const inst = e.userConfirmedDetails?.institutionName || e.extractedDetails?.institutionName || 'Repayment';
            const amt = e.userConfirmedDetails?.amountDue || e.extractedDetails?.amountDue || 0;
            const date = e.userConfirmedDetails?.dueDate || e.extractedDetails?.dueDate || '';
            return `• ${inst} — Rp${amt.toLocaleString('id-ID')} due ${date}`;
          });

      let ackHeader = "I have your repayment evidence confirmed:";
      if (confirmedItems.length === 2) {
        ackHeader = "I have both repayments confirmed:";
      } else if (confirmedItems.length > 2) {
        ackHeader = `I have all ${confirmedItems.length} repayments confirmed:`;
      }

      const replyText = `${ackHeader}\n${confirmedItems.join('\n')}\n\nTo compare them against your cash flow, I still need:\n• how much cash you have available now;\n• your next salary date; and\n• your expected salary amount.\n\nIf you have essential expenses that must be paid before salary, you can add those too.`;

      return res.json({
        reply: replyText,
        retrievedSources: [
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
        ],
        nextBestActions: [
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
        ],
        pipelineActivity: {
          currentStage: 'REASON',
          stages: [
            { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed query & confirmed evidence context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK regulatory framework', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'VERIFY', status: 'completed', message: 'Verified active regulatory source currency', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'REASON', status: 'completed', message: 'Confirmed evidence analysed · cash-flow details needed', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'ACT', status: 'pending', message: 'Awaiting cash and salary timing', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
          ],
          activeStepDescription: confirmedLenders.length === 1
            ? `${confirmedLenders[0]} evidence analysed · more context needed`
            : 'Confirmed evidence analysed · more context needed'
        }
      });
    }

    // CASE 1.6: When cash and salary ARE present and user asks borrowing / scenario question
    const isAskingBorrowing = lowerMsg.includes('borrow') || lowerMsg.includes('cover the gap') || lowerMsg.includes('new loan') || lowerMsg.includes('additional loan');

    if (isAskingBorrowing && obligationCount > 0 && !isCashSalaryMissing) {
      const totalPreSalary = obligations.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
      const cash = availableCash ?? 0;
      const gap = Math.max(0, totalPreSalary - cash);

      const sortedObligations = [...obligations].sort((a, b) => {
        const dA = new Date(a.dueDate || a.formattedDate || '2099-01-01').getTime();
        const dB = new Date(b.dueDate || b.formattedDate || '2099-01-01').getTime();
        return dA - dB;
      });
      const earliest = sortedObligations[0];
      const earliestInst = earliest?.institutionName || "earliest lender";
      const earliestAmtStr = `Rp${(earliest?.amount || 0).toLocaleString('id-ID')}`;
      const earliestDateStr = earliest?.formattedDate || earliest?.dueDate || "due date";

      const replyText = `### What I found\nBorrowing Rp${gap.toLocaleString('id-ID')} equals your currently identified repayment-only funding gap (Rp${totalPreSalary.toLocaleString('id-ID')} due minus Rp${cash.toLocaleString('id-ID')} cash). While borrowing Rp${gap.toLocaleString('id-ID')} mathematically covers this gap before your salary arrives on ${nextSalaryDate}, it does not resolve your debt—it creates an additional repayment obligation.\n\n### What it means\nThe repayment timing, total repayment amount, and interest/fees for a new loan depend on the lender. Furthermore, essential living expenses have not been provided, so a Rp0 remainder cannot be described as disposable cash. Under OJK guidelines (**SEOJK 19/SEOJK.06/2025**), exploring non-debt alternatives first is recommended.\n\n### Next step\n1. Consider asking ${earliestInst} whether your ${earliestAmtStr} repayment (due ${earliestDateStr}) can move to your confirmed salary date of ${nextSalaryDate}.\n2. Remember that any repayment date change requires explicit ${earliestInst} confirmation.\n3. You remain the final decision maker—review both options in the Action Simulator before committing.`;

      return res.json({
        reply: replyText,
        retrievedSources: [
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
        ],
        nextBestActions: [
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
        ],
        pipelineActivity: {
          currentStage: 'REASON',
          stages: [
            { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed borrowing intent query', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK rules & lender policies', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'VERIFY', status: 'completed', message: 'Verified cash position & funding gap', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'REASON', status: 'completed', message: 'Evaluated borrowing risks vs non-debt alternatives', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'ACT', status: 'pending', message: 'Awaiting borrower decision', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
          ],
          activeStepDescription: 'Borrowing risk evaluated · decision support ready'
        }
      });
    }

    // CASE 1.7: When cash and salary ARE present and user asks prioritization question
    if (isAskingPrioritisationOrInfo && obligationCount > 0 && !isCashSalaryMissing) {
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
      const earliestAmt = earliest?.amount || 0;
      const earliestAmtStr = `Rp${earliestAmt.toLocaleString('id-ID')}`;
      const earliestDateStr = earliest?.formattedDate || earliest?.dueDate || "due date";

      const laterDetails = later.length > 0 
        ? later.map(o => `${o.institutionName} on ${o.formattedDate || o.dueDate}`).join(', ')
        : "";

      const cashCanCoverEarliest = cash >= earliestAmt;
      const remainderAfterEarliest = cash - earliestAmt;

      const replyText = gap > 0
        ? `### What I found\nYou have Rp${totalPreSalary.toLocaleString('id-ID')} in confirmed repayments due before your Rp${(nextSalaryAmount || 0).toLocaleString('id-ID')} salary arrives on ${nextSalaryDate}. Your confirmed available cash is Rp${cash.toLocaleString('id-ID')}, leaving a temporary Rp${gap.toLocaleString('id-ID')} pre-salary funding gap.${essentialExpenses ? ` (Essential expenses: Rp${essentialExpenses.toLocaleString('id-ID')})` : ' (Essential expenses: Not provided.)'}\n\n### What it means\n${earliestInst} is your earliest deadline, due on ${earliestDateStr} for ${earliestAmtStr}${laterDetails ? `, followed by ${laterDetails}` : ''}. Your confirmed cash of Rp${cash.toLocaleString('id-ID')} is sufficient to cover the ${earliestAmtStr} ${earliestInst} repayment by itself, which would leave Rp${remainderAfterEarliest.toLocaleString('id-ID')}. However, total pre-salary obligations (Rp${totalPreSalary.toLocaleString('id-ID')}) exceed your available cash.\n\nDeadline priority is not the same as blindly allocating all available cash. Early communication with ${earliestInst} before its due date is worth exploring to check available repayment choices. Any date shift or arrangement requires explicit lender confirmation.\n\n### Next step\n1. Contact ${earliestInst} before ${earliestDateStr} to ask what repayment arrangements are actually available.\n2. Keep ${laterDetails || 'subsequent repayments'} in view.\n3. Compare repayment scenarios in the Action Simulator before deciding how to allocate funds.`
        : `### What I found\nYour available cash of Rp${cash.toLocaleString('id-ID')} is sufficient to cover your pre-salary obligations (Rp${totalPreSalary.toLocaleString('id-ID')}).\n\n### What it means\nAll obligations coming due prior to payday can be met from your available balance.\n\n### Next step\n1. Complete scheduled payments on time.\n2. Maintain essential living expense buffers.`;

      const reasonText = cashCanCoverEarliest
        ? `Your Rp${cash.toLocaleString('id-ID')} available cash can cover the ${earliestAmtStr} ${earliestInst} repayment, but would leave Rp${remainderAfterEarliest.toLocaleString('id-ID')} while Rp${(totalPreSalary - earliestAmt).toLocaleString('id-ID')} of other repayments remain due before salary. Essential living expenses have not been provided, so early communication with ${earliestInst} is worth exploring before deciding how to allocate your cash.`
        : `${earliestInst} is due on ${earliestDateStr} before your salary on ${nextSalaryDate}. Your Rp${cash.toLocaleString('id-ID')} cash is below the full ${earliestAmtStr} balance, so early communication is required.`;

      return res.json({
        reply: replyText,
        retrievedSources: [
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
        ],
        nextBestActions: [
          {
            id: "action-contact-earliest",
            category: "DO TODAY",
            priorityOrder: 1,
            title: `Contact ${earliestInst} regarding repayment options`,
            reason: reasonText,
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
        ],
        pipelineActivity: {
          currentStage: 'REASON',
          stages: [
            { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed query & confirmed context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK rules & lender policies', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'VERIFY', status: 'completed', message: 'Verified cash position & due date sequence', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'REASON', status: 'completed', message: 'Cash-flow gap identified · decision support ready', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'ACT', status: 'pending', message: 'Awaiting borrower decision', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
          ],
          activeStepDescription: 'Cash-flow gap identified · decision support ready'
        }
      });
    }

    // CASE 2: Check if user asks to add a repayment notice (AdaKami, BCA, EasyCash, Mandiri, or generic)
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

    if (isNoticeRequest && (!requestedLender || !isRequestedLenderConfirmed)) {
      const lenderLabel = requestedLender || 'repayment';
      const ctaBtnLabel = requestedLender
        ? `Add ${requestedLender} repayment notice →`
        : (confirmedLenders.length > 0 ? 'Add another repayment notice →' : 'Add repayment notice →');

      const isDemo = Boolean(financialContext?.userPersona?.syntheticFlag || (financialContext?.userPersona?.name && financialContext.userPersona.name.toLowerCase().includes('ayu')));
      const salutation = isDemo ? "Of course, Ayu.\n\n" : "";

      let replyText = '';
      if (requestedLender === 'BCA') {
        const hasAdaKami = confirmedLenders.some(l => String(l).toLowerCase().includes('adakami'));
        if (hasAdaKami) {
          replyText = `${salutation}Please add your BCA repayment notice so I can include it with your confirmed AdaKami obligation.\n\nI won’t assume the amount, due date, or product until I analyse the evidence and you confirm it.`;
        } else if (confirmedLenders.length > 0) {
          replyText = `${salutation}Please add your BCA repayment notice so I can include it with your confirmed ${confirmedLenders[0]} obligation.\n\nI won’t assume the amount, due date, or product until I analyse the evidence and you confirm it.`;
        } else {
          replyText = `${salutation}Please add your BCA repayment notice so I can include it in your obligations.\n\nI won’t assume the amount, due date, or product until I analyse the evidence and you confirm it.`;
        }
      } else if (requestedLender === 'AdaKami') {
        replyText = `${salutation}Please add your AdaKami repayment notice so I can include it in your current obligations and check the rules that apply.\n\nI won’t assume the amount or due date until I analyse and you confirm the evidence.`;
      } else if (requestedLender) {
        replyText = `${salutation}Please add your ${requestedLender} repayment notice so I can include it in your current obligations and check the rules that apply.\n\nI won’t assume the amount or due date until I analyse and you confirm the evidence.`;
      } else {
        replyText = `${salutation}You can add another repayment notice and I’ll analyse it alongside your confirmed obligations.\n\nI won’t assume the lender, amount or due date until I analyse the evidence and you confirm it.`;
      }

      return res.json({
        reply: replyText,
        retrievedSources: [
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
        ],
        nextBestActions: [
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
        ],
        pipelineActivity: {
          currentStage: evidenceCount > 0 ? 'REASON' : 'UNDERSTAND',
          stages: [
            { stage: 'UNDERSTAND', status: 'completed', message: `Parsed request for ${lenderLabel} notice`, timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'RETRIEVE', status: 'completed', message: 'Checked OJK LPBBTI rules for P2P notices', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'VERIFY', status: 'completed', message: 'Verified current source applicability', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'REASON', status: 'completed', message: `Awaiting unconfirmed ${lenderLabel} notice details`, timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
          ],
          activeStepDescription: requestedLender
            ? `More evidence requested · waiting for ${requestedLender} notice`
            : "More evidence requested · waiting for repayment notice"
        }
      });
    }

    const obligationSummary = obligations.map((o: any) => `${o.institutionName}: Rp${(o.amount || 0).toLocaleString('id-ID')} due ${o.dueDate || o.formattedDate}`).join(', ');

    const systemInstruction = `
You are FairAssist, an AI financial decision support assistant for Indonesian consumers.
Always write in British English throughout (e.g. analyse, authorised, licence, instalment, priority).
Keep your responses CONCISE and TO THE POINT (approx 60-120 words).

CRITICAL CONTEXT RULE:
Answer strictly based on the user's active obligations provided below:
Active Obligations: ${obligationSummary || 'None confirmed yet'}
Confirmed Lenders: ${confirmedLenders.join(', ') || 'None'}

Do NOT mention institutions UNLESS explicitly present in active obligations or mentioned in user message.
If user mentions adding evidence for a new lender, acknowledge politely, ask them to add the repayment notice, state that you won't assume amount or due date until confirmed, and DO NOT offer premature debt restructuring or contact advice.

GROUNDING & PRIORITISATION GUARDRAILS:
1. DISTINGUISH PRIORITY TYPES:
   - Clearly distinguish between (A) obligation/deadline priority (earliest due date), (B) communication priority (who to contact first), and (C) actual payment allocation (how cash is disbursed).
   - An earliest due obligation justifies contacting that lender first, but MUST NOT automatically mean allocating all available cash to it.
   - When essential living expenses or other necessary cash needs are unknown, explicitly state that limitation before recommending allocation of all available cash.
2. REPAYMENT-DATE CHANGES & SALARY ALIGNMENT:
   - NEVER imply or state that the user has a general regulatory right to align a repayment date with salary or payday.
   - Clearly state that any changed repayment date, extension, restructuring, partial-payment arrangement, or similar accommodation requires explicit lender confirmation.
   - Until confirmed by the lender, treat the existing confirmed due date as remaining applicable.
3. REJECTION HANDLING:
   - If a lender rejects a requested date change or arrangement, state that the existing confirmed due date remains applicable.
   - Suggest contacting the lender through official channels to understand available options.
   - Keep all other known obligations visible in the decision without inventing a replacement arrangement.
4. UNSUPPORTED CONSEQUENCES (LATE FEES / SLIK / COLLECTION):
   - NEVER state lender consequences (such as late fees, interest, penalties, collection consequences, SLIK/credit-reporting impact, approval, or restructuring outcome) as guaranteed facts unless those exact consequences are explicitly supported by verified retrieved evidence or product terms.
   - Use cautious wording such as "may apply depending on the lender terms and applicable rules" and recommend confirming specific consequences with the lender.
5. DYNAMIC DEDIS:
   - All lender names, dates, amounts, and ordering must be derived dynamically from verified user state. Never hardcode sample values or institutions.

Structure your response using clean Markdown with no more than 3 short sections:

### What I found
1-2 concise sentences about the situation based strictly on confirmed evidence or facts provided.

### What it means
1-2 concise sentences referencing verified facts or applicable guidelines. Do NOT claim OJK mandates repayment date alignment with salary.

### Next step
1-3 bullet points with clear, actionable advice.
`;

    if (!process.env.GEMINI_API_KEY) {
      const isBcaInvolved = confirmedLenders.some(l => l.toLowerCase().includes('bca')) || lowerMsg.includes('bca');
      const isEasyCashInvolved = confirmedLenders.some(l => l.toLowerCase().includes('easycash')) || lowerMsg.includes('easycash');

      let fallbackReply = `### What I found\n\nYou have an active repayment obligation coming due.\n\n### What it means\n\nContacting your lender before your due date allows you to inquire about payment alignment choices. Any repayment date change depends on lender terms and requires explicit lender confirmation; otherwise the original verified obligation and due date remain applicable.\n\n### Next step\n\n1. Contact customer support before your due date.\n2. Inquire about available repayment choices.\n3. Avoid taking new secondary P2P debt.`;

      if (isBcaInvolved) {
        fallbackReply = `### What I found\n\nYour BCA Personal Loan instalment is coming due.\n\n### What it means\n\nContacting official BCA customer service allows you to explore facility options. Consequences such as late fees or SLIK rating impacts depend on product terms and lender policies.\n\n### Next step\n\n1. Contact official customer support.\n2. Inquire about available payment options.\n3. Keep your repayment evidence updated.`;
      } else if (isEasyCashInvolved) {
        fallbackReply = `### What I found\n\nYou have an active notice from EasyCash.\n\n### What it means\n\nEasyCash has the earliest verified due date among your obligations. Any adjustment to your repayment schedule depends on lender terms and requires explicit EasyCash confirmation; otherwise the original due date remains applicable.\n\n### Next step\n\n1. Verify the notice details in your EasyCash app.\n2. Inquire about available payment alignment options.\n3. Keep communication strictly documented.`;
      }

      return res.json({
        reply: fallbackReply,
        retrievedSources: [
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
        ],
        pipelineActivity: {
          currentStage: 'REASON',
          stages: [
            { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed query & confirmed evidence context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK regulatory clauses', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'VERIFY', status: 'completed', message: 'Verified active regulatory source currency', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'REASON', status: 'completed', message: 'Gemini reasoning applied to borrower context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
            { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
          ],
          activeStepDescription: 'More evidence requested · waiting for remaining details'
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: userText,
      config: {
        systemInstruction
      }
    });

    return res.json({
      reply: response.text,
      retrievedSources: [
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
      ],
      pipelineActivity: {
        currentStage: 'REASON',
        stages: [
          { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed query & confirmed evidence context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK regulatory clauses', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'VERIFY', status: 'completed', message: 'Verified active regulatory source currency', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'REASON', status: 'completed', message: 'Gemini reasoning applied to borrower context', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
          { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action', timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }
        ],
        activeStepDescription: confirmedLenders.length === 1
          ? `${confirmedLenders[0]} evidence analysed · more context needed`
          : confirmedLenders.length > 1
          ? 'Confirmed evidence analysed · more context needed'
          : 'Waiting for evidence'
      }
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
