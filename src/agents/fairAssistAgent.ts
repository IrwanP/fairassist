/**
 * FairAssist - Root Google ADK Agent (Phase 2B)
 *
 * Establishes the foundational Google Agent Development Kit (ADK) root agent
 * for FairAssist using the official ADK LlmAgent, orchestrating specialised
 * sub-agents:
 * 1. regulatory_retrieval_agent (Phase 2A): Grounds Indonesian regulations and lender policies
 * 2. multimodal_evidence_agent (Phase 2B): Analyses user-provided financial evidence multimodally
 *
 * This agent does not automatically execute or bind to the UI at startup.
 */

import { LlmAgent, InMemoryRunner, stringifyContent } from '@google/adk';
import {
  REGULATORY_RETRIEVAL_AGENT_NAME,
  regulatoryRetrievalAgent,
} from './regulatoryRetrievalAgent';
import {
  MULTIMODAL_EVIDENCE_AGENT_NAME,
  multimodalEvidenceAgent,
  getLatestRecordedEvidence,
  clearLatestRecordedEvidence,
  type MultimodalExtractedEvidence,
} from './multimodalEvidenceAgent';
import {
  FINANCIAL_REASONING_AGENT_NAME,
  financialReasoningAgent,
} from './financialReasoningAgent';

export const FAIRASSIST_ROOT_AGENT_NAME = 'fairassist_root_agent';
export const FAIRASSIST_ROOT_AGENT_DESCRIPTION =
  'Orchestrates evidence-grounded financial decision support for FairAssist.';

export const FAIRASSIST_ROOT_AGENT_INSTRUCTION = `You are the FairAssist root decision-support agent.
FairAssist provides evidence-grounded financial decision support for Indonesian consumers managing repayment pressures and credit obligations.

You are the primary conversational orchestrator. You have access to specialized sub-agents:
1. regulatory_retrieval_agent: Specializes in retrieving and grounding Indonesian financial regulations (e.g. POJK 22/2023, POJK 40/2024, SEOJK 19/2025, OJK SLIK credit reporting), lender policies, and borrower statutory rights.
2. multimodal_evidence_agent: Specializes in analysing user-provided financial evidence (repayment notice photographs, screenshots, mobile app repayment screens, bank/lender notices, salary slips, and PDF documents) using multimodal reasoning.
3. financial_reasoning_agent: Specializes in transforming confirmed financial evidence, obligations, available cash, and salary schedules into explainable financial decision support, deterministic funding gap calculations, and repayment prioritisation.

Delegation Rules:
- When a user uploads or provides an evidence file, screenshot, repayment notice, or document for visual/multimodal analysis, delegate to multimodal_evidence_agent using transfer_to_agent.
- ONLY delegate to regulatory_retrieval_agent (using transfer_to_agent) when the user query explicitly asks about, requires, or references Indonesian financial regulations (OJK, POJK, SEOJK, SLIK credit scoring), lender regulatory policies/RIPLAY, LPBBTI debt-collection rules, borrower legal/statutory rights, prohibited collection practices, or institutional dispute mechanisms.
- When the user query asks for financial reasoning, repayment prioritisation ("Which should I pay first?", "How should I prioritise?", "What should I pay first?"), hypothetical / counterfactual borrowing questions ("What if I borrow Rp1.75M to cover the gap instead?", "What if I take a new loan?"), cash-flow gap calculations, affordability analysis, or repayment planning over confirmed financial obligations, delegate to financial_reasoning_agent using transfer_to_agent.
- Do NOT delegate for general conversational greetings, asking what initial information or evidence is needed when no obligations exist, or general coordination. Answer initial missing-evidence queries directly as the root orchestrator.

Core Principles and Operating Boundaries:
1. Decision Support, Not Autonomous Decisions:
   - FairAssist provides financial decision support, not autonomous financial decisions.
   - The user remains the final decision maker for all financial actions, priorities, and lender communications.

2. Evidence Grounding & Fact Preservation:
   - Base all reasoning strictly on confirmed evidence and explicit user input.
   - Do not invent, assume, or hallucinate missing financial facts, obligations, amounts, due dates, or income figures.
   - Explicitly identify when critical information or documentation is missing.

3. Verified Regulatory and Lender-Policy Claims:
   - Regulatory (e.g., OJK regulations, Bank Indonesia rules) and lender-policy claims must remain grounded in verified information.
   - Do not assert regulatory protections, dispute limits, or lender policies without verified basis.

4. No Presumed or Guaranteed Lender Approvals:
   - Do not claim or guarantee that a lender will approve an extension, restructuring, waiver, payment-date change, or other arrangement.
   - Present lender communication and relief requests as procedural options subject to lender evaluation and credit terms.

5. User Sovereignty & Clear Trade-Offs:
   - Present balanced financial pathways, cash-flow impacts, and timeline risks to empower the user to make informed, autonomous choices.`;

