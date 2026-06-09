import './App.css'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Reference = {
  id: string
  image_url: string
  storage_path?: string
  tags: string[]
  created_at?: string
  workspace_id?: string
}

type Workspace = {
  id: string
  name: string
  created_at?: string
}

export default function App() {
  // =========================
  // WORKSPACE
  // =========================
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<string>('')

  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null)
  const [workspaceDraft, setWorkspaceDraft] = useState('')

  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    workspaceId: string
  } | null>(null)

  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const [tabsPinned, setTabsPinned] = useState(false)

  useEffect(() => {
    loadWorkspaces()
  }, [])

  useEffect(() => {
    function closeMenu() {
      setCtxMenu(null)
    }
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  async function loadWorkspaces() {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) return console.error(error)

    const ws = data ?? []
    setWorkspaces(ws)

    if (ws.length && !activeWorkspace) {
      setActiveWorkspace(ws[0].id)
    }
  }

  async function addWorkspace() {
    const newWs: Workspace = {
      id: crypto.randomUUID(),
      name: `tab ${workspaces.length + 1}`
    }

    const { error } = await supabase
      .from('workspaces')
      .insert(newWs)

    if (error) return console.error(error)

    setWorkspaces(prev => [...prev, newWs])
    setActiveWorkspace(newWs.id)
  }

  async function renameWorkspace(id: string, name: string) {
    const { error } = await supabase
      .from('workspaces')
      .update({ name })
      .eq('id', id)

    if (error) return console.error(error)

    setWorkspaces(prev =>
      prev.map(ws => (ws.id === id ? { ...ws, name } : ws))
    )
  }

  async function deleteWorkspace(id: string) {
    if (!confirm('이 탭과 내부 데이터가 삭제됩니다')) return

    await supabase.from('references')
      .delete()
      .eq('workspace_id', id)

    await supabase.from('workspaces')
      .delete()
      .eq('id', id)

    const updated = workspaces.filter(ws => ws.id !== id)
    setWorkspaces(updated)

    if (activeWorkspace === id) {
      setActiveWorkspace(updated[0]?.id ?? '')
    }
  }

  function reorderWorkspaces(from: number, to: number) {
    if (from === to) return

    const updated = [...workspaces]
    const item = updated.splice(from, 1)[0]
    updated.splice(to, 0, item)

    setWorkspaces(updated)
  }

  // =========================
  // DATA
  // =========================
  const [references, setReferences] = useState<Reference[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [openedReference, setOpenedReference] = useState<Reference | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [draftTags, setDraftTags] = useState('')

  useEffect(() => {
    if (!activeWorkspace) return
    loadReferences()
  }, [activeWorkspace])

  async function loadReferences() {
    const { data, error } = await supabase
      .from('references')
      .select('*')
      .eq('workspace_id', activeWorkspace)
      .order('created_at', { ascending: false })

    if (error) return console.error(error)

    setReferences(
      (data ?? []).map(item => ({
        ...item,
        tags: Array.isArray(item.tags) ? item.tags : []
      }))
    )
  }

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) setFile(f)
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  async function uploadReference() {
    if (!file) return alert('이미지 선택')

    setUploading(true)

    try {
      const fileName = `${Date.now()}-${file.name}`

      const { error } = await supabase.storage
        .from('references')
        .upload(fileName, file)

      if (error) throw error

      const { data } = supabase.storage
        .from('references')
        .getPublicUrl(fileName)

      const tags = tagInput
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      await supabase.from('references').insert({
        image_url: data.publicUrl,
        storage_path: fileName,
        tags,
        workspace_id: activeWorkspace
      })

      setFile(null)
      setTagInput('')
      await loadReferences()
    } finally {
      setUploading(false)
    }
  }

  async function deleteReference(ref: Reference) {
  setOpenedReference(null)

  setReferences(prev => prev.filter(r => r.id !== ref.id))

  const { error } = await supabase
    .from('references')
    .delete()
    .eq('id', ref.id)

  if (error) console.error(error)
}

  async function updateTags(ref: Reference, tags: string[]) {
    setReferences(prev =>
      prev.map(r => (r.id === ref.id ? { ...r, tags } : r))
    )

    await supabase
      .from('references')
      .update({ tags })
      .eq('id', ref.id)

    setEditingCardId(null)
    setDraftTags('')
  }

  function handleTagKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    ref: Reference
  ) {
    if (e.key === 'Enter') {
      e.preventDefault()
      updateTags(ref, draftTags.split(',').map(t => t.trim()).filter(Boolean))
    }

    if (e.key === 'Backspace' && draftTags === '') {
      updateTags(ref, ref.tags.slice(0, -1))
    }
  }

  function saveTags(ref: Reference) {
    updateTags(ref, draftTags.split(',').map(t => t.trim()).filter(Boolean))
  }

  const allTags = [...new Set(references.flatMap(r => r.tags))]

  const filteredReferences = references.filter(ref => {
    const tagMatch =
      selectedTag === null || ref.tags.includes(selectedTag)

    const searchMatch =
      ref.tags.join(' ').toLowerCase().includes(search.toLowerCase())

    return tagMatch && searchMatch
  })

  // =========================
  // UI
  // =========================
  return (
    <div className="app">

      {/* WORKSPACE */}
<div
  className={`workspaceBarWrapper ${tabsPinned ? 'pinned' : ''}`}
>

  {/* PIN TOGGLE (자동/고정 전환) */}
  <button
    className="pinToggle"
    onClick={() => setTabsPinned(v => !v)}
  >
    {tabsPinned ? '📌' : '📌'}
  </button>

  <div className="workspaceBar">
    {workspaces.map((ws, index) => (
      <div
        key={ws.id}
        className="tabWrapper"
        draggable
        onDragStart={() => setDragIndex(index)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (dragIndex === null) return
          reorderWorkspaces(dragIndex, index)
          setDragIndex(null)
        }}
      >
        {editingWorkspaceId === ws.id ? (
          <input
            autoFocus
            value={workspaceDraft}
            onChange={e => setWorkspaceDraft(e.target.value)}
            onBlur={() => {
              renameWorkspace(ws.id, workspaceDraft.trim() || ws.name)
              setEditingWorkspaceId(null)
            }}
          />
        ) : (
          <button
            className={activeWorkspace === ws.id ? 'activeTab' : ''}
            onClick={() => setActiveWorkspace(ws.id)}
            onDoubleClick={() => {
              setEditingWorkspaceId(ws.id)
              setWorkspaceDraft(ws.name)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setCtxMenu({
                x: e.clientX,
                y: e.clientY,
                workspaceId: ws.id
              })
            }}
          >
            {ws.name}
          </button>
        )}
      </div>
    ))}

    <button className="addTab" onClick={addWorkspace}>+</button>
  </div>
