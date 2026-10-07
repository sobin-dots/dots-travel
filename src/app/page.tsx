'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Mic,
  FileText,
  Sparkles,
  Building2,
  Compass,
  ArrowRight,
  ShieldCheck,
  Lock,
  ExternalLink,
  CheckCircle2,
  Users,
  Send,
  Download,
  Activity,
  Layers,
  ChevronRight,
  UserPlus,
  LogIn,
  Mail,
  Zap,
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentOrg, setCurrentOrg] = useState<any>(null);
  const [hasAuthToken, setHasAuthToken] = useState(false);

  // Quick Inline Sign-In state on landing page
  const [quickEmail, setQuickEmail] = useState('admin@example.com');
  const [quickPassword, setQuickPassword] = useState('AdminSecurePassword2026!');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('plivo_access_token');
      const userStr = localStorage.getItem('plivo_user');
      const orgStr = localStorage.getItem('plivo_org');
      if (token) {
        setHasAuthToken(true);
        try { if (userStr) setCurrentUser(JSON.parse(userStr)); } catch {}
        try { if (orgStr) setCurrentOrg(JSON.parse(orgStr)); } catch {}
      }
    }
  }, []);

  const handleQuickSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/v1/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: quickEmail, password: quickPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('plivo_access_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('plivo_refresh_token', data.refreshToken);
      }
      localStorage.setItem('plivo_user', JSON.stringify(data.user));
      localStorage.setItem('plivo_org', JSON.stringify(data.organization));

      router.push('/console');
    } catch (err: any) {
      setAuthError(err.message || 'Invalid credentials');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-indigo-600/20 via-violet-600/10 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[800px] right-0 w-[500px] h-[500px] bg-emerald-600/10 blur-3xl pointer-events-none -z-10" />

      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-40 px-6 lg:px-12 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition">
              P
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">Plivo Platform</span>
              <span className="text-[10px] text-zinc-400 block -mt-0.5">Enterprise Operations & AI Concierge</span>
            </div>
          </Link>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs text-zinc-400">
          <a href="#features" className="hover:text-zinc-200 transition">Telephony & AI</a>
          <a href="#workflow" className="hover:text-zinc-200 transition">Workflow</a>
          <a href="#security" className="hover:text-zinc-200 transition">Compliance</a>
          <Link href="/docs" className="hover:text-indigo-400 flex items-center gap-1 transition">
            <span>API Docs</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </nav>

        {/* Right Auth Buttons */}
        <div className="flex items-center gap-3">
          {hasAuthToken ? (
            <Link
              href="/console"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition"
            >
              <span>Console ({currentUser?.name?.split(' ')[0] || 'Active'})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login?mode=signin"
                className="text-xs text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition font-medium flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5 text-zinc-400" />
                <span>Log In</span>
              </Link>
              <Link
                href="/login?mode=signup"
                className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Sign Up Free</span>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="px-6 lg:px-12 pt-16 pb-20 max-w-6xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 rounded-full text-xs text-indigo-300 font-medium shadow-sm animate-pulse">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Voice Telephony + DeepSeek AI Concierge + Resend PDF Pipeline</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight md:leading-tight">
            Run Your Entire Phone Operation &{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-amber-300 bg-clip-text text-transparent">
              AI Travel Concierge
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm md:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Carrier-grade voice calls, speech-to-text recording analysis, instant DeepSeek itinerary generation, supplier RFQ quotation dispatch, and encrypted compliance vault.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/login?mode=signup"
              className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-xl shadow-indigo-600/25 flex items-center gap-2 transition group"
            >
              <span>Get Started Free (Sign Up)</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </Link>

            <Link
              href="/login?mode=signin"
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition"
            >
              <LogIn className="w-4 h-4 text-emerald-400" />
              <span>Sign In to Existing Account</span>
            </Link>

            <Link
              href="/docs"
              className="bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-1.5 transition"
            >
              <span>Interactive OpenAPI Specs</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Fast-Track Sign In / Sign Up Card */}
          <div className="max-w-xl mx-auto mt-12 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 text-left shadow-2xl backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <span className="text-xs font-bold text-white block">Instant Access Portal</span>
                <span className="text-[11px] text-zinc-400">Sign in directly or register a new workspace</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/login?mode=signin"
                  className="text-[11px] text-indigo-400 hover:underline font-medium"
                >
                  Full Portal &rarr;
                </Link>
              </div>
            </div>

            {authError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {authError}
              </div>
            )}

            <form onSubmit={handleQuickSignIn} className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  value={quickEmail}
                  onChange={(e) => setQuickEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={quickPassword}
                  onChange={(e) => setQuickPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setQuickEmail('admin@example.com');
                    setQuickPassword('AdminSecurePassword2026!');
                  }}
                  className="text-[10px] text-amber-400/90 hover:underline"
                >
                  Fill Seeded Demo Admin Credentials
                </button>

                <div className="flex gap-2">
                  <Link
                    href="/login?mode=signup"
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                  >
                    Sign Up
                  </Link>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                  >
                    {authLoading ? 'Signing in...' : 'Sign In Now'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* WORKFLOW PIPELINE SHOWCASE */}
        <section id="workflow" className="px-6 lg:px-12 py-16 border-t border-zinc-800/80 bg-zinc-900/20">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">End-to-End Architecture</span>
              <h2 className="text-2xl md:text-3xl font-bold text-white">How The Platform Operates</h2>
              <p className="text-xs text-zinc-400 max-w-xl mx-auto">
                From a live carrier telephone call to a fully dispatched luxury itinerary and supplier quotation request in 4 seamless steps.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  step: '01',
                  icon: Phone,
                  title: 'Carrier Voice Leg',
                  desc: 'Staff places outbound calls to verified contacts or receives inbound calls. Call recording & speech transcription are automatically captured.',
                },
                {
                  step: '02',
                  icon: Sparkles,
                  title: 'DeepSeek AI Concierge',
                  desc: 'One click transforms conversation speech transcripts into structured day-by-day luxury itineraries with accommodations & activities.',
                },
                {
                  step: '03',
                  icon: Compass,
                  title: 'Interactive Revisions',
                  desc: 'Review recording & transcript, adjust hotels or excursions with AI refinement, and select partner suppliers for quotation (RFQ).',
                },
                {
                  step: '04',
                  icon: Send,
                  title: 'Resend Dual PDF Dispatch',
                  desc: 'One-click approval compiles branded PDFs for the customer and RFQ quote requests for suppliers, dispatched directly via Resend email.',
                },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={i} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 space-y-3 relative group hover:border-indigo-500/40 transition">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-mono font-bold text-zinc-600">{card.step}</span>
                    </div>
                    <h3 className="text-sm font-bold text-zinc-200">{card.title}</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">{card.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CORE PLATFORM FEATURES */}
        <section id="features" className="px-6 lg:px-12 py-20 max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Enterprise Features</span>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Full-Featured Telephony Platform</h2>
            <p className="text-xs text-zinc-400 max-w-xl mx-auto">
              Everything required to run mission-critical phone operations, messaging threads, and concierge lead management.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/20">
                <Phone className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200">Carrier Voice & Call Legs</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Plivo live carrier integration with programmable XML routing, forward legs, voicemail, DTMF tone delivery, and exact 60/60 US billing calculation.
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/20">
                <Mic className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200">Audio Records & Transcription</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Carrier callbacks automatically sync MP3 call audio recordings and ASR speech transcripts for compliance, evidence, and AI synthesis.
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/20">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200">DeepSeek AI Travel Concierge</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Converts spoken conversations into day-by-day luxury itineraries with executive summaries, accommodations, and interactive prompt-based revisions.
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold text-xs border border-sky-500/20">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200">Supplier RFQ Management</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Directory of hotels, flight charters, ground transport, and tour providers. Dispatches itemized RFQs asking for quotation rates and availability.
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold text-xs border border-violet-500/20">
                <Download className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200">Pure JavaScript PDF Engine</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Server-side multi-page PDF generation via <code>pdf-lib</code> creates tailored Customer Itineraries and Supplier Quotation Specifications without native bundling issues.
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-500/20">
                <Send className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200">Resend Email Integration</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Official Resend API integration dispatches rich HTML emails with attached PDF itineraries to customers and supplier partners automatically upon approval.
              </p>
            </div>
          </div>
        </section>

        {/* SECURITY & COMPLIANCE */}
        <section id="security" className="px-6 lg:px-12 py-16 border-t border-zinc-800/80 bg-zinc-900/30">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2 max-w-xl">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Bank-Grade Security & Vault
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-white">Multi-Tenant Isolation & Encryption</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Carrier secrets are stored with AES-256-GCM envelope encryption. Carrier webhooks are cryptographically authenticated via HMAC-SHA256 V3 signatures, and privileged actions are captured in an immutable audit log.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login?mode=signup"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-xs font-semibold shadow-md transition"
              >
                Create Account
              </Link>
              <Link
                href="/login?mode=signin"
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-5 py-2.5 rounded-lg text-xs font-semibold border border-zinc-700 transition"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-6 px-6 lg:px-12 bg-zinc-950 text-xs text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">Plivo Platform</span>
          <span>•</span>
          <span>Enterprise Operations & Travel Concierge</span>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/login?mode=signin" className="hover:text-zinc-300 transition">Log In</Link>
          <Link href="/login?mode=signup" className="hover:text-zinc-300 transition">Sign Up</Link>
          <Link href="/docs" className="hover:text-zinc-300 transition">API Documentation</Link>
          <Link href="/console" className="hover:text-zinc-300 transition">Console</Link>
        </div>
      </footer>
    </div>
  );
}
