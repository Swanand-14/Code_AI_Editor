"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import UserButton from "../auth/components/user-button";
import { useState, useEffect } from "react";

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`
        fixed top-0 left-0 right-0 z-50
        transition-all duration-500 ease-in-out
        ${scrolled
          ? "bg-[#060910]/85 backdrop-blur-2xl border-b border-white/[0.05] shadow-[0_0_60px_rgba(0,0,0,0.5)]"
          : "bg-transparent"
        }
      `}
    >
      <div className="max-w-7xl mx-auto px-6 h-[68px] flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group select-none">
          <div
            className="
              relative w-9 h-9 rounded-xl overflow-hidden
              bg-gradient-to-br from-[#3b6ef8] to-[#6d3aff]
              flex items-center justify-center
              shadow-[0_0_20px_rgba(109,58,255,0.5)]
              group-hover:shadow-[0_0_30px_rgba(109,58,255,0.75)]
              transition-shadow duration-300
            "
          >
            {/* Anvil / forge icon */}
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M4 15h12v-2H4v2z" fill="white" opacity="0.9"/>
              <path d="M7 13V8c0-1.66 1.34-3 3-3s3 1.34 3 3v5H7z" fill="white"/>
              <path d="M2 15h16v2H2v-2z" fill="white" opacity="0.5"/>
            </svg>
          </div>
          <span className="font-black text-[18px] tracking-tight leading-none text-white">
            Code<span
              className="bg-gradient-to-r from-[#6d8fff] to-[#a78bff] bg-clip-text text-transparent"
              style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >Forge</span>
          </span>
        </Link>

        {/* Center Nav */}
        <nav className="hidden md:flex items-center gap-1 bg-white/[0.03] border border-white/[0.07] rounded-full px-2 py-1">
          {[
            { label: "Features", href: "/#features" },
            { label: "Docs", href: "/docs" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "API", href: "/api", badge: "New" },
          ].map(({ label, href, badge }) => (
            <Link
              key={label}
              href={href}
              className="
                relative flex items-center gap-1.5 px-4 py-1.5 rounded-full
                text-[13.5px] font-medium text-slate-400
                hover:text-white hover:bg-white/[0.08]
                transition-all duration-200
              "
            >
              {label}
              {badge && (
                <span className="text-[10px] font-bold bg-gradient-to-r from-[#3b6ef8] to-[#6d3aff] text-white px-1.5 py-0.5 rounded-full leading-none">
                  {badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Link
            href="https://github.com"
            target="_blank"
            className="
              hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-lg
              text-[13px] font-medium text-slate-400 hover:text-white
              border border-white/[0.08] hover:border-white/[0.16]
              bg-white/[0.03] hover:bg-white/[0.07]
              transition-all duration-200
            "
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            GitHub
          </Link>
          <div className="w-px h-4 bg-white/10" />
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </header>
  );
}