</div>

{/* CONTEXT MENU */}
{ctxMenu && (
  <div
    className="contextMenu"
    style={{ top: ctxMenu.y, left: ctxMenu.x }}
    onClick={(e) => e.stopPropagation()}
  >
    <button
      onClick={() => {
        deleteWorkspace(ctxMenu.workspaceId)
        setCtxMenu(null)
      }}
    >
      삭제
    </button>
  </div>
)}
      {/* UPLOAD */}
      <button className="addTrigger" onClick={() => setShowUpload(v => !v)}>
        {showUpload ? '- 업로드' : '+ 업로드'}
      </button>

      {showUpload && (
        <div className="uploadBox">
          <input
            type="file"
            accept="image/*"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />

          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="tags"
          />

          <button onClick={uploadReference} disabled={uploading}>
            업로드
          </button>
        </div>
      )}

      {file && (
        <img src={URL.createObjectURL(file)} className="preview" />
      )}

      {/* SEARCH */}
      <input
        className="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="태그 검색..."
      />

      {/* TAGS */}
      <div className="tags">
        <button onClick={() => setSelectedTag(null)}>전체</button>
        {allTags.map(tag => (
          <button key={tag} onClick={() => setSelectedTag(tag)}>
            {tag}
          </button>
        ))}
      </div>

      {/* GRID */}
      <div className="grid">
        {filteredReferences.map(ref => (
          <div
            key={ref.id}
            className="card"
            onClick={() => setOpenedReference(ref)}
          >
            <img src={ref.image_url} />

            <div className="cardTagsContainer">
              <div className="cardTags">
                {editingCardId === ref.id ? (
                  <input
                    autoFocus
                    value={draftTags}
                    onChange={e => setDraftTags(e.target.value)}
                    onKeyDown={e => handleTagKeyDown(e, ref)}
                    onBlur={() => saveTags(ref)}
                  />
                ) : (
                  ref.tags.map(tag => (
                    <span key={tag}>{tag}</span>
                  ))
                )}
              </div>

              <button
                className="editIcon"
                onClick={e => {
                  e.stopPropagation()
                  setEditingCardId(ref.id)
                  setDraftTags(ref.tags.join(', '))
                }}
              >
                ✎
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {openedReference && (
        <div className="modal" onClick={() => setOpenedReference(null)}>
          <div className="modalContent" onClick={e => e.stopPropagation()}>
            <img src={openedReference.image_url} className="modalImage" />

            <div className="modalActions">
              <span className="modalDate">
                {openedReference.created_at &&
                  new Date(openedReference.created_at).toLocaleDateString()}
              </span>

              <button
                className="deleteAction"
                onClick={() => deleteReference(openedReference)}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

