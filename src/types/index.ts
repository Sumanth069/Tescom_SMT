export type ComponentStatus = 'ok' | 'warning' | 'critical';
export type StatusFilterType = 'all' | 'critical' | 'warning' | 'ok';

export interface SmtComponent {
  part_number: string;
  feeder_position: string;
  description: string;
  current_quantity: number;
  quantity_threshold: number;
  status: ComponentStatus;
  line_id: string;
  parts_per_second?: number | null; 
  time_left_seconds?: number | null; 
}

export interface ErpOrderData {
  customer: string;
  ordered_pcbs: number;
  completed_pcbs: number;
  expected_finish: string;
  schedule_status: 'ahead of schedule' | 'behind schedule' | 'on schedule';
  deadline: string;
}

export interface SmtLine {
  id: string;
  name: string;
  connection_status: 'online' | 'offline' | 'stale';
  last_updated: number;
  erp_data?: ErpOrderData;
}

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
  reelId: string;              // System-generated: REEL00001, REEL00002, ...
  partNumber: string;          // From QR field 0
  partsId: string;             // From QR field 1
  lotId: string;               // From QR field 2
  initialQuantity: number;     // From QR field 3 — never changes after scan
  remainingQuantity: number;   // Updated by machine consumption data
  status: 'ACTIVE' | 'DEPLETED';  // Business status stored in JSON
  scannedAt: string;           // ISO timestamp of first scan
  lastUpdated: string;         // ISO timestamp of last change
  // Computed by backend before sending to frontend (not stored in JSON)
  computedStatus?: ReelStatus;
}

/** The structure of each category JSON file (e.g. CAPACITOR.json) */
export interface CategoryInventory {
  componentType: string;
  reels: ReelRecord[];
}

/** One entry inside MASTER.json partMappings */
export interface MasterPartMapping {
  componentType: string;
  file: string;
  description?: string;
}

/** One entry inside MASTER.json componentTypes */
export interface MasterComponentEntry {
  file: string;
  label: string;
  color: string;
  symbol: string;
}

/** The full MASTER.json structure */
export interface MasterConfig {
  version: string;
  description?: string;
  /** Part number → component type routing (used for QR scan lookup) */
  partMappings: Record<string, MasterPartMapping>;
  /** Component type → display metadata (used for rendering categories) */
  componentTypes: Record<string, MasterComponentEntry>;
}

/** One field definition inside qr-format.json */
export interface QrFieldConfig {
  position: number;
  name: string;
  transform?: 'uppercase' | 'lowercase' | 'parseInt' | 'parseFloat';
  required?: boolean;
  default?: string | number;
  description?: string;
}

/** The full qr-format.json structure */
export interface QrFormatConfig {
  separator: string;           // '$' in the actual format
  fields: QrFieldConfig[];
}

/** One line entry inside lines.json */
export interface LineConfig {
  id: string;
  name: string;
  defaultThresholds: { warning: number; critical: number };
}

/** The full lines.json structure */
export interface LinesConfig {
  lines: LineConfig[];
}

/** Response from POST /api/scan */
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
  message: string;
}