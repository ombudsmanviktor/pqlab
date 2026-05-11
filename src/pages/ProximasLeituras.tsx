import { useState, useEffect, useRef } from 'react'
import {
  DragDropContext, Droppable, Draggable,
  type DropResult, type DraggableProvidedDragHandleProps,
} from '@hello-pangea/dnd'
import { InlineMarkdownField } from '@/components/shared/MarkdownEditor'
import {
  Library, Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Pencil, Paperclip, X, Loader2, ExternalLink,
  LayoutGrid, LayoutList, Table2, StickyNote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ToastContainer } from '@/components/ui/toast'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import {
  loadProximasLeituras, saveProximasLeituras, deleteProximasLeituras, uploadAnexo,
} from '@/lib/storage'
import { cn, formatDate } from '@/lib/utils'
import type { ProximasLeituras, ProximasLeiturasItem, ProximasLeiturasItemPriority, Anexo } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────

type ViewMode = 'cards' | 'timeline' | 'table'
type FlatItem  = ProximasLeiturasItem & { listId: string; listName: string }

// ─── Constants ────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<ProximasLeiturasItemPriority, { label: string; className: string; dot: string }> = {
  urgente:       { label: 'Urgente',      className: 'bg-red-100 text-red-700',      dot: 'bg-red-400' },
  normal:        { label: 'Normal',       className: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  'nao-urgente': { label: 'Não urgente',  className: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-300' },
}

const PRIORITY_RANK: Record<ProximasLeiturasItemPriority, number> = {
  urgente: 0, normal: 1, 'nao-urgente': 2,
}

const PRIORITY_CYCLE: ProximasLeiturasItemPriority[] = ['urgente', 'normal', 'nao-urgente']

function nextPriority(p: ProximasLeiturasItemPriority): ProximasLeiturasItemPriority {
  return PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(p) + 1) % PRIORITY_CYCLE.length]
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

// ─── External link resolver ───────────────────────────────────────────────

function externalLink(item: ProximasLeiturasItem): string | null {
  if (item.attachment?.url) return item.attachment.url
  if (item.doi) return `https://doi.org/${item.doi}`
  if (item.url) return item.url
  return null
}

function hasExternalOnly(item: ProximasLeiturasItem): boolean {
  return !item.attachment && !!(item.doi || item.url)
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
      volume?: string; issue?: string; page?: string
    }
  }
  return {
    title:   (m.title?.[0] ?? '').replace(/<[^>]+>/g, ''),
    authors: (m.author ?? []).map((a) =>
      [a.family, a.given ? a.given[0] + '.' : ''].filter(Boolean).join(', ')),
    year:    m['published-print']?.['date-parts']?.[0]?.[0]
          ?? m['published-online']?.['date-parts']?.[0]?.[0],
    journal: m['container-title']?.[0],
    volume: m.volume, issue: m.issue, pages: m.page, doi: clean,
  }
}

