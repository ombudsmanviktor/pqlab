import { useState, useEffect, useRef } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  ClipboardList, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ToastContainer } from '@/components/ui/toast'
import { InlineMarkdownField } from '@/components/shared/MarkdownEditor'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { loadOrdemDoDias, saveOrdemDoDia, deleteOrdemDoDia } from '@/lib/storage'
import { cn, formatDate } from '@/lib/utils'
import type { OrdemDoDia, Pauta, Ata } from '@/types'

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO: OrdemDoDia[] = [
  {
    id: 'demo-1',
    title: 'Reunião de orientação — março',
    meeting_date: '2026-03-12',
    pautas: [
      { id: 'p1', title: 'Revisão do capítulo 2', order: 0 },
      { id: 'p2', title: 'Cronograma para qualificação', order: 1 },
      { id: 'p3', title: 'Bibliografias complementares', order: 2 },
    ],
    ata: {
      content:
        '## Encaminhamentos\n\nO capítulo 2 foi aprovado com revisões menores. Prazo para qualificação definido para julho.\n\n- Revisar seção 2.3 até 20/03\n- Levantar referências sobre memória coletiva',
      updated_at: '2026-03-12T15:30:00Z',
    },
    created_at: '2026-03-12T14:00:00Z',
    updated_at: '2026-03-12T15:30:00Z',
  },
  {
    id: 'demo-2',
    title: 'Reunião de coorientação',
    meeting_date: '2026-02-20',
    pautas: [
      { id: 'p4', title: 'Ajustes metodológicos', order: 0 },
      { id: 'p5', title: 'Próximos passos em campo', order: 1 },
    ],
    ata: { content: '', updated_at: '' },
    created_at: '2026-02-20T10:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
  },
]

// ─── AtaSection ───────────────────────────────────────────────────────────

