/**
 * RConsole — Bidirectional R interface.
 *
 * Two tabs:
 *   Session Script — accumulated read-only R code from all point-and-click actions
 *   Console       — Monaco editor where you can write and run any R code;
 *                   results update the active dataset in real time.
 */

import { useState, useCallback } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { usePsychrStore, DataColumn } from '../../store'

// Use locally installed monaco-editor instead of CDN — works offline and in Electron
loader.config({ monaco })

function buildStarterCode(columns: { name: string; type: string }[] = []): string {
  const numCols = columns.filter((c) => c.type === 'numeric').map((c) => c.name)
  const catCols = columns.filter((c) => c.type === 'factor' || c.type === 'character').map((c) => c.name)

  const filterExample = numCols.length > 0
    ? `filter(${numCols[0]} > 0)`
    : catCols.length > 0
      ? `filter(!is.na(${catCols[0]}))`
      : `filter(!is.na(.data[[names(df)[1]]]))`

  const mutateExample = numCols.length > 0
    ? `mutate(${numCols[0]}_z = scale(${numCols[0]})[,1])`
    : `mutate(row_id = row_number())`

  const colComment = columns.length > 0
    ? `# Columns: ${columns.slice(0, 6).map((c) => c.name).join(', ')}${columns.length > 6 ? ', …' : ''}`
    : '# No dataset loaded — import data on the Data tab first'

  return `# df is your active dataset
library(dplyr)
${colComment}

df <- df %>%
  ${filterExample} %>%
  ${mutateExample}

# Return df to update the dataset in PsychR:
df
`
}

