import { NavLink } from 'react-router-dom'
import { ArrowLeft, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Data ─────────────────────────────────────────────────────────────────

interface Entry {
  version: string
  date: string
  doi?: string
  current?: boolean
  headline: string
  sections: {
    title: string
    items: string[]
  }[]
}

const VERSIONS: Entry[] = [
  {
    version: 'v0.12β',
    date: '11 de maio de 2026',
    current: true,
    headline: 'Atalhos de teclado no editor · Botão maximizar em Revisões · Correções',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Atalhos de formatação Markdown em todos os campos de edição inline: Cmd/Ctrl+B (negrito), Cmd/Ctrl+I (itálico), Cmd/Ctrl+S (sublinhado) — funciona sobre seleção ou insere placeholder',
          'Módulo Revisões — botão Maximizar em cada arguição e parecer: a entrada ocupa toda a janela do browser em overlay fixo, com botão Restaurar para voltar à visualização normal',
          'Módulo Revisões — botão × para excluir seções visível ao passar o cursor sobre o título, sem necessidade de entrar no modo de edição do rótulo',
        ],
      },
      {
        title: 'Correções',
        items: [
          'Revisões: campo "Anotações de Outros Membros da Banca" não duplicava a cada caractere digitado — o trecho sintético era reinserido em data.secoes a cada render, crescendo indefinidamente',
          'Editor inline: _texto_ (underscore simples) agora renderiza corretamente como itálico, assim como *texto*; o tokenizador reconhece ambas as sintaxes',
          'Próximas Leituras: listas colapsadas persistem entre sessões via localStorage',
        ],
      },
    ],
  },
  {
    version: 'v0.11β',
    date: '8 de maio de 2026',
    headline: 'Próximas Leituras: modos de visualização, campo de descrição, reordenação de listas',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Três modos de visualização alternáveis por ícone: Cards (grade de listas), Timeline (itens agrupados por prioridade com linha vertical e badge de lista) e Tabela (Autores, Título, Ano, Publicação, Prioridade, Adicionado, Link)',
          'Campo de descrição por entrada: anotações em markdown inline colapsáveis via botão StickyNote; snippet da descrição visível no modo recolhido',
          'Botão ExternalLink quando não há arquivo mas há DOI ou URL, diferenciado do Paperclip de download',
          'Reordenação drag-and-drop dos próprios cards de lista, via alça GripVertical no cabeçalho; contexto DnD único gerencia type="LIST" e type="ITEM"',
          'Listas colapsáveis via botão ∧/∨ no cabeçalho do card',
        ],
      },
      {
        title: 'Correções',
        items: [
          'Debounce de 1,2 s no salvamento para evitar conflitos de SHA ao digitar rapidamente em campos inline (o editor disparava um save por tecla, gerando escritas concorrentes na API do GitHub)',
        ],
      },
    ],
  },
  {
    version: 'v0.10β',
    date: '5 de maio de 2026',
    headline: 'Novo módulo: Próximas Leituras',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Múltiplas listas de leituras pendentes exibidas como cards nomeados e reordenáveis por drag-and-drop',
          'Importação de metadados via DOI (API CrossRef) ou URL (proxy CORS + parsing de meta tags og:title, citation_*); fallback para título = input',
          'Citação em formato APA editável inline com campos expandíveis: título, autores, ano, periódico, volume, número, páginas, DOI, URL',
          'Pílulas de prioridade clicáveis — Urgente / Normal / Não urgente — que ciclam por clique',
          'Reordenação de entradas por drag-and-drop dentro de cada lista; numeração automática atualizada',
          'Anexo de arquivos PDF por drag-and-drop na dropzone do card ou por seleção via diálogo de arquivo; upload para o repositório GitHub',
        ],
      },
    ],
  },
  {
    version: 'v0.9β',
    date: '28 de abril de 2026',
    headline: 'Melhorias em Submissões',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Submissões: arquivo de cards e marcação com estrela — cards arquivados ficam ocultos por padrão com toggle de exibição',
          'Submissões: chips de autores com adição e remoção individual',
          'Submissões: salvamento otimista — atualização imediata na UI antes da confirmação do GitHub',
          'Submissões: recursos por card (links para versões, respostas a pareceristas, cartas etc.) com título e URL',
          'Submissões: sugestões de tags ao digitar baseadas nas tags já existentes no quadro',
          'Submissões: reordenação de cards por drag-and-drop dentro de cada coluna',
        ],
      },
      {
        title: 'Correções',
        items: [
          'Kanban: ordem armazenada em arquivo único _order.yaml em vez de campos por card, eliminando condição de corrida',
          'Kanban: saves executados em série com atualização de estado in-place para evitar flickering',
          'ghFetch com cache: no-store para evitar respostas obsoletas da API do GitHub',
        ],
      },
    ],
  },
  {
    version: 'v0.8β',
    date: '21 de abril de 2026',
    headline: 'Editor inline reimplementado: contenteditable AST',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Editor inline completamente reescrito com <div contenteditable> e tokenizador AST próprio — sem deslocamento de layout ao entrar no modo de edição',
          'Highlighting de sintaxe Markdown em tempo real: **negrito**, *itálico*, ~~tachado~~, __sublinhado__, ==highlight==, [[wikilinks]]',
          'Barra de ferramentas flutuante com underline, destaque por cor (amarelo/verde/azul/rosa)',
          'Pílulas visuais para referências de página (p. 90, pp. 90–92) e numeração de tópicos (1), (2)',
          'Substituição automática de setas ao digitar: -> → →, <- → ←; Backspace restaura os dois caracteres originais',
          'Selects Radix UI para Tipo de Banca e Modalidade no formulário de Arguição',
          'Campo Instituição com autocomplete inline: até 5 sugestões, ghost text de prefixo, Tab para aceitar, ↑↓ para navegar',
          'Labels de seção maiores nas Arguições',
        ],
      },
      {
        title: 'Correções',
        items: [
          'Inserção de caracteres: substituição do onBeforeInput delegado pelo React por addEventListener nativo — ev.preventDefault() confiável em React 19 e Chrome ≥ 147',
          'Dropdowns de Tipo de Banca e Modalidade exibindo apenas uma opção (remoção de h-[var(--radix-select-trigger-height)] no viewport do Radix Select)',
          'Sugestões do autocomplete de Instituição não desaparecem mais após cada tecla',
          'Layout mobile dos cards de Arguição e Parecer: conteúdo em largura total, botões em linha própria',
        ],
      },
    ],
  },
  {
    version: 'v0.7β',
    date: '17–20 de abril de 2026',
    headline: 'Edição inline introduzida em Fichamentos e Revisões',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Edição inline de dois passos: clicar no texto revela campo de edição no mesmo lugar; clicar fora salva automaticamente após 1,5 s de inatividade',
          'Auto-save com indicador de status (● Não salvo → Salvando… → ✓ Salvo)',
          'Suporte a quebras de linha na renderização: \\n simples vira <br>, \\n\\n vira parágrafo com espaçamento',
          'Barra de ferramentas flutuante posicionada acima do campo ativo',
        ],
      },
      {
        title: 'Correções',
        items: [
          'Eliminado salto de layout ao ativar o modo de edição',
          'Fonte, tamanho e cursor herdados corretamente do contexto visual dos cards',
          'Overlay transparente de textarea sobre div sem deslocamento',
        ],
      },
    ],
  },
  {
    version: 'v0.65β',
    date: '5 de abril de 2026',
    doi: '10.5281/zenodo.19434033',
    headline: 'Dark mode e melhorias no módulo Revisões',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Dark mode completo com alternância persistente via botão na sidebar',
          'Top bar mobile reposicionada sem sobreposição ao conteúdo',
          'Módulo Revisões: importação de arguições e pareceres via arquivo YAML (drag-and-drop na lista)',
          'Módulo Revisões: ordenação por data, título ou autor com botão de direção crescente/decrescente',
          'Módulo Revisões: contador de palavras e caracteres no campo Parecer',
        ],
      },
      {
        title: 'Correções',
        items: [
          'loadRevisoes passa a usar Promise.allSettled — falha em um arquivo não trava o carregamento da lista',
          'Auto-retry em conflito de SHA no writeYaml; importações executadas em série para evitar race conditions',
          'Guard contra created_at indefinido em registros YAML malformados',
        ],
      },
    ],
  },
  {
    version: 'v0.5β',
    date: '29 de março de 2026',
    doi: '10.5281/zenodo.19324964',
    headline: 'Favicon e seções dinâmicas na Arguição',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Favicon SVG com ícone GraduationCap — identidade visual do pqLAB',
          'Módulo Revisões — Arguição: seções de conteúdo dinâmicas; o usuário pode adicionar, renomear e remover seções personalizadas além das padrão',
        ],
      },
    ],
  },
  {
    version: 'v0.4β',
    date: '29 de março de 2026',
    doi: '10.5281/zenodo.19305324',
    headline: 'Novo módulo: Submissões',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Módulo Submissões: quadro Kanban para acompanhamento de artigos, capítulos e outros trabalhos — migrado e adaptado do SucupiraLAB',
          'Cor sky (azul-céu) na sidebar para Submissões, diferenciando-o de Planos (roxo)',
        ],
      },
    ],
  },
  {
    version: 'v0.3β',
    date: '28 de março de 2026',
    doi: '10.5281/zenodo.19299289',
    headline: 'Novo módulo: Canvas no Listas',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Módulo Listas — modo Canvas: disposição livre em 2D com drag-and-drop, tags por card e persistência de posição',
          'Cards do Canvas com diálogo de edição, tags individuais, preview de descrição e suporte a wikilinks',
        ],
      },
      {
        title: 'Correções',
        items: [
          'Exportações PDF das Revisões passam a renderizar Markdown formatado — negrito, itálico e referências de página em teal bold',
        ],
      },
    ],
  },
  {
    version: 'v0.2β',
    date: '26 de março de 2026',
    doi: '10.5281/zenodo.19229101',
    headline: 'Novo módulo: Revisões',
    sections: [
      {
        title: 'Novas funcionalidades',
        items: [
          'Módulo Revisões: arguições de banca (TCC, mestrado, doutorado) e pareceres ad hoc, com seções estruturadas, referência ABNT/APA e exportação para PDF, DOCX e Markdown',
          'Pílulas inline de referência de página (p. X, pp. X–Y) nos campos das Revisões',
          'Busca por texto nas Revisões',
          'Módulo Planos: exportação PDF com QR codes, links clicáveis e reordenação das seções da capa',
        ],
      },
      {
        title: 'Correções',
        items: [
          'Cabeçalho PDF e alinhamento do formulário nas Revisões',
        ],
      },
    ],
  },
  {
    version: 'v0.1β',
    date: '17 de março de 2026',
    doi: '10.5281/zenodo.19058215',
    headline: 'Lançamento inicial',
    sections: [
      {
        title: 'Módulos',
        items: [
          'Diário de Campo: notas de campo com campos estruturados e exportação',
          'Fichamentos: fichamentos de leituras com campos bibliográficos e exportação',
          'Listas: listas e memorandos em modo lista e modo canvas',
          'Planos: planos de trabalho e de disciplina com exportação PDF',
          'Grafo: visualização automática das conexões entre registros via wikilinks [[título]]',
        ],
      },
      {
        title: 'Infraestrutura',
        items: [
          'Backend-less: dados armazenados diretamente no repositório GitHub do usuário, sem servidor',
          'Deploy estático via GitHub Actions → GitHub Pages com domínio personalizado (pqlab.ombudsmanviktor.me)',
          'Plataforma: React 19 + Vite + Tailwind CSS v4 · Licença GPL-3.0',
        ],
      },
    ],
  },
]

