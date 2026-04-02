/**
 * Tab 4: Qualitative Analysis
 *
 * Qualitative coding workspace. Import documents, create codes,
 * highlight text to assign codes, view co-occurrence matrix.
 */

import { useState } from 'react'
import { WorkspaceLayout, PanelHeader } from '../../components/layout/WorkspaceLayout'
import { usePsychrStore, QualCode, QualDocument, QualSegment } from '../../store'

const CODE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
]

/** Render document content with coded segments highlighted */
function renderHighlightedText(
  content: string,
  segments: QualSegment[],
  codes: QualCode[]
): React.ReactNode {
  if (segments.length === 0) {
    return <div className="whitespace-pre-wrap text-gray-800 leading-relaxed text-sm">{content}</div>
  }

  const sorted = [...segments].sort((a, b) => a.startOffset - b.startOffset)
  const parts: React.ReactNode[] = []
  let pos = 0

  for (const seg of sorted) {
    if (seg.startOffset > pos) {
      parts.push(
        <span key={`text-${pos}`}>{content.slice(pos, seg.startOffset)}</span>
      )
    }
    const code = codes.find((c) => c.id === seg.codeIds[0])
    const color = code?.color ?? '#FCD34D'
    parts.push(
      <mark
        key={seg.id}
        className="rounded px-0.5 cursor-default"
        style={{
          backgroundColor: color + '33',
          borderBottom: `2px solid ${color}`,
          outline: 'none',
        }}
        title={code?.name ?? 'Coded segment'}
      >
        {content.slice(seg.startOffset, seg.endOffset)}
      </mark>
    )
    pos = seg.endOffset
  }

  if (pos < content.length) {
    parts.push(<span key={`text-end`}>{content.slice(pos)}</span>)
  }

  return (
    <div className="whitespace-pre-wrap text-gray-800 leading-relaxed text-sm">
      {parts}
    </div>
  )
}

