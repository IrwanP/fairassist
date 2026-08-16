/**
 * FairAssist - Regulatory Retrieval Sub-Agent (Phase 2A)
 *
 * Specialised Google ADK sub-agent dedicated to retrieving and grounding
 * verified Indonesian financial regulations (OJK, Bank Indonesia, SLIK)
 * and institutional policies (RIPLAY, lender assistance channels, dispute routes).
 *
 * Integrates with the existing FairAssist trusted policy and regulatory retrieval service.
 */

import { LlmAgent, FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import {
  retrieveApplicableRegulations,
  retrieveInstitutionPolicy,
  verifyInstitution,
} from '../services/policyRetrievalService';

export const REGULATORY_RETRIEVAL_AGENT_NAME = 'regulatory_retrieval_agent';
export const REGULATORY_RETRIEVAL_AGENT_DESCRIPTION =
  'Retrieves and grounds relevant Indonesian financial regulations and verified lender-policy information for FairAssist.';

export const REGULATORY_RETRIEVAL_AGENT_INSTRUCTION = `You are the FairAssist Regulatory Retrieval Agent, a specialized sub-agent of FairAssist.
Your sole purpose is to retrieve, explain, and ground relevant Indonesian financial regulations (e.g. OJK regulations, Bank Indonesia rules) and verified lender-policy information (such as RIPLAY product disclosures, customer assistance channels, and dispute escalation routes).

Core Regulatory & Policy Knowledge:
1. Indonesian Financial Regulations:
   - POJK No. 22 Tahun 2023: Statutory consumer protection framework for the financial services sector; mandates fair treatment, transparent disclosure, and accessible complaint-handling mechanisms.
   - POJK No. 40 Tahun 2024: Statutory framework governing LPBBTI (Layanan Pendanaan Bersama Berbasis Teknologi Informasi / P2P digital lending), consumer protection, governance, and borrower dispute rights.
   - SEOJK No. 19/SEOJK.06/2025: Operational guidelines and collection codes for LPBBTI providers. Effective 31 July 2025, superseding SEOJK 19/2023.
   - OJK SLIK (Sistem Layanan Informasi Keuangan): National credit history registry tracking debtor collectibility classifications (Collectibility 1-5).
2. Institutional Policies & Disclosures:
   - Verified lender policies and RIPLAY disclosures (Ringkasan Informasi Produk dan Layanan) for banks and licensed LPBBTI platforms (e.g., Bank Central Asia / BCA, Bank Mandiri, Bank Rakyat Indonesia / BRI, Bank BTPN Jenius, AdaKami, EasyCash, Kredit Pintar).
   - Official customer service channels and dispute escalation pathways.

Strict Operating Boundaries:
1. Decision Support, Not Autonomous Decisions:
   - Provide clear, objective regulatory and policy grounding to assist the user.
   - The user remains the final decision maker for all financial actions and priorities.
2. Grounding in Verified Sources:
   - Base all statements on verified regulatory frameworks and documented lender policies.
   - Do not cite non-existent regulatory articles or invent lender rules.
3. Fact Preservation — No Invention or Modification:
   - Respect confirmed evidence and explicit user context provided in the conversation.
   - You MUST NOT invent, alter, or assume user financial facts, including repayment amounts, due dates, available cash, salary date, or funding gaps.
4. No Presumed or Guaranteed Lender Approvals:
   - Do NOT claim or guarantee that any lender will approve an extension, restructuring, waiver, payment-date change, or other relief.
   - Always frame relief requests and restructuring as formal procedural options subject to lender evaluation and credit terms.`;

/**
 * ADK Function Tools connecting the Regulatory Retrieval Agent directly to
 * the verified policy retrieval service.
 */
export const lookupInstitutionPolicyTool = new FunctionTool({
  name: 'lookup_institution_policy',
  description:
    'Lookup verified lender policy, product information, customer assistance contacts, and complaints channels for an Indonesian financial institution.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      institutionKeyOrName: {
        type: Type.STRING,
        description:
          'The name or key of the institution (e.g. bca, mandiri, bri, btpn, adakami, easycash, kreditpintar).',
      },
    },
    required: ['institutionKeyOrName'],
  },
  execute: async (args: any) => {
    const raw = String(args?.institutionKeyOrName || '').toLowerCase();
    const key = raw.replace(/[^a-z0-9]/g, '');
    const verified = verifyInstitution(key, args.institutionKeyOrName);
    const policy = retrieveInstitutionPolicy(key, args.institutionKeyOrName);
    return {
      institution: verified,
      policy: policy || 'No specific policy override found. Standard OJK consumer protection applies.',
    };
  },
});

export const lookupRegulationsTool = new FunctionTool({
  name: 'lookup_applicable_regulations',
  description:
    'Lookup active Indonesian financial regulations governing Banks, LPBBTI / P2P digital lenders, or SLIK credit reporting.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      sector: {
        type: Type.STRING,
        description: 'The regulatory sector: "Banking", "Pindar / LPBBTI", or "Credit Reporting & Consumer Protection".',
      },
    },
  },
  execute: async (args: any) => {
    const dummyContext = {
      obligations: [
        { id: '1', title: 'Bank Loan', category: 'Bank Loan', amount: 1000000, status: 'Active' as const },
        { id: '2', title: 'Pindar Advance', category: 'P2P Loan', amount: 500000, status: 'Active' as const },
      ],
    };
    const sectors = retrieveApplicableRegulations(dummyContext as any, false);
    if (args?.sector) {
      const filtered = sectors.filter((s) => s.sector.toLowerCase().includes(String(args.sector).toLowerCase()));
      return filtered.length > 0 ? filtered : sectors;
    }
    return sectors;
  },
});

/**
 * Factory function to create a new instance of the Regulatory Retrieval sub-agent.
 */
export function createRegulatoryRetrievalAgent(): LlmAgent {
  return new LlmAgent({
    name: REGULATORY_RETRIEVAL_AGENT_NAME,
    description: REGULATORY_RETRIEVAL_AGENT_DESCRIPTION,
    model: 'gemini-3.5-flash',
    instruction: REGULATORY_RETRIEVAL_AGENT_INSTRUCTION,
    tools: [lookupInstitutionPolicyTool, lookupRegulationsTool],
  });
}

/**
 * Default singleton instance of the Regulatory Retrieval ADK sub-agent.
 */
export const regulatoryRetrievalAgent = createRegulatoryRetrievalAgent();
