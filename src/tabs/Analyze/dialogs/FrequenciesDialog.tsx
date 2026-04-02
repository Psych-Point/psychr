/**
 * Frequencies Dialog
 *
 * Frequency tables and proportions for categorical and numeric variables.
 * Uses base R table() and prop.table().
 */

import { useMemo, useState } from 'react'
import { usePsychrStore } from '../../../store'
import { DialogShell, DialogFooter, NoDatasetWarning } from '../../../components/shared/DialogShell'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

export function FrequenciesDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const allCols = useMemo(() => activeDataset?.columns ?? [], [activeDataset?.columns])

  const [selectedVars, setSelectedVars]     = useState<string[]>([])
  const [showPercent, setShowPercent]       = useState(true)
  const [showCumulative, setShowCumulative] = useState(false)
  const [sortByFreq, setSortByFreq]         = useState(false)
  const [isRunning, setIsRunning]           = useState(false)

  const toggleVar = (name: string) =>
    setSelectedVars((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )

  const handleRun = async () => {
    const vars = selectedVars.length > 0 ? selectedVars : allCols.map((c) => c.name)
    if (vars.length === 0) return
    setIsRunning(true)

    const varList = vars.map((v) => `"${v}"`).join(', ')

    const rScript = `
library(jsonlite)

vars <- intersect(c(${varList}), names(df))

all_tables <- list()
for (v in vars) {
  freq  <- table(df[[v]], useNA = "ifany")
  if (${sortByFreq ? 'TRUE' : 'FALSE'}) freq <- sort(freq, decreasing = TRUE)
  n_total  <- sum(freq)
  pct      <- round(prop.table(freq) * 100, 1)
  cum_freq <- cumsum(as.integer(freq))
  cum_pct  <- round(cumsum(as.numeric(prop.table(freq))) * 100, 1)

  rows <- lapply(seq_along(freq), function(i) {
    row <- list(Value = names(freq)[i], Frequency = as.integer(freq[i]))
    if (${showPercent   ? 'TRUE' : 'FALSE'}) row[["Percent"]]  <- paste0(pct[i], "%")
    if (${showCumulative ? 'TRUE' : 'FALSE'}) {
      row[["Cum_Freq"]] <- cum_freq[i]
      row[["Cum_Pct"]]  <- paste0(cum_pct[i], "%")
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
  success  = TRUE,
  r_script = r_script_text,
  data     = list(tables = all_tables, variables = vars)
), auto_unbox = TRUE))
`

    const label = `Frequencies: ${vars.length === allCols.length ? 'all variables' : vars.join(', ')}`
    const result = await onRun(rScript, label)
    setIsRunning(false)

    if (result) {
      addResult({
        id:        `result_${Date.now()}`,
        type:      'frequencies',
        label,
        params:    { variables: vars },
        output:    result as Record<string, unknown>,
        rScript:   (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <DialogShell
      title="Frequencies"
      subtitle="Counts, percentages, and cumulative frequencies"
      onClose={onClose}
      width="500px"
      footer={
        <DialogFooter
          onClose={onClose}
          onRun={handleRun}
          isRunning={isRunning}
          disabled={!activeDataset}
          hint="table() · prop.table() · includes NA counts"
        />
      }
    >
      <div className="p-5 space-y-5">
        {/* Variable selection */}
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

        {/* Options */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Options</p>
          {[
            [showPercent,    setShowPercent,    'Show percentages'],
            [showCumulative, setShowCumulative, 'Show cumulative frequencies'],
            [sortByFreq,     setSortByFreq,     'Sort by frequency (descending)'],
          ].map(([val, setter, lbl]) => (
            <label key={lbl as string} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={val as boolean}
                onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">{lbl as string}</span>
            </label>
          ))}
        </div>

        {!activeDataset && <NoDatasetWarning />}
      </div>
    </DialogShell>
  )
}
