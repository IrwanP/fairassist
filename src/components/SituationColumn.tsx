import React, { useMemo } from 'react';
import { FinancialContext, AgentActivity, GeminiInsight } from '../types';
import { deriveCanonicalObligations } from '../utils/canonicalData';
import { PipelineStepper } from './PipelineStepper';
import { GeminiResponse } from './GeminiResponse';
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2
} from 'lucide-react';

interface SituationColumnProps {
  context: FinancialContext;
  activity: AgentActivity;
  geminiInsight: GeminiInsight;
  onOpenSimulator: () => void;
  onTriggerAnalysis: () => void;
  isAnalyzing?: boolean;
  isCopilotCollapsed?: boolean;
}

export const SituationColumn: React.FC<SituationColumnProps> = ({
  context,
  activity,
  geminiInsight,
  onOpenSimulator,
  onTriggerAnalysis,
  isAnalyzing = false,
  isCopilotCollapsed = false,
}) => {
  const { availableCash, selectedBank, selectedPindar, obligations, nextSalaryAmount, evidenceList } = context;

  // Active repayment obligations derived from canonical obligations and confirmed evidence
  const activeRepaymentObligations = useMemo(() => {
    return deriveCanonicalObligations(obligations, evidenceList);
  }, [obligations, evidenceList]);

  const totalNearTermDue = useMemo(() => {
    return activeRepaymentObligations.reduce((sum, o) => sum + (o.amount || 0), 0);
  }, [activeRepaymentObligations]);

  const dueBeforeSalary = useMemo(() => {
    if (!context.nextSalaryDate) {
      return activeRepaymentObligations.reduce((sum, o) => sum + (o.amount || 0), 0);
    }
    const salaryTime = new Date(context.nextSalaryDate).getTime();
    return activeRepaymentObligations
      .filter((o) => {
        if (!o.dueDate) return true;
        const oblTime = new Date(o.dueDate).getTime();
        return oblTime < salaryTime;
      })
      .reduce((sum, o) => sum + (o.amount || 0), 0);
  }, [activeRepaymentObligations, context.nextSalaryDate]);

  const dueBeforeSalaryCount = useMemo(() => {
    if (!context.nextSalaryDate) return activeRepaymentObligations.length;
    const salaryTime = new Date(context.nextSalaryDate).getTime();
    return activeRepaymentObligations.filter((o) => {
      if (!o.dueDate) return true;
      const oblTime = new Date(o.dueDate).getTime();
      return oblTime < salaryTime;
    }).length;
  }, [activeRepaymentObligations, context.nextSalaryDate]);

  const hasValidAnalysis = evidenceList.length > 0 || obligations.length > 0;

  // Sort active repayment obligations chronologically ascending by due date
  const sortedObligations = useMemo(() => {
    return [...activeRepaymentObligations].sort((a, b) => {
      const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [activeRepaymentObligations]);

  return (
    <main className="space-y-6">
      
      {/* Column Title Bar with AI Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">
            Financial Situation
          </h1>
          <p className="text-xs text-stone-500">
            Current cash position, repayment dates and payroll timing schedule
          </p>
        </div>

        {hasValidAnalysis && (
          <button
            onClick={onTriggerAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-2.5 py-1 text-stone-500 hover:text-stone-800 bg-transparent text-xs font-medium transition-all cursor-pointer disabled:opacity-60"
            title="Manually re-run analysis if required"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-500 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Re-analysing…' : '↻ Re-run analysis'}</span>
          </button>
        )}
      </div>

      {/* AI Background Processing Indicator & Stepper Container */}
      <div className="space-y-3">
        {/* Processing Status Banner with reserved vertical height so layout doesn't shift */}
        <div className={`min-h-[46px] flex items-center justify-between px-3.5 py-2 rounded-xl border transition-all ${
          isAnalyzing || activity.stages.some(s => s.status === 'active')
            ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950 shadow-2xs'
            : 'bg-stone-50 border-stone-200/80 text-stone-700'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-5 h-5 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
              <Sparkles className={`w-3 h-3 ${isAnalyzing || activity.stages.some(s => s.status === 'active') ? 'animate-spin text-indigo-600' : 'text-stone-500'}`} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold truncate">
                {activity.activeStepDescription || 'Waiting for your question or evidence'}
              </span>
              {(isAnalyzing || activity.stages.some(s => s.status === 'active')) && (
                <span className="text-[10px] text-indigo-600 font-medium">
                  Working in the background
                </span>
              )}
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/80 border border-stone-200 text-stone-600 shrink-0">
            AI Status
          </span>
        </div>

        <PipelineStepper activity={activity} onRetry={onTriggerAnalysis} />
      </div>

      {/* Primary Financial Overview Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.10fr)_minmax(0,1.00fr)_minmax(0,0.95fr)] gap-3.5 sm:gap-4">
        
        {/* Available Cash Card (~36% width) */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 shadow-2xs min-w-0">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1 block leading-tight">
            Available Cash
          </span>
          <div className="text-xl lg:text-2xl font-light text-stone-900 font-mono tracking-tight whitespace-nowrap">
            {availableCash !== null && availableCash !== undefined 
              ? `Rp${availableCash.toLocaleString('id-ID')}` 
              : 'N/A'}
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            {availableCash !== null ? 'Confirmed' : 'Not confirmed'}
          </p>
        </div>

        {/* Due Before Salary / Mismatch Stat Card (~33% width) */}
        <div className="bg-amber-50/60 p-3.5 sm:p-4 rounded-2xl border border-amber-200/70 shadow-2xs min-w-0">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1 block leading-tight">
            Due Before Salary
          </span>
          <div className="text-xl lg:text-2xl font-light text-amber-950 font-mono tracking-tight whitespace-nowrap">
            {context.nextSalaryDate && obligations.length > 0 && dueBeforeSalary > 0 
              ? `Rp${(dueBeforeSalary / 1000000).toFixed(2)}M` 
              : 'N/A'}
          </div>
          <p className="text-[11px] text-amber-900 mt-1 leading-tight">
            {!context.nextSalaryDate 
              ? 'Salary date not confirmed' 
              : dueBeforeSalaryCount > 0 
              ? `${dueBeforeSalaryCount} active repayment(s) due before salary` 
              : 'No obligations due before salary'}
          </p>
        </div>

        {/* Upcoming Salary Card (~31% width) */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 shadow-2xs min-w-0">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1 block leading-tight">
            Upcoming Salary
          </span>
          <div className="text-xl lg:text-2xl font-light text-stone-900 font-mono tracking-tight whitespace-nowrap">
            {nextSalaryAmount !== null && nextSalaryAmount !== undefined && context.nextSalaryDate !== null
              ? `Rp${(nextSalaryAmount / 1000000).toFixed(2)}M` 
              : 'N/A'}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium mt-1 leading-tight">
            {context.nextSalaryDate ? context.nextSalaryDate : 'Not confirmed'}
          </p>
        </div>

      </div>

      {/* Dynamic Highlight Banner: Timing Mismatch Card */}
      {activeRepaymentObligations.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-950">
                Rp{(totalNearTermDue / 1000000).toFixed(2)}M due across active obligations
              </h3>
              <p className="text-xs text-amber-900 leading-relaxed">
                {context.nextSalaryDate 
                  ? `FairAssist has mapped ${activeRepaymentObligations.length} active obligation(s) against your salary schedule.`
                  : `FairAssist has confirmed ${activeRepaymentObligations.length} active repayment obligation${activeRepaymentObligations.length > 1 ? 's' : ''}.`}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
              {(!context.nextSalaryDate || availableCash === null) && (
                <span className="text-[10px] font-medium text-amber-900/80 max-w-[190px]">
                  {context.nextSalaryDate && availableCash === null
                    ? "Add available cash balance to simulate scenarios."
                    : "Add salary timing and available cash to simulate scenarios."}
                </span>
              )}
              <button
                onClick={onOpenSimulator}
                disabled={!context.nextSalaryDate || availableCash === null}
                title={!context.nextSalaryDate || availableCash === null ? (context.nextSalaryDate ? "Add available cash balance to simulate scenarios." : "Add salary timing and available cash to simulate scenarios.") : undefined}
                className="px-3 py-1.5 bg-amber-900 text-white rounded-lg text-xs font-semibold hover:bg-amber-950 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simulate scenarios <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✦ Gemini Grounded Insight Box - ONLY render when real evidence/synthesis exists */}
      {evidenceList.length > 0 && geminiInsight.evidenceCount > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 relative overflow-hidden space-y-3">
          {/* Top Gradient Bar */}
          <div 
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: 'linear-gradient(90deg, #60A5FA, #8B5CF6, #2DD4BF)' }}
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Gemini Grounded Reasoning
            </div>
            <span className="text-[10px] text-stone-400 font-mono">
              Grounded AI Synthesis
            </span>
          </div>

          <blockquote className="text-sm font-semibold text-stone-800 leading-snug pl-3 border-l-2 border-stone-800 italic">
            <GeminiResponse content={geminiInsight.quote} />
          </blockquote>

          <GeminiResponse content={geminiInsight.summary} className="text-xs text-stone-600 leading-relaxed" />

          <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between text-[11px] text-stone-500">
            <div className="flex items-center gap-3">
              <span>Based on {geminiInsight.evidenceCount} confirmed evidence item{geminiInsight.evidenceCount === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>{geminiInsight.trustedSourcesCount} trusted sources</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              OJK & BI Rule Verification Confirmed
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Interactive Financial Timeline Card */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">
            Interactive Financial Timeline
          </h3>
          <span className="text-[11px] font-mono font-semibold text-stone-500">
            {obligations.length > 0 ? `${obligations.length} Events Scheduled` : 'No obligations yet'}
          </span>
        </div>

        {obligations.length === 0 ? (
          <div className="text-center py-6 space-y-1">
            <h3 className="text-xs font-bold text-stone-800">No obligations yet</h3>
            <p className="text-[11px] text-stone-500">Your timeline will appear here once evidence is confirmed.</p>
          </div>
        ) : (
          <div className="space-y-4 relative">
            {/* Vertical axis line */}
            <div className="absolute left-[20.5px] top-4 bottom-4 w-[1px] bg-stone-200" />

            {sortedObligations.map((obl, idx) => (
              <div 
                key={obl.id || idx}
                className={`relative pl-10 flex items-start justify-between gap-3 ${
                  obl.isSalary ? 'p-3 rounded-xl bg-emerald-50 border border-emerald-100' : ''
                }`}
              >
                <div 
                  className={`absolute left-3 ${obl.isSalary ? 'top-4.5 bg-emerald-500' : 'top-1.5 bg-stone-400'} w-3 h-3 rounded-full ring-4 ring-white z-10 shrink-0`} 
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${obl.isSalary ? 'text-emerald-950' : 'text-stone-900'}`}>
                      {obl.formattedDate || obl.dueDate}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      obl.isSalary 
                        ? 'bg-emerald-200 text-emerald-900' 
                        : obl.status === 'Overdue' 
                        ? 'bg-rose-100 text-rose-800' 
                        : 'bg-stone-100 text-stone-700'
                    }`}>
                      {obl.category} {obl.status === 'Overdue' ? '· Overdue' : ''}
                    </span>
                  </div>
                  <p className={`text-xs font-semibold ${obl.isSalary ? 'text-emerald-900' : 'text-stone-800'}`}>
                    {obl.institutionName} — {obl.title}
                  </p>
                  {obl.notes && (
                    <p className={`text-[11px] ${obl.isSalary ? 'text-emerald-800' : 'text-stone-500'}`}>
                      {obl.notes}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs font-bold font-mono ${obl.isSalary ? 'text-emerald-900' : 'text-stone-900'}`}>
                    {obl.isSalary ? '+' : ''}Rp{obl.amount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

