/**
 * Tab 1: Data Cleaning
 *
 * Workspace for importing, inspecting, and wrangling datasets.
 * Left panel: variable list + type editor
 * Center: AG Grid spreadsheet
 * Right: R script preview
 */

import { useCallback, useRef, useState } from 'react'
import { WorkspaceLayout, PanelHeader } from '../../components/layout/WorkspaceLayout'
import { usePsychrStore, Dataset, DataColumn } from '../../store'
import { RConsole } from '../../components/shared/RConsole'
import { WranglingPanel } from './WranglingPanel'
import { useRBridge } from '../../hooks/useRBridge'

// Sample dataset for demo when no file is loaded
const SAMPLE_DATA = [
  { id: 1, age: 24, gender: 'Female', anxiety: 42, depression: 31, gpa: 3.7 },
  { id: 2, age: 19, gender: 'Male',   anxiety: 55, depression: 44, gpa: 2.9 },
  { id: 3, age: 22, gender: 'Female', anxiety: 38, depression: 28, gpa: 3.4 },
  { id: 4, age: 25, gender: 'Male',   anxiety: 61, depression: 52, gpa: 2.6 },
  { id: 5, age: 21, gender: 'Female', anxiety: 47, depression: 36, gpa: 3.1 },
  { id: 6, age: 23, gender: 'Non-binary', anxiety: 50, depression: 39, gpa: 3.5 },
  { id: 7, age: 20, gender: 'Male',   anxiety: 58, depression: 49, gpa: 3.0 },
  { id: 8, age: 26, gender: 'Female', anxiety: 35, depression: 25, gpa: 3.8 },
]

const SAMPLE_COLUMNS: DataColumn[] = [
  { name: 'id', type: 'numeric', missingCount: 0, uniqueCount: 8 },
  { name: 'age', type: 'numeric', missingCount: 0, uniqueCount: 7, min: 19, max: 26, mean: 22.5 },
  { name: 'gender', type: 'factor', missingCount: 0, uniqueCount: 3 },
  { name: 'anxiety', type: 'numeric', missingCount: 0, uniqueCount: 8, min: 35, max: 61, mean: 48.5 },
  { name: 'depression', type: 'numeric', missingCount: 0, uniqueCount: 8, min: 25, max: 52, mean: 37.9 },
  { name: 'gpa', type: 'numeric', missingCount: 0, uniqueCount: 8, min: 2.6, max: 3.8, mean: 3.25 },
]

const TYPE_COLORS: Record<string, string> = {
  numeric: 'bg-blue-100 text-blue-700',
  factor: 'bg-purple-100 text-purple-700',
  character: 'bg-green-100 text-green-700',
  date: 'bg-orange-100 text-orange-700',
  logical: 'bg-gray-100 text-gray-700',
}

// ─── Simple JS CSV parser (no R required) ────────────────────────────────────

function parseCSV(text: string, sep = ','): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseLine = (line: string): string[] => {
    const cells: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === sep && !inQuotes) {
        cells.push(cur); cur = ''
      } else {
        cur += ch
      }
    }
    cells.push(cur)
    return cells
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const vals = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
  return { headers, rows }
}

