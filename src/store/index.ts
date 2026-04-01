/**
 * PsychR Global State Store (Zustand)
 *
 * All application state lives here. Tabs share this store
 * so that, e.g., an analysis result from Tab 2 can be inserted
 * into the Markdown editor on Tab 7.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColumnType = 'numeric' | 'factor' | 'character' | 'date' | 'logical'

export interface DataColumn {
  name: string
  type: ColumnType
  label?: string
  missingCount: number
  uniqueCount: number
  min?: number
  max?: number
  mean?: number
  sd?: number
}

export interface Dataset {
  id: string
  name: string
  path?: string
  rows: number
  columns: DataColumn[]
  data: Record<string, unknown>[]     // In-memory rows (null if DuckDB mode)
  isDuckDB: boolean
  duckdbPath?: string                 // Parquet/CSV path for DuckDB queries
  importedAt: Date
}

export interface AnalysisResult {
  id: string
  type: string                        // e.g. "descriptives", "t-test", "cfa"
  label: string                       // Human-readable label
  params: Record<string, unknown>    // Parameters used to run the analysis
  output: Record<string, unknown>    // JSON output from R
  rScript: string                    // R code that produced this result
  plotPaths?: string[]               // Paths to generated plot images
  timestamp: Date
}

export interface Citation {
  id: string
  doi?: string
  authors: string[]
  year: number
  title: string
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  url?: string
  apaString: string
  addedAt: Date
}

export interface QualCode {
  id: string
  name: string
  color: string
  description?: string
  parentId?: string
  count: number
}

export interface QualSegment {
  id: string
  documentId: string
  codeIds: string[]
  startOffset: number
  endOffset: number
  text: string
  memo?: string
}

export interface QualDocument {
  id: string
  name: string
  path?: string
  content: string
  segments: QualSegment[]
  addedAt: Date
}

export type AppTab =
  | 'data-cleaning'
  | 'analyze'
  | 'irt'
  | 'qualitative'
  | 'visualization'
  | 'citations'
  | 'markdown'

// ─── Store ────────────────────────────────────────────────────────────────────

interface PsychrState {
  // Active tab
  activeTab: AppTab
  setActiveTab: (tab: AppTab) => void

  // Datasets
  datasets: Dataset[]
  activeDatasetId: string | null
  addDataset: (dataset: Dataset) => void
  removeDataset: (id: string) => void
  setActiveDataset: (id: string) => void
  updateDataset: (id: string, updates: Partial<Dataset>) => void
  activeDataset: Dataset | null

  // Analysis results
  results: AnalysisResult[]
  addResult: (result: AnalysisResult) => void
  clearResults: () => void

  // Session R script (accumulates all R code run this session)
  sessionScript: string
  appendToScript: (snippet: string) => void
  clearScript: () => void

  // Citations
  citations: Citation[]
  addCitation: (citation: Citation) => void
  removeCitation: (id: string) => void

  // Qualitative project
  qualCodes: QualCode[]
  qualDocuments: QualDocument[]
  addQualCode: (code: QualCode) => void
  updateQualCode: (id: string, updates: Partial<QualCode>) => void
  removeQualCode: (id: string) => void
  addQualDocument: (doc: QualDocument) => void
  addQualSegment: (docId: string, segment: QualSegment) => void

  // Markdown content
  markdownContent: string
  setMarkdownContent: (content: string) => void

  // App settings
  settings: {
    rPath: string
    defaultAlpha: number
    decimalPlaces: number
    effectSizeDefault: boolean
    ciDefault: boolean
    theme: 'light' | 'dark'
  }
  updateSettings: (updates: Partial<PsychrState['settings']>) => void

  // R availability
  rAvailable: boolean
  rVersion: string
  setRStatus: (available: boolean, version?: string) => void
}

export const usePsychrStore = create<PsychrState>()(
  persist(
    (set, get) => ({
      // Active tab
      activeTab: 'data-cleaning',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Datasets
      datasets: [],
      activeDatasetId: null,
      activeDataset: null,
      addDataset: (dataset) =>
        set((state) => {
          const newDatasets = [...state.datasets, dataset]
          const newActiveId = state.activeDatasetId ?? dataset.id
          return {
            datasets: newDatasets,
            activeDatasetId: newActiveId,
            activeDataset: newDatasets.find((d) => d.id === newActiveId) ?? null,
          }
        }),
      removeDataset: (id) =>
        set((state) => {
          const newDatasets = state.datasets.filter((d) => d.id !== id)
          const newActiveId = state.activeDatasetId === id ? (newDatasets[0]?.id ?? null) : state.activeDatasetId
          return {
            datasets: newDatasets,
            activeDatasetId: newActiveId,
            activeDataset: newDatasets.find((d) => d.id === newActiveId) ?? null,
          }
        }),
      setActiveDataset: (id) =>
        set((state) => ({
          activeDatasetId: id,
          activeDataset: state.datasets.find((d) => d.id === id) ?? null,
        })),
      updateDataset: (id, updates) =>
        set((state) => {
          const newDatasets = state.datasets.map((d) => (d.id === id ? { ...d, ...updates } : d))
          return {
            datasets: newDatasets,
            activeDataset: newDatasets.find((d) => d.id === state.activeDatasetId) ?? null,
          }
        }),

      // Results
      results: [],
      addResult: (result) =>
        set((state) => ({ results: [result, ...state.results] })),
      clearResults: () => set({ results: [] }),

      // Session script
      sessionScript: '# PsychR Session Script\n# Generated automatically — every analysis is recorded here\n\n',
      appendToScript: (snippet) =>
        set((state) => ({
          sessionScript: state.sessionScript + '\n' + snippet + '\n',
        })),
      clearScript: () =>
        set({ sessionScript: '# PsychR Session Script\n# Generated automatically — every analysis is recorded here\n\n' }),

      // Citations
      citations: [],
      addCitation: (citation) =>
        set((state) => ({ citations: [...state.citations, citation] })),
      removeCitation: (id) =>
        set((state) => ({ citations: state.citations.filter((c) => c.id !== id) })),

      // Qualitative
      qualCodes: [],
      qualDocuments: [],
      addQualCode: (code) =>
        set((state) => ({ qualCodes: [...state.qualCodes, code] })),
      updateQualCode: (id, updates) =>
        set((state) => ({
          qualCodes: state.qualCodes.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      removeQualCode: (id) =>
        set((state) => ({ qualCodes: state.qualCodes.filter((c) => c.id !== id) })),
      addQualDocument: (doc) =>
        set((state) => ({ qualDocuments: [...state.qualDocuments, doc] })),
      addQualSegment: (docId, segment) =>
        set((state) => ({
          qualDocuments: state.qualDocuments.map((d) =>
            d.id === docId ? { ...d, segments: [...d.segments, segment] } : d
          ),
          qualCodes: state.qualCodes.map((c) =>
            segment.codeIds.includes(c.id) ? { ...c, count: c.count + 1 } : c
          ),
        })),

      // Markdown
      markdownContent: '# My Research Report\n\nWrite your report here...\n',
      setMarkdownContent: (content) => set({ markdownContent: content }),

      // Settings
      settings: {
        rPath: 'Rscript',
        defaultAlpha: 0.05,
        decimalPlaces: 3,
        effectSizeDefault: true,
        ciDefault: true,
        theme: 'light',
      },
      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),

      // R status
      rAvailable: false,
      rVersion: '',
      setRStatus: (available, version = '') =>
        set({ rAvailable: available, rVersion: version }),
    }),
    {
      name: 'psychr-storage',
      // Only persist settings and citations; datasets/results are session-specific
      partialize: (state) => ({
        settings: state.settings,
        citations: state.citations,
        markdownContent: state.markdownContent,
        qualCodes: state.qualCodes,
      }),
    }
  )
)
