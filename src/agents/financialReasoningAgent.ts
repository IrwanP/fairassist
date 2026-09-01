/**
 * FairAssist - Financial Reasoning & Repayment Prioritisation Sub-Agent (Phase 2C)
 *
 * Specialised Google ADK sub-agent dedicated to transforming CONFIRMED financial
 * evidence and user financial context into explainable, evidence-grounded
 * repayment prioritisation and cash-flow decision support.
 *
 * Employs deterministic calculation tooling (integer IDR arithmetic) for
 * funding gaps, chronological obligation ordering, and cash sufficiency.
 */

import { LlmAgent, FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import {
  retrieveApplicableRegulations,
  retrieveInstitutionPolicy,
} from '../services/policyRetrievalService';

export const FINANCIAL_REASONING_AGENT_NAME = 'financial_reasoning_agent';
export const FINANCIAL_REASONING_AGENT_DESCRIPTION =
  'Transforms confirmed financial evidence and confirmed user financial context into explainable, evidence-grounded repayment prioritisation and cash-flow decision support.';

export const FINANCIAL_REASONING_AGENT_INSTRUCTION = `You are the FairAssist Financial Reasoning Agent, a specialised sub-agent of FairAssist.
Your purpose is to transform CONFIRMED financial evidence and confirmed user financial context into explainable, evidence-grounded financial decision support and repayment prioritisation.

Always write in British English throughout (e.g. analyse, prioritised, authorised, instalment, programme, organisation, licence).

Core Operating Principles & Deterministic Reasoning Rules:
1. Strict Evidence-First Reasoning:
   - Reason ONLY from confirmed evidence records and explicitly confirmed user-provided financial context.
   - You must NEVER silently invent, assume, or hallucinate:
     * lenders or institutions
     * repayment amounts or balances
     * salary amounts or salary dates
     * available cash balances
     * due dates or repayment schedules
     * interest rates, origination fees, or late penalties
     * lender-specific arrangements, restructuring terms, or repayment extensions
     * future or projected income
   - If required facts are missing (e.g. available cash, salary date, obligation amounts), clearly identify what information is missing instead of fabricating values.
   - If essential expenses have not been provided by the user, explicitly keep them unknown (e.g. "Essential expenses: Not provided") rather than assuming zero or treating residual cash as fully disposable.

2. Deterministic Financial Reasoning Invariant on Cash Sufficiency:
   - If availableCash < obligationsDueBeforeSalary (or availableCash < earliest repayment obligation):
     * CRITICAL INVARIANT: NEVER describe available cash as "sufficient", "enough", "adequate", or able to fully cover the obligation.
     * CRITICAL INVARIANT: NEVER describe a negative balance as a positive residual or write contradictory statements such as "is sufficient to cover ... which would leave Rp-350,000".
     * Explicitly describe the difference as a "shortfall", "funding gap", or "cash-flow gap".
     * Always state clearly:
       "Your confirmed available cash of Rp850,000 is Rp350,000 short of the Rp1,200,000 repayment due on 25 September 2026. Your salary is expected on 28 September 2026, three days after the repayment due date."
   - If availableCash >= earliest obligation amount, but availableCash < total pre-salary obligations:
     * Distinguish individual coverage of the earliest obligation from the whole-portfolio pre-salary funding gap:
       State that available cash can individually cover the earliest obligation (leaving RpX), but total pre-salary obligations (RpY) exceed available cash, resulting in a pre-salary funding gap of RpZ before salary.

3. Preservation of Explicit User Scenario Amounts (CRITICAL INVARIANT - PHASE 2C):
   - When the user asks a scenario or "what if" question proposing an explicit borrowing amount (e.g. "What if I borrow Rp1.75M to cover the gap instead?", "What if I borrow Rp1.75 million?", "Rp1,75 juta", "Rp1.750.000", "Rp1,750,000", "1.75 million rupiah"):
     * PRESERVE THE EXPLICIT AMOUNT: The requested borrowing amount must be interpreted exactly as entered (e.g. Rp1,750,000).
     * SEPARATION OF CONCEPTS: Keep the user's explicit scenario borrowing amount (Rp1,750,000) strictly separate from the calculated repayment shortfall / funding gap (Rp350,000), confirmed available cash (Rp850,000), and confirmed repayment obligation (Rp1,200,000).
     * NEVER OVERWRITE: You are STRICTLY FORBIDDEN from replacing, normalising, or substituting the user's explicit borrowing amount with the calculated shortfall, or assuming they only borrow the shortfall.
     * DETERMINISTIC CALCULATION:
       - Temporary funds if borrowed = Rp850,000 (cash) + Rp1,750,000 (loan) = Rp2,600,000.
       - Nominal amount remaining after BCA repayment = Rp2,600,000 - Rp1,200,000 = Rp1,400,000.
       - The proposed borrowing of Rp1,750,000 exceeds the repayment-only funding gap of Rp350,000 by Rp1,400,000.
     * NO PHANTOM DISPOSABLE CASH: Because essential living expenses have NOT been provided and a new debt liability is created, you MUST NOT describe the Rp1,400,000 as "spare cash", "disposable cash", "savings", "surplus wealth", or "free money".
     * UNKNOWN TERMS & NO FABRICATED AFFORDABILITY: Explain that loan interest, fees, tenor, repayment schedule, and instalment are unknown unless supplied. Because essential living expenses are also not confirmed, a full affordability conclusion must not be fabricated.
     * RISK & BURDEN EXPLANATION: Objectively explain that borrowing Rp1,750,000 creates an additional repayment obligation subject to lender interest and fees. If a specific lender is not identified, lender-specific interest, fees, tenor, and regulatory classification remain unverified until a provider is specified. DO NOT attach, cite, assert, or imply POJK No. 40 Tahun 2024, SEOJK No. 19/SEOJK.06/2025, LPBBTI, Pindar, or any lender/product-specific regulation to that hypothetical borrowing. Regulatory/source scope must remain neutral ("Lender not specified").
     * NON-DEBT ALTERNATIVES: Compare this scenario against non-debt alternatives, including contacting the earliest lender (BCA) before its due date to inquire about possible repayment arrangements or moving the payment date to payday, noting that any date change requires explicit lender confirmation.
     * STATE IMMUTABILITY: Clarify that this scenario is purely hypothetical and does not mutate or commit canonical confirmed state (the BCA obligation remains Rp1,200,000 due 25 September 2026, cash remains Rp850,000, funding gap remains Rp350,000).

4. Financial Gap Calculation Gate (CRITICAL INVARIANT):
   - NEVER describe total confirmed obligations (e.g. Rp1,850,000) as a "funding gap", "shortfall", "deficit", or "cash-flow gap". Total obligations is only the sum of confirmed debts.
   - A numerical funding gap may be stated ONLY when the deterministic financial calculation layer has sufficient confirmed inputs to calculate it (both available cash and next salary date are confirmed).
   - If required cash-flow inputs are missing (available cash, next salary date, or expected salary):
     * state the confirmed total obligations if known (e.g. Rp1,850,000 across 2 obligations);
     * state which required cash-flow information is missing (available cash, next salary date, expected salary);
     * explicitly state that the funding gap cannot yet be calculated.
   - Conversational output must NOT invent, infer, or independently calculate a funding gap when the deterministic financial state does not provide one.
   - If the deterministic funding-gap value is unavailable or null, omit every numerical funding-gap statement.
   - Preserve valid funding-gap calculations when sufficient confirmed inputs exist (e.g. Guided Sample: available cash Rp850,000, pre-salary obligations Rp1,950,000, salary Rp8,500,000 -> pre-salary funding gap Rp1,100,000).

5. Repayment Prioritisation Hierarchy:
   - Use the following explainable, conservative decision hierarchy:
     1. Confirmed overdue obligation, if any.
     2. Earliest confirmed due date.
     3. Where two obligations have the same due date, explicitly identify the tie rather than inventing an arbitrary lender preference.
     4. Distinguish deadline priority (who requires earlier attention) from payment allocation (how cash is spent).
     5. Do NOT automatically recommend new borrowing to cover a gap. Objectively explain that new borrowing creates additional debt. Lender-specific terms and regulatory classification remain unverified unless a provider is specified.
     6. Do NOT present recommendations as mandatory financial advice. State that an obligation "requires earlier attention" or is the "earliest confirmed deadline".
     7. Always note that any payment date change or relief request requires explicit lender confirmation.

6. Deterministic Arithmetic:
   - Always call the 'calculate_financial_metrics' tool to perform exact integer IDR calculations for total obligations, pre-salary obligations, available cash, funding gap, shortfalls, scenario borrowing comparisons, and chronological order.
   - Do NOT perform mental arithmetic or guess totals.

7. Output Structure:
   Provide clear, grounded responses formatted with:
   ### What I found
   - Confirmed facts: total pre-salary obligations, confirmed available cash, confirmed salary timing, calculated pre-salary funding gap or shortfall (if calculable), and explicit user scenario borrowing amount (if asked). Explicitly mention essential expenses status.
   ### What it means
   - Timing conflict analysis and scenario comparison: compare requested borrowing against the shortfall without conflating them, explain cash sufficiency (or shortfall) accurately without contradictions, and clarify the portfolio funding gap before salary (if calculable).
   ### Next step
   - Responsible, actionable decision support: contacting the earliest lender before its due date to explore available repayment choices, reviewing subsequent deadlines, and comparing scenarios in the Action Simulator.`;

export interface FinancialObligationInput {
  id?: string;
  institutionName: string;
  category?: string;
  title?: string;
  amount: number;
  dueDate: string;
  isOverdue?: boolean;
  status?: string;
  referenceNumber?: string;
}

export interface FinancialContextInput {
  obligations: FinancialObligationInput[];
  availableCash?: number | null;
  nextSalaryAmount?: number | null;
  nextSalaryDate?: string | null;
  essentialExpenses?: number | null;
  scenarioBorrowingAmount?: number | null;
}

export interface CalculatedFinancialMetrics {
  totalConfirmedObligations: number;
  obligationsDueBeforeSalary: number | null;
  availableConfirmedCash: number | null;
  preSalaryFundingGap: number | null;
  preSalaryShortfall: number | null;
  isCashSufficientForPreSalary: boolean | null;
  totalFundingGap: number | null;
  isFundingGapCalculable: boolean;
  fundingGapStatus: 'CALCULATED' | 'UNAVAILABLE_MISSING_CASH_FLOW_INPUTS';
  sortedObligations: Array<FinancialObligationInput & {
    parsedTimestamp: number;
    isOverdue: boolean;
    isPreSalary: boolean;
    formattedAmount: string;
  }>;
  earliestObligation: (FinancialObligationInput & {
    parsedTimestamp: number;
    isOverdue: boolean;
    isPreSalary: boolean;
    formattedAmount: string;
  }) | null;
  hasOverdue: boolean;
  overdueObligations: FinancialObligationInput[];
  isEarliestCoveredIndividually: boolean;
  earliestShortfall: number | null;
  remainingCashAfterEarliest: number | null;
  earliestCoverageSummary: string;
  salaryTimingVsEarliest: string;
  tieDetected: boolean;
  tieObligations: FinancialObligationInput[];
  missingCriticalFields: string[];
  scenarioBorrowingAmount: number | null;
  scenarioBorrowingAmountFormatted: string | null;
  scenarioTotalFundsIfBorrowed: number | null;
  scenarioTotalFundsIfBorrowedFormatted: string | null;
  scenarioRemainingAfterRepayment: number | null;
  scenarioRemainingAfterRepaymentFormatted: string | null;
  scenarioBorrowingDiff: number | null;
  scenarioBorrowingDiffFormatted: string | null;
  scenarioBorrowingComparisonSummary: string | null;
}

/**
 * Extracts and parses explicit borrowing amounts from scenario / "what if" user queries.
 * Supports formats like:
 * - "Rp1.75M", "Rp1.75m", "1.75M", "1.75m", "Rp 1.75M", "1.75 million", "1.75 million rupiah", "1.75jt", "1,75 juta" -> 1750000
 * - "Rp350k", "350k", "Rp350 rb", "350 ribu" -> 350000
 * - "Rp1.750.000", "Rp1,750,000", "1750000", "1,750,000", "1.750.000" -> 1750000
 */
export function extractScenarioBorrowingAmount(text?: string | null): number | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // 1. Borrowing context with millions / million / juta / jt / m / mio
  // e.g. "borrow Rp1.75M", "pinjam 1.75 juta", "take a loan of 1.75 million", "borrow 1.75 million rupiah"
  const borrowMillionMatch = lower.match(/(?:borrow|pinjam|loan|ambil|take out)\s+(?:a\s+loan\s+of\s+)?(?:rp\.?|idr)?\s*(\d+(?:[.,]\d+)?)\s*(?:m|million|mio|juta|jt)\b/i);
  if (borrowMillionMatch) {
    const rawVal = borrowMillionMatch[1].replace(',', '.');
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.round(parsed * 1_000_000);
    }
  }

  // 2. Borrowing context with thousands / ribu / rb / k
  // e.g. "borrow Rp350k", "pinjam 350 rb", "loan of 350 thousand"
  const borrowThousandMatch = lower.match(/(?:borrow|pinjam|loan|ambil|take out)\s+(?:a\s+loan\s+of\s+)?(?:rp\.?|idr)?\s*(\d+(?:[.,]\d+)?)\s*(?:k|thousand|ribu|rb)\b/i);
  if (borrowThousandMatch) {
    const rawVal = borrowThousandMatch[1].replace(',', '.');
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.round(parsed * 1_000);
    }
  }

  // 3. Borrowing context with full explicit IDR amount
  // e.g. "borrow Rp1.750.000", "borrow Rp1,750,000", "borrow 1,750,000", "borrow 1.750.000", "borrow 1750000"
  const borrowExplicitMatch = lower.match(/(?:borrow|pinjam|loan|ambil|take out)\s+(?:a\s+loan\s+of\s+)?(?:rp\.?|idr)?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)/i);
  if (borrowExplicitMatch) {
    const rawDigits = borrowExplicitMatch[1].replace(/[.,]/g, '');
    const parsed = parseInt(rawDigits, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // 4. General millions / juta / jt / m / mio anywhere in text
  // e.g. Rp1.75M, 1.75M, Rp 1.75M, 1.75 million, Rp 1,75 juta, 1.75jt, 1.75 mio, 2M, 2 million
  const millionMatch = lower.match(/(?:rp\.?|idr)?\s*(\d+(?:[.,]\d+)?)\s*(?:m|million|mio|juta|jt)\b/i);
  if (millionMatch) {
    const rawVal = millionMatch[1].replace(',', '.');
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.round(parsed * 1_000_000);
    }
  }

  // 5. General thousands / ribu / rb / k anywhere in text
  // e.g. Rp350k, 350k, Rp350 rb, Rp350 ribu, 350 thousand
  const thousandMatch = lower.match(/(?:rp\.?|idr)?\s*(\d+(?:[.,]\d+)?)\s*(?:k|thousand|ribu|rb)\b/i);
  if (thousandMatch) {
    const rawVal = thousandMatch[1].replace(',', '.');
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.round(parsed * 1_000);
    }
  }

  // 6. General full integer IDR amounts with explicit Rp prefix
  // e.g. Rp1.750.000, Rp1,750,000, Rp 1750000
  const explicitRpMatch = lower.match(/(?:rp\.?|idr)\s*(\d{1,3}(?:[.,]\d{3})+|\d+)/i);
  if (explicitRpMatch) {
    const rawDigits = explicitRpMatch[1].replace(/[.,]/g, '');
    const parsed = parseInt(rawDigits, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * Deterministic date parser handling standard Indonesian & ISO dates safely.
 */
export function parseDateToTimestamp(dateStr?: string | null): number {
  if (!dateStr || typeof dateStr !== 'string') return Number.MAX_SAFE_INTEGER;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === 'N/A' || trimmed === 'null' || trimmed === 'undefined') {
    return Number.MAX_SAFE_INTEGER;
  }

  // Check ISO format YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(Date.UTC(year, month, day)).getTime();
  }

  // Check DD Month YYYY or DD Mon YYYY
  const monthMap: Record<string, number> = {
    jan: 0, januari: 0, january: 0,
    feb: 1, februari: 1, february: 1,
    mar: 2, maret: 2, march: 2,
    apr: 3, april: 3,
    may: 4, mei: 4,
    jun: 5, juni: 5, june: 5,
    jul: 6, juli: 6, july: 6,
    aug: 7, agustus: 7, august: 7,
    sep: 8, september: 8,
    oct: 9, oktober: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, desember: 11, december: 11,
  };

  const textDateMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (textDateMatch) {
    const day = parseInt(textDateMatch[1], 10);
    const mStr = textDateMatch[2].toLowerCase();
    const year = parseInt(textDateMatch[3], 10);
    const month = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
    return new Date(Date.UTC(year, month, day)).getTime();
  }

  const parsed = Date.parse(trimmed);
  return isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/**
 * Deterministic Financial Calculations using Integer IDR values.
 */
export function calculateFinancialMetrics(context: FinancialContextInput): CalculatedFinancialMetrics {
  const missingCriticalFields: string[] = [];

  const rawObligations = Array.isArray(context.obligations) ? context.obligations : [];
  if (rawObligations.length === 0) {
    missingCriticalFields.push('obligations');
  }

  const isCashConfirmed = context.availableCash !== null && context.availableCash !== undefined && typeof context.availableCash === 'number' && !isNaN(context.availableCash);
  const isSalaryDateConfirmed = Boolean(context.nextSalaryDate);
  const isFundingGapCalculable = isCashConfirmed && isSalaryDateConfirmed;

  const availableCash = isCashConfirmed
    ? Math.max(0, Math.round(context.availableCash!))
    : 0;

  if (!isCashConfirmed) {
    missingCriticalFields.push('availableCash');
  }

  if (!isSalaryDateConfirmed) {
    missingCriticalFields.push('nextSalaryDate');
  }

  if (context.nextSalaryAmount === null || context.nextSalaryAmount === undefined) {
    missingCriticalFields.push('nextSalaryAmount');
  }

  const salaryTimestamp = isSalaryDateConfirmed
    ? parseDateToTimestamp(context.nextSalaryDate!)
    : Number.MAX_SAFE_INTEGER;

  let totalConfirmedObligations = 0;
  let obligationsDueBeforeSalaryCount = 0;
  let obligationsDueBeforeSalaryAmount = 0;
  const overdueObligations: FinancialObligationInput[] = [];

  const sortedObligations = rawObligations
    .map((obl) => {
      const amt = typeof obl.amount === 'number' && !isNaN(obl.amount) ? Math.max(0, Math.round(obl.amount)) : 0;
      totalConfirmedObligations += amt;

      const parsedTimestamp = parseDateToTimestamp(obl.dueDate);
      const isOverdue = Boolean(
        obl.isOverdue ||
        obl.status?.toLowerCase() === 'overdue' ||
        (parsedTimestamp < Date.now() && parsedTimestamp !== Number.MAX_SAFE_INTEGER)
      );

      if (isOverdue) {
        overdueObligations.push(obl);
      }

      const isPreSalary = isSalaryDateConfirmed && parsedTimestamp <= salaryTimestamp;
      if (isPreSalary) {
        obligationsDueBeforeSalaryCount += 1;
        obligationsDueBeforeSalaryAmount += amt;
      }

      return {
        ...obl,
        amount: amt,
        parsedTimestamp,
        isOverdue,
        isPreSalary,
        formattedAmount: `Rp${amt.toLocaleString('id-ID')}`,
      };
    })
    .sort((a, b) => {
      // 1. Overdue first
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      // 2. Earliest timestamp
      return a.parsedTimestamp - b.parsedTimestamp;
    });

  const earliestObligation = sortedObligations.length > 0 ? sortedObligations[0] : null;
  const earliestAmount = earliestObligation ? earliestObligation.amount : 0;
  const hasOverdue = overdueObligations.length > 0;

  // Strict calculation gate: only calculate funding gap and shortfalls when cash and salary date are confirmed
  const obligationsDueBeforeSalary = isSalaryDateConfirmed ? obligationsDueBeforeSalaryAmount : null;
  const preSalaryFundingGap = isFundingGapCalculable ? Math.max(0, obligationsDueBeforeSalaryAmount - availableCash) : null;
  const preSalaryShortfall = preSalaryFundingGap;
  const isCashSufficientForPreSalary = isFundingGapCalculable ? (availableCash >= obligationsDueBeforeSalaryAmount && obligationsDueBeforeSalaryAmount > 0) : null;
  const totalFundingGap = isCashConfirmed ? Math.max(0, totalConfirmedObligations - availableCash) : null;

  // Strict invariant: only true if available cash is confirmed and >= earliest amount
  const isEarliestCoveredIndividually = isCashConfirmed && earliestObligation
    ? availableCash >= earliestAmount && earliestAmount > 0
    : false;

  const earliestShortfall = isCashConfirmed && earliestObligation
    ? Math.max(0, earliestAmount - availableCash)
    : null;

  const remainingCashAfterEarliest = isEarliestCoveredIndividually
    ? Math.max(0, availableCash - earliestAmount)
    : null;

  // Compute timing relationship between earliest obligation and salary
  let salaryTimingVsEarliest = '';
  if (earliestObligation && context.nextSalaryDate) {
    const earliestTs = earliestObligation.parsedTimestamp;
    const salTs = salaryTimestamp;
    if (earliestTs !== Number.MAX_SAFE_INTEGER && salTs !== Number.MAX_SAFE_INTEGER) {
      const diffDays = Math.round((salTs - earliestTs) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        const daysWord = diffDays === 1 ? 'one day' : diffDays === 2 ? 'two days' : diffDays === 3 ? 'three days' : `${diffDays} days`;
        salaryTimingVsEarliest = `Your salary is expected on ${context.nextSalaryDate}, ${daysWord} after the repayment due date.`;
      } else if (diffDays === 0) {
        salaryTimingVsEarliest = `Your salary is expected on the same date as your repayment due date (${context.nextSalaryDate}).`;
      } else {
        salaryTimingVsEarliest = `Your salary is expected on ${context.nextSalaryDate}, before the repayment due date.`;
      }
    }
  }

  let earliestCoverageSummary = '';
  if (earliestObligation) {
    if (!isCashConfirmed) {
      earliestCoverageSummary = `Cannot determine payment coverage or shortfall for ${earliestObligation.institutionName} because available cash is not confirmed.`;
    } else if (isEarliestCoveredIndividually) {
      earliestCoverageSummary = `Your confirmed available cash of Rp${availableCash.toLocaleString('id-ID')} is sufficient to cover the Rp${earliestAmount.toLocaleString('id-ID')} ${earliestObligation.institutionName} repayment individually, leaving Rp${(remainingCashAfterEarliest ?? 0).toLocaleString('id-ID')}.`;
    } else {
      earliestCoverageSummary = `Your confirmed available cash of Rp${availableCash.toLocaleString('id-ID')} is Rp${(earliestShortfall ?? 0).toLocaleString('id-ID')} short of the Rp${earliestAmount.toLocaleString('id-ID')} repayment due on ${earliestObligation.dueDate}.${salaryTimingVsEarliest ? ` ${salaryTimingVsEarliest}` : ''}`;
    }
  }

  // Check for ties in earliest due date
  let tieDetected = false;
  let tieObligations: FinancialObligationInput[] = [];
  if (sortedObligations.length > 1 && earliestObligation) {
    const earliestTime = earliestObligation.parsedTimestamp;
    const sameDateItems = sortedObligations.filter((o) => o.parsedTimestamp === earliestTime);
    if (sameDateItems.length > 1) {
      tieDetected = true;
      tieObligations = sameDateItems;
    }
  }

  // Scenario borrowing calculations & invariant validation
  const scenarioBorrowingAmount = typeof context.scenarioBorrowingAmount === 'number' && !isNaN(context.scenarioBorrowingAmount)
    ? Math.max(0, Math.round(context.scenarioBorrowingAmount))
    : null;

  let scenarioBorrowingDiff: number | null = null;
  let scenarioBorrowingComparisonSummary: string | null = null;
  let scenarioTotalFundsIfBorrowed: number | null = null;
  let scenarioRemainingAfterRepayment: number | null = null;

  if (scenarioBorrowingAmount !== null) {
    if (!isFundingGapCalculable) {
      scenarioTotalFundsIfBorrowed = isCashConfirmed ? availableCash + scenarioBorrowingAmount : scenarioBorrowingAmount;
      scenarioRemainingAfterRepayment = null;
      scenarioBorrowingDiff = null;
      scenarioBorrowingComparisonSummary = `Requested scenario borrowing of Rp${scenarioBorrowingAmount.toLocaleString('id-ID')} is noted. Because required cash-flow inputs (available cash or salary timing) are missing, a pre-salary funding gap cannot yet be calculated to compare against this amount.`;
    } else {
      scenarioTotalFundsIfBorrowed = availableCash + scenarioBorrowingAmount;
      scenarioRemainingAfterRepayment = Math.max(0, scenarioTotalFundsIfBorrowed - obligationsDueBeforeSalaryAmount);
      scenarioBorrowingDiff = scenarioBorrowingAmount - (preSalaryFundingGap ?? 0);

      if (scenarioBorrowingDiff > 0) {
        scenarioBorrowingComparisonSummary = `Requested scenario borrowing of Rp${scenarioBorrowingAmount.toLocaleString('id-ID')} exceeds your currently identified repayment-only funding gap of Rp${(preSalaryFundingGap ?? 0).toLocaleString('id-ID')} by Rp${scenarioBorrowingDiff.toLocaleString('id-ID')}. If borrowed, temporary available funds before salary would be Rp${scenarioTotalFundsIfBorrowed.toLocaleString('id-ID')} (Rp${availableCash.toLocaleString('id-ID')} cash + Rp${scenarioBorrowingAmount.toLocaleString('id-ID')} loan). After paying confirmed pre-salary obligations of Rp${obligationsDueBeforeSalaryAmount.toLocaleString('id-ID')}, a nominal amount of Rp${scenarioRemainingAfterRepayment.toLocaleString('id-ID')} would remain. However, because essential living expenses have not been provided and new borrowing creates a separate liability with unknown interest rates, fees, tenor, and repayment schedule, this Rp${scenarioRemainingAfterRepayment.toLocaleString('id-ID')} must not be treated as disposable cash, savings, or surplus wealth.`;
      } else if (scenarioBorrowingDiff === 0) {
        scenarioBorrowingComparisonSummary = `Requested scenario borrowing of Rp${scenarioBorrowingAmount.toLocaleString('id-ID')} equals your currently identified repayment-only funding gap of Rp${(preSalaryFundingGap ?? 0).toLocaleString('id-ID')} (Rp${obligationsDueBeforeSalaryAmount.toLocaleString('id-ID')} due minus Rp${availableCash.toLocaleString('id-ID')} cash). While borrowing Rp${scenarioBorrowingAmount.toLocaleString('id-ID')} mathematically covers this pre-salary gap, it does not resolve debt—it creates an additional repayment obligation subject to lender-dependent terms and fees.`;
      } else {
        const shortfallAfterBorrowing = Math.abs(scenarioBorrowingDiff);
        scenarioBorrowingComparisonSummary = `Requested scenario borrowing of Rp${scenarioBorrowingAmount.toLocaleString('id-ID')} is Rp${shortfallAfterBorrowing.toLocaleString('id-ID')} less than your currently identified repayment-only funding gap of Rp${(preSalaryFundingGap ?? 0).toLocaleString('id-ID')}. A pre-salary shortfall of Rp${shortfallAfterBorrowing.toLocaleString('id-ID')} would still remain before salary arrives.`;
      }
    }
  }

  return {
    totalConfirmedObligations,
    obligationsDueBeforeSalary,
    availableConfirmedCash: isCashConfirmed ? availableCash : null,
    preSalaryFundingGap,
    preSalaryShortfall,
    isCashSufficientForPreSalary,
    totalFundingGap,
    isFundingGapCalculable,
    fundingGapStatus: isFundingGapCalculable ? 'CALCULATED' : 'UNAVAILABLE_MISSING_CASH_FLOW_INPUTS',
    sortedObligations,
    earliestObligation,
    hasOverdue,
    overdueObligations,
    isEarliestCoveredIndividually,
    earliestShortfall,
    remainingCashAfterEarliest,
    earliestCoverageSummary,
    salaryTimingVsEarliest,
    tieDetected,
    tieObligations,
    missingCriticalFields,
    scenarioBorrowingAmount,
    scenarioBorrowingAmountFormatted: scenarioBorrowingAmount ? `Rp${scenarioBorrowingAmount.toLocaleString('id-ID')}` : null,
    scenarioTotalFundsIfBorrowed,
    scenarioTotalFundsIfBorrowedFormatted: scenarioTotalFundsIfBorrowed !== null ? `Rp${scenarioTotalFundsIfBorrowed.toLocaleString('id-ID')}` : null,
    scenarioRemainingAfterRepayment,
    scenarioRemainingAfterRepaymentFormatted: scenarioRemainingAfterRepayment !== null ? `Rp${scenarioRemainingAfterRepayment.toLocaleString('id-ID')}` : null,
    scenarioBorrowingDiff,
    scenarioBorrowingDiffFormatted: scenarioBorrowingDiff !== null ? `Rp${Math.abs(scenarioBorrowingDiff).toLocaleString('id-ID')}` : null,
    scenarioBorrowingComparisonSummary,
  };
}

/**
 * ADK Function Tool: Deterministic Financial Metrics Calculator
 */
export const calculateFinancialMetricsTool = new FunctionTool({
  name: 'calculate_financial_metrics',
  description:
    'Calculates deterministic financial metrics including total confirmed obligations, pre-salary obligations, available cash, pre-salary funding gap, scenario borrowing comparisons, and chronological ordering of due dates.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      obligations: {
        type: Type.ARRAY,
        description: 'List of confirmed active financial obligations.',
        items: {
          type: Type.OBJECT,
          properties: {
            institutionName: { type: Type.STRING, description: 'Lender or institution name' },
            amount: { type: Type.NUMBER, description: 'Numeric repayment amount in IDR' },
            dueDate: { type: Type.STRING, description: 'Repayment due date' },
            category: { type: Type.STRING, description: 'Product category' },
            status: { type: Type.STRING, description: 'Current status' },
          },
          required: ['institutionName', 'amount', 'dueDate'],
        },
      },
      availableCash: {
        type: Type.NUMBER,
        description: 'Confirmed available cash balance in IDR.',
      },
      nextSalaryAmount: {
        type: Type.NUMBER,
        description: 'Confirmed expected salary amount in IDR.',
      },
      nextSalaryDate: {
        type: Type.STRING,
        description: 'Confirmed next salary payment date.',
      },
      essentialExpenses: {
        type: Type.NUMBER,
        description: 'Optional essential living expenses before salary.',
      },
      scenarioBorrowingAmount: {
        type: Type.NUMBER,
        description: 'Optional explicit borrowing amount specified by the user in their scenario query (e.g. 1750000 for Rp1.75M). Never overwrite with the calculated shortfall.',
      },
    },
    required: ['obligations'],
  },
  execute: async (args: any) => {
    const metrics = calculateFinancialMetrics({
      obligations: args.obligations || [],
      availableCash: args.availableCash,
      nextSalaryAmount: args.nextSalaryAmount,
      nextSalaryDate: args.nextSalaryDate,
      essentialExpenses: args.essentialExpenses,
      scenarioBorrowingAmount: args.scenarioBorrowingAmount,
    });

    return {
      totalConfirmedObligations: metrics.totalConfirmedObligations,
      totalConfirmedObligationsFormatted: `Rp${metrics.totalConfirmedObligations.toLocaleString('id-ID')}`,
      obligationsDueBeforeSalary: metrics.obligationsDueBeforeSalary,
      obligationsDueBeforeSalaryFormatted: metrics.obligationsDueBeforeSalary !== null ? `Rp${metrics.obligationsDueBeforeSalary.toLocaleString('id-ID')}` : null,
      availableConfirmedCash: metrics.availableConfirmedCash,
      availableConfirmedCashFormatted: metrics.availableConfirmedCash !== null ? `Rp${metrics.availableConfirmedCash.toLocaleString('id-ID')}` : null,
      preSalaryFundingGap: metrics.preSalaryFundingGap,
      preSalaryFundingGapFormatted: metrics.preSalaryFundingGap !== null ? `Rp${metrics.preSalaryFundingGap.toLocaleString('id-ID')}` : null,
      preSalaryShortfall: metrics.preSalaryShortfall,
      preSalaryShortfallFormatted: metrics.preSalaryShortfall !== null ? `Rp${metrics.preSalaryShortfall.toLocaleString('id-ID')}` : null,
      isCashSufficientForPreSalary: metrics.isCashSufficientForPreSalary,
      isFundingGapCalculable: metrics.isFundingGapCalculable,
      fundingGapStatus: metrics.fundingGapStatus,
      earliestObligation: metrics.earliestObligation
        ? {
            institutionName: metrics.earliestObligation.institutionName,
            amount: metrics.earliestObligation.amount,
            formattedAmount: metrics.earliestObligation.formattedAmount,
            dueDate: metrics.earliestObligation.dueDate,
            isOverdue: metrics.earliestObligation.isOverdue,
            isPreSalary: metrics.earliestObligation.isPreSalary,
          }
        : null,
      isEarliestCoveredIndividually: metrics.isEarliestCoveredIndividually,
      earliestShortfall: metrics.earliestShortfall,
      earliestShortfallFormatted: metrics.earliestShortfall !== null ? `Rp${metrics.earliestShortfall.toLocaleString('id-ID')}` : null,
      remainingCashAfterEarliest: metrics.remainingCashAfterEarliest,
      remainingCashAfterEarliestFormatted: metrics.remainingCashAfterEarliest !== null ? `Rp${metrics.remainingCashAfterEarliest.toLocaleString('id-ID')}` : null,
      earliestCoverageSummary: metrics.earliestCoverageSummary,
      salaryTimingVsEarliest: metrics.salaryTimingVsEarliest,
      hasOverdue: metrics.hasOverdue,
      tieDetected: metrics.tieDetected,
      missingCriticalFields: metrics.missingCriticalFields,
      scenarioBorrowingAmount: metrics.scenarioBorrowingAmount,
      scenarioBorrowingAmountFormatted: metrics.scenarioBorrowingAmountFormatted,
      scenarioTotalFundsIfBorrowed: metrics.scenarioTotalFundsIfBorrowed,
      scenarioTotalFundsIfBorrowedFormatted: metrics.scenarioTotalFundsIfBorrowedFormatted,
      scenarioRemainingAfterRepayment: metrics.scenarioRemainingAfterRepayment,
      scenarioRemainingAfterRepaymentFormatted: metrics.scenarioRemainingAfterRepaymentFormatted,
      scenarioBorrowingDiff: metrics.scenarioBorrowingDiff,
      scenarioBorrowingDiffFormatted: metrics.scenarioBorrowingDiffFormatted,
      scenarioBorrowingComparisonSummary: metrics.scenarioBorrowingComparisonSummary,
      chronologicalOrder: metrics.sortedObligations.map((o) => ({
        institutionName: o.institutionName,
        amount: o.formattedAmount,
        dueDate: o.dueDate,
        isOverdue: o.isOverdue,
      })),
    };
  },
});

