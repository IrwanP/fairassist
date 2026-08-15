import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface HeaderProps {
  activeTab: 'Overview' | 'Evidence' | 'Rules & Policies' | 'Action Simulator' | 'Action Plan';
  setActiveTab: (tab: 'Overview' | 'Evidence' | 'Rules & Policies' | 'Action Simulator' | 'Action Plan') => void;
  onOpenFreshnessModal: () => void;
  sourceStatus?: 'ready' | 'checking' | 'current' | 'incomplete' | 'newer';
  isDemoScenario?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenFreshnessModal,
  sourceStatus = 'ready',
  isDemoScenario = false,
}) => {
  const tabs = [
    'Overview',
    'Evidence',
    'Rules & Policies',
    'Action Simulator',
    'Action Plan',
  ] as const;

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Navigation */}
          <div className="flex items-center gap-6 lg:gap-8">
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold tracking-tight text-[#1A1A1A]">
                FairAssist
              </span>
              <span className="text-[10px] font-semibold bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full border border-stone-200 hidden sm:inline-block">
                AI Decision Support
              </span>
            </div>

            {/* Navigation tabs in header row */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-6 text-sm font-medium text-stone-500">
              {tabs.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-1 transition-all cursor-pointer font-medium ${
                      isActive
                        ? 'text-[#1A1A1A] border-b-2 border-stone-800 font-semibold'
                        : 'hover:text-stone-800'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Controls: Source Status Badge, Persona Control */}
          <div className="flex items-center gap-3">
            
            {/* Global Source Status Indicator */}
            <button
              onClick={onOpenFreshnessModal}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                sourceStatus === 'checking'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100'
                  : sourceStatus === 'current'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80'
                  : sourceStatus === 'incomplete'
                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                  : sourceStatus === 'newer'
                  ? 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100'
                  : 'bg-teal-50/80 border-teal-200 text-teal-800 hover:bg-teal-100'
              }`}
              title="View regulatory and policy document status"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  sourceStatus === 'checking'
                    ? 'bg-indigo-500 animate-pulse'
                    : sourceStatus === 'current'
                    ? 'bg-emerald-500'
                    : sourceStatus === 'incomplete'
                    ? 'bg-amber-500'
                    : sourceStatus === 'newer'
                    ? 'bg-blue-500'
                    : 'bg-teal-500'
                }`}
              />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {sourceStatus === 'checking' && 'Checking Sources…'}
                {sourceStatus === 'current' && 'Sources Current'}
                {sourceStatus === 'incomplete' && 'Source Verification Incomplete'}
                {sourceStatus === 'newer' && 'Newer Source Detected'}
                {sourceStatus === 'ready' && 'Trusted Sources Ready'}
              </span>
            </button>

            {/* User Avatar */}
            <div 
              className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 border border-stone-300 shrink-0 cursor-default"
              title={isDemoScenario ? "Ayu Putri (Demo)" : "Borrower Profile"}
            >
              {isDemoScenario ? "AP" : "FA"}
            </div>

          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="md:hidden flex items-center space-x-2 border-t border-stone-100 overflow-x-auto py-2 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-stone-900 text-white font-semibold'
                    : 'text-stone-600 hover:text-stone-900 bg-stone-50'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};

