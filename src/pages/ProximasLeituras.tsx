import { useState, useEffect, useRef } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import {
  Library, Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Pencil, Paperclip, X, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ToastContainer } from '@/components/ui/toast'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { loadProximasLeituras, saveProximasLeituras, deleteProximasLeituras, uploadAnexo } from '@/lib/storage'
import { cn } from '@/lib/utils'
import type { ProximasLeituras, ProximasLeiturasItem, ProximasLeiturasItemPriority, Anexo } from '@/types'

// ─── Priority config ──────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<ProximasLeiturasItemPriority, { label: string; className: string }> = {
  urgente:       { label: 'Urgente',      className: 'bg-red-100 text-red-700' },
  normal:        { label: 'Normal',       className: 'bg-yellow-100 text-yellow-700' },
  'nao-urgente': { label: 'Não urgente',  className: 'bg-gray-100 text-gray-500' },
}

const PRIORITY_ORDER: ProximasLeiturasItemPriority[] = ['urgente', 'normal', 'nao-urgente']

function nextPriority(p: ProximasLeiturasItemPriority): ProximasLeiturasItemPriority {
  return PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(p) + 1) % PRIORITY_ORDER.length]
}

// ─── APA formatter ────────────────────────────────────────────────────────

function formatAPA(item: ProximasLeiturasItem): string {
  const authStr = item.authors.length === 0
    ? 'Autor desconhecido'
    : item.authors.length > 6
      ? item.authors.slice(0, 6).join(', ') + ', ...'
      : item.authors.join(', ')
  const year = item.year ? `(${item.year})` : '(s.d.)'
  const sourceParts = [
    item.journal,
    item.volume && item.issue ? `${item.volume}(${item.issue})` : item.volume,
    item.pages,
  ].filter(Boolean)
  const source = sourceParts.length ? sourceParts.join(', ') + '.' : ''
  const identifier = item.doi ? `https://doi.org/${item.doi}` : (item.url ?? '')
  return [`${authStr} ${year}.`, item.title ? item.title + '.' : '', source, identifier]
    .filter(Boolean).join(' ')
}

// ─── Metadata fetching ────────────────────────────────────────────────────

async function fetchDOI(doi: string): Promise<Partial<ProximasLeiturasItem>> {
  const clean = doi.replace(/https?:\/\/(dx\.)?doi\.org\//i, '').trim()
  const res = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(clean)}`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) throw new Error('DOI não encontrado')
  const { message: m } = await res.json() as {
    message: {
      title?: string[]
      author?: { family?: string; given?: string }[]
      'published-print'?: { 'date-parts'?: number[][] }
      'published-online'?: { 'date-parts'?: number[][] }
      'container-title'?: string[]
      volume?: string
      issue?: string
      page?: string
    }
  }
  return {
    title:   (m.title?.[0] ?? '').replace(/<[^>]+>/g, ''),
    authors: (m.author ?? []).map((a) =>
      [a.family, a.given ? a.given[0] + '.' : ''].filter(Boolean).join(', ')),
    year:    m['published-print']?.['date-parts']?.[0]?.[0]
          ?? m['published-online']?.['date-parts']?.[0]?.[0],
    journal: m['container-title']?.[0],
    volume:  m.volume,
    issue:   m.issue,
    pages:   m.page,
    doi:     clean,
  }
}

async function fetchURL(url: string): Promise<Partial<ProximasLeiturasItem>> {
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`
  const res = await fetch(proxy, { signal: AbortSignal.timeout(10000) })
  const html = await res.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const meta = (name: string) =>
    doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content') ?? ''
  const yearRaw = meta('citation_publication_date') || meta('article:published_time') || ''
  const authorRaw = meta('citation_author')
  return {
    title:   meta('og:title') || meta('citation_title') || doc.title || url,
    authors: authorRaw
      ? authorRaw.split(';').map((s) => s.trim()).filter(Boolean)
      : meta('author') ? [meta('author')] : [],
    year:    yearRaw ? (Number(yearRaw.slice(0, 4)) || undefined) : undefined,
    journal: meta('citation_journal_title') || meta('og:site_name') || undefined,
    url,
  }
}

