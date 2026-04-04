import Link from "next/link";
import { Github, Twitter, Linkedin, Mail } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/[0.06] bg-[#060910]">
      {/* Subtle top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-14">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-3 mb-5 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3b6ef8] to-[#6d3aff] flex items-center justify-center shadow-[0_0_16px_rgba(109,58,255,0.4)] group-hover:shadow-[0_0_24px_rgba(109,58,255,0.6)] transition-shadow duration-300">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M4 15h12v-2H4v2z" fill="white" opacity="0.9"/>
                  <path d="M7 13V8c0-1.66 1.34-3 3-3s3 1.34 3 3v5H7z" fill="white"/>
                  <path d="M2 15h16v2H2v-2z" fill="white" opacity="0.5"/>
                </svg>
              </div>
              <span className="font-black text-[17px] tracking-tight text-white">
                Code<span
                  className="bg-gradient-to-r from-[#6d8fff] to-[#a78bff] bg-clip-text text-transparent"
                  style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >Forge</span>
              </span>
            </Link>
            <p className="text-sm text-slate-500 leading-relaxed max-w-[240px] mb-6">
              A full-stack browser IDE for developers who move fast. Build, collaborate, deploy.
            </p>
            <div className="flex items-center gap-2">
              {[
                { href: "https://github.com", icon: Github, label: "GitHub" },
                { href: "https://twitter.com", icon: Twitter, label: "Twitter" },
                { href: "https://linkedin.com", icon: Linkedin, label: "LinkedIn" },
                { href: "mailto:contact@codeforge.dev", icon: Mail, label: "Email" },
              ].map(({ href, icon: Icon, label }) => (
                <Link
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  aria-label={label}
                  className="w-8 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-slate-500 hover:text-white hover:border-white/[0.18] hover:bg-white/[0.08] transition-all duration-200"
                >
                  <Icon className="w-3.5 h-3.5" />
                </Link>
              ))}
            </div>
          </div>

          {/* Product */}
          <FooterColumn title="Product" links={[
            { label: "Features", href: "/features" },
            { label: "Documentation", href: "/docs" },
            { label: "Pricing", href: "/pricing" },
            { label: "API", href: "https://codesnippetui.pro/templates", external: true },
          ]} />

          {/* Resources */}
          <FooterColumn title="Resources" links={[
            { label: "Blog", href: "/blog" },
            { label: "Tutorials", href: "/tutorials" },
            { label: "Community", href: "/community" },
            { label: "Changelog", href: "/changelog" },
          ]} />

          {/* Company */}
          <FooterColumn title="Company" links={[
            { label: "About", href: "/about" },
            { label: "Careers", href: "/careers" },
            { label: "Contact", href: "/contact" },
            { label: "Support", href: "/support" },
          ]} />
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-600">
            © {currentYear} CodeForge. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            {[
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Terms of Service", href: "/terms" },
              { label: "Cookie Policy", href: "/cookies" },
            ].map(({ label, href }) => (
              <Link key={label} href={href} className="text-xs text-slate-600 hover:text-slate-400 transition-colors duration-200">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-4">
        {title}
      </h3>
      <ul className="space-y-3">
        {links.map(({ label, href, external }) => (
          <li key={label}>
            <Link
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="text-[13.5px] text-slate-500 hover:text-slate-200 transition-colors duration-200"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}