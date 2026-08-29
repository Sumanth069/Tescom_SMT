// SMT Inventory Server (Port 3002)
// -------------------------------------------------------------
// This server handles everything related to QR scanning and reel management:
// 1. Receives scanned QR codes: PART_NUMBER$PARTS_ID$LOT_ID$INITIAL_QUANTITY
//    Example: GME34681008DJRE$PP2344F$LT0016$10000
// 2. Uses MASTER.json to look up what component category the part belongs to.
// 3. Generates a new Reel ID (e.g. REEL00005).
// 4. Writes the full historical log to the category's Excel file (e.g. CAPACITOR.xlsx).
// 5. Keeps ONLY the single latest scan in the category JSON file for fast dashboard display.
// 6. Broadcasts the update via Socket.io so open browser screens update immediately.

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { Server } = require('socket.io');
const http    = require('http');
const excelManager = require('./excel-manager');

const PORT     = process.env.INVENTORY_PORT || 3002;
const DATA_DIR = path.join(__dirname, 'SMT_DATA');

// Setup Express web server and Socket.io
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Helper function to read a JSON file from the SMT_DATA folder
function readJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filename}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Helper function to write data into a JSON file in the SMT_DATA folder
function writeJsonFile(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Loads our master part mapping configuration (MASTER.json)
function loadMaster() {
  return readJsonFile('MASTER.json');
}

// Loads the barcode separator and field rules (qr-format.json)
function loadQrFormat() {
  return readJsonFile('qr-format.json');
}

// Generates the next sequential Reel ID (like REEL00001, REEL00002...)
// Uses reel-counter.json so numbers keep counting up even if the server restarts
function generateNextReelId() {
  const counterFile = 'reel-counter.json';
  let counter;
  try {
    counter = readJsonFile(counterFile);
  } catch {
    counter = { lastId: 0 };
  }

  counter.lastId += 1;
  writeJsonFile(counterFile, counter);

  return `REEL${String(counter.lastId).padStart(5, '0')}`;
}

// Splits the raw scanned QR string by '$' and extracts each field
function parseQrString(rawString, qrFormat) {
  const sep   = qrFormat.separator || '$';
  const parts = rawString.trim().split(sep);
  const result = {};

  for (const field of qrFormat.fields) {
    let value = (parts[field.position] !== undefined && parts[field.position] !== '')
      ? parts[field.position].trim()
      : (field.default !== undefined ? field.default : null);

    // Convert numbers or case if configured
    if (value !== null) {
      if (field.transform === 'parseInt')   value = parseInt(value, 10);
      if (field.transform === 'parseFloat') value = parseFloat(value);
      if (field.transform === 'uppercase')  value = String(value).toUpperCase();
      if (field.transform === 'lowercase')  value = String(value).toLowerCase();
    }

    result[field.name] = value;
  }

  // Make sure we didn't miss any mandatory fields
  const missing = qrFormat.fields
    .filter(f => f.required && (result[f.name] === null || result[f.name] === undefined || result[f.name] === ''))
    .map(f => f.name);

  if (missing.length > 0) {
    throw new Error(`QR data is missing required fields: ${missing.join(', ')}`);
  }

  // Check that the quantity is a positive number
  if (result.initialQuantity !== undefined && (isNaN(result.initialQuantity) || result.initialQuantity < 0)) {
    throw new Error(`Invalid initialQuantity: "${parts[3] ?? ''}". Must be a positive number.`);
  }

  return result;
}

// Finds the category file for a given part number using MASTER.json
function resolvePartNumber(partNumber, master) {
  const mapping = master.partMappings && master.partMappings[partNumber];
  if (!mapping) {
    const knownParts = Object.keys(master.partMappings || {}).join(', ');
    throw new Error(
      `Unknown part number: "${partNumber}". ` +
      `Add it to MASTER.json partMappings. ` +
      `Known parts: ${knownParts || '(none yet)'}`
    );
  }
  return mapping;
}

// Checks if we already scanned this exact reel before (same Part Number, Parts ID, and Lot ID)
function findExistingReel(categoryData, partNumber, partsId, lotId) {
  return (categoryData.reels || []).find(
    r => r.partNumber === partNumber &&
         r.partsId    === partsId    &&
         r.lotId      === lotId
  ) || null;
}

// Loads low-stock warning and critical threshold limits
function loadThresholds() {
  try {
    return readJsonFile('thresholds.json');
  } catch {
    return { global: { warningQuantity: 1000, criticalQuantity: 500 }, perType: {} };
  }
}

// Determines if a reel is 'ok', 'warning', or 'critical' based on remaining stock
function computeReelStatus(reel, componentType) {
  const thresholds = loadThresholds();
  const perType = (thresholds.perType || {})[componentType] || {};
  const global  = thresholds.global || {};

  const criticalQty = perType.criticalQuantity ?? global.criticalQuantity ?? 500;
  const warningQty  = perType.warningQuantity  ?? global.warningQuantity  ?? 1000;

  if (reel.remainingQuantity <= criticalQty) return 'critical';
  if (reel.remainingQuantity <= warningQty)  return 'warning';
  return 'ok';
}

// Adds computed status labels to all reels in a category
function enrichWithStatus(categoryData) {
  const thresholds = loadThresholds();
  const type = categoryData.componentType;
  const perType = (thresholds.perType || {})[type] || {};
  const global  = thresholds.global || {};
  const criticalQty = perType.criticalQuantity ?? global.criticalQuantity ?? 500;
  const warningQty  = perType.warningQuantity  ?? global.warningQuantity  ?? 1000;

  return {
    ...categoryData,
    thresholds: { criticalQuantity: criticalQty, warningQuantity: warningQty },
    reels: (categoryData.reels || []).map(r => ({
      ...r,
      computedStatus: computeReelStatus(r, type)
    }))
  };
}

// Sends live updates to all open dashboard screens over WebSockets
function broadcastUpdate(categoryData) {
  io.emit('reel_inventory_update', enrichWithStatus(categoryData));
}

// Runs once at startup: makes sure Excel archives exist and prunes JSON files
// so the dashboard only displays the single latest scan per category
async function initializeExcelArchivesAndPruneJson() {
  try {
    const master = loadMaster();
    for (const [type, meta] of Object.entries(master.componentTypes || {})) {
      const jsonPath = path.join(DATA_DIR, meta.file);
      if (!fs.existsSync(jsonPath)) continue;

      let catData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const reels = catData.reels || [];

      // 1. If the Excel file doesn't exist yet, build it with all past reels
      const excelPath = excelManager.getExcelPath(DATA_DIR, type);
      if (!fs.existsSync(excelPath) && reels.length > 0) {
        await excelManager.syncCategoryReelsToExcel(DATA_DIR, type, reels, meta);
        console.log(`[Excel Init] Created ${type}.xlsx with ${reels.length} historical reel(s)`);
      }

      // 2. Keep only the single most recent scan in the JSON file
      if (reels.length > 1) {
        reels.sort((a, b) => new Date(b.lastUpdated || b.scannedAt || 0) - new Date(a.lastUpdated || a.scannedAt || 0));
        catData.reels = [reels[0]];
        writeJsonFile(meta.file, catData);
        console.log(`[JSON Prune] Kept 1 most recent reel (${catData.reels[0].reelId}) in ${meta.file}`);
      }
    }
  } catch (err) {
    console.error('[Excel Init Error] Failed during startup migration:', err.message);
  }
}

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// Basic health check to see if the inventory server is alive
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    dataDir: DATA_DIR,
    timestamp: new Date().toISOString()
  });
});

