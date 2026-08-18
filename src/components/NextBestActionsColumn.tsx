import React from 'react';
import { NextBestAction, ActionPriorityCategory } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { 
  ArrowRight, 
  HelpCircle, 
  FileText, 
  BookOpen,
  Sparkles,
  Check
} from 'lucide-react';

interface NextBestActionsColumnProps {
  actions: NextBestAction[];
  onOpenLineageModal: (action: NextBestAction) => void;
  onExecuteAction: (action: NextBestAction) => void;
  onApproveAction?: (action: NextBestAction) => void;
}

export const NextBestActionsColumn: React.FC<NextBestActionsColumnProps> = ({
  actions,
  onOpenLineageModal,
  onExecuteAction,
  onApproveAction,
}) => {
  const categories: { key: ActionPriorityCategory; label: string; badgeStyle: string }[] = [
    {
      key: 'DO TODAY',
      label: 'DO TODAY',
      badgeStyle: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      key: 'REVIEW NEXT',
      label: 'REVIEW NEXT',
      badgeStyle: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      key: 'AVOID FOR NOW',
      label: 'AVOID FOR NOW',
      badgeStyle: 'text-stone-600 bg-stone-100 border-stone-200',
    },
  ];

  const handleActionClick = (action: NextBestAction) => {
    if (!action.isApprovedByUser && action.actionCode !== 'ADD_FINANCIAL_CONTEXT') {
      if (onApproveAction) {
        onApproveAction(action);
        return;
      }
    }
    onExecuteAction(action);
  };

  return (
    <aside className="space-y-4">
      {/* Column Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">
          Next Best Actions
        </h3>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
          ✦ AI Grounded
        </span>
      </div>

      {/* Empty State when no actions or evidence */}
      {actions.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs text-center space-y-2.5">
          <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-stone-900">Waiting for context</h4>
          <p className="text-[11px] text-stone-500 leading-relaxed max-w-xs mx-auto">
            Ask FairAssist or add your first repayment notice.
          </p>
        </div>
      ) : (
        /* Action Categories */
        <div className="space-y-5">
          {categories.map(({ key, label, badgeStyle }) => {
            const categoryActions = actions.filter((a) => a.category === key);

            if (categoryActions.length === 0) return null;

            return (
              <div key={key} className="space-y-3">
                
                {/* Category Header */}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${badgeStyle}`}>
                    {label}
                  </span>
                  <div className="h-px bg-stone-200 flex-1" />
                </div>

                {/* Category Cards */}
                <div className="space-y-3">
                  {categoryActions.map((action) => {
                    const isApproved = Boolean(action.isApprovedByUser);
                    const isSent = action.currentSourceStatus === 'ACTION SENT';
                    const isContextAction = action.actionCode === 'ADD_FINANCIAL_CONTEXT';

                    return (
                      <div
                        key={action.id}
                        className={`flex flex-col bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${
                          isApproved ? 'border-emerald-200 ring-1 ring-emerald-400/20' : 'border-stone-200'
                        }`}
                      >
                        {/* Header Bar inside card */}
                        <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 flex justify-between items-center text-[10px] gap-2 flex-wrap">
                          <span className={`font-bold uppercase tracking-tighter ${
                            isSent
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded'
                              : isApproved
                              ? 'text-emerald-800 bg-emerald-50/80 border border-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1'
                              : 'text-stone-400'
                          }`}>
                            {isApproved && <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" />}
                            {isApproved ? 'Human approval confirmed' : action.currentSourceStatus}
                          </span>

                          {action.requiresHumanAuthorisation && !isSent && (
                            <span className="font-bold text-amber-800 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded">
                              {action.authorisingEntity 
                                ? `Requires ${action.authorisingEntity} confirmation`
                                : 'Requires lender confirmation'}
                            </span>
                          )}
                        </div>

                        {/* Card Body */}
                        <div className="p-4 space-y-2.5">
                          <h4 className="text-xs font-bold text-stone-900 leading-snug">
                            {action.title}
                          </h4>

                          <GeminiResponse content={action.reason} compact />

                          {/* Financial Impact */}
                          <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 text-xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                              Financial Impact
                            </span>
                            <GeminiResponse content={action.financialImpact} compact />
                          </div>

                          {/* Evidence & Sources info */}
                          <div className="space-y-1 text-[11px] text-stone-500 pt-1">
                            <div className="flex items-start gap-1">
                              <FileText className="w-3 h-3 text-stone-400 shrink-0 mt-0.5" />
                              <span className="truncate">
                                <strong className="text-stone-700">Evidence:</strong>{' '}
                                {action.evidenceUsed.join(', ')}
                              </span>
                            </div>
                            <div className="flex items-start gap-1">
                              <BookOpen className="w-3 h-3 text-stone-400 shrink-0 mt-0.5" />
                              <span className="truncate">
                                <strong className="text-stone-700">Rules:</strong>{' '}
                                {action.trustedSourcesUsed.join(', ')}
                              </span>
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                            <button
                              onClick={() => onOpenLineageModal(action)}
                              className="text-[11px] font-medium text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer hover:underline"
                            >
                              <HelpCircle className="w-3 h-3 text-stone-400" />
                              Why this action?
                            </button>

                            <button
                              onClick={() => handleActionClick(action)}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0 ${
                                isSent
                                  ? 'bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-800 border border-stone-300'
                                  : isApproved
                                  ? 'bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-900 border border-emerald-300'
                                  : isContextAction
                                  ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white'
                                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white'
                              }`}
                            >
                              {isApproved ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[2.5]" />
                                  <span>View in Action Plan</span>
                                </>
                              ) : isContextAction ? (
                                <>
                                  <span>{action.primaryActionButtonLabel.replace(/[→⇒]/g, '').replace(/->/g, '').trim()}</span>
                                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                                </>
                              ) : (
                                <>
                                  <span>Add to Action Plan</span>
                                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                                </>
                              )}
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};