// ─── Component ────────────────────────────────────────────────────────────

export function ChangelogPage() {
  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">

        {/* Back link */}
        <NavLink
          to="/diario"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar
        </NavLink>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Changelog</h1>
          <p className="text-sm text-gray-400 mt-1">Histórico de versões do pqLAB</p>
        </div>

        {/* Version list */}
        <div className="space-y-10">
          {VERSIONS.map((entry) => (
            <div key={entry.version} className="relative pl-4 border-l-2 border-gray-200">

              {/* Version badge + date */}
              <div className="flex flex-wrap items-center gap-2 mb-3 -ml-[1.35rem]">
                <div className={cn(
                  'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border',
                  entry.current
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200',
                )}>
                  <Tag className="w-3 h-3" />
                  {entry.version}
                  {entry.current && <span className="ml-0.5 font-normal opacity-70">atual</span>}
                </div>
                <span className="text-xs text-gray-400">{entry.date}</span>
                {entry.doi && (
                  <a
                    href={`https://doi.org/${entry.doi}`}
                    target="_blank" rel="noreferrer"
                    className="text-[10px] text-indigo-400 hover:text-indigo-600 font-mono transition-colors"
                  >
                    DOI {entry.doi}
                  </a>
                )}
              </div>

              {/* Headline */}
              <h2 className="text-base font-semibold text-gray-800 mb-3">{entry.headline}</h2>

              {/* Sections */}
              {entry.sections.map((sec) => (
                <div key={sec.title} className="mb-3 last:mb-0">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {sec.title}
                  </p>
                  <ul className="space-y-1">
                    {sec.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-2 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-xs text-center text-gray-300 mt-12">
          pqLAB · coLAB/UFF · GPL-3.0
        </p>
      </div>
    </div>
  )
}
