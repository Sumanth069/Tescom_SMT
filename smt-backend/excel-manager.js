// Excel File Manager for SMT Reel Inventory
// -------------------------------------------------------------
// This file handles reading, writing, and formatting Excel (.xlsx) spreadsheets:
// 1. Keeps a separate Excel file for each category (CAPACITOR.xlsx, RESISTOR.xlsx, etc.).
// 2. Logs every scanned reel so factory managers have a permanent Excel record.
// 3. Formats spreadsheets nicely (green headers, alternating row colors, formatted numbers).
// 4. Can combine all categories into a single Master Excel file with multiple tabs.

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Column headers and widths for our inventory spreadsheets
const HEADERS = [
  { header: 'Reel ID', key: 'reelId', width: 16 },
  { header: 'Part Number', key: 'partNumber', width: 26 },
  { header: 'Parts ID', key: 'partsId', width: 18 },
  { header: 'Lot ID', key: 'lotId', width: 16 },
  { header: 'Initial Qty', key: 'initialQuantity', width: 15 },
  { header: 'Remaining Qty', key: 'remainingQuantity', width: 16 },
  { header: 'Level', key: 'status', width: 14 },
  { header: 'Scanned At', key: 'scannedAt', width: 22 },
  { header: 'Last Updated', key: 'lastUpdated', width: 22 }
];

// Returns the full file path for a category's Excel file (e.g. SMT_DATA/RESISTOR.xlsx)
function getExcelPath(dataDir, componentType) {
  const safeName = componentType.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  return path.join(dataDir, `${safeName}.xlsx`);
}

// Formats date strings nicely so they look clean in Excel cells (YYYY-MM-DD HH:mm:ss)
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toISOString().replace('T', ' ').substring(0, 19);
  } catch {
    return isoStr;
  }
}

// Sets up the visual look of an Excel worksheet (freezes top row, colors headers)
function styleWorksheet(worksheet, componentType, meta) {
  // Keep the header row pinned at top when scrolling down
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Make the header row bold with white text
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };

  // Use the category's theme color if specified in MASTER.json, otherwise use nice blue
  let headerColor = 'FF1E40AF'; // Default Slate Blue
  if (meta && meta.color) {
    const hex = meta.color.replace('#', '');
    if (hex.length === 6) headerColor = `FF${hex.toUpperCase()}`;
  }

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerColor }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium', color: { argb: 'FF111827' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
  });
}

// Formats individual rows (zebra stripes, thousands separators like 10,000, and color tags)
function styleDataRow(row, rowIndex, reel) {
  row.height = 22;
  row.font = { name: 'Segoe UI', size: 10 };

  // Alternate between white and light gray background for easy reading
  const isEven = rowIndex % 2 === 0;
  const bgArgb = isEven ? 'FFF9FAFB' : 'FFFFFFFF';

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgArgb }
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };

    // Format quantities with commas (e.g. 5,000) and align numbers to the right
    if (colNumber === 5 || colNumber === 6) {
      cell.numFmt = '#,##0';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    } else if (colNumber === 1 || colNumber === 7) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });

  // Color-code the status word (Green for OK, Amber for Warning, Red for Critical)
  const statusCell = row.getCell('status');
  const st = String(reel.status || reel.computedStatus || 'OK').toUpperCase();
  if (st === 'CRITICAL') {
    statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
  } else if (st === 'WARNING') {
    statusCell.font = { bold: true, color: { argb: 'FFD97706' } };
  } else {
    statusCell.font = { bold: true, color: { argb: 'FF16A34A' } };
  }
}

// Adds a new scanned reel into the category Excel file, or updates it if it already exists
async function appendOrUpdateReelInExcel(dataDir, componentType, reel, meta) {
  const filePath = getExcelPath(dataDir, componentType);
  const workbook = new ExcelJS.Workbook();
  const sheetName = componentType.substring(0, 31);

  if (fs.existsSync(filePath)) {
    await workbook.xlsx.readFile(filePath);
  }

  let worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
  if (!worksheet) {
    worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = HEADERS;
    styleWorksheet(worksheet, componentType, meta);
  } else {
    worksheet.columns = HEADERS;
  }

  // Check if this reel ID or part/lot combination is already written in the sheet
  let existingRow = null;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    const rId = row.getCell('reelId').value;
    const pNum = row.getCell('partNumber').value;
    const pId = row.getCell('partsId').value;
    const lId = row.getCell('lotId').value;

    if (rId === reel.reelId || (pNum === reel.partNumber && pId === reel.partsId && lId === reel.lotId)) {
      existingRow = row;
    }
  });

  const rowData = {
    reelId: reel.reelId,
    partNumber: reel.partNumber,
    partsId: reel.partsId,
    lotId: reel.lotId,
    initialQuantity: reel.initialQuantity,
    remainingQuantity: reel.remainingQuantity !== undefined ? reel.remainingQuantity : reel.initialQuantity,
    status: (reel.computedStatus || reel.status || 'OK').toUpperCase(),
    scannedAt: formatDate(reel.scannedAt),
    lastUpdated: formatDate(reel.lastUpdated || reel.scannedAt)
  };

  if (existingRow) {
    existingRow.values = rowData;
    styleDataRow(existingRow, existingRow.number, reel);
  } else {
    const newRow = worksheet.addRow(rowData);
    styleDataRow(newRow, newRow.number, reel);
  }

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

