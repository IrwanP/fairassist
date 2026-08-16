/**
 * FairAssist - Root Google ADK Agent (Phase 2A)
 *
 * Establishes the foundational Google Agent Development Kit (ADK) root agent
 * for FairAssist using the official ADK LlmAgent, orchestrating specialized
 * sub-agents including the Regulatory Retrieval Agent.
 *
 * This agent does not automatically execute or bind to the UI at startup.
 */

import { LlmAgent, InMemoryRunner, stringifyContent } from '@google/adk';
import {
  REGULATORY_RETRIEVAL_AGENT_NAME,
  regulatoryRetrievalAgent,
} from './regulatoryRetrievalAgent';

export const FAIRASSIST_ROOT_AGENT_NAME = 'fairassist_root_agent';
export const FAIRASSIST_ROOT_AGENT_DESCRIPTION =
  'Orchestrates evidence-grounded financial decision support for FairAssist.';

export const FAIRASSIST_ROOT_AGENT_INSTRUCTION = `You are the FairAssist root decision-support agent.
FairAssist provides evidence-grounded financial decision support for Indonesian consumers managing repayment pressures and credit obligations.

You are the primary conversational orchestrator. You have access to a specialized sub-agent:
- regulatory_retrieval_agent: Specializes in retrieving and grounding Indonesian financial regulations (e.g. POJK 22/2023, POJK 40/2024, SEOJK 19/2025, OJK SLIK credit reporting), lender policies, and borrower statutory rights.

Delegation Rule:
- ONLY delegate to regulatory_retrieval_agent (using transfer_to_agent) when the user query explicitly asks about, requires, or references Indonesian financial regulations (OJK, POJK, SEOJK, SLIK credit scoring), lender regulatory policies/RIPLAY, LPBBTI debt-collection rules, borrower legal/statutory rights, prohibited collection practices, or institutional dispute mechanisms.
- Do NOT delegate for conversational queries, asking what information or evidence is needed, repayment planning coordination, prioritisation questions (such as "Which repayment should I prioritise first?", "What information do you need before recommending priority?"), cash-flow questions, or evidence uploads. Answer all non-regulatory queries directly as the root orchestrator.

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
    subAgents: [regulatoryRetrievalAgent],
  });
}

/**
 * Default singleton instance of the FairAssist root ADK agent.
 */
export const fairAssistRootAgent = createFairAssistRootAgent();

export interface FairAssistAgentExecutionResult {
  text: string;
  metadata: {
    agent: string;
    framework: string;
    phase: string;
    adkBacked: boolean;
    delegatedAgents?: string[];
    version?: string;
    timestamp?: string;
  };
}

/**
 * Executes the FairAssist root ADK agent with InMemoryRunner for live conversational guidance.
 */
export async function runFairAssistRootAgent(
  userPrompt: string,
  options?: {
    userId?: string;
    sessionId?: string;
    systemContext?: string;
  }
): Promise<FairAssistAgentExecutionResult> {
  const runner = new InMemoryRunner({
    agent: fairAssistRootAgent,
    appName: 'FairAssist',
  });

  const fullPrompt = options?.systemContext
    ? `${options.systemContext}\n\nUser Query:\n${userPrompt}`
    : userPrompt;

  let combinedText = '';
  const executedAgents = new Set<string>();

  for await (const event of runner.runEphemeral({
    userId: options?.userId || 'fairassist_user',
    newMessage: {
      role: 'user',
      parts: [{ text: fullPrompt }],
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

  const isRegulatoryExecuted = executedAgents.has(REGULATORY_RETRIEVAL_AGENT_NAME);

  return {
    text: combinedText.trim(),
    metadata: {
      agent: FAIRASSIST_ROOT_AGENT_NAME,
      framework: '@google/adk',
      phase: isRegulatoryExecuted ? 'PHASE_2A_REGULATORY_AGENT' : 'PHASE_1_ROOT_AGENT',
      adkBacked: true,
      delegatedAgents: isRegulatoryExecuted ? [REGULATORY_RETRIEVAL_AGENT_NAME] : [],
    },
  };
}