async function fetchURL(url: string): Promise<Partial<ProximasLeiturasItem>> {
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`
  const res = await fetch(proxy, { signal: AbortSignal.timeout(10000) })
  const html = await res.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const meta = (n: string) =>
    doc.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute('content') ?? ''
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
  try { return isDOI ? await fetchDOI(input) : await fetchURL(input) }
  catch { return { title: input, url: input.startsWith('http') ? input : undefined } }
}

// ─── Flatten helpers ──────────────────────────────────────────────────────

function flattenItems(lists: ProximasLeituras[]): FlatItem[] {
  return lists
    .flatMap((l) => l.items.map((it) => ({ ...it, listId: l.id, listName: l.name })))
    .sort((a, b) => {
      const r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      return r !== 0 ? r : a.created_at.localeCompare(b.created_at)
    })
}

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO: ProximasLeituras[] = [
  {
    id: 'demo-1', order: 0,
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
        description: 'Texto fundamental sobre ZDP. Ver capítulo 6 com atenção especial.',
        created_at: '2026-05-02T09:00:00Z',
      },
    ],
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  },
  {
    id: 'demo-2', order: 1,
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

// ─── Field (metadata input) ───────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">{label}</span>
      <input
        className="bg-transparent border-b border-gray-200 hover:border-indigo-300 focus:border-indigo-400 outline-none text-xs text-gray-800 py-0.5 transition-colors placeholder:text-gray-300"
        value={local} placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
      />
    </div>
  )
}

// ─── LeituraItemRow (used in cards + timeline) ────────────────────────────

function LeituraItemRow({
  item, index, metaExpanded, descExpanded, isUploading, isDemoMode,
  dragHandleProps, isDragging, showListBadge, listName,
  onToggleMeta, onToggleDesc, onUpdate, onDelete, onFileAttach,
}: {
  item: ProximasLeiturasItem
  index: number
  metaExpanded: boolean
  descExpanded: boolean
  isUploading: boolean
  isDemoMode: boolean
  dragHandleProps?: DraggableProvidedDragHandleProps | null
  isDragging?: boolean
  showListBadge?: boolean
  listName?: string
  onToggleMeta: () => void
  onToggleDesc: () => void
  onUpdate: (patch: Partial<ProximasLeiturasItem>) => void
  onDelete: () => void
  onFileAttach?: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importingMeta, setImportingMeta] = useState(false)

  async function handleImportMeta() {
    const target = item.doi?.trim() || item.url?.trim()
    if (!target) return
    setImportingMeta(true)
    try { onUpdate(await fetchMeta(target)) }
    catch { /* silent */ }
    finally { setImportingMeta(false) }
  }

  const apa = formatAPA(item)
  const cfg = PRIORITY_CONFIG[item.priority]
  const link = externalLink(item)

  return (
    <div className={cn(
      'group/item border-b border-gray-50 last:border-0',
      isDragging && 'bg-indigo-50/60 rounded-md shadow-sm',
      (metaExpanded || descExpanded) && 'bg-indigo-50/20',
    )}>
      {/* Header row */}
      <div className="flex items-start gap-2 px-3 py-2">
        {/* Drag handle */}
        {dragHandleProps !== undefined && (
          <div
            {...(dragHandleProps ?? {})}
            className="opacity-0 group-hover/item:opacity-40 hover:!opacity-70 cursor-grab flex-shrink-0 mt-0.5 pt-px"
          >
            <GripVertical className="w-3.5 h-3.5 text-gray-400" />
          </div>
        )}
        {/* Number (only in cards mode) */}
        {dragHandleProps !== undefined && (
          <span className="text-xs font-mono text-indigo-400 w-5 text-right flex-shrink-0 select-none mt-0.5">
            {index + 1}.
          </span>
        )}
        {/* Priority pill */}
        <button
          onClick={() => onUpdate({ priority: nextPriority(item.priority) })}
          className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 transition-colors mt-px', cfg.className)}
          title="Clique para alterar prioridade"
        >
          {cfg.label}
        </button>
        {/* APA text + optional list badge */}
        <div className="flex-1 min-w-0">
          <p
            className="text-xs text-gray-700 leading-relaxed cursor-pointer select-none"
            onClick={onToggleMeta}
            title="Clique para editar metadados"
          >
            {apa.trim() || <span className="italic text-gray-300">Sem título — clique para editar</span>}
          </p>
          {showListBadge && listName && (
            <span className="inline-block mt-0.5 text-[9px] bg-indigo-50 text-indigo-400 px-1.5 py-px rounded-full font-medium">
              {listName}
            </span>
          )}
          {/* Description snippet when collapsed */}
          {!descExpanded && item.description && (
            <p
              className="text-[10px] text-gray-400 mt-0.5 line-clamp-1 cursor-pointer italic"
              onClick={onToggleDesc}
            >
              {item.description.replace(/[#*_`[\]]/g, '').slice(0, 120)}
            </p>
          )}
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
          {/* Description toggle */}
          <button
            onClick={onToggleDesc}
            className={cn(
              'p-1 rounded transition-colors',
              descExpanded
                ? 'text-indigo-500 bg-indigo-100'
                : 'text-gray-300 hover:text-indigo-500 hover:bg-indigo-100',
            )}
            title={descExpanded ? 'Recolher anotação' : 'Anotação'}
          >
            <StickyNote className="w-3.5 h-3.5" />
          </button>
          {/* Meta toggle */}
          <button
            onClick={onToggleMeta}
            className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-100 transition-colors"
            title={metaExpanded ? 'Recolher metadados' : 'Editar metadados'}
          >
            {metaExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {/* Attachment / link button */}
          {item.attachment?.url ? (
            <a
              href={item.attachment.url} target="_blank" rel="noreferrer"
              className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-100 transition-colors"
              title={`Download: ${item.attachment.name}`}
            >
              <Paperclip className="w-3.5 h-3.5" />
            </a>
          ) : hasExternalOnly(item) ? (
            <a
              href={link!} target="_blank" rel="noreferrer"
              className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-100 transition-colors"
              title="Abrir link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : onFileAttach ? (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-100 disabled:opacity-30 transition-colors"
              title="Anexar arquivo"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
            </button>
          ) : null}
          {/* Delete */}
          <button
            onClick={onDelete}
            className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
            title="Remover"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Description (collapsible) */}
      {descExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-indigo-100/40">
          <InlineMarkdownField
            value={item.description ?? ''}
            onChange={(v) => onUpdate({ description: v || undefined })}
            placeholder="Adicione anotações sobre esta leitura…"
            className="text-xs min-h-[2.5rem]"
          />
        </div>
      )}

      {/* Metadata fields (collapsible) */}
      {metaExpanded && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-indigo-100/60 pt-3">
          <Field label="Título" value={item.title} placeholder="Título da obra…"
            onChange={(v) => onUpdate({ title: v })} />
          <Field label="Autores (separados por ponto-e-vírgula)" value={item.authors.join('; ')}
            placeholder="Sobrenome, N.; Sobrenome, N."
            onChange={(v) => onUpdate({ authors: v.split(';').map((s) => s.trim()).filter(Boolean) })} />
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
              onClick={handleImportMeta}
              disabled={importingMeta || (!item.doi && !item.url)}
              className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importingMeta ? <Loader2 className="w-3 h-3 animate-spin" /> : <Library className="w-3 h-3" />}
              Importar metadados do DOI/URL
            </button>
            {item.attachment && (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <Paperclip className="w-3 h-3 flex-shrink-0" />
                <a href={item.attachment.url} target="_blank" rel="noreferrer"
                  className="hover:text-indigo-600 underline underline-offset-2 truncate max-w-[12rem]">
                  {item.attachment.name}
                </a>
                <button onClick={() => onUpdate({ attachment: undefined })}
                  className="hover:text-red-400 flex-shrink-0" title="Remover anexo">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      {onFileAttach && (
        <input ref={fileRef} type="file" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileAttach(f); e.target.value = '' }} />
      )}
      {isDemoMode && null}
    </div>
  )
}