/**
 * ADK Function Tool: Retrieve Regulatory Considerations for Reasoning
 */
export const retrieveRegulatoryGroundingTool = new FunctionTool({
  name: 'retrieve_regulatory_grounding',
  description:
    'Retrieves verified Indonesian financial regulations (OJK POJK 40/2024, SEOJK 19/2025, POJK 22/2023, SLIK) and lender policies applicable to the current repayment situation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      institutionName: {
        type: Type.STRING,
        description: 'Optional institution name (e.g. BCA, AdaKami, Easycash) to retrieve verified policy.',
      },
    },
  },
  execute: async (args: any) => {
    const institution = args?.institutionName ? String(args.institutionName).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const policy = institution ? retrieveInstitutionPolicy(institution, args.institutionName) : null;
    return {
      applicableFrameworks: [
        {
          code: 'POJK No. 40 Tahun 2024',
          summary: 'Governs LPBBTI digital lending operations, consumer protection, and statutory dispute mechanisms.',
        },
        {
          code: 'SEOJK No. 19/SEOJK.06/2025',
          summary: 'Current LPBBTI operational guidelines (superseding SEOJK 19/2023 effective 31 July 2025); sets collection conduct standards and recommends exploring non-debt relief.',
        },
        {
          code: 'POJK No. 22 Tahun 2023',
          summary: 'Statutory consumer protection for banking and financial services consumers.',
        },
      ],
      lenderPolicy: policy || 'Standard OJK consumer protection and lender procedural evaluation apply.',
    };
  },
});

/**
 * Factory function to create a new instance of the Financial Reasoning ADK sub-agent.
 */
export function createFinancialReasoningAgent(): LlmAgent {
  return new LlmAgent({
    name: FINANCIAL_REASONING_AGENT_NAME,
    description: FINANCIAL_REASONING_AGENT_DESCRIPTION,
    model: 'gemini-3.5-flash',
    instruction: FINANCIAL_REASONING_AGENT_INSTRUCTION,
    tools: [calculateFinancialMetricsTool, retrieveRegulatoryGroundingTool],
  });
}

/**
 * Default singleton instance of the Financial Reasoning ADK sub-agent.
 */
export const financialReasoningAgent = createFinancialReasoningAgent();
