// A ficha do cliente completa (Frente 5a, §11 do documento do dono —
// docs/instrucoes-painel-comercial.md linhas 292-326). Extraída de
// `ComercialClientes.tsx` desde a Frente 3: a Diretoria (`DiretoriaClientes.
// tsx`) também precisa dela, e a porta única não pode jogar quem está lá
// para fora do módulo — mesmo componente nos dois lados, nunca uma cópia.
//
// Quem chama decide o período (`de`/`ate`), o critério (`criterio` — o
// seletor do TOPO da página, não um segundo aqui) e o texto do título: o
// Comercial usa o ano inteiro (não tem seletor de período nesta visão), a
// Diretoria usa o período escolhido em `usePeriodoComercial`.
//
// Nove blocos, na ordem do §11. Nunca mexe em cor, nome ou layout de
// matriz — isso é da Frente 4. `com_ficha_cliente` já devolve uma faixa
// por bloco relativa ao período/filial selecionados (nunca gravada); esta
// tela só exibe o que veio.
//
// ── Etapa 3 (2026-09-25) ────────────────────────────────────────────────
// O dono, 2026-09-24: "quando clico em clientes e busco a ficha do cliente
// está formato analítico, precisa ter analítico e simplificado. Campos de
// filtros para facilitar também. E o cashback pode estar na ficha do cliente
// também". Desenho aprovado por ele antes da construção, com cinco respostas:
// abre simplificada; o farol de cashback mostra o ganho MAIS quanto falta
// para a próxima faixa; os filtros ficam dentro da ficha; as listas curtas
// são de 5 com "ver todos"; a tendência fica no farol com a conta escrita
// por baixo.
//
// OS NOVE BLOCOS NÃO FORAM REESCRITOS. A visão analítica é exatamente o que
// esta tela já era — mais o cashback mês a mês. A visão simplificada é uma
// SEGUNDA leitura dos MESMOS dados (`com_ficha_cliente` continua sendo uma
// ida só ao banco): nada aqui pede nada a mais, exceto o cashback, que é uma
// consulta nova por ser conta de outra função.
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { ArrowDownRight, ArrowUpRight, Minus, X } from 'lucide-react';
import { useCashbackDoCliente, useFichaCliente } from '@/hooks/useComercialCashback';
import { formatBRL } from '@/types/financeiro';
import { MESES } from '@/lib/comparativoAnos';
import { FAIXA_BARRA, NOTA_CURVA_POR_QUANTIDADE } from '@/config/comercial-insights';
import { legendaCashback, primeiros, tendencia } from '@/lib/ficha-resumo';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import type {
  CashbackMensal, CashbackResumo, CriterioCurva, FaixaCurva, Filial, FichaCliente,
  FichaClienteComprou, FichaClienteEvolucaoFaixa, FichaClienteEvolucaoProdutoItem,
  FichaClienteEvolucaoProdutos, FichaClienteIndicadores, FichaClienteMes, FichaClienteMixFaixa,
  FichaClienteNuncaComprou, FichaClienteParouDeComprar, FichaClienteProduto,
} from '@/types/comercial';