// ─── ProximasLeiturasCard (cards mode) ────────────────────────────────────

function ProximasLeiturasCard({
  lista, isSaving, isDemoMode, listDragHandleProps,
  expandedMetaId, expandedDescId,
  uploadingItemId, importingListId,
  onRename, onDelete,
  onUpdateItem, onDeleteItem,
  onToggleMeta, onToggleDesc,
  onAddFromInput, onDropFile, onItemFileAttach,
}: {
  lista: ProximasLeituras
  isSaving: boolean
  isDemoMode: boolean
  listDragHandleProps: DraggableProvidedDragHandleProps | null | undefined
  expandedMetaId: string | null
  expandedDescId: string | null
  uploadingItemId: string | null
  importingListId: string | null
  onRename: () => void
  onDelete: () => void
  onUpdateItem: (itemId: string, patch: Partial<ProximasLeiturasItem>) => void
  onDeleteItem: (itemId: string) => void
  onToggleMeta: (itemId: string) => void
  onToggleDesc: (itemId: string) => void
  onAddFromInput: (listId: string, input: string) => void
  onDropFile: (listId: string, file: File) => void
  onItemFileAttach: (listId: string, itemId: string, file: File) => void
}) {
  const [urlInput, setUrlInput] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const isImporting = importingListId === lista.id

  function openFilePicker() {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = '.pdf,application/pdf'
    inp.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) onDropFile(lista.id, f) }
    inp.click()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Card header */}
      <div className="flex items-center gap-1 px-3 py-3 border-b border-gray-100">
        {/* List drag handle */}
        <div
          {...(listDragHandleProps ?? {})}
          className="opacity-0 hover:opacity-50 cursor-grab flex-shrink-0 p-0.5"
          title="Reordenar lista"
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
        <Library className="w-4 h-4 text-indigo-400 flex-shrink-0 ml-1" />
        <h2 className="text-sm font-semibold text-gray-900 truncate flex-1 ml-1">{lista.name}</h2>
        <Badge variant="secondary" className="text-[10px] text-gray-400 bg-gray-50 flex-shrink-0">
          {lista.items.length}
        </Badge>
        {isSaving && <span className="text-[10px] text-gray-300 animate-pulse ml-1">salvando…</span>}
        <button onClick={onRename} className="p-1.5 rounded hover:bg-indigo-50 text-gray-300 hover:text-indigo-500 transition-colors ml-1" title="Renomear">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors" title="Excluir lista">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Items */}
      <Droppable droppableId={lista.id} type="ITEM">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="flex-1">
            {lista.items.length === 0 && (
              <p className="text-xs text-gray-300 italic px-4 py-3 select-none">
                Nenhuma leitura ainda. Cole um DOI/URL abaixo ou arraste um PDF.
              </p>
            )}
            {lista.items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(drag, snap) => (
                  <div ref={drag.innerRef} {...drag.draggableProps}>
                    <LeituraItemRow
                      item={item} index={index}
                      metaExpanded={expandedMetaId === item.id}
                      descExpanded={expandedDescId === item.id}
                      isUploading={uploadingItemId === item.id}
                      isDemoMode={isDemoMode}
                      dragHandleProps={drag.dragHandleProps}
                      isDragging={snap.isDragging}
                      onToggleMeta={() => onToggleMeta(item.id)}
                      onToggleDesc={() => onToggleDesc(item.id)}
                      onUpdate={(patch) => onUpdateItem(item.id, patch)}
                      onDelete={() => onDeleteItem(item.id)}
                      onFileAttach={(f) => onItemFileAttach(lista.id, item.id, f)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Add area */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-2">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 text-gray-700 placeholder:text-gray-300 transition-colors disabled:opacity-50"
            placeholder="Cole um DOI ou URL e pressione Enter…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onAddFromInput(lista.id, urlInput); setUrlInput('') } }}
            disabled={isImporting}
          />
          <button
            onClick={() => { onAddFromInput(lista.id, urlInput); setUrlInput('') }}
            disabled={isImporting || !urlInput.trim()}
            className="flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Importar
          </button>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) onDropFile(lista.id, f) }}
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

