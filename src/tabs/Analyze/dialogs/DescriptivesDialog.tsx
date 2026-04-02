/**
 * Descriptive Statistics Dialog
 *
 * Select variables, choose statistics to include, run analysis.
 * Generates psych::describe() or pastecs::stat.desc() R output.
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

export function DescriptivesDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = (activeDataset?.columns ?? []).filter(
    (c) => c.type === 'numeric'
  )
  const [selectedVars, setSelectedVars] = useState<string[]>([])
  const [options, setOptions] = useState({
    mean: true,
    sd: true,
    median: true,
    min: true,
    max: true,
    skew: true,
    kurtosis: true,
    normality: false,
  })

  const toggleVar = (name: string) => {
    setSelectedVars((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )
  }

  const handleRun = async () => {
    const vars = selectedVars.length > 0 ? selectedVars : numericCols.map((c) => c.name)
    if (vars.length === 0) return

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
    N = desc_df[var, "n"],
    Mean = round(desc_df[var, "mean"], 3),
    SD = round(desc_df[var, "sd"], 3),
    Median = round(desc_df[var, "median"], 3),
    Min = round(desc_df[var, "min"], 3),
    Max = round(desc_df[var, "max"], 3),
    Skew = round(desc_df[var, "skew"], 3),
    Kurtosis = round(desc_df[var, "kurtosis"], 3)
  )
})

r_script_text <- paste0(
  "library(psych)\\n",
  "desc <- describe(df[, c(", paste0('"', vars, '"', collapse = ", "), ")])\\n",
  "print(desc)"
)

cat(toJSON(list(
  success = TRUE,
  label = "Descriptive Statistics",
  r_script = r_script_text,
  data = list(table = result_table)
), auto_unbox = TRUE))
`

    const result = await onRun(rScript, 'Descriptive Statistics')
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: 'descriptive-stats',
        label: 'Descriptive Statistics',
        params: { variables: vars },
        output: result as Record<string, unknown>,
        rScript: result.r_script as string || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Descriptive Statistics</h2>
            <p className="text-xs text-gray-500 mt-0.5">Powered by psych::describe()</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Variable selection */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Variables <span className="text-gray-400 font-normal">(leave empty to select all)</span>
            </p>
            {numericCols.length === 0 ? (
              <p className="text-xs text-gray-500">
                No numeric variables in dataset. Import data first.
              </p>
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

          {/* Options */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Statistics to include</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(options).map(([key, val]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={() => setOptions((o) => ({ ...o, [key]: !o[key as keyof typeof o] }))}
                    className="accent-psychr-midblue"
                  />
                  <span className="text-sm text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">
            APA-formatted output · R script auto-generated
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRun}
              className="px-5 py-1.5 text-sm font-medium bg-psychr-midblue text-white rounded hover:bg-psychr-blue transition-colors"
            >
              Run Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
