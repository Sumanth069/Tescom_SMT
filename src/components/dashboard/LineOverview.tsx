// SMT Production Line Switcher & Connection Status Dropdown
// -------------------------------------------------------------
// This component lets operators switch between production lines:
// 1. Line Dropdown: Switch active view between Line 1, Line 2, Line 3, and Line 4.
// 2. Status Badge: Displays connection status (online, stale, offline).
// 3. ERP Hover Card: Hovering over any line reveals customer name, target PCB batch count,
//    deadline, and whether the job is on schedule or behind schedule.

import { useState, useRef, useEffect } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import { Activity, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

// Main Line Switcher Component:
// Renders the header dropdown allowing operators to switch between production lines.
export function LineOverview() {
  const lines = useSmtStore((state) => state.lines);
  const activeLineId = useSmtStore((state) => state.activeLineId);
  const setActiveLine = useSmtStore((state) => state.setActiveLine);

  // Dropdown open/close state
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Currently selected line
  const activeLine = lines[activeLineId];

  // Close dropdown menu if user clicks outside of it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Subcomponent: Renders connection health status pill (online, stale, offline)
  const StatusBadge = ({ status }: { status: string }) => (
    <div className={clsx(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
      status === 'online' ? "bg-green-100 text-green-700" :
      status === 'stale' ? "bg-yellow-100 text-yellow-700" :
      "bg-red-100 text-red-700"
    )}>
      {status === 'online' && <CheckCircle2 className="w-3.5 h-3.5" />}
      {status === 'stale' && <Activity className="w-3.5 h-3.5" />}
      {status === 'offline' && <AlertCircle className="w-3.5 h-3.5" />}
      <span className="capitalize">{status}</span>
    </div>
  );

  if (!activeLine) return null;

  return (
    <div className="relative w-full md:w-96 z-40" ref={dropdownRef}>
      {/* 1. Dropdown Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:border-gray-300 transition-all flex items-center justify-between outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        <div className="flex flex-col items-start">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Current Line</span>
          <h3 className="text-lg font-bold text-gray-900">{activeLine.name}</h3>
        </div>
        <div className="flex items-center gap-4">
          <StatusBadge status={activeLine.connection_status} />
          <ChevronDown className={clsx("w-5 h-5 text-gray-400 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </button>

      {/* 2. Dropdown Menu List */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-visible">
          {Object.values(lines).map((line) => {
            const erpData = line.erp_data;
            const isSelected = activeLineId === line.id;

            return (
              <button
                key={line.id}
                onClick={() => {
                  setActiveLine(line.id);
                  setIsOpen(false);
                }}
                className={clsx(
                  "group relative w-full text-left p-4 transition-colors flex items-center justify-between outline-none focus:bg-gray-50 first:rounded-t-xl last:rounded-b-xl border-b last:border-b-0 border-gray-100 cursor-pointer",
                  isSelected ? "bg-blue-50" : "hover:bg-gray-50 bg-white"
                )}
              >
                <div>
                  <h3 className={clsx("font-bold", isSelected ? "text-blue-900" : "text-gray-800")}>{line.name}</h3>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">ID: {line.id}</p>
                </div>

                <StatusBadge status={line.connection_status} />

                {/* 3. ERP Hover Info Card (Pops out to the right) */}
                {erpData && (
                  <div className="absolute top-0 left-full ml-2 w-[280px] p-4 bg-gray-900 text-gray-100 text-sm rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none border border-gray-700 flex flex-col gap-1.5">
                    <div className="text-xs font-bold text-gray-400 mb-1 border-b border-gray-700 pb-2 uppercase tracking-wider">Order Details</div>
                    <div className="flex justify-between"><span className="text-gray-400">Customer:</span> <span className="font-bold text-white">{erpData.customer}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Ordered:</span> <span>{erpData.ordered_pcbs.toLocaleString()} PCBs</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Completed:</span> <span>{erpData.completed_pcbs.toLocaleString()} PCBs</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Deadline:</span> <span>{erpData.deadline}</span></div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-gray-400">Expected:</span>
                      <div className="flex flex-col items-end">
                        <span>{erpData.expected_finish}</span>
                        <span className={clsx(
                          "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1",
                          erpData.schedule_status === 'ahead of schedule' ? 'bg-green-500/20 text-green-400' :
                          erpData.schedule_status === 'behind schedule' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        )}>{erpData.schedule_status}</span>
                      </div>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}