// Returns the MASTER.json catalog
app.get('/api/config/master', (_req, res) => {
  try {
    res.json(loadMaster());
  } catch (err) {
    res.status(500).json({ error: 'FILE_ERROR', message: err.message });
  }
});

// Returns the QR barcode parsing rules
app.get('/api/config/qr-format', (_req, res) => {
  try {
    res.json(loadQrFormat());
  } catch (err) {
    res.status(500).json({ error: 'FILE_ERROR', message: err.message });
  }
});

// Returns low-stock threshold numbers
app.get('/api/config/thresholds', (_req, res) => {
  try {
    res.json(loadThresholds());
  } catch (err) {
    res.status(500).json({ error: 'FILE_ERROR', message: err.message });
  }
});

// Returns SMT production lines configuration
app.get('/api/config/lines', (_req, res) => {
  try {
    res.json(readJsonFile('lines.json'));
  } catch (err) {
    res.status(500).json({ error: 'FILE_ERROR', message: err.message });
  }
});

// Returns inventory for all categories (single most recent scan per category)
app.get('/api/inventory', (_req, res) => {
  try {
    const master = loadMaster();
    const result = {};

    for (const [type, meta] of Object.entries(master.componentTypes || {})) {
      try {
        result[type] = enrichWithStatus(readJsonFile(meta.file));
      } catch {
        result[type] = { componentType: type, reels: [] };
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'FILE_ERROR', message: err.message });
  }
});

