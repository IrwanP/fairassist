import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { ShieldCheck, Lock, Sparkles, CheckCircle2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const { user, loading, error, signInWithGoogle, clearError } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.warn("Sign in cancelled or failed:", err);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md animate-pulse">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-stone-800">Verifying FairAssist secure session…</h2>
            <p className="text-xs text-stone-500">Checking Firebase Authentication identity boundary</p>
          </div>
          <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-white border border-stone-200 rounded-3xl shadow-xl overflow-hidden">
          
          {/* Brand Header */}
          <div className="bg-gradient-to-b from-stone-900 to-stone-850 p-7 text-white relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black shadow-inner">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">FairAssist</h1>
                  <p className="text-[11px] text-stone-400 font-medium">Evidence-Grounded Financial Decision Support</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[11px] bg-stone-800/80 border border-stone-700 text-stone-300 px-2.5 py-1 rounded-full font-medium">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>Protected</span>
              </div>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Sign in to access your private financial analysis workspace, verified OJK regulations, and personalised action plans.
            </p>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-6">
            
            {/* Feature Checklist */}
            <div className="space-y-2.5 bg-stone-50 border border-stone-200/80 rounded-2xl p-4">
              <div className="flex items-start gap-2.5 text-xs text-stone-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Authoritative Identity:</strong> Firebase Authentication ensures full isolation of your financial evidence.</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-stone-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Grounded Decision Support:</strong> Powered by Google ADK and Gemini with live OJK regulatory retrieval.</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-stone-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Human-in-the-Loop Control:</strong> Action recommendations require explicit borrower confirmation.</span>
              </div>
            </div>

            {/* Error Banner if any */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Sign-in error</p>
                  <p className="mt-0.5 text-stone-600">{error}</p>
                </div>
                <button 
                  onClick={clearError} 
                  className="text-stone-400 hover:text-stone-600 text-xs font-semibold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Sign-in Button */}
            <div className="space-y-3">
              <button
                id="fairassist-google-signin-btn"
                type="button"
                onClick={handleSignIn}
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 bg-stone-900 hover:bg-stone-800 active:bg-stone-950 text-white font-medium text-sm py-3.5 px-5 rounded-2xl shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {signingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Signing in with Google…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                    <ArrowRight className="w-4 h-4 ml-auto text-stone-400" />
                  </>
                )}
              </button>

              <div className="p-3 bg-stone-50 border border-stone-200/70 rounded-xl text-[11px] text-stone-500 leading-relaxed">
                <div className="flex items-center gap-1.5 font-medium text-stone-700 mb-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Demo Persona Notice</span>
                </div>
                Demo personas (such as Ayu Putri) represent sample scenario data only. Your authenticated Google identity provides secure, isolated session boundaries.
              </div>
            </div>

          </div>

        </div>
      </div>
    );
  }

  return <>{children}</>;
};