function inferColumns(headers: string[], rows: Record<string, string>[]): DataColumn[] {
  return headers.map((name) => {
    const vals = rows.map((r) => r[name]).filter((v) => v !== '' && v !== null && v !== undefined)
    const missingCount = rows.length - vals.length
    const uniqueCount = new Set(vals).size
    const nums = vals.map(Number).filter((n) => !isNaN(n))
    const isNumeric = vals.length > 0 && nums.length === vals.length
    const col: DataColumn = { name, type: isNumeric ? 'numeric' : 'character', missingCount, uniqueCount }
    if (isNumeric && nums.length > 0) {
      col.min = Math.min(...nums)
      col.max = Math.max(...nums)
      col.mean = nums.reduce((a, b) => a + b, 0) / nums.length
    }
    return col
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export function DataCleaningTab() {
  const addDataset = usePsychrStore((s) => s.addDataset)
  const datasets = usePsychrStore((s) => s.datasets)
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const setActiveDataset = usePsychrStore((s) => s.setActiveDataset)
  const appendToScript = usePsychrStore((s) => s.appendToScript)
  const { run: runR } = useRBridge()

  const [isLoading, setIsLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [selectedCol, setSelectedCol] = useState<string | null>(null)
  const [leftTab, setLeftTab] = useState<'variables' | 'wrangle'>('variables')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use sample data if no dataset loaded
  const displayData = activeDataset?.data ?? SAMPLE_DATA
  const displayColumns = activeDataset?.columns ?? SAMPLE_COLUMNS
  const isDemo = !activeDataset

  const handleImportFile = useCallback(async () => {
    setIsLoading(true)
    setImportError(null)
    try {
      // ── Step 1: open native file dialog ──────────────────────────────────
      const psychr = (window as any).psychr
      if (!psychr) {
        setImportError('File import requires the desktop app. The browser preview does not support file access.')
        return
      }

      const dialogResult = await psychr.dialog.openFile()
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) return

      const filePath = dialogResult.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop() || 'dataset'
      const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

      // ── Step 2: read / parse depending on file type ──────────────────────
      let columns: DataColumn[] = []
      let data: Record<string, unknown>[] = []
      let readCmd = ''

      if (ext === 'csv' || ext === 'tsv') {
        // Read natively via Electron fs — no R dependency needed for CSV/TSV
        const sep = ext === 'tsv' ? '\t' : ','
        const fileResult = await psychr.fs.read(filePath)
        if (!fileResult.success) {
          setImportError(`Could not read file: ${fileResult.error}`)
          return
        }
        const parsed = parseCSV(fileResult.content!, sep)
        columns = inferColumns(parsed.headers, parsed.rows)
        data = parsed.rows as Record<string, unknown>[]
        readCmd = `df <- read.${ext === 'tsv' ? 'delim' : 'csv'}("${filePath.replace(/\\/g, '/')}")`

      } else {
        // For XLSX / SAV / RDS — use R
        const safePath = filePath.replace(/\\/g, '/').replace(/'/g, "\\'")
        readCmd = ext === 'xlsx' || ext === 'xls'
          ? `library(readxl); df <- as.data.frame(read_excel('${safePath}'))`
          : ext === 'sav'
          ? `library(haven); df <- as.data.frame(read_sav('${safePath}'))`
          : `df <- readRDS('${safePath}')`

        const inspectScript = `
library(jsonlite)
suppressPackageStartupMessages({ ${readCmd} })

df <- as.data.frame(lapply(df, function(x) {
  if (inherits(x, "haven_labelled") || inherits(x, "labelled")) return(as.character(x))
  if (is.factor(x)) return(as.character(x))
  x
}), stringsAsFactors = FALSE)

col_info <- lapply(names(df), function(nm) {
  col <- df[[nm]]
  ct <- if (is.numeric(col)) "numeric" else if (is.logical(col)) "logical" else "character"
  r <- list(name=nm, type=ct, missingCount=sum(is.na(col)), uniqueCount=length(unique(na.omit(col))))
  if (ct=="numeric") {
    r[["min"]]<-round(min(col,na.rm=T),4); r[["max"]]<-round(max(col,na.rm=T),4)
    r[["mean"]]<-round(mean(col,na.rm=T),4); r[["sd"]]<-round(sd(col,na.rm=T),4)
  }
  r
})
preview <- lapply(seq_len(min(nrow(df),500)), function(i) {
  row <- as.list(df[i,])
  lapply(row, function(v) if (length(v)==1 && is.na(v)) NULL else v)
})
cat(toJSON(list(success=TRUE,data=list(rows=nrow(df),columns=col_info,preview=preview)),
  auto_unbox=TRUE, null="null"))
`
        const rResult = await psychr.r?.run(inspectScript)
        if (!rResult) {
          setImportError('R is not available. Install R from https://cran.r-project.org to open XLSX / SAV / RDS files. CSV files work without R.')
          return
        }
        if (!rResult.success) {
          setImportError(`R error: ${rResult.error || rResult.stderr || 'Unknown error'}`)
          return
        }
        const d = (rResult.data ?? rResult) as Record<string, unknown>
        columns = (d.columns as DataColumn[]) ?? []
        data = (d.preview as Record<string, unknown>[]) ?? []
      }

      // ── Step 3: store dataset ─────────────────────────────────────────────
      const dataset: Dataset = {
        id: `dataset_${Date.now()}`,
        name: fileName,
        path: filePath,
        rows: data.length,
        columns,
        data,
        isDuckDB: false,
        importedAt: new Date(),
      }
      addDataset(dataset)
      appendToScript(`# Import dataset\n${readCmd}\n`)

    } finally {
      setIsLoading(false)
    }
  }, [addDataset, appendToScript])

  // Cap visible rows to 500 for performance — the full dataset is always in memory
  // and sent to R; this only limits what the HTML table renders.
  const MAX_DISPLAY_ROWS = 500

  const filteredData = filterText
    ? displayData.filter((row) =>
        Object.values(row).some((v) =>
          String(v).toLowerCase().includes(filterText.toLowerCase())
        )
      )
    : displayData

  const visibleData = filteredData.slice(0, MAX_DISPLAY_ROWS)
  const isTruncated = filteredData.length > MAX_DISPLAY_ROWS

  const selectedColInfo = displayColumns.find((c) => c.name === selectedCol)

  return (
    <WorkspaceLayout
      leftWidth="280px"
      left={
        <div className="flex flex-col h-full">
          {/* Tab toggle */}
          <div className="flex border-b border-gray-200 bg-white shrink-0">
            <button
              onClick={() => setLeftTab('variables')}
              className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
                leftTab === 'variables'
                  ? 'border-psychr-midblue text-psychr-midblue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Variables
            </button>
            <button
              onClick={() => setLeftTab('wrangle')}
              className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
                leftTab === 'wrangle'
                  ? 'border-psychr-midblue text-psychr-midblue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Wrangle
            </button>
          </div>

          {/* Variables panel */}
          {leftTab === 'variables' && (
            <>
              <div className="flex-1 overflow-y-auto">
                {displayColumns.map((col) => (
                  <button
                    key={col.name}
                    onClick={() => setSelectedCol(col.name === selectedCol ? null : col.name)}
                    className={`
                      w-full text-left px-3 py-2.5 border-b border-gray-100
                      flex items-center gap-2 hover:bg-gray-50 transition-colors
                      ${selectedCol === col.name ? 'bg-psychr-accent' : ''}
                    `}
                  >
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${TYPE_COLORS[col.type]}`}
                    >
                      {col.type.slice(0, 3)}
                    </span>
                    <span className="text-sm font-medium text-gray-800 truncate">{col.name}</span>
                    {col.missingCount > 0 && (
                      <span className="ml-auto text-xs text-orange-500">{col.missingCount}NA</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Column details panel */}
              {selectedColInfo && (
                <div className="border-t border-gray-200 p-3 bg-white shrink-0">
                  <p className="text-xs font-semibold text-gray-700 mb-1">{selectedColInfo.name}</p>
                  <div className="space-y-0.5 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Type</span>
                      <span className="font-medium">{selectedColInfo.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Missing</span>
                      <span className="font-medium">{selectedColInfo.missingCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unique</span>
                      <span className="font-medium">{selectedColInfo.uniqueCount}</span>
                    </div>
                    {selectedColInfo.mean !== undefined && (
                      <div className="flex justify-between">
                        <span>Mean</span>
                        <span className="font-medium">{selectedColInfo.mean?.toFixed(2)}</span>
                      </div>
                    )}
                    {selectedColInfo.min !== undefined && (
                      <div className="flex justify-between">
                        <span>Range</span>
                        <span className="font-medium">{selectedColInfo.min} – {selectedColInfo.max}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Import button */}
              <div className="p-3 border-t border-gray-200 shrink-0 space-y-2">
                <button
                  onClick={handleImportFile}
                  disabled={isLoading}
                  className="w-full bg-psychr-midblue text-white text-sm font-medium py-2 px-3 rounded hover:bg-psychr-blue transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Importing...' : '+ Import Dataset'}
                </button>
                {importError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 leading-relaxed">
                    {importError}
                    <button
                      onClick={() => setImportError(null)}
                      className="ml-1 underline text-red-500"
                    >dismiss</button>
                  </div>
                )}
                <p className="text-xs text-gray-400 text-center">CSV · TSV · XLSX · SAV · RDS</p>
              </div>
            </>
          )}

          {/* Wrangling panel */}
          {leftTab === 'wrangle' && (
            <WranglingPanel onRun={runR} />
          )}
        </div>
      }
      center={
        <div className="flex flex-col h-full">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
            {isDemo && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                Demo data — import a file to get started
              </span>
            )}
            {isTruncated && (
              <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded">
                Showing first {MAX_DISPLAY_ROWS.toLocaleString()} of {filteredData.length.toLocaleString()} rows
              </span>
            )}
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter rows..."
              className="ml-auto text-sm border border-gray-300 rounded px-2 py-1 w-48 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
            />
            <span className="text-xs text-gray-500">
              {filteredData.length.toLocaleString()} rows
            </span>
          </div>

          {/* Data grid (simple HTML table for Phase 1 — AG Grid added in Phase 2) */}
          <div className="flex-1 overflow-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <th className="w-10 text-center text-xs text-gray-500 font-normal px-2 py-2 border-r border-gray-200 border-b">
                    #
                  </th>
                  {displayColumns.map((col) => (
                    <th
                      key={col.name}
                      className="text-left text-xs font-semibold text-gray-700 px-3 py-2 border-r border-gray-200 border-b whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-xs px-1 py-0.5 rounded font-mono ${TYPE_COLORS[col.type]}`}
                        >
                          {col.type === 'numeric' ? '1.0' : col.type === 'factor' ? 'f' : 'ab'}
                        </span>
                        {col.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleData.map((row, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="text-center text-xs text-gray-400 px-2 py-1.5 border-r border-gray-100">
                      {rowIdx + 1}
                    </td>
                    {displayColumns.map((col) => (
                      <td
                        key={col.name}
                        className="px-3 py-1.5 border-r border-gray-100 whitespace-nowrap font-mono text-xs"
                      >
                        {(row as any)[col.name] ?? <span className="text-gray-300">NA</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      }
      rightWidth="340px"
      right={<RConsole />}
    />
  )
}
