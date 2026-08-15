import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, FinancialContext, AgentActivity, FocusTarget, RetrievalResult } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { TrustedSourceRegistry } from '../data/sourcesConfig';

const CompactTrustedSources: React.FC<{ sources: RetrievalResult[] }> = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="pt-2 border-t border-stone-100 space-y-1.5 text-[10px] w-full">
      <div className="flex items-center justify-between font-medium text-stone-500">
        <span className="flex items-center gap-1 font-semibold text-stone-600">
          Trusted sources matched · {sources.length}
        </span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-indigo-600 hover:text-indigo-800 hover:underline font-bold text-[10px] cursor-pointer transition-colors"
        >
          {isExpanded ? 'Hide sources' : 'View sources'}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-1.5 pt-1">
          {sources.map((s, idx) => {
            const resolved = TrustedSourceRegistry.resolve(s.id || s.sourceTitle || s.url);
            return (
              <div key={idx} className="flex flex-col bg-stone-50 p-2.5 rounded-xl border border-stone-200/80 gap-1 w-full break-words [overflow-wrap:anywhere]">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-stone-900 truncate max-w-[180px]">{resolved.organisation}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                    resolved.status === 'Current' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {resolved.displayStatusText}
                  </span>
                </div>
                <span className="font-medium text-stone-700 leading-tight break-words [overflow-wrap:anywhere]">{resolved.title}</span>
                {resolved.isAvailable ? (
                  <a 
                    href={resolved.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold text-[10px] self-start mt-0.5 cursor-pointer"
                  >
                    Open official source <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <span className="text-stone-400 italic text-[10px]">
                    Official source status verified
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
import { PipelineStepper } from './PipelineStepper';
import { 
  Sparkles, 
  Paperclip, 
  Camera, 
  Send, 
  ChevronRight, 
  PanelRightClose, 
  ExternalLink, 
  X,
  MessageSquare,
  ShieldCheck,
  Search,
  ArrowUpRight,
  Pin,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';

interface FairAssistCopilotProps {
  context: FinancialContext;
  activity: AgentActivity;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onOpenUploadModal: (type: 'camera' | 'screenshot' | 'document', targetInst?: string | null) => void;
  onOpenFinancialContextModal?: () => void;
  messages: ChatMessage[];
  onSendMessage: (query: string) => void;
  isSending: boolean;
  onNavigateTab?: (tab: 'Overview' | 'Evidence' | 'Rules & Policies' | 'Action Simulator' | 'Action Plan') => void;
  onNavigateToNextBestActions?: () => void;
  activeTab?: string;
  isAnalyzing?: boolean;
  focusTarget?: FocusTarget;
}

export const FairAssistCopilot: React.FC<FairAssistCopilotProps> = ({
  context,
  activity,
  isCollapsed,
  onToggleCollapse,
  isPinned = true,
  onTogglePin,
  onOpenUploadModal,
  onOpenFinancialContextModal,
  messages,
  onSendMessage,
  isSending,
  onNavigateTab,
  onNavigateToNextBestActions,
  activeTab = 'Overview',
  isAnalyzing = false,
  focusTarget,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isSending, context.evidenceList]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    onSendMessage(inputText);
    setInputText('');
  };

  // Compute whether session is completely empty (0 user messages & 0 evidence items)
  const userMessagesCount = messages.filter((m) => m.sender === 'user').length;
  const isEmptySession = userMessagesCount === 0 && context.evidenceList.length === 0;

  // Filter strictly to repayment institutions (excluding salary, payroll, employers, slik)
  const confirmedRepaymentInsts = Array.from(new Set([
    ...context.evidenceList
      .filter((e) => {
        const cat = (e.category || '').toLowerCase();
        const title = (e.title || '').toLowerCase();
        return !cat.includes('salary') && !cat.includes('payroll') && !cat.includes('slip') && !cat.includes('gaji') && !cat.includes('slik') && !cat.includes('ideb') && !cat.includes('bank statement') &&
               !title.includes('salary') && !title.includes('payroll') && !title.includes('slip') && !title.includes('gaji') && !title.includes('slik') && !title.includes('ideb');
      })
      .flatMap((e) => [
        e.userConfirmedDetails?.institutionName,
        e.extractedDetails?.institutionName,
      ]).filter(Boolean) as string[],
    ...context.obligations
      .filter((o) => !o.isSalary && !(o.category || '').toLowerCase().includes('salary'))
      .map((o) => o.institutionName).filter(Boolean),
  ])).filter((name) => {
    const n = name.toLowerCase();
    return !n.includes('nusantara') && !n.includes('digital') && !n.includes('employer') && !n.includes('payroll') && !n.includes('slik');
  });
  const confirmedInsts = confirmedRepaymentInsts;

  // State-driven boolean checks
  const hasConfirmedNotice = context.evidenceList.length > 0 || context.obligations.length > 0;
  const isCashSalaryMissing = context.availableCash === null || context.availableCash === undefined || !context.nextSalaryDate;

  // Derived normalized evidence summary badge text (separating repayments, salary, SLIK, etc.)
  const evidenceSummaryText = React.useMemo(() => {
    // Active repayment obligations from obligations array (excluding salary, payroll, slik)
    const activeObligations = context.obligations.filter((o) => {
      if (o.isSalary || o.category === 'Salary') return false;
      const cat = (o.category || '').toLowerCase();
      return !cat.includes('salary') && !cat.includes('payroll') && !cat.includes('slik');
    });

    // Evidence items that contribute to repayment liabilities
    const repaymentEvidenceItems = context.evidenceList.filter((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      const isSalaryOrIncome = cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || title.includes('salary') || title.includes('payroll') || title.includes('statement');
      const isSlikOrCredit = cat.includes('slik') || cat.includes('ideb') || title.includes('slik') || title.includes('ideb');
      return !isSalaryOrIncome && !isSlikOrCredit;
    });

    const repaymentCount = activeObligations.length > 0
      ? activeObligations.length
      : repaymentEvidenceItems.length;

    // 2. Income / Salary context
    const hasSalaryConfirmed = Boolean(
      context.nextSalaryDate ||
      context.nextSalaryAmount ||
      context.evidenceList.some((e) => {
        const cat = (e.category || '').toLowerCase();
        const title = (e.title || '').toLowerCase();
        return cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || title.includes('salary') || title.includes('payroll') || title.includes('statement');
      }) ||
      context.obligations.some((o) => o.isSalary || (o.category || '').toLowerCase().includes('salary'))
    );

    // 3. Credit report / SLIK context
    const hasCreditReport = context.evidenceList.some((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      return cat.includes('slik') || cat.includes('ideb') || title.includes('slik') || title.includes('ideb');
    });

    const parts: string[] = [];
    if (repaymentCount > 0) {
      parts.push(`${repaymentCount} repayment obligation${repaymentCount > 1 ? 's' : ''} added`);
    }
    if (hasSalaryConfirmed) {
      parts.push('salary information confirmed');
    }
    if (hasCreditReport) {
      parts.push('credit-report evidence available');
    }

    if (parts.length === 0) {
      if (context.evidenceList.length > 0) {
        parts.push(`${context.evidenceList.length} evidence item${context.evidenceList.length > 1 ? 's' : ''} added`);
      } else {
        parts.push('Evidence added');
      }
    }

    return parts.join(' · ');
  }, [context.obligations, context.evidenceList, context.nextSalaryDate, context.nextSalaryAmount]);

  let contextualQueries: string[] = [];

  const activeRepaymentObligations = context.obligations.filter((o) => {
    if (o.isSalary || o.category === 'Salary') return false;
    const cat = (o.category || '').toLowerCase();
    return !cat.includes('salary') && !cat.includes('payroll') && !cat.includes('slik');
  });

  const repaymentEvidenceItems = context.evidenceList.filter((e) => {
    const cat = (e.category || '').toLowerCase();
    const title = (e.title || '').toLowerCase();
    const isSalaryOrIncome = cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || cat.includes('slip') || cat.includes('gaji') || title.includes('salary') || title.includes('payroll') || title.includes('statement') || title.includes('slip') || title.includes('gaji');
    const isSlikOrCredit = cat.includes('slik') || cat.includes('ideb') || title.includes('slik') || title.includes('ideb');
    return !isSalaryOrIncome && !isSlikOrCredit;
  });

  const repaymentCount = activeRepaymentObligations.length > 0
    ? activeRepaymentObligations.length
    : repaymentEvidenceItems.length;

  const hasSalaryConfirmed = Boolean(
    context.nextSalaryDate ||
    context.nextSalaryAmount ||
    context.evidenceList.some((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      return cat.includes('salary') || cat.includes('payroll') || cat.includes('statement') || cat.includes('slip') || cat.includes('gaji') || title.includes('salary') || title.includes('payroll') || title.includes('statement') || title.includes('slip') || title.includes('gaji');
    }) ||
    context.obligations.some((o) => o.isSalary || (o.category || '').toLowerCase().includes('salary'))
  );

  if (repaymentCount === 0) {
    if (hasSalaryConfirmed) {
      contextualQueries = [
        'Why do you need my available cash?',
        'Can I add a repayment notice?',
        'What evidence should I add next?',
      ];
    } else {
      contextualQueries = [
        'What evidence should I add next?',
        'Can I upload a repayment screenshot?',
        'What details do you need from my notice?',
      ];
    }
  } else if (isCashSalaryMissing) {
    const primaryInst = confirmedRepaymentInsts[0] || 'loan';
    contextualQueries = [
      'Why do you need my available cash?',
      'Can I add another repayment notice?',
      `What rules apply to my ${primaryInst} repayment?`,
    ];
  } else {
    const mainInst = confirmedRepaymentInsts[0] || 'EasyCash';
    contextualQueries = [
      'Which repayment should I prioritise first?',
      `What rules apply to my ${mainInst} repayment?`,
      'What if I borrow Rp1.75M to cover the gap instead?',
      'What does my OJK SLIK report mean?',
    ];
  }

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="p-[1.5px] rounded-[17px] bg-gradient-to-r from-blue-600/70 via-indigo-600/70 to-violet-600/70 h-full w-full max-w-full relative transition-all duration-300">
      <div className={`bg-white rounded-[15.5px] flex flex-col h-full overflow-hidden relative w-full max-w-full overflow-x-hidden ${
        isEmptySession 
          ? 'border border-indigo-200/60 shadow-md' 
          : 'border border-stone-200/80 shadow-sm'
      }`}>
      
      {/* 1. Chat Header with Restrained Gemini Gradient */}
      <div className="shrink-0 relative overflow-hidden border-b border-stone-200 w-full">
        
        {/* Restrained Google/Gemini-inspired top gradient bar */}
        <div 
          className="h-1.5 w-full"
          style={{ background: 'linear-gradient(90deg, #4285F4 0%, #2563EB 50%, #7C3AED 100%)' }}
        />

        <div className="p-2.5 px-3.5 bg-slate-900 text-white flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-5.5 h-5.5 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-xs shrink-0">
                <Sparkles className="w-3 h-3" />
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 truncate">
                <span>✦ FairAssist</span>
              </h3>
            </div>
            <p className="text-[11px] font-semibold text-slate-200 truncate">
              Conversational AI Support
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 pt-0.5">
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span className="truncate">Grounded financial decision support</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onTogglePin && (
              <button
                onClick={onTogglePin}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
                  isPinned 
                    ? 'bg-indigo-950 text-indigo-300 border-indigo-700/80 shadow-2xs' 
                    : 'text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                }`}
                title={isPinned ? 'FairAssist is pinned open across views' : 'Pin FairAssist panel open'}
              >
                <Pin className={`w-3 h-3 ${isPinned ? 'fill-indigo-300 text-indigo-300' : ''}`} />
                <span>{isPinned ? 'Pinned' : 'Pin open'}</span>
              </button>
            )}

            <button
              onClick={onToggleCollapse}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-medium"
              title="Collapse Copilot Panel"
            >
              <PanelRightClose className="w-4 h-4" />
              <span className="hidden sm:inline">Collapse</span>
            </button>
          </div>
        </div>

        {/* 2. Compact Agent Activity Stepper */}
        <div className="px-3 py-1.5 bg-stone-50 border-t border-stone-100 w-full overflow-x-hidden">
          <PipelineStepper activity={activity} compact={true} />
        </div>
      </div>

      {/* 3. Message Scroll Area — Dominant Vertical Region */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 pb-4 space-y-3 text-xs bg-stone-50/30 break-words [overflow-wrap:anywhere] max-w-full">
        
        {(() => {
          const agentMsgs = messages.filter((m) => m.sender === 'agent');
          const lastAgentMsg = agentMsgs[agentMsgs.length - 1];

          return messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'agent' && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shrink-0 font-bold text-[9px] shadow-xs mt-0.5">
                  FA
                </div>
              )}

              <div className={`rounded-2xl p-3.5 space-y-2 break-words [overflow-wrap:anywhere] ${
                msg.sender === 'user'
                  ? 'bg-stone-900 text-white rounded-br-xs shadow-xs max-w-[88%]'
                  : 'bg-white text-stone-800 rounded-bl-xs border border-stone-200/90 shadow-2xs w-full max-w-[100%]'
              }`}>
                
                {/* RAG Activity Badges for Agent Messages */}
                {msg.sender === 'agent' && (
                  <div className="space-y-1 mb-2 pb-2 border-b border-stone-100 max-w-full">
                    {msg.retrievedSources && msg.retrievedSources.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-teal-800 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 shrink-0">
                          ↗ Trusted Retrieval
                        </span>
                        <span className="text-stone-500 font-normal truncate">
                          {msg.retrievedSources.length} source{msg.retrievedSources.length > 1 ? 's' : ''} matched
                        </span>
                      </div>
                    )}
                    {msg.isMultimodal ? (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-800 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 shrink-0">
                          ✦ Gemini Multimodal
                        </span>
                        <span className="text-stone-500 font-normal truncate">
                          Grounded in confirmed evidence
                        </span>
                      </div>
                    ) : (
                      (!msg.retrievedSources || msg.retrievedSources.length === 0) && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-800 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 shrink-0">
                            ✦ Gemini
                          </span>
                          <span className="text-stone-500 font-normal truncate">
                            Conversational guidance
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {msg.sender === 'agent' ? (
                  <div className="space-y-2">
                    <GeminiResponse content={msg.text} />

                    {/* Contextual CTA for uploading notice or adding financial context */}
                    {(() => {
                      const lowerText = msg.text.toLowerCase();
                      const isLatest = lastAgentMsg && msg.id === lastAgentMsg.id;

                      let mentionedLender = '';
                      if (lowerText.includes('adakami')) mentionedLender = 'AdaKami';
                      else if (lowerText.includes('bca')) mentionedLender = 'BCA';
                      else if (lowerText.includes('easycash')) mentionedLender = 'EasyCash';
                      else if (lowerText.includes('mandiri')) mentionedLender = 'Mandiri';

                      const isLenderConfirmed = mentionedLender
                        ? confirmedInsts.some((i) => i.toLowerCase().includes(mentionedLender.toLowerCase()))
                        : false;

                      const isAskingForNotice = 
                        lowerText.includes('repayment notice') ||
                        lowerText.includes('need a little more information') ||
                        lowerText.includes('add your') ||
                        lowerText.includes('upload your') ||
                        !!mentionedLender;

                      const isAskingForCashSalary = 
                        lowerText.includes('cash') ||
                        lowerText.includes('salary') ||
                        lowerText.includes('how much cash');

                      // Inspect latest user message intent
                      const userMsgs = messages.filter((m) => m.sender === 'user');
                      const lastUserMsg = userMsgs[userMsgs.length - 1];
                      const lastUserText = lastUserMsg ? lastUserMsg.text.toLowerCase() : '';

                      const isAddNoticeIntent = Boolean(lastUserText) && (
                        lastUserText.includes('another repayment') ||
                        lastUserText.includes('another loan') ||
                        lastUserText.includes('another obligation') ||
                        lastUserText.includes('another notice') ||
                        lastUserText.includes('another lender') ||
                        lastUserText.includes('upload another') ||
                        lastUserText.includes('add another') ||
                        lastUserText.includes('provide another') ||
                        (lastUserText.includes('add') && (lastUserText.includes('repayment') || lastUserText.includes('notice') || lastUserText.includes('loan') || lastUserText.includes('obligation') || lastUserText.includes('evidence'))) ||
                        (lastUserText.includes('upload') && (lastUserText.includes('repayment') || lastUserText.includes('notice') || lastUserText.includes('loan') || lastUserText.includes('screenshot') || lastUserText.includes('evidence'))) ||
                        lastUserText.includes('can i add') ||
                        lastUserText.includes('can i upload') ||
                        (lastUserText.includes('also have') && (lastUserText.includes('repayment') || lastUserText.includes('loan') || lastUserText.includes('notice') || lastUserText.includes('bca') || lastUserText.includes('adakami') || lastUserText.includes('easycash') || lastUserText.includes('mandiri')))
                      );

                      let namedLenderInUserMsg: string | null = null;
                      if (lastUserText.includes('adakami')) namedLenderInUserMsg = 'AdaKami';
                      else if (lastUserText.includes('bca')) namedLenderInUserMsg = 'BCA';
                      else if (lastUserText.includes('easycash')) namedLenderInUserMsg = 'EasyCash';
                      else if (lastUserText.includes('mandiri')) namedLenderInUserMsg = 'Mandiri';

                      const isUserNamedLenderConfirmed = namedLenderInUserMsg
                        ? confirmedInsts.some((i) => i.toLowerCase().includes(namedLenderInUserMsg!.toLowerCase()))
                        : false;

                      // If user named a lender that is already confirmed, cancel conversational intent override
                      const effectiveAddNoticeIntent = isAddNoticeIntent && (!namedLenderInUserMsg || !isUserNamedLenderConfirmed);

                      // 1. On historical (non-latest) agent messages, render completed status badges only
                      if (!isLatest) {
                        if (isAskingForCashSalary && !isCashSalaryMissing) {
                          return (
                            <div className="pt-2 mt-1.5 border-t border-stone-100 flex items-center justify-start">
                              <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-semibold rounded-xl flex items-center gap-1.5 cursor-default select-none shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Cash & salary information added</span>
                              </div>
                            </div>
                          );
                        }
                        if (isAskingForNotice && (isLenderConfirmed || hasConfirmedNotice)) {
                          const badgeText = mentionedLender && isLenderConfirmed
                            ? `${mentionedLender} repayment notice added`
                            : (confirmedInsts[0] ? `${confirmedInsts[0]} repayment notice added` : 'Repayment notice added');
                          return (
                            <div className="pt-2 mt-1.5 border-t border-stone-100 flex items-center justify-start">
                              <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-semibold rounded-xl flex items-center gap-1.5 cursor-default select-none shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{badgeText}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }

                      // 2. ON THE LATEST AGENT MESSAGE ONLY:
                      // Render state-driven completed badges + SINGLE dominant blue primary CTA + optional secondary text link
                      return (
                        <div className="pt-2.5 mt-2 border-t border-stone-100 space-y-2">
                          {/* Completed badges for confirmed state */}
                          {hasConfirmedNotice && (
                            <div className="flex items-center gap-1.5">
                              <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-semibold rounded-xl flex items-center gap-1.5 cursor-default select-none shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{evidenceSummaryText}</span>
                              </div>
                            </div>
                          )}

                          {!isCashSalaryMissing && (
                            <div className="flex items-center gap-1.5">
                              <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-semibold rounded-xl flex items-center gap-1.5 cursor-default select-none shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Cash & salary information added</span>
                              </div>
                            </div>
                          )}

                          {/* SINGLE DOMINANT BLUE PRIMARY CTA BLOCK */}
                          {(() => {
                            // RULE 1: Conversational Precedence — If latest user prompt expressed intent to add another repayment notice/loan/obligation
                            if (effectiveAddNoticeIntent) {
                              const targetLender = (namedLenderInUserMsg && !isUserNamedLenderConfirmed) ? namedLenderInUserMsg : null;
                              const addNoticeCtaLabel = targetLender
                                ? `Add ${targetLender} repayment notice →`
                                : (hasConfirmedNotice ? 'Add another repayment notice →' : 'Add repayment notice →');

                              return (
                                <div className="flex items-center justify-start pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenUploadModal('screenshot', targetLender)}
                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                                  >
                                    <span>{addNoticeCtaLabel}</span>
                                  </button>
                                </div>
                              );
                            }

                            // STATE A: 0 confirmed notices
                            if (!hasConfirmedNotice) {
                              const targetLender = (mentionedLender && !isLenderConfirmed) ? mentionedLender : null;
                              const ctaText = targetLender
                                ? `Add ${targetLender} repayment notice →`
                                : 'Add repayment notice →';

                              return (
                                <div className="flex items-center justify-start pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenUploadModal('screenshot', targetLender)}
                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                                  >
                                    <span>{ctaText}</span>
                                  </button>
                                </div>
                              );
                            }

                            // STATE B: 1+ confirmed notices, BUT cash/salary missing
                            if (isCashSalaryMissing) {
                              return (
                                <div className="flex flex-col items-start gap-2 pt-0.5">
                                  {/* SINGLE PRIMARY BLUE CTA */}
                                  <button
                                    type="button"
                                    onClick={() => onOpenFinancialContextModal?.()}
                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                                  >
                                    <span>
                                      {context.nextSalaryDate ? "Confirm available cash →" : "Add cash & salary information →"}
                                    </span>
                                  </button>

                                  {/* SECONDARY ACTION: SUBTLE TEXT LINK */}
                                  <button
                                    type="button"
                                    onClick={() => onOpenUploadModal('screenshot')}
                                    className="text-stone-500 hover:text-indigo-600 text-[11px] font-medium cursor-pointer flex items-center gap-1 hover:underline transition-colors pt-0.5 px-0.5"
                                  >
                                    <span>+ Add another repayment notice</span>
                                  </button>
                                </div>
                              );
                            }

                            // STATE C: 1+ confirmed notices AND cash/salary provided
                            const ctaLabel = 'Review recommended actions →';

                            return (
                              <div className="flex flex-col items-start gap-2 pt-0.5">
                                {/* SINGLE PRIMARY BLUE CTA */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onNavigateToNextBestActions) {
                                      onNavigateToNextBestActions();
                                    } else if (onNavigateTab) {
                                      onNavigateTab('Overview');
                                    }
                                  }}
                                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                                >
                                  <span>{ctaLabel}</span>
                                </button>

                                {/* SECONDARY ACTION: SUBTLE TEXT LINK */}
                                <button
                                  type="button"
                                  onClick={() => onOpenUploadModal('screenshot')}
                                  className="text-stone-500 hover:text-indigo-600 text-[11px] font-medium cursor-pointer flex items-center gap-1 hover:underline transition-colors pt-0.5 px-0.5"
                                >
                                  <span>+ Add another repayment notice</span>
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.text}</p>
                )}

                {/* Retrieved Sources List (Collapsed by default) */}
                {msg.retrievedSources && msg.retrievedSources.length > 0 && (
                  <CompactTrustedSources sources={msg.retrievedSources} />
                )}

              </div>
            </div>
          ));
        })()}

        {/* Live Gemini / Retrieval Active Indicators */}

        {/* Live Gemini / Retrieval Active Indicators */}
        {isSending && (
          <div className="p-3 bg-white rounded-2xl border border-stone-200 shadow-2xs space-y-2 text-xs w-full">
            <div className="flex items-center gap-2 text-indigo-700 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
              <span>✦ Gemini</span>
              <span className="text-stone-500 font-normal">Understanding your question…</span>
            </div>
            <div className="flex items-center gap-2 text-teal-700 font-bold text-[11px]">
              <Search className="w-3 h-3 text-teal-600 animate-pulse" />
              <span>↗ Trusted Retrieval</span>
              <span className="text-stone-500 font-normal">Checking current trusted sources…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Suggested Questions Area (Compact Wrapping Chips) */}
      <div className="p-2.5 bg-stone-50/90 border-t border-stone-200 shrink-0 space-y-1 w-full">
        <div className="flex items-center justify-between text-[9.5px] font-bold text-stone-400 uppercase tracking-wider px-0.5">
          <span className="flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
            Suggested Questions
          </span>
        </div>
        <div className="flex flex-wrap gap-1 pt-0.5 w-full">
          {contextualQueries.slice(0, 3).map((q, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(q)}
              disabled={isSending}
              className="text-[10.5px] font-medium text-stone-700 bg-white hover:bg-stone-100 hover:text-indigo-900 px-2 py-1 rounded-lg text-left cursor-pointer transition-colors border border-stone-200 shadow-2xs disabled:opacity-50 break-words [overflow-wrap:anywhere] max-w-full leading-snug"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Fixed Chat Composer — With START HERE Zone on Empty Session */}
      {isEmptySession ? (
        <div className="p-3 bg-indigo-50/60 border-t-2 border-indigo-200/90 shrink-0 space-y-2.5 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-indigo-950 font-black text-[11px] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
              <span>✦ START HERE</span>
            </div>
            <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-100/90 px-2 py-0.5 rounded-full border border-indigo-200/80">
              Initial Step
            </span>
          </div>

          <p className="text-[11px] text-stone-700 font-medium leading-tight">
            Ask a question, or upload your first repayment notice.
          </p>

          <form onSubmit={handleSubmit} className="flex items-center gap-1.5 w-full">
            {/* Document Attachment Button */}
            <button
              type="button"
              onClick={() => onOpenUploadModal('document')}
              className="p-2.5 rounded-xl text-stone-600 hover:text-indigo-900 bg-white hover:bg-stone-50 transition-colors cursor-pointer border border-indigo-200/80 shrink-0 shadow-2xs"
              title="Add evidence (document or statement)"
            >
              <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
            </button>

            {/* Camera Button */}
            <button
              type="button"
              onClick={() => onOpenUploadModal('camera')}
              className="p-2.5 rounded-xl text-stone-600 hover:text-indigo-900 bg-white hover:bg-stone-50 transition-colors cursor-pointer border border-indigo-200/80 shrink-0 shadow-2xs"
              title="Add evidence (take a photo)"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-600" />
            </button>

            {/* Taller, prominent input for empty state */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isSending}
              placeholder="Tell FairAssist what you’re worried about…"
              className="flex-1 min-w-0 bg-white border-2 border-indigo-300 rounded-xl py-2.5 px-3.5 text-xs text-stone-900 placeholder-stone-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:outline-none transition-all disabled:opacity-50 font-medium"
            />

            {/* Ask button */}
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="px-4 py-2.5 rounded-xl text-white transition-all cursor-pointer disabled:opacity-40 font-extrabold text-xs flex items-center gap-1.5 shrink-0 shadow-md bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:opacity-95"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5 text-white shrink-0" />
            </button>
          </form>

          <p className="text-[9.5px] text-stone-500 text-center leading-tight pt-0.5">
            AI-assisted decision support · Human approval may be required
          </p>
        </div>
      ) : (
        <div className="p-3 bg-white border-t border-stone-200 shrink-0 space-y-2 w-full">
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5 w-full">
            
            {/* Document Attachment Button */}
            <button
              type="button"
              onClick={() => onOpenUploadModal('document')}
              className="p-2 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200 shrink-0"
              title="Attach document or statement"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>

            {/* Camera Button */}
            <button
              type="button"
              onClick={() => onOpenUploadModal('camera')}
              className="p-2 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200 shrink-0"
              title="Take a photo of receipt or repayment notice"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            {/* Input Text Field */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isSending}
              placeholder="Ask FairAssist about your loan or OJK rights..."
              className="flex-1 min-w-0 bg-stone-50 border border-stone-200/80 rounded-xl py-2 px-3 text-xs text-stone-900 placeholder-stone-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white focus:outline-none transition-all disabled:opacity-50"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)' }}
              className="px-3.5 py-2 rounded-xl text-white transition-all cursor-pointer disabled:opacity-40 font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-xs hover:opacity-95"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5 text-white shrink-0" />
            </button>

          </form>

          <p className="text-[9.5px] text-stone-400 text-center leading-tight">
            FairAssist provides AI-assisted decision support grounded in OJK regulations.
          </p>
        </div>
      )}

    </div>
    </div>
  );
};
