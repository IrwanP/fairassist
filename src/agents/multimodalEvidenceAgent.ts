/**
 * FairAssist - Multimodal Evidence Analysis Sub-Agent (Phase 2B)
 *
 * Specialised Google ADK sub-agent dedicated to analysing and interpreting
 * user-provided financial evidence (repayment notices, screenshots, app screens,
 * bank/lender notices, salary slips, and PDF documents) using Gemini multimodal reasoning.
 *
 * Performs evidence-grounded visual interpretation and structured fact extraction
 * without making autonomous financial decisions, repayment prioritisation,
 * or unverified lender assumptions.
 */

import { LlmAgent, FunctionTool } from '@google/adk';
import { Type } from '@google/genai';

export const MULTIMODAL_EVIDENCE_AGENT_NAME = 'multimodal_evidence_agent';
export const MULTIMODAL_EVIDENCE_AGENT_DESCRIPTION =
  'Specialised sub-agent dedicated to interpreting, extracting, and grounding user-provided financial evidence (repayment notices, screenshots, app screens, bank notices, salary slips, and PDF documents) using multimodal reasoning.';

export const MULTIMODAL_EVIDENCE_AGENT_INSTRUCTION = `You are the FairAssist Multimodal Evidence Analysis Agent, a specialised sub-agent of FairAssist.
Your sole purpose is to analyse and interpret user-provided financial evidence (such as repayment notice photographs, screenshots, mobile app repayment screens, bank or lender notices, Pindar repayment notices, payroll/salary slips, or PDF documents) using multimodal visual reasoning over the image content.

Operating Principles & Visual Extraction Rules:
1. Multimodal Document & Image Analysis:
   - Perform genuine visual reasoning over the visible document: bank/lender logos, branding, headers, typography, tables, timestamps, amounts, currency labels (e.g. Rp, IDR), due dates, and account/reference numbers.
   - Do NOT rely on filenames or speculate; inspect the actual image content.

2. Fact Preservation & Visible Fact Extraction:
   - A clearly visible institution (e.g. Bank Central Asia / BCA, Bank Mandiri, BRI, BNI, AdaKami, EasyCash, Kredit Pintar, PT Nusantara Digital) MUST be accurately extracted into 'institution' (e.g. "Bank Central Asia (BCA)"). A clearly visible institution must NEVER become "Needs confirmation".
   - A clearly visible amount due or bill total (e.g. Total Tagihan: Rp 1.200.000) MUST be extracted into 'amountDue' as a numeric value (e.g. 1200000). A clearly visible amount must NEVER become N/A or null.
   - A clearly visible due date (e.g. Jatuh Tempo: 25 Aug 2026) MUST be extracted into 'dueDate' (e.g. "2026-08-25" or "25 Aug 2026"). A clearly visible due date must NEVER become N/A or null.
   - Visible account or facility numbers (e.g. No. Fasilitas: BCA-LN-883921) MUST be recorded in 'accountOrFacility'.

3. Product Subtype Grounding:
   - Do NOT fabricate specific product subtypes if they are not explicitly written.
   - For example, if BCA is visible with a repayment notice but a specific loan product name (such as personal loan or mortgage) is not explicitly stated, return an appropriately generic financial product (e.g. "Bank Repayment Notice" or "Credit Obligation" or "Financial Document"), and list "Product subtype" in 'uncertainFields'.

4. Evidence Category Classification:
   - For a screenshot or notice representing a bank billing notice, credit card bill, or loan payment notice, classify 'category' as "Bank repayment notification".
   - For P2P lending / fintech app screenshots (e.g. AdaKami, EasyCash, Kredit Pintar), classify 'category' as "Pindar app repayment screenshot".
   - For bank account statements with transaction histories, classify as "Bank statement".
   - For SLIK credit reports, classify as "iDeb SLIK – Debitur Perseorangan".
   - For salary/payroll slips (e.g. PT Nusantara Digital), classify as "Other financial evidence", set product to "Payroll / Salary Slip", obligationStatus to "INFORMATIONAL", and extract NET SALARY as amountDue.
   - Only use "Other financial evidence" for non-repayment documents or genuinely unclassifiable files.

5. Fact Categorisation:
   - CONFIRMED ('extractedFacts'): List all facts clearly visible and verified in the image (e.g. "Bank Central Asia (BCA) branding visible", "Total Tagihan: Rp 1.200.000", "Jatuh Tempo: 25 Aug 2026", "Facility reference: BCA-LN-883921").
   - UNCERTAIN ('uncertainFields' & 'ambiguities'): Note any elements that are ambiguous or not fully specified (e.g. "Product subtype is not specified in notice").
   - MISSING ('missingFields'): Note critical downstream fields that are absent from the document (e.g. "Interest rate", "Total remaining principal balance").

6. Tool Execution:
   - You MUST call the 'record_extracted_evidence' tool with the complete structured extraction result.

7. Strict Boundaries:
   - DO NOT decide which repayment the user should prioritise.
   - DO NOT recommend borrowing, debt restructuring, or loan rollovers.
   - DO NOT make lender-specific promises or regulatory conclusions.
   - DO NOT execute financial actions.
   - Your sole responsibility is visual evidence interpretation and structured extraction.`;

