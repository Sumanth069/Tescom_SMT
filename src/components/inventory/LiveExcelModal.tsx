// Live Excel Spreadsheet Modal & Export Interface
// -------------------------------------------------------------
// This modal provides an interactive spreadsheet view of our SMT reel data:
// 1. Looks and feels like Microsoft Excel (Green ribbon, formula bar, cell grid, bottom sheet tabs).
// 2. Loads complete historical scan records directly from the category's .xlsx backend file.
// 3. Flashes a green highlight when a new barcode is scanned in real time via Socket.io.
// 4. In-Sheet Exports: Download as .xlsx (Official Excel file) or .csv (Raw text data).

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import { useInventoryApi } from '../../hooks/useInventoryApi';
import {
  FileSpreadsheet,
  Download,
  X,
  Search,
  RefreshCw,
  Clock,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';
import clsx from 'clsx';
import type { ReelRecord } from '../../types';

// Standard Excel columns
const COLUMNS = [
  { letter: 'A', header: 'Reel ID', key: 'reelId', width: 'w-32', align: 'left' },
  { letter: 'B', header: 'Part Number', key: 'partNumber', width: 'w-48', align: 'left' },
  { letter: 'C', header: 'Parts ID', key: 'partsId', width: 'w-36', align: 'left' },
  { letter: 'D', header: 'Lot ID', key: 'lotId', width: 'w-32', align: 'left' },
  { letter: 'E', header: 'Initial Qty', key: 'initialQuantity', width: 'w-28', align: 'right' },
  { letter: 'F', header: 'Remaining Qty', key: 'remainingQuantity', width: 'w-32', align: 'right' },
  { letter: 'G', header: 'Status', key: 'status', width: 'w-28', align: 'center' },
  { letter: 'H', header: 'Scanned At', key: 'scannedAt', width: 'w-44', align: 'left' },
  { letter: 'I', header: 'Last Updated', key: 'lastUpdated', width: 'w-44', align: 'left' },
];

// Main Live Excel Modal Component:
// Renders an interactive spreadsheet with ribbon, formula bar, cell grid, and bottom sheet tabs.
export function LiveExcelModal() {
  const activeExcelCategory = useSmtStore(s => s.activeExcelCategory);
  const closeLiveExcel       = useSmtStore(s => s.closeLiveExcel);
  const masterConfig         = useSmtStore(s => s.masterConfig);

  const {
    downloadCategoryExcel,
    downloadMasterExcel,
    fetchCategoryHistory,
    fetchAllHistory
  } = useInventoryApi();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [historyData, setHistoryData] = useState<Record<string, ReelRecord[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [highlightedReelId, setHighlightedReelId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof ReelRecord>('scannedAt');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const tableBodyRef = useRef<HTMLDivElement>(null);

  // Sync selected tab with whichever category the user clicked on
  useEffect(() => {
    if (activeExcelCategory) {
      setSelectedCategory(activeExcelCategory);
      loadHistory();
    }
  }, [activeExcelCategory]);

  // Load spreadsheet data from the backend
  const loadHistory = async () => {
    setIsLoading(true);
    try {
      if (selectedCategory === 'ALL') {
        const all = await fetchAllHistory();
        setHistoryData(all);
      } else {
        const catReels = await fetchCategoryHistory(selectedCategory);
        setHistoryData(prev => ({ ...prev, [selectedCategory]: catReels }));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // When a barcode is scanned, reload and flash the newly scanned row in green
  useEffect(() => {
    const handleNewScan = (e: CustomEvent<{ componentType: string; reel: ReelRecord }>) => {
      const { componentType, reel } = e.detail;
      setHistoryData(prev => {
        const existing = prev[componentType] || [];
        const filtered = existing.filter(r => r.reelId !== reel.reelId);
        return { ...prev, [componentType]: [reel, ...filtered] };
      });
      setHighlightedReelId(reel.reelId);
      setTimeout(() => setHighlightedReelId(null), 3000);
    };

    window.addEventListener('excel_new_scan' as any, handleNewScan);
    return () => window.removeEventListener('excel_new_scan' as any, handleNewScan);
  }, []);

  // Filter and sort the rows currently displayed in the spreadsheet
  const activeRows: (ReelRecord & { category?: string })[] = useMemo(() => {
    let rows: (ReelRecord & { category?: string })[] = [];

    if (selectedCategory === 'ALL') {
      Object.entries(historyData).forEach(([cat, reels]) => {
        (reels || []).forEach(r => rows.push({ ...r, category: cat }));
      });
    } else {
      rows = (historyData[selectedCategory] || []).map(r => ({ ...r, category: selectedCategory }));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(r =>
        r.reelId.toLowerCase().includes(q) ||
        r.partNumber.toLowerCase().includes(q) ||
        r.partsId.toLowerCase().includes(q) ||
        r.lotId.toLowerCase().includes(q) ||
        (r.category && r.category.toLowerCase().includes(q))
      );
    }

    return rows.sort((a, b) => {
      const va = a[sortField] ?? '';
      const vb = b[sortField] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [historyData, selectedCategory, searchQuery, sortField, sortAsc]);

  // Handle column header clicks to toggle ascending/descending sort
  const handleSort = (field: keyof ReelRecord) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Convert current view into a CSV file for download
  const downloadCsv = () => {
    const headers = ['Reel ID', 'Part Number', 'Parts ID', 'Lot ID', 'Initial Qty', 'Remaining Qty', 'Status', 'Scanned At', 'Last Updated'];
    const lines = [headers.join(',')];

    activeRows.forEach(r => {
      lines.push([
        r.reelId,
        r.partNumber,
        r.partsId,
        r.lotId,
        r.initialQuantity,
        r.remainingQuantity ?? r.initialQuantity,
        r.computedStatus || r.status || 'OK',
        r.scannedAt,
        r.lastUpdated || r.scannedAt
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCategory}_Reel_Inventory.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get active cell value to display in Excel formula bar
  const formulaBarContent = useMemo(() => {
    if (!selectedCell || !activeRows[selectedCell.row]) return '';
    const row = activeRows[selectedCell.row];
    const col = COLUMNS[selectedCell.col];
    if (!col) return '';
    const val = row[col.key as keyof ReelRecord];
    return val !== undefined ? String(val) : '';
  }, [selectedCell, activeRows]);

  if (!activeExcelCategory) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-300 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── TOP RIBBON (EXCEL STYLE) ────────────────────────────────────────── */}
        <div className="bg-[#107C41] text-white px-5 py-3 flex items-center justify-between shadow-md select-none">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center font-bold text-lg">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight">SMT Live Excel Spreadsheet</h2>
                <span className="bg-white/20 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                  .xlsx Engine
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-mono">
                {selectedCategory === 'ALL' ? 'Master Workbook (All Categories)' : `${selectedCategory}.xlsx`} · Synchronized with SMT_DATA/
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download official .xlsx Excel file */}
            <button
              type="button"
              onClick={() => selectedCategory === 'ALL' ? downloadMasterExcel() : downloadCategoryExcel(selectedCategory)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white text-[#107C41] hover:bg-emerald-50 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Download official formatted Excel .xlsx workbook"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .xlsx</span>
            </button>

            {/* Download CSV */}
            <button
              type="button"
              onClick={downloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-800/80 text-white hover:bg-emerald-900 rounded-lg transition-all active:scale-95 cursor-pointer"
              title="Export visible view as CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-300" />
              <span>Export .csv</span>
            </button>

            {/* Close [X] button */}
            <button
              type="button"
              onClick={closeLiveExcel}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── FORMULA BAR & SEARCH CONTROLS ───────────────────────────────────── */}
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 select-none">
          {/* Formula Bar Name Box */}
          <div className="flex items-center gap-2 flex-1">
            <div className="w-14 bg-white border border-gray-300 text-center text-xs font-mono font-bold text-gray-700 py-1 rounded shadow-2xs">
              {selectedCell ? `${COLUMNS[selectedCell.col]?.letter}${selectedCell.row + 1}` : 'A1'}
            </div>
            <div className="text-gray-400 font-serif italic text-sm">fx</div>
            <div className="flex-1 bg-white border border-gray-300 rounded px-3 py-1 text-xs font-mono text-gray-800 shadow-2xs truncate">
              {formulaBarContent || <span className="text-gray-400 font-sans italic">Select any cell to inspect value</span>}
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in sheet..."
              className="w-full pl-8 pr-3 py-1 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-2xs font-mono"
            />
          </div>

          <button
            type="button"
            onClick={loadHistory}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
            title="Reload from backend"
          >
            <RefreshCw className={clsx("w-3 h-3 text-gray-500", isLoading && "animate-spin")} />
            <span>Reload</span>
          </button>
        </div>

        {/* ── SPREADSHEET TABLE GRID ──────────────────────────────────────────── */}
        <div ref={tableBodyRef} className="flex-1 overflow-auto bg-white font-mono text-xs select-none">
          <table className="w-full border-collapse">
            
            {/* Sticky Header with Column Letters & Field Titles */}
            <thead className="sticky top-0 z-10 bg-[#F3F4F6] text-gray-700 border-b border-gray-300 shadow-2xs">
              <tr className="border-b border-gray-200">
                <th className="w-10 bg-gray-200/80 border-r border-gray-300 text-center text-[10px] text-gray-500 font-sans py-1"></th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.letter}
                    onClick={() => handleSort(col.key as keyof ReelRecord)}
                    className={clsx(
                      "px-3 py-1.5 border-r border-gray-300 text-left font-bold text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer group",
                      col.width
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[10px] text-gray-400 font-sans">{col.letter}</span>
                        <span className="text-xs font-sans text-gray-900">{col.header}</span>
                      </div>
                      <ArrowUpDown className="w-3 h-3 text-gray-400 group-hover:text-gray-700 opacity-60 group-hover:opacity-100" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Rows */}
            <tbody className="divide-y divide-gray-200">
              {activeRows.map((reel, rIdx) => {
                const isHighlighted = highlightedReelId === reel.reelId;
                const rowNum = rIdx + 1;

                return (
                  <tr
                    key={`${reel.reelId}-${rIdx}`}
                    className={clsx(
                      "transition-colors",
                      isHighlighted ? "bg-emerald-100/90 font-bold animate-pulse" : (rIdx % 2 === 0 ? "bg-white" : "bg-gray-50/70"),
                      "hover:bg-blue-50/60"
                    )}
                  >
                    {/* Row Number */}
                    <td className="w-10 bg-gray-100/80 border-r border-gray-300 text-center text-[11px] text-gray-500 font-mono py-1.5 select-none">
                      {rowNum}
                    </td>

                    {/* Cell Values */}
                    {COLUMNS.map((col, cIdx) => {
                      const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
                      let cellVal: any = reel[col.key as keyof ReelRecord];

                      if (col.key === 'initialQuantity' || col.key === 'remainingQuantity') {
                        cellVal = Number(cellVal || 0).toLocaleString();
                      } else if (col.key === 'status') {
                        cellVal = reel.computedStatus || reel.status || 'OK';
                      }

                      return (
                        <td
                          key={col.key}
                          onClick={() => setSelectedCell({ row: rIdx, col: cIdx })}
                          className={clsx(
                            "px-3 py-1.5 border-r border-gray-200 text-xs truncate",
                            col.width,
                            col.align === 'right' && 'text-right font-mono',
                            col.align === 'center' && 'text-center',
                            isSelected && "outline-2 outline-emerald-600 bg-emerald-50/50 z-10"
                          )}
                        >
                          {col.key === 'status' ? (
                            <span className={clsx(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                              String(cellVal).toLowerCase() === 'critical' ? "bg-red-100 text-red-700" :
                              String(cellVal).toLowerCase() === 'warning' ? "bg-amber-100 text-amber-800" :
                              "bg-emerald-100 text-emerald-800"
                            )}>
                              {cellVal}
                            </span>
                          ) : col.key === 'reelId' ? (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-blue-700">{cellVal}</span>
                              {rIdx === 0 && (
                                <span className="bg-blue-100 text-blue-800 text-[9px] px-1 py-0.2 rounded font-sans uppercase font-bold">Latest</span>
                              )}
                            </div>
                          ) : (
                            String(cellVal ?? '')
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {activeRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="py-16 text-center text-gray-400 font-sans">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="font-bold">No reel scan records found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {selectedCategory === 'ALL'
                        ? 'Scan a QR code to record your first inventory reel'
                        : `No reels scanned yet for category "${selectedCategory}"`}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── BOTTOM EXCEL SHEET TABS ────────────────────────────────────────── */}
        <div className="bg-gray-100 border-t border-gray-300 px-3 py-1.5 flex items-center justify-between gap-2 select-none overflow-x-auto">
          <div className="flex items-center gap-1">
            {/* Master Sheet Tab */}
            <button
              type="button"
              onClick={() => { setSelectedCategory('ALL'); setSelectedCell(null); }}
              className={clsx(
                "px-3 py-1 text-xs font-bold rounded-t-md border-t border-l border-r transition-all cursor-pointer",
                selectedCategory === 'ALL'
                  ? "bg-white text-[#107C41] border-gray-300 border-b-2 border-b-white shadow-2xs font-extrabold"
                  : "bg-gray-200/80 text-gray-600 border-transparent hover:bg-gray-200"
              )}
            >
              Master All Sheets
            </button>

            {/* Category Tabs from MASTER.json */}
            {masterConfig && Object.entries(masterConfig.componentTypes).map(([type, meta]) => {
              const isActive = selectedCategory === type;
              const count = (historyData[type] || []).length;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setSelectedCategory(type); setSelectedCell(null); }}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-t-md border-t border-l border-r transition-all cursor-pointer",
                    isActive
                      ? "bg-white border-gray-300 border-b-2 border-b-white shadow-2xs font-extrabold"
                      : "bg-gray-200/80 text-gray-600 border-transparent hover:bg-gray-200"
                  )}
                  style={isActive ? { color: meta.color || '#107C41' } : {}}
                >
                  <span>{meta.label}</span>
                  {count > 0 && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded-full font-mono">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Real-time Status Indicator */}
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono shrink-0 pr-2">
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Live Socket Sync
            </span>
            <span>{activeRows.length} Rows</span>
          </div>
        </div>

      </div>
    </div>
  );
}
