// Barcode Reel Inventory Table & Child Component Search
// -------------------------------------------------------------
// This view manages the registered component reels:
// 1. Dynamic Accordions: Renders category accordions automatically from MASTER.json.
// 2. Child Component Search & Presence Checker:
//    - Searches across Part Numbers (e.g. "RC0402FR-0710KL"), descriptions ("10K", "100nF", "STM32"),
//      Reel IDs, and Lot IDs.
//    - Shows instant color-coded Presence Cards:
//      🟢 Present in Active Inventory (shows reel ID, stock amount, and Live Excel link).
//      🟡 Registered in Catalog (shows that part is registered in MASTER.json with past logs).
//      🔴 Not Found (informs if the part hasn't been scanned or registered yet).
// 3. Direct Live Excel Shortcuts: 1-click button on each category header to open its spreadsheet.

import { useMemo, useState } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import {
  Package,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Layers,
  FileSpreadsheet,
  Clock,
  Search,
  X,
  ArrowRight,
  Info
} from 'lucide-react';
import clsx from 'clsx';
import type { ReelRecord, MasterComponentEntry } from '../../types';

// Status pill badge for reel inventory rows
function QuantityBadge({ reel }: { reel: ReelRecord }) {
  const level = reel.computedStatus || 'ok';

  if (level === 'critical') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 ring-1 ring-red-300">
      <XCircle className="w-3 h-3" /> Critical
    </span>
  );
  if (level === 'warning') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300">
      <AlertTriangle className="w-3 h-3" /> Warning
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
      <CheckCircle2 className="w-3 h-3" /> OK
    </span>
  );
}

