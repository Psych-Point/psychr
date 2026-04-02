/**
 * One-Way ANOVA Dialog
 *
 * Runs one-way ANOVA via aov() with optional Tukey/Bonferroni post-hoc tests.
 * Reports F statistic, partial η², and group means.
 */

import { useMemo, useState } from 'react'
import { usePsychrStore } from '../../../store'
import { DialogShell, DialogFooter, LabeledSelect, NoDatasetWarning } from '../../../components/shared/DialogShell'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
}

type PostHoc = 'none' | 'tukey' | 'bonferroni'

export function ANOVADialog({ onClose, onRun }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric'),
    [activeDataset?.columns]
  )
  const factorCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'factor' || c.type === 'character'),
    [activeDataset?.columns]
  )

  const [depVar, setDepVar] = useState('')
  const [groupVar, setGroupVar] = useState('')
  const [postHoc, setPostHoc] = useState<PostHoc>('tukey')
  const [leveneTest, setLeveneTest] = useState(true)
  const [isRunning, setIsRunning] = useState(false)

  const canRun = Boolean(activeDataset && depVar && groupVar)

  const handleRun = async () => {
    if (!canRun) return
    setIsRunning(true)

    const dep = depVar
    const grp = groupVar

    // Post-hoc R code snippet — inlined into the main script below
    const postHocScript = postHoc === 'tukey'
      ? `posthoc <- TukeyHSD(model)
posthoc_table <- as.data.frame(posthoc[[1]])
posthoc_table$Comparison <- rownames(posthoc_table)
posthoc_rows <- lapply(seq_len(nrow(posthoc_table)), function(i) {
  list(
    Comparison = posthoc_table$Comparison[i],
    Difference = round(posthoc_table$diff[i], 3),
    Lower      = round(posthoc_table$lwr[i], 3),
    Upper      = round(posthoc_table$upr[i], 3),
    p_adj      = ifelse(posthoc_table[["p adj"]][i] < .001, "< .001",
                        round(posthoc_table[["p adj"]][i], 3))
  )
})`
      : postHoc === 'bonferroni'
      ? `ph <- pairwise.t.test(df[[dep]], df[[grp]], p.adjust.method = "bonferroni")
ph_mat <- ph$p.value
comps  <- which(!is.na(ph_mat), arr.ind = TRUE)
posthoc_rows <- lapply(seq_len(nrow(comps)), function(i) {
  r <- comps[i, 1]; col <- comps[i, 2]
  list(
    Comparison = paste(rownames(ph_mat)[r], "vs", colnames(ph_mat)[col]),
    p_adj      = ifelse(ph_mat[r, col] < .001, "< .001", round(ph_mat[r, col], 3))
  )
})`
      : `posthoc_rows <- list()`

    const rScript = `
library(jsonlite)

dep <- "${dep}"
grp <- "${grp}"
df[[grp]] <- factor(df[[grp]])

model <- aov(df[[dep]] ~ df[[grp]])
s     <- summary(model)[[1]]

# Effect size: partial eta-squared
ss_between <- s[["Sum Sq"]][1]
ss_within  <- s[["Sum Sq"]][2]
eta2       <- ss_between / (ss_between + ss_within)

# Group descriptives
group_means <- tapply(df[[dep]], df[[grp]], mean, na.rm = TRUE)
group_sds   <- tapply(df[[dep]], df[[grp]], sd,   na.rm = TRUE)
group_ns    <- tapply(df[[dep]], df[[grp]], function(x) sum(!is.na(x)))

anova_table <- list(
  list(
    Source = "Between groups",
    df     = s[["Df"]][1],
    SS     = round(ss_between, 3),
    MS     = round(s[["Mean Sq"]][1], 3),
    F      = round(s[["F value"]][1], 3),
    p      = ifelse(s[["Pr(>F)"]][1] < .001, "< .001", round(s[["Pr(>F)"]][1], 3)),
    eta2   = round(eta2, 3)
  ),
  list(
    Source = "Within groups (error)",
    df     = s[["Df"]][2],
    SS     = round(ss_within, 3),
    MS     = round(s[["Mean Sq"]][2], 3),
    F      = NA, p = NA, eta2 = NA
  )
)

means_table <- lapply(names(group_means), function(g) {
  list(Group = g, N = group_ns[[g]], M = round(group_means[[g]], 3), SD = round(group_sds[[g]], 3))
})

${postHocScript}

r_script_text <- paste0(
  "# One-Way ANOVA\\n",
  "model <- aov(", dep, " ~ ", grp, ", data = df)\\n",
  "summary(model)\\n",
  if ("${postHoc}" == "tukey") "TukeyHSD(model)\\n"
  else if ("${postHoc}" == "bonferroni")
    paste0("pairwise.t.test(df$", dep, ", df$", grp, ", p.adjust.method = 'bonferroni')\\n")
  else ""
)

cat(toJSON(list(
  success  = TRUE,
  r_script = r_script_text,
  data     = list(
    table   = anova_table,
    means   = means_table,
    posthoc = if (exists("posthoc_rows")) posthoc_rows else list()
  )
), auto_unbox = TRUE))
`

    const label = `One-Way ANOVA: ${dep} by ${grp}`
    const result = await onRun(rScript, label)
    setIsRunning(false)

    if (result) {
      addResult({
        id:        `result_${Date.now()}`,
        type:      'one-way-anova',
        label,
        params:    { depVar: dep, groupVar: grp, postHoc },
        output:    result as Record<string, unknown>,
        rScript:   (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <DialogShell
      title="One-Way ANOVA"
      subtitle="aov() + TukeyHSD · partial η²"
      onClose={onClose}
      footer={
        <DialogFooter
          onClose={onClose}
          onRun={handleRun}
          isRunning={isRunning}
          disabled={!canRun}
          hint="APA output · partial η² effect size"
        />
      }
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <LabeledSelect label="Dependent Variable" value={depVar} onChange={setDepVar}>
            {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </LabeledSelect>
          <LabeledSelect label="Factor (Grouping Variable)" value={groupVar} onChange={setGroupVar}>
            {factorCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </LabeledSelect>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Post-hoc Tests</p>
          <div className="flex gap-3">
            {([
              ['none',        'None'],
              ['tukey',       "Tukey's HSD"],
              ['bonferroni',  'Bonferroni'],
            ] as [PostHoc, string][]).map(([val, lbl]) => (
              <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="posthoc"
                  value={val}
                  checked={postHoc === val}
                  onChange={() => setPostHoc(val)}
                  className="accent-psychr-midblue"
                />
                <span className="text-sm text-gray-700">{lbl}</span>
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

        {!activeDataset && <NoDatasetWarning />}
      </div>
    </DialogShell>
  )
}
