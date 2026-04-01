/**
 * Tab 2: Analyze
 *
 * Core statistical analysis workspace.
 * Left: Analysis category tree
 * Center: Results output
 * Right: R script for current analysis
 */

import { useState } from 'react'
import { WorkspaceLayout, PanelHeader } from '../../components/layout/WorkspaceLayout'
import { usePsychrStore } from '../../store'
import { useRBridge } from '../../hooks/useRBridge'
import { RConsole } from '../../components/shared/RConsole'
import { DescriptivesDialog } from './dialogs/DescriptivesDialog'
import { TTestDialog } from './dialogs/TTestDialog'
import { ANOVADialog } from './dialogs/ANOVADialog'
import { CorrelationDialog } from './dialogs/CorrelationDialog'
import { RegressionDialog } from './dialogs/RegressionDialog'

// ─── Analysis Category Tree ────────────────────────────────────────────────────

interface AnalysisItem {
  id: string
  label: string
  description: string
  phase?: 'available' | 'coming-soon'
}

interface AnalysisCategory {
  id: string
  label: string
  icon: string
  items: AnalysisItem[]
}

const ANALYSIS_CATEGORIES: AnalysisCategory[] = [
  {
    id: 'descriptives',
    label: 'Descriptives',
    icon: '📋',
    items: [
      { id: 'descriptive-stats', label: 'Descriptive Statistics', description: 'M, SD, skew, kurtosis, normality', phase: 'available' },
      { id: 'frequencies', label: 'Frequencies', description: 'Counts and percentages for categorical vars', phase: 'available' },
      { id: 'normality', label: 'Normality Tests', description: 'Shapiro-Wilk, Kolmogorov-Smirnov', phase: 'available' },
    ],
  },
  {
    id: 'comparisons',
    label: 'Group Comparisons',
    icon: '⚖️',
    items: [
      { id: 'independent-t', label: 'Independent Samples t-test', description: 'Compare two independent groups — Cohen\'s d', phase: 'available' },
      { id: 'paired-t', label: 'Paired Samples t-test', description: 'Compare paired/repeated measures', phase: 'available' },
      { id: 'one-sample-t', label: 'One-Sample t-test', description: 'Test against a known value', phase: 'available' },
      { id: 'one-way-anova', label: 'One-Way ANOVA', description: 'Compare 3+ groups — Tukey/Bonferroni post-hoc', phase: 'available' },
      { id: 'factorial-anova', label: 'Factorial ANOVA', description: 'Two or more between-subjects factors', phase: 'coming-soon' },
      { id: 'ancova', label: 'ANCOVA', description: 'ANOVA with covariate control', phase: 'coming-soon' },
      { id: 'manova', label: 'MANOVA', description: 'Multiple dependent variables', phase: 'coming-soon' },
      { id: 'repeated-anova', label: 'Repeated Measures ANOVA', description: 'Within-subjects over time', phase: 'coming-soon' },
    ],
  },
  {
    id: 'nonparametric',
    label: 'Non-Parametric',
    icon: '🔢',
    items: [
      { id: 'mann-whitney', label: 'Mann-Whitney U', description: 'Non-parametric 2-group comparison', phase: 'coming-soon' },
      { id: 'wilcoxon', label: 'Wilcoxon Signed-Rank', description: 'Non-parametric paired comparison', phase: 'coming-soon' },
      { id: 'kruskal-wallis', label: 'Kruskal-Wallis', description: 'Non-parametric 3+ group comparison', phase: 'coming-soon' },
      { id: 'chi-square', label: 'Chi-Square', description: 'Test of independence / goodness of fit', phase: 'coming-soon' },
    ],
  },
  {
    id: 'correlation',
    label: 'Correlation',
    icon: '📈',
    items: [
      { id: 'pearson', label: 'Pearson Correlation', description: 'Linear relationship — r, CI, significance', phase: 'available' },
      { id: 'pearson', label: 'Spearman / Kendall', description: 'Rank-based correlations', phase: 'available' },
      { id: 'correlation-matrix', label: 'Correlation Matrix', description: 'All pairwise correlations with significance', phase: 'available' },
      { id: 'partial-cor', label: 'Partial Correlation', description: 'Controlling for a third variable', phase: 'coming-soon' },
    ],
  },
  {
    id: 'regression',
    label: 'Regression',
    icon: '📉',
    items: [
      { id: 'linear-regression', label: 'Linear Regression', description: 'Continuous outcome — R², β coefficients', phase: 'available' },
      { id: 'linear-regression', label: 'Multiple Regression', description: 'Multiple predictors — same dialog', phase: 'available' },
      { id: 'logistic-regression', label: 'Logistic Regression', description: 'Binary outcome prediction', phase: 'coming-soon' },
      { id: 'hierarchical-regression', label: 'Hierarchical Regression', description: 'Block-entry model comparison', phase: 'coming-soon' },
      { id: 'moderation', label: 'Moderation', description: 'Interaction effects', phase: 'coming-soon' },
      { id: 'mediation', label: 'Mediation', description: 'Indirect effects (bootstrapped)', phase: 'coming-soon' },
    ],
  },
  {
    id: 'factor',
    label: 'Factor Analysis',
    icon: '🔍',
    items: [
      { id: 'efa', label: 'Exploratory FA (EFA)', description: 'Discover latent factor structure', phase: 'coming-soon' },
      { id: 'cfa', label: 'Confirmatory FA (CFA)', description: 'Test hypothesized factor model', phase: 'coming-soon' },
      { id: 'pca', label: 'Principal Components (PCA)', description: 'Data reduction', phase: 'coming-soon' },
    ],
  },
  {
    id: 'reliability',
    label: 'Reliability',
    icon: '🔒',
    items: [
      { id: 'cronbach', label: "Cronbach's Alpha", description: 'Internal consistency', phase: 'coming-soon' },
      { id: 'omega', label: "McDonald's Omega", description: 'Better reliability estimate', phase: 'coming-soon' },
      { id: 'icc', label: 'ICC', description: 'Intraclass correlation / inter-rater', phase: 'coming-soon' },
    ],
  },
  {
    id: 'power',
    label: 'Power Analysis',
    icon: '⚡',
    items: [
      { id: 'power-ttest', label: 'Power: t-test', description: 'Sample size for t-test', phase: 'coming-soon' },
      { id: 'power-anova', label: 'Power: ANOVA', description: 'Sample size for ANOVA', phase: 'coming-soon' },
      { id: 'power-regression', label: 'Power: Regression', description: 'Sample size for regression', phase: 'coming-soon' },
    ],
  },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export function AnalyzeTab() {
  const results = usePsychrStore((s) => s.results)
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['descriptives'])
  )
  const [activeDialog, setActiveDialog] = useState<string | null>(null)
  const { run, isRunning, error } = useRBridge()

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAnalysisSelect = (analysisId: string) => {
    setActiveDialog(analysisId)
  }

  return (
    <>
      <WorkspaceLayout
        leftWidth="260px"
        left={
          <div className="flex flex-col h-full">
            <PanelHeader title="Analyses" subtitle="Click an analysis to configure it" />
            <div className="flex-1 overflow-y-auto py-1">
              {ANALYSIS_CATEGORIES.map((cat) => (
                <div key={cat.id}>
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <span className="text-base">{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span className="ml-auto text-gray-400 text-xs">
                      {expandedCategories.has(cat.id) ? '▾' : '▸'}
                    </span>
                  </button>
                  {expandedCategories.has(cat.id) && (
                    <div className="ml-3 border-l border-gray-200">
                      {cat.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => item.phase === 'available' && handleAnalysisSelect(item.id)}
                          disabled={item.phase !== 'available'}
                          className={`
                            w-full text-left px-4 py-2 border-b border-gray-100
                            ${item.phase === 'available'
                              ? 'hover:bg-psychr-accent cursor-pointer'
                              : 'opacity-50 cursor-not-allowed'
                            }
                          `}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-800">{item.label}</span>
                            {item.phase === 'coming-soon' && (
                              <span className="text-xs text-gray-400 ml-auto">soon</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        }
        center={
          <div className="flex flex-col h-full bg-white">
            <PanelHeader
              title="Results"
              subtitle={
                activeDataset
                  ? `Dataset: ${activeDataset.name}`
                  : 'No dataset loaded — go to Data tab to import one'
              }
            />
            {isRunning && (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200">
                <div className="w-3 h-3 border-2 border-psychr-midblue border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-blue-700">Running R analysis…</span>
              </div>
            )}
            {error && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                <p className="text-xs text-red-700 font-medium">R Error</p>
                <p className="text-xs text-red-600 mt-0.5 font-mono">{error}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <span className="text-5xl mb-4">📊</span>
                  <p className="text-gray-600 font-medium">No analyses run yet</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Choose an analysis from the left panel to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {results.map((result) => (
                    <ResultBlock key={result.id} result={result} />
                  ))}
                </div>
              )}
            </div>
          </div>
        }
        rightWidth="320px"
        right={<RConsole />}
      />

      {/* Analysis Dialogs */}
      {activeDialog === 'descriptive-stats' && (
        <DescriptivesDialog onClose={() => setActiveDialog(null)} onRun={run} />
      )}
      {(activeDialog === 'independent-t' || activeDialog === 'paired-t' || activeDialog === 'one-sample-t') && (
        <TTestDialog
          onClose={() => setActiveDialog(null)}
          onRun={run}
          testType={activeDialog === 'paired-t' ? 'paired' : activeDialog === 'one-sample-t' ? 'one-sample' : 'independent'}
        />
      )}
      {activeDialog === 'one-way-anova' && (
        <ANOVADialog onClose={() => setActiveDialog(null)} onRun={run} />
      )}
      {(activeDialog === 'pearson' || activeDialog === 'correlation-matrix') && (
        <CorrelationDialog onClose={() => setActiveDialog(null)} onRun={run} />
      )}
      {(activeDialog === 'linear-regression' || activeDialog === 'multiple-regression') && (
        <RegressionDialog onClose={() => setActiveDialog(null)} onRun={run} />
      )}
    </>
  )
}

// ─── Result Block ──────────────────────────────────────────────────────────────

import type { AnalysisResult } from '../../store'

function ResultBlock({ result }: { result: AnalysisResult }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2 bg-psychr-lightblue cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div>
          <p className="text-sm font-semibold text-psychr-blue">{result.label}</p>
          <p className="text-xs text-gray-500">
            {new Date(result.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <span className="text-gray-500 text-sm">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className="p-4">
          {result.output.table ? (
            <OutputTable data={result.output.table as Record<string, unknown>[]} />
          ) : (
            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function OutputTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data || data.length === 0) return null
  const headers = Object.keys(data[0])
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr className="bg-gray-100">
            {headers.map((h) => (
              <th key={h} className="text-left px-3 py-1.5 border border-gray-200 font-semibold text-gray-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {headers.map((h) => (
                <td key={h} className="px-3 py-1.5 border border-gray-200 font-mono">
                  {typeof row[h] === 'number' ? (row[h] as number).toFixed(3) : String(row[h] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
