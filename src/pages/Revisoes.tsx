import { useState, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import jsPDF from 'jspdf'
import {
  Document, Paragraph, TextRun, HeadingLevel, Packer,
  Table, TableRow, TableCell, WidthType,
} from 'docx'
import {
  ClipboardCheck, Plus, Edit2, Trash2, Download, FileText,
  ChevronDown, ChevronUp, X, Search,
  Calendar, Users, BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToastContainer } from '@/components/ui/toast'
import { MarkdownEditor } from '@/components/shared/MarkdownEditor'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { loadRevisoes, saveRevisao, deleteRevisao } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import type { Arguicao, Parecer, Revisao, TipoBanca, ModalidadeBanca } from '@/types'

// ─── Demo data ─────────────────────────────────────────────────────────────

const DEMO: Revisao[] = [
  {
    id: '1', subtype: 'arguicao',
    titulo: 'Memória, identidade e resistência: trajetórias de mulheres quilombolas no Baixo Amazonas',
    autor: 'Ana Clara Ferreira Lima',
    instituicao: 'Universidade Federal do Pará (UFPA)',
    orientador: 'Prof. Dr. Carlos Eduardo Moreira',
    bancaMembers: ['Profa. Dra. Silvia Rodrigues (UFAM)', 'Prof. Dr. Marcos Antônio Souza (UEPA)'],
    tipoBanca: 'mestrado-academico', modalidade: 'defesa',
    data: '2026-03-20',
    comentariosGerais: 'Trabalho consistente e bem estruturado. A dissertação demonstra domínio da literatura sobre memória coletiva e identidade territorial. Ver pp. 23-25 para a fundamentação teórica principal.',
    questoesTeoricas: 'O diálogo com Halbwachs está bem articulado (p. 34), mas falta aprofundar a distinção entre memória individual e coletiva. Sugiro revisitar pp. 45-48.',
    questoesMetodologicas: 'A metodologia de história oral está adequada. Recomendo maior detalhamento dos critérios de seleção das interlocutoras — ver pp. 78-80.',
    comentariosEspecificos: 'Capítulo 3 (pp. 102-130) é o ponto alto do trabalho. A análise das narrativas é rica e bem conduzida.',
    conclusoes: 'Recomendo a aprovação com pequenas correções. O trabalho tem qualidade e originalidade.',
    anotacaoOutrosMembros: 'Profa. Silvia destacou a relevância metodológica da abordagem (p. 15). Prof. Marcos sugeriu ajuste na conclusão.',
    created_at: '2026-03-20T14:00:00Z', updated_at: '2026-03-20T14:00:00Z',
  },
  {
    id: '2', subtype: 'parecer',
    titulo: 'Redes sociais digitais e a reconfiguração das práticas de leitura acadêmica',
    solicitante: 'Revista Brasileira de Ciências da Comunicação (RBCC)',
    data: '2026-03-15',
    parecer: 'O artigo aborda tema relevante e atual. A revisão de literatura é abrangente (pp. 3-7), mas a seção metodológica carece de maior precisão (pp. 8-9). Os resultados são interessantes, especialmente o quadro comparativo em p. 12. Recomendo revisão antes de publicação.',
    created_at: '2026-03-15T10:00:00Z', updated_at: '2026-03-15T10:00:00Z',
  },
]

// ─── Institutions list ─────────────────────────────────────────────────────

const INSTITUICOES_BRASIL = [
  // Federais
  'Universidade de Brasília (UnB)',
  'Universidade Federal do ABC (UFABC)',
  'Universidade Federal da Bahia (UFBA)',
  'Universidade Federal do Ceará (UFC)',
  'Universidade Federal do Espírito Santo (UFES)',
  'Universidade Federal de Goiás (UFG)',
  'Universidade Federal do Maranhão (UFMA)',
  'Universidade Federal de Minas Gerais (UFMG)',
  'Universidade Federal do Mato Grosso (UFMT)',
  'Universidade Federal do Mato Grosso do Sul (UFMS)',
  'Universidade Federal do Pará (UFPA)',
  'Universidade Federal da Paraíba (UFPB)',
  'Universidade Federal de Pelotas (UFPel)',
  'Universidade Federal de Pernambuco (UFPE)',
  'Universidade Federal do Piauí (UFPI)',
  'Universidade Federal do Paraná (UFPR)',
  'Universidade Federal do Rio de Janeiro (UFRJ)',
  'Universidade Federal do Rio Grande do Norte (UFRN)',
  'Universidade Federal do Rio Grande do Sul (UFRGS)',
  'Universidade Federal de Rondônia (UNIR)',
  'Universidade Federal de Roraima (UFRR)',
  'Universidade Federal de Santa Catarina (UFSC)',
  'Universidade Federal de Santa Maria (UFSM)',
  'Universidade Federal de São Carlos (UFSCar)',
  'Universidade Federal de São Paulo (UNIFESP)',
  'Universidade Federal de Sergipe (UFS)',
  'Universidade Federal do Tocantins (UFT)',
  'Universidade Federal da Integração Latino-Americana (UNILA)',
  'Universidade Federal da Fronteira Sul (UFFS)',
  'Universidade Federal do Recôncavo da Bahia (UFRB)',
  'Universidade Federal Rural do Rio de Janeiro (UFRRJ)',
  'Universidade Federal Rural de Pernambuco (UFRPE)',
  'Universidade Federal Rural da Amazônia (UFRA)',
  'Universidade Federal do Amazonas (UFAM)',
  'Universidade Federal do Acre (UFAC)',
  'Universidade Federal de Alagoas (UFAL)',
  'Universidade Federal do Amapá (UNIFAP)',
  'Universidade Federal de Itajubá (UNIFEI)',
  'Universidade Federal de Juiz de Fora (UFJF)',
  'Universidade Federal de Lavras (UFLA)',
  'Universidade Federal de Ouro Preto (UFOP)',
  'Universidade Federal do Triângulo Mineiro (UFTM)',
  'Universidade Federal de Uberlândia (UFU)',
  'Universidade Federal dos Vales do Jequitinhonha e Mucuri (UFVJM)',
  'Universidade Federal de Viçosa (UFV)',
  'Universidade Federal Fluminense (UFF)',
  // Estaduais
  'Universidade de São Paulo (USP)',
  'Universidade Estadual de Campinas (UNICAMP)',
  'Universidade Estadual Paulista (UNESP)',
  'Universidade do Estado do Rio de Janeiro (UERJ)',
  'Universidade Estadual do Norte Fluminense (UENF)',
  'Universidade Estadual de Londrina (UEL)',
  'Universidade Estadual de Maringá (UEM)',
  'Universidade Estadual de Ponta Grossa (UEPG)',
  'Universidade Estadual do Centro-Oeste (UNICENTRO)',
  'Universidade do Estado da Bahia (UNEB)',
  'Universidade Estadual de Feira de Santana (UEFS)',
  'Universidade Estadual do Sudoeste da Bahia (UESB)',
  'Universidade Estadual de Santa Cruz (UESC)',
  'Universidade Estadual do Ceará (UECE)',
  'Universidade Estadual Vale do Acaraú (UVA)',
  'Universidade do Estado do Amazonas (UEA)',
  'Universidade do Estado do Pará (UEPA)',
  'Universidade Estadual de Mato Grosso do Sul (UEMS)',
  'Universidade do Estado de Mato Grosso (UNEMAT)',
  'Universidade Estadual do Rio Grande do Norte (UERN)',
  'Universidade Estadual da Paraíba (UEPB)',
  'Universidade de Pernambuco (UPE)',
  'Universidade Estadual de Alagoas (UNEAL)',
  'Universidade Estadual do Piauí (UESPI)',
  'Universidade Estadual do Maranhão (UEMA)',
  'Universidade do Estado de Minas Gerais (UEMG)',
  'Universidade Estadual de Montes Claros (UNIMONTES)',
  // Privadas e confessionais
  'Pontifícia Universidade Católica de São Paulo (PUC-SP)',
  'Pontifícia Universidade Católica do Rio de Janeiro (PUC-Rio)',
  'Pontifícia Universidade Católica de Minas Gerais (PUC Minas)',
  'Pontifícia Universidade Católica do Rio Grande do Sul (PUCRS)',
  'Pontifícia Universidade Católica do Paraná (PUCPR)',
  'Pontifícia Universidade Católica de Campinas (PUC-Campinas)',
  'Pontifícia Universidade Católica de Goiás (PUC Goiás)',
  'Universidade Presbiteriana Mackenzie',
  'Fundação Getulio Vargas (FGV)',
  'Insper – Instituto de Ensino e Pesquisa',
  'FAAP – Fundação Armando Alvares Penteado',
  'Universidade Anhembi Morumbi',
  'Universidade Metodista de São Paulo (UMESP)',
  'Universidade de São Francisco (USF)',
  'Universidade Cruzeiro do Sul',
  'Universidade Estácio de Sá (UNESA)',
  'Universidade Veiga de Almeida (UVA)',
  'Universidade Cândido Mendes (UCAM)',
  'Centro Universitário FEI',
  'Universidade São Judas Tadeu',
  // Institutos de pesquisa
  'Fundação Oswaldo Cruz (FIOCRUZ)',
  'Instituto Nacional de Pesquisas Espaciais (INPE)',
  'Instituto Nacional de Pesquisas da Amazônia (INPA)',
  'Empresa Brasileira de Pesquisa Agropecuária (EMBRAPA)',
  'Instituto de Pesquisa Econômica Aplicada (IPEA)',
  'Instituto Brasileiro de Geografia e Estatística (IBGE)',
  'Museu Paraense Emílio Goeldi (MPEG)',
  'Centro Brasileiro de Pesquisas Físicas (CBPF)',
  'Instituto Nacional do Semiárido (INSA)',
  'Outra',
]

// ─── Page-number tagging ───────────────────────────────────────────────────

// PAGE_REGEX used in PageTaggedMarkdown and renderTextWithPageTags
const _PAGE_REGEX = /\b(pp?\.\s*\d+(?:[–\-]\d+)?)/g
void _PAGE_REGEX // regex is inlined in consumers; keep for documentation


function PageTaggedMarkdown({ content }: { content: string }) {
  if (!content) return null
  // Replace page refs with pseudo-links so they stay inline within markdown paragraphs
  const processed = content.replace(/\b(pp?\.\s*\d+(?:[–\-]\d+)?)/g, (m) => `[${m}](#pg)`)
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href === '#pg' ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-teal-100 text-teal-800 mx-0.5 select-none">
                {children}
              </span>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}

// ─── Reference format helpers ─────────────────────────────────────────────

const TIPO_LABELS: Record<TipoBanca, string> = {
  'tcc': 'TCC',
  'mestrado-academico': 'Mestrado Acadêmico',
  'mestrado-profissional': 'Mestrado Profissional',
  'doutorado': 'Doutorado',
  'outro': 'Outro',
}

function formatABNTArguicao(a: Arguicao): string {
  const parts = a.autor.trim().split(' ')
  const last = parts.pop() ?? ''
  const first = parts.join(' ')
  const nome = last && first ? `${last.toUpperCase()}, ${first}` : a.autor.toUpperCase()
  const tipo = a.tipoBanca === 'outro' ? (a.tipoOutro || 'Arguição') : TIPO_LABELS[a.tipoBanca]
  const modalidade = a.modalidade ? ` — ${a.modalidade === 'qualificacao' ? 'Qualificação' : 'Defesa'}` : ''
  const ano = a.data ? a.data.slice(0, 4) : ''
  return `${nome}. **${a.titulo}**. ${ano}. ${tipo}${modalidade} — ${a.instituicao}.`
}

function formatAPAArguicao(a: Arguicao): string {
  const parts = a.autor.trim().split(' ')
  const last = parts.pop() ?? ''
  const initials = parts.map((p) => p[0] + '.').join(' ')
  const nome = last && initials ? `${last}, ${initials}` : a.autor
  const ano = a.data ? a.data.slice(0, 4) : 's.d.'
  const tipo = a.tipoBanca === 'outro' ? (a.tipoOutro || 'Arguição') : TIPO_LABELS[a.tipoBanca]
  const modalidade = a.modalidade ? `, ${a.modalidade === 'qualificacao' ? 'qualificação' : 'defesa'}` : ''
  return `${nome} (${ano}). *${a.titulo}* [${tipo}${modalidade}]. ${a.instituicao}.`
}

// ─── Export helpers ────────────────────────────────────────────────────────

function stripPageTags(text: string): string {
  return text // page tags are already plain text in markdown source
}

function toPlain(md: string): string {
  return md.replace(/[#*_~`>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
}

// Render a text block in jsPDF with page refs highlighted in teal bold.
// Returns the new y position after the last line.
function renderTextWithPageTags(
  doc: jsPDF, text: string,
  x: number, y: number, maxWidth: number, lineHeightMm: number,
  pageHeight: number, margin: number
): number {
  if (!text.trim()) return y
  const plain = toPlain(text)
  const fontSize = doc.getFontSize()
  const sf = (doc as unknown as { internal: { scaleFactor: number } }).internal.scaleFactor
  const getW = (t: string) => doc.getStringUnitWidth(t) * fontSize / sf

  // Tokenize into segments: {value, isTag}
  type Tok = { value: string; isTag: boolean }
  const tokens: Tok[] = []
  const re = /\b(pp?\.\s*\d+(?:[–\-]\d+)?)/g
  let last = 0; let m: RegExpExecArray | null
  while ((m = re.exec(plain)) !== null) {
    if (m.index > last) tokens.push({ value: plain.slice(last, m.index), isTag: false })
    tokens.push({ value: m[1], isTag: true })
    last = m.index + m[0].length
  }
  if (last < plain.length) tokens.push({ value: plain.slice(last), isTag: false })

  // Word-wrap and render
  let curX = x
  for (const { value, isTag } of tokens) {
    const words = value.split(/(\s+)/)
    for (const word of words) {
      if (!word) continue
      const w = getW(word)
      if (word.trim() && curX + w > x + maxWidth + 0.5) {
        curX = x; y += lineHeightMm
        if (y > pageHeight - margin) { doc.addPage(); y = margin }
      }
      if (isTag) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 148, 136)
      } else {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50)
      }
      if (word.trim()) doc.text(word, curX, y)
      curX += w
    }
  }
  doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50)
  return y + lineHeightMm
}

