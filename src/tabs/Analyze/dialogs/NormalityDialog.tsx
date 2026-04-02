/**
 * Normality Tests Dialog
 *
 * Shapiro-Wilk and Kolmogorov-Smirnov tests for normality.
 * Also reports skewness, kurtosis, and APA-formatted interpretation.
 */

import { useMemo, useState } from 'react'
import { usePsychrStore } from '../../../store'
import { DialogShell, DialogFooter, NoDatasetWarning } from '../../../components/shared/DialogShell'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

export function NormalityDialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric'),
    [activeDataset?.columns]
  )

  const [selectedVars, setSelectedVars] = useState<string[]>([])
  const [includeKS, setIncludeKS]       = useState(false)
  const [alpha, setAlpha]               = useState('0.05')
  const [isRunning, setIsRunning]       = useState(false)

  const toggleVar = (name: string) =>
    setSelectedVars((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )

  const handleRun = async () => {
    const vars = selectedVars.length > 0 ? selectedVars : numericCols.map((c) => c.name)
    if (vars.length === 0) return
    setIsRunning(true)

    const varList = vars.map((v) => `"${v}"`).join(', ')

    // Kolmogorov-Smirnov section — only included if the option is checked
    const ksSection = includeKS
      ? `ks <- suppressWarnings(ks.test(x, "pnorm", mean(x), sd(x)))
  row[["D_KS"]] <- round(ks$statistic, 4)
  row[["p_KS"]] <- ifelse(ks$p.value < .001, "< .001", round(ks$p.value, 3))`
      : ''

    const rScript = `
library(jsonlite)

vars        <- intersect(c(${varList}), names(df))
alpha_level <- ${alpha}

rows <- lapply(vars, function(v) {
  x <- df[[v]][!is.na(df[[v]])]
  n <- length(x)

  # Shapiro-Wilk (best for 3 ≤ n ≤ 5000)
  sw <- if (n >= 3 && n <= 5000) shapiro.test(x) else list(statistic = NA, p.value = NA)

  skewness_val <- if (n > 2) {
    m3 <- mean((x - mean(x))^3)
    (m3 / sd(x)^3)
  } else NA

  kurtosis_val <- if (n > 3) {
    m4 <- mean((x - mean(x))^4)
    (m4 / sd(x)^4) - 3   # excess kurtosis
  } else NA

  row <- list(
    Variable = v,
    N        = n,
    W        = if (!is.na(sw$statistic)) round(sw$statistic, 4) else NA,
    p_SW     = if (!is.na(sw$p.value)) {
      ifelse(sw$p.value < .001, "< .001", round(sw$p.value, 3))
    } else "N/A (n > 5000)",
    Skewness = round(skewness_val, 3),
    Kurtosis = round(kurtosis_val, 3),
    Normal   = if (!is.na(sw$p.value)) ifelse(sw$p.value >= alpha_level, "Yes", "No") else "—"
  )

  ${ksSection}

  row
})

r_script_text <- paste0(
  "# Normality Tests (Shapiro-Wilk)\\n",
  paste(sapply(vars, function(v) paste0("shapiro.test(df$", v, ")")), collapse = "\\n"), "\\n"
)

cat(toJSON(list(
  success  = TRUE,
  r_script = r_script_text,
  data     = list(table = rows)
), auto_unbox = TRUE))
`

    const label = `Normality Tests: ${vars.length === numericCols.length ? 'all numeric' : vars.join(', ')}`
    const result = await onRun(rScript, label)
    setIsRunning(false)

    if (result) {
      addResult({
        id:        `result_${Date.now()}`,
        type:      'normality',
        label,
        params:    { variables: vars, includeKS, alpha: parseFloat(alpha) },
        output:    result as Record<string, unknown>,
        rScript:   (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <DialogShell
      title="Normality Tests"
      subtitle="Shapiro-Wilk · Kolmogorov-Smirnov · skewness/kurtosis"
      onClose={onClose}
      width="500px"
      footer={
        <DialogFooter
          onClose={onClose}
          onRun={handleRun}
          isRunning={isRunning}
          disabled={!activeDataset}
          hint="shapiro.test() · skewness · excess kurtosis"
        />
      }
    >
      <div className="p-5 space-y-5">
        {/* Variable selection */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Variables <span className="text-gray-400 font-normal">(leave empty for all numeric)</span>
          </p>
          {numericCols.length === 0 ? (
            <p className="text-xs text-gray-500">No numeric variables in dataset. Import data first.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-2">
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
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Options</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeKS}
              onChange={(e) => setIncludeKS(e.target.checked)}
              className="accent-psychr-midblue"
            />
            <span className="text-sm text-gray-700">
              Include Kolmogorov-Smirnov test
              <span className="text-gray-400 text-xs ml-1">(less powerful than Shapiro-Wilk)</span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Alpha level</label>
            <select
              value={alpha}
              onChange={(e) => setAlpha(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
            >
              <option value="0.05">α = .05</option>
              <option value="0.01">α = .01</option>
              <option value="0.10">α = .10</option>
            </select>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-psychr-accent border border-psychr-lightblue rounded-lg px-3 py-2 text-xs text-gray-600 space-y-1">
          <p><strong>Shapiro-Wilk</strong> is the most powerful test for n ≤ 5,000. A significant result (p &lt; α) indicates non-normality.</p>
          <p>Skewness &gt; |2| and kurtosis &gt; |7| may indicate meaningful departures from normality.</p>
        </div>

        {!activeDataset && <NoDatasetWarning />}
      </div>
    </DialogShell>
  )
}
