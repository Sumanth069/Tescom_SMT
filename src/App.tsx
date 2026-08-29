// Main Dashboard Application Layout
// -------------------------------------------------------------
// This is the root frontend view:
// 1. Connects to backend WebSockets and Inventory APIs.
// 2. Renders the top navigation header with ERP synchronization status.
// 3. Displays the prominent, floating top-center Critical Alert Card with [X] dismiss button.
// 4. Provides two main views:
//    - Tab 1: Live SMT Machine Floor (Feeder Table & Recharts Bar Chart).
//    - Tab 2: Barcode Reel Inventory (Category Accordions & Deep Part Search).
// 5. Mounts modal dialogs (Live Excel Spreadsheet, Reload Logs, CSV Diagnostic Inspector).

import { useState } from 'react';
import { LayoutList, BarChart3, Radio, Layers, QrCode, AlertTriangle, X, Zap } from 'lucide-react';
import { useSmtSocket } from './hooks/useSmtSocket';
import { useInventoryApi } from './hooks/useInventoryApi';
import { useSmtStore } from './store/useSmtStore';
import { LineOverview } from './components/dashboard/LineOverview';
import { KpiSummary } from './components/dashboard/KpiSummary';
import { FilterBar } from './components/inventory/FilterBar';
import { ComponentTable } from './components/inventory/ComponentTable';
import { ComponentChart } from './components/inventory/ComponentChart';
import { ReelScanPanel } from './components/inventory/ReelScanPanel';
import { ReelInventoryTable } from './components/inventory/ReelInventoryTable';
import { ReplenishmentLogModal } from './components/dashboard/ReplenishmentLogModal';
import { CsvInspectorModal } from './components/dashboard/CsvInspectorModal';
import { LiveExcelModal } from './components/inventory/LiveExcelModal';
import {
  Activity,
  Table,
  BarChart3,
  QrCode,
  Layers,
  AlertTriangle,
  FileSpreadsheet,
  XCircle,
  RefreshCw,
  X
} from 'lucide-react';
import clsx from 'clsx';

