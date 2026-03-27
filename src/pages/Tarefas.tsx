import { useState, useEffect, useRef } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  CheckSquare, Square, Plus, Edit2, Trash2, GripVertical, X,
  ChevronDown, ChevronUp, FolderPlus, LayoutGrid, List as ListIcon, Calendar, Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ToastContainer } from '@/components/ui/toast'
import { MarkdownEditor, MarkdownRenderer } from '@/components/shared/MarkdownEditor'
import { useAuth } from '@/contexts/AuthContext'
import { useWikiLinks, extractWikiLinks } from '@/contexts/WikiLinkContext'
import { useToast } from '@/hooks/useToast'
import { loadListas, saveLista, deleteLista } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import type { Lista, ListaItem, ListaGrupo } from '@/types'

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO: Lista[] = [
  {
    id: '1', title: 'Tarefas de março', description: 'Lista de afazeres do mês',
    grupos: [
      { id: 'g1', title: 'Pesquisa de campo', order: 0 },
      { id: 'g2', title: 'Escrita', order: 1 },
    ],
    items: [
      { id: 'i1', title: 'Transcrever entrevista #1', description: 'Entrevista gravada em 05/03', order: 0, done: true, grupoId: 'g1' },
      { id: 'i2', title: 'Visitar arquivo municipal', description: 'Verificar documentos da caixa 14', order: 1, done: false, grupoId: 'g1' },
      { id: 'i3', title: 'Redigir seção 2 da dissertação', order: 0, done: false, grupoId: 'g2' },
      { id: 'i4', title: 'Revisar fichamentos de Mills', order: 1, done: false, grupoId: 'g2' },
      { id: 'i5', title: 'Agendar reunião com orientador', order: 4, done: false },
    ],
    created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
]

// ─── Canvas tag colors ────────────────────────────────────────────────────
const TAG_COLORS = [
  { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' },
]
function tagColor(idx: number) { return TAG_COLORS[idx % TAG_COLORS.length] }

// ─── Canvas card edit dialog ───────────────────────────────────────────────
function CanvasCardEditDialog({
  open, onClose, onSave, item, canvaTags,
}: {
  open: boolean; onClose: () => void; onSave: (item: ListaItem) => void
  item: ListaItem; canvaTags: string[]
}) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description ?? '')
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags ?? [])

  useEffect(() => {
    if (open) {
      setTitle(item.title)
      setDescription(item.description ?? '')
      setSelectedTags(item.tags ?? [])
    }
  }, [open, item])

  function handleSave() {
    if (!title.trim()) return
    onSave({ ...item, title: title.trim(), description: description || undefined, tags: selectedTags })
    onClose()
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Editar card</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (title.trim()) handleSave() } }} />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              Descrição
              <span className="text-xs text-gray-400 font-normal">(Markdown · <code className="bg-gray-100 px-1 rounded">[[wikilinks]]</code>)</span>
            </Label>
            <MarkdownEditor value={description} onChange={setDescription} minHeight={140}
              placeholder="Notas, contexto, [[título de outra tarefa]]..." />
          </div>
          {canvaTags.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {canvaTags.map((tag, idx) => {
                  const c = tagColor(idx)
                  const active = selectedTags.includes(tag)
                  return (
                    <button key={tag} type="button" onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                        ${active ? `${c.bg} ${c.text} ${c.border} shadow-sm` : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'}`}>
                      {active ? '✓ ' : ''}{tag}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Canvas item card (Tarefas) ────────────────────────────────────────────
function CanvasItemCard({
  item, canvaTags, onDragEnd, onUpdate, onDelete,
}: {
  item: ListaItem
  canvaTags: string[]
  onDragEnd: (x: number, y: number) => void
  onUpdate: (item: ListaItem) => void
  onDelete: () => void
}) {
  const [pos, setPos] = useState({ x: item.x ?? 40, y: item.y ?? 40 })
  const [dragging, setDragging] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const start = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  useEffect(() => {
    if (!dragging) setPos({ x: item.x ?? 40, y: item.y ?? 40 })
  }, [item.x, item.y]) // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button,input,textarea')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    start.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !start.current) return
    setPos({
      x: Math.max(0, start.current.px + (e.clientX - start.current.mx)),
      y: Math.max(0, start.current.py + (e.clientY - start.current.my)),
    })
  }
  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    onDragEnd(pos.x, pos.y)
  }

  const assignedTags = item.tags ?? []
  const availableTags = canvaTags.filter((t) => !assignedTags.includes(t))

  function removeTag(tag: string) {
    onUpdate({ ...item, tags: assignedTags.filter((t) => t !== tag) })
  }
  function addTag(tag: string) {
    onUpdate({ ...item, tags: [...assignedTags, tag] })
    setTagPickerOpen(false)
  }

  const descPreview = item.description
    ? item.description.replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[#*_`>]/g, '').trim()
    : ''

  return (
    <div
      style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: dragging ? 50 : 1, touchAction: 'none' }}
      className={`w-56 bg-white rounded-xl border select-none transition-shadow flex flex-col
        ${dragging ? 'shadow-xl border-pink-300 cursor-grabbing' : 'shadow-sm border-gray-200 cursor-grab'}
        ${item.done ? 'opacity-60' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="flex items-start gap-1.5 px-2.5 pt-2.5 pb-2 border-b border-gray-100">
        <button onClick={() => onUpdate({ ...item, done: !item.done })} className="shrink-0 mt-0.5">
          {item.done
            ? <CheckSquare className="w-4 h-4 text-green-500" />
            : <Square className="w-4 h-4 text-gray-400 hover:text-gray-600" />}
        </button>
        <span className={`flex-1 text-sm font-medium leading-snug ${item.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {item.title}
        </span>
        <div className="flex shrink-0 gap-0.5 ml-1">
          <button onClick={() => setEditOpen(true)} className="p-1 text-gray-300 hover:text-pink-500 transition-colors" title="Editar">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Excluir">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {descPreview && (
        <div className="px-2.5 py-2 text-xs text-gray-500 leading-relaxed line-clamp-3 border-b border-gray-50">
          {descPreview}
        </div>
      )}

      {(assignedTags.length > 0 || availableTags.length > 0) && (
        <div className="px-2.5 py-2 flex flex-wrap gap-1 items-center">
          {assignedTags.map((tag) => {
            const idx = canvaTags.indexOf(tag)
            const c = tagColor(idx >= 0 ? idx : 0)
            return (
              <span key={tag}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
                {tag}
                <button onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100 leading-none">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )
          })}
          {availableTags.length > 0 && (
            <div className="relative">
              <button onClick={() => setTagPickerOpen((p) => !p)}
                className="w-5 h-5 flex items-center justify-center rounded-full text-xs border border-dashed border-gray-300 text-gray-400 hover:border-pink-400 hover:text-pink-500 transition-colors"
                title="Adicionar tag">
                +
              </button>
              {tagPickerOpen && (
                <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-50 flex flex-col gap-0.5 min-w-max">
                  {availableTags.map((tag) => {
                    const idx = canvaTags.indexOf(tag)
                    const c = tagColor(idx >= 0 ? idx : 0)
                    return (
                      <button key={tag} onClick={() => addTag(tag)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium text-left ${c.bg} ${c.text} hover:opacity-90`}>
                        {tag}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CanvasCardEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={(updated) => { onUpdate(updated); setEditOpen(false) }}
        item={item}
        canvaTags={canvaTags}
      />
    </div>
  )
}

// ─── Canvas editor (Tarefas) ───────────────────────────────────────────────
function CanvasEditor({ lista, onSave, onClose }: { lista: Lista; onSave: (l: Lista) => void; onClose: () => void }) {
  const [current, setCurrent] = useState<Lista>(lista)
  const [saving, setSaving] = useState(false)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [newTagInput, setNewTagInput] = useState('')

  function addTag() {
    const tag = newTagInput.trim()
    if (!tag || current.canvaTags?.includes(tag)) return
    setCurrent((prev) => ({ ...prev, canvaTags: [...(prev.canvaTags ?? []), tag] }))
    setNewTagInput('')
  }

  function removeCanvaTag(tag: string) {
    setCurrent((prev) => ({
      ...prev,
      canvaTags: (prev.canvaTags ?? []).filter((t) => t !== tag),
      items: prev.items.map((i) => ({ ...i, tags: i.tags?.filter((t) => t !== tag) })),
    }))
    if (filterTag === tag) setFilterTag(null)
  }

  function handleDragEnd(id: string, x: number, y: number) {
    setCurrent((prev) => ({
      ...prev,
      items: prev.items.map((i) => i.id === id ? { ...i, x, y } : i),
    }))
  }

  function handleUpdate(item: ListaItem) {
    setCurrent((prev) => ({ ...prev, items: prev.items.map((i) => i.id === item.id ? item : i) }))
  }

  function handleDelete(id: string) {
    setCurrent((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }))
  }

  function addItem() {
    const newItem: ListaItem = {
      id: crypto.randomUUID(),
      title: 'Nova tarefa',
      order: current.items.length,
      done: false,
      x: 60 + Math.round(Math.random() * 300),
      y: 60 + Math.round(Math.random() * 200),
    }
    setCurrent((prev) => ({ ...prev, items: [...prev.items, newItem] }))
  }

  async function handleSave() {
    setSaving(true)
    await onSave({ ...current, updated_at: new Date().toISOString() })
    setSaving(false)
  }

  const displayed = filterTag ? current.items.filter((i) => i.tags?.includes(filterTag)) : current.items

  return (
    <div className="space-y-3">
      <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
        <input
          value={current.title}
          onChange={(e) => setCurrent((prev) => ({ ...prev, title: e.target.value }))}
          className="text-lg font-bold text-gray-900 bg-transparent focus:outline-none flex-1 min-w-0"
          placeholder="Título do canva"
        />
        <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4" /> Item</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        <Button size="sm" variant="outline" onClick={onClose}>Voltar</Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Tag className="w-4 h-4 text-gray-400 shrink-0" />
        {(current.canvaTags ?? []).map((tag, idx) => {
          const c = tagColor(idx)
          return (
            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all
                ${c.bg} ${c.text} ${c.border} ${filterTag === tag ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
              {tag}
              <X className="w-3 h-3 opacity-60" onClick={(e) => { e.stopPropagation(); removeCanvaTag(tag) }} />
            </button>
          )
        })}
        <div className="flex gap-1">
          <Input value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)}
            placeholder="Nova tag" className="h-7 text-xs w-24"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
          <Button size="sm" onClick={addTag} disabled={!newTagInput.trim()} className="h-7 px-2"><Plus className="w-3 h-3" /></Button>
        </div>
        {filterTag && (
          <button onClick={() => setFilterTag(null)} className="text-xs text-gray-500 underline">Limpar filtro</button>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl overflow-auto bg-[#f8f9fb]" style={{ height: 560 }}>
        <div style={{ position: 'relative', width: 1600, height: 1100 }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="1600" height="1100">
            <defs>
              <pattern id="dots-t" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#e2e8f0" />
              </pattern>
            </defs>
            <rect width="1600" height="1100" fill="url(#dots-t)" />
          </svg>
          {displayed.map((item) => (
            <CanvasItemCard
              key={item.id}
              item={item}
              canvaTags={current.canvaTags ?? []}
              onDragEnd={(x, y) => handleDragEnd(item.id, x, y)}
              onUpdate={handleUpdate}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
          {displayed.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-gray-400">
                <LayoutGrid className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">{filterTag ? 'Nenhum item com esta tag' : 'Clique em + Item para adicionar'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Item detail dialog (for description + group editing) ─────────────────

function ItemDetailDialog({
  open, onClose, onSave, initial, grupos,
}: {
  open: boolean; onClose: () => void; onSave: (item: ListaItem) => void; initial?: ListaItem; grupos: ListaGrupo[];
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [grupoId, setGrupoId] = useState(initial?.grupoId ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '')
      setDescription(initial?.description ?? '')
      setGrupoId(initial?.grupoId ?? '')
      setDueDate(initial?.dueDate ?? '')
    }
  }, [open, initial])

  function handleSave() {
    if (!title.trim()) return
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description || undefined,
      order: initial?.order ?? 0,
      done: initial?.done ?? false,
      grupoId: grupoId || undefined,
      dueDate: dueDate || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da tarefa" autoFocus />
          </div>
          {grupos.length > 0 && (
            <div className="space-y-1.5">
              <Label>Grupo</Label>
              <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
                <option value="">Sem grupo</option>
                {grupos.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Data limite</Label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <MarkdownEditor value={description} onChange={setDescription} placeholder="Notas sobre esta tarefa..." minHeight={120} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {initial ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Task editor ──────────────────────────────────────────────────────────

function TarefaEditor({ lista, onSave, onClose }: { lista: Lista; onSave: (l: Lista) => void; onClose: () => void }) {
  const [current, setCurrent] = useState<Lista>(lista)
  const [quickAdd, setQuickAdd] = useState('')
  const [newGrupo, setNewGrupo] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ListaItem | undefined>()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const items = Array.from(current.items)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setCurrent((prev) => ({ ...prev, items: items.map((item, i) => ({ ...item, order: i })) }))
  }

  function handleQuickAdd() {
    if (!quickAdd.trim()) return
    const newItem: ListaItem = {
      id: crypto.randomUUID(),
      title: quickAdd.trim(),
      order: current.items.length,
      done: false,
    }
    setCurrent((prev) => ({ ...prev, items: [...prev.items, newItem] }))
    setQuickAdd('')
  }

  function addGrupo() {
    if (!newGrupo.trim()) return
    const g: ListaGrupo = { id: crypto.randomUUID(), title: newGrupo.trim(), order: current.grupos.length }
    setCurrent((prev) => ({ ...prev, grupos: [...prev.grupos, g] }))
    setNewGrupo('')
  }

  function handleItemTitleChange(id: string, newTitle: string) {
    setCurrent((prev) => ({
      ...prev,
      items: prev.items.map((item) => item.id === id ? { ...item, title: newTitle } : item),
    }))
  }

  function handleItemSave(item: ListaItem) {
    setCurrent((prev) => {
      const idx = prev.items.findIndex((x) => x.id === item.id)
      if (idx >= 0) {
        const next = [...prev.items]; next[idx] = item; return { ...prev, items: next }
      }
      return { ...prev, items: [...prev.items, { ...item, order: prev.items.length }] }
    })
  }

  function toggleDone(id: string) {
    setCurrent((prev) => ({
      ...prev,
      items: prev.items.map((item) => item.id === id ? { ...item, done: !item.done } : item),
    }))
  }

  async function handleSave() {
    setSaving(true)
    await onSave({ ...current, updated_at: new Date().toISOString() })
    setSaving(false)
  }

  const done = current.items.filter((i) => i.done).length
  const total = current.items.length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  const allItemsOrdered = [...current.items].sort((a, b) => a.order - b.order)
  const ungrouped = allItemsOrdered.filter((i) => !i.grupoId)
  const grouped = current.grupos.map((g) => ({
    group: g,
    items: allItemsOrdered.filter((i) => i.grupoId === g.id),
  }))

  function renderItem(item: ListaItem, dragIndex: number) {
    const isExpanded = expandedItems.has(item.id)
    const today = new Date().toISOString().split('T')[0]
    const isOverdue = !item.done && item.dueDate && item.dueDate < today
    const isDueToday = !item.done && item.dueDate && item.dueDate === today
    return (
      <Draggable key={item.id} draggableId={item.id} index={dragIndex}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`flex flex-col border rounded-lg overflow-hidden bg-white transition-all cursor-grab active:cursor-grabbing ${item.done ? 'opacity-55' : ''} ${isOverdue ? 'border-red-300' : ''}`}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <button onClick={(e) => { e.stopPropagation(); toggleDone(item.id) }} className="shrink-0">
                {item.done
                  ? <CheckSquare className="w-4 h-4 text-pink-500" />
                  : <Square className="w-4 h-4 text-gray-400 hover:text-gray-600" />}
              </button>
              <input
                value={item.title}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); handleItemTitleChange(item.id, e.target.value) }}
                className={`flex-1 text-sm font-medium bg-transparent focus:outline-none cursor-text ${item.done ? 'line-through text-gray-400' : 'text-gray-900'}`}
                placeholder="Título da tarefa"
              />
              {item.dueDate && (
                <span className={`flex items-center gap-1 text-xs shrink-0 px-1.5 py-0.5 rounded-md font-medium
                  ${isOverdue ? 'bg-red-100 text-red-600' : isDueToday ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                  <Calendar className="w-3 h-3" />
                  {item.dueDate.split('-').reverse().join('/')}
                </span>
              )}
              {item.description && (
                <button onClick={(e) => { e.stopPropagation(); toggleExpand(item.id) }}
                  className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setDetailOpen(true) }}
                className="p-1 text-gray-400 hover:text-green-600 shrink-0">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setCurrent((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== item.id) })) }}
                className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {isExpanded && item.description && (
              <div className="px-10 pb-3 border-t border-gray-100">
                <MarkdownRenderer content={item.description} className="text-sm" />
              </div>
            )}
          </div>
        )}
      </Draggable>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              value={current.title}
              onChange={(e) => setCurrent((prev) => ({ ...prev, title: e.target.value }))}
              className="text-lg font-bold text-gray-900 bg-transparent focus:outline-none focus:border-b border-pink-300 w-full"
              placeholder="Título da lista"
            />
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-gray-500">{done}/{total} concluídas</p>
              {total > 0 && (
                <div className="flex-1 max-w-32 bg-pink-200 rounded-full h-1.5">
                  <div className="bg-pink-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick-add bar */}
      <div className="flex gap-2">
        <Input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          placeholder="Adicionar tarefa... (Enter para criar)"
          onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd() }}
          className="flex-1"
        />
        <Button size="sm" onClick={handleQuickAdd} disabled={!quickAdd.trim()} variant="outline">
          <Plus className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setEditingItem(undefined); setDetailOpen(true) }} title="Nova tarefa com notas">
          <Edit2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Groups */}
      <div className="flex items-center gap-2 flex-wrap">
        <FolderPlus className="w-4 h-4 text-gray-400" />
        {current.grupos.map((g) => (
          <div key={g.id} className="flex items-center gap-1 bg-pink-50 border border-pink-200 rounded-lg px-2 py-1">
            <span className="text-xs text-pink-700 font-medium">{g.title}</span>
            <button onClick={() => setCurrent((prev) => ({
              ...prev,
              grupos: prev.grupos.filter((x) => x.id !== g.id),
              items: prev.items.map((item) => item.grupoId === g.id ? { ...item, grupoId: undefined } : item),
            }))} className="text-pink-400 hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <Input value={newGrupo} onChange={(e) => setNewGrupo(e.target.value)} placeholder="Novo grupo" className="h-7 text-xs w-28"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGrupo() } }} />
          <Button size="sm" onClick={addGrupo} disabled={!newGrupo.trim()} className="h-7 text-xs px-2">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Items DnD */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="items">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
              {grouped.map((g) => g.items.length > 0 && (
                <div key={g.group.id}>
                  <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide px-1 mb-1">{g.group.title}</p>
                  {g.items.map((item) => renderItem(item, allItemsOrdered.findIndex((x) => x.id === item.id)))}
                </div>
              ))}
              {ungrouped.length > 0 && (
                <div>
                  {current.grupos.length > 0 && (
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1">Sem grupo</p>
                  )}
                  {ungrouped.map((item) => renderItem(item, allItemsOrdered.findIndex((x) => x.id === item.id)))}
                </div>
              )}
              {current.items.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma tarefa. Digite acima e pressione Enter.</p>
                </div>
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Voltar</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <ItemDetailDialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setEditingItem(undefined) }}
        onSave={handleItemSave}
        initial={editingItem}
        grupos={current.grupos}
      />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export function Tarefas() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const { register } = useWikiLinks()
  const [listas, setListas] = useState<Lista[]>(isDemoMode ? DEMO : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [editing, setEditing] = useState<Lista | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list')
  const [newListTitle, setNewListTitle] = useState('')
  const [newKind, setNewKind] = useState<'lista' | 'canva' | null>(null)
  const [newListOpen, setNewListOpen] = useState(false)

  useEffect(() => {
    if (isDemoMode) return
    loadListas()
      .then((data) => { setListas(data); setLoading(false) })
      .catch((err: Error) => {
        toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' })
        setLoading(false)
      })
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    register(listas.map((l) => ({
      id: l.id, title: l.title, route: '/tarefas',
      module: 'tarefas' as const,
      wikiLinks: l.items.flatMap((i) => extractWikiLinks(i.description ?? '')),
    })))
  }, [listas, register])

  function handleCreateList() {
    if (!newListTitle.trim() || !newKind) return
    const now = new Date().toISOString()
    const newLista: Lista = {
      id: crypto.randomUUID(), title: newListTitle.trim(),
      kind: newKind,
      grupos: [], items: [], created_at: now, updated_at: now,
    }
    setNewListTitle(''); setNewKind(null); setNewListOpen(false)
    setEditing(newLista)
  }

  async function handleSave(l: Lista) {
    if (!isDemoMode) {
      try { await saveLista(l) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' }); return
      }
    }
    setListas((prev) => {
      const idx = prev.findIndex((x) => x.id === l.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = l; return next }
      return [l, ...prev]
    })
    setEditing(null)
    toast({ title: 'Lista salva' })
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta lista?')) return
    if (!isDemoMode) {
      try { await deleteLista(id) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' }); return
      }
    }
    setListas((prev) => prev.filter((l) => l.id !== id))
    toast({ title: 'Lista excluída' })
  }

  if (editing) {
    return (
      <div className="animate-fade-in space-y-6">
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            {editing.kind === 'canva' ? <LayoutGrid className="w-5 h-5 text-pink-600" /> : <CheckSquare className="w-5 h-5 text-pink-600" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{editing.title || 'Nova lista'}</h1>
            <p className="text-sm text-gray-500">Editando lista de tarefas</p>
          </div>
        </div>
        {editing.kind === 'canva'
          ? <CanvasEditor lista={editing} onSave={handleSave} onClose={() => setEditing(null)} />
          : <TarefaEditor lista={editing} onSave={handleSave} onClose={() => setEditing(null)} />}
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tarefas</h1>
            <p className="text-sm text-gray-500">{listas.length} lista{listas.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex border border-gray-200 rounded-md overflow-hidden">
          <button onClick={() => setViewMode('list')}
            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            <ListIcon className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('cards')}
            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'cards' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick-create bar */}
      <div className="flex gap-2">
        <Input
          value={newListTitle}
          onChange={(e) => setNewListTitle(e.target.value)}
          placeholder="Nova lista de tarefas... (Enter)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (!newListTitle.trim()) return
              const now = new Date().toISOString()
              const l: Lista = { id: crypto.randomUUID(), title: newListTitle.trim(), kind: 'lista', grupos: [], items: [], created_at: now, updated_at: now }
              setNewListTitle('')
              setEditing(l)
            }
          }}
          className="flex-1"
        />
        <Button onClick={() => setNewListOpen(true)}>
          <Plus className="w-4 h-4" /> Novo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-pink-500 rounded-full animate-spin" />
        </div>
      ) : listas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma lista ainda. Digite acima para criar a primeira!</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listas.map((lista) => {
            const done = lista.items.filter((i) => i.done).length
            const total = lista.items.length
            const progress = total > 0 ? Math.round((done / total) * 100) : 0
            return (
              <Card key={lista.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setEditing(lista)}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{lista.title}</h3>
                      {lista.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{lista.description}</p>}
                      {lista.kind === 'canva' && (
                        <Badge className="text-xs bg-pink-100 text-pink-700 border-pink-200 mt-1">Canva</Badge>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">{done}/{total} concluídas</span>
                        {lista.grupos.length > 0 && (
                          <Badge variant="secondary" className="text-xs">{lista.grupos.length} grupo{lista.grupos.length > 1 ? 's' : ''}</Badge>
                        )}
                      </div>
                      {total > 0 && (
                        <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-pink-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">{formatDate(lista.updated_at.split('T')[0])}</p>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditing(lista)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(lista.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        // List view (default)
        <Card>
          <CardContent className="pt-3 pb-2">
            {listas.map((lista) => {
              const done = lista.items.filter((i) => i.done).length
              const total = lista.items.length
              const progress = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <div key={lista.id} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 group cursor-pointer"
                  onClick={() => setEditing(lista)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-900 truncate">{lista.title}</p>
                      {total > 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">{done}/{total}</span>
                          <div className="w-20 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-pink-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    {lista.description && <p className="text-xs text-gray-500 truncate mt-0.5">{lista.description}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditing(lista)} className="p-1.5 text-gray-400 hover:text-green-600 rounded-md transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(lista.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* New lista/canva dialog */}
      <Dialog open={newListOpen} onOpenChange={(o) => { if (!o) { setNewListOpen(false); setNewListTitle(''); setNewKind(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova entrada</DialogTitle></DialogHeader>
          {!newKind ? (
            <div className="grid grid-cols-2 gap-3 py-2">
              <button onClick={() => setNewKind('lista')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-pink-400 hover:bg-pink-50 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-pink-100 group-hover:bg-pink-200 flex items-center justify-center transition-colors">
                  <CheckSquare className="w-5 h-5 text-pink-600" />
                </div>
                <span className="text-sm font-semibold text-gray-900">Lista</span>
                <span className="text-xs text-gray-500 text-center">Tarefas com checkboxes</span>
              </button>
              <button onClick={() => setNewKind('canva')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-pink-400 hover:bg-pink-50 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-pink-100 group-hover:bg-pink-200 flex items-center justify-center transition-colors">
                  <LayoutGrid className="w-5 h-5 text-pink-600" />
                </div>
                <span className="text-sm font-semibold text-gray-900">Canva</span>
                <span className="text-xs text-gray-500 text-center">Notas visuais em espaço 2D</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 -mb-1">
                <button onClick={() => setNewKind(null)} className="text-pink-600 hover:underline">← Voltar</button>
                <span>•</span>
                <span>{newKind === 'canva' ? 'Novo canva' : 'Nova lista'}</span>
              </div>
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input value={newListTitle} onChange={(e) => setNewListTitle(e.target.value)} placeholder="Nome" autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateList() }} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewListOpen(false); setNewListTitle(''); setNewKind(null) }}>Cancelar</Button>
            {newKind && <Button onClick={handleCreateList} disabled={!newListTitle.trim()}>Criar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