// Returns a single category's most recent scan
app.get('/api/inventory/:type', (req, res) => {
  try {
    const type   = req.params.type.toUpperCase();
    const master = loadMaster();
    const meta   = master.componentTypes && master.componentTypes[type];

    if (!meta) {
      return res.status(422).json({
        error: 'UNKNOWN_TYPE',
        message: `Component type "${type}" not found in MASTER.json componentTypes`
      });
    }

    let catData;
    try {
      catData = readJsonFile(meta.file);
    } catch {
      catData = { componentType: type, reels: [] };
    }

    res.json(enrichWithStatus(catData));
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Downloads the category's official Excel (.xlsx) file
app.get('/api/inventory/:type/excel', async (req, res) => {
  try {
    const type   = req.params.type.toUpperCase();
    const master = loadMaster();
    const meta   = master.componentTypes && master.componentTypes[type];

    if (!meta) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `Unknown category "${type}"` });
    }

    const excelPath = excelManager.getExcelPath(DATA_DIR, type);

    // If file doesn't exist yet, build it from JSON on the fly
    if (!fs.existsSync(excelPath)) {
      let catData = { componentType: type, reels: [] };
      try { catData = readJsonFile(meta.file); } catch {}
      await excelManager.syncCategoryReelsToExcel(DATA_DIR, type, catData.reels || [], meta);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_Reel_Inventory.xlsx"`);
    res.sendFile(excelPath);
  } catch (err) {
    res.status(500).json({ error: 'EXCEL_ERROR', message: err.message });
  }
});

// Returns the full historical list of all reels stored in a category's Excel file
app.get('/api/inventory/:type/history', async (req, res) => {
  try {
    const type = req.params.type.toUpperCase();
    const reels = await excelManager.readReelsFromExcel(DATA_DIR, type);
    res.json({ componentType: type, totalReels: reels.length, reels });
  } catch (err) {
    res.status(500).json({ error: 'HISTORY_ERROR', message: err.message });
  }
});

// Returns all historical reels across all categories from Excel
app.get('/api/inventory/history/all', async (_req, res) => {
  try {
    const master = loadMaster();
    const result = {};
    for (const type of Object.keys(master.componentTypes || {})) {
      result[type] = await excelManager.readReelsFromExcel(DATA_DIR, type);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'HISTORY_ERROR', message: err.message });
  }
});

// Generates and downloads the multi-tab Master Excel file containing all categories
app.get('/api/inventory/export/all-excel', async (_req, res) => {
  try {
    const master = loadMaster();
    const workbook = await excelManager.generateMasterWorkbook(DATA_DIR, master);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="SMT_All_Categories_Inventory.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Export All Excel Error]:', err.message);
    res.status(500).json({ error: 'EXPORT_ERROR', message: err.message });
  }
});

