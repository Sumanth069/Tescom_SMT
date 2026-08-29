// SMT Floor & Reel Inventory TypeScript Types
// -------------------------------------------------------------
// This file defines the shape of our data objects used across the frontend.

// Information about a single feeder slot on the SMT pick-and-place machine
export interface SmtComponent {
  line_id: string;              // e.g. 'line_1'
  feeder_position: string;      // e.g. 'Feeder_12'
  part_number: string;          // e.g. 'RC0402FR-0710KL'
  description: string;          // e.g. '10K 0402 Resistor'
  current_quantity: number;     // How many parts are currently left on the reel
  quantity_threshold: number;   // Low stock alert boundary (default: 500)
  parts_per_second?: number | null;   // Real-time placement speed
  time_left_seconds?: number | null;  // Estimated seconds remaining before reel runs dry
  status: 'ok' | 'warning' | 'critical'; // Overall health status
}

// Order and customer information coming from the factory ERP system
export interface ErpLineData {
  customer: string;
  ordered_pcbs: number;
  completed_pcbs: number;
  expected_finish: string;
  schedule_status: 'ahead of schedule' | 'on schedule' | 'behind schedule';
  deadline: string;
}

// SMT Production line details
export interface SmtLine {
  id: string;
  name: string;
  connection_status: 'online' | 'offline' | 'stale';
  erp_data?: ErpLineData;
}

// A record created whenever a reel gets reloaded by an operator
export interface ReplenishmentEvent {
  id: string;
  timestamp: number;
  line_id: string;
  feeder_position: string;
  part_number: string;
  previous_qty: number;
  new_qty: number;
  replenished_amount: number;
}

export type HeaderAlertType = 'exhausted' | 'threshold' | 'critical' | 'warning' | 'info';

export interface HeaderAlert {
  type: HeaderAlertType;
  message: string;
  count?: number;
  feeder?: string;
  partNumber?: string;
  timestamp?: number;
}

export interface KpiMetrics {
  totalFeeders: number;
  criticalCount: number;
  warningCount: number;
  okCount: number;
  totalConsumptionRate: number;
}

// ─── REEL INVENTORY TYPES ─────────────────────────────────────────────────────

/** Status computed from remainingQuantity / initialQuantity ratio */
export type ReelStatus = 'ok' | 'warning' | 'critical';

/**
 * A single reel record stored inside a category JSON file (e.g. CAPACITOR.json).
 * Fields come from: QR scan (partNumber, partsId, lotId, initialQuantity)
 * and system-generated (reelId, scannedAt, lastUpdated, remainingQuantity).
 * Feeder and line data are NOT here — they come from machine data separately.
 */
export interface ReelRecord {
  reelId: string;               // e.g. 'REEL00001'
  partNumber: string;           // e.g. 'GME34681008DJRE'
  partsId: string;              // e.g. 'PP2344F'
  lotId: string;                // e.g. 'LT0016'
  initialQuantity: number;      // Quantity when reel was first scanned
  remainingQuantity: number;    // Current stock remaining on reel
  status: string;               // 'ACTIVE', 'DEPLETED', etc.
  scannedAt: string;            // ISO timestamp when first scanned
  lastUpdated?: string;         // ISO timestamp when last updated
  computedStatus?: 'ok' | 'warning' | 'critical'; // Low-stock status
}

// Metadata for a component category (from MASTER.json)
export interface MasterComponentEntry {
  file: string;                 // JSON file name, e.g. 'RESISTOR.json'
  label: string;                // Friendly display name, e.g. 'Resistors'
  symbol: string;               // Short badge label, e.g. 'R'
  color: string;                // Category theme color, e.g. '#3B82F6'
}

// Mapping of a specific part number to its parent category (from MASTER.json)
export interface MasterPartMapping {
  componentType: string;        // e.g. 'RESISTOR'
  file: string;                 // e.g. 'RESISTOR.json'
  description?: string;         // e.g. '10K 0402 1% SMD Resistor'
}

// Full structure of MASTER.json
export interface MasterConfig {
  version: string;
  componentTypes: Record<string, MasterComponentEntry>;
  partMappings: Record<string, MasterPartMapping>;
}

// Format definition for barcode scanners (from qr-format.json)
export interface QrFieldDef {
  name: string;
  position: number;
  type: string;
  required: boolean;
  transform?: string;
  default?: any;
}

export interface QrFormatConfig {
  separator: string;
  fields: QrFieldDef[];
  description?: string;
}

// Inventory data for a category
export interface CategoryReelData {
  componentType: string;
  thresholds?: { criticalQuantity: number; warningQuantity: number };
  reels: ReelRecord[];
}

// Result object returned by the server after scanning a QR code
export interface ScanResult {
  success: boolean;
  action: 'created' | 'already_registered';
  componentType: string;
  reelId: string;
  partNumber: string;
  partsId: string;
  lotId: string;
  initialQuantity: number;
  file: string;
  excelFile?: string;
  message?: string;
}

// Filter choices for the feeder inventory list
export type StatusFilterType = 'all' | 'critical' | 'warning' | 'ok';

// Header alert banner for low-stock and replenishment notices
export interface HeaderAlert {
  type: 'threshold' | 'exhausted' | 'replenished';
  feeder_position: string;
  part_number: string;
  line_id: string;
  time_left_seconds?: number | null;
  current_quantity?: number;
  replenished_amount?: number;
  timestamp: number;
}