export function QualitativeTab() {
  const qualCodes = usePsychrStore((s) => s.qualCodes)
  const qualDocuments = usePsychrStore((s) => s.qualDocuments)
  const addQualCode = usePsychrStore((s) => s.addQualCode)
  const updateQualCode = usePsychrStore((s) => s.updateQualCode)
  const removeQualCode = usePsychrStore((s) => s.removeQualCode)
  const addQualDocument = usePsychrStore((s) => s.addQualDocument)
  const addQualSegment = usePsychrStore((s) => s.addQualSegment)
  const removeQualSegment = usePsychrStore((s) => s.removeQualSegment)

  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [selectionOffset, setSelectionOffset] = useState<{ start: number; end: number } | null>(null)
  const [newCodeName, setNewCodeName] = useState('')
  const [showNewCode, setShowNewCode] = useState(false)
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)
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
    const text = selection?.toString().trim() ?? ''
    if (!text || !activeDoc) {
      if (!text) {
        setSelectedText('')
        setSelectionOffset(null)
      }
      return
    }

    const idx = activeDoc.content.indexOf(text)
    if (idx === -1) {
      setSelectedText(text)
      setSelectionOffset(null)
      return
    }

    let bestIdx = idx
    let searchFrom = 0
    const occurrences: number[] = []
    while (true) {
      const found = activeDoc.content.indexOf(text, searchFrom)
      if (found === -1) break
      occurrences.push(found)
      searchFrom = found + 1
    }

    if (occurrences.length > 1 && selection?.anchorNode?.textContent) {
      const anchorText = selection.anchorNode.textContent
      const anchorInDoc = activeDoc.content.indexOf(anchorText)
      if (anchorInDoc !== -1) {
        const absoluteAnchor = anchorInDoc + selection.anchorOffset
        bestIdx = occurrences.reduce((best, occ) =>
          Math.abs(occ - absoluteAnchor) < Math.abs(best - absoluteAnchor) ? occ : best
        )
      }
    }

    setSelectedText(text)
    setSelectionOffset({ start: bestIdx, end: bestIdx + text.length })
  }

  const handleApplyCode = (code: QualCode) => {
    if (!selectedText || !activeDocId || !selectionOffset) return

    const existingSegments = activeDoc?.segments ?? []
    const overlapping = existingSegments.find(
      (s) => s.startOffset < selectionOffset.end && s.endOffset > selectionOffset.start
    )
    if (overlapping) {
      const existingCode = qualCodes.find((c) => c.id === overlapping.codeIds[0])
      if (!confirm(`This selection overlaps with existing code "${existingCode?.name ?? 'unknown'}". Apply anyway?`)) return
    }

    const segment: QualSegment = {
      id: `seg_${Date.now()}`,
      documentId: activeDocId,
      codeIds: [code.id],
      startOffset: selectionOffset.start,
      endOffset: selectionOffset.end,
      text: selectedText,
    }

    addQualSegment(activeDocId, segment)
    updateQualCode(code.id, { count: code.count + 1 })
    setSelectedText('')
    setSelectionOffset(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleRemoveSegment = (seg: QualSegment) => {
    if (!activeDocId) return
    removeQualSegment(activeDocId, seg.id)
    const code = qualCodes.find((c) => c.id === seg.codeIds[0])
    if (code && code.count > 0) {
      updateQualCode(code.id, { count: code.count - 1 })
    }
  }

  const handleClearSelection = () => {
    setSelectedText('')
    setSelectionOffset(null)
    window.getSelection()?.removeAllRanges()
  }

  const totalSegments = qualDocuments.reduce((s, d) => s + d.segments.length, 0)

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
          <div className="flex-1 overflow-y-auto border-b border-gray-200 min-h-0">
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
                  <span className="text-xs font-semibold" style={{ color: code.color }}>{code.count}</span>
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
                {selectionOffset
                  ? <>Selected <em>"{selectedText.slice(0, 60)}{selectedText.length > 60 ? '...' : ''}"</em> (chars {selectionOffset.start}–{selectionOffset.end})</>
                  : <>Selected: <em>"{selectedText.slice(0, 60)}"</em> — position not found in document</>
                }
              </p>
              <button
                onClick={handleClearSelection}
                className="text-xs text-yellow-600 hover:underline ml-3 flex-shrink-0"
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
                  <p>✓ Paste text content as document</p>
                  <p>✓ Highlight text → click code to apply</p>
                  <p>✓ Color-coded highlights per code</p>
                  <p>✓ Track segment counts per code</p>
                </div>
              </div>
            ) : (
              <div
                className="prose prose-sm max-w-none select-text"
                onMouseUp={handleTextSelect}
              >
                {renderHighlightedText(activeDoc.content, activeDoc.segments, qualCodes)}
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
                    <button
                      onClick={() => removeQualCode(code.id)}
                      className="text-gray-300 hover:text-red-400 text-xs leading-none ml-1"
                      title="Remove code"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    {qualCodes.length} code{qualCodes.length !== 1 ? 's' : ''} · {totalSegments} segment{totalSegments !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Segments in active document */}
            {activeDoc && activeDoc.segments.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                  Segments in "{activeDoc.name}"
                </p>
                <div className="space-y-1.5">
                  {activeDoc.segments.map((seg) => {
                    const code = qualCodes.find((c) => c.id === seg.codeIds[0])
                    return (
                      <div key={seg.id} className="flex items-start gap-2 p-2 rounded bg-gray-50 border border-gray-100 group">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                          style={{ backgroundColor: code?.color ?? '#ccc' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-600">{code?.name ?? 'Unknown'}</p>
                          <p className="text-xs text-gray-500 truncate italic">"{seg.text.slice(0, 50)}{seg.text.length > 50 ? '...' : ''}"</p>
                        </div>
                        <button
                          onClick={() => handleRemoveSegment(seg)}
                          className="text-gray-300 hover:text-red-400 text-xs leading-none opacity-0 group-hover:opacity-100 flex-shrink-0"
                          title="Remove segment"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      }
    />
  )
}

