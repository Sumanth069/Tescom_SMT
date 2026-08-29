// Live SMT Feeder Inventory Table
// -------------------------------------------------------------
// This component renders the table of pick-and-place feeder slots:
// 1. High Performance Virtualization (@tanstack/react-virtual):
//    Renders hundreds of feeder rows smoothly with zero browser lag.
// 2. Multi-Criteria Sorting: Feeder slot number, time remaining, health status, quantity, speed, or part number.
// 3. Dynamic Depletion Warnings: Formats seconds into human-readable minutes and seconds ("2m 15s").

import { useMemo, useRef, useState } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownUp, SearchX } from 'lucide-react';
import type { SmtComponent } from '../../types';
import clsx from 'clsx';

// Available sorting choices
type SortOption = 'feeder' | 'part_number' | 'quantity' | 'speed' | 'time_left' | 'status';

const columnHelper = createColumnHelper<SmtComponent>();

// Formats duration into minutes and seconds (e.g. "2m 15s")
const formatTime = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return <span className="text-gray-400 italic">Calculating...</span>;
  if (seconds === 0) return "Depleted";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
};

// Table column layout configuration
const columns = [
  columnHelper.accessor('feeder_position', { header: 'Feeder', cell: info => <span className="font-mono text-sm font-bold text-gray-700">{info.getValue()}</span> }),
  columnHelper.accessor('part_number', { header: 'Part Number', cell: info => <span className="font-bold text-gray-900">{info.getValue()}</span> }),
  columnHelper.accessor('description', { header: 'Description', cell: info => <span className="text-xs text-gray-500 max-w-[180px] truncate">{info.getValue()}</span> }),
  columnHelper.accessor('current_quantity', { header: 'Quantity', cell: info => <span className="font-mono font-bold text-gray-900">{info.getValue().toLocaleString()}</span> }),
  columnHelper.accessor('parts_per_second', {
    header: 'Speed',
    cell: info => {
      const val = info.getValue();
      return val ? <span className="font-mono text-xs text-gray-600">{val.toFixed(1)} pts/s</span> : <span className="text-gray-400">-</span>;
    }
  }),
  columnHelper.accessor('time_left_seconds', {
    header: 'Time Remaining',
    cell: info => {
      const seconds = info.getValue();
      const status = info.row.original.status;
      return (
        <span className={clsx(
          "font-mono font-bold text-sm",
          status === 'critical' ? "text-red-600" : status === 'warning' ? "text-yellow-600" : "text-gray-800"
        )}>
          {formatTime(seconds)}
        </span>
      );
    }
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: info => {
      const status = info.getValue();
      return (
        <span className={clsx(
          "px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
          status === 'ok' ? 'bg-green-100 text-green-700' :
          status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-700 ring-2 ring-red-500/20'
        )}>
          {status}
        </span>
      );
    }
  })
];

// Main Feeder Inventory Table Component:
// Renders the virtualized feeder list with multi-column sorting, depletion countdowns, and health tags.
export function ComponentTable() {
  const activeLineId = useSmtStore((state) => state.activeLineId);
  const componentsDict = useSmtStore((state) => state.components);
  const searchQuery = useSmtStore((state) => state.searchQuery);
  const statusFilter = useSmtStore((state) => state.statusFilter);

  const [sortBy, setSortBy] = useState<SortOption>('feeder');

  // Filter and sort the feeder list for the active line
  const data = useMemo(() => {
    const rawList = Object.values(componentsDict).filter((comp) => comp.line_id === activeLineId);

    // Apply Search & Status Filters
    const filtered = rawList.filter((comp) => {
      if (statusFilter !== 'all' && comp.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesFeeder = comp.feeder_position.toLowerCase().includes(q);
        const matchesPart = comp.part_number.toLowerCase().includes(q);
        const matchesDesc = comp.description.toLowerCase().includes(q);
        if (!matchesFeeder && !matchesPart && !matchesDesc) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'feeder':
          const numA = parseInt(a.feeder_position.replace(/\D/g, '') || '0', 10);
          const numB = parseInt(b.feeder_position.replace(/\D/g, '') || '0', 10);
          return numA - numB;

        case 'part_number':
          return a.part_number.localeCompare(b.part_number);

        case 'quantity':
          return a.current_quantity - b.current_quantity;

        case 'speed':
          return (b.parts_per_second || 0) - (a.parts_per_second || 0);

        case 'status':
          const statusWeight = { critical: 1, warning: 2, ok: 3 };
          return statusWeight[a.status] - statusWeight[b.status];

        case 'time_left':
        default:
          if (a.time_left_seconds == null && b.time_left_seconds != null) return 1;
          if (b.time_left_seconds == null && a.time_left_seconds != null) return -1;
          if (a.time_left_seconds == null && b.time_left_seconds == null) return 0;
          return a.time_left_seconds! - b.time_left_seconds!;
      }
    });
  }, [componentsDict, activeLineId, sortBy, searchQuery, statusFilter]);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();

  // High performance DOM row virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  if (Object.values(componentsDict).filter(c => c.line_id === activeLineId).length === 0) {
    return <div className="p-12 text-center text-gray-500 bg-white rounded-xl shadow border border-gray-200">Waiting for machine data from {activeLineId}...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      {/* Sorting Toolbar */}
      <div className="px-6 py-3.5 border-b border-gray-200 bg-gray-50 flex justify-between items-center gap-3">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Showing {data.length} feeder components
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Order By:</span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none bg-white border border-gray-300 text-gray-800 py-1.5 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-xs cursor-pointer hover:bg-gray-50"
            >
              <option value="feeder">Feeder (Chronological)</option>
              <option value="time_left">Time Remaining (Critical First)</option>
              <option value="status">Status (Critical First)</option>
              <option value="quantity">Quantity (Lowest First)</option>
              <option value="speed">Consumption Speed (Fastest First)</option>
              <option value="part_number">Part Number (A-Z)</option>
            </select>
            <ArrowDownUp className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-white flex flex-col items-center justify-center">
          <SearchX className="w-10 h-10 text-gray-300 mb-2" />
          <p className="font-bold text-gray-700">No matching feeder components found</p>
          <p className="text-xs text-gray-400 mt-1">Try clearing your search query or adjusting status filters.</p>
        </div>
      ) : (
        <div ref={tableContainerRef} className="max-h-[600px] overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white sticky top-0 z-10 shadow-sm flex w-full">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="flex w-full">
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="flex-1 px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody style={{ display: 'block', height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const row = rows[virtualRow.index];
                return (
                  <tr
                    key={row.id}
                    className="flex w-full hover:bg-gray-50 transition-colors border-b border-gray-100 absolute left-0 top-0"
                    style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="flex-1 px-6 flex items-center">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}