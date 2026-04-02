/**
 * Frequencies Dialog
 *
 * Frequency tables and proportions for categorical and numeric variables.
 * Uses base R table() and prop.table().
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

export function FrequenciesDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const allCols = activeDataset?.columns ?? []
  const [selectedVars, setSelectedVars] = useState<string[]>([])
  const [showPercent, setShowPercent] = useState(true)
  const [showCumulative, setShowCumulative] = useState(false)
  const [sortByFreq, setSortByFreq] = useState(false)

  const toggleVar = (name: string) =>
    setSelectedVars((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )

  const handleRun = async () => {
    const vars = selectedVars.length > 0 ? selectedVars : allCols.map((c) => c.name)
    if (vars.length === 0) return

    const varList = vars.map((v) => `"${v}"`).join(', ')

    const rScript = `
library(jsonlite)

vars <- c(${varList})
vars <- intersect(vars, names(df))

all_tables <- list()
for (v in vars) {
  freq <- table(df[[v]], useNA = "ifany")
  if (${sortByFreq ? 'TRUE' : 'FALSE'}) freq <- sort(freq, decreasing = TRUE)
  n_total <- sum(freq)
  pct <- round(prop.table(freq) * 100, 1)
  cum_freq <- cumsum(as.integer(freq))
  cum_pct <- round(cumsum(as.numeric(prop.table(freq))) * 100, 1)

  rows <- lapply(seq_along(freq), function(i) {
    row <- list(
      Value = names(freq)[i],
      Frequency = as.integer(freq[i])
    )
    if (${showPercent ? 'TRUE' : 'FALSE'}) row[["Percent"]] <- paste0(pct[i], "%")
    if (${showCumulative ? 'TRUE' : 'FALSE'}) {
      row[["Cum_Freq"]] <- cum_freq[i]
      row[["Cum_Pct"]] <- paste0(cum_pct[i], "%")
    }
    row
  })

  all_tables[[v]] <- rows
}

r_script_text <- paste0(
  "# Frequency tables\\n",
  paste(sapply(vars, function(v) paste0("table(df$", v, ")")), collapse = "\\n"), "\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    tables = all_tables,
    variables = vars
  )
), auto_unbox = TRUE))
`

    const label = `Frequencies: ${vars.length === allCols.length ? 'all variables' : vars.join(', ')}`
    const result = await onRun(rScript, label)
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: 'frequencies',
        label,
        params: { variables: vars },
        output: result as Record<string, unknown>,
        rScript: (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Frequencies</h2>
            <p className="text-xs text-gray-500 mt-0.5">Counts, percentages, and cumulative frequencies</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Variables <span className="text-gray-400 font-normal">(leave empty for all)</span>
            </p>
            {allCols.length === 0 ? (
              <p className="text-xs text-gray-500">No variables in dataset. Import data first.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {allCols.map((col) => (
                  <label key={col.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedVars.includes(col.name)}
                      onChange={() => toggleVar(col.name)}
                      className="accent-psychr-midblue"
                    />
                    <span className="text-sm text-gray-800">{col.name}</span>
                    <span className="text-xs text-gray-400">({col.type})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Options</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPercent}
                onChange={(e) => setShowPercent(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Show percentages</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showCumulative}
                onChange={(e) => setShowCumulative(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Show cumulative frequencies</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sortByFreq}
                onChange={(e) => setSortByFreq(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Sort by frequency (descending)</span>
            </label>
          </div>

          {!activeDataset && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              No dataset loaded — import a dataset on the Data tab before running this analysis.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">table() · prop.table() · includes NA counts</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
            <button
              onClick={handleRun}
              disabled={!activeDataset}
              className="px-5 py-1.5 text-sm font-medium bg-psychr-midblue text-white rounded hover:bg-psychr-blue transition-colors disabled:opacity-50"
            >
              Run Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
