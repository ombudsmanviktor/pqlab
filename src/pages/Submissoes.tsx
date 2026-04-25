import { useState, useEffect, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  Plus, Kanban, Pencil, Trash2, Calendar, Users, ChevronDown, ChevronUp,
  Eye, EyeOff, CalendarPlus, Tag, X, AlarmClock, Star, Archive, ArchiveRestore, Link,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { loadSubmissoes, saveSubmissaoFile, deleteSubmissaoFile } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ToastContainer } from '@/components/ui/toast'
import type { Submissao, SubmissaoEvento, SubmissaoRecurso } from '@/types'

const COLUNAS = [
  { id: 'purgatorio',           label: 'Purgatório',             headerBg: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400', dropBg: 'bg-slate-50',  hideable: true  },
  { id: 'rascunho',             label: 'Resumo ou Draft',        headerBg: 'bg-gray-100 text-gray-700',   dot: 'bg-gray-400',  dropBg: 'bg-gray-50',   hideable: false },
  { id: 'queue',                label: 'Queue',                  headerBg: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500',  dropBg: 'bg-blue-50',   hideable: false },
  { id: 'em_avaliacao',         label: 'Em Avaliação',           headerBg: 'bg-yellow-100 text-yellow-700',dot: 'bg-yellow-500',dropBg: 'bg-yellow-50', hideable: false },
  { id: 'aguardando_publicacao',label: 'Aguardando Publicação',  headerBg: 'bg-green-100 text-green-700', dot: 'bg-green-500', dropBg: 'bg-green-50',  hideable: false },
]

const COLUNA_REMAP: Record<string, string> = {
  em_preparacao: 'rascunho', submetido: 'queue',
  em_revisao: 'em_avaliacao', aceito: 'aguardando_publicacao', rejeitado: 'purgatorio',
}

const TAG_COLORS = [
  'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700', 'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700', 'bg-indigo-100 text-indigo-700',
]
function tagColor(tag: string) {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff
  return TAG_COLORS[h % TAG_COLORS.length]
}

function isPrazoPast(p: string) { return new Date(p) < new Date() }
function isPrazoSoon(p: string) { const d = new Date(p).getTime() - Date.now(); return d >= 0 && d < 7 * 86400000 }

const DEMO_SUBMISSOES: Submissao[] = [
  { id: '1', user_id: 'demo', titulo_provisorio: 'ML em EaD: uma revisão sistemática', recordatorio: 'Artigo com Ana', autores: ['Ana Mendes', 'João Silva'], resumo: 'Revisão sistemática sobre uso de ML em EaD.', coluna: 'em_preparacao', ultima_atividade: '2024-03-10', tags: ['revisão', 'ML'], starred: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '2', user_id: 'demo', titulo_provisorio: 'Chatbots LLM no Ensino Superior', recordatorio: 'Anpocs 2024', autores: ['Bruno Lima', 'João Silva'], coluna: 'submetido', ultima_atividade: '2024-02-15', prazo: '2026-06-30', tags: ['LLM'], recursos: [{ titulo: 'Versão Final', url: 'https://example.com/draft.pdf' }], created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '3', user_id: 'demo', titulo_provisorio: 'Análise de Sentimentos em Fóruns EaD', autores: ['Carla Nunes', 'João Silva'], coluna: 'em_revisao', ultima_atividade: '2024-01-20', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '4', user_id: 'demo', titulo_provisorio: 'Predição de Evasão com Random Forests', autores: ['João Silva'], coluna: 'aceito', ultima_atividade: '2023-12-01', prazo: '2026-05-01', archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]
const DEMO_EVENTOS: SubmissaoEvento[] = [
  { id: '1', user_id: 'demo', submissao_id: '2', tipo: 'submissao', descricao: 'Artigo submetido', data: '2024-02-15', revista: 'Computers & Education', created_at: new Date().toISOString() },
  { id: '2', user_id: 'demo', submissao_id: '3', tipo: 'revisao', descricao: 'Rodada de revisão iniciada', data: '2024-01-20', revista: 'RBCA', created_at: new Date().toISOString() },
]

type SubmissaoForm = {
  titulo_provisorio: string
  recordatorio: string
  autores: string[]
  autorInput: string
  resumo: string
  coluna: string
  prazo: string
  tags: string[]
  tagInput: string
  recursos: SubmissaoRecurso[]
  recursoTitulo: string
  recursoUrl: string
}
const emptyForm: SubmissaoForm = {
  titulo_provisorio: '', recordatorio: '', autores: [], autorInput: '', resumo: '',
  coluna: 'rascunho', prazo: '', tags: [], tagInput: '', recursos: [], recursoTitulo: '', recursoUrl: '',
}
type EventoForm = { descricao: string; data: string }
const emptyEventoForm: EventoForm = { descricao: '', data: '' }

export function Submissoes() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()

  const [submissoes, setSubmissoes] = useState<Submissao[]>(
    isDemoMode ? DEMO_SUBMISSOES.map(s => ({ ...s, coluna: COLUNA_REMAP[s.coluna] ?? s.coluna })) : []
  )
  const [eventos, setEventos] = useState<SubmissaoEvento[]>(isDemoMode ? DEMO_EVENTOS : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [showPurgatorio, setShowPurgatorio] = useState(false)
  const [showPrazos, setShowPrazos] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editing, setEditing] = useState<Submissao | null>(null)
  const [form, setForm] = useState<SubmissaoForm>(emptyForm)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showEventoForm, setShowEventoForm] = useState(false)
  const [currentSubmissaoId, setCurrentSubmissaoId] = useState<string | null>(null)
  const [eventoForm, setEventoForm] = useState<EventoForm>(emptyEventoForm)

  useEffect(() => {
    if (isDemoMode) return
    loadSubmissoes()
      .then(({ submissoes: s, eventos: e }) => { setSubmissoes(s); setEventos(e); setLoading(false) })
      .catch(err => { toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' }); setLoading(false) })
  }, [isDemoMode])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    submissoes.forEach(sub => (sub.tags ?? []).forEach(t => s.add(t)))
    return [...s].sort()
  }, [submissoes])

  const visibleColunas = COLUNAS.filter(c => !c.hideable || showPurgatorio)
  const archivedCards = submissoes.filter(s => s.archived)
  const prazosCards = submissoes.filter(s => !!s.prazo && !s.archived).sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? ''))

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newColuna = destination.droppableId
    const today = new Date().toISOString().split('T')[0]
    const updated = submissoes.map(s => s.id === draggableId ? { ...s, coluna: newColuna, ultima_atividade: today } : s)
    setSubmissoes(updated)
    if (!isDemoMode) {
      const updatedS = updated.find(s => s.id === draggableId)!
      saveSubmissaoFile(updatedS, eventos).catch(() => {})
    }
  }

  function openNew() { setEditing(null); setForm(emptyForm); setIsSubmitting(false); setShowForm(true) }
  function openEdit(s: Submissao) {
    setEditing(s)
    setForm({
      titulo_provisorio: s.titulo_provisorio,
      recordatorio: s.recordatorio ?? '',
      autores: s.autores ?? [],
      autorInput: '',
      resumo: s.resumo ?? '',
      coluna: s.coluna,
      prazo: s.prazo ?? '',
      tags: s.tags ?? [],
      tagInput: '',
      recursos: s.recursos ?? [],
      recursoTitulo: '',
      recursoUrl: '',
    })
    setIsSubmitting(false)
    setShowForm(true)
  }

  // ── Author chips ──────────────────────────────────────────────────────────
  function commitAutor(raw: string) {
    const names = raw.split(',').map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    setForm(f => ({ ...f, autores: [...f.autores, ...names.filter(n => !f.autores.includes(n))], autorInput: '' }))
  }
  function handleAutorKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitAutor(form.autorInput) }
  }
  function handleAutorBlur() { if (form.autorInput.trim()) commitAutor(form.autorInput) }
  function removeAutor(a: string) { setForm(f => ({ ...f, autores: f.autores.filter(x => x !== a) })) }

  // ── Tags ─────────────────────────────────────────────────────────────────
  function addTag(t?: string) {
    const tag = (t ?? form.tagInput).trim()
    if (!tag || form.tags.includes(tag)) { setForm(f => ({ ...f, tagInput: '' })); return }
    setForm(f => ({ ...f, tags: [...f.tags, tag], tagInput: '' }))
  }
  function removeTag(tag: string) { setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) })) }

  // ── Recursos ─────────────────────────────────────────────────────────────
  function addRecurso() {
    const titulo = form.recursoTitulo.trim()
    const url = form.recursoUrl.trim()
    if (!titulo || !url) return
    setForm(f => ({ ...f, recursos: [...f.recursos, { titulo, url }], recursoTitulo: '', recursoUrl: '' }))
  }
  function removeRecurso(i: number) { setForm(f => ({ ...f, recursos: f.recursos.filter((_, idx) => idx !== i) })) }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (isSubmitting) return
    if (!form.titulo_provisorio.trim()) { toast({ title: 'Título obrigatório', variant: 'destructive' }); return }
    setIsSubmitting(true)

    const now = new Date().toISOString()
    const today = now.split('T')[0]
    const id = editing ? editing.id : crypto.randomUUID()
    const payload: Submissao = {
      id,
      user_id: isDemoMode ? 'demo' : 'github-user',
      titulo_provisorio: form.titulo_provisorio,
      recordatorio: form.recordatorio.trim() || undefined,
      autores: form.autores.length > 0 ? form.autores : undefined,
      resumo: form.resumo || undefined,
      coluna: form.coluna,
      ultima_atividade: today,
      prazo: form.prazo || undefined,
      tags: form.tags.length > 0 ? form.tags : undefined,
      archived: editing?.archived ?? false,
      starred: editing?.starred ?? false,
      recursos: form.recursos.length > 0 ? form.recursos : undefined,
      created_at: editing?.created_at ?? now,
      updated_at: now,
    }

    // Optimistic update + close immediately
    setSubmissoes(prev => editing ? prev.map(s => s.id === id ? payload : s) : [...prev, payload])
    setShowForm(false)
    setIsSubmitting(false)

    if (!isDemoMode) {
      try { await saveSubmissaoFile(payload, eventos) }
      catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' })
        // rollback
        if (editing) setSubmissoes(prev => prev.map(s => s.id === id ? editing : s))
        else setSubmissoes(prev => prev.filter(s => s.id !== id))
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta submissão?')) return
    const backup = submissoes.find(s => s.id === id)
    setSubmissoes(prev => prev.filter(s => s.id !== id))
    if (isDemoMode) { toast({ title: 'Submissão removida' }); return }
    try { await deleteSubmissaoFile(id); toast({ title: 'Submissão removida' }) }
    catch { toast({ title: 'Erro ao remover', variant: 'destructive' }); if (backup) setSubmissoes(prev => [...prev, backup]) }
  }

  function persistUpdate(updated: Submissao) {
    setSubmissoes(prev => prev.map(s => s.id === updated.id ? updated : s))
    if (!isDemoMode) saveSubmissaoFile(updated, eventos).catch(() => toast({ title: 'Erro ao salvar', variant: 'destructive' }))
  }

  function handleArchive(id: string) {
    const s = submissoes.find(x => x.id === id); if (!s) return
    persistUpdate({ ...s, archived: true })
  }
  function handleUnarchive(id: string) {
    const s = submissoes.find(x => x.id === id); if (!s) return
    persistUpdate({ ...s, archived: false })
  }
  function handleStar(id: string) {
    const s = submissoes.find(x => x.id === id); if (!s) return
    persistUpdate({ ...s, starred: !s.starred })
  }

  async function handleSaveEvento() {
    if (!eventoForm.descricao.trim()) { toast({ title: 'Descrição obrigatória', variant: 'destructive' }); return }
    const payload = { tipo: 'registro', descricao: eventoForm.descricao, data: eventoForm.data, submissao_id: currentSubmissaoId!, user_id: isDemoMode ? 'demo' : 'github-user' }
    if (isDemoMode) {
      setEventos(prev => [...prev, { id: Date.now().toString(), ...payload, revista: '', created_at: new Date().toISOString() }])
      toast({ title: 'Evento registrado' }); setShowEventoForm(false); setEventoForm(emptyEventoForm); return
    }
    const novoEvento: SubmissaoEvento = { id: crypto.randomUUID(), ...payload, revista: '', created_at: new Date().toISOString() }
    const updatedEventos = [...eventos, novoEvento]
    const sub = submissoes.find(s => s.id === currentSubmissaoId!)!
    try { await saveSubmissaoFile(sub, updatedEventos) } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro'; toast({ title: 'Erro ao registrar evento', description: msg, variant: 'destructive' }); return
    }
    setEventos(updatedEventos); toast({ title: 'Evento registrado' }); setShowEventoForm(false); setEventoForm(emptyEventoForm)
  }

  // ── Card render ───────────────────────────────────────────────────────────
  function renderCard(s: Submissao, index: number, draggable = true) {
    const isOpen = expanded === s.id
    const myEventos = eventos.filter(e => e.submissao_id === s.id)
    const hasPrazo = !!s.prazo
    const prazoPast = hasPrazo && isPrazoPast(s.prazo!)
    const prazoSoon = hasPrazo && !prazoPast && isPrazoSoon(s.prazo!)

    const cardContent = (
      <div
        className={`mb-2 bg-white border rounded-xl shadow-sm transition-all hover:shadow-md ${s.starred ? 'border-amber-400 ring-1 ring-amber-200' : 'border-gray-200'}`}
        onDoubleClick={e => { e.stopPropagation(); openEdit(s) }}
      >
        <div className="p-3">
          {/* Recordatório */}
          {s.recordatorio && <p className="text-[10px] text-gray-400 leading-none mb-1 truncate">{s.recordatorio}</p>}

          {/* Título */}
          <p className="text-sm font-medium text-gray-900 leading-snug">{s.titulo_provisorio}</p>

          {/* Recursos */}
          {(s.recursos ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(s.recursos ?? []).map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition-colors">
                  <Link className="w-2.5 h-2.5" />
                  {r.titulo}
                </a>
              ))}
            </div>
          )}

          {/* Tags */}
          {(s.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(s.tags ?? []).map(tag => (
                <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tagColor(tag)}`}>{tag}</span>
              ))}
            </div>
          )}

          {/* Autores */}
          {(s.autores ?? []).length > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <Users className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <p className="text-xs text-gray-500 truncate">{(s.autores ?? []).join(', ')}</p>
            </div>
          )}

          {/* Prazo ou última atividade */}
          {hasPrazo ? (
            <div className="flex items-center gap-1 mt-1">
              <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${prazoPast ? 'bg-red-100 text-red-600' : prazoSoon ? 'bg-orange-100 text-orange-600' : 'bg-red-50 text-red-500'}`}>
                <AlarmClock className="w-3 h-3" />{formatDate(s.prazo!)}
              </span>
            </div>
          ) : s.ultima_atividade ? (
            <div className="flex items-center gap-1 mt-1">
              <Calendar className="w-3 h-3 text-gray-400" />
              <p className="text-xs text-gray-400">{formatDate(s.ultima_atividade)}</p>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center gap-1 mt-2">
            {myEventos.length > 0 && <Badge variant="outline" className="text-xs">{myEventos.length} evento{myEventos.length !== 1 ? 's' : ''}</Badge>}
            <div className="flex-1" />
            <button onClick={e => { e.stopPropagation(); handleStar(s.id) }} className={`p-1 rounded ${s.starred ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-amber-400'}`} title={s.starred ? 'Desfavoritar' : 'Favoritar'}>
              <Star className={`w-3 h-3 ${s.starred ? 'fill-amber-400' : ''}`} />
            </button>
            <button onClick={e => { e.stopPropagation(); handleArchive(s.id) }} className="p-1 hover:bg-gray-100 rounded text-gray-300 hover:text-amber-500" title="Arquivar">
              <Archive className="w-3 h-3" />
            </button>
            <button onClick={e => { e.stopPropagation(); setCurrentSubmissaoId(s.id); setEventoForm(emptyEventoForm); setShowEventoForm(true) }} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600" title="Registrar evento">
              <CalendarPlus className="w-3 h-3" />
            </button>
            <button onClick={e => { e.stopPropagation(); openEdit(s) }} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={e => { e.stopPropagation(); handleDelete(s.id) }} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500">
              <Trash2 className="w-3 h-3" />
            </button>
            <button onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : s.id) }} className="p-1 hover:bg-gray-100 rounded text-gray-400">
              {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Expanded */}
          {isOpen && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
              {s.resumo && <p className="text-xs text-gray-500 leading-relaxed">{s.resumo}</p>}
              {(myEventos.length > 0 || s.created_at) && (
                <div className="relative pl-4">
                  <div className="relative pb-3">
                    {myEventos.length > 0 && <div className="absolute left-[-9px] top-3 bottom-0 w-px bg-gray-200" />}
                    <div className="absolute left-[-13px] top-1.5 w-2 h-2 rounded-full bg-gray-200 border-2 border-white" />
                    <div className="text-xs">
                      <span className="text-gray-400 mr-1">{formatDate(s.created_at.split('T')[0])}</span>
                      <span className="text-gray-400 italic">Registro criado</span>
                    </div>
                  </div>
                  {myEventos.map((e, i) => (
                    <div key={e.id} className="relative pb-3 last:pb-0">
                      {i < myEventos.length - 1 && <div className="absolute left-[-9px] top-3 bottom-0 w-px bg-gray-200" />}
                      <div className="absolute left-[-13px] top-1.5 w-2 h-2 rounded-full bg-purple-300 border-2 border-white" />
                      <div className="text-xs">
                        {e.data && <span className="text-gray-400 mr-1">{formatDate(e.data)}</span>}
                        {e.descricao && <span className="text-gray-600">{e.descricao}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )

    if (!draggable) return <div key={s.id}>{cardContent}</div>
    return (
      <Draggable key={s.id} draggableId={s.id} index={index}>
        {(prov, snap) => (
          <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className={snap.isDragging ? 'ring-2 ring-purple-200 rounded-xl' : ''}>
            {cardContent}
          </div>
        )}
      </Draggable>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Kanban className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Submissões</h1>
            <p className="text-sm text-gray-500">Quadro Kanban de artigos submetidos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowPrazos(p => !p)} className={showPrazos ? 'bg-red-50 border-red-200 text-red-600' : ''}>
            <AlarmClock className="w-4 h-4" />{showPrazos ? 'Ocultar Prazos' : 'Ver Prazos'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPurgatorio(p => !p)}>
            {showPurgatorio ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPurgatorio ? 'Ocultar Purgatório' : 'Mostrar Purgatório'}
          </Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4" /> Nova Submissão</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {COLUNAS.map(col => {
          const count = submissoes.filter(s => s.coluna === col.id && !s.archived).length
          return (
            <Card key={col.id}><CardContent className="pt-4 pb-3">
              <div className={`w-2 h-2 rounded-full ${col.dot} mb-2`} />
              <p className="text-xs text-gray-500 leading-tight">{col.label}</p>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
            </CardContent></Card>
          )
        })}
      </div>

      {/* Prazos view */}
      {showPrazos && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlarmClock className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-700">Prazos</h2>
            <span className="text-xs text-red-400">{prazosCards.length} submissão(ões) com prazo</span>
          </div>
          {prazosCards.length === 0 ? (
            <p className="text-xs text-red-400 italic">Nenhuma submissão com prazo definido.</p>
          ) : (
            <div className="space-y-2">
              {prazosCards.map(s => {
                const past = isPrazoPast(s.prazo!); const soon = !past && isPrazoSoon(s.prazo!)
                return (
                  <div key={s.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-red-100">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${past ? 'bg-red-100 text-red-600' : soon ? 'bg-orange-100 text-orange-600' : 'bg-red-50 text-red-500'}`}>{formatDate(s.prazo!)}</span>
                    <div className="min-w-0">
                      {s.recordatorio && <p className="text-[10px] text-gray-400 leading-none mb-0.5">{s.recordatorio}</p>}
                      <p className="text-sm text-gray-800 truncate font-medium">{s.titulo_provisorio}</p>
                    </div>
                    <button onClick={() => openEdit(s)} className="ml-auto p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 flex-shrink-0"><Pencil className="w-3 h-3" /></button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Kanban */}
      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin" /></div>}
      <div className={`overflow-x-auto pb-4 ${loading ? 'hidden' : ''}`}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 min-w-max">
            {visibleColunas.map(col => {
              const cards = submissoes.filter(s => s.coluna === col.id && !s.archived)
              return (
                <div key={col.id} className="w-72 flex-shrink-0">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-2 ${col.headerBg}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-sm font-semibold">{col.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs h-5">{cards.length}</Badge>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-24 rounded-lg p-1 transition-colors ${snapshot.isDraggingOver ? col.dropBg : 'bg-gray-50/50'}`}>
                        {cards.map((s, index) => renderCard(s, index, true))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Archived section */}
      {archivedCards.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <button onClick={() => setShowArchived(v => !v)} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors mb-3">
            {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <Archive className="w-4 h-4" />
            Arquivadas ({archivedCards.length})
          </button>
          {showArchived && (
            <div className="space-y-2">
              {archivedCards.map(s => (
                <div key={s.id} className="group flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl">
                  <div className="min-w-0">
                    {s.recordatorio && <p className="text-[10px] text-gray-400 leading-none mb-0.5">{s.recordatorio}</p>}
                    <p className="text-sm font-medium text-gray-500 truncate">{s.titulo_provisorio}</p>
                    {(s.autores ?? []).length > 0 && <p className="text-xs text-gray-400 truncate">{(s.autores ?? []).join(', ')}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleUnarchive(s.id)} className="opacity-0 group-hover:opacity-70 hover:!opacity-100 p-1.5 rounded hover:bg-white text-gray-300 hover:text-amber-500 transition-all" title="Desarquivar">
                      <ArchiveRestore className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submissão form */}
      <Dialog open={showForm} onOpenChange={o => { if (!o && !isSubmitting) setShowForm(false) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Submissão' : 'Nova Submissão'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título Provisório *</Label>
              <Input value={form.titulo_provisorio} onChange={e => setForm(f => ({ ...f, titulo_provisorio: e.target.value }))} placeholder="Título do artigo" />
            </div>
            <div className="space-y-1.5">
              <Label>Recordatório</Label>
              <Input value={form.recordatorio} onChange={e => setForm(f => ({ ...f, recordatorio: e.target.value }))} placeholder="Ex.: Artigo com Fulano, Anpocs 2020…" />
            </div>

            {/* Autores com chips */}
            <div className="space-y-1.5">
              <Label>Autores</Label>
              <Input
                value={form.autorInput}
                onChange={e => setForm(f => ({ ...f, autorInput: e.target.value }))}
                onKeyDown={handleAutorKeyDown}
                onBlur={handleAutorBlur}
                placeholder="Nome do autor — Enter ou vírgula para adicionar"
              />
              {form.autores.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.autores.map(a => (
                    <span key={a} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                      {a}<button onClick={() => removeAutor(a)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Resumo</Label>
              <Textarea value={form.resumo} onChange={e => setForm(f => ({ ...f, resumo: e.target.value }))} rows={3} placeholder="Resumo do artigo..." />
            </div>

            {/* Recursos */}
            <div className="space-y-1.5">
              <Label>Recursos</Label>
              <div className="flex gap-2">
                <Input value={form.recursoTitulo} onChange={e => setForm(f => ({ ...f, recursoTitulo: e.target.value }))} placeholder="Título (ex.: Versão Final)" className="flex-1" />
                <Input value={form.recursoUrl} onChange={e => setForm(f => ({ ...f, recursoUrl: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecurso() } }} placeholder="URL" className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={addRecurso}><Plus className="w-3.5 h-3.5" /></Button>
              </div>
              {form.recursos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.recursos.map((r, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                      <Link className="w-2.5 h-2.5" />{r.titulo}
                      <button onClick={() => removeRecurso(i)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Coluna Inicial</Label>
                <select value={form.coluna} onChange={e => setForm(f => ({ ...f, coluna: e.target.value }))} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Prazo</Label>
                <Input type="date" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input value={form.tagInput} onChange={e => setForm(f => ({ ...f, tagInput: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} placeholder="Nova tag… (Enter)" className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={() => addTag()}><Tag className="w-3.5 h-3.5" /></Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.tags.map(tag => (
                    <span key={tag} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${tagColor(tag)}`}>
                      {tag}<button onClick={() => removeTag(tag)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {/* Tags existentes como sugestão */}
              {allTags.filter(t => !form.tags.includes(t)).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {allTags.filter(t => !form.tags.includes(t)).map(t => (
                    <button key={t} type="button" onClick={() => addTag(t)} className={`text-[10px] px-1.5 py-0.5 rounded-full opacity-50 hover:opacity-100 transition-opacity ${tagColor(t)}`}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSubmitting}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evento form */}
      <Dialog open={showEventoForm} onOpenChange={setShowEventoForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Evento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <p className="text-xs text-gray-400 mt-0.5">Ex.: Submetido ao Periódico A, Recusado no Congresso B</p>
              <Textarea value={eventoForm.descricao} onChange={e => setEventoForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="Descreva o evento..." />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={eventoForm.data} onChange={e => setEventoForm(f => ({ ...f, data: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEventoForm(false)}>Cancelar</Button>
            <Button onClick={handleSaveEvento}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
