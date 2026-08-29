import { create } from 'zustand';
import type { SmtComponent, SmtLine, ReplenishmentEvent, StatusFilterType, CategoryInventory, MasterConfig, HeaderAlert } from '../types';

interface SmtState {
  activeLineId: string;
  lines: Record<string, SmtLine>;
  components: Record<string, SmtComponent>;
  
  // Search & Filter
  searchQuery: string;
  statusFilter: StatusFilterType;
  
  // Replenishment Log
  replenishmentEvents: ReplenishmentEvent[];
  
  // Settings & Modals
  soundAlertEnabled: boolean;
  isReplenishmentModalOpen: boolean;
  isCsvInspectorOpen: boolean;

  // ── HEADER WARNING / ALERT ───────────────────────────────────
  headerAlert: HeaderAlert | null;

  // ── REEL INVENTORY (JSON-driven) ──────────────────────────────
  /** Full reel inventory keyed by component type (e.g. "RESISTOR") */
  reelInventory: Record<string, CategoryInventory>;
  /** Parsed MASTER.json — defines which types exist and their metadata */
  masterConfig: MasterConfig | null;
  /** Whether the reel inventory is loading from the backend */
  isReelInventoryLoading: boolean;

  // ── LIVE EXCEL VIEWER MODAL ───────────────────────────────────
  isLiveExcelOpen: boolean;
  liveExcelCategory: string; // 'ALL' or componentType like 'CAPACITOR'

  // Actions
  setActiveLine: (lineId: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: StatusFilterType) => void;
  toggleSoundAlert: () => void;
  setIsReplenishmentModalOpen: (open: boolean) => void;
  setIsCsvInspectorOpen: (open: boolean) => void;
  setHeaderAlert: (alert: HeaderAlert | null) => void;
  clearHeaderAlert: () => void;

  updateInventoryBatch: (newComponents: SmtComponent[]) => void;
  updateLineStatus: (lineId: string, status: SmtLine['connection_status']) => void;
  updateLinesData: (linesArray: SmtLine[]) => void;
  
  addReplenishmentEvent: (event: ReplenishmentEvent) => void;
  setReplenishmentHistory: (events: ReplenishmentEvent[]) => void;

  // ── REEL INVENTORY ACTIONS ────────────────────────────────────
  /** Set the full inventory snapshot (called on initial load or full refresh) */
  setReelInventory: (inventory: Record<string, CategoryInventory>) => void;
  /** Update a single category (called when socket emits reel_inventory_update) */
  updateReelCategory: (categoryData: CategoryInventory) => void;
  /** Set master config loaded from /api/config/master */
  setMasterConfig: (config: MasterConfig) => void;
  setIsReelInventoryLoading: (loading: boolean) => void;

  // ── LIVE EXCEL ACTIONS ────────────────────────────────────────
  openLiveExcel: (category?: string) => void;
  closeLiveExcel: () => void;
  setLiveExcelCategory: (category: string) => void;
}

export const useSmtStore = create<SmtState>((set) => ({
  activeLineId: 'line_1',
  lines: {
    'line_1': { id: 'line_1', name: 'SMT Line 1', connection_status: 'offline', last_updated: Date.now() },
    'line_2': { id: 'line_2', name: 'SMT Line 2', connection_status: 'offline', last_updated: Date.now() },
    'line_3': { id: 'line_3', name: 'SMT Line 3', connection_status: 'offline', last_updated: Date.now() },
    'line_4': { id: 'line_4', name: 'SMT Line 4', connection_status: 'offline', last_updated: Date.now() }
  },
  components: {},
  
  searchQuery: '',
  statusFilter: 'all',
  replenishmentEvents: [],
  soundAlertEnabled: true,
  isReplenishmentModalOpen: false,
  isCsvInspectorOpen: false,

  // Header Warning / Alert initial state
  headerAlert: null,

  // Reel inventory initial state
  reelInventory: {},
  masterConfig: null,
  isReelInventoryLoading: false,

  // Live Excel initial state
  isLiveExcelOpen: false,
  liveExcelCategory: 'ALL',

  setActiveLine: (lineId) => set({ activeLineId: lineId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  toggleSoundAlert: () => set((state) => ({ soundAlertEnabled: !state.soundAlertEnabled })),
  setIsReplenishmentModalOpen: (open) => set({ isReplenishmentModalOpen: open }),
  setIsCsvInspectorOpen: (open) => set({ isCsvInspectorOpen: open }),
  setHeaderAlert: (alert) => set({ headerAlert: alert }),
  clearHeaderAlert: () => set({ headerAlert: null }),

  updateLinesData: (incomingLines) => set((state) => {
    const updatedLines = { ...state.lines };
    incomingLines.forEach(line => {
      updatedLines[line.id] = { ...updatedLines[line.id], ...line, last_updated: Date.now() };
    });
    return { lines: updatedLines };
  }),

  updateInventoryBatch: (newComponents) => set((state) => {
    const updatedComponents = { ...state.components };
    newComponents.forEach((comp) => {
      const uniqueKey = `${comp.line_id}-${comp.feeder_position}`;
      updatedComponents[uniqueKey] = comp;
    });
    return { components: updatedComponents };
  }),

  updateLineStatus: (lineId, status) => set((state) => ({
    lines: { ...state.lines, [lineId]: { ...state.lines[lineId], connection_status: status } }
  })),

  addReplenishmentEvent: (event) => set((state) => ({
    replenishmentEvents: [event, ...state.replenishmentEvents.filter(e => e.id !== event.id)].slice(0, 100)
  })),

  setReplenishmentHistory: (events) => set({ replenishmentEvents: events }),

  // ── REEL INVENTORY ACTIONS ────────────────────────────────────
  setReelInventory: (inventory) => set({ reelInventory: inventory }),

  updateReelCategory: (categoryData) => set((state) => ({
    reelInventory: {
      ...state.reelInventory,
      [categoryData.componentType]: categoryData
    }
  })),

  setMasterConfig: (config) => set({ masterConfig: config }),
  setIsReelInventoryLoading: (loading) => set({ isReelInventoryLoading: loading }),

  // ── LIVE EXCEL ACTIONS ────────────────────────────────────────
  openLiveExcel: (category = 'ALL') => set({ isLiveExcelOpen: true, liveExcelCategory: category }),
  closeLiveExcel: () => set({ isLiveExcelOpen: false }),
  setLiveExcelCategory: (category) => set({ liveExcelCategory: category }),
}));