export interface MultimodalExtractedEvidence {
  uploadId?: string;
  fileHash?: string;
  evidenceId?: string;
  analysisRequestId?: string;
  category:
    | 'Bank repayment notification'
    | 'Pindar app repayment screenshot'
    | 'Bank statement'
    | 'iDeb SLIK – Debitur Perseorangan'
    | 'Repayment or borrowing offer'
    | 'Other financial evidence';
  categoryConfidence: 'High' | 'Medium' | 'Low';
  institution: string;
  institutionLegalName: string | null;
  product: string;
  title: string;
  amountDue: number | null;
  dueDate: string | null;
  accountOrFacility: string | null;
  obligationStatus: 'ACTIVE_OBLIGATION' | 'COLLECTION_NOTICE' | 'HISTORICAL' | 'INFORMATIONAL';
  confidence: 'High' | 'Medium' | 'Low' | 'Needs review';
  summaryStatement: string;
  extractedNotes: string;
  extractedFacts?: string[];
  missingFields?: string[];
  ambiguities?: string[];
  uncertainFields?: string[];
  evidenceSourceType?: string;
}

let latestRecordedEvidence: MultimodalExtractedEvidence | null = null;

export function getLatestRecordedEvidence(): MultimodalExtractedEvidence | null {
  return latestRecordedEvidence;
}

export function clearLatestRecordedEvidence(): void {
  latestRecordedEvidence = null;
}

/**
 * ADK Function Tool for recording structured multimodal evidence extractions.
 */
