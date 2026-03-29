import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, Kanban, Pencil, Trash2, Calendar, Users, ChevronDown, ChevronUp, Eye, EyeOff, CalendarPlus } from 'lucide-react'
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
import type { Submissao, SubmissaoEvento } from '@/types'

const COLUNAS = [
  { id: 'purgatorio', label: 'Purgatório', headerBg: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', dropBg: 'bg-slate-50', hideable: true },
  { id: 'rascunho', label: 'Resumo ou Draft', headerBg: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400', dropBg: 'bg-gray-50', hideable: false },
  { id: 'queue', label: 'Queue', headerBg: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', dropBg: 'bg-blue-50', hideable: false },
  { id: 'em_avaliacao', label: 'Em Avaliação', headerBg: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500', dropBg: 'bg-yellow-50', hideable: false },
  { id: 'aguardando_publicacao', label: 'Aguardando Publicação', headerBg: 'bg-green-100 text-green-700', dot: 'bg-green-500', dropBg: 'bg-green-50', hideable: false },
]

const COLUNA_REMAP: Record<string, string> = {
  em_preparacao: 'rascunho',
  submetido: 'queue',
  em_revisao: 'em_avaliacao',
  aceito: 'aguardando_publicacao',
  rejeitado: 'purgatorio',
}

const DEMO_SUBMISSOES: Submissao[] = [
  { id: '1', user_id: 'demo-user-id', titulo_provisorio: 'ML em EaD: uma revisão sistemática', autores: ['Ana Mendes', 'João Silva'], resumo: 'Este artigo apresenta uma revisão sistemática sobre o uso de ML em plataformas de ensino a distância.', coluna: 'em_preparacao', ultima_atividade: '2024-03-10', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '2', user_id: 'demo-user-id', titulo_provisorio: 'Chatbots LLM no Ensino Superior', autores: ['Bruno Lima', 'João Silva'], coluna: 'submetido', ultima_atividade: '2024-02-15', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '3', user_id: 'demo-user-id', titulo_provisorio: 'Análise de Sentimentos em Fóruns EaD', autores: ['Carla Nunes', 'João Silva'], coluna: 'em_revisao', ultima_atividade: '2024-01-20', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '4', user_id: 'demo-user-id', titulo_provisorio: 'Predição de Evasão com Random Forests', autores: ['João Silva'], coluna: 'aceito', ultima_atividade: '2023-12-01', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

const DEMO_EVENTOS: SubmissaoEvento[] = [
  { id: '1', user_id: 'demo-user-id', submissao_id: '2', tipo: 'submissao', descricao: 'Artigo submetido', data: '2024-02-15', revista: 'Computers & Education', created_at: new Date().toISOString() },
  { id: '2', user_id: 'demo-user-id', submissao_id: '3', tipo: 'revisao', descricao: 'Rodada de revisão iniciada', data: '2024-01-20', revista: 'RBCA', created_at: new Date().toISOString() },
]

type SubmissaoForm = { titulo_provisorio: string; autores_str: string; resumo: string; coluna: string }
const emptyForm: SubmissaoForm = { titulo_provisorio: '', autores_str: '', resumo: '', coluna: 'rascunho' }

type EventoForm = { descricao: string; data: string }
const emptyEventoForm: EventoForm = { descricao: '', data: '' }

export function Submissoes() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()

  const [submissoes, setSubmissoes] = useState<Submissao[]>(
    isDemoMode
      ? DEMO_SUBMISSOES.map(s => ({ ...s, coluna: COLUNA_REMAP[s.coluna] ?? s.coluna }))
      : []
  )
  const [eventos, setEventos] = useState<SubmissaoEvento[]>(isDemoMode ? DEMO_EVENTOS : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [showPurgatorio, setShowPurgatorio] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Submissao | null>(null)
  const [form, setForm] = useState<SubmissaoForm>(emptyForm)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showEventoForm, setShowEventoForm] = useState(false)
  const [currentSubmissaoId, setCurrentSubmissaoId] = useState<string | null>(null)
  const [eventoForm, setEventoForm] = useState<EventoForm>(emptyEventoForm)

  useEffect(() => {
    if (isDemoMode) return
    loadSubmissoes().then(({ submissoes: s, eventos: e }) => {
      setSubmissoes(s)
      setEventos(e)
      setLoading(false)
    }).catch(err => { toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' }); setLoading(false) })
  }, [isDemoMode])

  const visibleColunas = COLUNAS.filter(c => !c.hideable || showPurgatorio)

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newColuna = destination.droppableId
    const today = new Date().toISOString().split('T')[0]
    setSubmissoes(prev => prev.map(s =>
      s.id === draggableId ? { ...s, coluna: newColuna, ultima_atividade: today } : s
    ))
    if (!isDemoMode) {
      const updated = submissoes.map(s => s.id === draggableId ? { ...s, coluna: newColuna, ultima_atividade: today } : s)
      const updatedS = updated.find(s => s.id === draggableId)!
      saveSubmissaoFile(updatedS, eventos).catch(() => {})
    }
  }

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }
  function openEdit(s: Submissao) {
    setEditing(s)
    setForm({
      titulo_provisorio: s.titulo_provisorio,
      autores_str: (s.autores ?? []).join('; '),
      resumo: s.resumo ?? '',
      coluna: s.coluna,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.titulo_provisorio.trim()) { toast({ title: 'Título obrigatório', variant: 'destructive' }); return }
    const autores = form.autores_str.split(';').map(s => s.trim()).filter(Boolean)
    const today = new Date().toISOString().split('T')[0]
    const payload = { titulo_provisorio: form.titulo_provisorio, autores, resumo: form.resumo, coluna: form.coluna, ultima_atividade: today }
    if (isDemoMode) {
      if (editing) {
        setSubmissoes(prev => prev.map(s => s.id === editing.id ? { ...s, ...payload, updated_at: new Date().toISOString() } : s))
      } else {
        setSubmissoes(prev => [...prev, {
          id: Date.now().toString(), user_id: 'demo-user-id', ...payload,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }])
      }
      toast({ title: editing ? 'Submissão atualizada' : 'Submissão criada' })
      setShowForm(false)
      return
    }
    const now = new Date().toISOString()
    const id = editing ? editing.id : crypto.randomUUID()
    const ghSubmissao: Submissao = { ...payload, id, user_id: 'github-user', created_at: editing?.created_at ?? now, updated_at: now }
    try {
      await saveSubmissaoFile(ghSubmissao, eventos)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' })
      return
    }
    setSubmissoes(prev => editing ? prev.map(s => s.id === id ? ghSubmissao : s) : [...prev, ghSubmissao])
    toast({ title: editing ? 'Submissão atualizada' : 'Submissão criada' })
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta submissão?')) return
    if (isDemoMode) { setSubmissoes(prev => prev.filter(s => s.id !== id)); toast({ title: 'Submissão removida' }); return }
    try {
      await deleteSubmissaoFile(id)
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' })
      return
    }
    setSubmissoes(prev => prev.filter(s => s.id !== id))
    toast({ title: 'Submissão removida' })
  }

  async function handleSaveEvento() {
    if (!eventoForm.descricao.trim()) { toast({ title: 'Descrição obrigatória', variant: 'destructive' }); return }
    const payload = {
      tipo: 'registro',
      descricao: eventoForm.descricao,
      data: eventoForm.data,
      submissao_id: currentSubmissaoId!,
      user_id: isDemoMode ? 'demo-user-id' : 'github-user',
    }
    if (isDemoMode) {
      setEventos(prev => [...prev, { id: Date.now().toString(), ...payload, revista: '', created_at: new Date().toISOString() }])
      toast({ title: 'Evento registrado' })
      setShowEventoForm(false)
      setEventoForm(emptyEventoForm)
      return
    }
    const novoEvento: SubmissaoEvento = { id: crypto.randomUUID(), ...payload, revista: '', created_at: new Date().toISOString() }
    const updatedEventos = [...eventos, novoEvento]
    const submissao = submissoes.find(s => s.id === currentSubmissaoId!)!
    try {
      await saveSubmissaoFile(submissao, updatedEventos)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast({ title: 'Erro ao registrar evento', description: msg, variant: 'destructive' })
      return
    }
    setEventos(updatedEventos)
    toast({ title: 'Evento registrado' })
    setShowEventoForm(false)
    setEventoForm(emptyEventoForm)
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
          <Button variant="outline" size="sm" onClick={() => setShowPurgatorio(p => !p)}>
            {showPurgatorio ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPurgatorio ? 'Ocultar Purgatório' : 'Mostrar Purgatório'}
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nova Submissão
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {COLUNAS.map(col => {
          const count = submissoes.filter(s => s.coluna === col.id).length
          return (
            <Card key={col.id}>
              <CardContent className="pt-4 pb-3">
                <div className={`w-2 h-2 rounded-full ${col.dot} mb-2`} />
                <p className="text-xs text-gray-500 leading-tight">{col.label}</p>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Kanban */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
        </div>
      )}
      <div className={`overflow-x-auto pb-4 ${loading ? 'hidden' : ''}`}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 min-w-max">
            {visibleColunas.map(col => {
              const cards = submissoes.filter(s => s.coluna === col.id)
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
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-24 rounded-lg p-1 transition-colors ${snapshot.isDraggingOver ? col.dropBg : 'bg-gray-50/50'}`}
                      >
                        {cards.map((s, index) => {
                          const isOpen = expanded === s.id
                          const myEventos = eventos.filter(e => e.submissao_id === s.id)
                          return (
                            <Draggable key={s.id} draggableId={s.id} index={index}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className={`mb-2 bg-white border border-gray-200 rounded-xl shadow-sm transition-shadow ${snap.isDragging ? 'shadow-lg ring-2 ring-purple-200' : 'hover:shadow-md'}`}
                                >
                                  <div className="p-3">
                                    <p className="text-sm font-medium text-gray-900 leading-snug">
                                      {s.titulo_provisorio}
                                    </p>
                                    {(s.autores ?? []).length > 0 && (
                                      <div className="flex items-center gap-1 mt-1.5">
                                        <Users className="w-3 h-3 text-gray-400" />
                                        <p className="text-xs text-gray-500 truncate">
                                          {(s.autores ?? []).join(', ')}
                                        </p>
                                      </div>
                                    )}
                                    {s.ultima_atividade && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <Calendar className="w-3 h-3 text-gray-400" />
                                        <p className="text-xs text-gray-400">{formatDate(s.ultima_atividade)}</p>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 mt-2">
                                      {myEventos.length > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          {myEventos.length} evento{myEventos.length !== 1 ? 's' : ''}
                                        </Badge>
                                      )}
                                      <div className="flex-1" />
                                      <button
                                        onClick={() => {
                                          setCurrentSubmissaoId(s.id)
                                          setEventoForm(emptyEventoForm)
                                          setShowEventoForm(true)
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                                        title="Registrar evento"
                                      >
                                        <CalendarPlus className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => openEdit(s)}
                                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(s.id)}
                                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => setExpanded(isOpen ? null : s.id)}
                                        className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                      >
                                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </div>

                                    {isOpen && myEventos.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-gray-100">
                                        <div className="relative pl-4">
                                          {myEventos.map((e, i) => (
                                            <div key={e.id} className="relative pb-3 last:pb-0">
                                              {i < myEventos.length - 1 && (
                                                <div className="absolute left-[-9px] top-3 bottom-0 w-px bg-gray-200" />
                                              )}
                                              <div className="absolute left-[-13px] top-1.5 w-2 h-2 rounded-full bg-purple-300 border-2 border-white" />
                                              <div className="text-xs">
                                                {e.data && (
                                                  <span className="text-gray-400 mr-1">{formatDate(e.data)}</span>
                                                )}
                                                {e.descricao && (
                                                  <span className="text-gray-600">{e.descricao}</span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          )
                        })}
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

      {/* Submissão form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Submissão' : 'Nova Submissão'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título Provisório *</Label>
              <Input
                value={form.titulo_provisorio}
                onChange={e => setForm(f => ({ ...f, titulo_provisorio: e.target.value }))}
                placeholder="Título do artigo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Autores (separados por ponto e vírgula)</Label>
              <Input
                value={form.autores_str}
                onChange={e => setForm(f => ({ ...f, autores_str: e.target.value }))}
                placeholder="Autor A; Autor B; Autor C"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Resumo</Label>
              <Textarea
                value={form.resumo}
                onChange={e => setForm(f => ({ ...f, resumo: e.target.value }))}
                rows={3}
                placeholder="Resumo do artigo..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coluna Inicial</Label>
              <select
                value={form.coluna}
                onChange={e => setForm(f => ({ ...f, coluna: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evento form */}
      <Dialog open={showEventoForm} onOpenChange={setShowEventoForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <p className="text-xs text-gray-400 mt-0.5">Ex.: Submetido ao Periódico A, Recusado no Congresso B</p>
              <Textarea
                value={eventoForm.descricao}
                onChange={e => setEventoForm(f => ({ ...f, descricao: e.target.value }))}
                rows={3}
                placeholder="Descreva o evento..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={eventoForm.data}
                onChange={e => setEventoForm(f => ({ ...f, data: e.target.value }))}
              />
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
