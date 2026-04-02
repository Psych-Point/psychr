/**
 * Correlation Dialog
 *
 * Pearson / Spearman / Kendall correlations.
 * Supports pairwise (two vars) or full correlation matrix.
 */

import { useMemo, useState } from 'react'
import { usePsychrStore } from '../../../store'
import { DialogShell, DialogFooter, LabeledSelect, NoDatasetWarning } from '../../../components/shared/DialogShell'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

type CorrMethod = 'pearson' | 'spearman' | 'kendall'

export function CorrelationDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric'),
    [activeDataset?.columns]
  )

  const [mode, setMode] = useState<'pairwise' | 'matrix'>('pairwise')
  const [var1, setVar1] = useState('')
  const [var2, setVar2] = useState('')
  const [selectedVars, setSelectedVars] = useState<string[]>([])
  const [method, setMethod] = useState<CorrMethod>('pearson')
  const [showCI, setShowCI] = useState(true)
  const [isRunning, setIsRunning] = useState(false)

  const canRun = useMemo(() => {
    if (!activeDataset) return false
    if (mode === 'pairwise') return Boolean(var1 && var2)
    const vars = selectedVars.length >= 2 ? selectedVars : numericCols
    return vars.length >= 2
  }, [activeDataset, mode, var1, var2, selectedVars, numericCols])

  const toggleVar = (name: string) => {
    setSelectedVars((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )
  }

  const handleRun = async () => {
    if (!canRun) return
    setIsRunning(true)

    let rScript = ''
    let label = ''

    if (mode === 'pairwise') {
      rScript = `
library(jsonlite)

v1     <- "${var1}"
v2     <- "${var2}"
method <- "${method}"

ct <- cor.test(df[[v1]], df[[v2]], method = method)
r  <- ct$estimate
p  <- ct$p.value
n  <- sum(complete.cases(df[[v1]], df[[v2]]))

result_row <- list(
  Variable1      = v1,
  Variable2      = v2,
  r              = round(r, 3),
  t              = round(ct$statistic, 3),
  df             = ct$parameter,
  p              = ifelse(p < .001, "< .001", round(p, 3)),
  CI_lower       = round(ct$conf.int[1], 3),
  CI_upper       = round(ct$conf.int[2], 3),
  N              = n,
  Interpretation = ifelse(abs(r) < .1, "negligible",
                     ifelse(abs(r) < .3, "small",
                       ifelse(abs(r) < .5, "medium", "large")))
)

r_script_text <- paste0(
  "# ", toupper(method), " Correlation\\n",
  "cor.test(df$", v1, ", df$", v2, ", method = \\"", method, "\\")\\n"
)

cat(toJSON(list(
  success  = TRUE,
  r_script = r_script_text,
  data     = list(table = list(result_row))
), auto_unbox = TRUE))
`
      label = `${method.charAt(0).toUpperCase() + method.slice(1)} Correlation: ${var1} × ${var2}`

    } else {
      const vars = selectedVars.length >= 2
        ? selectedVars
        : numericCols.map((c) => c.name)
      const varList = vars.map((v) => `"${v}"`).join(', ')

      rScript = `
library(jsonlite)

vars   <- c(${varList})
method <- "${method}"

df_sub   <- df[, intersect(vars, names(df)), drop = FALSE]
cor_mat  <- cor(df_sub, method = method, use = "pairwise.complete.obs")

# Compute p-values for each pair via cor.test
pval_mat <- matrix(NA, ncol(cor_mat), ncol(cor_mat),
                   dimnames = list(colnames(cor_mat), colnames(cor_mat)))
for (i in seq_len(ncol(cor_mat))) {
  for (j in seq_len(ncol(cor_mat))) {
    if (i != j) {
      ct <- cor.test(df_sub[[i]], df_sub[[j]], method = method)
      pval_mat[i, j] <- ct$p.value
    }
  }
}

# Build flat table: one row per variable with all correlations as columns
table_rows <- lapply(rownames(cor_mat), function(row_var) {
  row_data <- list(Variable = row_var)
  for (col_var in colnames(cor_mat)) {
    r_val <- cor_mat[row_var, col_var]
    p_val <- pval_mat[row_var, col_var]
    if (row_var == col_var) {
      row_data[[col_var]] <- "—"
    } else {
      sig <- if (!is.na(p_val) && p_val < .001) "***"
             else if (!is.na(p_val) && p_val < .01)  "**"
             else if (!is.na(p_val) && p_val < .05)  "*"
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
  success  = TRUE,
  r_script = r_script_text,
  data     = list(table = table_rows)
), auto_unbox = TRUE))
`
      label = `Correlation Matrix (${method}) — ${vars.length} variables`
    }

    const result = await onRun(rScript, label)
    setIsRunning(false)

    if (result) {
      addResult({
        id:        `result_${Date.now()}`,
        type:      mode === 'pairwise' ? 'pearson' : 'correlation-matrix',
        label,
        params:    { mode, method, var1, var2, selectedVars },
        output:    result as Record<string, unknown>,
        rScript:   (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <DialogShell
      title="Correlation"
      subtitle="Pearson · Spearman · Kendall"
      onClose={onClose}
      footer={
        <DialogFooter
          onClose={onClose}
          onRun={handleRun}
          isRunning={isRunning}
          disabled={!canRun}
          hint="* p < .05  ** p < .01  *** p < .001"
        />
      }
    >
      <div className="p-5 space-y-5">
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
          <>
            <div className="grid grid-cols-2 gap-4">
              <LabeledSelect label="Variable 1" value={var1} onChange={setVar1}>
                {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </LabeledSelect>
              <LabeledSelect label="Variable 2" value={var2} onChange={setVar2}>
                {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </LabeledSelect>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showCI}
                onChange={(e) => setShowCI(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Show 95% confidence interval</span>
            </label>
          </>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Variables <span className="text-gray-400 font-normal">(select 2 or more; leave empty for all)</span>
            </p>
            {numericCols.length === 0 ? (
              <p className="text-xs text-gray-500">Load a dataset with numeric variables first.</p>
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

        {!activeDataset && <NoDatasetWarning />}
      </div>
    </DialogShell>
  )
}
