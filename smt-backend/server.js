// SMT Floor Ingestion Server (Port 3001)
// -------------------------------------------------------------
// What this server does in simple terms:
// 1. Watches the './dropzone' folder for new CSV files coming from SMT machines.
// 2. Reads the CSV data to see how many components are on each feeder slot.
// 3. Figures out how fast parts are being used up and predicts when they'll run out.
// 4. Sends live updates to the browser dashboard using WebSockets (Socket.io).

const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Start up the Socket.io WebSocket server on port 3001
const PORT = process.env.PORT || 3001;
const io = new Server(PORT, { cors: { origin: "*" } });

// Memory cache to remember previous quantities so we can calculate burn rate
// Example entry: 'line_1-Feeder_20' -> { last_qty: 4980, last_timestamp: 16000000, known_rate: 4.5 }
const feederCache = {};

// Keep a list of the last 100 times a feeder got reloaded with a new reel
const replenishmentHistory = [];

// Make sure the dropzone folder exists so machines have a place to save CSVs
const dropzonePath = path.join(__dirname, 'dropzone');
if (!fs.existsSync(dropzonePath)) fs.mkdirSync(dropzonePath, { recursive: true });

// Simulated customer orders from the factory ERP system
let erpState = [
  { id: 'line_1', name: 'SMT Line 1 (YSM20R)', connection_status: 'online', erp_data: { customer: 'Tesla', ordered_pcbs: 5000, completed_pcbs: 3200, expected_finish: '14:00', schedule_status: 'on schedule', deadline: 'Tomorrow' } },
  { id: 'line_2', name: 'SMT Line 2', connection_status: 'online', erp_data: { customer: 'Cisco', ordered_pcbs: 1200, completed_pcbs: 1150, expected_finish: '10:30', schedule_status: 'ahead of schedule', deadline: 'Tomorrow' } },
  { id: 'line_3', name: 'SMT Line 3', connection_status: 'online', erp_data: { customer: 'Philips', ordered_pcbs: 300, completed_pcbs: 45, expected_finish: '09:00', schedule_status: 'behind schedule', deadline: 'Today' } },
  { id: 'line_4', name: 'SMT Line 4', connection_status: 'online', erp_data: { customer: 'Sony', ordered_pcbs: 10000, completed_pcbs: 1000, expected_finish: '16:00', schedule_status: 'on schedule', deadline: 'Monday' } }
];

// Every 10 seconds, bump up the number of completed PCBs slightly and tell the frontend
setInterval(() => {
  erpState = erpState.map(line => ({
    ...line,
    erp_data: {
      ...line.erp_data,
      completed_pcbs: Math.min(line.erp_data.ordered_pcbs, line.erp_data.completed_pcbs + 3)
    }
  }));
  io.emit("line_data_update", erpState);
}, 10000);

// Helper function to read raw CSV text and turn it into clean JavaScript objects.
// Handles both standard table CSVs and Yamaha machine logs with extra header info.
function parseCSVContent(content, fallbackLineId) {
  // Remove invisible UTF-8 character if present at the start of the file
  const cleanContent = content.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { metadata: {}, rawHeaders: [], parsedRawRows: [] };

  const metadata = {};
  let headerIndex = -1;

  // Look through lines to find where the actual column headers begin
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());
    const firstCol = (parts[0] || '').toLowerCase();

    const isHeaderLine =
      firstCol === 'mount table' ||
      firstCol === 'line_id' ||
      firstCol === 'line' ||
      parts.some(p => {
        const lower = p.toLowerCase();
        return (
          lower === 'set num' ||
          lower === 'parts name' ||
          lower === 'feeder_position' ||
          lower === 'part_number' ||
          lower === 'current_quantity'
        );
      });

    if (isHeaderLine) {
      headerIndex = i;
      break;
    } else {
      // Anything before the header line is treated as machine info (metadata)
      if (parts[0] && parts[1]) {
        metadata[parts[0].trim()] = parts[1].trim();
      }
    }
  }

  // If we couldn't find a special header, assume line 0 is the header
  if (headerIndex === -1) headerIndex = 0;

  const rawHeaders = lines[headerIndex].split(',').map(h => h.trim());
  const parsedRawRows = [];

  // Parse each data row using the headers
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 2) continue;

    const row = {};
    rawHeaders.forEach((header, idx) => {
      if (header) row[header] = values[idx] || '';
    });
    parsedRawRows.push(row);
  }

  return { metadata, rawHeaders, parsedRawRows };
}

