'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Users,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';
import {
  parseContactsCSV,
  getSampleContactsCSV,
  CSVParseResult,
  ParsedContactRow,
} from '@/lib/csv-parser';

export function BulkContactsModal() {
  const {
    showBulkContactsModal,
    setShowBulkContactsModal,
    contactsList,
    fetchContacts,
    fetchData,
    authFetch,
  } = useConsole();

  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>('+91');
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    importedCount: number;
    skippedCount: number;
    totalSubmitted: number;
    message: string;
    skippedDetails?: Array<{ name: string; phone: string; reason: string }>;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!showBulkContactsModal) return null;

  // Set of existing normalized phones in the current directory for live UI duplicate tagging
  const existingPhonesSet = new Set(
    contactsList.map((c: any) => (c.phone ? c.phone.replace(/[\s\-\(\)]/g, '') : ''))
  );

  const handleProcessFile = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv') && selectedFile.type !== 'text/csv') {
      setErrorMessage('Please select a valid .csv file.');
      return;
    }
    setErrorMessage(null);
    setFile(selectedFile);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = (e.target?.result as string) || '';
      setCsvContent(content);
      const parsed = parseContactsCSV(content, defaultCountryCode);
      setParseResult(parsed);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected file.');
    };
    reader.readAsText(selectedFile);
  };

  const handleCountryCodeChange = (newCode: string) => {
    setDefaultCountryCode(newCode);
    if (csvContent) {
      const reParsed = parseContactsCSV(csvContent, newCode);
      setParseResult(reParsed);
    }
  };

  const handleDownloadSample = () => {
    const sample = getSampleContactsCSV();
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'contacts_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setFile(null);
    setCsvContent('');
    setParseResult(null);
    setUploadResult(null);
    setErrorMessage(null);
    setShowBulkContactsModal(false);
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;
    setUploading(true);
    setErrorMessage(null);

    try {
      const payload = {
        defaultCountryCode,
        contacts: parseResult.validRows.map((r) => ({
          name: r.name,
          phone: r.phone,
          email: r.email,
          company: r.company,
          notes: r.notes,
        })),
      };

      const res = await authFetch('/api/v1/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to bulk import contacts');
      }

      setUploadResult({
        importedCount: data.importedCount,
        skippedCount: data.skippedCount,
        totalSubmitted: data.totalSubmitted,
        message: data.message,
        skippedDetails: data.skippedDetails,
      });

      // Refresh directory immediately
      await fetchContacts();
      await fetchData();
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMessage(err.message || 'Error occurred during bulk contacts import');
    } finally {
      setUploading(false);
    }
  };

  // Compute live breakdown counts based on CSV parsing + directory lookup
  const validCandidates = parseResult ? parseResult.validRows : [];
  const invalidRows = parseResult ? parseResult.invalidRows : [];

  const existingInDirectoryCount = validCandidates.filter((r) =>
    existingPhonesSet.has(r.phone)
  ).length;

  const netNewCount = validCandidates.length - existingInDirectoryCount;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col my-8 max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <Upload className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Bulk Contacts Upload (CSV)
              </h3>
              <p className="text-xs text-zinc-400">
                Import client contacts from spreadsheets into your verified dialing directory.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Success State */}
          {uploadResult ? (
            <div className="p-6 bg-zinc-950/80 border border-emerald-900/40 rounded-xl text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-950/80 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">Import Complete!</h4>
                <p className="text-xs text-zinc-400 mt-1">{uploadResult.message}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-lg font-bold text-zinc-100">{uploadResult.totalSubmitted}</div>
                  <div className="text-[11px] text-zinc-400">Processed</div>
                </div>
                <div className="p-3 bg-emerald-950/50 border border-emerald-800/50 rounded-lg">
                  <div className="text-lg font-bold text-emerald-400">+{uploadResult.importedCount}</div>
                  <div className="text-[11px] text-emerald-300">Added to Directory</div>
                </div>
                <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-lg">
                  <div className="text-lg font-bold text-amber-400">{uploadResult.skippedCount}</div>
                  <div className="text-[11px] text-amber-300">Skipped (Duplicates)</div>
                </div>
              </div>

              {uploadResult.skippedDetails && uploadResult.skippedDetails.length > 0 && (
                <div className="text-left bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-36 overflow-y-auto space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-400 block mb-1">
                    Skipped Items Summary:
                  </span>
                  {uploadResult.skippedDetails.map((item, idx) => (
                    <div key={idx} className="text-[11px] text-zinc-400 flex items-center justify-between gap-2">
                      <span className="font-medium text-zinc-300 truncate">{item.name} ({item.phone})</span>
                      <span className="text-amber-400 text-[10px] shrink-0 font-mono">{item.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
                >
                  Done & View Directory
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Error banner */}
              {errorMessage && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Upload Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleProcessFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-950/20'
                    : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleProcessFile(e.target.files[0]);
                    }
                  }}
                />
                <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-400">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                </div>
                {file ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5">
                      <Check className="w-4 h-4" /> {file.name}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {(file.size / 1024).toFixed(1)} KB • Click or drag to replace
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-zinc-200">
                      Drop your contacts CSV file here, or <span className="text-emerald-400 underline">browse</span>
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Supports columns: Name, Phone (or Mobile), Email, Company, Notes
                    </p>
                  </div>
                )}
              </div>

              {/* Actions & Settings Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <label className="text-zinc-400 text-[11px] font-medium whitespace-nowrap">
                    Default Country Code:
                  </label>
                  <select
                    value={defaultCountryCode}
                    onChange={(e) => handleCountryCodeChange(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1 text-zinc-200 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="+91">India (+91)</option>
                    <option value="+1">USA / Canada (+1)</option>
                    <option value="+44">UK (+44)</option>
                    <option value="+971">UAE (+971)</option>
                    <option value="+65">Singapore (+65)</option>
                    <option value="+60">Malaysia (+60)</option>
                    <option value="+61">Australia (+61)</option>
                  </select>
                  <span className="text-[11px] text-zinc-500 hidden sm:inline">
                    (Used for 10-digit local numbers)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="text-xs text-zinc-400 hover:text-emerald-400 flex items-center gap-1.5 transition self-start sm:self-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample CSV</span>
                </button>
              </div>

              {/* Live Preview Table */}
              {parseResult && (
                <div className="space-y-3">
                  {/* Status Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      Total: {parseResult.totalRows}
                    </span>
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Ready to Add: {netNewCount}
                    </span>
                    {existingInDirectoryCount > 0 && (
                      <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-amber-950 text-amber-400 border border-amber-800/60 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Existing (will skip): {existingInDirectoryCount}
                      </span>
                    )}
                    {invalidRows.length > 0 && (
                      <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-rose-950 text-rose-400 border border-rose-800/60 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Invalid (will skip): {invalidRows.length}
                      </span>
                    )}
                  </div>

                  {/* Preview Table Container */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 sticky top-0 font-medium">
                        <tr>
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3">Phone (Normalized)</th>
                          <th className="py-2 px-3">Email</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                        {parseResult.rows.map((row) => {
                          const isAlreadyInDb = row.isValid && existingPhonesSet.has(row.phone);

                          return (
                            <tr
                              key={row.rowIndex}
                              className={`text-[11px] ${
                                !row.isValid
                                  ? 'bg-rose-950/20 text-rose-300'
                                  : isAlreadyInDb
                                  ? 'bg-amber-950/20 text-amber-200'
                                  : 'hover:bg-zinc-800/30'
                              }`}
                            >
                              <td className="py-2 px-3 text-zinc-500 font-mono">{row.rowIndex}</td>
                              <td className="py-2 px-3 font-semibold text-zinc-200">{row.name || '—'}</td>
                              <td className="py-2 px-3 font-mono text-emerald-400 font-medium">{row.phone}</td>
                              <td className="py-2 px-3 text-zinc-400 truncate max-w-[120px]">
                                {row.email || '—'}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {!row.isValid ? (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800/60 text-rose-400 font-mono text-[10px]">
                                    {row.error}
                                  </span>
                                ) : isAlreadyInDb ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-800/60 text-amber-400 font-mono text-[10px]">
                                    Already Exists
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800/60 text-emerald-400 font-mono text-[10px]">
                                    Ready
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!uploadResult && (
          <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={uploading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={uploading || !parseResult || parseResult.validRows.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing Contacts...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    Import {netNewCount > 0 ? `${netNewCount} New Contacts` : 'Contacts'}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

