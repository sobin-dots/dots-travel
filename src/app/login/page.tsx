'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone,
  Lock,
  Mail,
  Building2,
  User,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  KeyRound,
  AlertCircle,
  Loader2,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [telephonyMode, setTelephonyMode] = useState<'live' | 'simulator'>('live');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'signup') {
        setMode('signup');
      }
    }
    // Probe backend ready state to detect live vs simulator
    fetch('/api/v1/ready')
      .then((r) => r.json())
      .then((d) => {
        if (d.telephonyMode) setTelephonyMode(d.telephonyMode);
      })
      .catch(() => {});
  }, []);

  // Signin fields
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('AdminSecurePassword2026!');

  // Signup fields
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/v1/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || 'Invalid credentials');
      }

      // Persist in localStorage
      localStorage.setItem('plivo_access_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('plivo_refresh_token', data.refreshToken);
      }
      localStorage.setItem('plivo_user', JSON.stringify(data.user));
      localStorage.setItem('plivo_org', JSON.stringify(data.organization));

      setSuccessMsg('Authentication successful! Launching console...');
      setTimeout(() => {
        window.location.href = '/console';
      }, 200);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          organizationName: orgName,
          name,
          email: signupEmail,
          password: signupPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || 'Registration failed');
      }

      // Persist in localStorage
      localStorage.setItem('plivo_access_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('plivo_refresh_token', data.refreshToken);
      }
      localStorage.setItem('plivo_user', JSON.stringify(data.user));
      localStorage.setItem('plivo_org', JSON.stringify(data.organization));

      setSuccessMsg(`Welcome, ${name}! Your tenant organization "${orgName}" has been created.`);
      setTimeout(() => {
        window.location.href = '/console';
      }, 300);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoAdminCredentials = () => {
    setEmail('admin@example.com');
    setPassword('AdminSecurePassword2026!');
    setError(null);
  };

  const setDemo3dotsCredentials = () => {
    setEmail('sobin@3dots.co');
    setPassword('AdminSecurePassword2026!');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500/30 selection:text-emerald-200 relative overflow-hidden">
      {/* Background glowing gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-emerald-500/10 blur-[130px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-500/10 blur-[120px] pointer-events-none rounded-full" />

      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/50">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Plivo Platform
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                v1.0.0
              </span>
            </h1>
            <p className="text-xs text-slate-400">Enterprise Voice, Messaging & Operations Console</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/docs"
            className="flex items-center space-x-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/60"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>API Docs (/docs)</span>
          </Link>
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono ${
              telephonyMode === 'live'
                ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-400'
                : 'bg-amber-950/80 border-amber-800 text-amber-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                telephonyMode === 'live' ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-amber-400'
              } animate-pulse`}
            />
            <span>{telephonyMode === 'live' ? 'Live Carrier (Plivo)' : 'Simulator Active'}</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-6 z-10">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl shadow-2xl backdrop-blur-xl p-8 relative">
            {/* Header Tabs */}
            <div className="flex border-b border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 pb-3 text-sm font-semibold transition-all relative ${
                  mode === 'signin'
                    ? 'text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 pb-3 text-sm font-semibold transition-all relative ${
                  mode === 'signup'
                    ? 'text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
              </div>
            )}

            {/* Success Banner */}
            {successMsg && (
              <div className="mb-5 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">{successMsg}</div>
              </div>
            )}

            {/* SIGN IN FORM */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Account Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Password
                    </label>
                    <span className="text-[11px] text-slate-500">AES-256 / Bcrypt Hash</span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Demo Quick-Fill Buttons */}
                <div className="pt-1 space-y-1.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={setDemo3dotsCredentials}
                      className="flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 text-xs transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">3dots (sobin@3dots.co)</span>
                    </button>
                    <button
                      type="button"
                      onClick={setDemoAdminCredentials}
                      className="flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">Admin (admin@example.com)</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 text-center">
                    Default password: <code className="text-slate-300 font-mono">AdminSecurePassword2026!</code>
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Console</span>
                        <ArrowRight className="w-4 h-4 text-emerald-100" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* SIGN UP FORM */}
            {mode === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Organization / Company Name
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g. Acme Communications"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Administrator Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Mercer"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Work Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="alex@acme.com"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password (min. 8 characters)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Provisioning Organization...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Organization & Sign In</span>
                        <Sparkles className="w-4 h-4 text-emerald-100" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Footer security badges */}
            <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Multi-Tenant Isolated
              </span>
              <span>Bearer JWT + Rotation</span>
            </div>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="border-t border-slate-900 px-6 py-4 text-center text-xs text-slate-500 z-10">
        Plivo Communications Platform — Built with Next.js, PostgreSQL & Plivo SDK. All rights reserved.
      </footer>
    </div>
  );
}