function exportArguicaoMarkdown(a: Arguicao) {
  const tipo = a.tipoBanca === 'outro' ? (a.tipoOutro || 'Outro') : TIPO_LABELS[a.tipoBanca]
  const modalidade = a.modalidade ? ` — ${a.modalidade === 'qualificacao' ? 'Qualificação' : 'Defesa'}` : ''
  const lines = [
    `# ${a.titulo}`,
    '',
    `**Autora/Autor:** ${a.autor}`,
    `**Instituição:** ${a.instituicao}`,
    `**Orientador(a):** ${a.orientador}`,
    `**Banca:** ${[...a.bancaMembers].join('; ')}`,
    `**Tipo:** ${tipo}${modalidade}`,
    `**Data:** ${formatDate(a.data)}`,
    '',
  ]
  const sections: [string, string][] = [
    ['Comentários Gerais', a.comentariosGerais],
    ['Questões Teóricas', a.questoesTeoricas],
    ['Questões Metodológicas', a.questoesMetodologicas],
    ['Comentários Específicos', a.comentariosEspecificos],
    ['Conclusões', a.conclusoes],
    ['Anotações de Outros Membros da Banca', a.anotacaoOutrosMembros],
  ]
  for (const [title, content] of sections) {
    if (content.trim()) {
      lines.push(`## ${title}`, '', stripPageTags(content), '')
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a'); el.href = url; el.download = `arguicao-${a.id}.md`; el.click()
  URL.revokeObjectURL(url)
}

function exportParecerMarkdown(p: Parecer) {
  const lines = [
    `# ${p.titulo}`,
    '',
    p.autor ? `**Autor(a):** ${p.autor}` : '**Avaliação cega**',
    `**Solicitante:** ${p.solicitante}`,
    `**Data:** ${formatDate(p.data)}`,
    '',
    '## Parecer',
    '',
    stripPageTags(p.parecer),
    '',
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a'); el.href = url; el.download = `parecer-${p.id}.md`; el.click()
  URL.revokeObjectURL(url)
}

function exportArguicaoPDF(a: Arguicao) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageWidth = 210
  const pageHeight = 297
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const ensureSpace = (need: number) => {
    if (y + need > pageHeight - margin) { doc.addPage(); y = margin }
  }

  // Header — clean, no background fill
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(13, 148, 136)
  doc.text('pqLAB · Arguição', margin, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(30, 30, 30)
  const titleLines = doc.splitTextToSize(a.titulo, contentWidth)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 6 + 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(`${TIPO_LABELS[a.tipoBanca]}${a.modalidade ? ` · ${a.modalidade === 'qualificacao' ? 'Qualificação' : 'Defesa'}` : ''} · ${formatDate(a.data)}`, margin, y)
  y += 5
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 7

  // Metadata
  const meta: [string, string][] = [
    ['Autor(a)', a.autor],
    ['Instituição', a.instituicao],
    ['Orientador(a)', a.orientador],
    ['Banca', a.bancaMembers.join('; ')],
  ]
  for (const [label, value] of meta) {
    if (!value) continue
    ensureSpace(8)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(80, 80, 80)
    doc.text(label + ':', margin, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30)
    const lines = doc.splitTextToSize(value, contentWidth - 30)
    doc.text(lines, margin + 28, y)
    y += lines.length * 4.5 + 1
  }
  y += 4

  // Text sections
  const sections: [string, string][] = [
    ['Comentários Gerais', a.comentariosGerais],
    ['Questões Teóricas', a.questoesTeoricas],
    ['Questões Metodológicas', a.questoesMetodologicas],
    ['Comentários Específicos', a.comentariosEspecificos],
    ['Conclusões', a.conclusoes],
    ['Anotações de Outros Membros da Banca', a.anotacaoOutrosMembros],
  ]
  for (const [title, content] of sections) {
    if (!content.trim()) continue
    ensureSpace(12)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(13, 148, 136)
    doc.text(title.toUpperCase(), margin, y); y += 5
    doc.setFontSize(9)
    y = renderTextWithPageTags(doc, content, margin, y, contentWidth, 4.5, pageHeight, margin)
    y += 4
  }

  // Page numbers
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(160, 160, 160)
    doc.text(`${i} / ${total}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  doc.save(`arguicao-${a.id}.pdf`)
}

function exportParecerPDF(p: Parecer) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageWidth = 210
  const pageHeight = 297
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const ensureSpace = (need: number) => {
    if (y + need > pageHeight - margin) { doc.addPage(); y = margin }
  }

  // Header — clean, no background fill
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(13, 148, 136)
  doc.text('pqLAB · Parecer', margin, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(30, 30, 30)
  const titleLines = doc.splitTextToSize(p.titulo, contentWidth)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 6 + 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(`${formatDate(p.data)}${p.solicitante ? ` · ${p.solicitante}` : ''}`, margin, y)
  y += 5
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 7

  const meta: [string, string][] = [
    [p.autor ? 'Autor(a)' : '', p.autor || ''],
    ['Solicitante', p.solicitante],
  ]
  for (const [label, value] of meta) {
    if (!label || !value) continue
    ensureSpace(8)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(80, 80, 80)
    doc.text(label + ':', margin, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30)
    const lines = doc.splitTextToSize(value, contentWidth - 30)
    doc.text(lines, margin + 28, y); y += lines.length * 4.5 + 1
  }
  y += 6

  ensureSpace(12)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(13, 148, 136)
  doc.text('PARECER', margin, y); y += 5
  doc.setFontSize(9)
  renderTextWithPageTags(doc, p.parecer, margin, y, contentWidth, 4.5, pageHeight, margin)

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(160, 160, 160)
    doc.text(`${i} / ${total}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  doc.save(`parecer-${p.id}.pdf`)
}

async function exportArguicaoDocx(a: Arguicao) {
  const tipo = a.tipoBanca === 'outro' ? (a.tipoOutro || 'Outro') : TIPO_LABELS[a.tipoBanca]
  const modalidade = a.modalidade ? ` — ${a.modalidade === 'qualificacao' ? 'Qualificação' : 'Defesa'}` : ''

  const metaRows = [
    ['Autor(a)', a.autor],
    ['Instituição', a.instituicao],
    ['Orientador(a)', a.orientador],
    ['Demais membros da banca', a.bancaMembers.join('; ')],
    ['Tipo', `${tipo}${modalidade}`],
    ['Data', formatDate(a.data)],
  ]

  const sections: [string, string][] = [
    ['Comentários Gerais', a.comentariosGerais],
    ['Questões Teóricas', a.questoesTeoricas],
    ['Questões Metodológicas', a.questoesMetodologicas],
    ['Comentários Específicos', a.comentariosEspecificos],
    ['Conclusões', a.conclusoes],
    ['Anotações de Outros Membros da Banca', a.anotacaoOutrosMembros],
  ]

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: metaRows
      .filter(([, v]) => v)
      .map(([label, value]) => new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: value, size: 20 })] })],
          }),
        ],
      })),
  })

  const children = [
    new Paragraph({ text: a.titulo, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'Arguição · pqLAB', style: 'Normal' }),
    new Paragraph({ text: '' }),
    metaTable,
    new Paragraph({ text: '' }),
    ...sections.flatMap(([title, content]) => {
      if (!content.trim()) return []
      return [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: toPlain(content), size: 22 })] }),
        new Paragraph({ text: '' }),
      ]
    }),
  ]

  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        heading1: { run: { bold: true, size: 32, color: '0D9488' } },
        heading2: { run: { bold: true, size: 24, color: '0D9488' } },
      },
    },
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a'); el.href = url; el.download = `arguicao-${a.id}.docx`; el.click()
  URL.revokeObjectURL(url)
}

