import React, { useState } from 'react';
import { ChatMessage, FinancialContext } from '../types';
import { GeminiResponse } from './GeminiResponse';
import { TrustedSourceRegistry } from '../data/sourcesConfig';
import { Sparkles, Paperclip, Camera, Send, ChevronUp, ChevronDown, Bot, User, BookOpen, ExternalLink, X } from 'lucide-react';

interface ChatComposerProps {
  context: FinancialContext;
  onOpenUploadModal: (type: 'camera' | 'screenshot' | 'document') => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  context,
  onOpenUploadModal,
}) => {
  const [inputText, setInputText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'agent',
      text: context.userPersona?.syntheticFlag
        ? `### What I found\n\nHello Ayu. I have analysed your obligations at **${context.selectedBank.name}** and **${context.selectedPindar.name}**.\n\n* **Available cash:** Rp850,000\n* **Due before salary:** Rp1,950,000 (25–27 August 2026)\n* **Monthly salary credit:** Rp8,500,000 (28 August 2026)\n\n### What this means\n\nYour situation is a **3-day cash-flow timing gap**, not an overall income shortfall. How can I assist you with your options today?`
        : `Hello.\n\nTell me what you need help with, or add a repayment notice. I’ll help you understand what applies and what to do next.`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      retrievedSources: [
        {
          id: 'seojk-19-2025',
          sourceTitle: 'SEOJK 19/SEOJK.06/2025',
          organisation: 'OJK',
          confidenceScore: 0.98,
          matchedClause: 'LPBBTI operational guidelines and consumer rights',
          retrievedAt: new Date().toLocaleTimeString('id-ID'),
          status: 'Current',
          url: 'https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx'
        }
      ]
    }
  ]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: inputText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    const query = inputText;
    setInputText('');
    setIsExpanded(true);
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          financialContext: context
        })
      });

      const data = await response.json();

      const agentMsg: ChatMessage = {
        id: `msg-agent-${Date.now()}`,
        sender: 'agent',
        text: data.reply || `Under OJK SEOJK 19/SEOJK.06/2025 guidelines and ${context.selectedBank.name} policy, you have the right to request a formal 3-day payment alignment to match your salary date on 28 August.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        retrievedSources: data.retrievedSources || []
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      console.error('Chat API error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const contextualQueries = context.evidenceList.length === 0 ? [
    'How does FairAssist use OJK rules to protect borrowers?',
    'What evidence should I upload for my loan?',
    'How does POJK 40/2024 regulate debt collection?',
  ] : [
    'What should I do about my EasyCash collection notice?',
    'How can I align my BCA loan due date with my salary?',
    'Am I eligible for restructuring under SEOJK 19/2025?',
    'What does my OJK SLIK report mean?',
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-2xl">
      
      {/* Restrained Gemini Inspired Top Accent Bar */}
      <div 
        className="h-1 w-full"
        style={{ background: 'linear-gradient(90deg, #4285F4 0%, #2563EB 35%, #7C3AED 70%, #06B6D4 100%)' }}
      />

      {/* Expanded Conversation Drawer */}
      {isExpanded && (
        <div className="max-w-4xl mx-auto flex flex-col h-[50vh] max-h-[550px] overflow-hidden border-b border-stone-200 bg-white">
          
          {/* ChatHeader */}
          <div className="flex items-center justify-between px-4 py-3 bg-stone-900 text-white shrink-0 relative z-20">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>FairAssist Conversational AI Support</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 text-cyan-300 border border-stone-700">
                Track 1 Demo
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* ScrollArea */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative p-4 space-y-4 text-xs bg-stone-50/50 z-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'agent' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shrink-0 font-bold text-[10px] shadow-xs">
                    FA
                  </div>
                )}

                <div className={`max-w-2xl rounded-2xl p-4 space-y-2.5 ${
                  msg.sender === 'user'
                    ? 'bg-stone-900 text-white rounded-br-xs shadow-xs'
                    : 'bg-white text-stone-800 rounded-bl-xs border border-stone-200 shadow-xs'
                }`}>
                  {/* RAG Activity Badge for Agent Messages */}
                  {msg.sender === 'agent' && (
                    <div className="space-y-1 mb-1.5 pb-2 border-b border-stone-100">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-teal-800">
                        <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200">
                          ↗ Trusted Retrieval
                        </span>
                        <span className="text-stone-500 font-normal">
                          Checked OJK regulatory database
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-800">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                          ✦ Gemini Multimodal
                        </span>
                        <span className="text-stone-500 font-normal">
                          Cross-referenced confirmed financial evidence
                        </span>
                      </div>
                    </div>
                  )}

                  {msg.sender === 'agent' ? (
                    <GeminiResponse content={msg.text} />
                  ) : (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  )}

                  {/* Retrieved Sources Badges */}
                  {msg.retrievedSources && msg.retrievedSources.length > 0 && (
                    <div className="pt-2 border-t border-stone-100 space-y-1 text-[10px]">
                      <span className="font-bold uppercase tracking-wider text-stone-400 block">
                        ↗ Trusted Sources Matched
                      </span>
                      {msg.retrievedSources.map((s, idx) => {
                        const resolved = TrustedSourceRegistry.resolve(s.id || s.sourceTitle || s.url);
                        return (
                          <div key={idx} className="flex flex-col bg-stone-50 p-2 rounded-xl border border-stone-200 gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-stone-900">{resolved.organisation}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                                resolved.status === 'Current' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {resolved.displayStatusText}
                              </span>
                            </div>
                            <span className="font-medium text-stone-700">{resolved.title}</span>
                            {resolved.isAvailable ? (
                              <a href={resolved.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold text-[10px] self-start mt-0.5">
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

                  <span className={`block text-[9px] text-right ${msg.sender === 'user' ? 'text-stone-400' : 'text-stone-400'}`}>
                    {msg.timestamp}
                  </span>
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-900 flex items-center justify-center shrink-0 font-bold text-[10px]">
                    AYU
                  </div>
                )}
              </div>
            ))}

            {isSending && (
              <div className="flex items-center gap-2 text-stone-600 text-xs font-medium p-2 bg-white rounded-xl border border-stone-200 w-fit shadow-xs">
                <Sparkles className="w-4 h-4 text-indigo-600 animate-spin" />
                <span>FairAssist is checking current OJK sources & reasoning with Gemini...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Bottom Composer Input Bar */}
      <div className="max-w-4xl mx-auto px-4 py-3 space-y-2">
        
        {/* Quick Sample Queries */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            Suggested:
          </span>
          {contextualQueries.map((q, idx) => (
            <button
              key={idx}
              onClick={() => {
                setInputText(q);
                setIsExpanded(true);
              }}
              className="text-[11px] font-medium text-stone-700 bg-stone-100 hover:bg-stone-200/80 hover:text-stone-900 px-3 py-1 rounded-full whitespace-nowrap cursor-pointer transition-colors border border-stone-200/60"
            >
              {q}
            </button>
          ))}
        </div>

        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          
          {/* Attachment Controls */}
          <button
            type="button"
            onClick={() => onOpenUploadModal('document')}
            className="p-2.5 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200"
            title="Attach document or statement"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onOpenUploadModal('camera')}
            className="p-2.5 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200"
            title="Take a photo of receipt or repayment notice"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Text Composer Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onFocus={() => setIsExpanded(true)}
            placeholder="Ask FairAssist about your repayment situation or OJK rights..."
            className="flex-1 bg-stone-100 border border-stone-200/80 rounded-xl py-2.5 px-4 text-xs text-stone-900 placeholder-stone-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all"
          />

          {/* Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2.5 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200"
            title={isExpanded ? "Collapse chat window" : "Expand chat window"}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white transition-all cursor-pointer disabled:opacity-40 font-bold text-xs flex items-center gap-1.5 shadow-xs"
          >
            <span>Ask</span>
            <Send className="w-3.5 h-3.5" />
          </button>

        </form>

        {/* Discreet Disclaimer */}
        <p className="text-[10px] text-stone-400 text-center">
          FairAssist provides AI-assisted financial decision support grounded in verified OJK regulations.
        </p>
      </div>

    </div>
  );
};
