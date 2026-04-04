import Link from "next/link";
import { FeatureCard } from "./FeatureCard";

// ── Data ────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
    label: "Real-time Collaboration",
    desc: "See every keystroke live. Pair-program with your team as if you're sitting side by side, from anywhere on Earth.",
    color: "#3b6ef8",
    glow: "rgba(59,110,248,0.2)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    ),
    label: "GitHub Integration",
    desc: "Clone any repo, create branches, commit and push — full Git workflow without ever leaving your browser.",
    color: "#a78bff",
    glow: "rgba(167,139,255,0.2)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        <path d="M7 8l-2 2 2 2M17 8l2 2-2 2M12 7l-1.5 6"/>
      </svg>
    ),
    label: "In-Browser Runtime",
    desc: "Powered by WebContainers. Run Node.js, React, Next.js, and full-stack apps with zero local setup needed.",
    color: "#22d3ee",
    glow: "rgba(34,211,238,0.2)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6z"/><path d="M6 21a3 3 0 100-6 3 3 0 000 6z"/>
        <path d="M15 6H9a3 3 0 000 6h6a3 3 0 010 6H6"/>
      </svg>
    ),
    label: "Branch Workspaces",
    desc: "Every branch is its own isolated environment. Switch context instantly, keep experiments separate.",
    color: "#34d399",
    glow: "rgba(52,211,153,0.2)",
  },
];

const techBadges = ["React", "Next.js", "Node.js", "Express", "Vue", "Hono", "Angular", "TypeScript"];