// Writes a whole list of reels into an Excel file at once (used during startup migration)
async function syncCategoryReelsToExcel(dataDir, componentType, reels, meta) {
  if (!Array.isArray(reels) || reels.length === 0) return;
  const filePath = getExcelPath(dataDir, componentType);
  const workbook = new ExcelJS.Workbook();
  const sheetName = componentType.substring(0, 31);
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = HEADERS;
  styleWorksheet(worksheet, componentType, meta);

  reels.forEach((reel, idx) => {
    const row = worksheet.addRow({
      reelId: reel.reelId,
      partNumber: reel.partNumber,
      partsId: reel.partsId,
      lotId: reel.lotId,
      initialQuantity: reel.initialQuantity,
      remainingQuantity: reel.remainingQuantity !== undefined ? reel.remainingQuantity : reel.initialQuantity,
      status: (reel.computedStatus || reel.status || 'OK').toUpperCase(),
      scannedAt: formatDate(reel.scannedAt),
      lastUpdated: formatDate(reel.lastUpdated || reel.scannedAt)
    });
    styleDataRow(row, idx + 2, reel);
  });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

// Reads all the historical rows out of an Excel file so we can view them in the dashboard
async function readReelsFromExcel(dataDir, componentType) {
  const filePath = getExcelPath(dataDir, componentType);
  if (!fs.existsSync(filePath)) return [];

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const reels = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    reels.push({
      reelId: String(row.getCell(1).value || ''),
      partNumber: String(row.getCell(2).value || ''),
      partsId: String(row.getCell(3).value || ''),
      lotId: String(row.getCell(4).value || ''),
      initialQuantity: Number(row.getCell(5).value || 0),
      remainingQuantity: Number(row.getCell(6).value || 0),
      status: String(row.getCell(7).value || 'OK'),
      scannedAt: String(row.getCell(8).value || ''),
      lastUpdated: String(row.getCell(9).value || '')
    });
  });

  return reels;
}

// Combines all category sheets into a single Master Excel workbook with multiple tabs
async function generateMasterWorkbook(dataDir, masterConfig) {
  const masterWorkbook = new ExcelJS.Workbook();
  masterWorkbook.creator = 'Tescom SMT Floor System';
  masterWorkbook.lastModifiedBy = 'SMT Ingestion Engine';
  masterWorkbook.created = new Date();

  const componentTypes = masterConfig.componentTypes || {};

  for (const [type, meta] of Object.entries(componentTypes)) {
    const rawName = (meta && meta.label) ? meta.label : type;
    // Clean up sheet names so Excel won't complain about invalid characters
    const sheetName = rawName.replace(/[\\/?*[\]:]/g, '_').substring(0, 31);
    const worksheet = masterWorkbook.addWorksheet(sheetName);
    worksheet.columns = HEADERS;
    styleWorksheet(worksheet, type, meta);

    const reels = await readReelsFromExcel(dataDir, type);
    reels.forEach((reel, idx) => {
      const row = worksheet.addRow({
        reelId: reel.reelId,
        partNumber: reel.partNumber,
        partsId: reel.partsId,
        lotId: reel.lotId,
        initialQuantity: reel.initialQuantity,
        remainingQuantity: reel.remainingQuantity,
        status: reel.status,
        scannedAt: reel.scannedAt,
        lastUpdated: reel.lastUpdated
      });
      styleDataRow(row, idx + 2, reel);
    });
  }

  return masterWorkbook;
}

module.exports = {
  getExcelPath,
  appendOrUpdateReelInExcel,
  syncCategoryReelsToExcel,
  readReelsFromExcel,
  generateMasterWorkbook
};
