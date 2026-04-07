"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const SignInForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);

  const handleSignIn = async (provider: "google" | "github") => {
    setLoadingProvider(provider);
    try {
      const result = await signIn(provider, {
        // Disable NextAuth's own redirect — we handle it ourselves
        // so the session cookie is set before we navigate
        
        callbackUrl,
      });

   

      // Hard push + refresh so Next.js re-fetches the session server-side
      // and middleware re-evaluates. Without router.refresh() the dashboard
      // would render with a stale (unauthenticated) server component tree.
     
    } catch (err) {
      console.error("Unexpected sign in error:", err);
      setLoadingProvider(null);
    }
  };

  return (
    <div className="relative w-full max-w-[400px]">
      {/* Outer glow halo */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#3b6ef8]/30 via-[#6d3aff]/20 to-transparent blur-sm pointer-events-none" />

      {/* Card */}
      <div className="relative rounded-2xl border border-white/[0.1] bg-[#0d1117] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        {/* Top shimmer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        {/* Inner ambient glow */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#3b6ef8]/[0.06] to-transparent pointer-events-none" />

        <div className="relative px-8 pt-10 pb-8">
          {/* Logo */}
          <div className="flex justify-center mb-7">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3b6ef8] to-[#6d3aff] flex items-center justify-center shadow-[0_0_24px_rgba(109,58,255,0.55)]">
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                <path d="M4 15h12v-2H4v2z" fill="white" opacity="0.9"/>
                <path d="M7 13V8c0-1.66 1.34-3 3-3s3 1.34 3 3v5H7z" fill="white"/>
                <path d="M2 15h16v2H2v-2z" fill="white" opacity="0.4"/>
              </svg>
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-[22px] font-black tracking-tight text-white mb-1.5">
              Welcome to Code
              <span
                className="bg-gradient-to-r from-[#6d8fff] to-[#a78bff] bg-clip-text text-transparent"
                style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >Forge</span>
            </h1>
            <p className="text-[13.5px] text-slate-500">Sign in to start forging</p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            {/* Google */}
            <button
              type="button"
              disabled={loadingProvider !== null}
              onClick={() => handleSignIn("google")}
              className="
                group relative w-full flex items-center justify-center gap-3
                px-5 py-3.5 rounded-xl font-semibold text-[14px]
                border border-white/[0.1] bg-white/[0.04]
                text-slate-300 hover:text-white
                hover:bg-white/[0.08] hover:border-white/[0.18]
                transition-all duration-200 active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
              "
            >
              {loadingProvider === "google" ? (
                <Spinner />
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {loadingProvider === "google" ? "Signing in…" : "Continue with Google"}
            </button>

            {/* GitHub */}
            <button
              type="button"
              disabled={loadingProvider !== null}
              onClick={() => handleSignIn("github")}
              className="
                group relative w-full flex items-center justify-center gap-3
                px-5 py-3.5 rounded-xl font-semibold text-[14px]
                border border-white/[0.1] bg-white/[0.04]
                text-slate-300 hover:text-white
                hover:bg-white/[0.08] hover:border-white/[0.18]
                transition-all duration-200 active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
              "
            >
              {loadingProvider === "github" ? (
                <Spinner />
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-slate-300 group-hover:text-white transition-colors">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
              )}
              {loadingProvider === "github" ? "Signing in…" : "Continue with GitHub"}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/[0.07]" />
            <span className="text-[11px] text-slate-600 font-medium tracking-widest uppercase">secure sign-in</span>
            <div className="flex-1 h-px bg-white/[0.07]" />
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-5">
            {[
              { icon: "🔒", text: "End-to-end encrypted" },
              { icon: "⚡", text: "Instant access" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
                <span className="text-xs">{icon}</span>
                {text}
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-[12px] text-center text-slate-600 mt-6 leading-relaxed">
            By continuing, you agree to our{" "}
            <a href="/terms" className="text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">Terms</a>{" "}
            and{" "}
            <a href="/privacy" className="text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

export default SignInForm;