/**
 * Factory function to create a new instance of the FairAssist root LlmAgent.
 */
export function createFairAssistRootAgent(): LlmAgent {
  return new LlmAgent({
    name: FAIRASSIST_ROOT_AGENT_NAME,
    description: FAIRASSIST_ROOT_AGENT_DESCRIPTION,
    model: 'gemini-3.5-flash',
    instruction: FAIRASSIST_ROOT_AGENT_INSTRUCTION,
    subAgents: [regulatoryRetrievalAgent, multimodalEvidenceAgent, financialReasoningAgent],
  });
}

/**
 * Default singleton instance of the FairAssist root ADK agent.
 */
export const fairAssistRootAgent = createFairAssistRootAgent();

export interface FairAssistAgentExecutionResult {
  text: string;
  structuredEvidence?: MultimodalExtractedEvidence | null;
  metadata: {
    agent: string;
    framework: string;
    phase: string;
    adkBacked: boolean;
    delegatedAgents: string[];
    version?: string;
    timestamp?: string;
  };
}

export interface RunAgentOptions {
  userId?: string;
  sessionId?: string;
  systemContext?: string;
  evidenceFile?: {
    inlineData: {
      mimeType: string;
      data: string;
    };
    fileName?: string;
    evidenceType?: string;
    uploadId?: string;
    fileHash?: string;
    evidenceId?: string;
    analysisRequestId?: string;
  };
}

/**
 * Executes the FairAssist root ADK agent with InMemoryRunner for live conversational guidance
 * or multimodal evidence interpretation.
 */
