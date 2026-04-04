"use client";

interface FeatureCardProps {
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: string;
  glow: string;
}

export function FeatureCard({ icon, label, desc, color, glow }: FeatureCardProps) {
  return (
    <div
      className="
        group relative p-7 rounded-2xl border border-white/[0.07]
        bg-white/[0.02] hover:bg-white/[0.04]
        transition-all duration-300 hover:scale-[1.01]
        overflow-hidden cursor-default
      "
      style={{ transition: "box-shadow 0.3s ease, transform 0.3s ease, background 0.3s ease, border-color 0.3s ease" }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = `0 8px 40px ${glow}`;
        el.style.borderColor = `${color}30`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "";
        el.style.borderColor = "rgba(255,255,255,0.07)";
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {icon}
      </div>
      <h3 className="text-[17px] font-bold text-white mb-2.5">{label}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}