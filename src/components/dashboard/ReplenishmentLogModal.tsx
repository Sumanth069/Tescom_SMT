// Feeder Reel Reload Audit Trail Modal
// -------------------------------------------------------------
// This modal shows the history of all feeder reloads on the factory floor:
// 1. Automatic Logging: Whenever an operator replaces a low or empty reel,
//    the backend detects the sudden increase in quantity and logs a timestamped event.
// 2. Event Details: Shows Feeder Slot, Line ID, Part Number, quantity added, and time.
// 3. Search & Filter: Filter by part number/feeder, or check "Show current line only".

import { useState } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import { X, RefreshCw, Search, Calendar, PackageCheck, Layers } from 'lucide-react';

// Main Reel Replenishment Audit Modal Component:
// Shows an audit trail of every time a feeder was reloaded with a new component reel.
export function ReplenishmentLogModal() {
  const isOpen = useSmtStore((state) => state.isReplenishmentModalOpen);
  const setIsOpen = useSmtStore((state) => state.setIsReplenishmentModalOpen);
  const replenishmentEvents = useSmtStore((state) => state.replenishmentEvents);
  const activeLineId = useSmtStore((state) => state.activeLineId);

  const [filterText, setFilterText] = useState('');
  const [showCurrentLineOnly, setShowCurrentLineOnly] = useState(false);

  if (!isOpen) return null;

  // Filter log entries by search text or line filter
  const filteredEvents = replenishmentEvents.filter((e) => {
    if (showCurrentLineOnly && e.line_id !== activeLineId) return false;
    if (!filterText) return true;
    const term = filterText.toLowerCase();
    return (
      e.feeder_position.toLowerCase().includes(term) ||
      e.part_number.toLowerCase().includes(term) ||
      e.line_id.toLowerCase().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">

        {/* Modal Header */}
        <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Reel Replenishment History</h3>
              <p className="text-xs text-gray-400">Live activity log of feeder reel reloads</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Line Filter Bar */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter log entries..."
              className="w-full bg-white border border-gray-300 text-sm rounded-lg pl-9 pr-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer self-start sm:self-auto">
            <input
              type="checkbox"
              checked={showCurrentLineOnly}
              onChange={(e) => setShowCurrentLineOnly(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            Show current line ({activeLineId}) only
          </label>
        </div>

        {/* List of Reload Events */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-gray-500 flex flex-col items-center justify-center">
              <PackageCheck className="w-12 h-12 text-gray-300 mb-2" />
              <p className="font-bold text-gray-700">No Replenishment Events Recorded Yet</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                When machine operators reload depleted component reels, the system automatically detects the quantity increase and logs it here.
              </p>
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-colors flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 text-green-700 rounded-xl flex items-center justify-center font-bold text-sm">
                    +{(evt.replenished_amount / 1000).toFixed(1)}k
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gray-900 text-sm">{evt.feeder_position}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Layers className="w-3 h-3" /> {evt.line_id}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 font-medium">
                      Part: <span className="font-bold text-gray-800">{evt.part_number}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-200">
                    +{evt.replenished_amount.toLocaleString()} parts
                  </span>
                  <div className="flex items-center justify-end gap-1 text-[11px] text-gray-400 mt-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
          <span>Total Logged Events: {filteredEvents.length}</span>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-1.5 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Close Log
          </button>
        </div>

      </div>
    </div>
  );
}