// ─── Timeline view ────────────────────────────────────────────────────────

function TimelineView({
  items, expandedMetaId, expandedDescId,
  onToggleMeta, onToggleDesc, onUpdateItem, onDeleteItem,
}: {
  items: FlatItem[]
  expandedMetaId: string | null
  expandedDescId: string | null
  onToggleMeta: (itemId: string) => void
  onToggleDesc: (itemId: string) => void
  onUpdateItem: (listId: string, itemId: string, patch: Partial<ProximasLeiturasItem>) => void
  onDeleteItem: (listId: string, itemId: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <Library className="w-8 h-8" />
        <p className="text-sm">Nenhuma leitura em nenhuma lista.</p>
      </div>
    )
  }

  let lastPriority: string | null = null

  return (
    <div className="max-w-2xl mx-auto">
      {items.map((item) => {
        const cfg = PRIORITY_CONFIG[item.priority]
        const showSection = item.priority !== lastPriority
        lastPriority = item.priority
        return (
          <div key={item.id}>
            {/* Priority section header */}
            {showSection && (
              <div className="flex items-center gap-3 mb-3 mt-5 first:mt-0">
                <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {cfg.label}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            )}
            {/* Timeline item */}
            <div className="flex gap-3 mb-2">
              <div className="flex flex-col items-center flex-shrink-0 pt-3">
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
                <div className="w-px flex-1 bg-gray-100 mt-1" />
              </div>
              <div className="flex-1 min-w-0 mb-1 bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden">
                <LeituraItemRow
                  item={item}
                  index={0}
                  metaExpanded={expandedMetaId === item.id}
                  descExpanded={expandedDescId === item.id}
                  isUploading={false}
                  isDemoMode={false}
                  showListBadge
                  listName={item.listName}
                  onToggleMeta={() => onToggleMeta(item.id)}
                  onToggleDesc={() => onToggleDesc(item.id)}
                  onUpdate={(patch) => onUpdateItem(item.listId, item.id, patch)}
                  onDelete={() => onDeleteItem(item.listId, item.id)}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Table view ───────────────────────────────────────────────────────────

function TableView({
  items, onUpdateItem, onDeleteItem,
}: {
  items: FlatItem[]
  onUpdateItem: (listId: string, itemId: string, patch: Partial<ProximasLeiturasItem>) => void
  onDeleteItem: (listId: string, itemId: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <Library className="w-8 h-8" />
        <p className="text-sm">Nenhuma leitura em nenhuma lista.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              {['Autores', 'Título', 'Ano', 'Publicação', 'Prioridade', 'Adicionado', 'Link'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const cfg = PRIORITY_CONFIG[item.priority]
              const link = externalLink(item)
              return (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-indigo-50/20 transition-colors group/row">
                  <td className="px-4 py-2.5 text-gray-600 max-w-[10rem]">
                    <span className="line-clamp-2">
                      {item.authors.length ? item.authors.join('; ') : <span className="text-gray-300 italic">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[14rem]">
                    <span className="line-clamp-2">{item.title || <span className="text-gray-300 italic">Sem título</span>}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {item.year ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-[10rem]">
                    <span className="line-clamp-1">{item.journal ?? <span className="text-gray-300">—</span>}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <button
                      onClick={() => onUpdateItem(item.listId, item.id, { priority: nextPriority(item.priority) })}
                      className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors', cfg.className)}
                    >
                      {cfg.label}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                    {formatDate(item.created_at.split('T')[0])}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {link ? (
                      <a
                        href={link} target="_blank" rel="noreferrer"
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                          item.attachment
                            ? 'text-indigo-600 hover:bg-indigo-50'
                            : 'text-indigo-600 hover:bg-indigo-50',
                        )}
                        title={item.attachment ? `Download: ${item.attachment.name}` : 'Abrir link'}
                      >
                        {item.attachment
                          ? <><Paperclip className="w-3 h-3" /> PDF</>
                          : <><ExternalLink className="w-3 h-3" /> Link</>}
                      </a>
                    ) : (
                      <span className="text-gray-200">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => onDeleteItem(item.listId, item.id)}
                      className="opacity-0 group-hover/row:opacity-60 hover:!opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all"
                      title="Remover"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────

export function ProximasLeiturasPage() {
  const [lists, setLists] = useState<ProximasLeituras[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [expandedMetaId, setExpandedMetaId] = useState<string | null>(null)
  const [expandedDescId, setExpandedDescId] = useState<string | null>(null)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [importingListId, setImportingListId] = useState<string | null>(null)
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ mode: 'create' | 'rename'; id?: string } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const pendingSaves = useRef<Map<string, Promise<void>>>(new Map())
  const saveTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (isDemoMode) { setLists(DEMO); setLoading(false); return }
    loadProximasLeituras()
      .then(setLists)
      .catch(() => toast({ title: 'Erro ao carregar listas de leitura', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persistence ────────────────────────────────────────────────────────

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

  function handleSaveList(updated: ProximasLeituras) {
    setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    if (isDemoMode) return
    setSaving((prev) => new Set(prev).add(updated.id))
    // Debounce: cancela timer anterior para esta lista e aguarda 1,2 s após
    // o último update (evita conflitos de SHA em campos com onChange por tecla).
    const prev = saveTimers.current.get(updated.id)
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      saveTimers.current.delete(updated.id)
      persistSave(updated)
    }, 1200)
    saveTimers.current.set(updated.id, t)
  }

  // ─── DnD handler ────────────────────────────────────────────────────────

  function handleDragEnd(result: DropResult) {
    const { source, destination, type } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    if (type === 'LIST') {
      // Reorder lists
      const arr = Array.from(lists)
      const [moved] = arr.splice(source.index, 1)
      arr.splice(destination.index, 0, moved)
      const withOrder = arr.map((l, i) => ({ ...l, order: i }))
      setLists(withOrder)
      if (!isDemoMode) withOrder.forEach((l) => {
        setSaving((prev) => new Set(prev).add(l.id))
        persistSave(l)
      })
    } else {
      // Reorder items within a list
      const listId = source.droppableId
      const lista = lists.find((l) => l.id === listId)
      if (!lista) return
      const arr = Array.from(lista.items)
      const [moved] = arr.splice(source.index, 1)
      arr.splice(destination.index, 0, moved)
      handleSaveList({ ...lista, items: arr.map((it, i) => ({ ...it, order: i })) })
    }
  }

  // ─── Item operations ─────────────────────────────────────────────────────

  function handleUpdateItem(listId: string, itemId: string, patch: Partial<ProximasLeiturasItem>) {
    const lista = lists.find((l) => l.id === listId)
    if (!lista) return
    handleSaveList({ ...lista, items: lista.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) })
  }

  function handleDeleteItem(listId: string, itemId: string) {
    const lista = lists.find((l) => l.id === listId)
    if (!lista) return
    if (expandedMetaId === itemId) setExpandedMetaId(null)
    if (expandedDescId === itemId) setExpandedDescId(null)
    handleSaveList({ ...lista, items: lista.items.filter((it) => it.id !== itemId).map((it, i) => ({ ...it, order: i })) })
  }

  function handleToggleMeta(itemId: string) {
    setExpandedMetaId((prev) => (prev === itemId ? null : itemId))
  }

  function handleToggleDesc(itemId: string) {
    setExpandedDescId((prev) => (prev === itemId ? null : itemId))
  }

  // ─── Adding items ─────────────────────────────────────────────────────

  async function handleAddToList(listId: string, input: string) {
    const inp = input.trim()
    if (!inp) return
    const lista = lists.find((l) => l.id === listId)
    if (!lista) return
    setImportingListId(listId)
    const meta = await fetchMeta(inp)
    const newItem: ProximasLeiturasItem = {
      id: crypto.randomUUID(),
      order: lista.items.length,
      priority: 'normal',
      title:   meta.title   ?? inp,
      authors: meta.authors ?? [],
      year:    meta.year,    journal: meta.journal,
      volume:  meta.volume,  issue:   meta.issue,
      pages:   meta.pages,   doi:     meta.doi,
      url:     meta.url,
      created_at: new Date().toISOString(),
    }
    setImportingListId(null)
    setExpandedMetaId(newItem.id)
    handleSaveList({ ...lista, items: [...lista.items, newItem] })
  }

  async function handleDropFile(listId: string, file: File) {
    const isPDF = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    if (!isPDF) return
    const lista = lists.find((l) => l.id === listId)
    if (!lista) return
    let attachment: Anexo | undefined
    if (!isDemoMode) {
      try { attachment = await uploadAnexo('proximasleituras', listId, file) }
      catch { /* continue */ }
    } else {
      attachment = { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, path: '', url: URL.createObjectURL(file) }
    }
    const newItem: ProximasLeiturasItem = {
      id: crypto.randomUUID(), order: lista.items.length, priority: 'normal',
      title: file.name.replace(/\.pdf$/i, ''), authors: [],
      created_at: new Date().toISOString(), attachment,
    }
    setExpandedMetaId(newItem.id)
    handleSaveList({ ...lista, items: [...lista.items, newItem] })
  }

  async function handleItemFileAttach(listId: string, itemId: string, file: File) {
    setUploadingItemId(itemId)
    let attachment: Anexo | undefined
    if (!isDemoMode) {
      try { attachment = await uploadAnexo('proximasleituras', listId, file) }
      catch { setUploadingItemId(null); return }
    } else {
      attachment = { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, path: '', url: URL.createObjectURL(file) }
    }
    setUploadingItemId(null)
    handleUpdateItem(listId, itemId, { attachment })
  }

  // ─── List CRUD ────────────────────────────────────────────────────────

  function handleDialogConfirm() {
    const name = nameInput.trim() || 'Nova Lista'
    if (dialog?.mode === 'create') {
      const now = new Date().toISOString()
      const newLista: ProximasLeituras = {
        id: crypto.randomUUID(), name, items: [],
        order: lists.length, created_at: now, updated_at: now,
      }
      setLists((prev) => [...prev, newLista])
      if (!isDemoMode) { setSaving((prev) => new Set(prev).add(newLista.id)); persistSave(newLista) }
    } else if (dialog?.mode === 'rename' && dialog.id) {
      const lista = lists.find((l) => l.id === dialog.id)
      if (lista) handleSaveList({ ...lista, name })
    }
    setDialog(null)
  }

  async function handleDeleteList(id: string) {
    setLists((prev) => prev.filter((l) => l.id !== id))
    if (!isDemoMode) {
      try { await deleteProximasLeituras(id) }
      catch { toast({ title: 'Erro ao excluir lista', variant: 'destructive' }) }
    }
  }

  // ─── Derived data ─────────────────────────────────────────────────────

  const flatItems = flattenItems(lists)
  const totalItems = lists.reduce((n, l) => n + l.items.length, 0)

  // ─── Render ───────────────────────────────────────────────────────────

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
                {lists.length} {lists.length === 1 ? 'lista' : 'listas'} · {totalItems} {totalItems === 1 ? 'leitura' : 'leituras'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([
              { mode: 'cards'    as ViewMode, icon: LayoutGrid, title: 'Cards por lista' },
              { mode: 'timeline' as ViewMode, icon: LayoutList,  title: 'Timeline por prioridade' },
              { mode: 'table'    as ViewMode, icon: Table2,      title: 'Tabela completa' },
            ] as const).map(({ mode, icon: Icon, title }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={title}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewMode === mode
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600',
                )}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <Button
            onClick={() => { setNameInput(''); setDialog({ mode: 'create' }) }}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            Nova Lista
          </Button>
        </div>
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
              onClick={() => { setNameInput(''); setDialog({ mode: 'create' }) }}
              variant="outline" size="sm"
              className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <Plus className="w-4 h-4" /> Criar primeira lista
            </Button>
          </div>
        ) : viewMode === 'cards' ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="lists" type="LIST">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start"
                >
                  {lists.map((lista, index) => (
                    <Draggable key={lista.id} draggableId={`list-${lista.id}`} index={index}>
                      {(drag, snap) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={cn(snap.isDragging && 'opacity-80 rotate-1')}
                        >
                          <ProximasLeiturasCard
                            lista={lista}
                            isSaving={saving.has(lista.id)}
                            isDemoMode={isDemoMode}
                            listDragHandleProps={drag.dragHandleProps}
                            expandedMetaId={expandedMetaId}
                            expandedDescId={expandedDescId}
                            uploadingItemId={uploadingItemId}
                            importingListId={importingListId}
                            onRename={() => {
                              setNameInput(lista.name)
                              setDialog({ mode: 'rename', id: lista.id })
                            }}
                            onDelete={() => setDeleteTarget(lista.id)}
                            onUpdateItem={(itemId, patch) => handleUpdateItem(lista.id, itemId, patch)}
                            onDeleteItem={(itemId) => handleDeleteItem(lista.id, itemId)}
                            onToggleMeta={handleToggleMeta}
                            onToggleDesc={handleToggleDesc}
                            onAddFromInput={handleAddToList}
                            onDropFile={handleDropFile}
                            onItemFileAttach={handleItemFileAttach}
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
        ) : viewMode === 'timeline' ? (
          <TimelineView
            items={flatItems}
            expandedMetaId={expandedMetaId}
            expandedDescId={expandedDescId}
            onToggleMeta={handleToggleMeta}
            onToggleDesc={handleToggleDesc}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
          />
        ) : (
          <TableView
            items={flatItems}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
          />
        )}
      </div>

      {/* Create / Rename dialog */}
      <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'create' ? 'Nova Lista' : 'Renomear Lista'}</DialogTitle>
          </DialogHeader>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
            placeholder="Nome da lista…" autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleDialogConfirm() }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={handleDialogConfirm} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {dialog?.mode === 'create' ? 'Criar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir lista?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Esta ação é irreversível. Todas as leituras desta lista serão removidas.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { if (deleteTarget) handleDeleteList(deleteTarget); setDeleteTarget(null) }}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
