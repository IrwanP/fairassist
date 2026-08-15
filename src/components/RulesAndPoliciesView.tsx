import React, { useState, useEffect } from 'react';
import { FinancialContext, FinancialObligation } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { TrustedSourceRegistry } from '../data/sourcesConfig';
import { 
  getApplicableInstitutions, 
  retrieveApplicableRegulations, 
  ApplicableInstitution 
} from '../services/policyRetrievalService';
import { 
  BookOpen, 
  ShieldCheck, 
  ExternalLink, 
  Building2, 
  Scale, 
  RefreshCw, 
  CheckCircle2, 
  Sparkles, 
  Info, 
  PhoneCall, 
  Filter,
  PlusCircle,
  AlertTriangle,
  History,
  X
} from 'lucide-react';

interface RulesAndPoliciesViewProps {
  context: FinancialContext;
  onUpdateObligations?: (newObligations: FinancialObligation[]) => void;
}

export const RulesAndPoliciesView: React.FC<RulesAndPoliciesViewProps> = ({
  context,
  onUpdateObligations,
}) => {
  const [showHistorical, setShowHistorical] = useState<boolean>(false);
  const [isRetrieving, setIsRetrieving] = useState<boolean>(false);
  const [retrievalStepIndex, setRetrievalStepIndex] = useState<number>(0);
  const [selectedPolicyModal, setSelectedPolicyModal] = useState<ApplicableInstitution | null>(null);
  const [isAddingObligation, setIsAddingObligation] = useState<boolean>(false);
  const [selectedInstFilter, setSelectedInstFilter] = useState<string>('All');

  // Form state for adding custom obligation
  const [newInstName, setNewInstName] = useState<string>('');
  const [newInstCategory, setNewInstCategory] = useState<FinancialObligation['category']>('Bank Loan');
  const [newAmount, setNewAmount] = useState<number>(1000000);
  const [newDueDate, setNewDueDate] = useState<string>('2026-08-30');

  const confirmedObligations = (context.obligations || []).filter(
    (o) => !o.isSalary && ((o.amount !== null && o.amount !== undefined && o.amount > 0) || Boolean(o.institutionName))
  );
  const hasConfirmedObligations = confirmedObligations.length > 0;

  // Compute applicable institutions & regulations dynamically from context!
  const applicableInstitutions = getApplicableInstitutions(context, showHistorical);
  const regulatorySectors = retrieveApplicableRegulations(context, showHistorical);

  // Auto-reset filter if currently selected institution is removed from context
  useEffect(() => {
    if (selectedInstFilter !== 'All') {
      const exists = applicableInstitutions.some(
        (inst) => inst.institutionId === selectedInstFilter || inst.institutionName === selectedInstFilter
      );
      if (!exists) {
        setSelectedInstFilter('All');
      }
    }
  }, [applicableInstitutions, selectedInstFilter]);

  const displayedInstitutions = applicableInstitutions.filter((inst) => {
    if (selectedInstFilter === 'All') return true;
    return inst.institutionId === selectedInstFilter || inst.institutionName === selectedInstFilter;
  });

  // Dynamic progressive retrieval simulation whenever obligations or showHistorical changes
  const runVisibleRetrieval = () => {
    setIsRetrieving(true);
    setRetrievalStepIndex(0);

    const stepsCount = applicableInstitutions.length * 2 + 2;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      setRetrievalStepIndex(currentStep);
      if (currentStep >= stepsCount) {
        clearInterval(interval);
        setIsRetrieving(false);
      }
    }, 400);
  };

  useEffect(() => {
    runVisibleRetrieval();
  }, [context.obligations.length, showHistorical]);

  // Generate dynamic retrieval log steps based on current obligations
  const getRetrievalSteps = () => {
    const steps: string[] = [
      '↗ Trusted Retrieval: Identifying institutions relevant to your obligations…'
    ];

    applicableInstitutions.forEach((inst) => {
      steps.push(`↗ Trusted Retrieval: Verifying ${inst.institutionName}…`);
      steps.push(`↗ Trusted Retrieval: Checking current ${inst.institutionName} product information…`);
    });

    steps.push('✦ Gemini: Connecting current rules to your financial situation…');
    return steps;
  };

  const stepsList = getRetrievalSteps();

  // Presets for quick acceptance testing
  const applyPreset = (presetKey: 'bca-adakami' | 'bri-mandiri' | 'btpn-easycash' | 'unverified') => {
    if (!onUpdateObligations) return;

    if (presetKey === 'bca-adakami') {
      onUpdateObligations([
        {
          id: 'obl-1',
          title: 'Personal Loan Instalment',
          institutionId: 'bank-bca',
          institutionName: 'Bank Central Asia (BCA)',
          category: 'Bank Loan',
          amount: 1200000,
          dueDate: '2026-08-25',
          formattedDate: '25 August 2026',
          status: 'Upcoming',
          notes: 'Auto-debit mandate active on BCA primary account.'
        },
        {
          id: 'obl-2',
          title: 'Short-term Micro-credit',
          institutionId: 'pindar-adakami',
          institutionName: 'AdaKami',
          category: 'Pindar Loan',
          amount: 750000,
          dueDate: '2026-08-27',
          formattedDate: '27 August 2026',
          status: 'Upcoming',
          notes: 'P2P repayment via virtual account.'
        }
      ]);
    } else if (presetKey === 'bri-mandiri') {
      onUpdateObligations([
        {
          id: 'obl-bri',
          title: 'BRI Briguna Personal Loan',
          institutionId: 'bank-bri',
          institutionName: 'Bank Rakyat Indonesia (BRI)',
          category: 'Bank Loan',
          amount: 1500000,
          dueDate: '2026-08-26',
          formattedDate: '26 August 2026',
          status: 'Upcoming',
          notes: 'BRI Briguna salary linked facility.'
        },
        {
          id: 'obl-mandiri',
          title: 'Mandiri KSM Facility',
          institutionId: 'bank-mandiri',
          institutionName: 'Bank Mandiri',
          category: 'Bank Loan',
          amount: 2000000,
          dueDate: '2026-08-29',
          formattedDate: '29 August 2026',
          status: 'Upcoming',
          notes: 'Mandiri KSM auto-deduction.'
        }
      ]);
    } else if (presetKey === 'btpn-easycash') {
      onUpdateObligations([
        {
          id: 'obl-btpn',
          title: 'Jenius Flexi Cash',
          institutionId: 'bank-btpn',
          institutionName: 'Bank BTPN (Jenius / BTPN)',
          category: 'Bank Loan',
          amount: 1100000,
          dueDate: '2026-08-25',
          formattedDate: '25 August 2026',
          status: 'Upcoming',
          notes: 'BTPN Flexi Cash revolving credit line.'
        },
        {
          id: 'obl-easycash',
          title: 'EasyCash P2P Loan',
          institutionId: 'pindar-easycash',
          institutionName: 'EasyCash',
          category: 'Pindar Loan',
          amount: 800000,
          dueDate: '2026-08-27',
          formattedDate: '27 August 2026',
          status: 'Upcoming',
          notes: 'EasyCash LPBBTI short-term credit.'
        }
      ]);
    } else if (presetKey === 'unverified') {
      onUpdateObligations([
        {
          id: 'obl-unverified',
          title: 'Private Micro Financing Facility',
          institutionId: 'inst-private',
          institutionName: 'Mitra Finansial Sejahtera (Unverified)',
          category: 'Private Credit',
          amount: 900000,
          dueDate: '2026-08-30',
          formattedDate: '30 August 2026',
          status: 'Upcoming',
          notes: 'Unverified private lender.'
        }
      ]);
    }
  };

  const handleAddCustomObligation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstName.trim() || !onUpdateObligations) return;

    const newObl: FinancialObligation = {
      id: `obl-custom-${Date.now()}`,
      title: `${newInstName} Facility`,
      institutionId: `inst-${Date.now()}`,
      institutionName: newInstName.trim(),
      category: newInstCategory,
      amount: Number(newAmount) || 1000000,
      dueDate: newDueDate,
      formattedDate: newDueDate,
      status: 'Upcoming',
      notes: 'User-added financial obligation'
    };

    onUpdateObligations([...context.obligations, newObl]);
    setNewInstName('');
    setIsAddingObligation(false);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      
      {/* Header & Supporting Copy */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-teal-700 font-semibold text-xs uppercase tracking-wider">
              <Scale className="w-4 h-4" />
              Dynamic Regulatory & Policy Repository
            </div>
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
              Rules & Policies
            </h2>
            <p className="text-xs font-medium text-stone-700 leading-relaxed">
              {hasConfirmedObligations
                ? 'Current regulatory and institution-specific information relevant to your confirmed financial obligations.'
                : 'General regulatory information is available below. Institution-specific rules will appear after you confirm repayment evidence.'}
            </p>
          </div>

          {/* Sources Current Badge & Manual Refresh */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Sources Current
            </span>

            <button
              onClick={runVisibleRetrieval}
              disabled={isRetrieving}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrieving ? 'animate-spin' : ''}`} />
              Re-verify Sources
            </button>
          </div>
        </div>
      </div>

      {/* Visible Progressive Retrieval Activity Banner */}
      {isRetrieving && (
        <div className="bg-stone-900 text-white rounded-2xl p-4 shadow-md space-y-2 font-mono text-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <div className="flex items-center gap-2 text-teal-400 font-bold">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>DYNAMIC TRUSTED RETRIEVAL IN PROGRESS</span>
            </div>
            <span className="text-[10px] text-stone-400">
              Step {Math.min(retrievalStepIndex + 1, stepsList.length)} of {stepsList.length}
            </span>
          </div>
          <div className="space-y-1.5 pt-1">
            {stepsList.slice(0, retrievalStepIndex + 1).map((step, idx) => (
              <div 
                key={idx} 
                className={`flex items-center gap-2 ${
                  idx === retrievalStepIndex ? 'text-teal-300 font-bold' : 'text-stone-400'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 1: REGULATORY FRAMEWORK */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
              Regulatory Framework
            </h3>
          </div>
          <span className="text-xs text-stone-500 font-medium">
            {hasConfirmedObligations
              ? 'Applicable regulator rules matching your active sectors'
              : 'General regulatory framework'}
          </span>
        </div>

        {regulatorySectors.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center text-stone-500 text-xs">
            No active regulatory sector rules detected for current financial context.
          </div>
        ) : (
          regulatorySectors.map((sectorItem) => (
            <div key={sectorItem.sector} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-bold">
                  {sectorItem.sector} Sector
                </span>
                <div className="flex-1 h-[1px] bg-stone-200" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sectorItem.rules.map((rule) => {
                  const resolved = TrustedSourceRegistry.resolve(rule.id || rule.codeNumber || rule.officialUrl);
                  return (
                    <div
                      key={rule.id}
                      className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                            {resolved.organisation}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              resolved.status === 'Current'
                                ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                                : 'text-rose-800 bg-rose-50 border-rose-200'
                            }`}
                          >
                            {resolved.displayStatusText}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-stone-900 leading-snug">
                          {resolved.title}
                        </h4>

                        <p className="text-xs text-stone-600 leading-relaxed">
                          {rule.summaryText}
                        </p>

                        <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/80 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                            Enforceable Provisions
                          </span>
                          <ul className="list-disc list-inside text-[11px] text-stone-700 space-y-1">
                            {rule.keyClauses.map((clause, idx) => (
                              <li key={idx}>
                                <GeminiResponse content={clause} compact className="inline text-stone-700" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-[11px]">
                        <span className="text-stone-400 font-mono">
                          Effective: {rule.effectiveDate}
                        </span>
                        <a
                          href={resolved.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          Open official source <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* SECTION 2: YOUR INSTITUTIONS */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
              Your Institutions
            </h3>
          </div>

          {/* Historical Facilities Toggle Control */}
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 px-3 py-1 rounded-xl transition-colors">
            <input
              type="checkbox"
              checked={showHistorical}
              onChange={(e) => setShowHistorical(e.target.checked)}
              className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <History className="w-3.5 h-3.5 text-stone-500" />
            <span>Show historical facilities</span>
          </label>
        </div>

        {/* Dynamic Institution Filters (Belongs ONLY in Rules & Policies) */}
        {applicableInstitutions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-200/80">
            <span className="text-xs font-bold text-stone-600 flex items-center gap-1.5 mr-1">
              <Filter className="w-3.5 h-3.5 text-purple-600" /> Institution Filter:
            </span>
            <button
              onClick={() => setSelectedInstFilter('All')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedInstFilter === 'All'
                  ? 'bg-purple-900 text-white shadow-2xs'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              All ({applicableInstitutions.length})
            </button>
            {applicableInstitutions.map((inst) => {
              const isSelected = selectedInstFilter === inst.institutionId;
              const shortName = inst.institutionName.split('(')[0].trim();
              return (
                <button
                  key={inst.institutionId}
                  onClick={() => setSelectedInstFilter(inst.institutionId)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-900 text-white shadow-2xs'
                      : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  {shortName}
                </button>
              );
            })}
          </div>
        )}

        {applicableInstitutions.length === 0 ? (
          <div className="bg-white border border-stone-200/90 rounded-2xl p-8 shadow-2xs text-center space-y-3 max-w-xl mx-auto my-4">
            <div className="w-10 h-10 rounded-full bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center mx-auto">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-stone-900">
                No repayment obligations confirmed yet
              </h4>
              <p className="text-xs text-stone-600 leading-relaxed">
                General regulatory information is available below. Institution-specific rules will appear after you confirm repayment evidence.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {displayedInstitutions.map((inst) => {
              const policy = inst.verifiedPolicy;

              return (
                <div
                  key={inst.institutionId}
                  className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-4 flex flex-col justify-between relative"
                >
                  <div className="space-y-3">
                    {/* Header: Institution Name & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-bold text-stone-900 tracking-tight">
                          {inst.institutionName}
                        </h4>
                        <p className="text-[11px] text-stone-500 font-mono">
                          {inst.legalEntity}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 shrink-0">
                        {inst.institutionType}
                      </span>
                    </div>

                    {/* Verification Status Badge */}
                    <div className="flex items-center gap-1.5 text-xs">
                      {inst.isVerifiedByOJK ? (
                        <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          {inst.verifiedBadge}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Unverified Provider
                        </span>
                      )}
                    </div>

                    {/* Active Facilities under this institution */}
                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/80 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                        Confirmed Active Facilities
                      </span>
                      <div className="space-y-1">
                        {inst.facilities.map((fac) => (
                          <div key={fac.id} className="flex items-center justify-between text-xs">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-stone-800 block">{fac.title}</span>
                              <span className="text-[10px] text-stone-500 block">Ref: {fac.facilityIdentifier}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-stone-900 font-mono block">
                                Rp{fac.amount.toLocaleString('id-ID')}
                              </span>
                              {fac.dueDate && (
                                <span className="text-[10px] text-stone-500 block">Due: {fac.dueDate}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Policy Details OR Empty Unverified Policy State */}
                    {inst.isPolicyVerified && policy ? (
                      <div className="space-y-2.5 pt-1">
                        <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/80 space-y-2 text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
                            Relevant Policy Provisions
                          </span>
                          
                          <div className="space-y-1.5 text-[11px] text-stone-700">
                            <div>
                              <strong className="text-stone-900">Repayment info:</strong> {policy.repaymentInformation}
                            </div>
                            <div>
                              <strong className="text-stone-900">Product terms:</strong> {policy.productTerms}
                            </div>
                            <div>
                              <strong className="text-stone-900">Customer assistance:</strong> {policy.customerAssistance}
                            </div>
                            <div>
                              <strong className="text-stone-900">Complaints / contact route:</strong> {policy.complaintsContactRoute}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* REQUIRED UNVERIFIED POLICY STATE */
                      <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 text-center space-y-2">
                        <div className="flex items-center justify-center gap-1.5 text-amber-900 font-bold text-xs">
                          <Info className="w-4 h-4 text-amber-700" />
                          <span>No current institution-specific policy could be verified for this issue.</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          FairAssist cannot confirm a verified public policy document for {inst.institutionName}.
                        </p>
                        <a
                          href={inst.officialUrl !== '#' ? inst.officialUrl : '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-900 text-white hover:bg-amber-950 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          Contact official institution channel
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  {inst.isPolicyVerified && (
                    <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-stone-400">
                        OJK Licence: {inst.licenceNumber || 'OJK Supervised'}
                      </span>
                      <button
                        onClick={() => setSelectedPolicyModal(inst)}
                        className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        View applicable policies <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Policy Detail Modal */}
      {selectedPolicyModal && selectedPolicyModal.verifiedPolicy && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200">
                  {selectedPolicyModal.institutionName}
                </span>
                <h3 className="text-lg font-bold text-stone-900 mt-1">
                  {selectedPolicyModal.verifiedPolicy.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPolicyModal(null)}
                className="p-1 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-700 bg-stone-50 p-4 rounded-xl border border-stone-200">
              <div>
                <span className="font-bold text-stone-900 block">Document Type:</span>
                <p>{selectedPolicyModal.verifiedPolicy.documentType}</p>
              </div>
              <div>
                <span className="font-bold text-stone-900 block">Product Information:</span>
                <p>{selectedPolicyModal.verifiedPolicy.productInformation}</p>
              </div>
              <div>
                <span className="font-bold text-stone-900 block">Repayment Guidelines:</span>
                <p>{selectedPolicyModal.verifiedPolicy.repaymentInformation}</p>
              </div>
              <div>
                <span className="font-bold text-stone-900 block">Customer Support & Assistance Route:</span>
                <p>{selectedPolicyModal.verifiedPolicy.customerAssistance}</p>
              </div>
              <div>
                <span className="font-bold text-stone-900 block">Complaints & Escalation Channel:</span>
                <p>{selectedPolicyModal.verifiedPolicy.complaintsContactRoute}</p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[10px] text-stone-400 font-mono">
                Effective: {selectedPolicyModal.verifiedPolicy.effectiveDate}
              </span>
              <a
                href={selectedPolicyModal.verifiedPolicy.officialUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
              >
                Open Official Web Portal <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Obligation Modal */}
      {isAddingObligation && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddCustomObligation} className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">Add Confirmed Obligation</h3>
              <button
                type="button"
                onClick={() => setIsAddingObligation(false)}
                className="p-1 hover:bg-stone-100 rounded-lg text-stone-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Institution Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank Mandiri, BTPN, EasyCash, etc."
                  value={newInstName}
                  onChange={(e) => setNewInstName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Category / Facility Type</label>
                <select
                  value={newInstCategory}
                  onChange={(e) => setNewInstCategory(e.target.value as FinancialObligation['category'])}
                  className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-indigo-500 outline-none text-xs bg-white"
                >
                  <option value="Bank Loan">Bank Loan / Personal Loan</option>
                  <option value="Pindar Loan">Pindar / P2P Loan</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Paylater">Paylater / Micro-credit</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Amount Due (Rp)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingObligation(false)}
                className="px-4 py-2 bg-stone-100 text-stone-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700"
              >
                Confirm Obligation
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
