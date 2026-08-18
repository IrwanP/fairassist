import React from 'react';
import { NextBestAction, FinancialContext, FinancialObligation } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { formatBritishDate } from './ActionSimulator';
import { ClipboardList, Clock, UserCheck, Printer, ShieldCheck, Copy, Check, ArrowLeft, ArrowRight } from 'lucide-react';

interface ActionPlanViewProps {
  actions: NextBestAction[];
  context: FinancialContext;
  draftOpenTrigger?: number;
  selectedScenarioType?: 'REQUEST_EXTENSION' | 'BORROW_MORE' | null;
  readyRequestActionIds?: Record<string, { isReady: boolean; readyAt: string }>;
  onMarkRequestReady?: (actionId: string) => void;
  onSelectScenarioType?: (type: 'REQUEST_EXTENSION' | 'BORROW_MORE') => void;
  onOpenUploadModal?: (type: 'camera' | 'screenshot' | 'document') => void;
  onOpenFinancialContextModal?: () => void;
  onConfirmActionExecution?: (actionId: string, counterpartyLabel: string) => void;
  onApproveAction?: (action: NextBestAction) => void;
}

export const ActionPlanView: React.FC<ActionPlanViewProps> = ({ 
  actions, 
  context,
  draftOpenTrigger,
  selectedScenarioType,
  readyRequestActionIds,
  onMarkRequestReady,
  onSelectScenarioType,
  onOpenUploadModal,
  onOpenFinancialContextModal,
  onConfirmActionExecution,
  onApproveAction,
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

    const stepOneAction = Array.isArray(actions) ? actions[0] : undefined;
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

  const primaryLenderAction = React.useMemo(() => {
    if (!Array.isArray(actions) || actions.length === 0) return null;
    return actions.find((a) => a.actionCode === 'PREPARE_EXTENSION' || a.requiresHumanAuthorisation || Boolean(a.authorisingEntity) || a.title.toLowerCase().includes('easycash')) || actions[0] || null;
  }, [actions]);

  const targetActionId = primaryLenderAction?.id || 'action-contact-earliest';
  const isPrimaryApproved = Boolean(primaryLenderAction?.isApprovedByUser);
  const isRequestReady = Boolean(readyRequestActionIds?.[targetActionId]?.isReady);

  const targetObligation = selectedDraftObligation || stepOneObligation;

  const rawLenderName = targetObligation?.institutionName || primaryLenderAction?.authorisingEntity || 'EasyCash';
  const fullLenderName = React.useMemo(() => {
    if (rawLenderName.toLowerCase().includes('easycash') || rawLenderName.toLowerCase().includes('fintopia')) {
      return 'EasyCash (PT Indonesia Fintopia Tech)';
    }
    return rawLenderName;
  }, [rawLenderName]);

  const lenderShortName = fullLenderName.split('(')[0].trim() || 'EasyCash';
  const counterpartyLabel = lenderShortName;

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

  const borrowerMessage = `Hello. I have a repayment of ${amountStr} due on ${currentDueDate}. My confirmed salary date is ${requestedSalaryDate}. Could you please advise whether the repayment date can be moved to ${requestedSalaryDate}?

I understand that any repayment-date change requires ${fullLenderName} confirmation and that the original repayment date remains applicable unless the change is explicitly approved.`;

  const timelineSectionRef = React.useRef<HTMLDivElement>(null);
  const draftRef = React.useRef<HTMLDivElement>(null);

  const handleOpenDraft = (obl: FinancialObligation | null) => {
    setSelectedDraftObligation(obl);
    setIsDraftOpen(true);
    setTimeout(() => {
      const el = document.getElementById('lender-request-pack') || draftRef.current;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      await navigator.clipboard.writeText(borrowerMessage);
    } catch {
      // safe fallback
    }
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  const handleMarkReady = (actionId: string) => {
    if (onMarkRequestReady) {
      onMarkRequestReady(actionId);
    }
  };

  const relevantEvidenceItems = React.useMemo(() => {
    const items: string[] = [];

    // 1. EasyCash / Lender Repayment Notification only
    const hasLenderNotice = (context.evidenceList || []).some((e) => {
      const title = (e.title || '').toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const inst = (e.userConfirmedDetails?.institutionName || e.extractedDetails?.institutionName || '').toLowerCase();
      return inst.includes('easycash') || title.includes('easycash') || (cat.includes('repayment') && !inst.includes('bca') && !inst.includes('adakami'));
    });

    if (hasLenderNotice) {
      items.push('EasyCash Repayment Notification');
    } else {
      items.push('Confirmed repayment notification');
    }

    // 2. Monthly Salary Bank Statement
    const hasSalaryDoc = (context.evidenceList || []).some((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      return cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || title.includes('salary') || title.includes('payroll') || title.includes('statement');
    });

    if (hasSalaryDoc || context.nextSalaryDate) {
      items.push('Monthly Salary Bank Statement');
    }

    return items;
  }, [context.evidenceList, context.nextSalaryDate]);

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
              <span>Review safer alternative</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
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
            <span>Review safer alternative</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      ) : (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Next Step</span>
            <h3 className="text-sm font-bold text-stone-900">
              {isRequestReady
                ? 'Request prepared — ready for borrower to send'
                : isPrimaryApproved
                ? `Prepare the next step with ${lenderShortName}.`
                : 'Review and approve the next step with your lender.'}
            </h3>
          </div>
          <button
            onClick={() => {
              if (!isDraftOpen) {
                handleOpenDraft(stepOneObligation);
              } else {
                const el = document.getElementById('lender-request-pack') || document.getElementById('step-by-step-execution-timeline');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>
              {isRequestReady
                ? 'View lender request pack'
                : isPrimaryApproved
                ? `Prepare ${lenderShortName} request`
                : 'View Action Plan'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
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
            const isApproved = Boolean(act.isApprovedByUser);
            const isActRequestReady = Boolean(readyRequestActionIds?.[act.id]?.isReady);
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
                  className={`bg-white border rounded-2xl p-4 shadow-2xs space-y-3 transition-all ${
                    isApproved ? 'border-emerald-200 ring-1 ring-emerald-400/20' : 'border-stone-200/90'
                  } ${index === 0 ? 'scroll-mt-24' : ''}`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {isApproved ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-900 border-emerald-200 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" /> Human approval confirmed
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-900 border-amber-200">
                          Awaiting borrower approval
                        </span>
                      )}
                      {isActRequestReady && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1">
                          Request prepared
                        </span>
                      )}
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
                      {!isApproved && onApproveAction ? (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Requires borrower approval
                          </span>
                          <button
                            type="button"
                            onClick={() => onApproveAction(act)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                          >
                            <span>Approve & Add to Plan</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Requires {act.authorisingEntity || 'lender'} confirmation
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenDraft(stepOneObligation)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                          >
                            <span>{isActRequestReady ? 'View lender request pack' : `Prepare ${lenderShortName} request`}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {index > 0 && (
                    <div className="flex justify-end items-center gap-2 pt-1 flex-wrap">
                      {!isApproved && onApproveAction && (
                        <button
                          type="button"
                          onClick={() => onApproveAction(act)}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                        >
                          <span>Approve & Add to Plan</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
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

                {/* Phase 3B — Execution-Ready Lender Request Pack */}
                {index === 0 && isDraftOpen && (
                  <div
                    ref={draftRef}
                    id="lender-request-pack"
                    style={{ scrollMarginTop: '96px' }}
                    className="bg-white border-2 border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4 scroll-mt-24"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-bold text-stone-900 tracking-tight">
                            Lender Request Pack — {lenderShortName}
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-900 border-indigo-200">
                            {fullLenderName}
                          </span>
                          {isRequestReady && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1">
                              Request prepared
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Borrower-controlled communication package prepared from confirmed evidence.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                        {lenderShortName} confirmation required
                      </span>
                    </div>

                    {/* Readiness Status Banner */}
                    <div className={`p-3 rounded-xl border text-xs flex items-center justify-between flex-wrap gap-2 ${
                      isRequestReady
                        ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950 font-medium'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${isRequestReady ? 'bg-emerald-500' : 'bg-stone-400'}`} />
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider block text-stone-500">
                            Readiness Status
                          </span>
                          <span className="font-semibold text-xs">
                            {isRequestReady
                              ? 'READY FOR BORROWER TO SEND — NOT SENT BY FAIRASSIST'
                              : 'DRAFT PREPARED — AWAITING BORROWER REVIEW'}
                          </span>
                        </div>
                      </div>
                      {isRequestReady ? (
                        <span className="text-[11px] font-bold text-emerald-800 bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                          Ready to copy & send
                        </span>
                      ) : (
                        <span className="text-[11px] text-stone-500">
                          Click "Mark request ready" when satisfied
                        </span>
                      )}
                    </div>

                    {/* Structured Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-stone-50/80 p-3.5 rounded-xl border border-stone-200 text-xs">
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Lender</span>
                        <span className="font-semibold text-stone-900">{fullLenderName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Repayment Amount</span>
                        <span className="font-semibold text-stone-900">{amountStr}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Original Due Date</span>
                        <span className="font-semibold text-stone-900">{currentDueDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Requested Date</span>
                        <span className="font-semibold text-indigo-700 font-mono">{requestedSalaryDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Reason</span>
                        <span className="font-semibold text-stone-800">Align with confirmed salary date</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Channel</span>
                        <span className="font-semibold text-stone-800">Official {lenderShortName} in-app / CS</span>
                      </div>
                    </div>

                    {/* Prepared Borrower Message Block */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-stone-800 block">
                          Prepared Borrower Message
                        </label>
                        <span className="text-[10px] text-stone-500">
                          Deterministic · Derived from confirmed financial context
                        </span>
                      </div>
                      <div className="bg-stone-900 text-stone-100 rounded-xl p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all shadow-inner border border-stone-800">
                        {borrowerMessage}
                      </div>
                    </div>

                    {/* Relevant Supporting Evidence (Data Minimisation) */}
                    <div className="space-y-2 bg-stone-50/80 p-3.5 rounded-xl border border-stone-200/80">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider">
                          Relevant Supporting Evidence (Data Minimisation)
                        </span>
                        <span className="text-[10px] text-stone-500 font-medium">
                          Only information relevant to this request is included
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {relevantEvidenceItems.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs font-medium bg-white px-2.5 py-1 rounded-lg border border-stone-200 text-stone-800 shadow-2xs">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Safeguards & Lender Confirmation Reminder */}
                    <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-950 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Safeguards & Lender Confirmation Notice</span>
                      </div>
                      <p className="leading-relaxed pl-5.5 text-amber-900">
                        FairAssist prepares the request pack. {lenderShortName} determines whether any repayment-date change is accepted. Until {lenderShortName} confirms a change, the original repayment obligation of {amountStr} on {currentDueDate} remains applicable. FairAssist never contacts the lender on your behalf.
                      </p>
                    </div>

                    {/* Borrower Controls & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-stone-100 gap-3">
                      <button
                        type="button"
                        onClick={handleCloseDraft}
                        className="px-4 py-2 bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-300 hover:border-stone-400 text-stone-800 hover:text-stone-900 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-stone-400/20 active:scale-95 shrink-0"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                        <span>Back to action plan</span>
                      </button>

                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Copy button */}
                        <button
                          type="button"
                          onClick={handleCopyRequest}
                          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl border border-stone-300 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied ✓</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-stone-600" />
                              <span>Copy message</span>
                            </>
                          )}
                        </button>

                        {/* Mark Request Ready CTA */}
                        {isRequestReady ? (
                          <div className="px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                            <span>Request prepared</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarkReady(targetActionId)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Mark request ready</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-stone-500 text-right pt-1">
                      Copies this message only. FairAssist does not send or submit anything to lenders.
                    </p>

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

