'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Key, CheckCircle, Shield, ArrowRight } from 'lucide-react';

export default function DocsPage() {
  const [spec, setSpec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/openapi.json')
      .then((res) => res.json())
      .then((data) => {
        setSpec(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load openapi.json:', err);
        setLoading(false);
      });
  }, []);

  const methodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'POST':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'PATCH':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'DELETE':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Plivo Communications API Reference</h1>
            <p className="text-xs text-zinc-400">OpenAPI 3.1 Contract — Single Source of Truth</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-md border border-zinc-700 flex items-center gap-1 transition"
          >
            Operations Console <ArrowRight className="w-3 h-3" />
          </Link>
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md transition"
          >
            Raw JSON
          </a>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left Sidebar: Token Tester & Info */}
        <aside className="md:col-span-1 space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-2 text-zinc-200">
              <Shield className="w-4 h-4 text-emerald-400" />
              API Security
            </h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              All endpoints require HTTP Bearer JWT authentication. Never rely on session cookies.
            </p>
            <label className="text-xs font-medium text-zinc-300 block mb-1">Bearer Token</label>
            <div className="relative">
              <input
                type="password"
                placeholder="Paste Bearer token here..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {token && (
              <p className="text-[10px] text-emerald-400 mt-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Token active for requests
              </p>
            )}
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 text-xs text-zinc-400 space-y-2">
            <div className="font-semibold text-zinc-200 mb-1">Base URLs</div>
            <div className="font-mono text-[11px] bg-zinc-950 p-2 rounded border border-zinc-800 text-zinc-300">
              /api/v1
            </div>
            <div className="text-[11px] pt-1">Rate Limit: 300 requests / 5 sec</div>
          </div>
        </aside>

        {/* Right Section: Endpoint List */}
        <main className="md:col-span-3 space-y-6">
          {loading ? (
            <div className="text-center py-20 text-zinc-500 text-sm">Loading OpenAPI 3.1 specification...</div>
          ) : spec && spec.paths ? (
            Object.entries(spec.paths).map(([path, methods]: [string, any]) => (
              <div key={path} className="space-y-3">
                {Object.entries(methods).map(([method, details]: [string, any]) => {
                  const key = `${method}-${path}`;
                  const isExpanded = selectedEndpoint === key;
                  return (
                    <div
                      key={key}
                      className="border border-zinc-800/80 bg-zinc-900/30 rounded-xl overflow-hidden hover:border-zinc-700 transition"
                    >
                      <button
                        onClick={() => setSelectedEndpoint(isExpanded ? null : key)}
                        className="w-full text-left p-4 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-1 rounded border uppercase ${methodColor(
                              method
                            )}`}
                          >
                            {method}
                          </span>
                          <span className="font-mono text-sm font-medium text-zinc-200">{path}</span>
                        </div>
                        <span className="text-xs text-zinc-400 truncate max-w-sm">{details.summary}</span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-zinc-800 bg-zinc-950/60 p-5 space-y-4 text-xs">
                          <div>
                            <div className="text-zinc-400 font-semibold mb-1">Description:</div>
                            <div className="text-zinc-300">{details.summary || 'No description provided.'}</div>
                          </div>

                          {details.parameters && details.parameters.length > 0 && (
                            <div>
                              <div className="text-zinc-400 font-semibold mb-2">Parameters:</div>
                              <div className="space-y-1">
                                {details.parameters.map((p: any) => (
                                  <div
                                    key={p.name}
                                    className="flex items-center gap-2 font-mono text-[11px] bg-zinc-900/60 p-2 rounded border border-zinc-800"
                                  >
                                    <span className="text-indigo-400 font-semibold">{p.name}</span>
                                    <span className="text-zinc-500">({p.in})</span>
                                    {p.required && <span className="text-rose-400 text-[10px]">required</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {details.requestBody && (
                            <div>
                              <div className="text-zinc-400 font-semibold mb-2">Request Body Schema:</div>
                              <pre className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto">
                                {JSON.stringify(
                                  details.requestBody.content?.['application/json']?.schema || {},
                                  null,
                                  2
                                )}
                              </pre>
                            </div>
                          )}

                          <div>
                            <div className="text-zinc-400 font-semibold mb-2">Responses:</div>
                            <div className="flex gap-2">
                              {Object.keys(details.responses || {}).map((code) => (
                                <span
                                  key={code}
                                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded font-mono text-[11px] text-zinc-300"
                                >
                                  HTTP {code}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="text-center py-20 text-rose-400 text-sm">Failed to load API specification.</div>
          )}
        </main>
      </div>
    </div>
  );
}
