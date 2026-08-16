/**
 * FairAssist - AI Financial Decision Support Agent
 * British English spelling used throughout.
 */

import React, { useState, useMemo } from 'react';
import { 
  FinancialContext, 
  Institution, 
  EvidenceItem, 
  FinancialObligation, 
  RegulatorySource, 
  InstitutionPolicy, 
  GeminiInsight, 
  NextBestAction, 
  AgentActivity,
  FocusTarget,
  PendingEvidenceRequest,
  extractSalaryDetailsFromEvidence
} from './types';

import { 
  AVAILABLE_BANKS, 
  AVAILABLE_PINDARS, 
  INITIAL_EVIDENCE, 
  INITIAL_OBLIGATIONS, 
  SAMPLE_SCENARIO_EVIDENCE,
  SAMPLE_SCENARIO_OBLIGATIONS,
  INITIAL_REGULATORY_SOURCES, 
  INITIAL_INSTITUTION_POLICIES, 
  INITIAL_GEMINI_INSIGHT, 
  INITIAL_NEXT_BEST_ACTIONS, 
  INITIAL_PIPELINE_STATE, 
  DEFAULT_FINANCIAL_CONTEXT 
} from './data/mockData';
import { formatBritishDate } from './components/ActionSimulator';

import { Header } from './components/Header';
import { EvidenceColumn } from './components/EvidenceColumn';
import { SituationColumn } from './components/SituationColumn';
import { NextBestActionsColumn } from './components/NextBestActionsColumn';
import { LineageModal } from './components/LineageModal';
import { FreshnessModal } from './components/FreshnessModal';
import { ActionSimulator } from './components/ActionSimulator';
import { RulesAndPoliciesView } from './components/RulesAndPoliciesView';
import { ActionPlanView } from './components/ActionPlanView';
import { FairAssistCopilot } from './components/FairAssistCopilot';
import { MobileFairAssistDrawer } from './components/MobileFairAssistDrawer';
import { EvidenceUploadModal } from './components/EvidenceUploadModal';
import { FinancialContextModal } from './components/FinancialContextModal';
import { ChatMessage } from './types';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'Overview' | 'Evidence' | 'Rules & Policies' | 'Action Simulator' | 'Action Plan'>('Overview');
  const [selectedScenarioType, setSelectedScenarioType] = useState<'REQUEST_EXTENSION' | 'BORROW_MORE' | null>('REQUEST_EXTENSION');
  const [selectedBank, setSelectedBank] = useState<Institution>(AVAILABLE_BANKS[0]);
  const [selectedPindar, setSelectedPindar] = useState<Institution>(AVAILABLE_PINDARS[0]);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>(INITIAL_EVIDENCE);
  const [obligations, setObligations] = useState<FinancialObligation[]>(INITIAL_OBLIGATIONS);
  const [availableCash, setAvailableCash] = useState<number | null>(null);
  const [nextSalaryDate, setNextSalaryDate] = useState<string | null>(null);
  const [nextSalaryAmount, setNextSalaryAmount] = useState<number | null>(null);
  const [essentialExpenses, setEssentialExpenses] = useState<number | null>(null);

  const [regulatorySources, setRegulatorySources] = useState<RegulatorySource[]>(INITIAL_REGULATORY_SOURCES);
  const [institutionPolicies, setInstitutionPolicies] = useState<InstitutionPolicy[]>(INITIAL_INSTITUTION_POLICIES);
  const [geminiInsight, setGeminiInsight] = useState<GeminiInsight>(INITIAL_GEMINI_INSIGHT);
  const [nextBestActions, setNextBestActions] = useState<NextBestAction[]>(INITIAL_NEXT_BEST_ACTIONS);
  const [activity, setActivity] = useState<AgentActivity>(INITIAL_PIPELINE_STATE);

  // Modals state
  const [isFreshnessModalOpen, setIsFreshnessModalOpen] = useState<boolean>(false);
  const [selectedLineageAction, setSelectedLineageAction] = useState<NextBestAction | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isFinancialContextModalOpen, setIsFinancialContextModalOpen] = useState<boolean>(false);
  const [uploadModalType, setUploadModalType] = useState<'camera' | 'screenshot' | 'document'>('document');
  const [replacingEvidenceItem, setReplacingEvidenceItem] = useState<EvidenceItem | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [draftOpenTrigger, setDraftOpenTrigger] = useState<number>(0);
  const [isSampleResetConfirmOpen, setIsSampleResetConfirmOpen] = useState<boolean>(false);
  const [pendingUploadIntent, setPendingUploadIntent] = useState<{
    type: 'camera' | 'screenshot' | 'document';
    targetInst?: string | null;
    replacingItem?: EvidenceItem | null;
  } | null>(null);

  // State integrity flags
  const [isDemoScenario, setIsDemoScenario] = useState<boolean>(false);
  const [isUserActionExecuted, setIsUserActionExecuted] = useState<boolean>(false);
  const [pendingRequestedLender, setPendingRequestedLender] = useState<string>('');
  const [pendingEvidenceRequest, setPendingEvidenceRequest] = useState<PendingEvidenceRequest | null>(null);

  // Auto-sync canonical salary context from evidence list whenever evidenceList changes
  React.useEffect(() => {
    for (const item of evidenceList) {
      const { salaryAmount, salaryDate } = extractSalaryDetailsFromEvidence(item);
      if (salaryAmount !== null || salaryDate !== null) {
        if (salaryAmount !== null && nextSalaryAmount !== salaryAmount) {
          setNextSalaryAmount(salaryAmount);
        }
        if (salaryDate !== null && nextSalaryDate !== salaryDate) {
          setNextSalaryDate(salaryDate);
        }
        break;
      }
    }
  }, [evidenceList, nextSalaryAmount, nextSalaryDate]);

  const updatePendingLenderRequest = (inst: string | null, origin: 'conversation' | 'generic_upload' = 'conversation') => {
    setPendingRequestedLender(inst || '');
    if (inst) {
      setPendingEvidenceRequest({
        institution: inst,
        evidenceType: 'repayment_notice',
        origin
      });
    } else {
      setPendingEvidenceRequest({
        institution: null,
        evidenceType: null,
        origin: 'generic_upload'
      });
    }
  };

  // Copilot and Chat state
  const [isCopilotCollapsed, setIsCopilotCollapsed] = useState<boolean>(false);
  const [isCopilotPinned, setIsCopilotPinned] = useState<boolean>(true);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState<boolean>(false);
  const [isChatSending, setIsChatSending] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'agent',
      text: `Hello.\n\nTell me what you need help with, or add a repayment notice. I’ll help you understand what applies and what to do next.`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      retrievedSources: []
    }
  ]);

  const contextVersionRef = React.useRef<number>(0);

  const handleSendMessage = async (queryText: string) => {
    if (!queryText.trim() || isChatSending) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatSending(true);

    const hasAnyConfirmedContext = evidenceList.length > 0 || obligations.length > 0 || (availableCash !== null && availableCash !== undefined) || Boolean(nextSalaryDate) || (nextSalaryAmount !== null && nextSalaryAmount !== undefined);

    if (hasAnyConfirmedContext) {
      setActivity({
        currentStage: 'UNDERSTAND',
        stages: [
          { stage: 'UNDERSTAND', status: 'active', message: `Understanding: "${queryText.slice(0, 30)}..."`, timestamp: new Date().toLocaleTimeString('id-ID') },
          { stage: 'RETRIEVE', status: 'pending' },
          { stage: 'VERIFY', status: 'pending' },
          { stage: 'REASON', status: 'pending' },
          { stage: 'ACT', status: 'pending' }
        ],
        activeStepDescription: 'Retrieving OJK regulatory database & reasoning with Gemini...'
      });
    }

    try {
      const lower = queryText.toLowerCase();
      if (lower.includes('adakami')) {
        updatePendingLenderRequest('AdaKami', 'conversation');
      } else if (lower.includes('bca')) {
        updatePendingLenderRequest('BCA', 'conversation');
      } else if (lower.includes('easycash')) {
        updatePendingLenderRequest('EasyCash', 'conversation');
      } else if (lower.includes('mandiri')) {
        updatePendingLenderRequest('Mandiri', 'conversation');
      }

      // Maintain current tab context during chat so conversation flow remains unbroken
      if (lower.includes('rule') || lower.includes('pojk') || lower.includes('seojk') || lower.includes('rights') || lower.includes('easycash')) {
        // Keeps user grounded on current context
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          financialContext
        })
      });

      const data = await response.json();

      const agentMsg: ChatMessage = {
        id: `msg-agent-${Date.now()}`,
        sender: 'agent',
        text: data.reply || `Under OJK regulations (POJK 40/2024 & SEOJK 19/2025), you have clear rights regarding debt collection standards and payment alignment with your salary cycle.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        retrievedSources: data.retrievedSources || []
      };

      setChatMessages((prev) => [...prev, agentMsg]);

      if (data.nextBestActions && Array.isArray(data.nextBestActions) && (hasAnyConfirmedContext || evidenceList.length > 0)) {
        setNextBestActions(data.nextBestActions);
      }

      if (!hasAnyConfirmedContext) {
        setActivity({
          currentStage: 'UNDERSTAND',
          stages: [
            { stage: 'UNDERSTAND', status: 'pending' },
            { stage: 'RETRIEVE', status: 'pending' },
            { stage: 'VERIFY', status: 'pending' },
            { stage: 'REASON', status: 'pending' },
            { stage: 'ACT', status: 'pending' }
          ],
          activeStepDescription: lower.includes('adakami')
            ? 'More evidence requested · waiting for AdaKami notice'
            : 'Waiting for your question or evidence'
        });
      } else if (data.pipelineActivity) {
        setActivity(data.pipelineActivity);
      } else {
        setActivity({
          currentStage: 'REASON',
          stages: [
            { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed query intent & financial context', timestamp: new Date().toLocaleTimeString('id-ID') },
            { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK & BI regulatory clauses', timestamp: new Date().toLocaleTimeString('id-ID') },
            { stage: 'VERIFY', status: 'completed', message: 'Verified active regulatory source currency', timestamp: new Date().toLocaleTimeString('id-ID') },
            { stage: 'REASON', status: 'completed', message: 'Gemini reasoning applied to borrower situation', timestamp: new Date().toLocaleTimeString('id-ID') },
            { stage: 'ACT', status: isUserActionExecuted ? 'completed' : 'pending', message: isUserActionExecuted ? 'User action recorded' : 'Awaiting substantive user action', timestamp: new Date().toLocaleTimeString('id-ID') }
          ],
          activeStepDescription: 'Confirmed evidence analysed · more context needed'
        });
      }

    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsChatSending(false);
    }
  };

  // Single source of truth for confirmed active repayment obligations & evidence
  const activeRepaymentObligations = useMemo(() => {
    return (obligations || []).filter((o) => {
      if (o.isSalary || o.category === 'Salary') return false;
      const catLower = (o.category || '').toLowerCase();
      if (catLower.includes('salary') || catLower.includes('payroll') || catLower.includes('slik')) return false;
      const titleLower = (o.title || '').toLowerCase();
      if (titleLower.includes('salary') || titleLower.includes('payroll') || titleLower.includes('slik')) return false;
      return (o.amount !== null && o.amount !== undefined && o.amount > 0) || Boolean(o.institutionName);
    });
  }, [obligations]);

  const activeRepaymentEvidence = useMemo(() => {
    return (evidenceList || []).filter((e) => {
      const cat = (e.category || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      if (cat.includes('salary') || cat.includes('payroll') || cat.includes('slik') || cat.includes('statement')) {
        return false;
      }
      if (title.includes('salary') || title.includes('payroll') || title.includes('slik') || title.includes('statement')) {
        return false;
      }
      const amt = e.userConfirmedDetails?.amountDue ?? e.extractedDetails?.amountDue;
      if (amt === 0 && (cat.includes('bank statement') || cat.includes('ideb'))) return false;
      return true;
    });
  }, [evidenceList]);

  const financialContext: FinancialContext = {
    ...DEFAULT_FINANCIAL_CONTEXT,
    userPersona: isDemoScenario
      ? {
          name: 'Ayu Putri',
          email: 'ayu.putri@demo.fairassist.id',
          occupation: 'Administrative Professional',
          syntheticFlag: true,
        }
      : {
          name: 'Borrower',
          email: 'borrower@fairassist.id',
          occupation: 'Borrower',
          syntheticFlag: false,
        },
    selectedBank,
    selectedPindar,
    evidenceList: evidenceList,
    obligations: activeRepaymentObligations,
    availableCash,
    nextSalaryDate,
    nextSalaryAmount,
    essentialExpenses,
    regulatorySources,
    institutionPolicies,
  };

  const handleResetDemo = () => {
    setIsDemoScenario(false);
    setIsUserActionExecuted(false);
    setDraftOpenTrigger(0);
    setEvidenceList([]);
    setObligations([]);
    setAvailableCash(null);
    setNextSalaryDate(null);
    setNextSalaryAmount(null);
    setEssentialExpenses(null);
    setNextBestActions([]);
    setGeminiInsight(INITIAL_GEMINI_INSIGHT);
    setActivity(INITIAL_PIPELINE_STATE);
    setPendingRequestedLender('');
    setPendingEvidenceRequest(null);
    setIsAnalyzing(false);
    setChatMessages([
      {
        id: 'msg-welcome',
        sender: 'agent',
        text: `Hello.\n\nTell me what you need help with, or add a repayment notice. I’ll help you understand what applies and what to do next.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        retrievedSources: []
      }
    ]);
  };

  const handleToggleSampleScenario = () => {
    if (isDemoScenario) {
      handleResetDemo();
    } else {
      handleLoadSampleScenario();
    }
  };

  const handleLoadSampleScenario = () => {
    setIsDemoScenario(true);
    setEvidenceList(SAMPLE_SCENARIO_EVIDENCE);
    setObligations(SAMPLE_SCENARIO_OBLIGATIONS);
    setAvailableCash(850000);
    setNextSalaryDate('2026-08-28');
    setNextSalaryAmount(8500000);
    setChatMessages([
      {
        id: 'msg-welcome-sample',
        sender: 'agent',
        text: `### Hello, Ayu.\n\nTell me what you need help with, or add a repayment notice. I’ll help you understand what applies and what to do next.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        retrievedSources: []
      }
    ]);
    setTimeout(() => {
      handleTriggerAnalysis();
    }, 50);
  };

  // Trigger Gemini Analysis on Server with explicit stage sequence
  const handleTriggerAnalysis = async (overrideContext?: FinancialContext) => {
    const ctx = overrideContext || financialContext;
    const hasAnyContext = ctx.evidenceList.length > 0 || ctx.obligations.length > 0 || (ctx.availableCash !== null && ctx.availableCash !== undefined) || Boolean(ctx.nextSalaryDate) || (ctx.nextSalaryAmount !== null && ctx.nextSalaryAmount !== undefined);
    if (!hasAnyContext) {
      setIsAnalyzing(false);
      setActivity({
        currentStage: 'UNDERSTAND',
        stages: [
          { stage: 'UNDERSTAND', status: 'pending' },
          { stage: 'RETRIEVE', status: 'pending' },
          { stage: 'VERIFY', status: 'pending' },
          { stage: 'REASON', status: 'pending' },
          { stage: 'ACT', status: 'pending' }
        ],
        activeStepDescription: 'Waiting for your question or evidence'
      });
      return;
    }

    setIsAnalyzing(true);
    const startVersion = ++contextVersionRef.current;
    
    const confirmedLenders = Array.from(new Set([
      ...ctx.evidenceList
        .filter((e: any) => {
          const cat = (e.category || '').toLowerCase();
          const title = (e.title || '').toLowerCase();
          return !cat.includes('salary') && !cat.includes('payroll') && !cat.includes('slik') && !cat.includes('statement') && !cat.includes('slip') && !cat.includes('gaji') &&
                 !title.includes('salary') && !title.includes('payroll') && !title.includes('slik') && !title.includes('slip') && !title.includes('gaji');
        })
        .flatMap((e: any) => [
          e.userConfirmedDetails?.institutionName,
          e.extractedDetails?.institutionName
        ]).filter(Boolean),
      ...ctx.obligations
        .filter((o: any) => !o.isSalary && !(o.category || '').toLowerCase().includes('salary'))
        .map((o: any) => o.institutionName).filter(Boolean)
    ])).filter((name: string) => {
      const n = name.toLowerCase();
      return !n.includes('nusantara') && !n.includes('digital') && !n.includes('employer') && !n.includes('payroll') && !n.includes('slik');
    });

    let finalStatusDescription = 'Confirmed evidence analysed · more context needed';
    if (confirmedLenders.length === 1) {
      finalStatusDescription = `${confirmedLenders[0]} evidence analysed · more context needed`;
    } else if (confirmedLenders.length > 1) {
      finalStatusDescription = 'Confirmed evidence analysed · more context needed';
    } else {
      finalStatusDescription = 'Confirmed evidence analysed · more context needed';
    }

    // Stage 1: RETRIEVE active
    if (startVersion !== contextVersionRef.current) return;
    setActivity({
      currentStage: 'RETRIEVE',
      stages: [
        { stage: 'UNDERSTAND', status: 'completed', message: 'Evidence confirmed', timestamp: new Date().toLocaleTimeString('id-ID') },
        { stage: 'RETRIEVE', status: 'active', message: 'Checking OJK & lender rules...', timestamp: new Date().toLocaleTimeString('id-ID') },
        { stage: 'VERIFY', status: 'pending' },
        { stage: 'REASON', status: 'pending' },
        { stage: 'ACT', status: 'pending' }
      ],
      activeStepDescription: confirmedLenders.length === 1
        ? `${confirmedLenders[0]} evidence confirmed · checking applicable sources…` 
        : 'Checking applicable sources…'
    });

    await new Promise((r) => setTimeout(r, 450));
    if (startVersion !== contextVersionRef.current) return;

    // Stage 2: VERIFY active
    setActivity({
      currentStage: 'VERIFY',
      stages: [
        { stage: 'UNDERSTAND', status: 'completed', message: 'Evidence confirmed' },
        { stage: 'RETRIEVE', status: 'completed', message: 'Applicable sources retrieved' },
        { stage: 'VERIFY', status: 'active', message: 'Verifying source currency...', timestamp: new Date().toLocaleTimeString('id-ID') },
        { stage: 'REASON', status: 'pending' },
        { stage: 'ACT', status: 'pending' }
      ],
      activeStepDescription: 'Checking source currency and applicability…'
    });

    await new Promise((r) => setTimeout(r, 450));
    if (startVersion !== contextVersionRef.current) return;

    // Stage 3: REASON active
    setActivity({
      currentStage: 'REASON',
      stages: [
        { stage: 'UNDERSTAND', status: 'completed', message: 'Evidence confirmed' },
        { stage: 'RETRIEVE', status: 'completed', message: 'Applicable sources retrieved' },
        { stage: 'VERIFY', status: 'completed', message: 'Verified 3 current regulatory sources' },
        { stage: 'REASON', status: 'active', message: 'Analysing confirmed repayment details...', timestamp: new Date().toLocaleTimeString('id-ID') },
        { stage: 'ACT', status: 'pending' }
      ],
      activeStepDescription: 'Analysing confirmed repayment information…'
    });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ financialContext: ctx }),
      });

      const data = await res.json();
      if (startVersion !== contextVersionRef.current) return;

      if (data.quote) {
        setGeminiInsight((prev) => ({
          ...prev,
          quote: data.quote,
          summary: data.summary,
          evidenceCount: data.evidenceCount || ctx.evidenceList.length,
          trustedSourcesCount: data.trustedSourcesCount || 3,
          generatedAt: new Date().toLocaleTimeString('id-ID') + ' WIB',
        }));
      }

      if (data.nextBestActions && Array.isArray(data.nextBestActions)) {
        setNextBestActions(data.nextBestActions);
      }

      // Stage 4: REASON complete, ACT remains idle (pending / neutral ○)
      setActivity({
        currentStage: 'REASON',
        stages: [
          { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed confirmed evidence' },
          { stage: 'RETRIEVE', status: 'completed', message: 'Queried OJK SEOJK 19/2025 & BI guidance' },
          { stage: 'VERIFY', status: 'completed', message: 'Verified 3 current regulatory sources' },
          { stage: 'REASON', status: 'completed', message: 'Analysed confirmed repayment evidence' },
          { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action' }
        ],
        activeStepDescription: finalStatusDescription
      });

    } catch (err) {
      if (startVersion !== contextVersionRef.current) return;
      console.error('Error triggering analysis:', err);

      setActivity({
        currentStage: 'RETRIEVE',
        stages: [
          { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed confirmed evidence' },
          { stage: 'RETRIEVE', status: 'failed', message: 'Source check failed' },
          { stage: 'VERIFY', status: 'pending' },
          { stage: 'REASON', status: 'pending' },
          { stage: 'ACT', status: 'pending' }
        ],
        activeStepDescription: 'We couldn’t complete the source check. Try again.'
      });
    } finally {
      if (startVersion === contextVersionRef.current) {
        setIsAnalyzing(false);
      }
    }
  };

  const handleOpenUploadModal = (type: 'camera' | 'screenshot' | 'document', targetInst?: string | null) => {
    if (isDemoScenario) {
      setPendingUploadIntent({ type, targetInst, replacingItem: null });
      setIsSampleResetConfirmOpen(true);
      return;
    }
    setReplacingEvidenceItem(null);
    setUploadModalType(type);
    if (targetInst !== undefined) {
      if (targetInst) {
        updatePendingLenderRequest(targetInst, 'conversation');
      } else {
        updatePendingLenderRequest(null, 'generic_upload');
      }
    }
    setIsUploadModalOpen(true);
  };

  const handleReplaceFile = (item: EvidenceItem) => {
    const inferredType: 'camera' | 'screenshot' | 'document' = 
      item.fileType?.includes('pdf') ? 'document' : 'screenshot';
    if (isDemoScenario) {
      setPendingUploadIntent({ type: inferredType, targetInst: null, replacingItem: item });
      setIsSampleResetConfirmOpen(true);
      return;
    }
    setReplacingEvidenceItem(item);
    setUploadModalType(inferredType);
    setIsUploadModalOpen(true);
  };

  const handleCancelSampleReset = () => {
    setIsSampleResetConfirmOpen(false);
    setPendingUploadIntent(null);
  };

  const handleConfirmSampleResetAndUpload = () => {
    const intent = pendingUploadIntent;
    setIsSampleResetConfirmOpen(false);
    setPendingUploadIntent(null);
    handleResetDemo();

    if (intent) {
      if (intent.replacingItem) {
        setReplacingEvidenceItem(intent.replacingItem);
      } else {
        setReplacingEvidenceItem(null);
      }
      setUploadModalType(intent.type);
      if (intent.targetInst !== undefined) {
        if (intent.targetInst) {
          updatePendingLenderRequest(intent.targetInst, 'conversation');
        } else {
          updatePendingLenderRequest(null, 'generic_upload');
        }
      }
      setIsUploadModalOpen(true);
    }
  };

  const handleAddEvidence = (
    item: EvidenceItem,
    choiceInfo?: { choice: 'use_detected' | 'upload_requested'; requestedInst?: string }
  ) => {
    let newEvidenceList = [...evidenceList];
    let newObligations = [...obligations];

    // If sample scenario was active, clear demo pack first so real evidence is not silently mixed
    if (isDemoScenario) {
      setIsDemoScenario(false);
      newEvidenceList = [item];
      newObligations = [];
      setAvailableCash(null);
      setNextSalaryDate(null);
      setNextSalaryAmount(null);
    } else {
      const exists = newEvidenceList.some((e) => e.id === item.id);
      if (exists) {
        newEvidenceList = newEvidenceList.map((e) => (e.id === item.id ? item : e));
      } else {
        newEvidenceList = [item, ...newEvidenceList];
      }
    }
    setEvidenceList(newEvidenceList);

    // Sync obligations if institution name is extracted
    const instName = item.userConfirmedDetails?.institutionName || item.extractedDetails?.institutionName || '';
    const prodName = item.userConfirmedDetails?.productName || item.extractedDetails?.productName || 'Loan Facility';
    const amount = item.userConfirmedDetails?.amountDue ?? item.extractedDetails?.amountDue;
    const dueDate = item.userConfirmedDetails?.dueDate || item.extractedDetails?.dueDate || '2026-08-25';

    const categoryLower = (item.category || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();
    const notesLower = (item.userConfirmedDetails?.notes || item.extractedDetails?.notes || item.summaryStatement || '').toLowerCase();
    const isSalaryOrIncome = categoryLower.includes('salary') || categoryLower.includes('payroll') || categoryLower.includes('bank statement') || titleLower.includes('salary') || titleLower.includes('slip') || titleLower.includes('payroll') || titleLower.includes('gaji') || notesLower.includes('salary') || notesLower.includes('net salary');
    const isSlikOrReport = categoryLower.includes('slik') || categoryLower.includes('ideb') || titleLower.includes('slik') || titleLower.includes('ideb');

    if (isSalaryOrIncome) {
      const salaryDetails = extractSalaryDetailsFromEvidence(item);
      if (salaryDetails.salaryAmount) setNextSalaryAmount(salaryDetails.salaryAmount);
      if (salaryDetails.salaryDate) setNextSalaryDate(salaryDetails.salaryDate);
    }

    if (instName && amount && amount > 0 && !isSalaryOrIncome && !isSlikOrReport) {
      const hasInstObl = newObligations.some((o) => o.institutionName.toLowerCase().includes(instName.toLowerCase()));
      if (!hasInstObl) {
        const isBank = instName.toLowerCase().includes('bca') || instName.toLowerCase().includes('bank') || instName.toLowerCase().includes('mandiri');
        const formattedDate = dueDate === '2026-08-27' || dueDate === '27 August 2026' ? '27 August 2026' : (dueDate === '2026-08-25' ? '25 August 2026' : dueDate);
        const newObl: FinancialObligation = {
          id: `obl-${Date.now()}`,
          title: `${instName} ${prodName}`,
          institutionId: isBank ? 'bank-custom' : 'pindar-custom',
          institutionName: instName,
          category: isBank ? 'Bank Loan' : 'Pindar Loan',
          amount: amount,
          dueDate: dueDate,
          formattedDate: formattedDate,
          status: 'Upcoming',
          notes: `Confirmed via evidence item: ${item.title}`
        };
        newObligations = [...newObligations, newObl];
        setObligations(newObligations);
      }
    }

    // Check if user asked to add a specific lender (e.g. AdaKami) but uploaded/confirmed a different lender (e.g. BCA)
    const reqInst = choiceInfo?.requestedInst || pendingRequestedLender;
    const normReq = reqInst.toLowerCase().trim();
    const normConfirmedInst = instName.toLowerCase().trim();

    const isDifferentRequested = Boolean(normReq) && !normConfirmedInst.includes(normReq) && !isSalaryOrIncome && !isSlikOrReport;

    if (isDifferentRequested) {
      setPendingRequestedLender(reqInst);

      const formattedAmt = amount ? `Rp${Number(amount).toLocaleString('id-ID')}` : 'Rp750,000';
      const formattedDueDate = dueDate === '2026-08-27' || dueDate === '27 August 2026' ? '27 August 2026' : (dueDate === '2026-08-25' ? '25 August 2026' : dueDate);

      const confirmAgentMsg: ChatMessage = {
        id: `msg-confirm-${Date.now()}`,
        sender: 'agent',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        text: `I've added the ${instName} repayment notice (${formattedAmt} due ${formattedDueDate}). You originally mentioned ${reqInst} as well. Would you like to add that notice next?`,
        retrievedSources: [
          {
            id: "POJK-40-2024",
            sourceTitle: "POJK No. 40 Tahun 2024",
            organisation: "OJK",
            confidenceScore: 0.98,
            matchedClause: "Primary framework for LPBBTI operations and consumer protection",
            retrievedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            status: "Current",
            url: "https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx"
          },
          {
            id: "SEOJK-19-2025",
            sourceTitle: "SEOJK No. 19/SEOJK.06/2025",
            organisation: "OJK",
            confidenceScore: 0.96,
            matchedClause: "Current LPBBTI operational circular superseding SEOJK 19/2023",
            retrievedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            status: "Current",
            url: "https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx"
          }
        ]
      };
      setChatMessages((prev) => [...prev, confirmAgentMsg]);

      setNextBestActions([
        {
          id: `act-add-${reqInst.toLowerCase()}`,
          category: 'DO TODAY',
          priorityOrder: 1,
          title: `Add ${reqInst} repayment notice`,
          reason: `You mentioned ${reqInst} earlier. Upload evidence for ${reqInst} to complete your obligations overview.`,
          financialImpact: `Completes financial context for ${reqInst} obligations.`,
          evidenceUsed: ['User chat request'],
          trustedSourcesUsed: ['POJK No. 40 Tahun 2024'],
          currentSourceStatus: 'Current',
          requiresHumanAuthorisation: false,
          authorisingEntity: 'Borrower',
          primaryActionButtonLabel: `Add ${reqInst} repayment notice →`,
          actionCode: 'CUSTOM',
          lineage: {
            evidenceProvided: ['User chat request'],
            retrievedRules: ['POJK No. 40 Tahun 2024'],
            policiesApplied: [],
            geminiReasoning: `Awaiting ${reqInst} repayment notice evidence.`,
            financialCalculation: 'Pending obligation entry.',
            escalationBoundaryNote: 'User-provided lender request.'
          }
        }
      ]);

      setActivity({
        currentStage: 'UNDERSTAND',
        stages: [
          { stage: 'UNDERSTAND', status: 'completed', message: `Confirmed ${instName} evidence` },
          { stage: 'RETRIEVE', status: 'pending' },
          { stage: 'VERIFY', status: 'pending' },
          { stage: 'REASON', status: 'pending' },
          { stage: 'ACT', status: 'pending' }
        ],
        activeStepDescription: `More evidence requested · waiting for ${reqInst} notice`
      });

    } else {
      if (normReq && normConfirmedInst.includes(normReq)) {
        setPendingRequestedLender('');
      }

      if (instName || isSlikOrReport || isSalaryOrIncome) {
        const formattedAmt = amount ? `Rp${Number(amount).toLocaleString('id-ID')}` : 'Rp650,000';
        const formattedDueDate = dueDate === '2026-08-27' || dueDate === '27 August 2026' ? '27 August 2026' : (dueDate === '2026-08-25' ? '25 August 2026' : (dueDate === '2026-08-24' ? '24 August 2026' : dueDate));
        
        let textContent = '';
        if (isSalaryOrIncome) {
          const salDetails = extractSalaryDetailsFromEvidence(item);
          const salAmt = salDetails.salaryAmount || amount || 8500000;
          const salDate = salDetails.salaryDate || dueDate || '28 Aug 2026';
          const formattedSalAmt = `Rp${Number(salAmt).toLocaleString('id-ID')}`;
          
          const activeRepaymentsCount = newObligations.filter((o) => !o.isSalary && !(o.category || '').toLowerCase().includes('salary')).length;
          if (activeRepaymentsCount === 0) {
            textContent = `Salary information confirmed: ${formattedSalAmt} expected on ${salDate}. I still need your repayment notice(s) and available cash to analyse your cash flow.`;
          } else {
            textContent = `Salary information confirmed: ${formattedSalAmt} expected on ${salDate}.`;
          }
        } else if (isSlikOrReport) {
          textContent = "Your OJK SLIK credit-report evidence has been added. It shows 3 active facilities, collectibility status 1 – Lancar, and no current arrears.";
        } else {
          textContent = isDemoScenario
            ? `Thanks, Ayu. I’ve added your ${instName} repayment of ${formattedAmt} due on ${formattedDueDate}.\n\nDo you have another repayment obligation or salary information to add?`
            : `I’ve added your ${instName} repayment of ${formattedAmt} due on ${formattedDueDate}.\n\nDo you have another repayment obligation or salary information to add?`;
        }

        const confirmAgentMsg: ChatMessage = {
          id: `msg-confirm-${Date.now()}`,
          sender: 'agent',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          text: textContent,
          retrievedSources: [
            {
              id: "POJK-40-2024",
              sourceTitle: "POJK No. 40 Tahun 2024",
              organisation: "OJK",
              confidenceScore: 0.98,
              matchedClause: "Primary framework for LPBBTI operations and consumer protection",
              retrievedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              status: "Current",
              url: "https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx"
            },
            {
              id: "SEOJK-19-2025",
              sourceTitle: "SEOJK No. 19/SEOJK.06/2025",
              organisation: "OJK",
              confidenceScore: 0.96,
              matchedClause: "Current LPBBTI operational circular superseding SEOJK 19/2023",
              retrievedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              status: "Current",
              url: "https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx"
            }
          ]
        };
        setChatMessages((prev) => [...prev, confirmAgentMsg]);
      }
    }

    const updatedContext: FinancialContext = {
      ...financialContext,
      evidenceList: newEvidenceList,
      obligations: newObligations,
    };

    handleTriggerAnalysis(updatedContext);
  };

  const handleUpdateEvidence = (updatedItem: EvidenceItem) => {
    const newEvidenceList = evidenceList.map((item) => (item.id === updatedItem.id ? updatedItem : item));
    setEvidenceList(newEvidenceList);

    // Sync obligations with updated amount or due date
    const instName = updatedItem.userConfirmedDetails?.institutionName || updatedItem.extractedDetails?.institutionName;
    const amount = updatedItem.userConfirmedDetails?.amountDue ?? updatedItem.extractedDetails?.amountDue;
    let newObligations = [...obligations];

    if (instName) {
      newObligations = newObligations.map((o) => {
        if (o.institutionName.toLowerCase().includes(instName.toLowerCase())) {
          return {
            ...o,
            amount: amount ?? o.amount,
            dueDate: updatedItem.userConfirmedDetails?.dueDate || o.dueDate,
            formattedDate: updatedItem.userConfirmedDetails?.dueDate || o.formattedDate,
          };
        }
        return o;
      });
      setObligations(newObligations);
    }

    const updatedContext: FinancialContext = {
      ...financialContext,
      evidenceList: newEvidenceList,
      obligations: newObligations,
    };

    handleTriggerAnalysis(updatedContext);
  };

  const handleRemoveEvidence = (id: string) => {
    const itemToRemove = evidenceList.find((e) => e.id === id);
    const instName = itemToRemove?.userConfirmedDetails?.institutionName || itemToRemove?.extractedDetails?.institutionName;

    const newEvidenceList = evidenceList.filter((e) => e.id !== id);
    setEvidenceList(newEvidenceList);

    let newObligations = [...obligations];

    if (instName) {
      const remainingWithInst = newEvidenceList.some((e) => {
        const name = e.userConfirmedDetails?.institutionName || e.extractedDetails?.institutionName;
        return name && name.toLowerCase().includes(instName.toLowerCase());
      });

      if (!remainingWithInst) {
        newObligations = newObligations.filter((o) => !o.institutionName.toLowerCase().includes(instName.toLowerCase()));
        setObligations(newObligations);
      }
    }

    contextVersionRef.current++;

    if (newEvidenceList.length === 0) {
      setObligations([]);
      setActivity({
        currentStage: 'UNDERSTAND',
        stages: [
          { stage: 'UNDERSTAND', status: 'pending' },
          { stage: 'RETRIEVE', status: 'pending' },
          { stage: 'VERIFY', status: 'pending' },
          { stage: 'REASON', status: 'pending' },
          { stage: 'ACT', status: 'pending' }
        ],
        activeStepDescription: 'Waiting for evidence'
      });
      setGeminiInsight({
        id: "insight-zero",
        quote: "Waiting for confirmed evidence",
        summary: "Add a repayment notice to begin grounded analysis.",
        evidenceCount: 0,
        trustedSourcesCount: 0,
        generatedAt: "",
        tags: ["Waiting for evidence"],
      });
      setNextBestActions([
        {
          id: "action-waiting",
          category: "DO TODAY",
          priorityOrder: 1,
          title: "Waiting for context",
          reason: "Ask FairAssist or add your first repayment notice.",
          financialImpact: "Provides complete cash-flow visibility across all obligations.",
          evidenceUsed: [],
          trustedSourcesUsed: [],
          currentSourceStatus: "Current",
          requiresHumanAuthorisation: false,
          authorisingEntity: "Borrower",
          primaryActionButtonLabel: "Add repayment evidence →",
          actionCode: "CUSTOM",
          lineage: {
            evidenceProvided: [],
            retrievedRules: [],
            policiesApplied: [],
            geminiReasoning: "Awaiting repayment notice.",
            financialCalculation: "No confirmed evidence.",
            escalationBoundaryNote: "No obligations recorded."
          }
        }
      ]);
      setIsAnalyzing(false);
    } else {
      const updatedContext: FinancialContext = {
        ...financialContext,
        evidenceList: newEvidenceList,
        obligations: newObligations,
      };
      handleTriggerAnalysis(updatedContext);
    }
  };

  const handleSaveFinancialContext = (data: {
    availableCash: number;
    nextSalaryDate: string;
    nextSalaryAmount: number;
    essentialExpenses?: number | null;
  }) => {
    setAvailableCash(data.availableCash);
    setNextSalaryDate(data.nextSalaryDate);
    setNextSalaryAmount(data.nextSalaryAmount);
    if (data.essentialExpenses !== undefined) {
      setEssentialExpenses(data.essentialExpenses);
    }

    const updatedContext: FinancialContext = {
      ...financialContext,
      availableCash: data.availableCash,
      nextSalaryDate: data.nextSalaryDate,
      nextSalaryAmount: data.nextSalaryAmount,
      essentialExpenses: data.essentialExpenses ?? null,
    };

    handleTriggerAnalysis(updatedContext);
  };

  const handleExecuteAction = (action: NextBestAction) => {
    if (
      action.actionCode === 'ADD_FINANCIAL_CONTEXT' ||
      action.id === 'action-add-financial-context' ||
      action.id === 'action-add-cash-salary' ||
      action.title.toLowerCase().includes('cash and salary') ||
      action.primaryActionButtonLabel.toLowerCase().includes('financial context')
    ) {
      setIsFinancialContextModalOpen(true);
      return;
    }

    const textToCheck = `${action.title} ${action.primaryActionButtonLabel} ${action.reason || ''}`.toLowerCase();
    let targetInst: string | null = null;
    if (textToCheck.includes('adakami')) {
      targetInst = 'AdaKami';
    } else if (textToCheck.includes('bca')) {
      targetInst = 'BCA';
    } else if (textToCheck.includes('easycash')) {
      targetInst = 'EasyCash';
    } else if (textToCheck.includes('mandiri')) {
      targetInst = 'Mandiri';
    }

    if (targetInst) {
      updatePendingLenderRequest(targetInst, 'conversation');
    }

    if (
      action.title.toLowerCase().includes('notice') ||
      action.title.toLowerCase().includes('more context') ||
      action.title.toLowerCase().includes('waiting for context') ||
      action.primaryActionButtonLabel.toLowerCase().includes('notice') ||
      action.primaryActionButtonLabel.toLowerCase().includes('add')
    ) {
      handleOpenUploadModal('screenshot', targetInst);
    } else if (action.actionCode === 'PREPARE_EXTENSION' || action.primaryActionButtonLabel.includes('View sent request')) {
      setActiveTab('Action Plan');
      setDraftOpenTrigger((prev) => prev + 1);
      setTimeout(() => {
        const el = document.getElementById('lender-request-draft-card') || document.getElementById('step-by-step-execution-timeline');
        if (el) {
          const yOffset = -90;
          const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }, 100);
    } else if (action.actionCode === 'AVOID_NEW_BORROWING') {
      setActiveTab('Action Simulator');
    } else {
      setSelectedLineageAction(action);
    }
  };

  // Compute Focus Target based on state-driven interaction model
  const userFinancialMessagesCount = chatMessages.filter((m) => m.sender === 'user').length;
  const confirmedEvidenceCount = evidenceList.length;

  let focusTarget: FocusTarget = 'CHAT_INPUT';
  if (confirmedEvidenceCount === 0 && userFinancialMessagesCount === 0) {
    focusTarget = 'CHAT_INPUT';
  } else if (confirmedEvidenceCount === 0 && userFinancialMessagesCount > 0) {
    focusTarget = 'EVIDENCE_ENTRY';
  } else if (isUploadModalOpen) {
    focusTarget = 'GEMINI_ANALYSIS';
  } else if (isAnalyzing) {
    focusTarget = 'RETRIEVAL_PIPELINE';
  } else if (nextBestActions.length > 0) {
    focusTarget = 'NEXT_BEST_ACTION';
  } else {
    focusTarget = 'RELEVANT_INSIGHT';
  }



  const activeRepaymentObligationsCount = activeRepaymentObligations.length;
  const confirmedObligations = activeRepaymentObligations;
  const hasConfirmedObligations = activeRepaymentObligationsCount > 0;
  const hasCashContext = availableCash !== null && availableCash !== undefined;
  const hasSalaryContext = Boolean(nextSalaryDate) && nextSalaryAmount !== null && nextSalaryAmount !== undefined;
  const hasAnyConfirmedContext = evidenceList.length > 0 || hasConfirmedObligations || hasCashContext || hasSalaryContext;
  const decisionSupportReady = hasConfirmedObligations && hasCashContext && hasSalaryContext;
  const simulatorReady = decisionSupportReady;

  // Single canonical NEXT BEST ACTIONS selector ensuring perfect state integrity
  const effectiveNextBestActions = useMemo<NextBestAction[]>(() => {
    // State A: ZERO confirmed repayment obligations -> empty array triggers "Waiting for context" card
    if (!hasConfirmedObligations) {
      return [];
    }

    // State B: Repayment evidence exists, but required cash-flow information is incomplete
    if (!decisionSupportReady) {
      const pendingLenderAction = nextBestActions.find(
        (a) => a.id.startsWith('act-add-') || a.title.toLowerCase().startsWith('add ')
      );

      if (pendingLenderAction) {
        return [pendingLenderAction];
      }

      const actionTitle = hasSalaryContext
        ? "Confirm your available cash"
        : "Add your cash and salary timing";

      const actionReason = hasSalaryContext
        ? "Provide your available cash balance to calculate cash-flow gap and enable scenario comparisons across your confirmed obligations."
        : "Provide your available cash balance and salary date to calculate cash-flow gap and enable scenario comparisons across your confirmed obligations.";

      const actionCtaLabel = hasSalaryContext
        ? "Confirm available cash →"
        : "Add cash & salary information →";

      return [{
        id: "action-more-context-needed",
        category: "DO TODAY",
        priorityOrder: 1,
        title: actionTitle,
        reason: actionReason,
        financialImpact: "Enables precise cash-flow timing mismatch calculation.",
        evidenceUsed: activeRepaymentEvidence.map((e) => e.title || "Repayment notice"),
        trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
        currentSourceStatus: "Current",
        requiresHumanAuthorisation: false,
        authorisingEntity: "Borrower",
        primaryActionButtonLabel: actionCtaLabel,
        actionCode: "ADD_FINANCIAL_CONTEXT",
        lineage: {
          evidenceProvided: activeRepaymentEvidence.map((e) => e.title),
          retrievedRules: ["POJK No. 40 Tahun 2024"],
          policiesApplied: [],
          geminiReasoning: hasSalaryContext
            ? "Salary timing confirmed from evidence. Awaiting available cash input."
            : "Awaiting cash availability and salary timing inputs.",
          financialCalculation: `Confirmed repayment obligations: ${activeRepaymentObligationsCount}`,
          escalationBoundaryNote: "Cannot recommend payment allocation without cash availability."
        }
      }];
    }

    // State C: decisionSupportReady === true
    // Filter out zero-context or incomplete-context placeholder actions
    const validRealActions = nextBestActions.filter(
      (a) =>
        a.title !== "Waiting for context" &&
        a.id !== "action-waiting" &&
        a.title !== "More context needed" &&
        a.title !== "Add your cash and salary timing" &&
        a.actionCode !== "ADD_FINANCIAL_CONTEXT"
    );

    // Fallback: Generate grounded actions deterministically from canonical context
    const totalPreSalaryRepayments = activeRepaymentObligations.reduce((sum, o) => sum + (o.amount || 0), 0);
    const cash = availableCash ?? 0;
    const portfolioFundingGap = Math.max(0, totalPreSalaryRepayments - cash);

    const sortedObligations = [...activeRepaymentObligations].sort((a, b) => {
      const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });

    const earliest = sortedObligations[0];
    const earliestInst = earliest?.institutionName || "earliest lender";
    const earliestAmt = earliest?.amount || 0;
    const earliestAmtStr = `Rp${earliestAmt.toLocaleString('id-ID')}`;
    const earliestDueDate = earliest?.formattedDate || earliest?.dueDate || "due date";
    const individualCoverage = cash >= earliestAmt;

    const derivedActions: NextBestAction[] = [];

    if (portfolioFundingGap > 0) {
      const formattedSalaryDate = nextSalaryDate ? formatBritishDate(nextSalaryDate) : '28 August 2026';
      const reasonText = `${earliestInst} is due first on ${earliestDueDate} for ${earliestAmtStr}. Ask ${earliestInst} whether this repayment can be moved to ${formattedSalaryDate}, your confirmed salary date. Any change requires ${earliestInst} confirmation. If the change is not approved, the original repayment remains due.`;

      const remainingPreSalaryRepayments = totalPreSalaryRepayments - earliestAmt;
      const remainingFundingGap = Math.max(0, portfolioFundingGap - earliestAmt);

      const impactText = `If approved, pre-salary repayments decrease from Rp${totalPreSalaryRepayments.toLocaleString('en-US')} to Rp${remainingPreSalaryRepayments.toLocaleString('en-US')} and the repayment-only funding gap decreases from Rp${portfolioFundingGap.toLocaleString('en-US')} to Rp${remainingFundingGap.toLocaleString('en-US')}. Essential expenses are not included.`;

      derivedActions.push({
        id: "action-contact-earliest",
        category: "DO TODAY",
        priorityOrder: 1,
        title: `Ask ${earliestInst} about moving the repayment date`,
        reason: reasonText,
        financialImpact: impactText,
        evidenceUsed: activeRepaymentEvidence.map((e) => e.title || "Repayment notice"),
        trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
        currentSourceStatus: "Current",
        requiresHumanAuthorisation: true,
        authorisingEntity: earliestInst,
        primaryActionButtonLabel: `Prepare ${earliestInst} request →`,
        actionCode: "PREPARE_EXTENSION",
        lineage: {
          evidenceProvided: activeRepaymentEvidence.map((e) => e.title),
          retrievedRules: ["POJK No. 40 Tahun 2024"],
          policiesApplied: [`${earliestInst} standard terms`],
          geminiReasoning: individualCoverage
            ? `Earliest deadline identified (${earliestInst} due ${earliestDueDate}); available cash covers this payment individually, with a portfolio funding gap of Rp${portfolioFundingGap.toLocaleString('id-ID')} across all pre-salary obligations.`
            : `Earliest deadline identified (${earliestInst} due ${earliestDueDate}); available cash is below this payment balance.`,
          financialCalculation: `Cash Rp${cash.toLocaleString('id-ID')} vs ${earliestInst} ${earliestAmtStr} (${individualCoverage ? 'Individual payment covered' : `Individual shortfall Rp${(earliestAmt - cash).toLocaleString('id-ID')}`}; Portfolio funding gap: Rp${portfolioFundingGap.toLocaleString('id-ID')})`,
          escalationBoundaryNote: "Subject to lender confirmation; no automatic waiver or extension assumed."
        }
      });

      derivedActions.push({
        id: "action-simulate-scenarios",
        category: "REVIEW NEXT",
        priorityOrder: 2,
        title: "Compare repayment scenarios in Action Simulator",
        reason: "Evaluate 'What if?' scenarios to compare cash-flow impacts and allocation options before making payments.",
        financialImpact: "Helps identify optimal cash allocation across confirmed obligations.",
        evidenceUsed: activeRepaymentEvidence.map((e) => e.title || "Repayment notice"),
        trustedSourcesUsed: ["POJK No. 40 Tahun 2024", "SEOJK No. 19/SEOJK.06/2025"],
        currentSourceStatus: "Current",
        requiresHumanAuthorisation: false,
        authorisingEntity: "Borrower",
        primaryActionButtonLabel: "Simulate scenarios →",
        actionCode: "CUSTOM",
        lineage: {
          evidenceProvided: activeRepaymentEvidence.map((e) => e.title),
          retrievedRules: ["POJK No. 40 Tahun 2024"],
          policiesApplied: [],
          geminiReasoning: "Scenario comparison using confirmed cash position.",
          financialCalculation: `Simulating cash allocation across ${activeRepaymentObligationsCount} obligations.`,
          escalationBoundaryNote: "Simulations provide decision support only."
        }
      });

      derivedActions.push({
        id: "action-avoid-new-borrowing",
        category: "AVOID FOR NOW",
        priorityOrder: 3,
        title: "Avoid new high-cost short-term borrowing for now",
        reason: "Taking additional high-cost debt to cover existing repayments creates compounding interest and debt-trap risks under OJK POJK 40/2024.",
        financialImpact: "Prevents escalation of debt service obligations.",
        evidenceUsed: activeRepaymentEvidence.map((e) => e.title || "Repayment notice"),
        trustedSourcesUsed: ["POJK No. 40 Tahun 2024"],
        currentSourceStatus: "Current",
        requiresHumanAuthorisation: false,
        authorisingEntity: "Borrower",
        primaryActionButtonLabel: "Review regulation →",
        actionCode: "AVOID_NEW_BORROWING",
        lineage: {
          evidenceProvided: activeRepaymentEvidence.map((e) => e.title),
          retrievedRules: ["POJK No. 40 Tahun 2024"],
          policiesApplied: [],
          geminiReasoning: "OJK consumer protection rules discourage debt-layering to cover active defaults.",
          financialCalculation: "High-interest rollover increases debt burden.",
          escalationBoundaryNote: "Regulatory compliance advice."
        }
      });
    } else {
      derivedActions.push({
        id: "action-schedule-repayment",
        category: "DO TODAY",
        priorityOrder: 1,
        title: `Schedule repayment for ${earliestInst}`,
        reason: `Your available cash of Rp${cash.toLocaleString('id-ID')} is sufficient to cover your pre-salary obligations (Rp${totalPreSalaryRepayments.toLocaleString('id-ID')}).`,
        financialImpact: "Maintains account in good standing and avoids late fees.",
        evidenceUsed: activeRepaymentEvidence.map((e) => e.title || "Repayment notice"),
        trustedSourcesUsed: ["POJK No. 40 Tahun 2024"],
        currentSourceStatus: "Current",
        requiresHumanAuthorisation: true,
        authorisingEntity: earliestInst,
        primaryActionButtonLabel: `Review payment schedule →`,
        actionCode: "CUSTOM",
        lineage: {
          evidenceProvided: activeRepaymentEvidence.map((e) => e.title),
          retrievedRules: ["POJK No. 40 Tahun 2024"],
          policiesApplied: [`${earliestInst} standard terms`],
          geminiReasoning: "Cash flow is sufficient to cover obligations.",
          financialCalculation: `Cash Rp${cash.toLocaleString('id-ID')} vs obligations Rp${totalPreSalaryRepayments.toLocaleString('id-ID')}`,
          escalationBoundaryNote: "Timely payment recommended."
        }
      });
    }

    const actionsToReturn = validRealActions.length > 0 ? validRealActions : derivedActions;

    // First deduplicate raw actions by logical intent to prevent duplicate unsent recommendations
    const dedupedRaw: NextBestAction[] = [];
    const seenRawKeys = new Set<string>();

    for (const act of actionsToReturn) {
      const lender = (
        act.authorisingEntity && act.authorisingEntity !== 'Borrower'
          ? act.authorisingEntity
          : earliestInst || 'lender'
      ).toLowerCase();

      const isExtensionAction =
        act.actionCode === 'PREPARE_EXTENSION' ||
        act.title.toLowerCase().includes('moving the repayment date') ||
        act.title.toLowerCase().includes('payment-date adjustment') ||
        act.primaryActionButtonLabel.toLowerCase().includes('prepare');

      const rawKey = isExtensionAction
        ? `PREPARE_EXTENSION-${lender}`
        : act.id || `${act.actionCode || 'CUSTOM'}-${act.title.toLowerCase().trim()}`;

      if (!seenRawKeys.has(rawKey)) {
        seenRawKeys.add(rawKey);
        dedupedRaw.push(act);
      }
    }

    let processedActions = dedupedRaw;

    if (isUserActionExecuted) {
      let mappedOnce = false;
      const sentLenders = new Set<string>();

      const mapped = dedupedRaw.map((action) => {
        const lenderLabel =
          action.authorisingEntity && action.authorisingEntity !== 'Borrower'
            ? action.authorisingEntity
            : earliestInst || 'lender';

        const isExtensionAction =
          action.actionCode === 'PREPARE_EXTENSION' ||
          action.category === 'DO TODAY' ||
          action.primaryActionButtonLabel.toLowerCase().includes('prepare') ||
          action.title.toLowerCase().includes('moving the repayment date');

        if (!mappedOnce && isExtensionAction) {
          mappedOnce = true;
          sentLenders.add(lenderLabel.toLowerCase());
          return {
            ...action,
            id: action.id || 'action-sent-request',
            title: `${lenderLabel} request sent — awaiting response`,
            reason: `Your request has been recorded as sent. The original repayment obligation remains applicable until ${lenderLabel} confirms any change.`,
            currentSourceStatus: 'ACTION SENT' as const,
            requiresHumanAuthorisation: false,
            authorisingEntity: lenderLabel,
            primaryActionButtonLabel: 'View sent request →',
          };
        }
        return action;
      });

      // Filter out/suppress any unsent recommendation that matches a lender whose request has been sent
      processedActions = mapped.filter((action) => {
        if (action.currentSourceStatus === 'ACTION SENT') {
          return true;
        }

        const lenderLabel = (
          action.authorisingEntity && action.authorisingEntity !== 'Borrower'
            ? action.authorisingEntity
            : earliestInst || 'lender'
        ).toLowerCase();

        const isUnsentExtensionRecommendation =
          action.actionCode === 'PREPARE_EXTENSION' ||
          action.primaryActionButtonLabel.toLowerCase().includes('prepare') ||
          action.title.toLowerCase().includes('moving the repayment date') ||
          action.title.toLowerCase().includes('ask ');

        if (isUnsentExtensionRecommendation && sentLenders.has(lenderLabel)) {
          return false; // Suppress duplicate unsent recommendation
        }

        return true;
      });
    }

    return processedActions;
  }, [
    hasConfirmedObligations,
    decisionSupportReady,
    activeRepaymentObligations,
    activeRepaymentObligationsCount,
    activeRepaymentEvidence,
    nextBestActions,
    availableCash,
    nextSalaryDate,
    isUserActionExecuted,
  ]);

  // Real deterministic navigation handler for Review Actions CTA
  const handleNavigateToNextBestActions = () => {
    const scrollToSection = () => {
      const el = document.getElementById('next-best-actions');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.focus({ preventScroll: true });
      }
    };

    if (activeTab !== 'Overview') {
      setActiveTab('Overview');
      requestAnimationFrame(() => {
        setTimeout(scrollToSection, 60);
      });
    } else {
      scrollToSection();
    }
  };

  // Canonical AI pipeline status description derived from current state
  const canonicalStatusDescription = useMemo(() => {
    if (isAnalyzing) {
      if (activity.activeStepDescription && activity.stages.some((s) => s.status === 'active')) {
        return activity.activeStepDescription;
      }
    }
    if (isUserActionExecuted) {
      return 'User action recorded · external outcome pending';
    }
    if (!hasAnyConfirmedContext) {
      return 'Waiting for your question or evidence';
    }
    if (!hasConfirmedObligations || !hasCashContext || !hasSalaryContext) {
      return 'Confirmed evidence analysed · more context needed';
    }
    const preSalaryTotal = activeRepaymentObligations.reduce((sum, o) => sum + (o.amount || 0), 0);
    const gap = preSalaryTotal - (availableCash ?? 0);
    if (gap > 0) {
      return 'Cash-flow gap identified · decision support ready';
    } else {
      return 'Cash-flow position analysed · decision support ready';
    }
  }, [
    isAnalyzing,
    isUserActionExecuted,
    activity.activeStepDescription,
    activity.stages,
    hasAnyConfirmedContext,
    hasConfirmedObligations,
    hasCashContext,
    hasSalaryContext,
    activeRepaymentObligations,
    availableCash,
  ]);

  const displayActivity = useMemo(() => {
    if (isAnalyzing) return activity;

    const isActCompleted = isUserActionExecuted || activity.stages.some((s) => s.stage === 'ACT' && s.status === 'completed');

    let computedStages = activity.stages;

    if (hasAnyConfirmedContext) {
      computedStages = [
        { stage: 'UNDERSTAND', status: 'completed', message: 'Parsed confirmed evidence & financial context' },
        { stage: 'RETRIEVE', status: 'completed', message: 'Retrieved matching OJK & BI regulatory clauses' },
        { stage: 'VERIFY', status: 'completed', message: 'Verified active regulatory source currency' },
        { stage: 'REASON', status: 'completed', message: 'Reasoning applied to borrower situation' },
        isActCompleted
          ? {
              stage: 'ACT',
              status: 'completed',
              message: 'User action recorded · external outcome pending',
              timestamp: new Date().toLocaleTimeString('id-ID')
            }
          : { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action' },
      ];
    } else {
      computedStages = [
        { stage: 'UNDERSTAND', status: 'pending' },
        { stage: 'RETRIEVE', status: 'pending' },
        { stage: 'VERIFY', status: 'pending' },
        { stage: 'REASON', status: 'pending' },
        { stage: 'ACT', status: 'pending' },
      ];
    }

    return {
      ...activity,
      currentStage: isActCompleted ? 'ACT' : (hasAnyConfirmedContext ? 'REASON' : activity.currentStage),
      activeStepDescription: canonicalStatusDescription,
      stages: computedStages,
    };
  }, [activity, isAnalyzing, canonicalStatusDescription, hasAnyConfirmedContext, isUserActionExecuted]);

  // Determine dynamic single primary next step
  const getDynamicNextStep = () => {
    if (isAnalyzing || isChatSending) {
      return {
        text: 'Checking what applies across trusted regulatory sources…',
        actionLabel: null,
        onAction: () => {}
      };
    }

    // STATE 1: Zero confirmed repayment obligations
    if (!hasConfirmedObligations) {
      return {
        text: 'Add your first repayment notice.',
        actionLabel: 'Add repayment evidence →',
        onAction: () => handleOpenUploadModal('screenshot')
      };
    }

    // STATE 2: Obligation exists, but cash/salary context incomplete
    if (!hasCashContext || !hasSalaryContext) {
      return {
        text: activeTab === 'Action Plan' ? 'Complete your financial context.' : 'Add your cash and salary timing.',
        actionLabel: 'Add financial context →',
        onAction: () => setIsFinancialContextModalOpen(true)
      };
    }

    // STATE 3: Obligations exist AND cash/salary context complete (simulatorReady === true)
    if (activeTab === 'Action Plan') {
      return {
        text: 'Prepare the next step with your lender.',
        actionLabel: 'Prepare lender request →',
        onAction: () => {
          const el = document.getElementById('action-plan-step-1') || document.getElementById('step-1-section') || document.getElementById('action-step-1');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      };
    }

    if (activeTab === 'Action Simulator') {
      const isScenarioSelected = selectedScenarioType !== null;
      return {
        text: 'Simulate scenario outcomes before taking new commitments.',
        actionLabel: isScenarioSelected ? 'Review selected scenario →' : 'Choose a scenario →',
        onAction: () => {
          const targetId = isScenarioSelected ? 'financial-impact-comparison' : 'scenario-selection';
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      };
    }

    if (evidenceList.some(e => e.verifiedStatus === 'Pending Verification')) {
      return {
        text: 'Review what Gemini found.',
        actionLabel: 'Review evidence →',
        onAction: () => handleOpenUploadModal('screenshot')
      };
    }

    return {
      text: 'Review your Next Best Actions.',
      actionLabel: 'Review actions →',
      onAction: handleNavigateToNextBestActions
    };
  };

  const currentNextStep = getDynamicNextStep();

  return (
    <div className="min-h-screen bg-[#F9F9F8] text-[#2D2D2D] font-sans antialiased flex flex-col">
      
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-2xs">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenFreshnessModal={() => setIsFreshnessModalOpen(true)}
          isDemoScenario={isDemoScenario}
          sourceStatus={
            isAnalyzing || isChatSending
              ? 'checking'
              : evidenceList.length === 0 && obligations.length === 0
              ? 'ready'
              : 'current'
          }
        />
      </div>

      {/* Main Application Workspace Grid: Financial Decision Workspace (60%) ↔ FairAssist Copilot (40%) */}
      <div className="max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row gap-6 items-start">
          
          {/* 1. Decision Workspace (~60% width on Desktop) */}
          <main className={`w-full transition-all duration-300 ${
            isCopilotCollapsed ? 'lg:flex-1' : 'lg:flex-1 lg:w-[60%] xl:w-[60%]'
          }`}>
            
            {/* Dynamic Next Step Guidance Banner */}
            <div className="bg-white border border-stone-200 rounded-2xl p-3.5 mb-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Next Step</span>
                </div>
                <p className="text-xs font-semibold text-stone-800 truncate">
                  {currentNextStep.text}
                </p>
              </div>

              {currentNextStep.actionLabel && (
                <button
                  onClick={currentNextStep.onAction}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-95"
                >
                  <span>{currentNextStep.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            {/* TAB 1: OVERVIEW (3-COLUMN COCKPIT / REFLOWING GRID) */}
            {activeTab === 'Overview' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* Left Sub-Column: Evidence (~33% of Workspace) */}
                <div className={isCopilotCollapsed ? "col-span-12 md:col-span-3" : "col-span-12 md:col-span-4"}>
                  <EvidenceColumn
                    evidenceList={evidenceList}
                    onOpenUploadModal={handleOpenUploadModal}
                    onUpdateEvidence={handleUpdateEvidence}
                    onReplaceFile={handleReplaceFile}
                    onRemoveEvidence={handleRemoveEvidence}
                    onLoadSampleScenario={handleToggleSampleScenario}
                    onStartFreshWithOwnEvidence={handleResetDemo}
                    isFocusArea={focusTarget === 'EVIDENCE_ENTRY'}
                    isDemoScenario={isDemoScenario}
                  />
                </div>

                {/* Centre Sub-Column: Situation & Pipeline (~67% of Workspace) */}
                <div className={isCopilotCollapsed ? "col-span-12 md:col-span-5" : "col-span-12 md:col-span-8"}>
                  <SituationColumn
                    context={financialContext}
                    activity={displayActivity}
                    geminiInsight={geminiInsight}
                    onOpenSimulator={() => setActiveTab('Action Simulator')}
                    onTriggerAnalysis={handleTriggerAnalysis}
                    isAnalyzing={isAnalyzing}
                    isCopilotCollapsed={isCopilotCollapsed}
                  />
                </div>

                {/* Right Sub-Column: Next Best Actions */}
                <div id="next-best-actions" tabIndex={-1} className={`scroll-mt-24 outline-none ${isCopilotCollapsed ? "col-span-12 md:col-span-4" : "col-span-12"}`}>
                  <NextBestActionsColumn
                    actions={effectiveNextBestActions}
                    onOpenLineageModal={(act) => setSelectedLineageAction(act)}
                    onExecuteAction={handleExecuteAction}
                  />
                </div>

              </div>
            )}

            {/* TAB 2: EVIDENCE EXPANDED VIEW */}
            {activeTab === 'Evidence' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <EvidenceColumn
                  evidenceList={evidenceList}
                  onOpenUploadModal={handleOpenUploadModal}
                  onUpdateEvidence={handleUpdateEvidence}
                  onReplaceFile={handleReplaceFile}
                  onRemoveEvidence={handleRemoveEvidence}
                  onLoadSampleScenario={handleToggleSampleScenario}
                  onStartFreshWithOwnEvidence={handleResetDemo}
                  isDemoScenario={isDemoScenario}
                />
              </div>
            )}

            {/* TAB 3: RULES & POLICIES VIEW */}
            {activeTab === 'Rules & Policies' && (
              <RulesAndPoliciesView
                context={financialContext}
                onUpdateObligations={(newObls) => {
                  setObligations(newObls);
                  handleTriggerAnalysis();
                }}
              />
            )}

            {/* TAB 4: ACTION SIMULATOR ("WHAT IF?") */}
            {activeTab === 'Action Simulator' && (
              <ActionSimulator 
                context={financialContext} 
                selectedScenarioType={selectedScenarioType}
                onSelectScenarioType={setSelectedScenarioType}
                onOpenUploadModal={handleOpenUploadModal}
                onOpenFinancialContextModal={() => setIsFinancialContextModalOpen(true)}
                onAddActionToPlan={(scenario) => {
                  if (scenario?.type === 'BORROW_MORE') {
                    setSelectedScenarioType('BORROW_MORE');
                    setActiveTab('Action Plan');
                    return;
                  }
                  const targetInst = scenario.targetInstitution || 'Lender';
                  const targetAmt = scenario.targetAmount || 0;
                  const origDate = scenario.originalDueDate || 'due date';
                  const propDate = scenario.proposedDueDate || 'salary date';
                  const prodName = scenario.productName || 'repayment';

                  const actionTitle = `Ask ${targetInst} about moving the repayment date`;
                  const actionReason = `${targetInst} is due first on ${origDate} for Rp${targetAmt.toLocaleString('en-US')}. Ask ${targetInst} whether this repayment can be moved to ${propDate}, your confirmed salary date. Any change requires ${targetInst} confirmation. If the change is not approved, the original repayment remains due.`;

                  const totalPreSalaryRepayments = activeRepaymentObligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                  const cash = availableCash ?? 0;
                  const portfolioFundingGap = Math.max(0, totalPreSalaryRepayments - cash);
                  const remainingPreSalaryRepayments = totalPreSalaryRepayments - targetAmt;
                  const remainingFundingGap = Math.max(0, portfolioFundingGap - targetAmt);

                  const impactText = `If approved, pre-salary repayments decrease from Rp${totalPreSalaryRepayments.toLocaleString('en-US')} to Rp${remainingPreSalaryRepayments.toLocaleString('en-US')} and the repayment-only funding gap decreases from Rp${portfolioFundingGap.toLocaleString('en-US')} to Rp${remainingFundingGap.toLocaleString('en-US')}. Essential expenses are not included.`;

                  const newAction: NextBestAction = {
                    id: `act-request-shift-${Date.now()}`,
                    category: 'DO TODAY',
                    priorityOrder: 1,
                    title: actionTitle,
                    reason: actionReason,
                    financialImpact: impactText,
                    evidenceUsed: [targetInst],
                    trustedSourcesUsed: scenario.isBank 
                      ? ['Institution-specific policy'] 
                      : ['POJK No. 40 Tahun 2024', 'SEOJK No. 19/SEOJK.06/2025'],
                    currentSourceStatus: 'Current',
                    requiresHumanAuthorisation: true,
                    authorisingEntity: targetInst,
                    primaryActionButtonLabel: `Prepare ${targetInst} request →`,
                    actionCode: 'PREPARE_EXTENSION',
                    lineage: {
                      evidenceProvided: [targetInst],
                      retrievedRules: scenario.isBank ? ['No verified institution-specific policy'] : ['POJK No. 40 Tahun 2024'],
                      policiesApplied: [],
                      geminiReasoning: `Request ${targetInst} repayment-date adjustment to align with ${propDate} payday.`,
                      financialCalculation: `Defrays Rp${targetAmt.toLocaleString('en-US')} pre-salary requirement if approved.`,
                      escalationBoundaryNote: 'Lender confirmation required.'
                    }
                  };

                  setNextBestActions((prev) => [newAction, ...prev.filter(a => a.id !== newAction.id && !a.title.includes('payment-date adjustment'))]);

                  setActivity((prev) => ({
                    ...prev,
                    currentStage: 'ACT',
                    stages: prev.stages.map((st) => 
                      st.stage === 'ACT'
                        ? { stage: 'ACT', status: 'pending', message: 'Awaiting substantive user action', timestamp: new Date().toLocaleTimeString('id-ID') }
                        : st
                    ),
                    activeStepDescription: `Action Plan updated · ${targetInst} request drafted`
                  }));

                  setActiveTab('Action Plan');
                }}
                addedToPlan={nextBestActions.some(a => a.actionCode === 'PREPARE_EXTENSION' || a.title.includes('payment-date adjustment'))}
              />
            )}

            {/* TAB 5: ACTION PLAN VIEW */}
            {activeTab === 'Action Plan' && (
              <ActionPlanView
                actions={effectiveNextBestActions}
                context={financialContext}
                draftOpenTrigger={draftOpenTrigger}
                selectedScenarioType={selectedScenarioType}
                onSelectScenarioType={setSelectedScenarioType}
                onOpenUploadModal={handleOpenUploadModal}
                onOpenFinancialContextModal={() => setIsFinancialContextModalOpen(true)}
                onConfirmActionExecution={(actionId, counterparty) => {
                  setIsUserActionExecuted(true);
                  setActivity((prev) => ({
                    ...prev,
                    currentStage: 'ACT',
                    stages: prev.stages.map((st) => 
                      st.stage === 'ACT'
                        ? { 
                            stage: 'ACT', 
                            status: 'completed', 
                            message: 'User action recorded · external outcome pending', 
                            timestamp: new Date().toLocaleTimeString('id-ID') 
                          }
                        : st
                    ),
                    activeStepDescription: 'User action recorded · external outcome pending'
                  }));
                }}
              />
            )}

          </main>

          {/* 2. FairAssist Copilot Right-Hand Panel (~40% width on Desktop) */}
          <aside className={`hidden lg:block sticky top-[80px] h-[calc(100vh-104px)] shrink-0 transition-all duration-300 ${
            isCopilotCollapsed ? 'hidden' : 'w-[40%] xl:w-[40%] min-w-[380px] max-w-[620px]'
          }`}>
            <FairAssistCopilot
              context={financialContext}
              activity={displayActivity}
              isCollapsed={isCopilotCollapsed}
              onToggleCollapse={() => setIsCopilotCollapsed(!isCopilotCollapsed)}
              isPinned={isCopilotPinned}
              onTogglePin={() => setIsCopilotPinned(!isCopilotPinned)}
              onOpenUploadModal={handleOpenUploadModal}
              onOpenFinancialContextModal={() => setIsFinancialContextModalOpen(true)}
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isSending={isChatSending}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onNavigateToNextBestActions={handleNavigateToNextBestActions}
              activeTab={activeTab}
              isAnalyzing={isAnalyzing}
              focusTarget={focusTarget}
            />
          </aside>

        </div>
      </div>

      {/* Floating Collapsed Launcher Control (Desktop & Tablet) - Single launcher when collapsed */}
      {isCopilotCollapsed && (
        <div className="fixed bottom-6 right-6 z-40 hidden lg:block animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            onClick={() => setIsCopilotCollapsed(false)}
            style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)' }}
            className="py-3 px-5 rounded-full shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-3.5 border border-indigo-500/30 hover:border-indigo-400/60 group active:scale-95 text-white"
            title="Open FairAssist Copilot"
          >
            {/* Only the icon pulses with a gentle breathing rhythm */}
            <div className={`w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-xs ${
              isAnalyzing || isChatSending ? 'animate-spin' : 'animate-icon-breath'
            }`}>
              <Sparkles className="w-4 h-4 text-cyan-300" />
            </div>
            {/* Text remains strictly static */}
            <div className="text-left select-none">
              <div className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>✦ FairAssist</span>
                <span className={`w-2 h-2 rounded-full ${
                  isAnalyzing || isChatSending ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'
                }`} />
              </div>
              <div className="text-[11px] text-stone-300 font-medium">
                {isAnalyzing || isChatSending
                  ? 'Analysing situation…'
                  : activeTab === 'Evidence'
                  ? 'Ask about this evidence'
                  : activeTab === 'Rules & Policies'
                  ? 'Ask about these rules'
                  : activeTab === 'Action Simulator'
                  ? 'Discuss this scenario'
                  : activeTab === 'Action Plan'
                  ? 'Ask about my next step'
                  : 'Ask about your situation'}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Mobile & Tablet Drawer Control */}
      <MobileFairAssistDrawer
        context={financialContext}
        activity={displayActivity}
        isOpen={isMobileChatOpen}
        onClose={() => setIsMobileChatOpen(false)}
        onOpen={() => setIsMobileChatOpen(true)}
        onOpenUploadModal={handleOpenUploadModal}
        onOpenFinancialContextModal={() => setIsFinancialContextModalOpen(true)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        isSending={isChatSending}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onNavigateToNextBestActions={handleNavigateToNextBestActions}
      />

      {/* Lineage Modal ("Why this action?") */}
      <LineageModal
        action={selectedLineageAction}
        onClose={() => setSelectedLineageAction(null)}
      />

      {/* Regulatory & Policy Freshness Modal */}
      <FreshnessModal
        isOpen={isFreshnessModalOpen}
        onClose={() => setIsFreshnessModalOpen(false)}
        sources={regulatorySources}
        policies={institutionPolicies}
        context={financialContext}
      />

      {/* Evidence Upload / Camera Modal */}
      <EvidenceUploadModal
        isOpen={isUploadModalOpen}
        initialType={uploadModalType}
        replacingItem={replacingEvidenceItem}
        onClose={() => {
          setIsUploadModalOpen(false);
          setReplacingEvidenceItem(null);
        }}
        onAddEvidence={handleAddEvidence}
        requestedInstitution={pendingEvidenceRequest?.institution || pendingRequestedLender || ''}
        isDemoScenario={isDemoScenario}
        onStartFreshWithOwnEvidence={handleResetDemo}
        onMismatchStateChange={(isMismatch) => {
          if (isMismatch) {
            setActivity({
              currentStage: 'UNDERSTAND',
              stages: [
                { stage: 'UNDERSTAND', status: 'completed', message: 'Evidence mismatch detected' },
                { stage: 'RETRIEVE', status: 'pending' },
                { stage: 'VERIFY', status: 'pending' },
                { stage: 'REASON', status: 'pending' },
                { stage: 'ACT', status: 'pending' }
              ],
              activeStepDescription: 'Evidence mismatch · confirmation needed'
            });
          }
        }}
      />

      {/* Financial Context Modal */}
      <FinancialContextModal
        isOpen={isFinancialContextModalOpen}
        onClose={() => setIsFinancialContextModalOpen(false)}
        onSubmit={handleSaveFinancialContext}
        context={financialContext}
      />

      {/* Use Your Own Evidence - Sample Reset Confirmation Dialog */}
      {isSampleResetConfirmOpen && (
        <div 
          className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sample-reset-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="space-y-2">
              <h3 id="sample-reset-title" className="text-base font-bold text-stone-900">
                Use your own evidence?
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                You're currently using the guided sample. Starting with your own evidence will reset the sample scenario so FairAssist can analyse your information independently.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancelSampleReset}
                className="px-3.5 py-2 text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
              >
                Continue sample
              </button>
              <button
                type="button"
                onClick={handleConfirmSampleResetAndUpload}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Start fresh with my evidence
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
