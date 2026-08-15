import React from 'react';
import { AgentActivity, PipelineStage } from '../types';
import { Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface PipelineStepperProps {
  activity: AgentActivity;
  compact?: boolean;
  onRetry?: () => void;
}

export const PipelineStepper: React.FC<PipelineStepperProps> = ({ activity, compact = false, onRetry }) => {
  const stages: { key: PipelineStage; label: string }[] = [
    { key: 'UNDERSTAND', label: 'UNDERSTAND' },
    { key: 'RETRIEVE', label: 'RETRIEVE' },
    { key: 'VERIFY', label: 'VERIFY' },
    { key: 'REASON', label: 'REASON' },
    { key: 'ACT', label: 'ACT' },
  ];

  const getStageState = (stageKey: PipelineStage) => {
    return activity.stages.find((s) => s.stage === stageKey) || {
      stage: stageKey,
      status: 'pending' as const,
    };
  };

  const hasFailedStage = activity.stages.some((s) => s.status === 'failed');

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-2 shadow-xs">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest shrink-0">
          AI Intelligence Pipeline
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium text-stone-600 truncate">
            {activity.activeStepDescription}
          </span>
          {hasFailedStage && onRetry && (
            <button
              onClick={onRetry}
              className="px-2 py-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Retry
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 relative">
        {stages.map(({ key, label }) => {
          const state = getStageState(key);
          const isCompleted = state.status === 'completed';
          const isActive = state.status === 'active';
          const isFailed = state.status === 'failed';

          return (
            <div
              key={key}
              className={`relative flex flex-col items-center p-1 rounded-md text-center transition-all ${
                isActive
                  ? 'bg-indigo-50/90 border border-indigo-300 ring-2 ring-indigo-500/10 text-indigo-950'
                  : isCompleted
                  ? 'bg-emerald-50/60 border border-emerald-200 text-emerald-900'
                  : isFailed
                  ? 'bg-rose-50 border border-rose-300 text-rose-900'
                  : 'bg-stone-50 border border-stone-200 text-stone-400'
              }`}
            >
              <div className="flex items-center justify-center w-4 h-4 mb-1">
                {isCompleted && (
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
                {isActive && (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                )}
                {isFailed && (
                  <div className="w-3.5 h-3.5 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-[10px]">
                    !
                  </div>
                )}
                {!isCompleted && !isActive && !isFailed && (
                  <div className="w-2.5 h-2.5 rounded-full border border-stone-300 bg-white" />
                )}
              </div>

              <span
                className={`text-[9px] font-bold tracking-tight uppercase ${
                  isActive
                    ? 'text-indigo-950 font-extrabold'
                    : isCompleted
                    ? 'text-emerald-800 font-semibold'
                    : isFailed
                    ? 'text-rose-900 font-extrabold'
                    : 'text-stone-400'
                }`}
              >
                {label}
              </span>

              {!compact && state.message && (
                <span className="text-[9px] text-stone-500 line-clamp-1 mt-0.5">
                  {state.message}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

