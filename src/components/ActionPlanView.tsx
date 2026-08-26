import React from 'react';
import { NextBestAction, FinancialContext, FinancialObligation, ActionOutcomeTrackingState, BorrowerOutcomeStage } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { formatBritishDate } from './ActionSimulator';
import { getExtensionActionId, getInstitutionSlug } from '../utils/canonicalData';
import { 
  ClipboardList, 
  Clock, 
  UserCheck, 
  Printer, 
  ShieldCheck, 
  Copy, 
  Check, 
  ArrowLeft, 
  ArrowRight,
  Send,
  AlertCircle,
  FileText,
  HelpCircle
} from 'lucide-react';

interface ActionPlanViewProps {
  actions: NextBestAction[];
  context: FinancialContext;
  draftOpenTrigger?: number;
  selectedScenarioType?: 'REQUEST_EXTENSION' | 'BORROW_MORE' | null;
  readyRequestActionIds?: Record<string, { isReady: boolean; readyAt: string }>;
  outcomeTracking?: Record<string, ActionOutcomeTrackingState>;
  targetScrollActionId?: string | null;
  onClearTargetActionId?: () => void;
  onMarkRequestReady?: (actionId: string) => void;
  onReportSent?: (actionId: string) => void;
  onRecordLenderOutcome?: (actionId: string, outcome: 'APPROVED' | 'NOT_APPROVED' | 'STILL_WAITING') => void;
  onSelectScenarioType?: (type: 'REQUEST_EXTENSION' | 'BORROW_MORE') => void;
  onOpenUploadModal?: (type: 'camera' | 'screenshot' | 'document', isVerification?: boolean) => void;
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
  outcomeTracking,
  targetScrollActionId,
  onClearTargetActionId,
  onMarkRequestReady,
  onReportSent,
  onRecordLenderOutcome,
  onSelectScenarioType,
  onOpenUploadModal,
  onOpenFinancialContextModal,
  onConfirmActionExecution,
  onApproveAction,
}) => {
  const [selectedDraftObligation, setSelectedDraftObligation] = React.useState<FinancialObligation | null>(null);
  const [isDraftOpen, setIsDraftOpen] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);
  const [isRecordingOutcome, setIsRecordingOutcome] = React.useState(false);
  const [showApprovalConfirm, setShowApprovalConfirm] = React.useState(false);
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

  // Contextual scroll-to-target handler when navigated from specific action recommendations
  React.useEffect(() => {
    if (!targetScrollActionId) return;

    const frameId = requestAnimationFrame(() => {
      const targetId = targetScrollActionId;
      const targetSlug = getInstitutionSlug(targetId);

      const targetEl = 
        document.getElementById(`action-plan-card-${targetId}`) ||
        document.getElementById(targetId) ||
        document.querySelector(`[data-action-id="${targetId}"]`) ||
        document.querySelector(`[data-extension-id="${targetId}"]`) ||
        (targetSlug && targetSlug !== 'lender' ? document.querySelector(`[data-lender-slug="${targetSlug}"]`) : null) ||
        document.getElementById('action-plan-step-1') ||
        document.getElementById('step-by-step-execution-timeline');

      if (targetEl) {
        const headerOffset = 80;
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
      }

      onClearTargetActionId?.();
    });

    return () => cancelAnimationFrame(frameId);
  }, [targetScrollActionId, onClearTargetActionId]);

  const confirmedObligations = React.useMemo(() => {
    return (context.obligations || []).filter(
      (o) => !o.isSalary && ((o.amount !== null && o.amount !== undefined && o.amount > 0) || Boolean(o.institutionName))
    );
  }, [context.obligations]);

  const primaryLenderAction = React.useMemo(() => {
    if (!Array.isArray(actions) || actions.length === 0) return null;
    return actions.find((a) => a.actionCode === 'PREPARE_EXTENSION' || a.requiresHumanAuthorisation || Boolean(a.authorisingEntity) || a.title.toLowerCase().includes('easycash')) || actions[0] || null;
  }, [actions]);

  // Identify the exact canonical obligation that drives Step 1
  const stepOneObligation = React.useMemo(() => {
    if (!confirmedObligations.length) return null;

    const targetAction = primaryLenderAction || (Array.isArray(actions) ? actions[0] : undefined);
    if (targetAction?.authorisingEntity) {
      const match = confirmedObligations.find((o) => {
        const name = (o.institutionName || '').toLowerCase();
        const auth = targetAction.authorisingEntity!.toLowerCase();
        return name.includes(auth) || auth.includes(name);
      });
      if (match) return match;
    }

    const easyCashObl = confirmedObligations.find((o) => (o.institutionName || '').toLowerCase().includes('easycash'));
    if (easyCashObl) return easyCashObl;

    // Fallback: sort by earliest due date
    const sorted = [...confirmedObligations].sort((a, b) => {
      const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });
    return sorted[0];
  }, [confirmedObligations, actions, primaryLenderAction]);

  const targetObligation = selectedDraftObligation || stepOneObligation;
  const rawLenderName = targetObligation?.institutionName || primaryLenderAction?.authorisingEntity || 'EasyCash';
  const targetActionId = getExtensionActionId(rawLenderName);

  const isPrimaryApproved = Boolean(primaryLenderAction?.isApprovedByUser);
  const isRequestReady = Boolean(readyRequestActionIds?.[targetActionId]?.isReady);
  const trackingState = outcomeTracking?.[targetActionId];
  const currentStage: BorrowerOutcomeStage | undefined = trackingState?.stage || (isRequestReady ? 'REQUEST_READY' : undefined);

  const isSent = currentStage === 'BORROWER_REPORTED_SENT' || currentStage === 'AWAITING_LENDER_RESPONSE' || currentStage === 'BORROWER_REPORTED_APPROVED_UNVERIFIED' || currentStage === 'BORROWER_REPORTED_NOT_APPROVED' || currentStage === 'LENDER_APPROVAL_VERIFIED';
  const isReportedApproved = currentStage === 'BORROWER_REPORTED_APPROVED_UNVERIFIED';
  const isVerifiedApproved = currentStage === 'LENDER_APPROVAL_VERIFIED';
  const isReportedNotApproved = currentStage === 'BORROWER_REPORTED_NOT_APPROVED';
  const isAwaitingResponse = currentStage === 'BORROWER_REPORTED_SENT' || currentStage === 'AWAITING_LENDER_RESPONSE';
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
    const targetLenderLower = (rawLenderName || '').toLowerCase();

    // 1. Institution-scoped repayment notice / evidence
    const lenderEvidence = (context.evidenceList || []).filter((e) => {
      const eInst = (e.userConfirmedDetails?.institutionName || e.extractedDetails?.institutionName || e.geminiExtractedDetails?.institutionName || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const fileName = (e.fileName || '').toLowerCase();

      // Skip non-lender documents (e.g. salary, slik)
      const isSalary = cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || title.includes('salary') || title.includes('payroll');
      const isSlik = cat.includes('slik') || cat.includes('ideb') || title.includes('slik') || title.includes('ideb');
      if (isSalary || isSlik) return false;

      // Match specifically to target lender
      if (targetLenderLower.includes('easycash') || targetLenderLower.includes('fintopia')) {
        return eInst.includes('easycash') || eInst.includes('fintopia') || title.includes('easycash') || fileName.includes('easycash');
      }
      if (targetLenderLower.includes('bca') || targetLenderLower.includes('central asia')) {
        return eInst.includes('bca') || eInst.includes('central asia') || title.includes('bca') || fileName.includes('bca') || title.includes('bank repayment');
      }
      if (targetLenderLower.includes('adakami') || targetLenderLower.includes('pembiayaan digital')) {
        return eInst.includes('adakami') || eInst.includes('pembiayaan digital') || title.includes('adakami') || fileName.includes('adakami') || title.includes('pindar active loan');
      }

      return (eInst && (targetLenderLower.includes(eInst) || eInst.includes(targetLenderLower))) ||
             (title && targetLenderLower && title.includes(targetLenderLower));
    });

    if (lenderEvidence.length > 0) {
      for (const ev of lenderEvidence) {
        if (ev.title && !items.includes(ev.title)) {
          items.push(ev.title);
        }
      }
    } else {
      if (targetLenderLower.includes('easycash') || targetLenderLower.includes('fintopia')) {
        items.push('EasyCash Repayment Notification');
      } else if (targetLenderLower.includes('bca') || targetLenderLower.includes('central asia')) {
        items.push('Bank Repayment SMS & App Notice');
      } else if (targetLenderLower.includes('adakami') || targetLenderLower.includes('pembiayaan digital')) {
        items.push('Pindar Active Loan Screen');
      } else {
        items.push(`${lenderShortName} Repayment Notification`);
      }
    }

    // 2. Shared Monthly Salary Bank Statement
    const hasSalaryDoc = (context.evidenceList || []).some((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      return cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || title.includes('salary') || title.includes('payroll') || title.includes('statement');
    });

    if (hasSalaryDoc || context.nextSalaryDate) {
      items.push('Monthly Salary Bank Statement');
    }

    return items;
  }, [context.evidenceList, context.nextSalaryDate, rawLenderName, lenderShortName]);

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
        <div id="scenario-b-context-banner" className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
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
      ) : isVerifiedApproved ? (
        <div className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Status: Lender Approval Verified</span>
            <h3 className="text-sm font-bold text-emerald-950">
              Lender approval verified — Repayment shifted to 28 August 2026
            </h3>
            <p className="text-xs text-emerald-800">
              EasyCash confirmed moving {amountStr} to your salary date on 28 August 2026 based on verified evidence supplied by borrower.
            </p>
          </div>
          <button
            onClick={() => handleOpenDraft(stepOneObligation)}
            className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>View lender request pack</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      ) : isReportedApproved ? (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Action Required</span>
            <h3 className="text-sm font-bold text-amber-950">
              Lender approval reported by borrower — verification required
            </h3>
            <p className="text-xs text-amber-800">
              The repayment date has not been changed in FairAssist yet. Add evidence to verify lender confirmation.
            </p>
          </div>
          <button
            onClick={() => onOpenUploadModal?.('screenshot', true)}
            className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>Add lender response evidence</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      ) : isReportedNotApproved ? (
        <div className="bg-stone-100 border border-stone-300 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider">Outcome Recorded</span>
            <h3 className="text-sm font-bold text-stone-900">
              Not approved — original repayment remains due
            </h3>
            <p className="text-xs text-stone-600">
              {amountStr} remains due on {currentDueDate}.
            </p>
          </div>
          <button
            onClick={() => {
              handleOpenDraft(stepOneObligation);
            }}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>View lender request pack</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      ) : isAwaitingResponse ? (
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Status: Sent by borrower</span>
            <h3 className="text-sm font-bold text-blue-950">
              Sent by borrower — awaiting lender response
            </h3>
            <p className="text-xs text-blue-900">
              FairAssist did not send this request. {amountStr} remains due on {currentDueDate} until confirmed.
            </p>
          </div>
          <button
            onClick={() => {
              handleOpenDraft(stepOneObligation);
              setIsRecordingOutcome(true);
            }}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>Record lender response</span>
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
            const actOutcome = outcomeTracking?.[act.id];
            const actStage = actOutcome?.stage;
            const actIsVerifiedApproved = actStage === 'LENDER_APPROVAL_VERIFIED';
            const actIsReportedApproved = actStage === 'BORROWER_REPORTED_APPROVED_UNVERIFIED';
            const actIsReportedNotApproved = actStage === 'BORROWER_REPORTED_NOT_APPROVED';
            const actIsAwaitingResponse = actStage === 'BORROWER_REPORTED_SENT' || actStage === 'AWAITING_LENDER_RESPONSE';
            const isActRequestReady = Boolean(readyRequestActionIds?.[act.id]?.isReady);

            const actObligation = confirmedObligations.find((o) => {
              const oName = (o.institutionName || '').toLowerCase();
              const actEntity = (act.authorisingEntity || '').toLowerCase();
              const actTitle = (act.title || '').toLowerCase();
              return (actEntity && (oName.includes(actEntity) || actEntity.includes(oName))) ||
                     (oName && actTitle.includes(oName));
            }) || (index === 0 ? stepOneObligation : undefined);

            const actLenderShortName = (act.authorisingEntity || actObligation?.institutionName || 'lender').split('(')[0].trim();
            const actLenderSlug = getInstitutionSlug(act.authorisingEntity || actObligation?.institutionName);
            const actExtensionId = getExtensionActionId(act.authorisingEntity || actObligation?.institutionName);
            const actAmountStr = actObligation?.amount ? `Rp${actObligation.amount.toLocaleString('en-US')}` : 'obligation';
            const actDueDateStr = actObligation?.formattedDate || (actObligation?.dueDate ? formatBritishDate(actObligation.dueDate) : 'due date');

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
                  id={index === 0 ? "action-plan-step-1" : `action-plan-card-${act.id}`}
                  data-action-id={act.id}
                  data-extension-id={actExtensionId}
                  data-lender-slug={actLenderSlug}
                  style={{ scrollMarginTop: '88px' }}
                  className={`bg-white border rounded-2xl p-4 shadow-2xs space-y-3 transition-all scroll-mt-24 ${
                    isApproved ? 'border-emerald-200 ring-1 ring-emerald-400/20' : 'border-stone-200/90'
                  }`}
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
                      {actIsVerifiedApproved ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-900 border-emerald-300 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" /> Lender approval verified
                        </span>
                      ) : actIsReportedApproved ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-900 border-amber-300 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-600 stroke-[2.5]" /> Lender approval reported · verification required
                        </span>
                      ) : actIsReportedNotApproved ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-stone-100 text-stone-800 border-stone-300 flex items-center gap-1">
                          Not approved · original repayment remains due
                        </span>
                      ) : actIsAwaitingResponse ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-blue-50 text-blue-900 border-blue-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-600 stroke-[2.5]" /> Sent by borrower · awaiting lender response
                        </span>
                      ) : isActRequestReady ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1">
                          Request prepared
                        </span>
                      ) : isApproved ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-900 border-emerald-200 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" /> Human approval confirmed
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-900 border-amber-200">
                          Awaiting borrower approval
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

                  {(!isDraftOpen || selectedDraftObligation !== actObligation) && (
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
                      ) : actIsVerifiedApproved ? (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                            Lender approval verified · Due 28 August 2026
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenDraft(actObligation || stepOneObligation)}
                            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                          >
                            <span>View verified details</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      ) : actIsReportedApproved ? (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                            Approval reported · verification required
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenUploadModal?.('screenshot', true)}
                            className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>Add lender response evidence</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      ) : actIsReportedNotApproved ? (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-stone-700 font-semibold bg-stone-100 px-2 py-0.5 rounded border border-stone-300">
                            {actAmountStr} remains due on {actDueDateStr}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenDraft(actObligation || stepOneObligation)}
                            className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                          >
                            <span>View lender request pack</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      ) : actIsAwaitingResponse ? (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-blue-900 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            Sent by borrower · FairAssist did not send
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenDraft(actObligation || stepOneObligation);
                              setIsRecordingOutcome(true);
                            }}
                            className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                          >
                            <span>Record lender response</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      ) : actObligation || act.category === 'DO TODAY' || act.actionCode === 'PREPARE_EXTENSION' ? (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Requires {act.authorisingEntity || 'lender'} confirmation
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenDraft(actObligation || stepOneObligation)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                          >
                            <span>{isActRequestReady ? 'View lender request pack' : `Prepare ${actLenderShortName} request`}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end items-center gap-2 w-full">
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
                      isReportedApproved
                        ? 'bg-amber-50/90 border-amber-300 text-amber-950 font-medium'
                        : isReportedNotApproved
                        ? 'bg-stone-100 border-stone-300 text-stone-800 font-medium'
                        : isAwaitingResponse
                        ? 'bg-blue-50/90 border-blue-200 text-blue-950 font-medium'
                        : isRequestReady
                        ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950 font-medium'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          isReportedApproved 
                            ? 'bg-amber-500' 
                            : isReportedNotApproved
                            ? 'bg-stone-500'
                            : isAwaitingResponse
                            ? 'bg-blue-500'
                            : isRequestReady
                            ? 'bg-emerald-500'
                            : 'bg-stone-400'
                        }`} />
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider block text-stone-500">
                            Readiness & Outcome Status
                          </span>
                          <span className="font-semibold text-xs">
                            {isReportedApproved
                              ? 'LENDER APPROVAL REPORTED BY BORROWER — VERIFICATION REQUIRED'
                              : isReportedNotApproved
                              ? 'NOT APPROVED — ORIGINAL REPAYMENT REMAINS DUE'
                              : isAwaitingResponse
                              ? 'SENT BY BORROWER — AWAITING LENDER RESPONSE'
                              : isRequestReady
                              ? 'READY FOR BORROWER TO SEND — NOT SENT BY FAIRASSIST'
                              : 'DRAFT PREPARED — AWAITING BORROWER REVIEW'}
                          </span>
                        </div>
                      </div>
                      {isReportedApproved ? (
                        <span className="text-[11px] font-bold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-300">
                          Verification required
                        </span>
                      ) : isReportedNotApproved ? (
                        <span className="text-[11px] font-bold text-stone-800 bg-white px-2 py-0.5 rounded border border-stone-300">
                          Original due date active
                        </span>
                      ) : isAwaitingResponse ? (
                        <span className="text-[11px] font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                          Awaiting lender response
                        </span>
                      ) : isRequestReady ? (
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

                        {/* Phase 3B/3C State Controls */}
                        {!isRequestReady ? (
                          <button
                            type="button"
                            onClick={() => handleMarkReady(targetActionId)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Mark request ready</span>
                          </button>
                        ) : !isSent ? (
                          <>
                            <div className="px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                              <span>Request prepared</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onReportSent?.(targetActionId);
                              }}
                              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>I sent this request myself</span>
                            </button>
                          </>
                        ) : isAwaitingResponse ? (
                          <>
                            <div className="px-3 py-2 bg-blue-50 border border-blue-300 text-blue-900 text-xs font-bold rounded-xl flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-blue-600 stroke-[2.5]" />
                              <span>Sent by borrower</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRecordingOutcome(true);
                                setShowApprovalConfirm(false);
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Record lender response</span>
                            </button>
                          </>
                        ) : isVerifiedApproved ? (
                          <>
                            <div className="px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                              <span>Lender approval verified</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRecordingOutcome(true);
                                setShowApprovalConfirm(false);
                              }}
                              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl border border-stone-300 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                            >
                              <span>Update response</span>
                            </button>
                          </>
                        ) : isReportedApproved ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenUploadModal?.('screenshot', true)}
                              className="px-4 py-2 bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Add lender response evidence</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRecordingOutcome(true);
                                setShowApprovalConfirm(false);
                              }}
                              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl border border-stone-300 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                            >
                              <span>Update response</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="px-3 py-2 bg-stone-100 border border-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
                              <span>Not approved</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRecordingOutcome(true);
                                setShowApprovalConfirm(false);
                              }}
                              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl border border-stone-300 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                            >
                              <span>Update response</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stage Footnote / Attribution notice */}
                    <p className="text-[11px] text-stone-500 text-right pt-1">
                      {isVerifiedApproved
                        ? 'Lender approval verified via borrower-supplied evidence. FairAssist did not contact EasyCash directly. Repayment due date updated to 28 August 2026.'
                        : isReportedApproved
                        ? 'Lender approval reported by borrower — verification required. The repayment date has not been changed in FairAssist yet.'
                        : isReportedNotApproved
                        ? `Not approved — original repayment remains due. ${amountStr} remains due on ${currentDueDate}.`
                        : isAwaitingResponse
                        ? 'Sent by borrower. FairAssist did not send this request. Repayment remains due until confirmed.'
                        : isRequestReady
                        ? "FairAssist did not send this request. Clicking 'I sent this request myself' records your action locally."
                        : 'Copies this message only. FairAssist does not send or submit anything to lenders.'}
                    </p>

                    {/* Phase 3C — Record Lender Response Choice Interface */}
                    {isRecordingOutcome && (
                      <div className="mt-4 pt-4 border-t-2 border-indigo-100 bg-stone-50/90 rounded-xl p-4 space-y-4">
                        {showApprovalConfirm ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 text-amber-950">
                            <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                              <span>Confirm Reported Approval</span>
                            </div>
                            <p className="text-xs leading-relaxed text-amber-900 font-medium">
                              Confirm that EasyCash approved moving the Rp650,000 repayment from 24 August 2026 to 28 August 2026.
                            </p>
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                              This records a borrower-reported approval. The repayment date will not be changed in FairAssist until confirmed evidence is added and verified.
                            </p>
                            <div className="flex items-center gap-2.5 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onRecordLenderOutcome?.(targetActionId, 'APPROVED');
                                  setIsRecordingOutcome(false);
                                  setShowApprovalConfirm(false);
                                }}
                                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Confirm reported approval</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowApprovalConfirm(false)}
                                className="px-4 py-2 bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold rounded-xl border border-stone-300 transition-all cursor-pointer active:scale-95"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                                  Record Lender Response
                                </h5>
                                <p className="text-xs text-stone-500">
                                  Select the outcome reported by {lenderShortName} for your request to move the repayment to {requestedSalaryDate}:
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsRecordingOutcome(false)}
                                className="text-xs text-stone-500 hover:text-stone-700 font-semibold px-2 py-1 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              {/* Option 1: Approved */}
                              <button
                                type="button"
                                onClick={() => setShowApprovalConfirm(true)}
                                className="p-3 bg-white hover:bg-emerald-50/70 border border-stone-200 hover:border-emerald-300 rounded-xl text-left transition-all cursor-pointer shadow-2xs group space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-950">
                                    Approved
                                  </span>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                <p className="text-[11px] text-stone-500 leading-snug">
                                  {lenderShortName} agreed to shift the repayment date to {requestedSalaryDate}.
                                </p>
                              </button>

                              {/* Option 2: Not approved */}
                              <button
                                type="button"
                                onClick={() => {
                                  onRecordLenderOutcome?.(targetActionId, 'NOT_APPROVED');
                                  setIsRecordingOutcome(false);
                                }}
                                className="p-3 bg-white hover:bg-stone-100 border border-stone-200 hover:border-stone-400 rounded-xl text-left transition-all cursor-pointer shadow-2xs group space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-stone-900">
                                    Not approved
                                  </span>
                                  <AlertCircle className="w-3.5 h-3.5 text-stone-500" />
                                </div>
                                <p className="text-[11px] text-stone-500 leading-snug">
                                  {lenderShortName} declined. {amountStr} remains due on {currentDueDate}.
                                </p>
                              </button>

                              {/* Option 3: Still waiting */}
                              <button
                                type="button"
                                onClick={() => {
                                  onRecordLenderOutcome?.(targetActionId, 'STILL_WAITING');
                                  setIsRecordingOutcome(false);
                                }}
                                className="p-3 bg-white hover:bg-blue-50/70 border border-stone-200 hover:border-blue-300 rounded-xl text-left transition-all cursor-pointer shadow-2xs group space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-blue-900 group-hover:text-blue-950">
                                    Still waiting
                                  </span>
                                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <p className="text-[11px] text-stone-500 leading-snug">
                                  No response yet. Awaiting lender response.
                                </p>
                              </button>
                            </div>
                          </div>
                        )}
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

