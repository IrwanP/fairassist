import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, LogOut, User as UserIcon, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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
  const { user, signOut } = useAuth();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tabs = [
    'Overview',
    'Evidence',
    'Rules & Policies',
    'Action Simulator',
    'Action Plan',
  ] as const;

  const getUserInitials = (): string => {
    if (user?.displayName) {
      const parts = user.displayName.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'FA';
  };

  const userDisplayName = user?.displayName || user?.email?.split('@')[0] || 'Authenticated User';

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

          {/* Right Controls: Source Status Badge, User Profile & Sign Out */}
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

            {/* Authenticated User Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                id="fairassist-user-profile-menu"
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-stone-100 transition-colors border border-transparent hover:border-stone-200 cursor-pointer"
                title={`Signed in as ${userDisplayName} (${user?.email || 'Google Account'})`}
              >
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={userDisplayName}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full border border-stone-300 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center text-xs font-bold text-white border border-stone-700 shadow-xs">
                    {getUserInitials()}
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-stone-500 hidden sm:block" />
              </button>

              {/* Profile Dropdown Menu */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-stone-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-4 py-3 border-b border-stone-100">
                    <div className="flex items-center gap-2 text-xs font-semibold text-stone-900 truncate">
                      <UserIcon className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                      <span className="truncate">{userDisplayName}</span>
                    </div>
                    {user?.email && (
                      <p className="text-[11px] text-stone-500 truncate mt-0.5">{user.email}</p>
                    )}
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      Firebase Authenticated
                    </div>
                  </div>

                  <div className="px-2 py-1.5">
                    <button
                      id="fairassist-signout-btn"
                      type="button"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        signOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-rose-600" />
                      <span>Sign out of FairAssist</span>
                    </button>
                  </div>
                </div>
              )}
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