// Root Application Component:
// Assembles the navigation header, floating alert banner, main floor/inventory tabs, and modal dialogs.
export function App() {
  // Connect to backend WebSockets on mount
  useSmtSocket();
  useInventoryApi();

  // Active view tabs
  const [activeTab, setActiveTab] = useState<'floor' | 'reels'>('floor');
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  const activeLineId = useSmtStore(state => state.activeLineId);
  const activeLine = useSmtStore(state => state.lines[activeLineId]);
  const headerAlert = useSmtStore(state => state.headerAlert);
  const clearHeaderAlert = useSmtStore(state => state.clearHeaderAlert);
  const erpData = activeLine?.erp_data;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 lg:p-8 font-sans relative">
      
      {/* ── HIGH-PRIORITY FLOATING TOP-CENTER CRITICAL & THRESHOLD ALERT BANNER ─── */}
      {headerAlert && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[92%] sm:w-auto animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
          <div
            className={clsx(
              "flex items-center justify-between gap-3 sm:gap-4 px-4 py-3 rounded-2xl bg-white shadow-2xl border-2 transition-all backdrop-blur-md",
              headerAlert.type === 'exhausted'
                ? "border-red-600 ring-4 ring-red-600/30 bg-red-50/95 shadow-red-600/20 animate-pulse"
                : headerAlert.type === 'threshold' || headerAlert.type === 'critical'
                ? "border-amber-500 ring-4 ring-amber-500/20 shadow-amber-500/15"
                : headerAlert.type === 'warning'
                ? "border-amber-400 ring-4 ring-amber-400/20 shadow-amber-500/15"
                : "border-emerald-500 ring-4 ring-emerald-500/20 shadow-emerald-500/15"
            )}
          >
            <div className="flex items-center gap-3">
              {/* Urgent Beacon Icon */}
              <div
                className={clsx(
                  "p-2 rounded-xl shrink-0 flex items-center justify-center",
                  headerAlert.type === 'exhausted'
                    ? "bg-red-600 text-white border border-red-700 animate-bounce shadow-md"
                    : headerAlert.type === 'threshold' || headerAlert.type === 'critical'
                    ? "bg-amber-100 text-amber-700 border border-amber-300 ring-2 ring-amber-200"
                    : headerAlert.type === 'warning'
                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                    : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                )}
              >
                {headerAlert.type === 'exhausted' ? (
                  <AlertTriangle className="w-5 h-5 text-white stroke-[3]" />
                ) : headerAlert.type === 'threshold' || headerAlert.type === 'critical' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 stroke-[2.5]" />
                ) : headerAlert.type === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 stroke-[2.5]" />
                ) : (
                  <Zap className="w-5 h-5 text-emerald-600 stroke-[2.5]" />
                )}
              </div>

              {/* Urgent Message Content */}
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white shadow-2xs",
                      headerAlert.type === 'exhausted'
                        ? "bg-red-700 animate-pulse"
                        : headerAlert.type === 'threshold' || headerAlert.type === 'critical'
                        ? "bg-amber-600"
                        : headerAlert.type === 'warning'
                        ? "bg-amber-600"
                        : "bg-emerald-600"
                    )}
                  >
                    {headerAlert.type === 'exhausted'
                      ? '🚨 FEEDER EXHAUSTED (0 QTY)'
                      : headerAlert.type === 'threshold' || headerAlert.type === 'critical'
                      ? '⚠️ LOW STOCK THRESHOLD (< 30s)'
                      : headerAlert.type === 'warning'
                      ? 'SYSTEM WARNING'
                      : 'REEL REPLENISHED'}
                  </span>
                  <span className="text-[11px] font-mono text-gray-500">Live IIoT</span>
                </div>
                <p className={clsx(
                  "text-xs sm:text-sm font-extrabold mt-0.5 tracking-tight",
                  headerAlert.type === 'exhausted' ? "text-red-950" : "text-gray-900"
                )}>
                  {headerAlert.message}
                </p>
              </div>
            </div>

            {/* Close / Dismiss 'X' wrong symbol button */}
            <button
              type="button"
              onClick={clearHeaderAlert}
              title="Dismiss Alert"
              aria-label="Dismiss Alert"
              className={clsx(
                "p-1.5 rounded-xl transition-all cursor-pointer shrink-0 ml-2",
                headerAlert.type === 'exhausted'
                  ? "text-red-700 hover:text-red-950 hover:bg-red-200/80 active:scale-90"
                  : "text-gray-400 hover:text-gray-900 hover:bg-gray-100 active:scale-90"
              )}
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">SMT Floor Dashboard</h1>
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full shrink-0">
              <Radio className="w-3 h-3 text-green-600 animate-pulse" /> Live IIoT
            </span>
          </div>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            Real-time event-driven inventory monitoring &amp; predictive replenishment engine
          </p>
        </div>

            {/* Live ERP Customer Order Sync Bar */}
            {erp && (
              <div className="hidden lg:flex items-center gap-3 bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl text-xs shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-gray-500 font-medium">Customer:</span>
                  <span className="font-bold text-gray-900">{erp.customer}</span>
                </div>
                <span className="text-gray-300">|</span>
                <div>
                  <span className="text-gray-500 font-medium">Batch:</span>{' '}
                  <span className="font-mono font-bold text-blue-700">
                    {erp.completed_pcbs.toLocaleString()} / {erp.ordered_pcbs.toLocaleString()} PCBs
                  </span>
                </div>
                <span className="text-gray-300">|</span>
                <div>
                  <span className="text-gray-500 font-medium">Deadline:</span>{' '}
                  <span className="font-bold text-gray-800">{erp.deadline}</span>
                </div>
              </div>
            )}

            {/* Master Live Excel Button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openLiveExcel('ALL')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#107C41] hover:bg-[#0E6C38] rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                title="Open live interactive Excel spreadsheet interface"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Live Excel</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* ── FLOATING TOP-CENTER CRITICAL ALERT BANNER ────────────────────── */}
      {activeHeaderAlert && (
        <div className="w-full flex justify-center px-4 pt-3 z-40">
          <div
            className={clsx(
              "w-full max-w-4xl rounded-2xl p-4 shadow-xl border-2 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300 backdrop-blur-sm",
              activeHeaderAlert.type === 'exhausted'
                ? "bg-red-950/95 border-red-500 text-white ring-4 ring-red-500/30"
                : activeHeaderAlert.type === 'threshold'
                ? "bg-amber-950/95 border-amber-500 text-white ring-4 ring-amber-500/20"
                : "bg-emerald-950/95 border-emerald-500 text-white ring-4 ring-emerald-500/20"
            )}
          >
            {/* Alert Icon & Message Content */}
            <div className="flex items-center gap-3.5 flex-1 min-w-0">
              <div className={clsx(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold",
                activeHeaderAlert.type === 'exhausted'
                  ? "bg-red-600 text-white animate-bounce"
                  : activeHeaderAlert.type === 'threshold'
                  ? "bg-amber-500 text-gray-950 animate-pulse"
                  : "bg-emerald-500 text-white"
              )}>
                {activeHeaderAlert.type === 'exhausted' && <XCircle className="w-6 h-6" />}
                {activeHeaderAlert.type === 'threshold' && <AlertTriangle className="w-6 h-6" />}
                {activeHeaderAlert.type === 'replenished' && <RefreshCw className="w-6 h-6" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    "text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                    activeHeaderAlert.type === 'exhausted'
                      ? "bg-red-600 text-white"
                      : activeHeaderAlert.type === 'threshold'
                      ? "bg-amber-400 text-gray-950"
                      : "bg-emerald-500 text-white"
                  )}>
                    {activeHeaderAlert.type === 'exhausted' && 'CRITICAL: REEL EMPTY / EXHAUSTED'}
                    {activeHeaderAlert.type === 'threshold' && 'WARNING: LOW STOCK THRESHOLD REACHED'}
                    {activeHeaderAlert.type === 'replenished' && 'SUCCESS: REEL REPLENISHED'}
                  </span>
                  <span className="text-xs font-mono opacity-80">
                    Line: <b className="text-white">{activeHeaderAlert.line_id.toUpperCase()}</b>
                  </span>
                </div>

                <p className="text-sm font-semibold mt-1 truncate">
                  <span className="font-mono font-bold text-blue-300">{activeHeaderAlert.feeder_position}</span>
                  {' · '}
                  <span className="font-mono text-gray-200">{activeHeaderAlert.part_number}</span>
                  {activeHeaderAlert.type === 'threshold' && activeHeaderAlert.time_left_seconds != null && (
                    <span className="text-amber-300 font-normal ml-2">
                      (~{Math.floor(activeHeaderAlert.time_left_seconds / 60)}m {Math.floor(activeHeaderAlert.time_left_seconds % 60)}s left)
                    </span>
                  )}
                  {activeHeaderAlert.type === 'exhausted' && (
                    <span className="text-red-300 font-normal ml-2">
                      (Stock depleted — immediate replacement required!)
                    </span>
                  )}
                  {activeHeaderAlert.type === 'replenished' && activeHeaderAlert.replenished_amount != null && (
                    <span className="text-emerald-300 font-normal ml-2">
                      (+{activeHeaderAlert.replenished_amount.toLocaleString()} parts reloaded)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Dismiss [X] Button */}
            <button
              type="button"
              onClick={clearHeaderAlert}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90 shrink-0 cursor-pointer"
              title="Dismiss warning notification"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT CONTAINER ───────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Line Switcher & View Switcher Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <LineOverview />

          {/* Primary View Navigation Tabs */}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-gray-200 shadow-xs self-start md:self-auto">
            <button
              onClick={() => setActiveTab('floor')}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer',
                activeTab === 'floor'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <Layers className="w-4 h-4" />
              <span>Live Machine Floor</span>
            </button>

            <button
              onClick={() => setActiveTab('reels')}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer',
                activeTab === 'reels'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <QrCode className="w-4 h-4" />
              <span>Barcode Reel Inventory</span>
            </button>
          </div>
        </div>

        {/* TAB 1: LIVE SMT MACHINE FLOOR VIEW */}
        {activeTab === 'floor' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <KpiSummary />

            {/* Table / Bar Chart Toggle Controls */}
            <div className="flex items-center justify-between">
              <FilterBar />
              <div className="hidden sm:flex items-center bg-white border border-gray-200 rounded-lg p-1 shadow-2xs ml-3 shrink-0">
                <button
                  onClick={() => setViewMode('table')}
                  className={clsx(
                    'p-1.5 rounded-md transition-colors cursor-pointer',
                    viewMode === 'table' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-400 hover:text-gray-600'
                  )}
                  title="Table view"
                >
                  <Table className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('chart')}
                  className={clsx(
                    'p-1.5 rounded-md transition-colors cursor-pointer',
                    viewMode === 'chart' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-400 hover:text-gray-600'
                  )}
                  title="Bar chart view"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {viewMode === 'table' ? <ComponentTable /> : <ComponentChart />}
          </div>
        )}

        {/* TAB 2: BARCODE REEL INVENTORY VIEW */}
        {activeTab === 'reels' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <ReelScanPanel />
            <ReelInventoryTable />
          </div>
        )}
      </main>

      {/* ── MODAL DIALOGS ────────────────────────────────────────────────── */}
      <ReplenishmentLogModal />
      <CsvInspectorModal />
      <LiveExcelModal />

      {/* ── FOOTER BAR ───────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-500 font-mono mt-auto">
        Tescom SMT Floor Intelligence Platform · Real-time IIoT Telemetry &amp; Excel Archiving
      </footer>
    </div>
  );
}
export default App;