async function fetchMeta(input: string): Promise<Partial<ProximasLeiturasItem>> {
  const isDOI = /^10\.\d{4,}/.test(input.trim()) || /doi\.org/i.test(input)
  try {
    return isDOI ? await fetchDOI(input) : await fetchURL(input)
  } catch {
    return { title: input, url: input.startsWith('http') ? input : undefined }
  }
}

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO: ProximasLeituras[] = [
  {
    id: 'demo-1',
    name: 'Referencial teórico — Capítulo 2',
    items: [
      {
        id: 'i1', order: 0, priority: 'urgente',
        title: 'Constructivism and the Learned Curriculum',
        authors: ['Coll, C.', 'Martín, E.'],
        year: 2001, journal: 'Educational Research Review',
        volume: '15', issue: '2', pages: '45–67',
        doi: '10.1016/j.edurev.2001.01.001',
        created_at: '2026-05-01T10:00:00Z',
      },
      {
        id: 'i2', order: 1, priority: 'normal',
        title: 'Learning as a Social Practice',
        authors: ['Vygotsky, L. S.'],
        year: 1978, journal: 'Mind in Society',
        created_at: '2026-05-02T09:00:00Z',
      },
    ],
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  },
  {
    id: 'demo-2',
    name: 'Metodologia',
    items: [
      {
        id: 'i3', order: 0, priority: 'nao-urgente',
        title: 'Qualitative Research Methods in Education',
        authors: ['Cohen, L.', 'Manion, L.', 'Morrison, K.'],
        year: 2018, journal: 'Routledge',
        created_at: '2026-05-05T14:00:00Z',
      },
    ],
    created_at: '2026-05-05T14:00:00Z',
    updated_at: '2026-05-05T14:00:00Z',
  },
]

// ─── Field (inline metadata input) ────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">{label}</span>
      <input
        className="bg-transparent border-b border-gray-200 hover:border-indigo-300 focus:border-indigo-400 outline-none text-xs text-gray-800 py-0.5 transition-colors placeholder:text-gray-300"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
      />
    </div>
  )
}

// ─── LeituraItemRow ───────────────────────────────────────────────────────

