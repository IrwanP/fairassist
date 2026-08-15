import React from 'react';
import { NextBestAction } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { X, ShieldAlert, Sparkles, FileText, BookOpen, Calculator, ArrowRight, UserCheck } from 'lucide-react';

interface LineageModalProps {
  action: NextBestAction | null;
  onClose: () => void;
}

export const LineageModal: React.FC<LineageModalProps> = ({ action, onClose }) => {
  if (!action) return null;

  const { lineage } = action;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-stone-100 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              Grounded Decision Lineage
            </span>
            <h2 className="text-lg font-bold text-stone-900 tracking-tight mt-1">
              How FairAssist reached this
            </h2>
            <p className="text-xs text-stone-500">
              {action.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step-by-Step Intelligence Lineage Flow */}
        <div className="space-y-4">
          
          {/* Step 1: Your Evidence */}
          <div className="flex items-start gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
            <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-700 shrink-0">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-bold text-stone-900 uppercase tracking-wider text-[10px] text-indigo-600">
                1. Your Evidence
              </span>
              <ul className="list-disc list-inside text-stone-700 space-y-0.5">
                {lineage.evidenceProvided.map((ev, i) => (
                  <li key={i}>{ev}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Step 2: Trusted Retrieval */}
          <div className="flex items-start gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
            <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-700 shrink-0">
              <BookOpen className="w-4 h-4 text-teal-600" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-bold text-stone-900 uppercase tracking-wider text-[10px] text-teal-600">
                2. Trusted Retrieval (OJK & BI Rules)
              </span>
              <ul className="list-disc list-inside text-stone-700 space-y-0.5">
                {lineage.retrievedRules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Step 3: Current Rules & Policies */}
          <div className="flex items-start gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
            <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-700 shrink-0">
              <BookOpen className="w-4 h-4 text-purple-600" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-bold text-stone-900 uppercase tracking-wider text-[10px] text-purple-600">
                3. Applicable Lender Policies
              </span>
              <ul className="list-disc list-inside text-stone-700 space-y-0.5">
                {lineage.policiesApplied.map((pol, i) => (
                  <li key={i}>{pol}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Step 4: Gemini Reasoning */}
          <div className="flex items-start gap-3 bg-gradient-to-r from-indigo-50 via-purple-50 to-teal-50 p-3.5 rounded-xl border border-indigo-200">
            <div className="p-2 rounded-lg bg-white border border-indigo-200 text-indigo-700 shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-bold uppercase tracking-wider text-[10px] text-indigo-900">
                4. ✦ Gemini Grounded Reasoning
              </span>
              <GeminiResponse content={lineage.geminiReasoning} className="text-stone-800 leading-relaxed italic" />
            </div>
          </div>

          {/* Step 5: Financial Calculation */}
          <div className="flex items-start gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
            <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-700 shrink-0">
              <Calculator className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-bold text-stone-900 uppercase tracking-wider text-[10px] text-emerald-600">
                5. Financial Calculation
              </span>
              <GeminiResponse content={lineage.financialCalculation} className="text-stone-700 font-mono" />
            </div>
          </div>

        </div>

        {/* Human Escalation Decision Boundary Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <UserCheck className="w-4 h-4 text-amber-700" />
            Human Authorisation Boundary
          </div>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            FairAssist can explain, prioritise and prepare actions. It cannot approve restructuring, waive repayments or change lending terms. Decisions requiring lender authority must be escalated to an authorised human.
          </p>
        </div>

        {/* Modal Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
          >
            Close Decision Lineage
          </button>
        </div>

      </div>
    </div>
  );
};