async function exportParecerDocx(p: Parecer) {
  const children = [
    new Paragraph({ text: p.titulo, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'Parecer · pqLAB', style: 'Normal' }),
    new Paragraph({ text: '' }),
    ...(p.autor ? [new Paragraph({ children: [new TextRun({ text: 'Autor(a): ', bold: true }), new TextRun({ text: p.autor })] })] : [
      new Paragraph({ children: [new TextRun({ text: 'Avaliação cega', italics: true, color: '666666' })] }),
    ]),
    new Paragraph({ children: [new TextRun({ text: 'Solicitante: ', bold: true }), new TextRun({ text: p.solicitante })] }),
    new Paragraph({ children: [new TextRun({ text: 'Data: ', bold: true }), new TextRun({ text: formatDate(p.data) })] }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Parecer', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [new TextRun({ text: toPlain(p.parecer), size: 22 })] }),
  ]

  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        heading1: { run: { bold: true, size: 32, color: '0D9488' } },
        heading2: { run: { bold: true, size: 24, color: '0D9488' } },
      },
    },
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a'); el.href = url; el.download = `parecer-${p.id}.docx`; el.click()
  URL.revokeObjectURL(url)
}

function exportAllCSV(revisoes: Revisao[]) {
  const header = ['Tipo', 'Título', 'Autor(a)', 'Instituição/Solicitante', 'Data', 'Tipo de Banca', 'Modalidade', 'Orientador(a)', 'Membros da Banca']
  const rows = revisoes.map((r) => {
    if (r.subtype === 'arguicao') {
      return [
        'Arguição', r.titulo, r.autor, r.instituicao, r.data,
        TIPO_LABELS[r.tipoBanca], r.modalidade ?? '', r.orientador,
        r.bancaMembers.join('; '),
      ]
    } else {
      return ['Parecer', r.titulo, r.autor ?? '', r.solicitante, r.data, '', '', '', '']
    }
  })
  const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a'); el.href = url; el.download = 'revisoes.csv'; el.click()
  URL.revokeObjectURL(url)
}