// Progress bar showing remaining quantity percentage
function QuantityBar({ reel }: { reel: ReelRecord }) {
  const pct = reel.initialQuantity > 0
    ? Math.min(100, Math.round((reel.remainingQuantity / reel.initialQuantity) * 100))
    : 0;

  const color =
    reel.computedStatus === 'critical' ? 'bg-red-500' :
    reel.computedStatus === 'warning'  ? 'bg-yellow-400' :
    'bg-green-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

interface CategoryAccordionProps {
  componentType: string;
  meta: MasterComponentEntry;
  reels: ReelRecord[];
  searchQuery: string;
  onOpenLiveExcel: (componentType: string) => void;
}

// Collapsible category accordion displaying the most recent reel scan
function CategoryAccordion({ componentType, meta, reels, searchQuery, onOpenLiveExcel }: CategoryAccordionProps) {
  const [userToggledOpen, setUserToggledOpen] = useState<boolean | null>(null);
  const isOpen = userToggledOpen !== null ? userToggledOpen : true;

  const criticalCount = reels.filter(r => r.computedStatus === 'critical').length;
  const warningCount  = reels.filter(r => r.computedStatus === 'warning').length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
      {/* Header bar */}
      <div
        onClick={() => setUserToggledOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-gray-50/80 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm"
            style={{ backgroundColor: meta.color }}
          >
            {meta.symbol}
          </div>
          <div className="text-left">
            <span className="font-bold text-gray-900 text-sm">{meta.label}</span>
            <span className="ml-2 text-xs text-gray-400 font-mono">{componentType}</span>
          </div>
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full animate-pulse">
              <XCircle className="w-3 h-3" /> {criticalCount} Critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {warningCount} Warning
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3" onClick={e => e.stopPropagation()}>
          {reels.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full">
              <Clock className="w-3 h-3 text-blue-500" /> Recent Scan
            </span>
          ) : (
            <span className="text-xs text-gray-400 italic">No Scans Yet</span>
          )}

          {/* Button to open this category in Live Excel */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLiveExcel(componentType);
            }}
            title={`Open live interactive Excel spreadsheet for ${meta.label}`}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-[#107C41] bg-emerald-50 hover:bg-emerald-100 border border-emerald-300/80 rounded-lg transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#107C41]" />
            <span>Live Excel Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => setUserToggledOpen(!isOpen)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
          >
            {isOpen
              ? <ChevronDown className="w-4 h-4 text-gray-400" />
              : <ChevronRight className="w-4 h-4 text-gray-400" />
            }
          </button>
        </div>
      </div>

      {/* Accordion Table Content */}
      {isOpen && (
        <div className="border-t border-gray-100">
          {reels.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400 italic">
              No matching reels registered in this category.
              <br />
              <span className="text-xs">Scan a reel or click "Live Excel Sheet" to view full archives.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reel ID</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Part Number</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Parts ID</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Lot ID</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-52">Quantity</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Level</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Scanned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reels.map(reel => {
                    const isCritical = reel.computedStatus === 'critical';
                    const isWarning  = reel.computedStatus === 'warning';
                    return (
                      <tr
                        key={reel.reelId}
                        className={clsx(
                          'transition-colors hover:bg-gray-50',
                          isCritical && 'bg-red-50/40',
                          isWarning  && 'bg-yellow-50/40'
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">
                          <div className="flex items-center gap-1.5">
                            <span>{reel.reelId}</span>
                            <span className="text-[10px] uppercase font-sans font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">Latest</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 font-mono text-xs">
                          <span className={clsx(
                            searchQuery && reel.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) && 'bg-yellow-100 px-1 rounded font-bold'
                          )}>
                            {reel.partNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">{reel.partsId}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{reel.lotId}</td>
                        <td className="px-4 py-3 w-52">
                          <div className="mb-1 flex items-baseline gap-1.5">
                            <span className="font-mono font-bold text-gray-900">
                              {reel.remainingQuantity.toLocaleString()}
                            </span>
                            <span className="text-xs text-gray-400">
                              / {reel.initialQuantity.toLocaleString()}
                            </span>
                          </div>
                          <QuantityBar reel={reel} />
                        </td>
                        <td className="px-4 py-3"><QuantityBadge reel={reel} /></td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(reel.scannedAt).toLocaleString('en-GB', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Reel Inventory Component:
// Shows the category overview, search bar, child component presence cards, and category accordions.
export function ReelInventoryTable() {
  const reelInventory = useSmtStore(s => s.reelInventory);
  const masterConfig  = useSmtStore(s => s.masterConfig);
  const isLoading     = useSmtStore(s => s.isReelInventoryLoading);
  const openLiveExcel = useSmtStore(s => s.openLiveExcel);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'warning' | 'critical'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Calculate overall stock level totals across all categories
  const stats = useMemo(() => {
    let total = 0, critical = 0, warning = 0, ok = 0;
    Object.values(reelInventory).forEach(cat => {
      (cat.reels ?? []).forEach(r => {
        total++;
        if (r.computedStatus === 'critical') critical++;
        else if (r.computedStatus === 'warning') warning++;
        else ok++;
      });
    });
    return { total, critical, warning, ok };
  }, [reelInventory]);

  // Deep search matching logic (checks part numbers, descriptions, and active stock)
  const childComponentMatches = useMemo(() => {
    if (!searchQuery.trim() || !masterConfig) return null;
    const q = searchQuery.trim().toLowerCase();

    // 1. Check MASTER.json catalog definitions
    const matchedMasterParts: {
      partNumber: string;
      componentType: string;
      description: string;
      activeReel: ReelRecord | null;
    }[] = [];

    Object.entries(masterConfig.partMappings || {}).forEach(([partNum, mapping]) => {
      const isPartMatch = partNum.toLowerCase().includes(q);
      const isDescMatch = (mapping.description || '').toLowerCase().includes(q);
      const isTypeMatch = mapping.componentType.toLowerCase().includes(q) || (masterConfig.componentTypes[mapping.componentType]?.label || '').toLowerCase().includes(q);

      if (isPartMatch || isDescMatch || isTypeMatch) {
        const catReels = reelInventory[mapping.componentType]?.reels || [];
        const activeReel = catReels.find(r => r.partNumber === partNum) || null;

        matchedMasterParts.push({
          partNumber: partNum,
          componentType: mapping.componentType,
          description: mapping.description || `${mapping.componentType} Component`,
          activeReel
        });
      }
    });

    // 2. Check active reels that match reel ID, parts ID, lot ID, or category directly
    const matchedActiveReels: { reel: ReelRecord; category: string; description?: string }[] = [];
    Object.entries(reelInventory).forEach(([catType, catData]) => {
      const meta = masterConfig.componentTypes[catType];
      const isCatMatch = catType.toLowerCase().includes(q) || (meta?.label || '').toLowerCase().includes(q);

      (catData.reels || []).forEach(r => {
        const isReelIdMatch = r.reelId.toLowerCase().includes(q);
        const isPartMatch = r.partNumber.toLowerCase().includes(q);
        const isPartsIdMatch = r.partsId.toLowerCase().includes(q);
        const isLotIdMatch = r.lotId.toLowerCase().includes(q);

        if (isCatMatch || isReelIdMatch || isPartMatch || isPartsIdMatch || isLotIdMatch) {
          const mapping = masterConfig.partMappings[r.partNumber];
          matchedActiveReels.push({
            reel: r,
            category: catType,
            description: mapping?.description || `${catType} Component`
          });
        }
      });
    });

    const hasAnyActiveMatch = matchedActiveReels.length > 0 || matchedMasterParts.some(p => p.activeReel !== null);
    const hasAnyCatalogMatch = matchedMasterParts.length > 0;

    return {
      query: searchQuery.trim(),
      hasAnyActiveMatch,
      hasAnyCatalogMatch,
      matchedMasterParts,
      matchedActiveReels
    };
  }, [searchQuery, masterConfig, reelInventory]);

  // Filter categories and reels based on user selections
  const filteredCategories = useMemo(() => {
    if (!masterConfig) return [];
    const q = searchQuery.trim().toLowerCase();

    return Object.entries(masterConfig.componentTypes)
      .filter(([type]) => {
        if (categoryFilter !== 'ALL' && type !== categoryFilter) return false;
        return true;
      })
      .map(([type, meta]) => {
        const categoryData = reelInventory[type];
        const allReels = categoryData?.reels ?? [];
        const isCatNameMatch = type.toLowerCase().includes(q) || meta.label.toLowerCase().includes(q);

        const matchingReels = allReels.filter(reel => {
          if (statusFilter !== 'all' && (reel.computedStatus || 'ok') !== statusFilter) {
            return false;
          }

          if (!q) return true;
          const mapping = masterConfig.partMappings[reel.partNumber];
          const desc = mapping?.description || '';

          return (
            isCatNameMatch ||
            reel.partNumber.toLowerCase().includes(q) ||
            reel.reelId.toLowerCase().includes(q) ||
            reel.partsId.toLowerCase().includes(q) ||
            reel.lotId.toLowerCase().includes(q) ||
            desc.toLowerCase().includes(q)
          );
        });

        return {
          type,
          meta,
          reels: matchingReels,
          hasMatches: !q ? true : (matchingReels.length > 0 || isCatNameMatch)
        };
      })
      .filter(item => {
        if (!q) return true;
        return item.hasMatches;
      });
  }, [masterConfig, reelInventory, searchQuery, categoryFilter, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
        <p className="font-medium">Loading reel inventory...</p>
      </div>
    );
  }

  if (!masterConfig) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Layers className="w-10 h-10 mb-3" />
        <p className="font-bold text-gray-600">Inventory server not connected</p>
        <p className="text-sm mt-1">Start <code className="bg-gray-100 px-1 rounded">inventory-server.js</code> on port 3002</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner with Stats & Open Live Master Excel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span>Category Overview</span>
            <span className="text-[11px] font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
              Dashboard shows most recent scan · Live Excel interface for full logs
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time synchronization with category JSON files and interactive Live Excel (<code className="font-mono text-gray-700">.xlsx</code>) spreadsheets
          </p>
        </div>

        {/* Master Live Excel Button */}
        <button
          type="button"
          onClick={() => openLiveExcel('ALL')}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#107C41] hover:bg-[#0E6C38] rounded-lg shadow-sm transition-all active:scale-95 self-start md:self-auto cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Open Live Master Excel</span>
        </button>
      </div>

      {/* Stock Level Stats Bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Active Categories', value: Object.keys(reelInventory).filter(k => (reelInventory[k]?.reels?.length ?? 0) > 0).length, color: 'text-gray-900', bg: 'bg-white' },
          { label: 'OK',          value: stats.ok,       color: 'text-green-700',  bg: 'bg-green-50' },
          { label: 'Warning',     value: stats.warning,  color: 'text-yellow-700', bg: 'bg-yellow-50' },
          { label: 'Critical',    value: stats.critical, color: 'text-red-700',    bg: 'bg-red-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={clsx('rounded-xl p-3 border border-gray-200 shadow-sm', bg)}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={clsx('text-2xl font-extrabold mt-0.5', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── SEARCH & CHILD COMPONENT PRESENCE CHECKER BAR ────────────────────── */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">

          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search child component (Part Number e.g. RC0402FR-0710KL, 10K, 100nF, STM32, Reel ID)..."
              className="w-full pl-10 pr-10 py-2.5 text-sm bg-gray-50 hover:bg-white focus:bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono shadow-2xs transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Dropdown Filter */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Categories</option>
              {Object.entries(masterConfig.componentTypes).map(([type, meta]) => (
                <option key={type} value={type}>{meta.label} ({type})</option>
              ))}
            </select>

            {/* Status Level Buttons */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
              {(['all', 'ok', 'warning', 'critical'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setStatusFilter(lvl)}
                  className={clsx(
                    "px-2.5 py-1 text-xs font-bold rounded-md transition-all uppercase tracking-wider cursor-pointer",
                    statusFilter === lvl ? "bg-white text-gray-900 shadow-2xs" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Quick Search Chips */}
        {!searchQuery && (
          <div className="flex items-center gap-2 flex-wrap pt-1 text-xs text-gray-400">
            <span className="font-semibold text-gray-500">Quick component search:</span>
            {['RC0402FR-0710KL (10K)', 'GME34681008DJRE (MLCC)', 'STM32F103C8T6 (MCU)', 'BAV99-7-F (Diode)', 'LQG15HS10NJ02D (Inductor)'].map(chip => {
              const part = chip.split(' ')[0];
              return (
                <button
                  key={part}
                  type="button"
                  onClick={() => setSearchQuery(part)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-mono text-[11px] transition-colors cursor-pointer"
                >
                  {chip}
                </button>
              );
            })}
          </div>
        )}

        {/* ── CHILD COMPONENT PRESENCE CARDS ─────────────────────────────────── */}
        {childComponentMatches && (
          <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* 1. Component is active in live inventory */}
            {childComponentMatches.hasAnyActiveMatch && (
              <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-bold">✓</span>
                    <span className="text-xs font-extrabold text-emerald-950 uppercase tracking-wide">
                      Child Component(s) Present in Active Inventory
                    </span>
                  </div>
                  <span className="text-xs text-emerald-800 font-mono">
                    Query: <b>"{childComponentMatches.query}"</b>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  {childComponentMatches.matchedActiveReels.map(({ reel, category, description }) => {
                    const meta = masterConfig.componentTypes[category];
                    return (
                      <div
                        key={`${category}-${reel.reelId}`}
                        className="bg-white border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 text-[10px] font-bold text-white rounded"
                              style={{ backgroundColor: meta?.color || '#10B981' }}
                            >
                              {meta?.label || category}
                            </span>
                            <span className="font-mono font-bold text-xs text-gray-900">{reel.partNumber}</span>
                          </div>
                          <p className="text-[11px] text-gray-600 font-medium">{description}</p>
                          <div className="flex items-center gap-3 text-[11px] font-mono text-gray-500">
                            <span>Reel: <b className="text-blue-700">{reel.reelId}</b></span>
                            <span>Stock: <b className="text-emerald-700">{reel.remainingQuantity.toLocaleString()} pcs</b></span>
                            <span>Lot: <b>{reel.lotId}</b></span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openLiveExcel(category)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-all active:scale-95 shrink-0 cursor-pointer"
                          title={`View ${category} in Live Excel`}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Live Excel</span>
                          <ArrowRight className="w-3 h-3 text-emerald-600" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Component is registered in catalog but no recent scan */}
            {!childComponentMatches.hasAnyActiveMatch && childComponentMatches.hasAnyCatalogMatch && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-extrabold text-amber-950 uppercase tracking-wide">
                      Registered in Catalog · Historical Scans in Excel
                    </span>
                  </div>
                  <span className="text-xs text-amber-800 font-mono">
                    Query: <b>"{childComponentMatches.query}"</b>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  {childComponentMatches.matchedMasterParts.map(part => {
                    const meta = masterConfig.componentTypes[part.componentType];
                    return (
                      <div
                        key={part.partNumber}
                        className="bg-white border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 text-[10px] font-bold text-white rounded"
                              style={{ backgroundColor: meta?.color || '#F59E0B' }}
                            >
                              {meta?.label || part.componentType}
                            </span>
                            <span className="font-mono font-bold text-xs text-gray-900">{part.partNumber}</span>
                          </div>
                          <p className="text-[11px] text-gray-600 font-medium">{part.description}</p>
                          <p className="text-[11px] text-amber-700">
                            Registered in MASTER.json. Check Live Excel sheet to view past scans.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => openLiveExcel(part.componentType)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-all active:scale-95 shrink-0 cursor-pointer"
                          title={`View ${part.componentType} in Live Excel`}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-amber-700" />
                          <span>Check Excel Logs</span>
                          <ArrowRight className="w-3 h-3 text-amber-700" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Component is not registered */}
            {!childComponentMatches.hasAnyActiveMatch && !childComponentMatches.hasAnyCatalogMatch && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 shadow-2xs">
                <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-red-900">
                    Child Component Not Found: <code className="font-mono">{childComponentMatches.query}</code>
                  </p>
                  <p className="text-red-700 mt-0.5">
                    No active reel, master part number, description, or category matches this search. Scan a QR code to register this component.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Category Accordions */}
      <div className="space-y-3">
        {filteredCategories.map(({ type, meta, reels }) => (
          <CategoryAccordion
            key={type}
            componentType={type}
            meta={meta}
            reels={reels}
            searchQuery={searchQuery}
            onOpenLiveExcel={openLiveExcel}
          />
        ))}

        {filteredCategories.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 shadow-sm space-y-2">
            <Search className="w-8 h-8 mx-auto text-gray-300" />
            <p className="font-bold text-gray-700">No components match your search filter</p>
            <p className="text-xs text-gray-400">
              Try searching with another part number, reel ID, or clearing the search query.
            </p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); setCategoryFilter('ALL'); }}
              className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {Object.keys(masterConfig.componentTypes).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2" />
          <p className="font-bold">No component types configured</p>
          <p className="text-sm mt-1">Add entries to <code className="bg-gray-100 px-1 rounded">MASTER.json → componentTypes</code></p>
        </div>
      )}
    </div>
  );
}