function AtaSection({
  ata,
  onChange,
}: {
  ata: Ata
  onChange: (a: Ata) => void
}) {
  const [open, setOpen] = useState(false)
  const hasContent = ata.content.trim().length > 0

  return (
    <div className="border-t border-violet-100 mt-3 pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors w-full text-left"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
        <span>Ata da Reunião</span>
        {hasContent && !open && (
          <span className="ml-auto text-xs text-gray-400 font-normal truncate max-w-xs">
            {ata.content.slice(0, 80).replace(/#+\s*/g, '').replace(/\n/g, ' ')}…
          </span>
        )}
        {!hasContent && !open && (
          <span className="ml-2 text-xs text-gray-300 font-normal italic">vazia</span>
        )}
      </button>

      {open && (
        <div className="mt-2">
          <InlineMarkdownField
            value={ata.content}
            onChange={(content) =>
              onChange({ content, updated_at: new Date().toISOString() })
            }
            placeholder="Escreva a ata da reunião…"
            className="min-h-[4rem] text-sm"
          />
        </div>
      )}
    </div>
  )
}

// ─── PautaRow ─────────────────────────────────────────────────────────────

function PautaRow({
  pauta,
  index,
  autoFocus,
  provided,
  isDragging,
  onChange,
  onDelete,
  onBlur,
}: {
  pauta: Pauta
  index: number
  autoFocus: boolean
  provided: {
    innerRef: (el: HTMLElement | null) => void
    draggableProps: React.HTMLAttributes<HTMLElement>
    dragHandleProps: React.HTMLAttributes<HTMLElement> | null
  }
  isDragging: boolean
  onChange: (id: string, title: string) => void
  onDelete: (id: string) => void
  onBlur: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={cn(
        'group flex items-center gap-2 py-1.5 px-2 rounded-md',
        isDragging && 'bg-violet-50 shadow-md'
      )}
    >
      <div
        {...provided.dragHandleProps}
        className="opacity-0 group-hover:opacity-40 cursor-grab flex-shrink-0"
      >
        <GripVertical className="w-3.5 h-3.5 text-gray-400" />
      </div>
      <span className="text-xs font-mono text-violet-400 w-5 text-right flex-shrink-0 select-none">
        {index + 1}.
      </span>
      <input
        ref={inputRef}
        className="flex-1 bg-transparent text-sm text-gray-800 outline-none focus:bg-violet-50 rounded px-1 min-w-0"
        value={pauta.title}
        onChange={(e) => onChange(pauta.id, e.target.value)}
        onBlur={onBlur}
        placeholder="Pauta…"
      />
      <button
        onClick={() => onDelete(pauta.id)}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── OrdemDoDiaCard ───────────────────────────────────────────────────────

function OrdemDoDiaCard({
  item,
  isSaving,
  onSave,
  onDelete,
}: {
  item: OrdemDoDia
  isSaving: boolean
  onSave: (o: OrdemDoDia) => void
  onDelete: (id: string) => void
}) {
  const [current, setCurrent] = useState<OrdemDoDia>(item)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [newPautaId, setNewPautaId] = useState<string | null>(null)

  function save(updated: OrdemDoDia) {
    setCurrent(updated)
    onSave(updated)
  }

  function handleTitleBlur() {
    const title = titleDraft.trim() || 'Sem título'
    setTitleDraft(title)
    if (title !== current.title) {
      save({ ...current, title })
    }
  }

  function handleMeetingDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const updated = { ...current, meeting_date: e.target.value || undefined }
    save(updated)
  }

  function handlePautaChange(id: string, title: string) {
    setCurrent((prev) => ({
      ...prev,
      pautas: prev.pautas.map((p) => (p.id === id ? { ...p, title } : p)),
    }))
  }

  function handlePautaBlur() {
    const filtered = current.pautas.filter((p) => p.title.trim() !== '')
    const reordered = filtered.map((p, i) => ({ ...p, order: i }))
    const updated = { ...current, pautas: reordered }
    save(updated)
    setNewPautaId(null)
  }

  function handleDeletePauta(id: string) {
    const filtered = current.pautas.filter((p) => p.id !== id)
    const reordered = filtered.map((p, i) => ({ ...p, order: i }))
    const updated = { ...current, pautas: reordered }
    save(updated)
  }

  function handleAddPauta() {
    const id = crypto.randomUUID()
    const newPauta: Pauta = { id, title: '', order: current.pautas.length }
    setCurrent((prev) => ({ ...prev, pautas: [...prev.pautas, newPauta] }))
    setNewPautaId(id)
  }

  function handleAtaChange(ata: Ata) {
    const updated = { ...current, ata }
    save(updated)
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const arr = Array.from(current.pautas)
    const [moved] = arr.splice(result.source.index, 1)
    arr.splice(result.destination.index, 0, moved)
    const reordered = arr.map((p, i) => ({ ...p, order: i }))
    const updated = { ...current, pautas: reordered }
    save(updated)
  }

  return (
    <div className="group/card bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <input
            className="w-full text-base font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-violet-200 focus:border-violet-400 outline-none pb-0.5 transition-colors"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
          />
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <input
                type="date"
                value={current.meeting_date ?? ''}
                onChange={handleMeetingDateChange}
                className="text-xs text-gray-500 bg-transparent border-none outline-none cursor-pointer"
                title="Data da reunião"
              />
            </div>
            <Badge variant="secondary" className="text-xs font-mono bg-violet-50 text-violet-500 border-violet-100 border">
              criado {formatDate(current.created_at.split('T')[0])}
            </Badge>
            {isSaving && (
              <span className="text-xs text-gray-300 animate-pulse">salvando…</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover/card:opacity-60 hover:!opacity-100 p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
          title="Excluir Ordem do Dia"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Pautas */}
      <div className="px-2 pb-1">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId={`pautas-${item.id}`}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {current.pautas.map((pauta, index) => (
                  <Draggable key={pauta.id} draggableId={pauta.id} index={index}>
                    {(provided, snapshot) => (
                      <PautaRow
                        pauta={pauta}
                        index={index}
                        autoFocus={pauta.id === newPautaId}
                        provided={provided}
                        isDragging={snapshot.isDragging}
                        onChange={handlePautaChange}
                        onDelete={handleDeletePauta}
                        onBlur={handlePautaBlur}
                      />
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {current.pautas.length === 0 && (
          <p className="text-xs text-gray-300 italic px-2 py-1.5 select-none">
            Nenhuma pauta ainda.
          </p>
        )}

        <button
          onClick={handleAddPauta}
          className="flex items-center gap-1.5 mt-1 text-xs text-violet-500 hover:text-violet-700 px-2 py-1 rounded-md hover:bg-violet-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar pauta
        </button>
      </div>

      {/* Ata */}
      <div className="px-4 pb-4">
        <AtaSection ata={current.ata} onChange={handleAtaChange} />
      </div>
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────

export function OrdemDoDiaPage() {
  const [items, setItems] = useState<OrdemDoDia[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { toasts, toast, dismiss } = useToast()
  const { isDemoMode } = useAuth()

  useEffect(() => {
    if (isDemoMode) {
      setItems(DEMO)
      setLoading(false)
      return
    }
    loadOrdemDoDias()
      .then(setItems)
      .catch(() => toast({ title: 'Erro ao carregar ordens do dia', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [isDemoMode])

  function handleCreate() {
    const now = new Date().toISOString()
    const newItem: OrdemDoDia = {
      id: crypto.randomUUID(),
      title: 'Nova Ordem do Dia',
      pautas: [],
      ata: { content: '', updated_at: now },
      created_at: now,
      updated_at: now,
    }
    setItems((prev) => [newItem, ...prev])
    if (!isDemoMode) {
      saveOrdemDoDia(newItem).catch(() =>
        toast({ title: 'Erro ao criar', variant: 'destructive' })
      )
    }
  }

  async function handleSave(updated: OrdemDoDia) {
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    if (isDemoMode) return
    setSaving((prev) => new Set(prev).add(updated.id))
    try {
      await saveOrdemDoDia(updated)
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    } finally {
      setSaving((prev) => {
        const s = new Set(prev)
        s.delete(updated.id)
        return s
      })
    }
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id))
    if (!isDemoMode) {
      try {
        await deleteOrdemDoDia(id)
      } catch {
        toast({ title: 'Erro ao excluir', variant: 'destructive' })
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Ordem do Dia</h1>
            {!loading && (
              <p className="text-xs text-gray-400">
                {items.length} {items.length === 1 ? 'reunião' : 'reuniões'}
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={handleCreate}
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          Nova Ordem do Dia
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            Carregando…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-sm text-gray-500">Nenhuma Ordem do Dia ainda.</p>
            <Button
              onClick={handleCreate}
              variant="outline"
              size="sm"
              className="gap-1.5 border-violet-200 text-violet-600 hover:bg-violet-50"
            >
              <Plus className="w-4 h-4" />
              Criar primeira Ordem do Dia
            </Button>
          </div>
        ) : (
          items.map((item) => (
            <OrdemDoDiaCard
              key={item.id}
              item={item}
              isSaving={saving.has(item.id)}
              onSave={handleSave}
              onDelete={(id) => setDeleteTarget(id)}
            />
          ))
        )}
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Ordem do Dia?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Esta ação é irreversível. A ata e todas as pautas serão removidas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
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
