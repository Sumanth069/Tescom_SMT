// Global State Store (Zustand)
// -------------------------------------------------------------
// This store holds the main frontend application state:
// 1. Live feeder inventory for all 4 SMT lines.
// 2. Scanned barcode reel records and MASTER.json catalog.
// 3. User search terms, status filters, and audio mute settings.
// 4. Modal popup states (Live Excel, Replenishment Log, CSV Inspector).
// 5. Header alert messages and alarms.

import { create } from 'zustand';
import type {
  SmtComponent,
  SmtLine,
  ReplenishmentEvent,
  StatusFilterType,
  CategoryReelData,
  MasterConfig,
  HeaderAlert
} from '../types';

interface SmtStore {
  // Live SMT Floor State
  activeLineId: string;
  lines: Record<string, SmtLine>;
  components: Record<string, SmtComponent>;
  replenishmentEvents: ReplenishmentEvent[];

  // Filter & Search Controls
  searchQuery: string;
  statusFilter: StatusFilterType;
  soundAlertEnabled: boolean;

  // Dialog & Modal Popups
  isReplenishmentModalOpen: boolean;
  isCsvInspectorOpen: boolean;

  // Barcode Reel Inventory
  masterConfig: MasterConfig | null;
  reelInventory: Record<string, CategoryReelData>;
  isReelInventoryLoading: boolean;
  activeExcelCategory: string | null;

  // Header Warning Banner & Audio Alarms
  activeHeaderAlert: HeaderAlert | null;

  // Store Actions (Functions to change state)
  setActiveLine: (lineId: string) => void;
  updateLines: (linesData: SmtLine[]) => void;
  updateComponentsBatch: (componentsBatch: SmtComponent[]) => void;
  addReplenishmentEvent: (event: ReplenishmentEvent) => void;
  setReplenishmentHistory: (events: ReplenishmentEvent[]) => void;

  setSearchQuery: (q: string) => void;
  setStatusFilter: (filter: StatusFilterType) => void;
  toggleSoundAlert: () => void;

  setIsReplenishmentModalOpen: (open: boolean) => void;
  setIsCsvInspectorOpen: (open: boolean) => void;

  setMasterConfig: (config: MasterConfig) => void;
  setReelInventoryFull: (data: Record<string, CategoryReelData>) => void;
  updateCategoryReels: (data: CategoryReelData) => void;
  setReelInventoryLoading: (loading: boolean) => void;

  openLiveExcel: (category?: string) => void;
  closeLiveExcel: () => void;

  setActiveHeaderAlert: (alert: HeaderAlert | null) => void;
  clearHeaderAlert: () => void;
}

export const useSmtStore = create<SmtStore>((set) => ({
  // Default values at startup
  activeLineId: 'line_1',
  lines: {
    line_1: { id: 'line_1', name: 'SMT Line 1 (YSM20R)', connection_status: 'online' },
    line_2: { id: 'line_2', name: 'SMT Line 2', connection_status: 'online' },
    line_3: { id: 'line_3', name: 'SMT Line 3', connection_status: 'online' },
    line_4: { id: 'line_4', name: 'SMT Line 4', connection_status: 'online' },
  },
  components: {},
  replenishmentEvents: [],

  searchQuery: '',
  statusFilter: 'all',
  soundAlertEnabled: true,

  isReplenishmentModalOpen: false,
  isCsvInspectorOpen: false,

  masterConfig: null,
  reelInventory: {},
  isReelInventoryLoading: true,
  activeExcelCategory: null,

  activeHeaderAlert: null,

  // Change which production line is selected in the dropdown
  setActiveLine: (lineId) => set({ activeLineId: lineId }),

  // Update customer order info received from the server
  updateLines: (linesData) => set((state) => {
    const updated = { ...state.lines };
    linesData.forEach((l) => {
      if (updated[l.id]) {
        updated[l.id] = { ...updated[l.id], ...l };
      } else {
        updated[l.id] = l;
      }
    });
    return { lines: updated };
  }),

  // Merge in a fresh batch of feeder updates from the machine
  updateComponentsBatch: (componentsBatch) => set((state) => {
    const updated = { ...state.components };
    componentsBatch.forEach((c) => {
      const key = `${c.line_id}_${c.feeder_position}`;
      updated[key] = c;
    });
    return { components: updated };
  }),

  // Add a newly logged reload event to the top of the history list
  addReplenishmentEvent: (event) => set((state) => {
    const exists = state.replenishmentEvents.some(e => e.id === event.id);
    if (exists) return state;
    return { replenishmentEvents: [event, ...state.replenishmentEvents].slice(0, 100) };
  }),

  // Load the initial list of recent reload events
  setReplenishmentHistory: (events) => set({ replenishmentEvents: events }),

  // Update the search bar text
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  // Change the status filter (All, Critical, Warning, OK)
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  // Toggle speaker audio on/off
  toggleSoundAlert: () => set((state) => ({ soundAlertEnabled: !state.soundAlertEnabled })),

  // Open or close the reel reload history dialog
  setIsReplenishmentModalOpen: (isReplenishmentModalOpen) => set({ isReplenishmentModalOpen }),

  // Open or close the CSV diagnostic inspector
  setIsCsvInspectorOpen: (isCsvInspectorOpen) => set({ isCsvInspectorOpen }),

  // Save the MASTER.json catalog
  setMasterConfig: (masterConfig) => set({ masterConfig }),

  // Save the complete category inventory
  setReelInventoryFull: (reelInventory) => set({ reelInventory, isReelInventoryLoading: false }),

  // Update a single category when a new barcode is scanned
  updateCategoryReels: (data) => set((state) => ({
    reelInventory: {
      ...state.reelInventory,
      [data.componentType]: data
    }
  })),

  // Set loading state spinner
  setReelInventoryLoading: (isReelInventoryLoading) => set({ isReelInventoryLoading }),

  // Open the interactive Live Excel spreadsheet modal
  openLiveExcel: (category = 'ALL') => set({ activeExcelCategory: category }),

  // Close the Live Excel spreadsheet modal
  closeLiveExcel: () => set({ activeExcelCategory: null }),

  // Show a floating low-stock or reload alert banner
  setActiveHeaderAlert: (alert) => set({ activeHeaderAlert: alert }),

  // Dismiss the floating alert banner
  clearHeaderAlert: () => set({ activeHeaderAlert: null })
}));