import React, { useState, useMemo, useRef } from 'react';
import { FinancialContext } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { 
  HelpCircle, 
  Sparkles, 
  Clock, 
  PlusCircle,
  CheckCircle2
} from 'lucide-react';

interface ActionSimulatorProps {
  context: FinancialContext;
  selectedScenarioType?: 'REQUEST_EXTENSION' | 'BORROW_MORE' | null;
  onSelectScenarioType?: (type: 'REQUEST_EXTENSION' | 'BORROW_MORE' | null) => void;
  onAddActionToPlan?: (scenario: any) => void;
  addedToPlan?: boolean;
  onOpenUploadModal?: (type: 'camera' | 'screenshot' | 'document') => void;
  onOpenFinancialContextModal?: () => void;
  hypotheticalBorrowAmount?: number | null;
}

export function formatBritishDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [y, m, d] = trimmed.split('T')[0].split('-').map(Number);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (y && m && d) {
      return `${d} ${monthNames[m - 1]} ${y}`;
    }
  }
  const dateObj = new Date(trimmed);
  if (!isNaN(dateObj.getTime())) {
    const day = dateObj.getDate();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${day} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  }
  return trimmed;
}

export const ActionSimulator: React.FC<ActionSimulatorProps> = ({ 
  context, 
  selectedScenarioType: propsScenarioType,
  onSelectScenarioType,
  onAddActionToPlan,
  addedToPlan = false,
  onOpenUploadModal,
  onOpenFinancialContextModal,
  hypotheticalBorrowAmount: propsHypotheticalBorrowAmount,
}) => {
  const [internalScenarioType, setInternalScenarioType] = useState<'REQUEST_EXTENSION' | 'BORROW_MORE' | null>('REQUEST_EXTENSION');
  const selectedScenarioType = propsScenarioType !== undefined ? propsScenarioType : internalScenarioType;

  const handleSelectScenarioType = (type: 'REQUEST_EXTENSION' | 'BORROW_MORE') => {
    const nextType = selectedScenarioType === type ? null : type;
    if (onSelectScenarioType) {
      onSelectScenarioType(nextType);
    } else {
      setInternalScenarioType(nextType);
    }
  };

  const [userExtensionDays, setUserExtensionDays] = useState<number | null>(null);
  const [borrowAmountInput, setBorrowAmountInput] = useState<number | null>(null);

  const riskAssessmentRef = useRef<HTMLDivElement>(null);

  // 1. Single Source of Truth Readiness Calculations
  const confirmedObligations = useMemo(() => {
    return (context.obligations || []).filter((o) => {
      if (o.isSalary || o.category === 'Salary') return false;
      const catLower = (o.category || '').toLowerCase();
      if (catLower.includes('salary') || catLower.includes('payroll') || catLower.includes('slik')) return false;
      return (o.amount !== null && o.amount !== undefined && o.amount > 0) || Boolean(o.institutionName);
    });
  }, [context.obligations]);

  const hasConfirmedObligations = confirmedObligations.length > 0;
  const hasCashContext = context.availableCash !== null && context.availableCash !== undefined;
  const hasSalaryContext = Boolean(context.nextSalaryDate) && context.nextSalaryAmount !== null && context.nextSalaryAmount !== undefined;

  const simulatorReady = hasConfirmedObligations && hasCashContext && hasSalaryContext;

  // Sort obligations ascending by due date
  const sortedObligations = useMemo(() => {
    return [...confirmedObligations].sort((a, b) => {
      const dA = new Date(a.dueDate || '2099-01-01').getTime();
      const dB = new Date(b.dueDate || '2099-01-01').getTime();
      return dA - dB;
    });
  }, [confirmedObligations]);

  // Target obligation for Scenario A
  const targetObligation = sortedObligations[0] || null;
  const targetInstitution = targetObligation?.institutionName || 'Lender';
  const targetAmount = targetObligation?.amount || 0;
  const originalDueDate = formatBritishDate(targetObligation?.formattedDate || targetObligation?.dueDate);
  const proposedDueDate = formatBritishDate(context.nextSalaryDate);
  const productName = targetObligation?.productName || targetObligation?.category || 'Loan Facility';

  const isBank = targetObligation 
    ? (targetObligation.category === 'Bank Loan' || targetObligation.category === 'Credit Card' || /bank|bca|mandiri|bni|bri|cimb/i.test(targetInstitution))
    : true;

  // Calendar-day shift calculation between confirmed due date and salary date
  const calculatedShiftDays = useMemo(() => {
    if (!targetObligation?.dueDate || !context.nextSalaryDate) return 4;
    const d1 = new Date(targetObligation.dueDate);
    const d2 = new Date(context.nextSalaryDate);
    const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
    const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
    const diffDays = Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 4;
  }, [targetObligation?.dueDate, context.nextSalaryDate]);

  const extensionDays = userExtensionDays !== null ? userExtensionDays : calculatedShiftDays;

  // Pre-salary calculations
  const preSalaryObligationsTotal = useMemo(() => {
    return confirmedObligations.reduce((sum, o) => sum + (o.amount || 0), 0);
  }, [confirmedObligations]);

  const availableCash = context.availableCash ?? 0;
  const essentialExpenses = context.essentialExpenses ?? 0;

  const minimumCalculatedGap = Math.max(0, preSalaryObligationsTotal - availableCash);

  // Preserve user hypothetical borrow amount without overwriting or substituting verifiedFundingGap
  const hypotheticalBorrowAmount = propsHypotheticalBorrowAmount ?? context.hypotheticalBorrowAmount ?? context.scenarioBorrowingAmount ?? null;

  // Scenario B borrow amount defaults to user hypothetical borrow amount if provided, else minimumCalculatedGap
  const defaultBorrowAmount = hypotheticalBorrowAmount !== null && hypotheticalBorrowAmount > 0
    ? hypotheticalBorrowAmount
    : (minimumCalculatedGap > 0 ? minimumCalculatedGap : Math.round(targetAmount * 0.5));

  const borrowAmount = borrowAmountInput !== null ? borrowAmountInput : defaultBorrowAmount;
  const formattedBorrowM = `${parseFloat((borrowAmount / 1000000).toFixed(2))}M`;

  const isHypotheticalAmount = hypotheticalBorrowAmount !== null && borrowAmount === hypotheticalBorrowAmount;

  const scenarioBTitle = isHypotheticalAmount
    ? `What if I borrow Rp${formattedBorrowM} to cover the gap instead?`
    : `What if I borrow Rp${formattedBorrowM} to cover the current repayment-only gap?`;

  const scenarioBSupporting = borrowAmount > minimumCalculatedGap
    ? `Borrowing Rp${borrowAmount.toLocaleString('en-US')} covers the Rp${minimumCalculatedGap.toLocaleString('en-US')} repayment gap. Essential living expenses are not included because they have not been provided. The Rp${(borrowAmount - minimumCalculatedGap).toLocaleString('en-US')} remainder is not disposable cash.`
    : `Rp${borrowAmount.toLocaleString('en-US')} reflects the currently identified repayment gap only. Essential living expenses are not included because they have not been provided.`;

  const scenarioBGeminiSummary = borrowAmount > minimumCalculatedGap
    ? `Borrowing an additional Rp${borrowAmount.toLocaleString('en-US')} covers the immediate Rp${minimumCalculatedGap.toLocaleString('en-US')} pre-salary funding gap, with Rp${(borrowAmount - minimumCalculatedGap).toLocaleString('en-US')} remaining before salary. This creates a new repayment obligation whose interest, fees, and repayment schedule cannot be verified because no specific lender or product has been identified. The remaining balance is not disposable cash because essential living expenses have not been provided.`
    : `Borrowing an additional Rp${borrowAmount.toLocaleString('en-US')} covers the immediate repayment-only funding gap, but introduces a new repayment obligation whose interest, fees, and repayment terms cannot be verified until a specific lender is identified. Essential living expenses are not included because they have not been provided.`;

  // Single Source of Truth Scenario Object
  const selectedScenario = useMemo(() => {
    if (!simulatorReady) return null;

    if (selectedScenarioType === 'REQUEST_EXTENSION') {
      const remainingPreSalaryRepayments = Math.max(0, preSalaryObligationsTotal - targetAmount);
      const simulatedFundingGap = Math.max(0, (remainingPreSalaryRepayments + essentialExpenses) - availableCash);
      const projectedRemainingCash = Math.max(0, availableCash - remainingPreSalaryRepayments);
      const futurePostSalaryBurden = targetAmount;

      const summaryText = simulatedFundingGap === 0
        ? `If ${targetInstitution} confirms that the Rp${targetAmount.toLocaleString('en-US')} repayment can be moved from ${originalDueDate} to ${proposedDueDate}, the currently identified pre-salary repayment-only funding gap would be resolved, excluding any essential expenses that have not been provided.`
        : `If ${targetInstitution} confirms that the Rp${targetAmount.toLocaleString('en-US')} repayment can be moved from ${originalDueDate} to ${proposedDueDate}, the currently identified pre-salary repayment-only funding gap would decrease from Rp${minimumCalculatedGap.toLocaleString('en-US')} to Rp${simulatedFundingGap.toLocaleString('en-US')}, excluding essential expenses that have not been provided.`;

      return {
        id: 'scenario-a',
        type: 'REQUEST_EXTENSION' as const,
        badgeText: 'Scenario A · Lower-risk option to explore',
        title: `Ask ${targetInstitution} about a ${extensionDays}-day payment shift`,
        supportingText: `Explore aligning the ${targetInstitution} due date with your verified salary date on ${proposedDueDate}.`,
        targetInstitution,
        targetAmount,
        originalDueDate,
        proposedDueDate,
        productName,
        shiftDays: extensionDays,
        requiresLenderConfirmation: true,
        currentPreSalaryRepayments: preSalaryObligationsTotal,
        simulatedPreSalaryRepayments: remainingPreSalaryRepayments,
        currentPostSalaryBurden: 0,
        simulatedPostSalaryBurden: futurePostSalaryBurden,
        simulatedNewBorrowing: 0,
        currentFundingGap: minimumCalculatedGap,
        simulatedFundingGap,
        projectedRemainingCash,
        isBank,
        sourceScopeTag: isBank ? 'Institution-specific' : 'LPBBTI / Pindar',
        regulatoryNote: isBank
          ? `No verified ${targetInstitution}-specific payment-shift policy was found in the current trusted sources. Confirm available arrangements directly with ${targetInstitution}.`
          : `Grounded in POJK No. 40 Tahun 2024 & SEOJK No. 19/SEOJK.06/2025 consumer protection guidelines.`,
        geminiAssessment: {
          summary: summaryText,
          benefits: [
            `If ${targetInstitution} approves the arrangement, the Rp${targetAmount.toLocaleString('en-US')} repayment is deferred until your ${proposedDueDate} salary.`,
            `Reduces immediate pre-salary repayment allocations by Rp${targetAmount.toLocaleString('en-US')} while keeping subsequent obligations in view.`,
            `Zero new debt added.`
          ],
          keyRisks: [
            `${targetInstitution} may apply terms, late charges, or administrative requirements depending on the arrangement offered.`,
            `Requires explicit confirmation from ${targetInstitution} prior to ${originalDueDate}.`,
            `Confirm any fees, credit reporting impact, and revised due date directly with ${targetInstitution}.`
          ]
        }
      };
    } else {
      // Scenario B: BORROW_MORE
      const simulatedAvailableCash = availableCash + borrowAmount;
      const simulatedFundingGap = Math.max(0, preSalaryObligationsTotal - simulatedAvailableCash);
      const projectedRemainingCash = Math.max(0, simulatedAvailableCash - preSalaryObligationsTotal);

      return {
        id: 'scenario-b',
        type: 'BORROW_MORE' as const,
        badgeText: 'Scenario B · Higher risk',
        title: scenarioBTitle,
        supportingText: scenarioBSupporting,
        targetInstitution: 'Unspecified lender',
        targetAmount: borrowAmount,
        originalDueDate: 'Immediate',
        proposedDueDate,
        productName: 'Hypothetical borrowing',
        shiftDays: 0,
        requiresLenderConfirmation: false,
        currentPreSalaryRepayments: preSalaryObligationsTotal,
        simulatedPreSalaryRepayments: preSalaryObligationsTotal,
        currentPostSalaryBurden: 0,
        simulatedPostSalaryBurden: 0,
        simulatedNewBorrowing: borrowAmount,
        currentFundingGap: minimumCalculatedGap,
        simulatedFundingGap,
        projectedRemainingCash,
        isBank: false,
        sourceScopeTag: 'Lender not specified',
        regulatoryNote: `Lender-specific interest, fees, tenor, and regulatory terms remain unverified until a lender or product is identified.`,
        geminiAssessment: {
          summary: scenarioBGeminiSummary,
          benefits: [
            `Provides immediate Rp${borrowAmount.toLocaleString('en-US')} liquidity to cover the minimum calculated pre-salary gap of Rp${minimumCalculatedGap.toLocaleString('en-US')}.`
          ],
          keyRisks: [
            `New borrowing creates an additional repayment obligation; interest, fees, tenor, and schedule cannot be verified without an identified lender.`,
            `Increases future post-salary repayment burden by at least Rp${borrowAmount.toLocaleString('en-US')}.`,
            `The remaining balance is a repayment-only calculation and must not be treated as disposable cash or savings because essential living expenses are unconfirmed.`
          ]
        }
      };
    }
  }, [
    simulatorReady,
    selectedScenarioType,
    extensionDays,
    borrowAmount,
    scenarioBTitle,
    scenarioBSupporting,
    scenarioBGeminiSummary,
    targetInstitution,
    targetAmount,
    originalDueDate,
    proposedDueDate,
    productName,
    preSalaryObligationsTotal,
    availableCash,
    essentialExpenses,
    minimumCalculatedGap,
    isBank
  ]);

  // STATE 1: Zero confirmed obligations -> Empty State
  if (!hasConfirmedObligations) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center gap-2 text-indigo-700 font-semibold text-xs uppercase tracking-wider">
            <HelpCircle className="w-4 h-4" />
            Interactive Action Simulator
          </div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
            What if?
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            Simulate prospective financial choices before taking action. FairAssist calculates exact cash-flow shifts and evaluates outcomes against verified sources and lender policies.
          </p>
        </div>

        <div className="bg-white border border-stone-200/90 rounded-2xl p-8 shadow-2xs text-center space-y-4 max-w-2xl mx-auto my-8">
          <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-stone-900">
              Add repayment evidence first
            </h3>
            <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
              FairAssist needs at least one confirmed repayment obligation before it can simulate financial scenarios.
            </p>
          </div>
          <button
            onClick={() => onOpenUploadModal?.('screenshot')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-2 active:scale-95"
          >
            <span>Add repayment evidence →</span>
          </button>
        </div>
      </div>
    );
  }

  // STATE 2: Obligation exists but Cash/Salary context missing -> Blocked State
  if (!simulatorReady || !selectedScenario) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center gap-2 text-indigo-700 font-semibold text-xs uppercase tracking-wider">
            <HelpCircle className="w-4 h-4" />
            Interactive Action Simulator
          </div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
            What if?
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            Simulate prospective financial choices before taking action. FairAssist calculates exact cash-flow shifts and evaluates outcomes against verified sources and lender policies.
          </p>
        </div>

        <div className="bg-white border border-stone-200/90 rounded-2xl p-8 shadow-2xs text-center space-y-4 max-w-2xl mx-auto my-8">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-stone-900">
              Add your financial context
            </h3>
            <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
              FairAssist has your repayment obligation, but needs your available cash and salary timing before it can calculate meaningful scenarios.
            </p>
          </div>
          <button
            onClick={() => onOpenFinancialContextModal?.()}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-2 active:scale-95"
          >
            <span>Add cash &amp; salary information →</span>
          </button>
        </div>
      </div>
    );
  }

  // STATE 3: Simulator Ready State
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
        <div className="flex items-center gap-2 text-indigo-700 font-semibold text-xs uppercase tracking-wider">
          <HelpCircle className="w-4 h-4" />
          Interactive Action Simulator
        </div>
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
          What if?
        </h2>
        <p className="text-xs text-stone-600 leading-relaxed">
          Simulate prospective financial choices before taking action. FairAssist calculates exact cash-flow shifts and evaluates outcomes against verified sources and lender policies.
        </p>
      </div>

      {/* Scenario Selector Cards */}
      <div 
        id="scenario-selection" 
        style={{ scrollMarginTop: '96px' }} 
        className="grid grid-cols-1 md:grid-cols-2 gap-4 scroll-mt-24"
      >
        
        {/* Scenario A Card */}
        <div
          onClick={() => handleSelectScenarioType('REQUEST_EXTENSION')}
          className={`bg-white border rounded-2xl p-4 cursor-pointer transition-all ${
            selectedScenarioType === 'REQUEST_EXTENSION'
              ? 'border-indigo-500 ring-2 ring-indigo-50/80 shadow-xs'
              : 'border-stone-200 hover:border-stone-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-indigo-900 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200">
              Scenario A · Lower-risk option to explore
            </span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <h3 className="text-sm font-bold text-stone-900">
            Ask {targetInstitution} about a {extensionDays}-day payment shift
          </h3>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed">
            Explore aligning the {targetInstitution} due date with your verified salary date on {proposedDueDate}.
          </p>

          <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Lender confirmation required
            </span>

            {selectedScenarioType === 'REQUEST_EXTENSION' && (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <label className="text-[11px] font-medium text-stone-600">Days:</label>
                <select
                  value={extensionDays}
                  onChange={(e) => setUserExtensionDays(Number(e.target.value))}
                  className="text-xs font-semibold bg-stone-50 border border-stone-200 rounded px-2 py-0.5"
                >
                  <option value={calculatedShiftDays}>{calculatedShiftDays} Days (To {proposedDueDate})</option>
                  <option value={5}>5 Days</option>
                  <option value={7}>7 Days</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Scenario B Card */}
        <div
          onClick={() => handleSelectScenarioType('BORROW_MORE')}
          className={`bg-white border rounded-2xl p-4 cursor-pointer transition-all ${
            selectedScenarioType === 'BORROW_MORE'
              ? 'border-rose-500 ring-2 ring-rose-50/80 shadow-xs'
              : 'border-stone-200 hover:border-stone-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-rose-900 bg-rose-50 px-2.5 py-0.5 rounded border border-rose-200">
              Scenario B · Higher risk
            </span>
            <PlusCircle className="w-4 h-4 text-rose-600" />
          </div>
          <h3 className="text-sm font-bold text-stone-900">
            {scenarioBTitle}
          </h3>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed">
            {scenarioBSupporting}
          </p>

          {selectedScenarioType === 'BORROW_MORE' && (
            <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <label className="text-[11px] font-medium text-stone-600">Borrow amount:</label>
              <select
                value={borrowAmount}
                onChange={(e) => setBorrowAmountInput(Number(e.target.value))}
                className="text-xs font-semibold bg-stone-50 border border-stone-200 rounded px-2 py-0.5"
              >
                {hypotheticalBorrowAmount !== null && hypotheticalBorrowAmount !== minimumCalculatedGap && (
                  <option value={hypotheticalBorrowAmount}>Rp{hypotheticalBorrowAmount.toLocaleString('en-US')} (Hypothetical amount)</option>
                )}
                <option value={minimumCalculatedGap}>Rp{minimumCalculatedGap.toLocaleString('en-US')} (Current repayment gap)</option>
                <option value={1500000}>Rp1,500,000</option>
                {(!hypotheticalBorrowAmount || hypotheticalBorrowAmount !== 1750000) && (
                  <option value={1750000}>Rp1,750,000</option>
                )}
                <option value={2000000}>Rp2,000,000</option>
              </select>
            </div>
          )}
        </div>

      </div>

      {/* Simulation Result Output */}
      <div className="space-y-5">
        
        {/* Financial Impact Comparison Table */}
        <div 
          id="financial-impact-comparison" 
          style={{ scrollMarginTop: '96px' }} 
          className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-2xs scroll-mt-24"
        >
          <div className="bg-stone-50 p-4 border-b border-stone-200 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-stone-900">
              Financial Impact Comparison
            </h3>
            <span className="text-xs text-stone-600 font-medium">
              {selectedScenario.badgeText}
            </span>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-stone-100/60 text-stone-600 font-semibold border-b border-stone-200">
              <tr>
                <th className="p-3.5">Metric</th>
                <th className="p-3.5 bg-stone-50/80">Current Situation</th>
                <th className="p-3.5 bg-indigo-50/40 font-bold text-indigo-950">With Selected Scenario</th>
                <th className="p-3.5">Delta / Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              
              <tr>
                <td className="p-3.5 text-stone-700 font-semibold">Active Obligations</td>
                <td className="p-3.5 bg-stone-50/50">{confirmedObligations.length} Obligations</td>
                <td className="p-3.5 bg-indigo-50/20 font-bold text-stone-900">
                  {selectedScenario.type === 'BORROW_MORE' 
                    ? confirmedObligations.length + (borrowAmount > 0 ? 1 : 0)
                    : confirmedObligations.length} Obligations
                </td>
                <td className="p-3.5 font-mono text-[11px]">
                  {selectedScenario.type === 'BORROW_MORE' && borrowAmount > 0 ? '+1 New Loan' : 'Unchanged'}
                </td>
              </tr>

              <tr>
                <td className="p-3.5 text-stone-700 font-semibold">Available Cash Before Repayments</td>
                <td className="p-3.5 bg-stone-50/50 font-mono">Rp{availableCash.toLocaleString('en-US')}</td>
                <td className="p-3.5 bg-indigo-50/20 font-bold text-stone-900 font-mono">
                  Rp{(selectedScenario.type === 'BORROW_MORE' ? availableCash + borrowAmount : availableCash).toLocaleString('en-US')}
                </td>
                <td className="p-3.5 font-mono text-[11px]">
                  {selectedScenario.type === 'BORROW_MORE' ? `+Rp${borrowAmount.toLocaleString('en-US')}` : 'Unchanged'}
                </td>
              </tr>

              <tr>
                <td className="p-3.5 text-stone-700 font-semibold">
                  <div>Projected cash remaining before salary</div>
                  <div className="text-[10px] font-normal text-stone-500">Essential expenses not included.</div>
                </td>
                <td className="p-3.5 bg-stone-50/50 font-mono">
                  <div>Rp{Math.max(0, availableCash - preSalaryObligationsTotal).toLocaleString('en-US')}</div>
                  {minimumCalculatedGap > 0 && (
                    <div className="text-[10px] font-semibold text-rose-700 mt-0.5">
                      Rp{minimumCalculatedGap.toLocaleString('en-US')} remains unfunded
                    </div>
                  )}
                </td>
                <td className="p-3.5 bg-indigo-50/20 font-bold text-stone-900 font-mono">
                  Rp{selectedScenario.projectedRemainingCash.toLocaleString('en-US')}
                </td>
                <td className="p-3.5 font-mono text-[11px] text-emerald-700 font-bold">
                  {selectedScenario.projectedRemainingCash > Math.max(0, availableCash - preSalaryObligationsTotal) 
                    ? `+Rp${(selectedScenario.projectedRemainingCash - Math.max(0, availableCash - preSalaryObligationsTotal)).toLocaleString('en-US')}`
                    : 'Unchanged'}
                </td>
              </tr>

              <tr>
                <td className="p-3.5 text-stone-700 font-semibold">Near-Term Repayments (Pre-Salary)</td>
                <td className="p-3.5 bg-stone-50/50 font-mono text-amber-900">Rp{preSalaryObligationsTotal.toLocaleString('en-US')}</td>
                <td className="p-3.5 bg-indigo-50/20 font-bold text-stone-900 font-mono">
                  Rp{selectedScenario.simulatedPreSalaryRepayments.toLocaleString('en-US')}
                </td>
                <td className="p-3.5 font-mono text-[11px] text-emerald-700 font-bold">
                  {selectedScenario.simulatedPreSalaryRepayments < preSalaryObligationsTotal 
                    ? `-Rp${(preSalaryObligationsTotal - selectedScenario.simulatedPreSalaryRepayments).toLocaleString('en-US')}`
                    : 'Unchanged'}
                </td>
              </tr>

              <tr>
                <td className="p-3.5 text-stone-700 font-semibold">Repayment shifted to salary date or later</td>
                <td className="p-3.5 bg-stone-50/50 font-mono">Rp0</td>
                <td className="p-3.5 bg-indigo-50/20 font-bold text-stone-900 font-mono">
                  Rp{selectedScenario.simulatedPostSalaryBurden.toLocaleString('en-US')}
                </td>
                <td className="p-3.5 font-mono text-[11px]">
                  {selectedScenario.simulatedPostSalaryBurden > 0 
                    ? `+Rp${selectedScenario.simulatedPostSalaryBurden.toLocaleString('en-US')}` 
                    : 'Unchanged'}
                </td>
              </tr>

              <tr>
                <td className="p-3.5 text-stone-700 font-semibold">New borrowing introduced</td>
                <td className="p-3.5 bg-stone-50/50 font-mono">Rp0</td>
                <td className="p-3.5 bg-indigo-50/20 font-bold text-stone-900 font-mono">
                  Rp{selectedScenario.simulatedNewBorrowing.toLocaleString('en-US')}
                </td>
                <td className="p-3.5 font-mono text-[11px]">
                  {selectedScenario.simulatedNewBorrowing > 0 
                    ? `+Rp${selectedScenario.simulatedNewBorrowing.toLocaleString('en-US')}` 
                    : 'Unchanged'}
                </td>
              </tr>

              <tr>
                <td className="p-3.5 text-stone-700 font-semibold">Pre-salary repayment funding gap</td>
                <td className="p-3.5 bg-stone-50/50 font-mono text-amber-900 font-bold">Rp{minimumCalculatedGap.toLocaleString('en-US')}</td>
                <td className="p-3.5 bg-indigo-50/20 font-bold text-stone-900 font-mono">
                  Rp{selectedScenario.simulatedFundingGap.toLocaleString('en-US')}
                </td>
                <td className="p-3.5 text-emerald-800 font-semibold text-[11px]">
                  {selectedScenario.type === 'REQUEST_EXTENSION' && selectedScenario.simulatedFundingGap === 0
                    ? 'Repayment-only gap resolved if lender approves, excluding unconfirmed essential expenses.'
                    : selectedScenario.type === 'BORROW_MORE' && selectedScenario.simulatedFundingGap === 0
                    ? 'Repayment-only gap covered by new borrowing, excluding unconfirmed essential expenses.'
                    : `Rp${selectedScenario.simulatedFundingGap.toLocaleString('en-US')} gap remains`}
                </td>
              </tr>

            </tbody>
          </table>

          {/* Essential Expense Caveat Box */}
          <div className="p-3.5 bg-amber-50/80 border-t border-amber-200/90 text-xs text-amber-900 leading-relaxed font-medium">
            Essential expenses have not been provided. The Rp{selectedScenario.projectedRemainingCash.toLocaleString('en-US')} remaining balance is a repayment-only calculation and must not be presented as disposable cash.
          </div>
        </div>

        {/* Gemini Grounded Assessment Card */}
        <div ref={riskAssessmentRef} className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Gemini Scenario Assessment
              </span>
              <span className="text-[10px] font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                {selectedScenario.sourceScopeTag}
              </span>
            </div>
            <span className="text-[11px] text-stone-500 italic max-w-md text-right">
              {selectedScenario.regulatoryNote}
            </span>
          </div>

          <GeminiResponse content={selectedScenario.geminiAssessment.summary} className="text-sm text-stone-800 leading-relaxed font-medium" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5 space-y-1.5">
              <span className="font-bold text-emerald-950 block uppercase tracking-wider text-[10px]">
                Key Benefits
              </span>
              <ul className="list-disc list-inside text-emerald-900 space-y-1">
                {selectedScenario.geminiAssessment.benefits.map((b, i) => (
                  <li key={i}>
                    <GeminiResponse content={b} compact className="inline text-emerald-900" />
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3.5 space-y-1.5">
              <span className="font-bold text-rose-950 block uppercase tracking-wider text-[10px]">
                Key Risks
              </span>
              <ul className="list-disc list-inside text-rose-900 space-y-1">
                {selectedScenario.geminiAssessment.keyRisks.map((r, i) => (
                  <li key={i}>
                    <GeminiResponse content={r} compact className="inline text-rose-900" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Post-Simulation Action CTA Card */}
        <div className="bg-stone-900 text-white border border-stone-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-800/60">
                {selectedScenario.type === 'REQUEST_EXTENSION' ? 'Lender confirmation required' : 'Risk advisory'}
              </span>
              {addedToPlan && selectedScenario.type === 'REQUEST_EXTENSION' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Added to Action Plan
                </span>
              )}
            </div>
            <h4 className="text-sm font-bold text-white mt-1">
              {selectedScenario.type === 'REQUEST_EXTENSION'
                ? `Request ${selectedScenario.targetInstitution} payment-date adjustment`
                : `Review borrowing risks before committing`}
            </h4>
            <p className="text-xs text-stone-300 mt-1 leading-relaxed max-w-xl">
              {selectedScenario.type === 'REQUEST_EXTENSION'
                ? `Contact ${selectedScenario.targetInstitution} before ${selectedScenario.originalDueDate} and ask whether the Rp${selectedScenario.targetAmount.toLocaleString('en-US')} ${selectedScenario.productName} repayment can be moved to ${selectedScenario.proposedDueDate}.`
                : `Explore non-debt alternatives first. Borrowing adds new obligations and potential fees.`}
            </p>
          </div>

          <button
            onClick={() => {
              onAddActionToPlan?.(selectedScenario);
            }}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95 text-nowrap"
          >
            {selectedScenario.type === 'BORROW_MORE' 
              ? 'Review borrowing risks'
              : (addedToPlan ? 'Continue to Action Plan →' : `Prepare ${selectedScenario.targetInstitution} request →`)}
          </button>
        </div>

      </div>

    </div>
  );
};