export function RConsole() {
  const [activeTab, setActiveTab] = useState<'script' | 'console'>('script')
  const [code, setCode] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const sessionScript = usePsychrStore((s) => s.sessionScript)
  const clearScript = usePsychrStore((s) => s.clearScript)
  const appendToScript = usePsychrStore((s) => s.appendToScript)
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const updateDataset = usePsychrStore((s) => s.updateDataset)

  const currentCode = code ?? buildStarterCode(activeDataset?.columns ?? [])

  const handleCopyScript = () => {
    navigator.clipboard.writeText(sessionScript).catch(() => {})
  }

  const handleRun = useCallback(async () => {
    setIsRunning(true)
    setRunError(null)
    setOutput(null)

    // Build data injection
    let dataInjection = ''
    if (activeDataset?.data?.length) {
      const rows = activeDataset.data.slice(0, 5000)
      const json = JSON.stringify(rows)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
      dataInjection = `df <- as.data.frame(jsonlite::fromJSON('${json}'), stringsAsFactors = FALSE)\ndf <- type.convert(df, as.is = TRUE)\n`
    }

    const wrappedScript = `
library(jsonlite)
library(dplyr)

${dataInjection}

# ── User code ─────────────────────────────────────────────────────────────────
${currentCode}
# ─────────────────────────────────────────────────────────────────────────────

# Capture the last expression if it's a data frame
if (exists("df") && is.data.frame(df)) {
  n_rows <- nrow(df)
  n_cols <- ncol(df)

  col_info <- lapply(names(df), function(col_name) {
    col <- df[[col_name]]
    col_type <- if (is.numeric(col)) "numeric"
                else if (is.factor(col)) "factor"
                else if (is.logical(col)) "logical"
                else "character"
    result <- list(name = col_name, type = col_type,
                   missingCount = sum(is.na(col)),
                   uniqueCount = length(unique(col[!is.na(col)])))
    if (col_type == "numeric") {
      result$min  <- round(min(col, na.rm = TRUE), 4)
      result$max  <- round(max(col, na.rm = TRUE), 4)
      result$mean <- round(mean(col, na.rm = TRUE), 4)
      result$sd   <- round(sd(col, na.rm = TRUE), 4)
    }
    result
  })

  preview <- lapply(seq_len(min(nrow(df), 200)), function(i) {
    row <- as.list(df[i, , drop = FALSE])
    lapply(row, function(v) if (length(v) == 0 || (length(v) == 1 && is.na(v))) NULL else v)
  })

  cat(toJSON(list(
    success    = TRUE,
    r_script   = ${JSON.stringify(currentCode)},
    has_df     = TRUE,
    data = list(
      rows     = n_rows,
      columns  = col_info,
      preview  = preview,
      message  = paste0("df updated: ", n_rows, " rows × ", n_cols, " columns")
    )
  ), auto_unbox = TRUE, null = "null"))
} else {
  # No df — just report success
  cat(toJSON(list(
    success  = TRUE,
    r_script = ${JSON.stringify(currentCode)},
    has_df   = FALSE,
    data     = list(message = "Code ran successfully (no df returned)")
  ), auto_unbox = TRUE))
}
`

    try {
      // @ts-expect-error
      const psychr = window.psychr
      if (!psychr?.r?.run) {
        setRunError('R is not connected. Run the app via Electron (npm run dev) to execute code.')
        setIsRunning(false)
        return
      }

      const result = await psychr.r.run(wrappedScript)

      if (!result.success) {
        setRunError(result.error || result.stderr || 'R error')
        setIsRunning(false)
        return
      }

      // has_df is on the top-level result; rows/columns/preview are inside result.data
      const rData = (result.data ?? result) as Record<string, unknown>

      // If the script returned a modified df, update the active dataset
      if (result.has_df && activeDataset) {
        updateDataset(activeDataset.id, {
          rows: rData.rows as number,
          columns: rData.columns as DataColumn[],
          data: rData.preview as Record<string, unknown>[],
        })
      }

      setOutput((rData.message as string) || (result.has_df ? 'Dataset updated.' : 'Done.'))
      appendToScript(currentCode)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to run R')
    } finally {
      setIsRunning(false)
    }
  }, [currentCode, activeDataset, updateDataset, appendToScript])

  return (
    <div className="flex flex-col h-full">
      {/* Tab switcher */}
      <div className="flex items-center border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => setActiveTab('script')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'script'
              ? 'border-psychr-midblue text-psychr-midblue'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Session Script
        </button>
        <button
          onClick={() => setActiveTab('console')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'console'
              ? 'border-psychr-midblue text-psychr-midblue'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          R Console
        </button>
      </div>

      {/* Session Script tab */}
      {activeTab === 'script' && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 shrink-0">
            <p className="text-xs text-gray-400">Auto-generated · fully reproducible</p>
            <div className="flex gap-1.5">
              <button
                onClick={handleCopyScript}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded"
              >
                Copy
              </button>
              <button
                onClick={clearScript}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded"
              >
                Clear
              </button>
            </div>
          </div>
          <pre className="flex-1 overflow-auto p-3 text-xs font-mono bg-gray-950 text-green-400 leading-relaxed">
            {sessionScript}
          </pre>
        </div>
      )}

      {/* R Console tab */}
      {activeTab === 'console' && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Info bar */}
          <div className="px-3 py-1.5 bg-gray-900 text-xs text-gray-400 shrink-0 flex items-center gap-2">
            <span className="text-green-400 font-mono">R&gt;</span>
            <span>
              {activeDataset
                ? `df = ${activeDataset.rows} rows × ${activeDataset.columns.length} cols (${activeDataset.name})`
                : 'No dataset — import data first'}
            </span>
          </div>

          {/* Monaco editor */}
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              defaultLanguage="r"
              theme="vs-dark"
              value={currentCode}
              onChange={(val) => setCode(val ?? '')}
              options={{
                fontSize: 12,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                wordWrap: 'on',
                padding: { top: 8 },
                automaticLayout: true,
              }}
            />
          </div>

          {/* Controls + output */}
          <div className="shrink-0 border-t border-gray-700 bg-gray-900">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                {isRunning && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-400">
                    <div className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Running…
                  </div>
                )}
                {!isRunning && output && (
                  <span className="text-xs text-green-400 font-mono">{output}</span>
                )}
                {!isRunning && runError && (
                  <span className="text-xs text-red-400 font-mono truncate max-w-xs">{runError}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setOutput(null); setRunError(null); setCode(null) }}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                >
                  Reset
                </button>
                <button
                  onClick={handleRun}
                  disabled={isRunning || !activeDataset}
                  className="text-xs font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-4 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                >
                  {isRunning ? 'Running…' : '▶ Run'}
                </button>
              </div>
            </div>
            {runError && (
              <div className="px-3 pb-2 text-xs font-mono text-red-400 bg-red-950/30 max-h-24 overflow-auto">
                {runError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
