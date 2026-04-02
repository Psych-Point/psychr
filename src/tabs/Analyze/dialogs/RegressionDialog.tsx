/**
 * Linear Regression Dialog
 *
 * Simple and multiple linear regression via lm().
 * Reports coefficients, R², F-statistic, and standardized betas.
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

export function RegressionDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric')

  const [outcome, setOutcome] = useState('')
  const [predictors, setPredictors] = useState<string[]>([])
  const [showStdBeta, setShowStdBeta] = useState(true)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const togglePredictor = (name: string) => {
    setPredictors((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )
  }

  const handleRun = async () => {
    if (!outcome || predictors.length === 0) return
    const dep = outcome
    const preds = predictors
    const predList = preds.map((v) => `"${v}"`).join(', ')

    // df is injected by useRBridge from the active dataset
    const rScript = `
library(jsonlite)

dep <- "${dep}"
preds <- c(${predList})

# Subset to complete cases
df_sub <- df[, c(dep, intersect(preds, names(df))), drop = FALSE]
df_sub <- df_sub[complete.cases(df_sub), ]

# Fit model
formula_str <- paste(dep, "~", paste(preds, collapse = " + "))
model <- lm(as.formula(formula_str), data = df_sub)
s <- summary(model)

# Model fit
r2 <- s$r.squared
adj_r2 <- s$adj.r.squared
f_stat <- s$fstatistic
f_p <- pf(f_stat[1], f_stat[2], f_stat[3], lower.tail = FALSE)
n <- nrow(df_sub)

# Coefficients table
coef_mat <- s$coefficients
coef_rows <- lapply(rownames(coef_mat), function(term) {
  b <- coef_mat[term, "Estimate"]
  se <- coef_mat[term, "Std. Error"]
  t_val <- coef_mat[term, "t value"]
  p_val <- coef_mat[term, "Pr(>|t|)"]

  # Standardized beta (skip intercept)
  std_beta <- if (term != "(Intercept)") {
    b * (sd(df_sub[[term]], na.rm = TRUE) / sd(df_sub[[dep]], na.rm = TRUE))
  } else NA

  list(
    Term = term,
    B = round(b, 3),
    SE = round(se, 3),
    Beta = if (!is.na(std_beta)) round(std_beta, 3) else NA,
    t = round(t_val, 3),
    p = ifelse(p_val < .001, "< .001", round(p_val, 3))
  )
})

model_fit <- list(
  R2 = round(r2, 3),
  Adj_R2 = round(adj_r2, 3),
  F = round(f_stat[1], 3),
  df1 = f_stat[2],
  df2 = f_stat[3],
  p = ifelse(f_p < .001, "< .001", round(f_p, 3)),
  N = n
)

r_script_text <- paste0(
  "# Linear Regression\\n",
  "model <- lm(", dep, " ~ ", paste(preds, collapse = " + "), ", data = df)\\n",
  "summary(model)\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = coef_rows,
    model_fit = model_fit
  )
), auto_unbox = TRUE))
`

    const label = `Linear Regression: ${dep} ~ ${preds.join(' + ')}`
    const result = await onRun(rScript, label)
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: preds.length === 1 ? 'linear-regression' : 'multiple-regression',
        label,
        params: { outcome: dep, predictors: preds },
        output: result as Record<string, unknown>,
        rScript: result.r_script as string || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[540px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Linear Regression</h2>
            <p className="text-xs text-gray-500 mt-0.5">lm() · R² · standardized β</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outcome Variable (Y)</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
            >
              <option value="">Select outcome...</option>
              {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {/* Predictors */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Predictor Variables (X)
              <span className="text-gray-400 font-normal ml-1">(select one or more)</span>
            </p>
            {numericCols.length === 0 ? (
              <p className="text-xs text-gray-500">Load a dataset with numeric variables first.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {numericCols
                  .filter((c) => c.name !== outcome)
                  .map((col) => (
                    <label key={col.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={predictors.includes(col.name)}
                        onChange={() => togglePredictor(col.name)}
                        className="accent-psychr-midblue"
                      />
                      <span className="text-sm text-gray-800">{col.name}</span>
                    </label>
                  ))}
              </div>
            )}
            {predictors.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Formula: <span className="font-mono">{outcome || 'Y'} ~ {predictors.join(' + ')}</span>
              </p>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showStdBeta}
                onChange={(e) => setShowStdBeta(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Standardized coefficients (β)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDiagnostics}
                onChange={(e) => setShowDiagnostics(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Model diagnostics (AIC, BIC, residual SE)</span>
            </label>
          </div>

          {!activeDataset && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              No dataset loaded — import a dataset on the Data tab before running this analysis.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">APA output · R² · β coefficients</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
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
