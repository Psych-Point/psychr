/**
 * Descriptive Statistics Dialog
 *
 * Select variables, choose statistics to include, run analysis.
 * Generates psych::describe() output formatted as an APA-style table.
 */

import { useMemo, useState } from 'react'
import { usePsychrStore } from '../../../store'
import { DialogShell, DialogFooter, NoDatasetWarning } from '../../../components/shared/DialogShell'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

export function DescriptivesDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  // Memoize column filtering so it doesn't recompute on every render
  const numericCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric'),
    [activeDataset?.columns]
  )

  const [selectedVars, setSelectedVars] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const toggleVar = (name: string) => {
    setSelectedVars((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )
  }

  const handleRun = async () => {
    const vars = selectedVars.length > 0 ? selectedVars : numericCols.map((c) => c.name)
    if (vars.length === 0) {
      setRunError('No numeric variables found. Make sure your dataset has numeric columns.')
      return
    }

    setIsRunning(true)
    setRunError(null)

    const varList = vars.map((v) => `"${v}"`).join(', ')
    const rScript = `
library(psych)
library(jsonlite)

selected_vars <- c(${varList})
df_sub <- df[, intersect(selected_vars, names(df)), drop = FALSE]

desc <- describe(df_sub)
desc_df <- as.data.frame(desc)

result_table <- lapply(rownames(desc_df), function(var) {
  list(
    Variable = var,
    N        = desc_df[var, "n"],
    Mean     = round(desc_df[var, "mean"], 3),
    SD       = round(desc_df[var, "sd"], 3),
    Median   = round(desc_df[var, "median"], 3),
    Min      = round(desc_df[var, "min"], 3),
    Max      = round(desc_df[var, "max"], 3),
    Skew     = round(desc_df[var, "skew"], 3),
    Kurtosis = round(desc_df[var, "kurtosis"], 3)
  )
})

r_script_text <- paste0(
  "library(psych)\\n",
  "desc <- describe(df[, c(", paste0('"', selected_vars, '"', collapse = ", "), ")])\\n",
  "print(desc)"
)

cat(toJSON(list(
  success  = TRUE,
  label    = "Descriptive Statistics",
  r_script = r_script_text,
  data     = list(table = result_table)
), auto_unbox = TRUE))
`

    const result = await onRun(rScript, 'Descriptive Statistics')
    setIsRunning(false)

    if (result) {
      addResult({
        id:        `result_${Date.now()}`,
        type:      'descriptive-stats',
        label:     'Descriptive Statistics',
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
      title="Descriptive Statistics"
      subtitle="Powered by psych::describe()"
      onClose={onClose}
      footer={
        <DialogFooter
          onClose={onClose}
          onRun={handleRun}
          isRunning={isRunning}
          disabled={!activeDataset}
        />
      }
    >
      <div className="p-5 space-y-5">
        {/* Variable selection */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Variables <span className="text-gray-400 font-normal">(leave empty to select all)</span>
          </p>
          {numericCols.length === 0 ? (
            <p className="text-xs text-gray-500">No numeric variables in dataset. Import data first.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {numericCols.map((col) => (
                <label key={col.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedVars.includes(col.name)}
                    onChange={() => toggleVar(col.name)}
                    className="accent-psychr-midblue"
                  />
                  <span className="text-sm text-gray-800">{col.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Inline error */}
        {runError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-start justify-between gap-2">
            <span>{runError}</span>
            <button onClick={() => setRunError(null)} className="text-red-400 hover:text-red-600 shrink-0">×</button>
          </div>
        )}

        {!activeDataset && <NoDatasetWarning />}
      </div>
    </DialogShell>
  )
}
