// QR & Barcode Scanner Ingestion Panel
// -------------------------------------------------------------
// This panel lets operators scan reel barcodes into the system:
// 1. Physical Scanner Support: Automatically focuses the input field so operators can
//    simply scan barcodes using USB/Bluetooth barcode guns without touching the mouse.
// 2. Barcode Format: PART_NUMBER$PARTS_ID$LOT_ID$INITIAL_QUANTITY
//    Example: GME34681008DJRE$PP2344F$LT0016$10000
// 3. Instant Feedback Card: Shows the generated Reel ID, assigned category, and file paths.
// 4. Quick Test Buttons: Clickable sample part numbers from MASTER.json for easy testing.

import { useState, useRef, useEffect } from 'react';
import { useInventoryApi } from '../../hooks/useInventoryApi';
import { useSmtStore } from '../../store/useSmtStore';
import { QrCode, Send, RotateCcw, CheckCircle2, XCircle, Info, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { ScanResult } from '../../types';

// Main Barcode / QR Scanner Input Component:
// Provides an auto-focused barcode input, validation feedback banner, and quick-test preset buttons.
export function ReelScanPanel() {
  const [rawQr, setRawQr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { submitScan, fetchAllInventory } = useInventoryApi();
  const masterConfig = useSmtStore(s => s.masterConfig);

  // Auto-focus input on mount so physical barcode guns can start scanning immediately
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sends the scanned string to the backend (POST /api/scan)
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawQr.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setLastResult(null);
    setLastError(null);

    try {
      const result = await submitScan(rawQr.trim());
      if (result?.success) {
        setLastResult(result);
        setRawQr('');
      } else if (result) {
        setLastError(result.message ?? 'Unknown error from server');
      }
    } catch (err: any) {
      setLastError(err.message ?? 'Scan failed');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Build quick-test buttons from known parts in MASTER.json
  const knownParts = masterConfig
    ? Object.entries(masterConfig.partMappings ?? {})
    : [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 shadow-sm">
          <QrCode className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">QR / Barcode Scanner Input</h3>
          <p className="text-xs text-gray-500">
            Format: <code className="bg-white/70 px-1 rounded font-mono">PART_NUMBER$PARTS_ID$LOT_ID$INITIAL_QTY</code>
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Format Explanation Card */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p>
              <span className="font-bold">Separator:</span>{' '}
              <code className="bg-blue-100 px-1 rounded">$</code>
              &nbsp;·&nbsp;
              <span className="font-bold">Example:</span>{' '}
              <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">GME34681008DJRE$PP2344F$LT0016$10000</code>
            </p>
            <p className="text-blue-600">
              The system looks up the Part Number in{' '}
              <code className="bg-blue-100 px-1 rounded">MASTER.json</code>{' '}
              to determine the component category. Add new part numbers there — no code changes needed.
            </p>
          </div>
        </div>

        {/* Scan Input Field & Buttons */}
        <form onSubmit={handleScan} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={rawQr}
            onChange={e => setRawQr(e.target.value)}
            placeholder="e.g. GME34681008DJRE$PP2344F$LT0016$10000"
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 placeholder-gray-300"
          />
          <button
            type="submit"
            disabled={!rawQr.trim() || isSubmitting}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all duration-200",
              "bg-blue-600 text-white hover:bg-blue-700 active:scale-95",
              "disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:scale-100 cursor-pointer"
            )}
          >
            {isSubmitting
              ? <RotateCcw className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
            {isSubmitting ? 'Processing...' : 'Scan'}
          </button>
          <button
            type="button"
            onClick={() => { setRawQr(''); setLastResult(null); setLastError(null); }}
            title="Clear input"
            className="px-3 py-2.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </form>

        {/* Scan Success Notice */}
        {lastResult && (
          <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="font-bold text-green-800">
                {lastResult.action === 'created' ? '✅ New reel registered' : '🔄 Reel already registered — scan recorded'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div><span className="text-green-600 font-medium">Reel ID:</span> <code className="font-mono font-bold text-green-900">{lastResult.reelId}</code></div>
                <div><span className="text-green-600 font-medium">Component Type:</span> <span className="font-bold text-green-900">{lastResult.componentType}</span></div>
                <div><span className="text-green-600 font-medium">Part Number:</span> <code className="font-mono text-green-800">{lastResult.partNumber}</code></div>
                <div><span className="text-green-600 font-medium">Parts ID:</span> <code className="font-mono text-green-800">{lastResult.partsId}</code></div>
                <div><span className="text-green-600 font-medium">Lot ID:</span> <code className="font-mono text-green-800">{lastResult.lotId}</code></div>
                <div><span className="text-green-600 font-medium">Qty:</span> <span className="font-bold text-green-900">{lastResult.initialQuantity?.toLocaleString()}</span></div>
                <div className="col-span-2 space-y-0.5 mt-1 border-t border-green-200/60 pt-1">
                  <div><span className="text-green-700 font-medium">Dashboard / Child JSON:</span> <code className="font-mono text-green-800 bg-green-100/70 px-1 rounded">{lastResult.file} (Recent Scan)</code></div>
                  <div><span className="text-green-700 font-medium">Historical Excel Log:</span> <code className="font-mono text-green-800 bg-green-100/70 px-1 rounded">{lastResult.excelFile || `${lastResult.componentType}.xlsx`} (Complete Archive)</code></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scan Error Notice */}
        {lastError && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-red-800">Scan Failed</p>
              <p className="text-red-600 text-xs mt-1">{lastError}</p>
              <p className="text-red-500 text-xs mt-1.5">
                If "unknown part number": add it to{' '}
                <code className="bg-red-100 px-1 rounded">MASTER.json → partMappings</code>
              </p>
            </div>
          </div>
        )}

        {/* Quick Test Pre-fill Buttons */}
        {knownParts.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Quick Test — click to pre-fill a known part number:
            </p>
            <div className="flex flex-wrap gap-2">
              {knownParts.slice(0, 8).map(([partNumber, mapping]) => {
                const meta = masterConfig?.componentTypes[mapping.componentType];
                return (
                  <button
                    key={partNumber}
                    onClick={() => setRawQr(
                      `${partNumber}$PS${Math.random().toString(36).slice(2,7).toUpperCase()}$LT-TEST$5000`
                    )}
                    style={meta ? { borderColor: meta.color, color: meta.color } : {}}
                    className="text-xs font-bold px-2.5 py-1 rounded-full border bg-white hover:opacity-75 transition-opacity font-mono cursor-pointer"
                    title={mapping.description}
                  >
                    {partNumber}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              (Parts ID and Lot ID are randomized for testing)
            </p>
          </div>
        )}

        {/* Manual Refresh Button */}
        <div className="flex justify-end pt-1 border-t border-gray-100">
          <button
            onClick={fetchAllInventory}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Inventory
          </button>
        </div>
      </div>
    </div>
  );
}