// ─── Arguição form ─────────────────────────────────────────────────────────

const EMPTY_ARGUICAO: Omit<Arguicao, 'id' | 'created_at' | 'updated_at'> = {
  subtype: 'arguicao', titulo: '', autor: '', instituicao: '', orientador: '',
  bancaMembers: [], tipoBanca: 'mestrado-academico', modalidade: 'defesa',
  data: new Date().toISOString().slice(0, 10),
  comentariosGerais: '', questoesTeoricas: '', questoesMetodologicas: '',
  comentariosEspecificos: '', conclusoes: '', anotacaoOutrosMembros: '',
}

function ArguicaoForm({
  initial, onSave, onClose,
}: {
  initial?: Arguicao; onSave: (a: Arguicao) => void; onClose: () => void
}) {
  const [form, setForm] = useState<Omit<Arguicao, 'id' | 'created_at' | 'updated_at'>>(
    initial ? { ...initial } : { ...EMPTY_ARGUICAO }
  )
  const [newMembro, setNewMembro] = useState('')
  const [customInst, setCustomInst] = useState(
    initial && !INSTITUICOES_BRASIL.includes(initial.instituicao) && initial.instituicao !== 'Outra'
      ? initial.instituicao : ''
  )
  const [instSelect, setInstSelect] = useState(
    initial
      ? (INSTITUICOES_BRASIL.includes(initial.instituicao) ? initial.instituicao : 'Outra')
      : ''
  )

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  function handleInstChange(val: string) {
    setInstSelect(val)
    if (val !== 'Outra') set('instituicao', val)
    else set('instituicao', customInst)
  }

  function addMembro() {
    if (!newMembro.trim()) return
    set('bancaMembers', [...form.bancaMembers, newMembro.trim()])
    setNewMembro('')
  }

  function handleSave() {
    if (!form.titulo.trim() || !form.autor.trim()) return
    const now = new Date().toISOString()
    onSave({
      ...form,
      id: initial?.id ?? crypto.randomUUID(),
      created_at: initial?.created_at ?? now,
      updated_at: now,
    })
  }

  const showModalidade = form.tipoBanca === 'mestrado-academico' || form.tipoBanca === 'mestrado-profissional' || form.tipoBanca === 'doutorado'

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label className="text-xs">Título do trabalho *</Label>
          <Input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Título completo" className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Autor(a) *</Label>
            <Input value={form.autor} onChange={(e) => set('autor', e.target.value)} placeholder="Nome completo" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Data da banca</Label>
            <Input type="date" value={form.data} onChange={(e) => set('data', e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Instituição</Label>
          <Select value={instSelect} onValueChange={handleInstChange}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent className="max-h-60">
              {INSTITUICOES_BRASIL.map((inst) => (
                <SelectItem key={inst} value={inst}>{inst}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {instSelect === 'Outra' && (
            <Input value={customInst} onChange={(e) => { setCustomInst(e.target.value); set('instituicao', e.target.value) }}
              placeholder="Nome da instituição" className="mt-2" />
          )}
        </div>
        <div>
          <Label className="text-xs">Orientador(a)</Label>
          <Input value={form.orientador} onChange={(e) => set('orientador', e.target.value)} placeholder="Nome e titulação" className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tipo de banca</Label>
            <Select value={form.tipoBanca} onValueChange={(v) => set('tipoBanca', v as TipoBanca)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tcc">TCC</SelectItem>
                <SelectItem value="mestrado-academico">Mestrado Acadêmico</SelectItem>
                <SelectItem value="mestrado-profissional">Mestrado Profissional</SelectItem>
                <SelectItem value="doutorado">Doutorado</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
            {form.tipoBanca === 'outro' && (
              <Input value={form.tipoOutro ?? ''} onChange={(e) => set('tipoOutro', e.target.value)}
                placeholder="Descreva o tipo" className="mt-2 text-xs" />
            )}
          </div>
          {showModalidade && (
            <div>
              <Label className="text-xs">Modalidade</Label>
              <Select value={form.modalidade ?? ''} onValueChange={(v) => set('modalidade', v as ModalidadeBanca)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualificacao">Qualificação</SelectItem>
                  <SelectItem value="defesa">Defesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">Demais membros da banca</Label>
          <div className="flex gap-2 mt-1">
            <Input value={newMembro} onChange={(e) => setNewMembro(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMembro() } }}
              placeholder="Nome e instituição" className="flex-1" />
            <Button type="button" size="sm" variant="outline" onClick={addMembro} disabled={!newMembro.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {form.bancaMembers.length > 0 && (
            <div className="mt-2 space-y-1">
              {form.bancaMembers.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded">
                  <span className="flex-1">{m}</span>
                  <button type="button" onClick={() => set('bancaMembers', form.bancaMembers.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">
        {([
          ['comentariosGerais', 'Comentários Gerais'],
          ['questoesTeoricas', 'Questões Teóricas'],
          ['questoesMetodologicas', 'Questões Metodológicas'],
          ['comentariosEspecificos', 'Comentários Específicos'],
          ['conclusoes', 'Conclusões'],
          ['anotacaoOutrosMembros', 'Anotações de Outros Membros da Banca'],
        ] as const).map(([field, label]) => (
          <div key={field}>
            <Label className="text-xs">{label}</Label>
            <div className="mt-1">
              <MarkdownEditor
                value={form[field]}
                onChange={(v) => set(field, v)}
                placeholder={`${label}... (use p. X ou pp. X-Y para citar páginas)`}
                minHeight={80}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} disabled={!form.titulo.trim() || !form.autor.trim()} className="bg-teal-600 hover:bg-teal-700 text-white">
          Salvar
        </Button>
      </div>
    </div>
  )
}

// ─── Parecer form ──────────────────────────────────────────────────────────

const EMPTY_PARECER: Omit<Parecer, 'id' | 'created_at' | 'updated_at'> = {
  subtype: 'parecer', titulo: '', autor: undefined, solicitante: '',
  data: new Date().toISOString().slice(0, 10), parecer: '',
}

function ParecerForm({
  initial, onSave, onClose,
}: {
  initial?: Parecer; onSave: (p: Parecer) => void; onClose: () => void
}) {
  const [form, setForm] = useState<Omit<Parecer, 'id' | 'created_at' | 'updated_at'>>(
    initial ? { ...initial } : { ...EMPTY_PARECER }
  )
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  function handleSave() {
    if (!form.titulo.trim() || !form.solicitante.trim()) return
    const now = new Date().toISOString()
    onSave({
      ...form,
      id: initial?.id ?? crypto.randomUUID(),
      created_at: initial?.created_at ?? now,
      updated_at: now,
    })
  }

  return (
    <div className="space-y-4 py-2">
      <div>
        <Label className="text-xs">Título do trabalho *</Label>
        <Input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Título do artigo, projeto ou livro" className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <Label className="text-xs">Autor(a) <span className="text-gray-400">(opcional)</span></Label>
          <p className="text-xs text-gray-400 mb-1">Deixe em branco para avaliação cega.</p>
          <Input value={form.autor ?? ''} onChange={(e) => set('autor', e.target.value || undefined)} placeholder="Nome do(a) autor(a)" />
        </div>
        <div>
          <Label className="text-xs">Data do parecer</Label>
          <Input type="date" value={form.data} onChange={(e) => set('data', e.target.value)} className="mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Solicitante *</Label>
        <Input value={form.solicitante} onChange={(e) => set('solicitante', e.target.value)}
          placeholder="Ex.: Edital nº 01/2026, Revista X, CNPQ chamada Y..." className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Parecer</Label>
        <div className="mt-1">
          <MarkdownEditor
            value={form.parecer}
            onChange={(v) => set('parecer', v)}
            placeholder="Texto do parecer... (use p. X ou pp. X-Y para citar páginas)"
            minHeight={200}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} disabled={!form.titulo.trim() || !form.solicitante.trim()} className="bg-teal-600 hover:bg-teal-700 text-white">
          Salvar
        </Button>
      </div>
    </div>
  )
}

// ─── Arguição card ─────────────────────────────────────────────────────────

type RefFormat = 'abnt' | 'apa' | 'tabela'

function ArguicaoCard({
  a, refFormat, onEdit, onDelete,
}: {
  a: Arguicao; refFormat: RefFormat; onEdit: () => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const tipo = a.tipoBanca === 'outro' ? (a.tipoOutro || 'Outro') : TIPO_LABELS[a.tipoBanca]
  const modalidade = a.modalidade ? ` · ${a.modalidade === 'qualificacao' ? 'Qualificação' : 'Defesa'}` : ''

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="text-xs bg-teal-100 text-teal-700 border-teal-200">Arguição</Badge>
              <Badge variant="outline" className="text-xs">{tipo}{modalidade}</Badge>
            </div>
            <p className="font-semibold text-gray-900 leading-snug mt-1">{a.titulo}</p>
            <p className="text-sm text-gray-500 mt-0.5">{a.autor} · {a.instituicao}</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {formatDate(a.data)}
            </p>
            {!expanded && refFormat !== 'tabela' && (
              <p className="text-xs text-gray-500 mt-2 italic line-clamp-2">
                {refFormat === 'abnt' ? formatABNTArguicao(a).replace(/\*\*/g, '') : formatAPAArguicao(a).replace(/\*/g, '')}
              </p>
            )}
            {expanded && (
              <div className="mt-4 space-y-4">
                {refFormat === 'tabela' ? (
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <tbody>
                      {[
                        ['Título', a.titulo], ['Autor(a)', a.autor], ['Orientador(a)', a.orientador],
                        ['Instituição', a.instituicao], ['Data', formatDate(a.data)],
                        ['Tipo', tipo + modalidade],
                        ...(a.bancaMembers.length > 0 ? [['Banca', a.bancaMembers.join('; ')]] : []),
                      ].map(([label, value]) => (
                        <tr key={label} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 w-36">{label}</td>
                          <td className="px-3 py-2 text-xs text-gray-800">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-700 font-mono leading-relaxed">
                    {refFormat === 'abnt' ? formatABNTArguicao(a).replace(/\*\*/g, '') : formatAPAArguicao(a).replace(/\*/g, '')}
                  </div>
                )}
                {([
                  ['Comentários Gerais', a.comentariosGerais],
                  ['Questões Teóricas', a.questoesTeoricas],
                  ['Questões Metodológicas', a.questoesMetodologicas],
                  ['Comentários Específicos', a.comentariosEspecificos],
                  ['Conclusões', a.conclusoes],
                  ['Anotações de Outros Membros da Banca', a.anotacaoOutrosMembros],
                ] as const).filter(([, v]) => v?.trim()).map(([title, content]) => (
                  <div key={title}>
                    <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">{title}</p>
                    <div className="text-sm text-gray-700 leading-relaxed">
                      <PageTaggedMarkdown content={content} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <button onClick={() => exportArguicaoPDF(a)} title="Exportar PDF" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={() => exportArguicaoMarkdown(a)} title="Exportar Markdown" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <FileText className="w-4 h-4" />
            </button>
            <button onClick={() => exportArguicaoDocx(a)} title="Exportar DOCX" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <BookOpen className="w-4 h-4" />
            </button>
            <button onClick={onEdit} title="Editar" className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={onDelete} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Parecer card ──────────────────────────────────────────────────────────

function ParecerCard({
  p, onEdit, onDelete,
}: {
  p: Parecer; onEdit: () => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ClipboardCheck className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge className="text-xs bg-cyan-100 text-cyan-700 border-cyan-200">Parecer</Badge>
            </div>
            <p className="font-semibold text-gray-900 leading-snug mt-1">{p.titulo}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {p.autor ? p.autor : <em className="text-gray-400">Avaliação cega</em>}
              {' · '}{p.solicitante}
            </p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {formatDate(p.data)}
            </p>
            {expanded && p.parecer.trim() && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-cyan-700 uppercase tracking-wide mb-1">Parecer</p>
                <div className="text-sm text-gray-700 leading-relaxed">
                  <PageTaggedMarkdown content={p.parecer} />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <button onClick={() => exportParecerPDF(p)} title="Exportar PDF" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={() => exportParecerMarkdown(p)} title="Exportar Markdown" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <FileText className="w-4 h-4" />
            </button>
            <button onClick={() => exportParecerDocx(p)} title="Exportar DOCX" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <BookOpen className="w-4 h-4" />
            </button>
            <button onClick={onEdit} title="Editar" className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={onDelete} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Type chooser dialog ────────────────────────────────────────────────────

function TypeChooserDialog({
  open, onChoose, onClose,
}: {
  open: boolean; onChoose: (t: 'arguicao' | 'parecer') => void; onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova Revisão</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500 mb-4">Qual o tipo de revisão?</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onChoose('arguicao')}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-teal-200 hover:border-teal-500 hover:bg-teal-50 transition-colors">
            <Users className="w-8 h-8 text-teal-600" />
            <span className="text-sm font-semibold text-teal-700">Arguição</span>
            <span className="text-xs text-gray-500 text-center">TCC, dissertação, tese, qualificação</span>
          </button>
          <button onClick={() => onChoose('parecer')}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-cyan-200 hover:border-cyan-500 hover:bg-cyan-50 transition-colors">
            <ClipboardCheck className="w-8 h-8 text-cyan-600" />
            <span className="text-sm font-semibold text-cyan-700">Parecer</span>
            <span className="text-xs text-gray-500 text-center">Artigo, projeto, livro, edital</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function Revisoes() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const [revisoes, setRevisoes] = useState<Revisao[]>(isDemoMode ? DEMO : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [formType, setFormType] = useState<'arguicao' | 'parecer' | null>(null)
  const [editing, setEditing] = useState<Revisao | undefined>()
  const [refFormat, setRefFormat] = useState<RefFormat>('abnt')
  const [filterType, setFilterType] = useState<'all' | 'arguicao' | 'parecer'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isDemoMode) return
    loadRevisoes().then(setRevisoes).catch(() => toast({ title: 'Erro ao carregar revisões', variant: 'destructive' })).finally(() => setLoading(false))
  }, [isDemoMode])

  const handleSave = useCallback(async (r: Revisao) => {
    if (!isDemoMode) {
      try { await saveRevisao(r) } catch { toast({ title: 'Erro ao salvar', variant: 'destructive' }); return }
    }
    setRevisoes((prev) => {
      const idx = prev.findIndex((x) => x.id === r.id)
      return idx >= 0 ? prev.map((x) => x.id === r.id ? r : x) : [r, ...prev]
    })
    setFormType(null); setEditing(undefined)
    toast({ title: 'Revisão salva' })
  }, [isDemoMode, toast])

  const handleDelete = useCallback(async (id: string) => {
    if (!isDemoMode) {
      try { await deleteRevisao(id) } catch { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return }
    }
    setRevisoes((prev) => prev.filter((r) => r.id !== id))
    toast({ title: 'Revisão excluída' })
  }, [isDemoMode, toast])

  function openEdit(r: Revisao) {
    setEditing(r); setFormType(r.subtype)
  }

  function openNew(t: 'arguicao' | 'parecer') {
    setEditing(undefined); setFormType(t); setChooserOpen(false)
  }

  const filtered = useMemo(() => {
    let result = filterType === 'all' ? revisoes : revisoes.filter((r) => r.subtype === filterType)
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((r) => {
        if (r.subtype === 'arguicao') {
          return r.titulo.toLowerCase().includes(q) ||
            r.autor.toLowerCase().includes(q) ||
            r.instituicao.toLowerCase().includes(q) ||
            r.data.includes(q)
        } else {
          return r.titulo.toLowerCase().includes(q) ||
            (r.autor?.toLowerCase().includes(q) ?? false) ||
            r.solicitante.toLowerCase().includes(q) ||
            r.data.includes(q)
        }
      })
    }
    return result
  }, [revisoes, filterType, search])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Carregando…</div>

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-semibold text-gray-900">Revisões</h1>
          <Badge variant="outline" className="text-xs">{revisoes.length}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-8 pl-8 pr-3 text-xs w-44"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {/* Filter */}
          <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="arguicao">Arguições</SelectItem>
              <SelectItem value="parecer">Pareceres</SelectItem>
            </SelectContent>
          </Select>
          {/* Ref format (only relevant for arguições) */}
          <Select value={refFormat} onValueChange={(v) => setRefFormat(v as RefFormat)}>
            <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abnt">ABNT</SelectItem>
              <SelectItem value="apa">APA</SelectItem>
              <SelectItem value="tabela">Tabela</SelectItem>
            </SelectContent>
          </Select>
          {/* CSV export */}
          {revisoes.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportAllCSV(revisoes)} className="h-8 text-xs gap-1">
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
          )}
          <Button size="sm" onClick={() => setChooserOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-1">
            <Plus className="w-4 h-4" /> Nova Revisão
          </Button>
        </div>
      </div>

      {/* Type chooser */}
      <TypeChooserDialog
        open={chooserOpen}
        onChoose={openNew}
        onClose={() => setChooserOpen(false)}
      />

      {/* Form dialogs */}
      {formType === 'arguicao' && (
        <Dialog open onOpenChange={(o) => { if (!o) { setFormType(null); setEditing(undefined) } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Arguição' : 'Nova Arguição'}</DialogTitle>
            </DialogHeader>
            <ArguicaoForm
              initial={editing?.subtype === 'arguicao' ? editing : undefined}
              onSave={(a) => handleSave(a)}
              onClose={() => { setFormType(null); setEditing(undefined) }}
            />
          </DialogContent>
        </Dialog>
      )}
      {formType === 'parecer' && (
        <Dialog open onOpenChange={(o) => { if (!o) { setFormType(null); setEditing(undefined) } }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Parecer' : 'Novo Parecer'}</DialogTitle>
            </DialogHeader>
            <ParecerForm
              initial={editing?.subtype === 'parecer' ? editing : undefined}
              onSave={(p) => handleSave(p)}
              onClose={() => { setFormType(null); setEditing(undefined) }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma revisão ainda.</p>
          <p className="text-xs mt-1">Clique em "Nova Revisão" para começar.</p>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {filtered.map((r) =>
          r.subtype === 'arguicao' ? (
            <ArguicaoCard
              key={r.id} a={r} refFormat={refFormat}
              onEdit={() => openEdit(r)}
              onDelete={() => handleDelete(r.id)}
            />
          ) : (
            <ParecerCard
              key={r.id} p={r}
              onEdit={() => openEdit(r)}
              onDelete={() => handleDelete(r.id)}
            />
          )
        )}
      </div>
    </div>
  )
}
