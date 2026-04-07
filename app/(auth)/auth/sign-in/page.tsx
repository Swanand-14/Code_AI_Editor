import SignInForm from "@/modules/auth/components/sign-in-form-client";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="relative min-h-screen bg-[#060910] flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,transparent_40%,#060910_100%)]" />
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-[#1a3aff]/[0.07] blur-[140px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] rounded-full bg-[#6d3aff]/[0.06] blur-[120px]" />
      </div>

      {/* Logo link back home */}
      <div className="relative z-10 mb-10">
        <Link href="/" className="flex items-center gap-3 group select-none">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3b6ef8] to-[#6d3aff] flex items-center justify-center shadow-[0_0_20px_rgba(109,58,255,0.45)] group-hover:shadow-[0_0_32px_rgba(109,58,255,0.65)] transition-shadow duration-300">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 15h12v-2H4v2z" fill="white" opacity="0.9"/>
              <path d="M7 13V8c0-1.66 1.34-3 3-3s3 1.34 3 3v5H7z" fill="white"/>
              <path d="M2 15h16v2H2v-2z" fill="white" opacity="0.4"/>
            </svg>
          </div>
          <span className="font-black text-[18px] tracking-tight text-white">
            Code<span
              className="bg-gradient-to-r from-[#6d8fff] to-[#a78bff] bg-clip-text text-transparent"
              style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >Forge</span>
          </span>
        </Link>
      </div>

      {/* Sign in card */}
      <div className="relative z-10 w-full flex justify-center">
        <SignInForm />
      </div>
    </div>
  );
}