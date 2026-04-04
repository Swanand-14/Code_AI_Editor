import { Header } from "@/modules/home/header";
import { Footer } from "@/modules/home/footer";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#060910] text-white overflow-x-hidden">
      {/* Deep space background — fixed so it never scrolls */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Vignette over grid */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,transparent_40%,#060910_100%)]" />

        {/* Ambient color blobs */}
        <div className="absolute top-[-15%] left-[5%] w-[700px] h-[600px] rounded-full bg-[#1a3aff]/[0.07] blur-[140px]" />
        <div className="absolute top-[20%] right-[-8%] w-[500px] h-[500px] rounded-full bg-[#6d3aff]/[0.06] blur-[120px]" />
        <div className="absolute bottom-[0%] left-[25%] w-[600px] h-[400px] rounded-full bg-[#1a3aff]/[0.05] blur-[100px]" />
      </div>

      <Header />

      <main className="relative z-10">
        {children}
      </main>

      <Footer />
    </div>
  );
}