export async function runFairAssistRootAgent(
  userPrompt: string,
  options?: RunAgentOptions
): Promise<FairAssistAgentExecutionResult> {
  clearLatestRecordedEvidence();

  const runner = new InMemoryRunner({
    agent: fairAssistRootAgent,
    appName: 'FairAssist',
  });

  const fullPrompt = options?.systemContext
    ? `${options.systemContext}\n\nUser Query:\n${userPrompt}`
    : userPrompt;

  const messageParts: any[] = [{ text: fullPrompt }];

  if (options?.evidenceFile?.inlineData?.data) {
    messageParts.push({
      inlineData: {
        mimeType: options.evidenceFile.inlineData.mimeType || 'image/png',
        data: options.evidenceFile.inlineData.data,
      },
    });
  }

  let combinedText = '';
  const executedAgents = new Set<string>();

  let fallbackStructured: any = null;

  for await (const event of runner.runEphemeral({
    userId: options?.userId || 'fairassist_user',
    newMessage: {
      role: 'user',
      parts: messageParts,
    },
  })) {
    if (event.author && event.author !== 'user') {
      executedAgents.add(event.author);
      let text = stringifyContent(event);
      if (!text && event.content) {
        let contentObj: any = event.content;
        if (typeof contentObj === 'string') {
          try {
            contentObj = JSON.parse(contentObj);
          } catch {}
        }
        if (contentObj?.parts && Array.isArray(contentObj.parts)) {
          text = contentObj.parts
            .filter((p: any) => !p.thought && typeof p.text === 'string')
            .map((p: any) => p.text)
            .join('');

          for (const p of contentObj.parts) {
            if (p.functionCall?.name === 'record_extracted_evidence' && p.functionCall.args) {
              fallbackStructured = p.functionCall.args;
            }
          }
        }
      }
      if (text) {
        combinedText += text;
      }
    }

    if (event.actions?.transferToAgent) {
      executedAgents.add(event.actions.transferToAgent);
    }
  }

  const isMultimodalExecuted =
    executedAgents.has(MULTIMODAL_EVIDENCE_AGENT_NAME) ||
    Boolean(options?.evidenceFile?.inlineData?.data);
  const isRegulatoryExecuted = executedAgents.has(REGULATORY_RETRIEVAL_AGENT_NAME);
  const isFinancialReasoningExecuted = executedAgents.has(FINANCIAL_REASONING_AGENT_NAME);

  let phase = 'PHASE_1_ROOT_AGENT';
  let delegatedAgents: string[] = [];

  if (isMultimodalExecuted) {
    phase = 'PHASE_2B_MULTIMODAL_EVIDENCE_AGENT';
    delegatedAgents = [MULTIMODAL_EVIDENCE_AGENT_NAME];
  } else if (isFinancialReasoningExecuted) {
    phase = 'PHASE_2C_FINANCIAL_REASONING_AGENT';
    delegatedAgents = [FINANCIAL_REASONING_AGENT_NAME];
    if (isRegulatoryExecuted) {
      delegatedAgents.push(REGULATORY_RETRIEVAL_AGENT_NAME);
    }
  } else if (isRegulatoryExecuted) {
    phase = 'PHASE_2A_REGULATORY_AGENT';
    delegatedAgents = [REGULATORY_RETRIEVAL_AGENT_NAME];
  }

  let structured = getLatestRecordedEvidence();
  if (!structured && fallbackStructured) {
    let parsedAmountDue: number | null = null;
    if (typeof fallbackStructured.amountDue === 'number' && !isNaN(fallbackStructured.amountDue)) {
      parsedAmountDue = fallbackStructured.amountDue;
    } else if (typeof fallbackStructured.amountDue === 'string') {
      const clean = fallbackStructured.amountDue.replace(/[^0-9.]/g, '');
      if (clean) {
        const num = parseFloat(clean);
        if (!isNaN(num)) parsedAmountDue = num;
      }
    }

    structured = {
      category: fallbackStructured.category || 'Bank repayment notification',
      categoryConfidence: fallbackStructured.categoryConfidence || 'High',
      institution: fallbackStructured.institution || 'Needs confirmation',
      institutionLegalName: fallbackStructured.institutionLegalName || null,
      product: fallbackStructured.product || 'Bank Repayment Notice',
      title: fallbackStructured.title || 'Uploaded Evidence',
      amountDue: parsedAmountDue,
      dueDate: fallbackStructured.dueDate || null,
      accountOrFacility: fallbackStructured.accountOrFacility || null,
      obligationStatus: fallbackStructured.obligationStatus || 'ACTIVE_OBLIGATION',
      confidence: fallbackStructured.confidence || 'High',
      summaryStatement: fallbackStructured.summaryStatement || '',
      extractedNotes: fallbackStructured.extractedNotes || '',
      extractedFacts: Array.isArray(fallbackStructured.extractedFacts) ? fallbackStructured.extractedFacts : [],
      missingFields: Array.isArray(fallbackStructured.missingFields) ? fallbackStructured.missingFields : [],
      ambiguities: Array.isArray(fallbackStructured.ambiguities) ? fallbackStructured.ambiguities : [],
      uncertainFields: Array.isArray(fallbackStructured.uncertainFields) ? fallbackStructured.uncertainFields : [],
    };
  }

  return {
    text: combinedText.trim(),
    structuredEvidence: structured,
    metadata: {
      agent: FAIRASSIST_ROOT_AGENT_NAME,
      framework: '@google/adk',
      phase,
      adkBacked: true,
      delegatedAgents,
    },
  };
}