export const recordExtractedEvidenceTool = new FunctionTool({
  name: 'record_extracted_evidence',
  description:
    'Records structured financial evidence extractions analysed from the user-provided photo, screenshot, or document.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description:
          'The category: "Bank repayment notification", "Pindar app repayment screenshot", "Bank statement", "iDeb SLIK – Debitur Perseorangan", "Repayment or borrowing offer", or "Other financial evidence".',
      },
      categoryConfidence: {
        type: Type.STRING,
        description: 'Confidence in category: "High", "Medium", or "Low".',
      },
      institution: {
        type: Type.STRING,
        description:
          'The identified financial institution or employer name (e.g. "Bank Central Asia (BCA)", "AdaKami", "Bank Mandiri", "EasyCash", "PT Nusantara Digital", or "Needs confirmation").',
      },
      institutionLegalName: {
        type: Type.STRING,
        description: 'The legal entity name of the institution if visible, or null.',
      },
      product: {
        type: Type.STRING,
        description:
          'The product type (e.g. "Personal Loan", "Kredit Tanpa Agunan", "LPBBTI Short-term Loan", "LPBBTI Overdue Collection Notice", "Payroll / Salary Slip", "Financial Document").',
      },
      title: {
        type: Type.STRING,
        description: 'Short descriptive title of the evidence.',
      },
      amountDue: {
        type: Type.NUMBER,
        description: 'The numeric amount due or net pay (e.g. 8500000), or null if not present.',
      },
      dueDate: {
        type: Type.STRING,
        description: 'The due date or payment date string (e.g. "2026-08-25" or "28 Aug 2026"), or null.',
      },
      accountOrFacility: {
        type: Type.STRING,
        description: 'Masked account or facility reference string, or null.',
      },
      obligationStatus: {
        type: Type.STRING,
        description: 'Status: "ACTIVE_OBLIGATION", "COLLECTION_NOTICE", "HISTORICAL", or "INFORMATIONAL".',
      },
      confidence: {
        type: Type.STRING,
        description: 'Extraction confidence: "High", "Medium", "Low", or "Needs review".',
      },
      summaryStatement: {
        type: Type.STRING,
        description: 'A concise single-sentence summary of what was understood from the evidence.',
      },
      extractedNotes: {
        type: Type.STRING,
        description: 'Key notes or text visible in the document.',
      },
      extractedFacts: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of confirmed facts clearly visible in the evidence.',
      },
      missingFields: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of fields missing from the document required for downstream reasoning.',
      },
      ambiguities: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of ambiguous or conflicting elements detected in the evidence.',
      },
      uncertainFields: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of uncertain field names.',
      },
    },
    required: [
      'category',
      'institution',
      'product',
      'title',
      'obligationStatus',
      'confidence',
      'summaryStatement',
    ],
  },
  execute: async (args: any) => {
    let parsedAmountDue: number | null = null;
    if (typeof args.amountDue === 'number' && !isNaN(args.amountDue)) {
      parsedAmountDue = args.amountDue;
    } else if (typeof args.amountDue === 'string') {
      const clean = args.amountDue.replace(/[^0-9.]/g, '');
      if (clean) {
        const num = parseFloat(clean);
        if (!isNaN(num)) parsedAmountDue = num;
      }
    }

    let institution = (args.institution || '').trim();
    if (!institution) {
      institution = 'Needs confirmation';
    }

    let category = args.category;
    if (!category || typeof category !== 'string') {
      category = 'Bank repayment notification';
    }

    latestRecordedEvidence = {
      category,
      categoryConfidence: args.categoryConfidence || 'High',
      institution,
      institutionLegalName: args.institutionLegalName || null,
      product: args.product || 'Bank Repayment Notice',
      title: args.title || (institution !== 'Needs confirmation' ? `${institution} Repayment Notice` : 'Uploaded Evidence'),
      amountDue: parsedAmountDue,
      dueDate: args.dueDate || null,
      accountOrFacility: args.accountOrFacility || null,
      obligationStatus: args.obligationStatus || 'ACTIVE_OBLIGATION',
      confidence: args.confidence || (institution !== 'Needs confirmation' ? 'High' : 'Needs review'),
      summaryStatement: args.summaryStatement || '',
      extractedNotes: args.extractedNotes || '',
      extractedFacts: Array.isArray(args.extractedFacts) ? args.extractedFacts : [],
      missingFields: Array.isArray(args.missingFields) ? args.missingFields : [],
      ambiguities: Array.isArray(args.ambiguities) ? args.ambiguities : [],
      uncertainFields: Array.isArray(args.uncertainFields) ? args.uncertainFields : [],
    };
    return {
      status: 'recorded',
      recorded: true,
      data: latestRecordedEvidence,
    };
  },
});

/**
 * Factory function to create a new instance of the Multimodal Evidence sub-agent.
 */
export function createMultimodalEvidenceAgent(): LlmAgent {
  return new LlmAgent({
    name: MULTIMODAL_EVIDENCE_AGENT_NAME,
    description: MULTIMODAL_EVIDENCE_AGENT_DESCRIPTION,
    model: 'gemini-3.5-flash',
    instruction: MULTIMODAL_EVIDENCE_AGENT_INSTRUCTION,
    tools: [recordExtractedEvidenceTool],
  });
}

/**
 * Default singleton instance of the Multimodal Evidence sub-agent.
 */
export const multimodalEvidenceAgent = createMultimodalEvidenceAgent();
