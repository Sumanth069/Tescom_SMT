import { useState } from 'react';
import { LayoutList, BarChart3, Radio, Layers, QrCode, AlertTriangle, X, Zap } from 'lucide-react';
import { useSmtSocket } from './hooks/useSmtSocket';
import { useSmtStore } from './store/useSmtStore';
import { useInventoryApi } from './hooks/useInventoryApi';
import { LineOverview } from './components/dashboard/LineOverview';
import { KpiSummary } from './components/dashboard/KpiSummary';
import { FilterBar } from './components/inventory/FilterBar';
import { ComponentTable } from './components/inventory/ComponentTable';
import { ComponentChart } from './components/inventory/ComponentChart';
import { ReelInventoryTable } from './components/inventory/ReelInventoryTable';
import { ReelScanPanel } from './components/inventory/ReelScanPanel';
import { ReplenishmentLogModal } from './components/dashboard/ReplenishmentLogModal';
import { CsvInspectorModal } from './components/dashboard/CsvInspectorModal';
import { LiveExcelModal } from './components/inventory/LiveExcelModal';
import clsx from 'clsx';

type MainTab = 'live-feeders' | 'reel-inventory';

function App() {
  useSmtSocket();
  useInventoryApi(); // Connects to inventory server, loads master config + reel data
  
  const [mainTab, setMainTab] = useState<MainTab>('live-feeders');
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

        <div>
          <LineOverview />
        </div>
      </header>

      <main className="space-y-6">
        
        {/* Executive KPI Summary Banner */}
        <section>
          <KpiSummary />
        </section>

        {/* ERP Order Banner */}
        {erpData && (
          <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div><span className="text-gray-500 mr-2">Active Customer:</span> <span className="font-bold text-gray-900">{erpData.customer}</span></div>
              <div>
                <span className="text-gray-500 mr-2">Batch Progress:</span> 
                <span className="font-bold text-blue-600">{erpData.completed_pcbs.toLocaleString()} / {erpData.ordered_pcbs.toLocaleString()} PCBs</span>
              </div>
              <div><span className="text-gray-500 mr-2">Deadline:</span> <span className="font-medium text-gray-800">{erpData.deadline}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Target Finish:</span> 
                <span className="font-medium text-gray-900">{erpData.expected_finish}</span>
                <span className={clsx(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                  erpData.schedule_status === 'ahead of schedule' ? 'bg-green-100 text-green-700' :
                  erpData.schedule_status === 'behind schedule' ? 'bg-red-100 text-red-700' :
                  'bg-blue-100 text-blue-700'
                )}>
                  {erpData.schedule_status}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 italic md:ml-auto bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">
              Integrated ERP Sync
            </div>
          </section>
        )}

        {/* ── MAIN TAB NAVIGATION ──────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            
            {/* Tab Switcher */}
            <div className="flex bg-gray-200/80 p-1 rounded-xl self-start">
              <button
                id="tab-live-feeders"
                onClick={() => setMainTab('live-feeders')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                  mainTab === 'live-feeders' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                )}
              >
                <LayoutList className="w-4 h-4" /> Live Feeder Inventory
              </button>
              <button
                id="tab-reel-inventory"
                onClick={() => setMainTab('reel-inventory')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                  mainTab === 'reel-inventory' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                )}
              >
                <Layers className="w-4 h-4" /> Reel Inventory
              </button>
            </div>

            {/* Right controls — context-sensitive */}
            {mainTab === 'live-feeders' && (
              <div className="flex bg-gray-200/80 p-1 rounded-xl self-start sm:self-auto">
                <button
                  onClick={() => setViewMode('table')}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                    viewMode === 'table' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <LayoutList className="w-4 h-4" /> Table View
                </button>
                <button
                  onClick={() => setViewMode('chart')}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                    viewMode === 'chart' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <BarChart3 className="w-4 h-4" /> Bar Chart View
                </button>
              </div>
            )}

            {mainTab === 'reel-inventory' && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">
                <QrCode className="w-3.5 h-3.5" />
                <span>JSON-driven · No code changes needed to add component types</span>
              </div>
            )}
          </div>

          {/* ── LIVE FEEDER INVENTORY TAB (existing, unchanged) ──────── */}
          {mainTab === 'live-feeders' && (
            <>
              <h2 className="text-lg font-extrabold text-gray-800 tracking-tight">Live Feeder Inventory</h2>
              <FilterBar />
              {viewMode === 'table' ? <ComponentTable /> : <ComponentChart />}
            </>
          )}

          {/* ── REEL INVENTORY TAB (new JSON-driven system) ──────────── */}
          {mainTab === 'reel-inventory' && (
            <div className="space-y-4">
              <h2 className="text-lg font-extrabold text-gray-800 tracking-tight">Reel Inventory</h2>
              {/* QR Scan Panel at top */}
              <ReelScanPanel />
              {/* Reel table below — categories driven by MASTER.json */}
              <ReelInventoryTable />
            </div>
          )}

        </section>

      </main>

      {/* Slide-over & Modal Windows */}
      <ReplenishmentLogModal />
      <CsvInspectorModal />
      <LiveExcelModal />

    </div>
  );
}

export default App;