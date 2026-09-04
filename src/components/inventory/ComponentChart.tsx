// Responsive Bar Chart Visualization for SMT Feeders
// -------------------------------------------------------------
// This component displays feeder stock levels as an interactive bar chart:
// 1. Recharts Bar Chart: Displays how many parts are left across all feeders on the line.
// 2. Dynamic Color Coding:
//    - Blue: Normal stock levels.
//    - Amber/Yellow: Warning levels (approaching low stock threshold).
//    - Red: Critical levels (< 30s left or empty).
// 3. Hover Tooltip: Shows feeder slot, part number, description, quantity, placement rate,
//    and estimated time remaining when hovering over any bar.

import { useMemo, useState } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ArrowDownUp, SearchX } from 'lucide-react';

type SortOption = 'feeder' | 'part_number' | 'quantity' | 'speed' | 'time_left' | 'status';

// Main Feeder Bar Chart Component:
// Renders responsive Recharts bars with color-coded depletion levels and interactive tooltips.
export function ComponentChart() {
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
      if (statusFilter !== 'all' && comp.status !== statusFilter) return false;
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

  if (Object.values(componentsDict).filter(c => c.line_id === activeLineId).length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-[600px] flex items-center justify-center text-gray-500">
        Waiting for machine data from {activeLineId}...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      {/* Sorting Toolbar */}
      <div className="px-6 py-3.5 border-b border-gray-200 bg-gray-50 flex justify-between items-center gap-3">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Rendering {data.length} feeder bars
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Order Bars By:</span>
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
        <div className="p-12 text-center text-gray-500 bg-white h-[500px] flex flex-col items-center justify-center">
          <SearchX className="w-10 h-10 text-gray-300 mb-2" />
          <p className="font-bold text-gray-700">No matching feeder bars to display</p>
          <p className="text-xs text-gray-400 mt-1">Try clearing search filters.</p>
        </div>
      ) : (
        <div className="p-4 h-[600px] w-full bg-white">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
              <XAxis
                dataKey="feeder_position"
                angle={-45}
                textAnchor="end"
                interval="preserveStartEnd"
                minTickGap={20}
                tick={{ fontSize: 12, fill: '#6b7280' }}
              />
              <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />

              <Tooltip
                cursor={{ fill: '#f3f4f6' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-gray-900 text-white p-3.5 rounded-xl shadow-2xl text-xs border border-gray-700 z-50 relative min-w-[200px]">
                        <p className="font-bold font-mono text-sm border-b border-gray-700 pb-1 mb-1 text-blue-400">{item.feeder_position}</p>
                        <p className="text-gray-300 font-bold mb-1">{item.part_number}</p>
                        <p className="text-gray-400 mb-2 text-[11px]">{item.description}</p>
                        <div className="space-y-1 font-mono text-gray-200">
                          <p>Quantity: <span className="font-bold text-white">{item.current_quantity.toLocaleString()}</span></p>
                          {item.parts_per_second != null && (
                            <p>Speed: <span className="font-bold text-green-400">{item.parts_per_second.toFixed(1)} pts/s</span></p>
                          )}
                          {item.time_left_seconds !== null && item.time_left_seconds !== undefined ? (
                            <p>Time Left: <span className="font-bold text-blue-300">{Math.floor(item.time_left_seconds / 60)}m {Math.floor(item.time_left_seconds % 60)}s</span></p>
                          ) : (
                            <p>Time Left: <span className="text-gray-400 italic">Calculating...</span></p>
                          )}
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-gray-800 flex justify-between items-center">
                          <span className="text-gray-400 text-[10px] uppercase font-bold">Status</span>
                          <span className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.status === 'ok' ? 'bg-green-500/20 text-green-400' :
                            item.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                          }`}>{item.status}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Bar dataKey="current_quantity" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.status === 'critical' ? '#ef4444' :
                      entry.status === 'warning' ? '#eab308' :
                      '#3b82f6'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}