// Main function that runs whenever a CSV file is dropped into the folder
const processCSV = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    const matchedLine = filename.match(/line_\d+/i);
    const fallbackLineId = matchedLine ? matchedLine[0].toLowerCase() : 'line_1';

    const { metadata, parsedRawRows } = parseCSVContent(content, fallbackLineId);
    if (parsedRawRows.length === 0) return;

    const now = Date.now();
    const results = [];

    // Check if this file came from a Yamaha placement log
    const isYamahaMountLog = parsedRawRows[0]['Set Num'] !== undefined || parsedRawRows[0]['Mount Table'] !== undefined;

    if (isYamahaMountLog) {
      // Group placement records by feeder slot (Set Num)
      const feederGroup = {};

      parsedRawRows.forEach(row => {
        const setNum = row['Set Num'] || '1';
        const feederPos = `Feeder_${setNum}`;
        const partName = row['Parts Name'] || 'PART-UNKNOWN';
        const rawDesc = (row['Parts ID'] || row['Parts Comment'] || partName).replace(/~/g, '').trim();
        const reelId = row['Reel ID'] || '';
        const notMounted = row['Not Mounted'] || '0';

        if (!feederGroup[feederPos]) {
          feederGroup[feederPos] = {
            feeder_position: feederPos,
            part_number: partName,
            description: rawDesc,
            reel_id: reelId,
            mountedCount: 0
          };
        }

        // Only count parts that were actually placed
        if (notMounted === '0') {
          feederGroup[feederPos].mountedCount += 1;
        }
      });

      // Calculate stock and burn speed for each feeder slot
      Object.values(feederGroup).forEach(group => {
        const line_id = fallbackLineId;
        const cacheKey = `${line_id}-${group.feeder_position}`;
        const defaultCap = 5000;

        let current_qty = defaultCap;
        let rate_per_sec = null;
        let time_left_sec = null;
        let status = 'ok';

        if (feederCache[cacheKey]) {
          const cache = feederCache[cacheKey];
          current_qty = Math.max(0, cache.last_qty - group.mountedCount);

          if (current_qty <= 20) {
            // Auto-reload to simulate loading a fresh reel
            current_qty = defaultCap;
          }

          const delta_qty = cache.last_qty - current_qty;
          const delta_time_sec = Math.max(1, (now - cache.last_timestamp) / 1000);

          if (delta_qty > 0) {
            // Parts were consumed: calculate how many parts per second
            const inst_rate = delta_qty / delta_time_sec;
            const alpha = 0.3; // smooth out sudden spikes
            rate_per_sec = cache.known_rate != null ? (alpha * inst_rate + (1 - alpha) * cache.known_rate) : inst_rate;
            feederCache[cacheKey].known_rate = rate_per_sec;
          } else if (delta_qty < 0) {
            // Quantity went UP -> operator loaded a new reel!
            const replenished_amount = current_qty - cache.last_qty;
            const event = {
              id: `${now}-${cacheKey}`,
              timestamp: now,
              line_id,
              feeder_position: group.feeder_position,
              part_number: group.part_number,
              previous_qty: cache.last_qty,
              new_qty: current_qty,
              replenished_amount
            };
            replenishmentHistory.unshift(event);
            if (replenishmentHistory.length > 100) replenishmentHistory.pop();
            io.emit("replenishment_event", event);
            rate_per_sec = cache.known_rate || null;
          } else {
            rate_per_sec = 0;
          }

          // Estimate how many seconds are left before the reel runs empty
          if (rate_per_sec !== null && rate_per_sec > 0) {
            time_left_sec = Math.floor(current_qty / rate_per_sec);
            if (time_left_sec <= 30) status = 'critical';
            else if (time_left_sec <= 90) status = 'warning';
          }
        }

        feederCache[cacheKey] = {
          last_qty: current_qty,
          last_timestamp: now,
          known_rate: rate_per_sec != null ? rate_per_sec : feederCache[cacheKey]?.known_rate || null
        };

        results.push({
          line_id,
          feeder_position: group.feeder_position,
          part_number: group.part_number,
          description: group.description,
          current_quantity: current_qty,
          quantity_threshold: 500,
          parts_per_second: rate_per_sec,
          time_left_seconds: time_left_sec,
          status
        });
      });

    } else {
      // Standard simple CSV where each row has quantity directly
      parsedRawRows.forEach(rawRow => {
        const cleanRow = {};
        for (const [k, v] of Object.entries(rawRow)) {
          const cleanK = k.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
          cleanRow[cleanK] = typeof v === 'string' ? v.trim() : v;
        }

        const line_id = cleanRow.line_id || cleanRow.line || cleanRow.lineid || cleanRow.smt_line || fallbackLineId;
        const feeder_pos = cleanRow.feeder_position || cleanRow.feeder || cleanRow.feeder_pos || cleanRow.slot || cleanRow.slot_no || cleanRow.position || (cleanRow.set_num ? `Feeder_${cleanRow.set_num}` : 'Feeder_1');
        const part_no = cleanRow.part_number || cleanRow.part_no || cleanRow.part || cleanRow.parts_name || cleanRow.item_code || 'PART-UNKNOWN';
        const desc = cleanRow.description || cleanRow.desc || cleanRow.parts_id || `Component ${part_no}`;

        const parseNum = (v, defaultVal = 0) => {
          if (!v || v === 'N/A' || v === '-') return defaultVal;
          const parsed = parseInt(String(v).replace(/,/g, ''), 10);
          return isNaN(parsed) ? defaultVal : parsed;
        };

        const current_qty = parseNum(cleanRow.current_quantity || cleanRow.quantity || cleanRow.qty || cleanRow.stock, 5000);
        const threshold = parseNum(cleanRow.quantity_threshold || cleanRow.threshold || cleanRow.min_qty, 500);

        const cacheKey = `${line_id}-${feeder_pos}`;
        let rate_per_sec = null;
        let time_left_sec = null;
        let status = 'ok';

        if (feederCache[cacheKey]) {
          const cache = feederCache[cacheKey];
          const delta_qty = cache.last_qty - current_qty;
          const delta_time_sec = Math.max(1, (now - cache.last_timestamp) / 1000);

          if (delta_qty > 0) {
            const inst_rate = delta_qty / delta_time_sec;
            const alpha = 0.3;
            rate_per_sec = cache.known_rate != null ? (alpha * inst_rate + (1 - alpha) * cache.known_rate) : inst_rate;
            feederCache[cacheKey].known_rate = rate_per_sec;
          } else if (delta_qty < 0) {
            // Replenished with a new reel
            const replenished_amount = current_qty - cache.last_qty;
            const event = {
              id: `${now}-${cacheKey}`,
              timestamp: now,
              line_id,
              feeder_position: feeder_pos,
              part_number: part_no,
              previous_qty: cache.last_qty,
              new_qty: current_qty,
              replenished_amount
            };
            replenishmentHistory.unshift(event);
            if (replenishmentHistory.length > 100) replenishmentHistory.pop();
            io.emit("replenishment_event", event);
            rate_per_sec = cache.known_rate || null;
          } else {
            rate_per_sec = 0;
          }

          if (rate_per_sec !== null && rate_per_sec > 0) {
            time_left_sec = Math.floor(current_qty / rate_per_sec);
            if (time_left_sec <= 30) status = 'critical';
            else if (time_left_sec <= 90) status = 'warning';
          }
        }

        feederCache[cacheKey] = {
          last_qty: current_qty,
          last_timestamp: now,
          known_rate: rate_per_sec != null ? rate_per_sec : feederCache[cacheKey]?.known_rate || null
        };

        results.push({
          line_id,
          feeder_position: feeder_pos,
          part_number: part_no,
          description: desc,
          current_quantity: current_qty,
          quantity_threshold: threshold,
          parts_per_second: rate_per_sec,
          time_left_seconds: time_left_sec,
          status
        });
      });
    }

    // Broadcast the full batch of feeder updates to all connected browser screens
    if (results.length > 0) {
      io.emit("inventory_batch_update", results);
    }
  } catch (err) {
    console.error(`[CSV Processing Error] Failed to process ${filePath}:`, err.message);
  }
};

// Watch the dropzone folder for incoming CSV files from machines
const watcher = chokidar.watch(dropzonePath, {
  persistent: true,
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  ignoreInitial: false
});

watcher
  .on('add', filePath => { if (filePath.endsWith('.csv')) processCSV(filePath); })
  .on('change', filePath => { if (filePath.endsWith('.csv')) processCSV(filePath); });

// When a new browser tab connects, send it the current line status and recent reload history
io.on("connection", (socket) => {
  socket.emit("line_data_update", erpState);
  socket.emit("replenishment_history", replenishmentHistory);

  socket.on("request_replenishment_history", () => {
    socket.emit("replenishment_history", replenishmentHistory);
  });
});

console.log(`Middleware Server Running on Port ${PORT}...`);