function LeituraItemRow({
  item,
  index,
  expanded,
  isUploading,
  isDemoMode,
  dragHandleProps,
  isDragging,
  onToggleExpand,
  onUpdate,
  onDelete,
  onFileAttach,
}: {
  item: ProximasLeiturasItem
  index: number
  expanded: boolean
  isUploading: boolean
  isDemoMode: boolean
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined
  isDragging: boolean
  onToggleExpand: () => void
  onUpdate: (patch: Partial<ProximasLeiturasItem>) => void
  onDelete: () => void
  onFileAttach: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importingInItem, setImportingInItem] = useState(false)

  async function handleImportInItem() {
    const target = item.doi?.trim() || item.url?.trim()
    if (!target) return
    setImportingInItem(true)
    try {
      const meta = await fetchMeta(target)
      onUpdate({ ...meta })
    } catch { /* silent */ }
    finally { setImportingInItem(false) }
  }

  const apa = formatAPA(item)
  const cfg = PRIORITY_CONFIG[item.priority]

  return (
    <div className={cn(
      'group/item border-b border-gray-50 last:border-0',
      isDragging && 'bg-indigo-50/60 rounded-md',
      expanded && 'bg-indigo-50/20',
    )}>
      {/* Collapsed header row */}
      <div className="flex items-start gap-2 px-3 py-2">
        {/* Drag handle */}
        <div
          {...(dragHandleProps ?? {})}
          className="opacity-0 group-hover/item:opacity-40 hover:!opacity-70 cursor-grab flex-shrink-0 mt-0.5 pt-px"
        >
          <GripVertical className="w-3.5 h-3.5 text-gray-400" />
        </div>
        {/* Number */}
        <span className="text-xs font-mono text-indigo-400 w-5 text-right flex-shrink-0 select-none mt-0.5">
          {index + 1}.
        </span>
        {/* Priority pill */}
        <button
          onClick={() => onUpdate({ priority: nextPriority(item.priority) })}
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 transition-colors mt-px',
            cfg.className,
          )}
          title="Clique para alterar prioridade"
        >
          {cfg.label}
        </button>
        {/* APA text */}
        <div className="flex-1 min-w-0">
          <p
            className="text-xs text-gray-700 leading-relaxed cursor-pointer select-none"
            onClick={onToggleExpand}
            title="Clique para editar metadados"
          >
            {apa.trim() || <span className="italic text-gray-300">Sem título — clique para editar</span>}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
          <button
            onClick={onToggleExpand}
            className="p-1 rounded hover:bg-indigo-100 text-gray-300 hover:text-indigo-500 transition-colors"
            title={expanded ? 'Recolher' : 'Editar metadados'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {item.attachment?.url ? (
            <a
              href={item.attachment.url}
              target="_blank"
              rel="noreferrer"
              className="p-1 rounded hover:bg-indigo-100 text-gray-300 hover:text-indigo-500 transition-colors"
              title={`Abrir ${item.attachment.name}`}
            >
              <Paperclip className="w-3.5 h-3.5" />
            </a>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="p-1 rounded hover:bg-indigo-100 text-gray-300 hover:text-indigo-500 disabled:opacity-30 transition-colors"
              title="Anexar arquivo"
            >
              {isUploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Paperclip className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
            title="Remover"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded edit area */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-indigo-100/60">
          <div className="pt-3">
            <Field
              label="Título"
              value={item.title}
              onChange={(v) => onUpdate({ title: v })}
              placeholder="Título da obra…"
            />
          </div>
          <Field
            label="Autores (separados por ponto-e-vírgula)"
            value={item.authors.join('; ')}
            onChange={(v) => onUpdate({ authors: v.split(';').map((s) => s.trim()).filter(Boolean) })}
            placeholder="Sobrenome, N.; Sobrenome, N."
          />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ano" value={item.year?.toString() ?? ''} placeholder="2024"
              onChange={(v) => onUpdate({ year: v ? (Number(v) || undefined) : undefined })} />
            <Field label="Volume" value={item.volume ?? ''} placeholder="12"
              onChange={(v) => onUpdate({ volume: v || undefined })} />
            <Field label="Número" value={item.issue ?? ''} placeholder="3"
              onChange={(v) => onUpdate({ issue: v || undefined })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Periódico / Livro" value={item.journal ?? ''} placeholder="Journal of…"
              onChange={(v) => onUpdate({ journal: v || undefined })} />
            <Field label="Páginas" value={item.pages ?? ''} placeholder="45–67"
              onChange={(v) => onUpdate({ pages: v || undefined })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="DOI" value={item.doi ?? ''} placeholder="10.xxxx/…"
              onChange={(v) => onUpdate({ doi: v || undefined })} />
            <Field label="URL" value={item.url ?? ''} placeholder="https://…"
              onChange={(v) => onUpdate({ url: v || undefined })} />
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <button
              onClick={handleImportInItem}
              disabled={importingInItem || (!item.doi && !item.url)}
              className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importingInItem
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Library className="w-3 h-3" />}
              Importar metadados do DOI/URL
            </button>
            {item.attachment && (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <Paperclip className="w-3 h-3 flex-shrink-0" />
                <a
                  href={item.attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-indigo-600 underline underline-offset-2 truncate max-w-[12rem]"
                >
                  {item.attachment.name}
                </a>
                <button
                  onClick={() => onUpdate({ attachment: undefined })}
                  className="hover:text-red-400 transition-colors flex-shrink-0"
                  title="Remover anexo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input for per-item attachment */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFileAttach(f)
          e.target.value = ''
        }}
      />
      {/* Suppress unused var warning in demo mode */}
      {isDemoMode && null}
    </div>
  )
}

// ─── ProximasLeiturasCard ─────────────────────────────────────────────────

function ProximasLeiturasCard({
  lista,
  isSaving,
  onSave,
  onDelete,
  onRename,
  isDemoMode,
}: {
  lista: ProximasLeituras
  isSaving: boolean
  onSave: (updated: ProximasLeituras) => void
  onDelete: () => void
  onRename: () => void
  isDemoMode: boolean
}) {
  const [items, setItems] = useState<ProximasLeiturasItem[]>(lista.items)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)

  function saveItems(updated: ProximasLeiturasItem[]) {
    setItems(updated)
    onSave({ ...lista, items: updated })
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const arr = Array.from(items)
    const [moved] = arr.splice(result.source.index, 1)
    arr.splice(result.destination.index, 0, moved)
    saveItems(arr.map((it, i) => ({ ...it, order: i })))
  }

  function handleUpdateItem(id: string, patch: Partial<ProximasLeiturasItem>) {
    saveItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function handleDeleteItem(id: string) {
    if (expandedId === id) setExpandedId(null)
    saveItems(items.filter((it) => it.id !== id).map((it, i) => ({ ...it, order: i })))
  }

  async function handleAdd(input: string) {
    const inp = input.trim()
    if (!inp) return
    setIsImporting(true)
    setUrlInput('')
    const meta = await fetchMeta(inp)
    const newItem: ProximasLeiturasItem = {
      id: crypto.randomUUID(),
      order: items.length,
      priority: 'normal',
      title:   meta.title   ?? inp,
      authors: meta.authors ?? [],
      year:    meta.year,
      journal: meta.journal,
      volume:  meta.volume,
      issue:   meta.issue,
      pages:   meta.pages,
      doi:     meta.doi,
      url:     meta.url,
      created_at: new Date().toISOString(),
    }
    setIsImporting(false)
    const updated = [...items, newItem]
    setExpandedId(newItem.id)
    saveItems(updated)
  }

  async function handleFileDrop(file: File) {
    const isPDF = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    if (!isPDF) return

    let attachment: Anexo | undefined
    if (!isDemoMode) {
      try { attachment = await uploadAnexo('proximasleituras', lista.id, file) }
      catch { /* continue without attachment */ }
    } else {
      attachment = {
        id: crypto.randomUUID(), name: file.name, size: file.size,
        type: file.type, path: '', url: URL.createObjectURL(file),
      }
    }

    const newItem: ProximasLeiturasItem = {
      id: crypto.randomUUID(),
      order: items.length,
      priority: 'normal',
      title: file.name.replace(/\.pdf$/i, ''),
      authors: [],
      created_at: new Date().toISOString(),
      attachment,
    }
    const updated = [...items, newItem]
    setExpandedId(newItem.id)
    saveItems(updated)
  }

  function openFilePicker() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,application/pdf'
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) handleFileDrop(f)
    }
    input.click()
  }

  async function handleItemFileAttach(itemId: string, file: File) {
    setUploadingItemId(itemId)
    let attachment: Anexo | undefined
    if (!isDemoMode) {
      try { attachment = await uploadAnexo('proximasleituras', lista.id, file) }
      catch { setUploadingItemId(null); return }
    } else {
      attachment = {
        id: crypto.randomUUID(), name: file.name, size: file.size,
        type: file.type, path: '', url: URL.createObjectURL(file),
      }
    }
    setUploadingItemId(null)
    handleUpdateItem(itemId, { attachment })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <Library className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900 truncate">{lista.name}</h2>
          <Badge variant="secondary" className="text-[10px] text-gray-400 bg-gray-50 flex-shrink-0 ml-1">
            {items.length} {items.length === 1 ? 'leitura' : 'leituras'}
          </Badge>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isSaving && (
            <span className="text-[10px] text-gray-300 animate-pulse mr-1">salvando…</span>
          )}
          <button
            onClick={onRename}
            className="p-1.5 rounded hover:bg-indigo-50 text-gray-300 hover:text-indigo-500 transition-colors"
            title="Renomear lista"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
            title="Excluir lista"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId={lista.id}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="flex-1">
              {items.length === 0 && (
                <p className="text-xs text-gray-300 italic px-4 py-3 select-none">
                  Nenhuma leitura ainda. Cole um DOI/URL abaixo ou arraste um PDF.
                </p>
              )}
              {items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(drag, snap) => (
                    <div
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      className={cn(snap.isDragging && 'rounded-lg shadow-md')}
                    >
                      <LeituraItemRow
                        item={item}
                        index={index}
                        expanded={expandedId === item.id}
                        isUploading={uploadingItemId === item.id}
                        isDemoMode={isDemoMode}
                        dragHandleProps={drag.dragHandleProps}
                        isDragging={snap.isDragging}
                        onToggleExpand={() =>
                          setExpandedId(expandedId === item.id ? null : item.id)
                        }
                        onUpdate={(patch) => handleUpdateItem(item.id, patch)}
                        onDelete={() => handleDeleteItem(item.id)}
                        onFileAttach={(f) => handleItemFileAttach(item.id, f)}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add area */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-2">
        {/* URL / DOI input */}
        <div className="flex items-center gap-2">
          <input
            className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 text-gray-700 placeholder:text-gray-300 transition-colors disabled:opacity-50"
            placeholder="Cole um DOI ou URL e pressione Enter…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(urlInput) }}
            disabled={isImporting}
          />
          <button
            onClick={() => handleAdd(urlInput)}
            disabled={isImporting || !urlInput.trim()}
            className="flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            {isImporting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Plus className="w-3 h-3" />}
            Importar
          </button>
        </div>

        {/* PDF drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) handleFileDrop(f)
          }}
          onClick={openFilePicker}
          className={cn(
            'flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed text-xs transition-colors cursor-pointer select-none',
            isDragOver
              ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
              : 'border-gray-200 text-gray-300 hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-400',
          )}
        >
          <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
          Arraste um PDF aqui ou clique para selecionar
        </div>
      </div>
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────

export function ProximasLeiturasPage() {
  const [lists, setLists] = useState<ProximasLeituras[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ mode: 'create' | 'rename'; id?: string } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()

  const pendingSaves = useRef<Map<string, Promise<void>>>(new Map())

  useEffect(() => {
    if (isDemoMode) { setLists(DEMO); setLoading(false); return }
    loadProximasLeituras()
      .then(setLists)
      .catch(() => toast({ title: 'Erro ao carregar listas de leitura', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function persistSave(lista: ProximasLeituras) {
    const inFlight = pendingSaves.current.get(lista.id)
    if (inFlight) await inFlight.catch(() => {})
    const promise = saveProximasLeituras(lista)
      .catch(() => toast({ title: 'Erro ao salvar', variant: 'destructive' }))
      .finally(() => {
        if (pendingSaves.current.get(lista.id) === promise) pendingSaves.current.delete(lista.id)
        setSaving((prev) => { const s = new Set(prev); s.delete(lista.id); return s })
      })
    pendingSaves.current.set(lista.id, promise)
  }

  function handleSave(updated: ProximasLeituras) {
    setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    if (isDemoMode) return
    setSaving((prev) => new Set(prev).add(updated.id))
    persistSave(updated)
  }

  function openCreateDialog() {
    setNameInput('')
    setDialog({ mode: 'create' })
  }

  function openRenameDialog(id: string) {
    setNameInput(lists.find((l) => l.id === id)?.name ?? '')
    setDialog({ mode: 'rename', id })
  }

  function handleDialogConfirm() {
    const name = nameInput.trim() || 'Nova Lista'
    if (dialog?.mode === 'create') {
      const now = new Date().toISOString()
      const newLista: ProximasLeituras = {
        id: crypto.randomUUID(),
        name,
        items: [],
        created_at: now,
        updated_at: now,
      }
      setLists((prev) => [newLista, ...prev])
      if (!isDemoMode) {
        setSaving((prev) => new Set(prev).add(newLista.id))
        persistSave(newLista)
      }
    } else if (dialog?.mode === 'rename' && dialog.id) {
      const lista = lists.find((l) => l.id === dialog.id)
      if (lista) handleSave({ ...lista, name })
    }
    setDialog(null)
  }

  async function handleDelete(id: string) {
    setLists((prev) => prev.filter((l) => l.id !== id))
    if (!isDemoMode) {
      try { await deleteProximasLeituras(id) }
      catch { toast({ title: 'Erro ao excluir lista', variant: 'destructive' }) }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Library className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Próximas Leituras</h1>
            {!loading && (
              <p className="text-xs text-gray-400">
                {lists.length} {lists.length === 1 ? 'lista' : 'listas'}
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={openCreateDialog}
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          Nova Lista
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Library className="w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-sm text-gray-500">Nenhuma lista de leituras ainda.</p>
            <Button
              onClick={openCreateDialog}
              variant="outline"
              size="sm"
              className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <Plus className="w-4 h-4" />
              Criar primeira lista
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {lists.map((lista) => (
              <ProximasLeiturasCard
                key={lista.id}
                lista={lista}
                isSaving={saving.has(lista.id)}
                onSave={handleSave}
                onDelete={() => setDeleteTarget(lista.id)}
                onRename={() => openRenameDialog(lista.id)}
                isDemoMode={isDemoMode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Rename dialog */}
      <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'create' ? 'Nova Lista' : 'Renomear Lista'}
            </DialogTitle>
          </DialogHeader>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
            placeholder="Nome da lista…"
            value={nameInput}
            autoFocus
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleDialogConfirm() }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button
              onClick={handleDialogConfirm}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {dialog?.mode === 'create' ? 'Criar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir lista?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Esta ação é irreversível. Todas as leituras desta lista serão removidas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget)
                setDeleteTarget(null)
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
