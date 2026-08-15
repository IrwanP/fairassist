import React from 'react';
import { ChatMessage, FinancialContext, AgentActivity } from '../types';
import { FairAssistCopilot } from './FairAssistCopilot';
import { Sparkles, X, ChevronDown, MessageSquare } from 'lucide-react';

interface MobileFairAssistDrawerProps {
  context: FinancialContext;
  activity: AgentActivity;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onOpenUploadModal: (type: 'camera' | 'screenshot' | 'document') => void;
  onOpenFinancialContextModal?: () => void;
  messages: ChatMessage[];
  onSendMessage: (query: string) => void;
  isSending: boolean;
  onNavigateTab?: (tab: 'Overview' | 'Evidence' | 'Rules & Policies' | 'Action Simulator' | 'Action Plan') => void;
  onNavigateToNextBestActions?: () => void;
}

export const MobileFairAssistDrawer: React.FC<MobileFairAssistDrawerProps> = ({
  context,
  activity,
  isOpen,
  onClose,
  onOpen,
  onOpenUploadModal,
  onOpenFinancialContextModal,
  messages,
  onSendMessage,
  isSending,
  onNavigateTab,
  onNavigateToNextBestActions,
}) => {
  return (
    <>
      {/* Prominent Sticky Bottom Bar on Mobile/Tablet */}
      {!isOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden flex justify-center">
          <button
            onClick={onOpen}
            style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%)' }}
            className="w-full max-w-md py-3.5 px-5 text-white font-bold text-xs rounded-2xl shadow-xl hover:shadow-2xl transition-all cursor-pointer flex items-center justify-between border border-stone-700/80 active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 animate-icon-breath">
                <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              </div>
              <div className="text-left space-y-0.5">
                <span className="block text-xs font-bold text-white tracking-tight">✦ FairAssist</span>
                <span className="block text-[10px] text-stone-300 font-normal">Ask about your situation</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-900/80 text-cyan-300 border border-indigo-700/80">
                {messages.length} msg{messages.length === 1 ? '' : 's'}
              </span>
              <MessageSquare className="w-4 h-4 text-indigo-300" />
            </div>
          </button>
        </div>
      )}

      {/* Slide-Up Bottom Sheet / Full Workspace Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          
          {/* Backdrop Click to Close */}
          <div className="flex-1 w-full" onClick={onClose} />

          {/* Drawer Sheet Container */}
          <div className="w-full h-[92vh] max-h-[850px] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden relative border-t border-stone-200 animate-in slide-in-from-bottom duration-300">
            
            {/* Sheet Handle */}
            <div className="w-full py-2 bg-stone-900 flex items-center justify-between px-4 border-b border-stone-800 shrink-0">
              <div className="w-12 h-1 bg-stone-700 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
              <div className="flex items-center gap-2 text-xs font-bold text-white pt-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>FairAssist Conversational Workspace</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer mt-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inner Copilot Panel Component */}
            <div className="flex-1 min-h-0">
              <FairAssistCopilot
                context={context}
                activity={activity}
                isCollapsed={false}
                onToggleCollapse={onClose}
                onOpenUploadModal={onOpenUploadModal}
                onOpenFinancialContextModal={onOpenFinancialContextModal}
                messages={messages}
                onSendMessage={onSendMessage}
                isSending={isSending}
                onNavigateTab={(tab) => {
                  if (onNavigateTab) onNavigateTab(tab);
                  onClose();
                }}
                onNavigateToNextBestActions={() => {
                  if (onNavigateToNextBestActions) onNavigateToNextBestActions();
                  onClose();
                }}
              />
            </div>

          </div>
        </div>
      )}
    </>
  );
};
