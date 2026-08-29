// Industrial Machine CSV Diagnostic Inspector Modal
// -------------------------------------------------------------
// This modal lets factory engineers test real CSV log files from SMT machines:
// 1. File Upload: Drag and drop any real machine CSV (Yamaha YSM20R, Fuji, Panasonic, JUKI).
// 2. Metadata Inspection: Extracts machine serial numbers, program names, and header rows.
// 3. Schema Normalization: Shows how the backend translates raw column names into our database format.

import { useState } from 'react';
import { useSmtStore } from '../../store/useSmtStore';
import { X, FileSpreadsheet, CheckCircle2, Upload, AlertCircle, Info } from 'lucide-react';

interface ParsedRowPreview {
  raw: Record<string, string>;
  mapped: {
    line_id: string;
    feeder_position: string;
    part_number: string;
    description: string;
    current_quantity: number;
    quantity_threshold: number;
  };
}

// Main CSV Diagnostic Inspector Component:
// Allows testing and previewing real-world machine CSV files in the browser before deployment.
export function CsvInspectorModal() {
  const isOpen = useSmtStore((state) => state.isCsvInspectorOpen);
  const setIsOpen = useSmtStore((state) => state.setIsCsvInspectorOpen);

  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [detectedMetadata, setDetectedMetadata] = useState<Record<string, string>>({});
  const [rowsPreview, setRowsPreview] = useState<ParsedRowPreview[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Reads and parses the uploaded CSV file in the browser
  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;

        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
          setErrorMsg('Uploaded file is empty.');
          return;
        }

        // Look for the header row and extract machine metadata lines
        const metadata: Record<string, string> = {};
        let headerIndex = -1;

        for (let i = 0; i < lines.length; i++) {
          const parts = lines[i].split(',').map(p => p.trim());
          const firstCol = (parts[0] || '').toLowerCase();

          const isHeaderLine =
            firstCol === 'mount table' ||
            firstCol === 'line_id' ||
            firstCol === 'line' ||
            parts.some(p => {
              const lower = p.toLowerCase();
              return lower === 'set num' || lower === 'parts name' || lower === 'feeder_position' || lower === 'part_number';
            });

          if (isHeaderLine) {
            headerIndex = i;
            break;
          } else {
            if (parts[0] && parts[1]) {
              metadata[parts[0].trim()] = parts[1].trim();
            }
          }
        }

        if (headerIndex === -1) headerIndex = 0;

        const headers = lines[headerIndex].split(',').map(h => h.trim());
        setRawHeaders(headers);
        setDetectedMetadata(metadata);

        // Parse preview rows (first 15 rows)
        const parsedRows: ParsedRowPreview[] = [];
        for (let i = headerIndex + 1; i < Math.min(lines.length, headerIndex + 15); i++) {
          const values = lines[i].split(',').map(v => v.trim());
          if (values.length < 2) continue;

          const rawRow: Record<string, string> = {};
          headers.forEach((h, idx) => {
            if (h) rawRow[h] = values[idx] || '';
          });

          // Normalize row keys to lowercase
          const cleanRow: Record<string, string> = {};
          for (const [key, val] of Object.entries(rawRow)) {
            const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
            cleanRow[cleanKey] = val;
          }

          const line_id = cleanRow.line_id || cleanRow.line || metadata['Machine Serial'] || 'line_1';
          const feeder_position = rawRow['Set Num'] ? `Feeder_${rawRow['Set Num']}` : (cleanRow.feeder_position || cleanRow.feeder || cleanRow.slot || 'Feeder_1');
          const part_number = rawRow['Parts Name'] || cleanRow.part_number || cleanRow.part || cleanRow.part_no || 'PART-UNKNOWN';
          const description = (rawRow['Parts ID'] || rawRow['Parts Comment'] || cleanRow.description || `Component ${part_number}`).replace(/~/g, '').trim();

          const parseNum = (v: string, def: number) => {
            if (!v || v === 'N/A' || v === '-') return def;
            const parsed = parseInt(v.replace(/,/g, ''), 10);
            return isNaN(parsed) ? def : parsed;
          };

          const current_quantity = parseNum(cleanRow.current_quantity || cleanRow.quantity || cleanRow.qty || cleanRow.stock, 5000);
          const quantity_threshold = parseNum(cleanRow.quantity_threshold || cleanRow.threshold || cleanRow.min_qty, 500);

          parsedRows.push({
            raw: rawRow,
            mapped: { line_id, feeder_position, part_number, description, current_quantity, quantity_threshold }
          });
        }

        setRowsPreview(parsedRows);
      } catch (err: any) {
        setErrorMsg(`Failed to parse CSV file: ${err.message}`);
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">

        {/* Modal Header */}
        <div className="px-6 py-4 bg-purple-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Yamaha &amp; Machine CSV Inspector</h3>
              <p className="text-xs text-purple-200">Test real-world machine CSV log files against the backend schema</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-purple-200 hover:text-white rounded-lg hover:bg-purple-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">

          {/* File Upload Drop Area */}
          <div className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/50 rounded-2xl p-6 text-center transition-colors">
            <input
              type="file"
              accept=".csv"
              id="csvFileInput"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              className="hidden"
            />
            <label htmlFor="csvFileInput" className="cursor-pointer flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="font-bold text-gray-800 text-sm">
                Click to upload or drag &amp; drop a real machine CSV file
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supports Yamaha YSM20R/YSM series, Fuji, Panasonic, and JUKI CSV logs
              </p>
            </label>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              {errorMsg}
            </div>
          )}

          {fileName && rowsPreview.length > 0 && (
            <div className="space-y-6">

              {/* Compatibility Notice */}
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-xs flex items-center justify-between font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <span className="font-bold">File Compatible:</span> Successfully parsed <strong>{fileName}</strong>.
                  </div>
                </div>
                <span className="text-[11px] bg-green-100 text-green-800 px-2 py-0.5 rounded-md font-bold">
                  {rawHeaders.length} Table Columns
                </span>
              </div>

              {/* Header Metadata Display */}
              {Object.keys(detectedMetadata).length > 0 && (
                <div className="bg-purple-50/60 border border-purple-100 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-purple-600" /> Machine Header Metadata
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono text-purple-950">
                    {Object.entries(detectedMetadata).map(([k, v]) => (
                      <div key={k} className="bg-white p-2 rounded-lg border border-purple-100">
                        <span className="text-purple-400 block text-[10px] font-sans font-bold">{k}</span>
                        <span className="font-bold truncate block">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Column Headers Detected */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Detected Table Column Headers</h4>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-gray-50 rounded-xl border border-gray-200">
                  {rawHeaders.map((h, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white text-gray-700 font-mono text-[11px] rounded-md border border-gray-200 shadow-2xs">
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              {/* Ingestion Preview Table */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Normalized Ingestion Preview (First {rowsPreview.length} Rows)</h4>
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5">Line ID</th>
                        <th className="px-4 py-2.5">Feeder Position</th>
                        <th className="px-4 py-2.5">Part Number</th>
                        <th className="px-4 py-2.5">Description</th>
                        <th className="px-4 py-2.5 text-right">Est. Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rowsPreview.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 font-mono">
                          <td className="px-4 py-2.5 text-gray-600">{row.mapped.line_id}</td>
                          <td className="px-4 py-2.5 font-bold text-blue-600">{row.mapped.feeder_position}</td>
                          <td className="px-4 py-2.5 text-gray-900 font-bold">{row.mapped.part_number}</td>
                          <td className="px-4 py-2.5 text-gray-500 font-sans truncate max-w-[200px]">{row.mapped.description}</td>
                          <td className="px-4 py-2.5 text-right text-gray-900 font-bold">{row.mapped.current_quantity.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
          <span>Drop machine CSV files directly into <code>smt-backend/dropzone</code> for live IIoT ingestion</span>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-1.5 bg-purple-900 text-white font-bold rounded-lg hover:bg-purple-800 transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
}
