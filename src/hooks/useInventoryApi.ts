// SMT Inventory Server REST API & Socket Client Hook
// -------------------------------------------------------------
// This hook communicates with the Inventory Server (Port 3002):
// 1. Fetches MASTER.json, barcode format rules, and recent scans.
// 2. Submits newly scanned QR codes (POST /api/scan).
// 3. Listens for live updates via Socket.io to keep category accordions and Live Excel sheets updated.
// 4. Downloads Excel (.xlsx) and CSV files directly in the browser.

import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSmtStore } from '../store/useSmtStore';
import type { ScanResult, CategoryReelData, MasterConfig, ReelRecord } from '../types';

const API_BASE = 'http://localhost:3002';

export function useInventoryApi() {
  const setMasterConfig       = useSmtStore(s => s.setMasterConfig);
  const setReelInventoryFull  = useSmtStore(s => s.setReelInventoryFull);
  const updateCategoryReels   = useSmtStore(s => s.updateCategoryReels);
  const setReelInventoryLoading = useSmtStore(s => s.setReelInventoryLoading);

  const socketRef = useRef<Socket | null>(null);

  // Loads the MASTER.json catalog
  const fetchMasterConfig = useCallback(async (): Promise<MasterConfig | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/config/master`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MasterConfig = await res.json();
      setMasterConfig(data);
      return data;
    } catch (err: any) {
      console.warn('[useInventoryApi] Failed to fetch master config:', err.message);
      return null;
    }
  }, [setMasterConfig]);

  // Fetches current inventory for all categories (single latest scan per category)
  const fetchAllInventory = useCallback(async () => {
    setReelInventoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/inventory`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Record<string, CategoryReelData> = await res.json();
      setReelInventoryFull(data);
    } catch (err: any) {
      console.warn('[useInventoryApi] Failed to fetch inventory:', err.message);
    } finally {
      setReelInventoryLoading(false);
    }
  }, [setReelInventoryFull, setReelInventoryLoading]);

  // Submits a raw QR barcode string to the backend when an operator scans a reel
  const submitScan = useCallback(async (rawQr: string): Promise<ScanResult | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawQr: rawQr.trim() })
      });
      const data = await res.json();
      return data as ScanResult;
    } catch (err: any) {
      console.error('[useInventoryApi] submitScan error:', err.message);
      return {
        success: false,
        action: 'already_registered',
        componentType: 'UNKNOWN',
        reelId: '',
        partNumber: '',
        partsId: '',
        lotId: '',
        initialQuantity: 0,
        file: '',
        message: err.message ?? 'Network error'
      };
    }
  }, []);

  // Downloads the official Excel (.xlsx) file for a category
  const downloadCategoryExcel = useCallback((componentType: string) => {
    const safeType = componentType.toUpperCase();
    const url = `${API_BASE}/api/inventory/${safeType}/excel`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeType}_Reel_Inventory.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Generates and downloads the multi-sheet Master Excel file with all categories
  const downloadMasterExcel = useCallback(() => {
    const url = `${API_BASE}/api/inventory/export/all-excel`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `SMT_All_Categories_Inventory.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Fetches full historical logs stored inside a category's Excel archive
  const fetchCategoryHistory = useCallback(async (componentType: string): Promise<ReelRecord[]> => {
    try {
      const safeType = componentType.toUpperCase();
      const res = await fetch(`${API_BASE}/api/inventory/${safeType}/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.reels || []) as ReelRecord[];
    } catch (err: any) {
      console.warn(`[useInventoryApi] Failed to fetch history for ${componentType}:`, err.message);
      return [];
    }
  }, []);

  // Fetches full historical logs for all categories from Excel archives
  const fetchAllHistory = useCallback(async (): Promise<Record<string, ReelRecord[]>> => {
    try {
      const res = await fetch(`${API_BASE}/api/inventory/history/all`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data as Record<string, ReelRecord[]>;
    } catch (err: any) {
      console.warn('[useInventoryApi] Failed to fetch all history:', err.message);
      return {};
    }
  }, []);

  // Setup WebSocket connection to the inventory server (port 3002)
  useEffect(() => {
    fetchMasterConfig();
    fetchAllInventory();

    const socket = io(API_BASE, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    socketRef.current = socket;

    socket.on('reel_inventory_full', (data: Record<string, CategoryReelData>) => {
      setReelInventoryFull(data);
    });

    socket.on('reel_inventory_update', (catData: CategoryReelData) => {
      updateCategoryReels(catData);
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchMasterConfig, fetchAllInventory, setReelInventoryFull, updateCategoryReels]);

  return {
    submitScan,
    fetchMasterConfig,
    fetchAllInventory,
    downloadCategoryExcel,
    downloadMasterExcel,
    fetchCategoryHistory,
    fetchAllHistory
  };
}
