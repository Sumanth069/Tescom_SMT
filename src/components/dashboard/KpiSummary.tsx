// Floor KPI Metrics Summary Banner
// -------------------------------------------------------------
// This banner shows key factory metrics at a glance:
// 1. Active Feeders: Total feeder slots currently active on the selected line.
// 2. Critical Alerts: Feeders that will run empty in less than 30 seconds (flashing beacon).
// 3. Warnings: Feeders that will run empty in less than 90 seconds.
// 4. Line Speed: Combined placement rate of the line in parts per second (pts/s).
// 5. Reel Reloads: Total times reels were replenished on this line (clicks to open log).

import { useMemo } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import { AlertTriangle, AlertCircle, Layers, Zap, RefreshCw } from 'lucide-react';

// Main Floor KPI Summary Component:
// Computes and renders top statistics cards for active feeders, critical alerts, warnings, and speed.
export function KpiSummary() {
  const activeLineId = useSmtStore((state) => state.activeLineId);
  const componentsDict = useSmtStore((state) => state.components);
  const replenishmentEvents = useSmtStore((state) => state.replenishmentEvents);
  const setIsReplenishmentModalOpen = useSmtStore((state) => state.setIsReplenishmentModalOpen);

  // Calculate live summary totals for the selected line
  const metrics = useMemo(() => {
    const lineComponents = Object.values(componentsDict).filter(
      (comp) => comp.line_id === activeLineId
    );

    let criticalCount = 0;
    let warningCount = 0;
    let okCount = 0;
    let totalSpeed = 0;

    lineComponents.forEach((comp) => {
      if (comp.status === 'critical') criticalCount++;
      else if (comp.status === 'warning') warningCount++;
      else okCount++;

      if (comp.parts_per_second && comp.parts_per_second > 0) {
        totalSpeed += comp.parts_per_second;
      }
    });

    const lineReplenishments = replenishmentEvents.filter(
      (e) => e.line_id === activeLineId
    ).length;

    return {
      totalFeeders: lineComponents.length,
      criticalCount,
      warningCount,
      okCount,
      totalSpeed,
      lineReplenishments
    };
  }, [componentsDict, activeLineId, replenishmentEvents]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Active Feeders Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Feeders</p>
          <h3 className="text-2xl font-extrabold text-gray-900 mt-1">{metrics.totalFeeders}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Tracked on current line</p>
        </div>
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
          <Layers className="w-6 h-6" />
        </div>
      </div>

      {/* 2. Critical Alerts Card */}
      <div className={`border rounded-xl p-4 shadow-sm flex items-center justify-between transition-all ${
        metrics.criticalCount > 0
          ? 'bg-red-50/80 border-red-200 ring-2 ring-red-500/20'
          : 'bg-white border-gray-200'
      }`}>
        <div>
          <p className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
            {metrics.criticalCount > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
            Critical (&lt;30s)
          </p>
          <h3 className="text-2xl font-extrabold text-red-600 mt-1">{metrics.criticalCount}</h3>
          <p className="text-xs text-red-500/80 mt-0.5">Immediate refill required</p>
        </div>
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center font-bold">
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>

      {/* 3. Warnings Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-yellow-600 uppercase tracking-wider">Warnings (&lt;90s)</p>
          <h3 className="text-2xl font-extrabold text-yellow-600 mt-1">{metrics.warningCount}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Prepare replacement reels</p>
        </div>
        <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-xl flex items-center justify-center font-bold">
          <AlertCircle className="w-6 h-6" />
        </div>
      </div>

      {/* 4. Line Placement Speed Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Line Speed</p>
          <h3 className="text-2xl font-extrabold text-gray-900 mt-1 font-mono">
            {metrics.totalSpeed.toFixed(1)} <span className="text-xs font-sans text-gray-500">parts/s</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Aggregated consumption</p>
        </div>
        <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center font-bold">
          <Zap className="w-6 h-6" />
        </div>
      </div>

      {/* 5. Replenishments Counter Card */}
      <button
        onClick={() => setIsReplenishmentModalOpen(true)}
        className="bg-white border border-gray-200 hover:border-blue-300 rounded-xl p-4 shadow-sm flex items-center justify-between text-left group transition-all cursor-pointer"
      >
        <div>
          <p className="text-xs font-bold text-blue-600 group-hover:text-blue-700 uppercase tracking-wider flex items-center gap-1">
            Reel Reloads
          </p>
          <h3 className="text-2xl font-extrabold text-gray-900 mt-1">{metrics.lineReplenishments}</h3>
          <p className="text-xs text-blue-500 font-medium mt-0.5 group-hover:underline">View activity log &rarr;</p>
        </div>
        <div className="w-12 h-12 bg-blue-50 text-blue-600 group-hover:bg-blue-100 rounded-xl flex items-center justify-center font-bold transition-colors">
          <RefreshCw className="w-6 h-6" />
        </div>
      </button>
    </div>
  );
}