export function FichaClienteSecao({
  codigo, de, ate, filial, criterio, titulo, onFechar, filtros,
}: {
  codigo: string; de: string; ate: string; filial: Filial | null; criterio: CriterioCurva;
  titulo: string; onFechar: () => void;
  /**
   * Os seletores da página (ano, filial, período, critério), renderizados
   * DENTRO da ficha — pergunta 3 do desenho: "para comparar 2025 com 2026 do
   * mesmo cliente, hoje você fecha a ficha, muda lá em cima e abre de novo".
   *
   * Vem de fora de propósito, em vez de a ficha ter os seus próprios: o
   * estado continua morando na página, que é quem também filtra a LISTA.
   * Dois estados para o mesmo filtro é como a ficha e a lista passariam a
   * discordar sobre qual período está na tela.
   */
  filtros?: ReactNode;
}) {
  const [visao, setVisao] = useVisaoRelatorio('ficha-cliente');
  const { data: ficha, isLoading } = useFichaCliente(codigo, de, ate, filial, criterio);
  // O cashback é apurado por ANO (a faixa é mensal, dentro do ano) — é o
  // ano do fim do período, o mesmo que o título da ficha mostra.
  const cashback = useCashbackDoCliente(codigo, Number(ate.slice(0, 4)), filial);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">
          {titulo}
          {/* Mesmo indicador que DiretoriaClientes.tsx já usa na lista — a
              mesma marca nos dois lugares (§11 linha 325). */}
          {ficha?.identificacao.em_condicao && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">(condição)</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <SeletorVisao visao={visao} onChange={setVisao} />
          <Button variant="ghost" size="sm" onClick={onFechar}>
            <X className="w-3.5 h-3.5 mr-1" /> Fechar ficha
          </Button>
        </div>
      </div>

      {filtros && <div className="flex flex-wrap items-center gap-3">{filtros}</div>}

      {isLoading && <p className="text-[12px] text-muted-foreground">Carregando…</p>}

      {/* Falha de leitura não pode virar tela vazia que parece "cliente sem
          nada" — mesma família do defeito que deixou o RH quebrado por meses
          (regra 1 das cinco), e que a tela de Importações também passou a
          tratar. `unwrap` lança no hook; aqui é o que a pessoa vê. */}
      {!isLoading && !ficha && (
        <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
          <strong>Não consegui carregar a ficha deste cliente.</strong> Recarregue a página — o que
          aparece abaixo não é "cliente sem movimento", é ausência de resposta.
        </div>
      )}

      {ficha && (visao === 'simplificado' ? (
        <VisaoSimplificada
          ficha={ficha}
          de={de}
          ate={ate}
          criterio={criterio}
          cashback={cashback.data?.resumo ?? null}
          cashbackFalhou={cashback.isError}
          cashbackCarregando={cashback.isPending}
          // `lembrar: false` — ver uma lista agora não é decidir como a
          // próxima ficha abre. Só o botão do topo grava a preferência.
          onVerTudo={() => setVisao('analitico', { lembrar: false })}
        />
      ) : (
        <VisaoAnalitica ficha={ficha} de={de} ate={ate} criterio={criterio} cashbackMensal={cashback.data?.mensal ?? []} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VISÃO SIMPLIFICADA — quatro faróis, dois gráficos, três listas de cinco.
// ═══════════════════════════════════════════════════════════════════════════
function VisaoSimplificada({
  ficha, de, ate, criterio, cashback, cashbackFalhou, cashbackCarregando, onVerTudo,
}: {
  ficha: FichaCliente; de: string; ate: string; criterio: CriterioCurva;
  cashback: CashbackResumo | null; cashbackFalhou: boolean; cashbackCarregando: boolean;
  onVerTudo: () => void;
}) {
  return (
    <div className="space-y-4">
      <Farois
        indicadores={ficha.indicadores}
        cashback={cashback}
        cashbackFalhou={cashbackFalhou}
        cashbackCarregando={cashbackCarregando}
        ano={Number(ate.slice(0, 4))}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoMensal mensal={ficha.mensal_do_ano} de={de} ate={ate} />
        <GraficoMix mix={ficha.mix_por_faixa} criterio={criterio} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListaCurta
          titulo="Mais comprou"
          vazio="Nada comprado no período."
          linhas={ficha.comprou.map((l) => ({ chave: l.produto_codigo, nome: l.nome, direita: formatBRL(l.valor) }))}
          onVerTudo={onVerTudo}
        />
        <ListaCurta
          titulo="Parou de comprar"
          vazio="Nenhum produto parou."
          linhas={ficha.parou_de_comprar.map((l) => ({ chave: l.produto_codigo, nome: l.nome, direita: null }))}
          onVerTudo={onVerTudo}
        />
        <ListaCurta
          titulo="Nunca comprou"
          vazio="Comprou de tudo."
          // ORDENA ANTES DE CORTAR. O banco devolve esta lista agrupada por
          // FAIXA (até 100 por faixa, A/B/C/fora) e ordenada por valor
          // DENTRO de cada grupo — a visão analítica filtra por faixa e por
          // isso convive bem com o agrupamento. Um `slice(0, 5)` cru pegava
          // o começo do primeiro grupo, que na ficha real de 2026-09-25 eram
          // cinco itens de R$ 0,00 (amostras e produtos inativos) — o
          // OPOSTO do que o bloco promete, que é "o que ele está deixando de
          // comprar que mais gira". Os cinco do topo têm que ser os cinco
          // maiores do conjunto inteiro.
          linhas={[...ficha.nunca_comprou]
            .sort((a, b) => b.valor_outros - a.valor_outros)
            .map((l) => ({ chave: l.produto_codigo, nome: l.nome, direita: formatBRL(l.valor_outros) }))}
          onVerTudo={onVerTudo}
        />
      </div>
    </div>
  );
}

function Farois({
  indicadores, cashback, cashbackFalhou, cashbackCarregando, ano,
}: {
  indicadores: FichaClienteIndicadores; cashback: CashbackResumo | null;
  cashbackFalhou: boolean; cashbackCarregando: boolean; ano: number;
}) {
  const t = tendencia(indicadores.variacao);
  const Seta = t.direcao === 'sobe' ? ArrowUpRight : t.direcao === 'desce' ? ArrowDownRight : Minus;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Farol titulo="Faturamento" valor={formatBRL(indicadores.faturamento)}>
        <span>{indicadores.meses_ativos} {indicadores.meses_ativos === 1 ? 'mês ativo' : 'meses ativos'}</span>
        <span>{indicadores.skus} SKUs</span>
      </Farol>

      <Farol
        // O ANO VAI NO TÍTULO porque este farol é o único dos quatro que NÃO
        // segue o período escolhido: a faixa de cashback é mensal dentro do
        // ano, então a apuração é sempre do ano inteiro. Com "Últimos 3
        // meses" selecionado, o faturamento mostra R$ 47 mil e o cashback
        // mostra o do ano — sem o rótulo, os dois números parecem falar do
        // mesmo recorte e não fecham. O bloco analítico já avisava disso; o
        // farol não (visto na tela em 2026-09-25).
        titulo={`Cashback em ${ano}`}
        // Três estados, e os três são diferentes: AINDA NÃO SEI (carregando),
        // NÃO CONSEGUI LER (erro) e SEI QUE NÃO HÁ (`cashback` nulo). O
        // `cashback` nulo não é zero — `formatBRL` escreveria "R$ 0,00" e
        // afirmaria que o cliente não ganhou nada, que é outra coisa. E
        // enquanto carrega o farol não pode dizer "Sem apuração no período",
        // que é uma afirmação sobre o que ainda não chegou (achado da
        // auditoria de 2026-09-25).
        valor={cashbackCarregando || cashbackFalhou || !cashback || cashback.cashback === null ? '—' : formatBRL(cashback.cashback)}
      >
        {cashbackCarregando ? (
          <span>Carregando…</span>
        ) : cashbackFalhou ? (
          <span>Não consegui ler o cashback deste cliente.</span>
        ) : (
          <>
            <span>{legendaCashback(cashback)}</span>
            {cashback?.falta_proxima_faixa !== null && cashback?.falta_proxima_faixa !== undefined && (
              <span>Faltam {formatBRL(cashback.falta_proxima_faixa)} para a próxima faixa</span>
            )}
          </>
        )}
      </Farol>

      {/* TUDO QUE SAIU SEM COBRANÇA, num número só — as duas séries. Houve
          uma versão desta tela, por algumas horas em 2026-09-25, que separava
          "publicidade" da série 1; era erro meu, generalizado da lista de um
          cliente só. Na base inteira, 98,7% do valor da série 1 é produto que
          também é vendido, e o CFOP não distingue finalidade (5910 e 6910
          estão nas duas séries; a diferença entre eles é dentro/fora do
          estado). Cashback e publicidade estão aqui dentro, sem como separar. */}
      <Farol titulo="Bonificação" valor={formatBRL(indicadores.bonificacao)}>
        <span>
          {indicadores.bonificacao > 0 ? 'Saiu sem cobrança no período' : 'Nenhuma bonificação no período'}
        </span>
      </Farol>

      <Farol
        titulo="Tendência"
        valor={t.texto}
        icone={t.direcao === 'sem-base' ? undefined : <Seta className="w-4 h-4" aria-hidden="true" />}
      >
        {/* Pergunta 5 do desenho: a régua vem escrita junto. Número de
            variação sem a conta ao lado é o tipo de número que o diretor não
            confia — e faz bem em não confiar. */}
        <span>Último mês contra a média dos 3 anteriores</span>
        <span>
          {indicadores.media_3_anteriores === null
            ? 'Menos de 3 meses anteriores com dado — sem base para comparar.'
            : `Média dos 3 anteriores: ${formatBRL(indicadores.media_3_anteriores)}`}
        </span>
      </Farol>
    </div>
  );
}

function Farol({
  titulo, valor, icone, children,
}: { titulo: string; valor: string; icone?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-[12px] text-muted-foreground">{titulo}</div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="font-mono text-lg font-semibold">{valor}</span>
        {icone}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-muted-foreground">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Gráfico 1 — os 12 meses do ano. É o MESMO dado do bloco mensal da visão
// analítica, desenhado em vez de escrito. Mês sem venda (`valor === null`)
// vira barra AUSENTE, não barra de altura zero: a diferença entre "não
// vendeu" e "vendeu R$ 0,00" é a mesma que a tabela já respeita com o "—".
// ═══════════════════════════════════════════════════════════════════════════
function GraficoMensal({ mensal, de, ate }: { mensal: FichaClienteMes[]; de: string; ate: string }) {
  const dados = mensal.map((m) => ({
    mes: MESES[Number(m.mes.slice(5, 7)) - 1],
    valor: m.valor,
    // Mesmo cálculo do bloco mensal da visão analítica. Não é enfeite: na
    // Diretoria o período pode ser "um mês", e aí os faróis mostram esse
    // mês enquanto o gráfico mostra o ano inteiro. Sem marcar qual é, o
    // leitor vê "Faturamento R$ 20 mil" ao lado de doze barras que somam
    // R$ 194 mil e não tem como reconciliar os dois.
    dentro: m.mes >= de.slice(0, 8) + '01' && m.mes <= ate,
  }));
  const temAlgum = dados.some((d) => d.valor !== null);
  // Quando o período É o ano inteiro, TODO mês está dentro — destacar tudo
  // é destacar nada, e ainda sugeriria que há uma distinção. Aí a barra fica
  // com uma cor só e a legenda não aparece.
  const destacaAlgum = dados.some((d) => d.dentro) && dados.some((d) => !d.dentro);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-[13px] font-semibold mb-3">Faturamento mês a mês no ano</div>
      {temAlgum ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval={0} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={70} tickFormatter={(v: number) => formatBRL(v)} />
            <Tooltip
              formatter={(v: number) => formatBRL(v)}
              labelFormatter={(l: string) => `Mês de ${l}`}
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
            />
            <Bar dataKey="valor" name="Faturamento" radius={[4, 4, 0, 0]}>
              {dados.map((d) => (
                <Cell
                  key={d.mes}
                  fill={!destacaAlgum || d.dentro ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                  fillOpacity={!destacaAlgum || d.dentro ? 1 : 0.35}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-[12px] text-muted-foreground py-8 text-center">Nenhuma venda para este cliente no ano.</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Mês sem barra é mês sem venda — não é venda de R$ 0,00.
        {destacaAlgum && ' Barra apagada é mês fora do período escolhido: não entra nos números acima.'}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Gráfico 2 — mix por faixa, em barra de participação. Usa `FAIXA_BARRA`
// (a metade ESCURA do par), nunca `FAIXA_BADGE`: barra pálida sobre fundo
// pálido mediu contraste de 1,02:1 na Frente 4 e não separava nada.
// ═══════════════════════════════════════════════════════════════════════════
function GraficoMix({ mix, criterio }: { mix: FichaClienteMixFaixa[]; criterio: CriterioCurva }) {
  const total = mix.reduce((s, m) => s + m.valor, 0);
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-[13px] font-semibold mb-3">Mix por faixa</div>
      {criterio === 'quantidade' && (
        <p className="text-[11px] text-muted-foreground mb-3">{NOTA_CURVA_POR_QUANTIDADE}</p>
      )}
      {mix.length === 0 || total === 0 ? (
        <p className="text-[12px] text-muted-foreground py-8 text-center">Nada comprado no período.</p>
      ) : (
        <div className="space-y-2.5">
          {mix.map((m) => {
            // `participacao` já vem do banco; a largura da barra usa ela, e
            // cai para a fração do total só quando o banco não mandou — o
            // gráfico nunca refaz a conta por conta própria.
            // `total === 0` já foi descartado no ramo acima — aqui a divisão
            // é sempre segura.
            const pct = m.participacao ?? (m.valor / total) * 100;
            return (
              <div key={m.faixa} className="text-[12px]">
                <div className="flex items-center justify-between mb-0.5">
                  <span>{m.faixa === '-' ? 'Fora da curva' : `Faixa ${m.faixa}`}</span>
                  <span className="font-mono text-muted-foreground">
                    {formatBRL(m.valor)} · {m.participacao === null ? '—' : `${m.participacao}%`}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full ${FAIXA_BARRA[m.faixa as FaixaCurva] ?? 'bg-status-muted'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// As três listas de cinco. "Ver todos" LEVA PARA A VISÃO ANALÍTICA em vez de
// expandir aqui: a tabela completa, com as colunas que a simplificada corta
// (quantidade, faixa dele, faixa geral), já existe lá — duplicá-la aqui seria
// a mesma tabela em dois lugares para divergir na próxima correção.
// ═══════════════════════════════════════════════════════════════════════════
function ListaCurta({
  titulo, linhas, vazio, onVerTudo,
}: {
  titulo: string;
  linhas: { chave: string; nome: string; direita: string | null }[];
  vazio: string;
  onVerTudo: () => void;
}) {
  const { mostradas, restantes } = primeiros(linhas);
  return (
    <div className="rounded-lg border border-border">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">{titulo}</div>
      <ul className="divide-y divide-border">
        {mostradas.map((l) => (
          <li key={l.chave} className="px-4 py-1.5 text-[12px] flex items-center justify-between gap-2">
            <span className="truncate" title={l.nome}>{l.nome}</span>
            {l.direita && <span className="font-mono text-muted-foreground shrink-0">{l.direita}</span>}
          </li>
        ))}
        {mostradas.length === 0 && (
          <li className="px-4 py-4 text-[12px] text-center text-muted-foreground">{vazio}</li>
        )}
      </ul>
      {restantes > 0 && (
        <button
          type="button"
          onClick={onVerTudo}
          className="w-full px-4 py-2 border-t border-border text-[11px] text-primary hover:underline text-left"
        >
          ver {restantes === 1 ? 'mais 1' : `todos os ${linhas.length}`} no analítico
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VISÃO ANALÍTICA — os nove blocos que esta tela sempre teve, na ordem do
// §11, mais o cashback mês a mês (etapa 3). Nenhum deles foi reescrito.
// ═══════════════════════════════════════════════════════════════════════════
function VisaoAnalitica({
  ficha, de, ate, criterio, cashbackMensal,
}: {
  ficha: FichaCliente; de: string; ate: string; criterio: CriterioCurva; cashbackMensal: CashbackMensal[];
}) {
  return (
    <>
      <BlocoIndicadores indicadores={ficha.indicadores} />
      <BlocoMensal mensal={ficha.mensal_do_ano} de={de} ate={ate} />
      <BlocoCashbackMensal linhas={cashbackMensal} />
      <BlocoMix mix={ficha.mix_por_faixa} criterio={criterio} />
      <BlocoEvolucaoFaixa evolucao={ficha.evolucao_faixa} />
      <BlocoEvolucaoProdutos evolucao={ficha.evolucao_produtos} />
      <BlocoComprou linhas={ficha.comprou} />
      <FichaTabela titulo="Produtos bonificados" linhas={ficha.bonificado} vazio="Nenhuma bonificação no período." />
      <BlocoParouDeComprar linhas={ficha.parou_de_comprar} />
      <BlocoNuncaComprou linhas={ficha.nunca_comprou} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Cashback mês a mês (etapa 3) — a MESMA apuração da tela de Cashback,
// pedida por cliente (`com_cashback_resumo`/`_mensal` com `p_codigo`). O ano
// é o do fim do período da ficha, porque a faixa de cashback é mensal dentro
// do ano; não segue o [de, ate] da ficha, e o cabeçalho diz isso.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoCashbackMensal({ linhas }: { linhas: CashbackMensal[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Cashback mês a mês</div>
      <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
        Apurado por mês dentro do ano inteiro — a faixa é mensal, então este bloco não segue o período escolhido acima.
      </p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Mês</th>
            <th className="px-3 py-1.5 font-semibold">Tabela</th>
            <th className="px-3 py-1.5 font-semibold text-right">Comprado</th>
            <th className="px-3 py-1.5 font-semibold text-right">Faixa</th>
            <th className="px-3 py-1.5 font-semibold text-right">Cashback</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.competencia} className="border-t border-border">
              <td className="px-3 py-1.5">{l.competencia.slice(0, 7)}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{l.tabela_base ?? 'sem tabela'}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.comprado)}</td>
              {/* Nulo aqui significa "esta tabela não tem programa" — não 0%. */}
              <td className="px-3 py-1.5 text-right font-mono">{l.percentual === null ? '—' : `${l.percentual}%`}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.cashback === null ? '—' : formatBRL(l.cashback)}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nenhuma apuração de cashback no ano.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 1 (indicadores) — faturamento/bonificação/SKUs/meses ativos no
// período, mais a variação do último mês contra a média dos 3 anteriores.
// `variacao`/`media_3_anteriores` NULL vira "—", nunca "0%" (regra 0.0/null
// da Frente 2, na dimensão do tempo).
// ═══════════════════════════════════════════════════════════════════════════
function BlocoIndicadores({ indicadores }: { indicadores: FichaClienteIndicadores }) {
  // A MESMA função que o farol da visão simplificada usa. Antes daqui havia
  // um segundo formatador (`${(v * 100).toFixed(1)}%`), e o mesmo número
  // aparecia como "18.4%" neste bloco e "+18,4%" no farol — duas grafias na
  // mesma tela, a um clique de distância (achado da auditoria de
  // 2026-09-25). Uma conta, uma grafia.
  const variacaoTexto = tendencia(indicadores.variacao).texto;
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Indicadores do período</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 py-3 text-[12px]">
        <Indicador rotulo="Faturamento" valor={formatBRL(indicadores.faturamento)} />
        <Indicador
          rotulo="Bonificação"
          valor={formatBRL(indicadores.bonificacao)}
          titulo="Tudo que saiu sem cobrança nas duas séries — cashback e publicidade estão aqui dentro, sem como separar."
        />
        <Indicador rotulo="SKUs" valor={String(indicadores.skus)} />
        <Indicador rotulo="Meses ativos" valor={String(indicadores.meses_ativos)} />
        <Indicador
          rotulo="Var. último mês vs. média 3 anteriores"
          valor={variacaoTexto}
          titulo={
            indicadores.media_3_anteriores === null
              ? 'Menos de 3 meses anteriores com dado — sem base para comparar.'
              : `Média dos 3 meses anteriores: ${formatBRL(indicadores.media_3_anteriores)}`
          }
        />
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, titulo }: { rotulo: string; valor: string; titulo?: string }) {
  return (
    <div title={titulo}>
      <div className="text-muted-foreground">{rotulo}</div>
      <div className="font-mono font-semibold">{valor}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 2 (faturamento mensal) — 12 meses do ano de `ate`, com o período
// selecionado ([de, ate]) em destaque. `valor` NULL (sem venda) some como
// "—", nunca "R$ 0,00".
// ═══════════════════════════════════════════════════════════════════════════
function BlocoMensal({ mensal, de, ate }: { mensal: FichaClienteMes[]; de: string; ate: string }) {
  const dentroDoPeriodo = (mes: string) => mes >= de.slice(0, 8) + '01' && mes <= ate;
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Faturamento mês a mês no ano</div>
      <div className="flex gap-2 px-4 py-3 text-[11px] overflow-x-auto">
        {mensal.map((m) => {
          const destacado = dentroDoPeriodo(m.mes);
          const numeroMes = Number(m.mes.slice(5, 7));
          return (
            <div
              key={m.mes}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md ${destacado ? 'bg-secondary' : ''}`}
            >
              <span className="text-muted-foreground">{MESES[numeroMes - 1]}</span>
              <span className="font-mono">{m.valor === null ? '—' : formatBRL(m.valor)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 3 (mix por faixa) — valor/quantidade/participação por A/B/C/fora
// da curva. A nota do critério por quantidade é a MESMA constante que o
// painel mostra (`NOTA_CURVA_POR_QUANTIDADE`), nunca um segundo texto.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoMix({ mix, criterio }: { mix: FichaClienteMixFaixa[]; criterio: CriterioCurva }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Mix por faixa</div>
      {criterio === 'quantidade' && (
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          {NOTA_CURVA_POR_QUANTIDADE}
        </p>
      )}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Faixa</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
            <th className="px-3 py-1.5 font-semibold text-right">Participação</th>
          </tr>
        </thead>
        <tbody>
          {mix.map((m) => (
            <tr key={m.faixa} className="border-t border-border">
              <td className="px-3 py-1.5">{m.faixa === '-' ? 'Fora da curva' : m.faixa}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{m.quantidade}</td>
              <td className="px-3 py-1.5 text-right font-mono">{m.participacao === null ? '—' : `${m.participacao}%`}</td>
            </tr>
          ))}
          {mix.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nada comprado no período.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 4 (evolução por faixa) — meses do período atual, com o período
// anterior (mesmo tamanho) em cinza, e o total do período atual.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoEvolucaoFaixa({ evolucao }: { evolucao: FichaClienteEvolucaoFaixa }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center justify-between">
        <span>Evolução por faixa</span>
        <span className="text-[12px] font-mono text-muted-foreground">Total do período: {formatBRL(evolucao.total)}</span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Mês</th>
            <th className="px-3 py-1.5 font-semibold text-right">A</th>
            <th className="px-3 py-1.5 font-semibold text-right">B</th>
            <th className="px-3 py-1.5 font-semibold text-right">C</th>
            <th className="px-3 py-1.5 font-semibold text-right">Fora da curva</th>
          </tr>
        </thead>
        <tbody>
          {evolucao.anterior.map((m) => (
            <tr key={`ant-${m.competencia}`} className="border-t border-border text-muted-foreground">
              <td className="px-3 py-1.5">{m.competencia.slice(0, 7)} (anterior)</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_a)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_b)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_c)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_outros)}</td>
            </tr>
          ))}
          {evolucao.atual.map((m) => (
            <tr key={`atu-${m.competencia}`} className="border-t border-border">
              <td className="px-3 py-1.5">{m.competencia.slice(0, 7)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_a)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_b)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_c)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_outros)}</td>
            </tr>
          ))}
          {evolucao.atual.length === 0 && evolucao.anterior.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nada comprado nos dois períodos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 5 (evolução produto a produto) — período atual contra o anterior
// de mesmo tamanho. Avisa no cabeçalho quando o anterior não existe ou
// está incompleto (§11 linha 319) — resolvido contra o que foi IMPORTADO,
// nunca contra o calendário.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoEvolucaoProdutos({ evolucao }: { evolucao: FichaClienteEvolucaoProdutos }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Evolução produto a produto vs. período anterior</div>
      {!evolucao.anterior_existe && (
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          O período anterior de mesmo tamanho não tem nada importado — a comparação abaixo é só o período atual.
        </p>
      )}
      {evolucao.anterior_existe && !evolucao.anterior_completo && (
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          O período anterior de mesmo tamanho está incompleto no que foi importado — a comparação pode estar cobrindo menos tempo do que parece.
        </p>
      )}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Atual</th>
            <th className="px-3 py-1.5 font-semibold text-right">Anterior</th>
            <th className="px-3 py-1.5 font-semibold text-right">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {evolucao.produtos.map((p: FichaClienteEvolucaoProdutoItem) => (
            <tr key={p.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">
                {p.nome}
                {p.marca && <span className="ml-1.5 text-[10px] text-muted-foreground">({p.marca})</span>}
              </td>
              {/* `valor_anterior` e `delta` são NULOS quando a janela
                  anterior não foi importada (migration 20261025020000,
                  item 5) — e `formatBRL` faz `value || 0`, ou seja,
                  escreveria "R$ 0,00" em cima de "sem dado". A tela dizia
                  no cabeçalho que não há base de comparação e, na linha
                  abaixo, afirmava que o anterior foi zero. Achado ao abrir
                  a tela em 2026-09-24, com a ficha de um cliente real. */}
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.valor_atual)}</td>
              <td className="px-3 py-1.5 text-right font-mono">
                {p.valor_anterior === null ? <span className="text-muted-foreground">—</span> : formatBRL(p.valor_anterior)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {p.delta === null ? <span className="text-muted-foreground">—</span> : formatBRL(p.delta)}
              </td>
            </tr>
          ))}
          {evolucao.produtos.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nada nos dois períodos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 6 (comprou) — com as DUAS faixas: a dele e a geral da empresa.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoComprou({ linhas }: { linhas: FichaClienteComprou[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Comprou</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
            <th className="px-3 py-1.5 font-semibold text-right">Faixa dele</th>
            <th className="px-3 py-1.5 font-semibold text-right">Faixa geral</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{l.nome}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.quantidade}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.faixa_cliente === '-' ? 'Fora' : l.faixa_cliente}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.faixa_geral === '-' ? 'Fora' : l.faixa_geral}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nada comprado no período.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 7 (parou de comprar) — sem mudança de regra.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoParouDeComprar({ linhas }: { linhas: FichaClienteParouDeComprar[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Parou de comprar</div>
      <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
        Comprou em pelo menos 2 dos 3 meses anteriores ao último mês com movimento dele, e não comprou nesse último mês.
      </p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{p.nome}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td className="px-3 py-4 text-center text-muted-foreground">Nenhum produto parou.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 8 (nunca comprou) — das TRÊS faixas, com filtro NA TELA (o corte
// de até 100 por faixa já vem do banco). "Todas" mostra as três juntas.
// ═══════════════════════════════════════════════════════════════════════════
const FAIXAS_FILTRO = ['todas', 'A', 'B', 'C', '-'] as const;

function BlocoNuncaComprou({ linhas }: { linhas: FichaClienteNuncaComprou[] }) {
  const [filtro, setFiltro] = useState<typeof FAIXAS_FILTRO[number]>('todas');
  const filtradas = filtro === 'todas' ? linhas : linhas.filter((l) => l.faixa === filtro);
  const totalDaFaixaFiltrada = filtro === 'todas'
    ? linhas.reduce((soma, l, i) => (linhas.findIndex((x) => x.faixa === l.faixa) === i ? soma + l.total_da_faixa : soma), 0)
    : (linhas.find((l) => l.faixa === filtro)?.total_da_faixa ?? 0);

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Nunca comprou</span>
        <div className="flex rounded-md border border-border overflow-hidden">
          {FAIXAS_FILTRO.map((f) => (
            <Button
              key={f}
              type="button"
              variant={filtro === f ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none h-7 px-2.5 text-[11px]"
              onClick={() => setFiltro(f)}
            >
              {f === 'todas' ? 'Todas' : f === '-' ? 'Fora' : f}
            </Button>
          ))}
        </div>
      </div>
      <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
        Ordenado pelo que o produto vendeu no período para os outros clientes — o que ele está deixando de comprar que mais gira.
      </p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold">Faixa</th>
            <th className="px-3 py-1.5 font-semibold text-right">Vendido para outros no período</th>
          </tr>
        </thead>
        <tbody>
          {filtradas.map((p) => (
            <tr key={p.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{p.nome}</td>
              <td className="px-3 py-1.5">{p.faixa === '-' ? 'Fora da curva' : p.faixa}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.valor_outros)}</td>
            </tr>
          ))}
          {filtradas.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Nada — comprou de tudo nesta faixa.</td></tr>
          )}
        </tbody>
      </table>
      {totalDaFaixaFiltrada > filtradas.length && (
        <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
          Mostrando {filtradas.length} de {totalDaFaixaFiltrada}.
        </p>
      )}
    </div>
  );
}

function FichaTabela({
  titulo, linhas, vazio,
}: {
  titulo: string;
  linhas: FichaClienteProduto[];
  vazio: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">{titulo}</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{l.nome}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.quantidade}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">{vazio}</td></tr>
          )}
        </tbody>
        {/* §11 linha 321 pede "quantidade, valor e total" — a linha de total
            faltava (achado da auditoria da Frente 5a). Soma na tela porque a
            tabela inteira já veio; nenhuma ida a mais ao banco. */}
        {linhas.length > 0 && (
          <tfoot>
            <tr className="border-t border-border bg-secondary/60 font-semibold">
              <td className="px-3 py-1.5">Total</td>
              <td className="px-3 py-1.5 text-right font-mono">
                {formatBRL(linhas.reduce((s, l) => s + l.valor, 0))}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {linhas.reduce((s, l) => s + l.quantidade, 0)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
