/**
 * Tab 4: Qualitative Analysis
 *
 * Qualitative coding workspace. Import documents, create codes,
 * highlight text to assign codes, view co-occurrence matrix.
 */

import { useState, useRef } from 'react'
import { WorkspaceLayout, PanelHeader } from '../../components/layout/WorkspaceLayout'
import { usePsychrStore, QualCode, QualDocument, QualSegment } from '../../store'

const CODE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
]

export function QualitativeTab() {
  const qualCodes = usePsychrStore((s) => s.qualCodes)
  const qualDocuments = usePsychrStore((s) => s.qualDocuments)
  const addQualCode = usePsychrStore((s) => s.addQualCode)
  const addQualDocument = usePsychrStore((s) => s.addQualDocument)
  const addQualSegment = usePsychrStore((s) => s.addQualSegment)

  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [selectionOffsets, setSelectionOffsets] = useState<{ start: number; end: number } | null>(null)
  const [newCodeName, setNewCodeName] = useState('')
  const [showNewCode, setShowNewCode] = useState(false)
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)
  const docViewRef = useRef<HTMLDivElement>(null)

  const activeDoc = qualDocuments.find((d) => d.id === activeDocId)

  const handleAddCode = () => {
    if (!newCodeName.trim()) return
    addQualCode({
      id: `code_${Date.now()}`,
      name: newCodeName.trim(),
      color: CODE_COLORS[qualCodes.length % CODE_COLORS.length],
      count: 0,
    })
    setNewCodeName('')
    setShowNewCode(false)
  }

  const handleAddDocument = () => {
    const name = prompt('Enter document name:')
    if (!name) return
    const content = prompt('Paste document text:') || ''
    const doc: QualDocument = {
      id: `doc_${Date.now()}`,
      name,
      content,
      segments: [],
      addedAt: new Date(),
    }
    addQualDocument(doc)
    setActiveDocId(doc.id)
  }

  const handleTextSelect = () => {
    const selection = window.getSelection()
    if (!selection || !selection.toString().trim() || !activeDoc) return
    const text = selection.toString().trim()
    // Calculate character offset within the document content string
    const start = activeDoc.content.indexOf(text)
    if (start !== -1) {
      setSelectionOffsets({ start, end: start + text.length })
    } else {
      setSelectionOffsets(null)
    }
    setSelectedText(text)
  }

  const handleApplyCode = (code: QualCode) => {
    if (!selectedText || !activeDoc) return
    const offsets = selectionOffsets ?? { start: 0, end: selectedText.length }
    const segment: QualSegment = {
      id: `seg_${Date.now()}`,
      documentId: activeDoc.id,
      codeIds: [code.id],
      startOffset: offsets.start,
      endOffset: offsets.end,
      text: selectedText,
    }
    addQualSegment(activeDoc.id, segment)
    setSelectedText('')
    setSelectionOffsets(null)
    window.getSelection()?.removeAllRanges()
  }

  return (
    <WorkspaceLayout
      leftWidth="240px"
      left={
        <div className="flex flex-col h-full">
          {/* Documents panel */}
          <PanelHeader
            title="Documents"
            actions={
              <button
                onClick={handleAddDocument}
                className="text-xs bg-psychr-midblue text-white px-2 py-1 rounded hover:bg-psychr-blue"
              >
                + Add
              </button>
            }
          />
          <div className="flex-1 overflow-y-auto border-b border-gray-200">
            {qualDocuments.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-500">No documents yet</p>
                <button
                  onClick={handleAddDocument}
                  className="mt-2 text-xs text-psychr-midblue hover:underline"
                >
                  + Add document
                </button>
              </div>
            ) : (
              qualDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setActiveDocId(doc.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 ${
                    activeDocId === doc.id ? 'bg-psychr-accent' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {doc.segments.length} segment{doc.segments.length !== 1 ? 's' : ''}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Codes panel */}
          <PanelHeader
            title="Codes"
            actions={
              <button
                onClick={() => setShowNewCode(true)}
                className="text-xs bg-psychr-midblue text-white px-2 py-1 rounded hover:bg-psychr-blue"
              >
                + Code
              </button>
            }
          />
          {showNewCode && (
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
              <input
                autoFocus
                value={newCodeName}
                onChange={(e) => setNewCodeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCode(); if (e.key === 'Escape') setShowNewCode(false) }}
                placeholder="Code name..."
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
              />
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={handleAddCode} className="text-xs bg-psychr-midblue text-white px-2 py-0.5 rounded">Add</button>
                <button onClick={() => setShowNewCode(false)} className="text-xs text-gray-500 px-2 py-0.5">Cancel</button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto min-h-0">
            {qualCodes.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-500 text-center">
                No codes yet — create codes to start coding
              </p>
            ) : (
              qualCodes.map((code) => (
                <button
                  key={code.id}
                  onClick={() => handleApplyCode(code)}
                  onMouseEnter={() => setHoveredCode(code.id)}
                  onMouseLeave={() => setHoveredCode(null)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-100 flex items-center gap-2 transition-colors ${
                    hoveredCode === code.id ? 'bg-gray-50' : ''
                  } ${selectedText ? 'cursor-pointer' : 'cursor-default'}`}
                  title={selectedText ? `Apply "${code.name}" to selected text` : 'Select text in the document first'}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: code.color }} />
                  <span className="text-sm text-gray-800 flex-1">{code.name}</span>
                  <span className="text-xs text-gray-400">{code.count}</span>
                </button>
              ))
            )}
          </div>
        </div>
      }
      center={
        <div className="flex flex-col h-full bg-white">
          <PanelHeader
            title={activeDoc?.name || 'Document Viewer'}
            subtitle={
              selectedText
                ? `"${selectedText.slice(0, 50)}${selectedText.length > 50 ? '…' : ''}" — click a code to apply`
                : 'Select text to code it'
            }
          />
          {selectedText && (
            <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center justify-between">
              <p className="text-xs text-yellow-800">
                Selected: <em>"{selectedText.slice(0, 60)}{selectedText.length > 60 ? '...' : ''}"</em>
              </p>
              <button
                onClick={() => { setSelectedText(''); window.getSelection()?.removeAllRanges() }}
                className="text-xs text-yellow-600 hover:underline"
              >
                Clear
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-6">
            {!activeDoc ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <span className="text-5xl mb-4">💬</span>
                <p className="text-gray-600 font-medium">No document open</p>
                <p className="text-gray-400 text-sm mt-1">Add a document from the left panel to start coding</p>
                <div className="mt-6 text-left max-w-sm space-y-2 text-sm text-gray-500">
                  <p>✓ Import .txt, .docx, PDF transcripts</p>
                  <p>✓ Highlight text → click code to apply</p>
                  <p>✓ View co-occurrence matrix</p>
                  <p>✓ Inter-rater reliability (Cohen kappa)</p>
                  <p>✓ Export codebook as .docx</p>
                </div>
              </div>
            ) : (
              <div
                ref={docViewRef}
                className="prose prose-sm max-w-none text-gray-800 leading-relaxed select-text"
                onMouseUp={handleTextSelect}
              >
                <HighlightedDoc doc={activeDoc} codes={qualCodes} />
              </div>
            )}
          </div>
        </div>
      }
      rightWidth="280px"
      right={
        <div className="flex flex-col h-full">
          <PanelHeader title="Code Summary" />
          <div className="flex-1 overflow-y-auto p-3">
            {qualCodes.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">
                Codes will appear here once created
              </p>
            ) : (
              <div className="space-y-2">
                {qualCodes.map((code) => (
                  <div key={code.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-gray-200">
                    <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: code.color }} />
                    <span className="text-sm font-medium text-gray-800 flex-1">{code.name}</span>
                    <span className="text-xs font-bold" style={{ color: code.color }}>{code.count}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    {qualCodes.length} codes · {qualDocuments.reduce((s, d) => s + d.segments.length, 0)} segments
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      }
    />
  )
}