const stats = [
  { value: "10k+", label: "Developers" },
  { value: "50k+", label: "Projects" },
  { value: "< 3s", label: "Boot time" },
  { value: "99.9%", label: "Uptime" },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-44 pb-32 overflow-hidden">
        {/* Spotlight radial behind hero text */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[radial-gradient(ellipse_at_top,rgba(59,110,248,0.14)_0%,transparent_65%)] pointer-events-none" />

        {/* Pill badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[#3b6ef8]/30 bg-[#3b6ef8]/[0.08] text-[13px] font-medium text-[#7faeff] mb-10 select-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b6ef8] opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3b6ef8]" />
          </span>
          Now in public beta — free to start
        </div>

        {/* Headline */}
        <h1 className="text-[72px] md:text-[96px] lg:text-[112px] font-black leading-[0.92] tracking-tighter text-white mb-7 max-w-5xl">
          <span className="block">Code</span>
          <span
            className="block bg-gradient-to-r from-[#4d8fff] via-[#7b5fff] to-[#b06fff] bg-clip-text text-transparent"
            style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            Forge
          </span>
        </h1>

        {/* Sub */}
        <p className="text-xl md:text-2xl text-slate-400 max-w-[540px] leading-relaxed mb-12">
          Forge code together in real-time.{" "}
          <span className="text-slate-300">A full-stack IDE that lives entirely in your browser.</span>
        </p>

        {/* CTA row */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/dashboard"
            className="
              group relative inline-flex items-center gap-2.5 px-8 py-4
              rounded-xl font-bold text-[15px] text-white overflow-hidden
              transition-all duration-300 hover:scale-[1.04]
              shadow-[0_0_32px_rgba(59,110,248,0.45)]
              hover:shadow-[0_0_48px_rgba(109,58,255,0.65)]
            "
          >
            <span className="absolute inset-0 bg-gradient-to-r from-[#3b6ef8] to-[#6d3aff]" />
            <span className="absolute inset-0 bg-gradient-to-r from-[#4d7fff] to-[#7d4aff] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative flex items-center gap-2.5">
              Start Coding — it&apos;s free
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </Link>

          <Link
            href="https://github.com"
            target="_blank"
            className="
              inline-flex items-center gap-2.5 px-7 py-4 rounded-xl
              font-semibold text-[15px] text-slate-300 hover:text-white
              border border-white/[0.1] hover:border-white/[0.2]
              bg-white/[0.04] hover:bg-white/[0.09]
              transition-all duration-300 hover:scale-[1.04]
            "
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            View on GitHub
          </Link>
        </div>

        {/* Tech badge strip */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-14">
          {techBadges.map((t) => (
            <span
              key={t}
              className="px-3 py-1.5 rounded-lg text-[12px] font-mono font-semibold text-slate-500 border border-white/[0.07] bg-white/[0.03] hover:text-slate-300 hover:border-white/[0.14] transition-all duration-200 cursor-default"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────── */}
      <section className="py-16 border-y border-white/[0.05]">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-4xl font-black text-white tracking-tight mb-1">{value}</div>
              <div className="text-sm text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── EDITOR MOCKUP ─────────────────────────────────────── */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          {/* Section label */}
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-[#4d8fff] mb-4">Live in your browser</p>
          <h2 className="text-center text-4xl md:text-5xl font-black text-white tracking-tight mb-16">
            Zero setup. Just ship.
          </h2>

          {/* Fake editor window */}
          <div className="
            relative rounded-2xl border border-white/[0.08] overflow-hidden
            bg-[#0d1117]
            shadow-[0_32px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]
          ">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06] bg-[#0a0e16]">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              <div className="ml-4 flex items-center gap-1 text-[12px] text-slate-600 font-mono">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                app / src / components /
                <span className="text-slate-400">Hero.tsx</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11px] text-green-500/70 font-medium">Live</span>
              </div>
            </div>

            {/* Code body */}
            <div className="grid grid-cols-[40px_1fr] font-mono text-[13px] leading-7">
              {/* Line numbers */}
              <div className="py-5 text-right pr-4 text-slate-700 border-r border-white/[0.04] select-none">
                {Array.from({ length: 18 }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              {/* Code */}
              <div className="py-5 pl-5 overflow-x-auto">
                <pre className="text-slate-300 whitespace-pre">{`<span style="color:#7b5fff">import</span> <span style="color:#e2e8f0">React</span> <span style="color:#7b5fff">from</span> <span style="color:#86efac">'react'</span>
<span style="color:#7b5fff">import</span> <span style="color:#e2e8f0">{ useCollabSession }</span> <span style="color:#7b5fff">from</span> <span style="color:#86efac">'@codeforge/collab'</span>

<span style="color:#7b5fff">export function</span> <span style="color:#60a5fa">Hero</span><span style="color:#e2e8f0">() {</span>
  <span style="color:#7b5fff">const</span> <span style="color:#e2e8f0">{ session, peers }</span> <span style="color:#7b5fff">=</span> <span style="color:#60a5fa">useCollabSession</span><span style="color:#e2e8f0">()</span>

  <span style="color:#7b5fff">return</span> <span style="color:#e2e8f0">(</span>
    <span style="color:#f472b6">&lt;section</span> <span style="color:#86efac">className</span><span style="color:#e2e8f0">=</span><span style="color:#86efac">"hero"</span><span style="color:#f472b6">&gt;</span>
      <span style="color:#f472b6">&lt;h1&gt;</span><span style="color:#e2e8f0">Forge code together</span><span style="color:#f472b6">&lt;/h1&gt;</span>
      <span style="color:#f472b6">&lt;p&gt;</span>
        <span style="color:#e2e8f0">{peers.length} developers online now</span>
      <span style="color:#f472b6">&lt;/p&gt;</span>
      <span style="color:#f472b6">&lt;CollabCursors</span> <span style="color:#86efac">session</span><span style="color:#e2e8f0">={session}</span> <span style="color:#f472b6">/&gt;</span>
    <span style="color:#f472b6">&lt;/section&gt;</span>
  <span style="color:#e2e8f0">)</span>
<span style="color:#e2e8f0">}</span>
`}</pre>
              </div>
            </div>

            {/* Bottom status bar */}
            <div className="flex items-center justify-between px-5 py-2 bg-[#0a0e16] border-t border-white/[0.05] text-[11px] text-slate-600 font-mono">
              <div className="flex items-center gap-4">
                <span className="text-green-500">✓ TypeScript</span>
                <span>Ln 12, Col 34</span>
              </div>
              <div className="flex items-center gap-4">
                <span>UTF-8</span>
                <span>TSX</span>
                <div className="flex items-center gap-1 text-[#4d8fff]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4d8fff]" />
                  2 peers editing
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.15em] text-[#4d8fff] mb-4">Why CodeForge</p>
          <h2 className="text-center text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Everything in one place
          </h2>
          <p className="text-center text-slate-500 text-lg max-w-lg mx-auto mb-16">
            Stop switching tools. CodeForge is your editor, terminal, Git client, and collab studio.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f) => (
              <FeatureCard
                key={f.label}
                icon={f.icon}
                label={f.label}
                desc={f.desc}
                color={f.color}
                glow={f.glow}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section className="py-28 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="relative inline-block w-full">
            {/* Glow halo */}
            <div className="absolute inset-[-2px] rounded-3xl bg-gradient-to-r from-[#3b6ef8] to-[#6d3aff] opacity-20 blur-xl" />
            <div className="relative p-12 rounded-3xl border border-white/[0.1] bg-gradient-to-b from-white/[0.05] to-transparent overflow-hidden">
              {/* Inner shine */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight leading-[1.1]">
                Start building with{" "}
                <span
                  className="bg-gradient-to-r from-[#4d8fff] to-[#a78bff] bg-clip-text text-transparent"
                  style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  CodeForge
                </span>
              </h2>
              <p className="text-slate-400 text-lg mb-9">No install. No config. Open browser, start coding.</p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/dashboard"
                  className="
                    group relative inline-flex items-center gap-2.5 px-8 py-4
                    rounded-xl font-bold text-[15px] text-white overflow-hidden
                    shadow-[0_0_32px_rgba(59,110,248,0.5)]
                    hover:shadow-[0_0_48px_rgba(109,58,255,0.7)]
                    transition-all duration-300 hover:scale-[1.04]
                  "
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-[#3b6ef8] to-[#6d3aff]" />
                  <span className="absolute inset-0 bg-gradient-to-r from-[#4d7fff] to-[#7d4aff] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative flex items-center gap-2.5">
                    Open Dashboard
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </span>
                </Link>

                <Link
                  href="/#features"
                  className="
                    inline-flex items-center gap-2 px-7 py-4 rounded-xl
                    font-semibold text-[15px] text-slate-400 hover:text-white
                    border border-white/[0.09] hover:border-white/[0.18]
                    bg-white/[0.03] hover:bg-white/[0.08]
                    transition-all duration-300 hover:scale-[1.04]
                  "
                >
                  See all features
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}