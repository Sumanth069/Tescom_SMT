// Yamaha SMT Machine Placement Simulator
// -------------------------------------------------------------
// This simulator acts like real Yamaha YSM20R machines on the factory floor:
// 1. Creates 200 feeders across 4 production lines (50 feeders per line).
// 2. Decreases part counts every second to simulate parts being placed onto PCBs.
// 3. Writes fresh CSV files into the 'dropzone' folder every 2 seconds.
// 4. When parts run low, it automatically simulates an operator loading a new reel.

const fs = require('fs');
const path = require('path');

const DROPZONE = path.join(__dirname, 'dropzone');
if (!fs.existsSync(DROPZONE)) fs.mkdirSync(DROPZONE, { recursive: true });

const LINES = ['line_1', 'line_2', 'line_3', 'line_4'];

// Common component part numbers used in factory electronics assembly
const PART_NUMBERS = [
  { part: 'RC0402FR-0710KL',  desc: 'RES 10K OHM 1% 1/16W 0402', default_qty: 10000, speed: 6.2 },
  { part: 'CC0402KRX7R9BB104', desc: 'CAP CER 0.1UF 50V X7R 0402', default_qty: 10000, speed: 8.5 },
  { part: 'C0603C104K5RACTU',  desc: 'CAP CER 0.1UF 50V X7R 0603', default_qty: 4000,  speed: 4.1 },
  { part: 'RC0603FR-07100KL', desc: 'RES 100K OHM 1% 1/10W 0603', default_qty: 5000,  speed: 2.3 },
  { part: 'STM32F407VGT6',     desc: 'IC MCU 32BIT 1MB FLASH 100LQFP', default_qty: 250, speed: 0.2 },
  { part: 'BLM18PG121SN1D',   desc: 'FERRITE BEAD 120 OHM 0603 1LN', default_qty: 4000, speed: 3.0 },
  { part: 'BAT54S,215',        desc: 'DIODE SCHOTTKY 30V 200MA SOT23', default_qty: 3000, speed: 1.5 },
  { part: 'TPS62130RGTR',      desc: 'IC REG BUCK ADJ 3A 16QFN',   default_qty: 3000,  speed: 0.5 },
  { part: 'B340A-13-F',        desc: 'DIODE SCHOTTKY 40V 3A SMA',   default_qty: 3000,  speed: 1.1 },
  { part: 'LQG15HS10NJ02D',    desc: 'IND CER 10NH 300MA 0402',    default_qty: 10000, speed: 5.4 }
];

// In-memory state tracking each feeder slot's current stock
const floorState = {};

// Sets up 50 feeders per line at startup
LINES.forEach(line => {
  floorState[line] = [];
  for (let i = 1; i <= 50; i++) {
    const meta = PART_NUMBERS[(i - 1) % PART_NUMBERS.length];

    // Make some feeders start low on purpose so we can see warning and critical alarms in action
    let startQty = meta.default_qty;
    if (i === 1) startQty = 80;   // Critical alert (< 30s remaining)
    if (i === 2) startQty = 250;  // Warning alert (< 90s remaining)
    if (i === 3) startQty = 15;   // Depleted (0-20 pcs)

    floorState[line].push({
      feeder_position: `Feeder_${i}`,
      part_number: meta.part,
      description: meta.desc,
      current_quantity: startQty,
      quantity_threshold: 500,
      initial_capacity: meta.default_qty,
      speed: meta.speed
    });
  }
});

// Reduces feeder stock every second to simulate continuous high-speed PCB placement
setInterval(() => {
  LINES.forEach(line => {
    floorState[line].forEach(feeder => {
      // Burn parts according to placement speed
      const consumed = Math.round(feeder.speed * (0.8 + Math.random() * 0.4));
      feeder.current_quantity = Math.max(0, feeder.current_quantity - consumed);

      // When nearly empty, simulate operator loading a fresh replacement reel
      if (feeder.current_quantity <= 5) {
        feeder.current_quantity = feeder.initial_capacity;
      }
    });
  });
}, 1000);

// Writes CSV files into the dropzone every 2 seconds (Line 1 uses Yamaha format, others use standard format)
setInterval(() => {
  LINES.forEach(line => {
    const isYamaha = line === 'line_1';
    let csvContent = '';

    if (isYamaha) {
      // Yamaha YSM20R header format
      csvContent += `Machine Type,YSM20R\n`;
      csvContent += `Machine Serial,YSM20R-9042\n`;
      csvContent += `Program Name,TESLA_MAINBOARD_REV4.PGM\n`;
      csvContent += `Date,${new Date().toISOString()}\n`;
      csvContent += `\n`;
      csvContent += `Mount Table,Stage,Set Num,Parts Name,Parts ID,Parts Comment,Reel ID,Mounted,Not Mounted,Current Quantity\n`;

      floorState[line].forEach((feeder, idx) => {
        const setNum = idx + 1;
        const mounted = Math.floor(Math.random() * 3) + 1;
        csvContent += `1,1,${setNum},${feeder.part_number},${feeder.part_number}~01,${feeder.description},REEL-${setNum},${mounted},0,${feeder.current_quantity}\n`;
      });

    } else {
      // Standard simple CSV format
      csvContent += `line_id,feeder_position,part_number,description,current_quantity,quantity_threshold\n`;
      floorState[line].forEach(feeder => {
        csvContent += `${line},${feeder.feeder_position},${feeder.part_number},${feeder.description},${feeder.current_quantity},${feeder.quantity_threshold}\n`;
      });
    }

    const filename = `telemetry_${line}.csv`;
    const tempPath = path.join(DROPZONE, `${filename}.tmp`);
    const finalPath = path.join(DROPZONE, filename);

    // Write to a temporary file first then rename it so the reader never reads a half-written file
    fs.writeFileSync(tempPath, csvContent, 'utf8');
    fs.renameSync(tempPath, finalPath);
  });
}, 2000);

console.log('Yamaha SMT Machine Simulator running... Writing CSV files to ./dropzone every 2s');