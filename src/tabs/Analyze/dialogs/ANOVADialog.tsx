/**
 * One-Way ANOVA Dialog
 *
 * Runs one-way ANOVA via aov() with optional Tukey/Bonferroni post-hoc tests.
 * Reports F statistic, partial η², and group means.
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

type PostHoc = 'none' | 'tukey' | 'bonferroni'

export function ANOVADialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric')
  const factorCols = (activeDataset?.columns ?? []).filter(
    (c) => c.type === 'factor' || c.type === 'character'
  )

  const [depVar, setDepVar] = useState('')
  const [groupVar, setGroupVar] = useState('')
  const [postHoc, setPostHoc] = useState<PostHoc>('tukey')
  const [leveneTest, setLeveneTest] = useState(true)

  const handleRun = async () => {
    if (!depVar || !groupVar) return

    const dep = depVar
    const grp = groupVar

    // df is injected by useRBridge from the active dataset
    const postHocScript = postHoc === 'tukey'
      ? `posthoc <- TukeyHSD(model)
posthoc_table <- as.data.frame(posthoc[[grp]])
posthoc_table$Comparison <- rownames(posthoc_table)
posthoc_rows <- lapply(seq_len(nrow(posthoc_table)), function(i) {
  list(
    Comparison = posthoc_table$Comparison[i],
    Difference = round(posthoc_table$diff[i], 3),
    Lower = round(posthoc_table$lwr[i], 3),
    Upper = round(posthoc_table$upr[i], 3),
    p_adj = ifelse(posthoc_table[["p adj"]][i] < .001, "< .001", round(posthoc_table[["p adj"]][i], 3))
  )
})`
      : postHoc === 'bonferroni'
      ? `ph <- pairwise.t.test(df[[dep]], df[[grp]], p.adjust.method = "bonferroni")
ph_mat <- ph$p.value
comps <- which(!is.na(ph_mat), arr.ind = TRUE)
posthoc_rows <- lapply(seq_len(nrow(comps)), function(i) {
  r <- comps[i, 1]; col <- comps[i, 2]
  list(
    Comparison = paste(rownames(ph_mat)[r], "vs", colnames(ph_mat)[col]),
    p_adj = ifelse(ph_mat[r, col] < .001, "< .001", round(ph_mat[r, col], 3))
  )
})`
      : `posthoc_rows <- list()`

    const rScript = `
library(jsonlite)

dep <- "${dep}"
grp <- "${grp}"
df[[grp]] <- factor(df[[grp]])

model <- aov(df[[dep]] ~ df[[grp]])
s <- summary(model)[[1]]

# Effect size: partial eta-squared
ss_between <- s[["Sum Sq"]][1]
ss_within <- s[["Sum Sq"]][2]
eta2 <- ss_between / (ss_between + ss_within)

# Group descriptives
group_means <- tapply(df[[dep]], df[[grp]], mean, na.rm = TRUE)
group_sds <- tapply(df[[dep]], df[[grp]], sd, na.rm = TRUE)
group_ns <- tapply(df[[dep]], df[[grp]], function(x) sum(!is.na(x)))

anova_table <- list(list(
  Source = "Between groups",
  df = s[["Df"]][1],
  SS = round(ss_between, 3),
  MS = round(s[["Mean Sq"]][1], 3),
  F = round(s[["F value"]][1], 3),
  p = ifelse(s[["Pr(>F)"]][1] < .001, "< .001", round(s[["Pr(>F)"]][1], 3)),
  eta2 = round(eta2, 3)
), list(
  Source = "Within groups (error)",
  df = s[["Df"]][2],
  SS = round(ss_within, 3),
  MS = round(s[["Mean Sq"]][2], 3),
  F = NA,
  p = NA,
  eta2 = NA
))

means_table <- lapply(names(group_means), function(g) {
  list(
    Group = g,
    N = group_ns[[g]],
    M = round(group_means[[g]], 3),
    SD = round(group_sds[[g]], 3)
  )
})

${postHocScript}

r_script_text <- paste0(
  "# One-Way ANOVA\\n",
  "model <- aov(", dep, " ~ ", grp, ", data = df)\\n",
  "summary(model)\\n",
  if ("${postHoc}" != "none") paste0("TukeyHSD(model)\\n") else ""
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = anova_table,
    means = means_table,
    posthoc = if (exists("posthoc_rows")) posthoc_rows else list()
  )
), auto_unbox = TRUE))
`

    const label = `One-Way ANOVA: ${dep} by ${grp}`
    const result = await onRun(rScript, label)
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: 'one-way-anova',
        label,
        params: { depVar: dep, groupVar: grp, postHoc },
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
            <h2 className="text-base font-semibold text-gray-900">One-Way ANOVA</h2>
            <p className="text-xs text-gray-500 mt-0.5">aov() + TukeyHSD · partial η²</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dependent Variable</label>
              <select
                value={depVar}
                onChange={(e) => setDepVar(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
              >
                <option value="">Select variable...</option>
                {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Factor (Grouping Variable)</label>
              <select
                value={groupVar}
                onChange={(e) => setGroupVar(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
              >
                <option value="">Select variable...</option>
                {factorCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Post-hoc Tests</p>
            <div className="flex gap-3">
              {([
                ['none', 'None'],
                ['tukey', "Tukey's HSD"],
                ['bonferroni', 'Bonferroni'],
              ] as [PostHoc, string][]).map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="posthoc"
                    value={val}
                    checked={postHoc === val}
                    onChange={() => setPostHoc(val)}
                    className="accent-psychr-midblue"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={leveneTest}
              onChange={(e) => setLeveneTest(e.target.checked)}
              className="accent-psychr-midblue"
            />
            <span className="text-sm text-gray-700">Levene's test for homogeneity of variance</span>
          </label>

          {!activeDataset && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              No dataset loaded — import a dataset on the Data tab before running this analysis.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">APA output · partial η² effect size</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">
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
