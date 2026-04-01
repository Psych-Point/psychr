/**
 * Correlation Dialog
 *
 * Pearson / Spearman / Kendall correlations.
 * Supports pairwise (two vars) or full correlation matrix.
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

type CorrMethod = 'pearson' | 'spearman' | 'kendall'

export function CorrelationDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric')

  const [mode, setMode] = useState<'pairwise' | 'matrix'>('pairwise')
  const [var1, setVar1] = useState('')
  const [var2, setVar2] = useState('')
  const [selectedVars, setSelectedVars] = useState<string[]>([])
  const [method, setMethod] = useState<CorrMethod>('pearson')
  const [showCI, setShowCI] = useState(true)

  const toggleVar = (name: string) => {
    setSelectedVars((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )
  }

  const handleRun = async () => {
    // df is injected by useRBridge from the active dataset
    let rScript = ''
    let label = ''

    if (mode === 'pairwise') {
      if (!var1 || !var2) return
      rScript = `
library(jsonlite)

v1 <- "${var1}"
v2 <- "${var2}"
method <- "${method}"

ct <- cor.test(df[[v1]], df[[v2]], method = method)
r <- ct$estimate
p <- ct$p.value
n <- sum(complete.cases(df[[v1]], df[[v2]]))

result_row <- list(
  Variable1 = v1,
  Variable2 = v2,
  r = round(r, 3),
  t = round(ct$statistic, 3),
  df = ct$parameter,
  p = ifelse(p < .001, "< .001", round(p, 3)),
  CI_lower = round(ct$conf.int[1], 3),
  CI_upper = round(ct$conf.int[2], 3),
  N = n,
  Interpretation = ifelse(abs(r) < .1, "negligible",
    ifelse(abs(r) < .3, "small",
      ifelse(abs(r) < .5, "medium", "large")))
)

r_script_text <- paste0(
  "# ", toupper(method), " Correlation\\n",
  "cor.test(df$", v1, ", df$", v2, ", method = \\"", method, "\\")\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(table = list(result_row))
), auto_unbox = TRUE))
`
      label = `${method.charAt(0).toUpperCase() + method.slice(1)} Correlation: ${v1} × ${v2}`
    } else {
      // Matrix mode
      if (selectedVars.length < 2) return
      const varList = selectedVars.map((v) => `"${v}"`).join(', ')
      rScript = `
library(jsonlite)

vars <- c(${varList})
method <- "${method}"

df_sub <- df[, intersect(vars, names(df)), drop = FALSE]
cor_mat <- cor(df_sub, method = method, use = "pairwise.complete.obs")
n_mat <- sapply(df_sub, function(x) sum(!is.na(x)))

# p-values via cor.test
pval_mat <- matrix(NA, ncol(cor_mat), ncol(cor_mat))
rownames(pval_mat) <- colnames(cor_mat)
colnames(pval_mat) <- colnames(cor_mat)
for (i in seq_len(ncol(cor_mat))) {
  for (j in seq_len(ncol(cor_mat))) {
    if (i != j) {
      ct <- cor.test(df_sub[[i]], df_sub[[j]], method = method)
      pval_mat[i, j] <- ct$p.value
    }
  }
}

# Build flat table: one row per variable with all correlations
table_rows <- lapply(rownames(cor_mat), function(row_var) {
  row_data <- list(Variable = row_var)
  for (col_var in colnames(cor_mat)) {
    r_val <- cor_mat[row_var, col_var]
    p_val <- pval_mat[row_var, col_var]
    if (row_var == col_var) {
      row_data[[col_var]] <- "—"
    } else {
      sig <- if (!is.na(p_val) && p_val < .001) "***"
             else if (!is.na(p_val) && p_val < .01) "**"
             else if (!is.na(p_val) && p_val < .05) "*"
             else ""
      row_data[[col_var]] <- paste0(round(r_val, 2), sig)
    }
  }
  row_data
})

r_script_text <- paste0(
  "# Correlation Matrix (", method, ")\\n",
  "cor(df[, c(", paste0('"', vars, '"', collapse = ", "), ")], method = \\"", method, "\\")\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(table = table_rows)
), auto_unbox = TRUE))
`
      label = `Correlation Matrix (${method}) — ${vars.length} variables`
    }

    const result = await onRun(rScript, label)
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: mode === 'pairwise' ? 'pearson' : 'correlation-matrix',
        label,
        params: { mode, method, var1, var2, selectedVars },
        output: result as Record<string, unknown>,
        rScript: result.r_script as string || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Correlation</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pearson · Spearman · Kendall</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Mode */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {([['pairwise', 'Two Variables'], ['matrix', 'Correlation Matrix']] as const).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setMode(val)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  mode === val ? 'bg-psychr-midblue text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* Method */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Method</p>
            <div className="flex gap-4">
              {(['pearson', 'spearman', 'kendall'] as CorrMethod[]).map((m) => (
                <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="method"
                    value={m}
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    className="accent-psychr-midblue"
                  />
                  <span className="text-sm text-gray-700 capitalize">{m}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Variable selection */}
          {mode === 'pairwise' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 1</label>
                <select
                  value={var1}
                  onChange={(e) => setVar1(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  {numericCols.length === 0 && <option value="anxiety">anxiety (demo)</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 2</label>
                <select
                  value={var2}
                  onChange={(e) => setVar2(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  {numericCols.length === 0 && <option value="depression">depression (demo)</option>}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Variables <span className="text-gray-400 font-normal">(select 2 or more; leave empty for all)</span>
              </p>
              {numericCols.length === 0 ? (
                <p className="text-xs text-gray-500">Using demo variables: anxiety, depression, gpa</p>
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
          )}

          {mode === 'pairwise' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showCI}
                onChange={(e) => setShowCI(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Show 95% confidence interval</span>
            </label>
          )}

          {!activeDataset && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              No dataset loaded — using demo data. Import a dataset on the Data tab.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">* p &lt; .05  ** p &lt; .01  *** p &lt; .001</p>
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