// Main QR Code scanning endpoint (called when an operator scans a barcode)
app.post('/api/scan', async (req, res) => {
  try {
    const { rawQr } = req.body;

    // Step 1: Check input
    if (!rawQr || typeof rawQr !== 'string' || !rawQr.trim()) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Request body must contain "rawQr" (string).'
      });
    }

    // Step 2: Parse the barcode text into fields
    const qrFormat = loadQrFormat();
    let qrData;
    try {
      qrData = parseQrString(rawQr, qrFormat);
    } catch (parseErr) {
      return res.status(400).json({
        error: 'INVALID_QR',
        message: parseErr.message,
        rawQr,
        hint: `Expected format: PART_NUMBER${qrFormat.separator}PARTS_ID${qrFormat.separator}LOT_ID${qrFormat.separator}INITIAL_QUANTITY`
      });
    }

    const { partNumber, partsId, lotId, initialQuantity } = qrData;

    // Step 3: Match part number to category using MASTER.json
    const master = loadMaster();
    let mapping;
    try {
      mapping = resolvePartNumber(partNumber, master);
    } catch (lookupErr) {
      return res.status(422).json({
        error: 'UNKNOWN_PART',
        partNumber,
        message: lookupErr.message,
        hint: `Add "${partNumber}" to the partMappings section of MASTER.json`
      });
    }

    const { componentType, file: categoryFile } = mapping;
    const meta = master.componentTypes[componentType] || {};

    // Step 4: Load current category data
    let categoryData;
    try {
      categoryData = readJsonFile(categoryFile);
    } catch {
      categoryData = { componentType, reels: [] };
    }

    const now = new Date().toISOString();

    // Step 5: Duplicate check (did we already scan this exact reel?)
    const existing = findExistingReel(categoryData, partNumber, partsId, lotId);

    let action;
    let reelRecord;

    if (existing) {
      existing.lastUpdated = now;
      existing.status = 'ACTIVE';
      action     = 'already_registered';
      reelRecord = existing;
    } else {
      const reelId = generateNextReelId();
      reelRecord = {
        reelId,
        partNumber,
        partsId,
        lotId,
        initialQuantity,
        remainingQuantity: initialQuantity,
        status: 'ACTIVE',
        scannedAt: now,
        lastUpdated: now
      };
      action = 'created';
    }

    // Compute status level (ok, warning, critical)
    reelRecord.computedStatus = computeReelStatus(reelRecord, componentType);

    // Step 6: Save permanent historical record into category Excel archive
    await excelManager.appendOrUpdateReelInExcel(DATA_DIR, componentType, reelRecord, meta);

    // Step 7: Keep ONLY the single latest scan in the JSON file
    categoryData.reels = [reelRecord];
    writeJsonFile(categoryFile, categoryData);

    // Step 8: Notify open browser screens via WebSockets
    broadcastUpdate(categoryData);
    io.emit('excel_reel_scanned', { componentType, reel: reelRecord });

    // Step 9: Send response back to scanner
    const httpStatus = action === 'created' ? 201 : 200;
    const excelFilename = `${componentType}.xlsx`;

    return res.status(httpStatus).json({
      success: true,
      action,
      componentType,
      reelId: reelRecord.reelId,
      partNumber,
      partsId,
      lotId,
      initialQuantity,
      file: categoryFile,
      excelFile: excelFilename,
      message: action === 'created'
        ? `New reel ${reelRecord.reelId} saved to ${categoryFile} (Recent) and logged to ${excelFilename} (Excel Archive)`
        : `Reel ${reelRecord.reelId} updated in ${categoryFile} & ${excelFilename}`
    });

  } catch (err) {
    console.error('[POST /api/scan] Unexpected error:', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Update the remaining quantity on a specific reel
app.put('/api/reel/:reelId/quantity', async (req, res) => {
  try {
    const { reelId } = req.params;
    const { remainingQuantity, componentType } = req.body;

    if (remainingQuantity === undefined || isNaN(Number(remainingQuantity))) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: '"remainingQuantity" must be a non-negative number'
      });
    }

    const master = loadMaster();
    const typesToSearch = componentType
      ? [componentType.toUpperCase()]
      : Object.keys(master.componentTypes || {});

    for (const type of typesToSearch) {
      const meta = master.componentTypes[type];
      if (!meta) continue;

      let catData;
      try { catData = readJsonFile(meta.file); } catch { continue; }

      const idx = (catData.reels || []).findIndex(r => r.reelId === reelId);
      if (idx >= 0) {
        const reel = catData.reels[idx];
        const newQty = Math.max(0, Math.min(Number(remainingQuantity), reel.initialQuantity));
        reel.remainingQuantity = newQty;
        reel.lastUpdated = new Date().toISOString();
        if (newQty === 0) reel.status = 'DEPLETED';

        reel.computedStatus = computeReelStatus(reel, type);

        // Update JSON file
        writeJsonFile(meta.file, catData);

        // Update Excel Archive
        await excelManager.appendOrUpdateReelInExcel(DATA_DIR, type, reel, meta);

        broadcastUpdate(catData);

        return res.json({
          success: true,
          reelId,
          remainingQuantity: newQty,
          componentType: type,
          status: reel.computedStatus
        });
      }
    }

    res.status(404).json({
      error: 'NOT_FOUND',
      message: `Reel "${reelId}" not found in any category file`
    });

  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Delete a reel from inventory
app.delete('/api/reel/:reelId', (req, res) => {
  try {
    const { reelId }    = req.params;
    const componentType = req.query.componentType;
    const master        = loadMaster();
    const typesToSearch = componentType
      ? [componentType.toUpperCase()]
      : Object.keys(master.componentTypes || {});

    for (const type of typesToSearch) {
      const meta = master.componentTypes[type];
      if (!meta) continue;

      let catData;
      try { catData = readJsonFile(meta.file); } catch { continue; }

      const before = catData.reels.length;
      catData.reels = catData.reels.filter(r => r.reelId !== reelId);

      if (catData.reels.length < before) {
        writeJsonFile(meta.file, catData);
        broadcastUpdate(catData);
        return res.json({ success: true, reelId, componentType: type });
      }
    }

    res.status(404).json({ error: 'NOT_FOUND', message: `Reel "${reelId}" not found` });

  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// When a browser connects via Socket.io, send it the full inventory snapshot right away
io.on('connection', (socket) => {
  try {
    const master = loadMaster();
    const fullInventory = {};
    for (const [type, meta] of Object.entries(master.componentTypes || {})) {
      try {
        fullInventory[type] = enrichWithStatus(readJsonFile(meta.file));
      } catch {
        fullInventory[type] = { componentType: type, reels: [] };
      }
    }
    socket.emit('reel_inventory_full', fullInventory);
  } catch (err) {
    console.error('[Socket.io] Failed to send initial inventory:', err.message);
  }
});

// Start listening for HTTP requests
server.listen(PORT, async () => {
  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  SMT Inventory Server  —  port ${PORT}              ║`);
  console.log(`║  Excel Archiving & Recent Scan Filter Enabled     ║`);
  console.log(`╚═══════════════════════════════════════════════════╝\n`);

  await initializeExcelArchivesAndPruneJson();

  console.log(`  REST Endpoints:`);
  console.log(`  GET  http://localhost:${PORT}/api/inventory               (Recent only)`);
  console.log(`  GET  http://localhost:${PORT}/api/inventory/:type/excel   (Category Excel)`);
  console.log(`  GET  http://localhost:${PORT}/api/inventory/export/all-excel (All Excel)`);
  console.log(`  POST http://localhost:${PORT}/api/scan\n`);
});
