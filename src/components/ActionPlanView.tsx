import React from 'react';
import { NextBestAction, FinancialContext, FinancialObligation } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { formatBritishDate } from './ActionSimulator';
import { ClipboardList, Clock, UserCheck, Printer, ShieldCheck, Copy, Check, ArrowLeft } from 'lucide-react';

interface ActionPlanViewProps {
  actions: NextBestAction[];
  context: FinancialContext;
  draftOpenTrigger?: number;
  selectedScenarioType?: 'REQUEST_EXTENSION' | 'BORROW_MORE' | null;
  onSelectScenarioType?: (type: 'REQUEST_EXTENSION' | 'BORROW_MORE') => void;
  onOpenUploadModal?: (type: 'camera' | 'screenshot' | 'document') => void;
  onOpenFinancialContextModal?: () => void;
  onConfirmActionExecution?: (actionId: string, counterpartyLabel: string) => void;
}

export const ActionPlanView: React.FC<ActionPlanViewProps> = ({ 
  actions, 
  context,
  draftOpenTrigger,
  selectedScenarioType,
  onSelectScenarioType,
  onOpenUploadModal,
  onOpenFinancialContextModal,
  onConfirmActionExecution
}) => {
  const [selectedDraftObligation, setSelectedDraftObligation] = React.useState<FinancialObligation | null>(null);
  const [isDraftOpen, setIsDraftOpen] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);
  const [executedActions, setExecutedActions] = React.useState<Record<string, { isExecuted: boolean; executedAt: string }>>({});

  const handleConfirmExecution = (actionId: string, counterparty: string) => {
    setExecutedActions((prev) => ({
      ...prev,
      [actionId]: {
        isExecuted: true,
        executedAt: new Date().toLocaleTimeString('id-ID')
      }
    }));

    onConfirmActionExecution?.(actionId, counterparty);
  };

  React.useEffect(() => {
    if (!context.obligations || context.obligations.length === 0) {
      setExecutedActions({});
      setIsDraftOpen(false);
      setIsCopied(false);
    }
  }, [context.obligations]);

  React.useEffect(() => {
    if (selectedScenarioType === 'BORROW_MORE') {
      const timer = setTimeout(() => {
        const el = document.getElementById('scenario-b-context-banner');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedScenarioType]);

  const confirmedObligations = React.useMemo(() => {
    return (context.obligations || []).filter(
      (o) => !o.isSalary && ((o.amount !== null && o.amount !== undefined && o.amount > 0) || Boolean(o.institutionName))
    );
  }, [context.obligations]);

  // Identify the exact canonical obligation that drives Step 1
  const stepOneObligation = React.useMemo(() => {
    if (!confirmedObligations.length) return null;

    const stepOneAction = actions[0];
    if (stepOneAction?.authorisingEntity) {
      const match = confirmedObligations.find((o) => {
        const name = (o.institutionName || '').toLowerCase();
        const auth = stepOneAction.authorisingEntity!.toLowerCase();
        return name.includes(auth) || auth.includes(name);
      });
      if (match) return match;
    }

    // Fallback: sort by earliest due date
    const sorted = [...confirmedObligations].sort((a, b) => {
      const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });
    return sorted[0];
  }, [confirmedObligations, actions]);

  const targetObligation = selectedDraftObligation || stepOneObligation;

  const rawLenderName = targetObligation?.institutionName || actions[0]?.authorisingEntity || '';
  const lenderName = rawLenderName.split('(')[0].trim() || 'the relevant institution';
  const counterpartyLabel = lenderName;

  const amountStr = targetObligation?.amount
    ? `Rp${targetObligation.amount.toLocaleString('en-US')}`
    : 'Rp650,000';

  const currentDueDate =
    targetObligation?.formattedDate ||
    (targetObligation?.dueDate
      ? formatBritishDate(targetObligation.dueDate)
      : '24 August 2026');

  const requestedSalaryDate = context.nextSalaryDate
    ? formatBritishDate(context.nextSalaryDate)
    : '28 August 2026';

  const defaultMessage = `Hello ${lenderName} Support,\n\nI would like to ask whether my ${amountStr} repayment currently due on ${currentDueDate} can be moved to ${requestedSalaryDate}, which is my confirmed salary date.\n\nI understand that any change is subject to ${lenderName} confirmation and that the original repayment date remains applicable unless ${lenderName} confirms otherwise.\n\nThank you.`;

  const [draftMessage, setDraftMessage] = React.useState(defaultMessage);

  React.useEffect(() => {
    setDraftMessage(defaultMessage);
  }, [defaultMessage]);

  const timelineSectionRef = React.useRef<HTMLDivElement>(null);
  const draftRef = React.useRef<HTMLDivElement>(null);

  const handleOpenDraft = (obl: FinancialObligation | null) => {
    setSelectedDraftObligation(obl);
    setIsDraftOpen(true);
    setTimeout(() => {
      draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleCloseDraft = () => {
    setIsDraftOpen(false);
    setTimeout(() => {
      const timelineEl = document.getElementById('step-by-step-execution-timeline') || timelineSectionRef.current;
      if (timelineEl) {
        timelineEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyRequest = async () => {
    try {
      await navigator.clipboard.writeText(draftMessage);
    } catch {
      // fallback
    }
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  const hasConfirmedObligations = confirmedObligations.length > 0;
  const hasCashContext = context.availableCash !== null && context.availableCash !== undefined;
  const hasSalaryContext = Boolean(context.nextSalaryDate) && context.nextSalaryAmount !== null && context.nextSalaryAmount !== undefined;

  const simulatorReady = hasConfirmedObligations && hasCashContext && hasSalaryContext;

  const userName = context.userPersona?.name || 'Borrower';
  const formattedSalaryDate = context.nextSalaryDate ? formatBritishDate(context.nextSalaryDate) : 'payday';

  const confirmedLendersList = Array.from(new Set(confirmedObligations.map((o) => o.institutionName).filter(Boolean)));
  const lendersText = confirmedLendersList.length > 0 
    ? confirmedLendersList.join(' or ') 
    : 'your lender';

  // Deduplicate actions by stable key
  const deduplicatedActions = React.useMemo(() => {
    const seen = new Set<string>();
    const result: NextBestAction[] = [];

    for (const act of actions) {
      const key = act.actionCode && act.actionCode !== 'CUSTOM'
        ? `${act.actionCode}-${act.authorisingEntity || ''}`
        : act.title.toLowerCase().trim();

      if (!seen.has(key)) {
        seen.add(key);
        result.push(act);
      }
    }
    return result;
  }, [actions]);

  const evidenceChecklistItems = React.useMemo(() => {
    const items: string[] = [];

    // 1. Confirmed repayment notice(s)
    const repaymentNotices = (context.evidenceList || []).filter((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      return !cat.includes('salary') && !cat.includes('payroll') && !cat.includes('slik') && !cat.includes('ideb') &&
             !title.includes('salary') && !title.includes('payroll') && !title.includes('slik') && !title.includes('ideb');
    });

    if (repaymentNotices.length > 0) {
      const lenderNames = Array.from(
        new Set(
          repaymentNotices
            .map((e) => e.userConfirmedDetails?.institutionName || e.extractedDetails?.institutionName || e.title)
            .filter(Boolean)
        )
      ).join(', ');
      items.push(`Confirmed repayment notice(s)${lenderNames ? ` (${lenderNames})` : ''}`);
    } else {
      items.push('Confirmed repayment notice(s)');
    }

    // 2. Monthly Salary Bank Statement vs user-provided salary info
    const hasSalaryDoc = (context.evidenceList || []).some((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      return cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || title.includes('salary') || title.includes('payroll') || title.includes('statement');
    });

    if (hasSalaryDoc) {
      items.push('Monthly Salary Bank Statement');
    } else if (context.nextSalaryDate) {
      items.push('Confirmed salary information (user-provided)');
    }

    // 3. iDeb SLIK evidence, only if present in canonical state
    const hasSlikEvidence = (context.evidenceList || []).some((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      return cat.includes('slik') || cat.includes('ideb') || title.includes('slik') || title.includes('ideb');
    });

    if (hasSlikEvidence) {
      items.push('iDeb SLIK credit report evidence');
    }

    return items;
  }, [context.evidenceList, context.nextSalaryDate]);

  // STATE 1: Zero confirmed obligations -> Empty State
  if (!hasConfirmedObligations) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
            ACTION PLAN
          </span>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Your action plan will appear here
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            Confirm repayment evidence first so FairAssist can build prioritised, evidence-grounded next steps.
          </p>
        </div>

        <div className="bg-white border border-stone-200/90 rounded-2xl p-8 shadow-2xs text-center space-y-4 max-w-2xl mx-auto my-8">
          <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-stone-900">
              Add repayment evidence first
            </h3>
            <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
              FairAssist needs at least one confirmed repayment obligation before it can construct an action plan.
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
  if (!simulatorReady && actions.length === 0) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
            Executable Execution Roadmap
          </span>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Prioritised Action Plan for {userName}
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            Step-by-step guidance derived from verified financial evidence.
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
              FairAssist has your repayment obligation, but needs your available cash and salary timing before it can recommend an action plan.
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

  const isPrimarySent = Boolean(
    executedActions['step-1-request']?.isExecuted ||
    actions[0]?.currentSourceStatus === 'ACTION SENT' ||
    actions.some((a) => a.currentSourceStatus === 'ACTION SENT')
  );

  React.useEffect(() => {
    if (isPrimarySent || (draftOpenTrigger && draftOpenTrigger > 0)) {
      setIsDraftOpen(true);
    }
  }, [isPrimarySent, draftOpenTrigger]);

  // Top Next Step Card
  return (
    <div className="space-y-6 max-w-5xl mx-auto print:p-0">
      
      {/* Page Header */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
            Executable Execution Roadmap
          </span>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Prioritised Action Plan for {userName}
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            Consolidated step-by-step instructions leading to {formattedSalaryDate} salary.
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs flex items-center gap-2 cursor-pointer transition-all print:hidden"
        >
          <Printer className="w-4 h-4" />
          Print / Export Action Plan
        </button>
      </div>

      {/* Selected Scenario Context Banner if Scenario B */}
      {selectedScenarioType === 'BORROW_MORE' && (
        <div id="scenario-b-context-banner" className="scroll-mt-24 bg-amber-50/90 border border-amber-300 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded border border-amber-300">
              SELECTED SCENARIO · HIGHER RISK
            </span>
          </div>
          <h3 className="text-sm font-bold text-amber-950">
            Borrow Rp1.75M to cover the repayment-only gap
          </h3>
          <p className="text-xs text-amber-900 leading-relaxed">
            Borrowing Rp1.75M would cover the current repayment-only gap, but it would create a fourth repayment obligation. Repayment timing, total repayment amount, interest and fees are not yet known. Essential living expenses are not included.
          </p>
          <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold text-amber-950">
              FairAssist recommends reviewing a non-debt alternative before committing to new borrowing.
            </p>
            <button
              onClick={() => {
                onSelectScenarioType?.('REQUEST_EXTENSION');
              }}
              className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
            >
              <span>Review safer alternative →</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Next Step Card */}
      {selectedScenarioType === 'BORROW_MORE' ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Next Step</span>
            <h3 className="text-sm font-bold text-amber-950">
              Review the risks before taking on new borrowing.
            </h3>
          </div>
          <button
            onClick={() => onSelectScenarioType?.('REQUEST_EXTENSION')}
            className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>Review safer alternative →</span>
          </button>
        </div>
      ) : (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Next Step</span>
            <h3 className="text-sm font-bold text-stone-900">
              {isPrimarySent
                ? `${counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'Lender'} request sent — awaiting response`
                : 'Prepare the next step with your lender.'}
            </h3>
          </div>
          <button
            onClick={() => {
              if (!isDraftOpen) {
                handleOpenDraft(stepOneObligation);
              } else {
                const el = document.getElementById('lender-request-draft-card') || document.getElementById('step-by-step-execution-timeline');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>
              {isPrimarySent
                ? 'View sent request →'
                : `Prepare ${
                    counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'lender'
                  } request →`}
            </span>
          </button>
        </div>
      )}

      {/* Sequential Action Timeline */}
      <div
        id="step-by-step-execution-timeline"
        ref={timelineSectionRef}
        style={{ scrollMarginTop: '104px' }}
        className="space-y-4 scroll-mt-28"
      >
        <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
          Step-by-Step Execution Timeline
        </h3>

        <div className="space-y-3">
          {deduplicatedActions.map((act, index) => {
            let authLabel = "EXTERNAL CONFIRMATION REQUIRED";
            let authValue = act.authorisingEntity || "EasyCash";

            if (!act.requiresHumanAuthorisation) {
              if (act.actionCode === 'AVOID_NEW_BORROWING' || act.category === 'AVOID FOR NOW' || act.title.toLowerCase().includes('avoid')) {
                authLabel = "ACTION TYPE";
                authValue = "Advisory";
              } else {
                authLabel = "DECISION OWNER";
                authValue = "User";
              }
            }

            return (
              <React.Fragment key={act.id}>
                <div
                  id={index === 0 ? "action-plan-step-1" : undefined}
                  style={index === 0 ? { scrollMarginTop: '96px' } : undefined}
                  className={`bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs space-y-3 ${index === 0 ? 'scroll-mt-24' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-bold font-mono">
                        {index + 1}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        act.category === 'DO TODAY'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                          : act.category === 'REVIEW NEXT'
                          ? 'bg-amber-100 text-amber-900 border-amber-200'
                          : 'bg-stone-100 text-stone-800 border-stone-200'
                      }`}>
                        {act.category}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-stone-500">
                      {act.currentSourceStatus}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-stone-900">
                      {act.title}
                    </h4>
                    <GeminiResponse content={act.reason} compact />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-stone-50 p-3 rounded-xl border border-stone-200/80">
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">Financial Impact</span>
                      <GeminiResponse content={act.financialImpact} compact />
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">{authLabel}</span>
                      <span className="font-semibold text-stone-800">
                        {authValue}
                      </span>
                    </div>
                  </div>

                  {index === 0 && !isDraftOpen && (
                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      {isPrimarySent ? (
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          {counterpartyLabel !== 'the relevant institution'
                            ? `✓ Sent by user · awaiting ${counterpartyLabel} response`
                            : `✓ Sent by user · awaiting external response`}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Requires human authorisation
                        </span>
                      )}
                    </div>
                  )}

                  {index > 0 && (
                    <div className="flex justify-end pt-1">
                      {executedActions[act.id]?.isExecuted ? (
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> Review complete · recorded by user
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConfirmExecution(act.id, act.authorisingEntity ? act.authorisingEntity.split('(')[0].trim() : 'the relevant institution')}
                          className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl border border-stone-300 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                        >
                          <Check className="w-3.5 h-3.5 text-stone-600" />
                          <span>✓ Mark review complete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {index === 0 && isDraftOpen && (
                  <div
                    ref={draftRef}
                    id="lender-request-draft-card"
                    style={{ scrollMarginTop: '96px' }}
                    className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4 scroll-mt-24"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-stone-900">
                            {isPrimarySent ? 'Sent Request' : 'Lender Request Draft'}
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-900 border-amber-200">
                            {isPrimarySent
                              ? `Awaiting ${counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'EasyCash'} response`
                              : `Requires ${counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'institution'} confirmation`}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {isPrimarySent
                            ? `${counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'EasyCash'} request sent — awaiting response.`
                            : `Review the information before contacting ${counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'the institution'}.`}
                        </p>
                      </div>
                    </div>

                    {/* Compact Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80 text-xs">
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Lender</span>
                        <span className="font-semibold text-stone-800">{lenderName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Repayment amount</span>
                        <span className="font-semibold text-stone-800">{amountStr}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Current due date</span>
                        <span className="font-semibold text-stone-800">{currentDueDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Requested date</span>
                        <span className="font-semibold text-indigo-700">{requestedSalaryDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Reason</span>
                        <span className="font-semibold text-stone-800">Align repayment with confirmed salary date</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Request status</span>
                        {isPrimarySent ? (
                          <span className="font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1 mt-0.5">
                            <Check className="w-3 h-3 text-emerald-600" /> Sent by user · Awaiting {counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'EasyCash'} response
                          </span>
                        ) : (
                          <span className="font-semibold text-stone-600 bg-stone-200/70 px-1.5 py-0.5 rounded text-[11px] inline-block mt-0.5">
                            Not submitted
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Responsible Decision-Support Notice */}
                    <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-900 leading-relaxed flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        FairAssist prepares the request. {counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'The relevant institution'} determines whether any repayment-date change is accepted. The original repayment obligation remains applicable unless {counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'the institution'} confirms a change.
                      </span>
                    </div>

                    {/* Editable Textarea */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-stone-700 block">
                        Request Message
                      </label>
                      <textarea
                        value={draftMessage}
                        onChange={(e) => setDraftMessage(e.target.value)}
                        rows={6}
                        className="w-full text-xs font-mono bg-stone-50 border border-stone-200 rounded-xl p-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed resize-y"
                      />
                    </div>

                    {/* Draft Actions & Copy */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-stone-100 gap-3">
                      <button
                        type="button"
                        onClick={handleCloseDraft}
                        className="px-4 py-2 bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-300 hover:border-stone-400 text-stone-800 hover:text-stone-900 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-stone-400/20 active:scale-95 shrink-0"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                        <span>Back to action plan</span>
                      </button>

                      <div className="flex flex-col sm:items-end gap-1">
                        <button
                          type="button"
                          onClick={handleCopyRequest}
                          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 self-start sm:self-auto"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Copied ✓</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy request</span>
                            </>
                          )}
                        </button>

                        <p className="text-[11px] text-stone-500 leading-tight">
                          {isCopied ? (
                            <span className="text-emerald-700 font-medium">
                              Copied. Paste it into an official channel for {counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'the relevant institution'}.
                            </span>
                          ) : (
                            'Copies this request only. FairAssist does not send it.'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Human Execution Confirmation Section */}
                    {!isPrimarySent ? (
                      <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3.5 space-y-2 mt-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Human Execution Confirmation</span>
                            <p className="text-xs text-stone-600">
                              {counterpartyLabel !== 'the relevant institution'
                                ? `Confirm only after you have sent it through an official channel for ${counterpartyLabel}.`
                                : `Confirm only after you have sent it through the relevant institution's official channel.`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleConfirmExecution('step-1-request', counterpartyLabel)}
                            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                            <span>✓ I sent this request</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3.5 space-y-1 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                          <span className="text-xs font-bold text-emerald-950">
                            {counterpartyLabel !== 'the relevant institution'
                              ? `✓ Sent by user · awaiting ${counterpartyLabel} response`
                              : `✓ Sent by user · awaiting external response`}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800 leading-relaxed pl-6">
                          Action recorded in FairAssist. The original repayment obligation remains applicable until {counterpartyLabel !== 'the relevant institution' ? counterpartyLabel : 'the institution'} confirms a change.
                        </p>
                      </div>
                    )}

                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Information to prepare for lender discussion */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-3 text-amber-950">
        <div className="flex items-center gap-2 font-bold text-sm">
          <UserCheck className="w-4 h-4 text-amber-700" />
          Information to prepare for lender discussion
        </div>
        
        <p className="text-xs text-amber-900 leading-relaxed">
          When contacting a lender, use only the relevant confirmed evidence already available in FairAssist. The lender determines whether additional documents are required.
        </p>

        <ul className="list-disc list-inside text-xs space-y-1 font-medium text-amber-900">
          {evidenceChecklistItems.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>

        <p className="text-[11px] text-amber-800 italic pt-1 border-t border-amber-200">
          FairAssist provides decision support. Final lending term changes require human approval by an authorised officer.
        </p>
      </div>

    </div>
  );
};

