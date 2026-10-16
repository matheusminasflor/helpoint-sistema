// Aba "Metas e carteiras" do Painel Diretor — grade de 12 meses × carteiras,
// editável, com o total da empresa. Ver
// docs/metas-e-carteiras-fonte-da-verdade.md e
// .scratch/plano-frente2-metas-e-carteiras.md §4.
//
// ── Etapa 4 (2026-09-25) ────────────────────────────────────────────────
// Esta aba absorveu "Carteiras" e "Conciliação". O dono, 2026-09-24: "no
// diretoria há diversas informações poderiam estar em uma única aba, veja o
// que está redundante e o que duplica informações."
//
// A redundância era real e medida: o realizado por carteira × mês aparecia na
// grade "Realizado" daqui E na tabela "Carteiras mês a mês" da outra aba —
// mesma matriz, mesmos hooks, duas abas que o diretor abria alternadamente
// para comparar. A meta por carteira × mês, idem. A Conciliação eram cinco
// linhas numa aba própria, e só faz sentido ao lado das metas que concilia.
//
// UM ANO SÓ para tudo o que está aqui dentro, vindo desta página. A aba
// "Carteiras" tinha o seu seletor e o comparativo embutido tinha outro, com
// estado próprio — dava para lê-los como se falassem do mesmo ano estando em
// anos diferentes (achado da auditoria). A lista de anos é a DAQUI
// (`anosDisponiveis(true)`, com o ano seguinte), porque nesta tela o caso
// normal é definir meta de um ano que ainda não tem venda nenhuma.
//
// Duas grades, dois assuntos, nunca fundidos:
//
// - META (`com_metas`) — o que o diretor se compromete a vender. Digitada
//   célula a célula, e é ela que dispara o aviso pelo sino.
// - REALIZADO (`metas_carteira` por carteira, `metas_ano.total_realizado`
//   para a empresa) — o que ele MEDIU. Desde a Frente 7 (2026-09-24) tem
//   DOIS caminhos de escrita: digitado nesta tela, que é o normal daqui pra
//   frente, e o HISTORICO_METAS.json, que ficou só para a carga histórica —
//   "o diretor não sabe nem o que é JSON" (o dono, na mesma data).
//
// O total da empresa é CAMPO PRÓPRIO, nunca a soma das carteiras (decisão do
// dono): pode haver venda fora de carteira. A soma aparece ao lado, em
// cinza, só para ele comparar.
import { DialogoRenomearCarteira } from '@/components/comercial/DialogoRenomearCarteira';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Pencil, Plus, Target, Users } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useDepartmentPermissions, usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';
import {
  useCarteiras, useCarteirasComMeses, useMetasAnoDoAno,
  useMetasCarteiraDoAno, useMetasDoAno,
  useRenomearCarteira, useRenomeacoesCarteira, useSalvarMeta, useSalvarRealizadoCarteira,
} from '@/hooks/useComercialCarteirasMetas';
// O quadro de membros saiu daqui em 2026-09-28 — o Comercial passou a usar o mesmo.
import { QuemRespondePorCarteira } from '@/components/comercial/QuemRespondePorCarteira';
import { compararCarteira, normalizarNomeCarteira } from '@/lib/carteira-nome';
import { MESES, anosDisponiveis } from '@/lib/comparativoAnos';
import { interpretarValorDigitado } from '@/lib/valor-celula';
import { formatBRL } from '@/types/financeiro';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { useMetaXRealizadoAno } from '@/hooks/useDiretoriaMetaXRealizado';
import SimuladorMetas from './SimuladorMetas';
import DiretoriaComparativo from './DiretoriaComparativo';
import { CarteirasMesAMes, CarteirasNoAno } from './DiretoriaCarteiras';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { PeriodoPersonalizado } from '@/components/ui/PeriodoPersonalizado';
import { avisoDeMesesInteiros, OPCOES_DE_CALENDARIO, PERSONALIZADO, rotuloDoIntervalo } from '@/lib/period';

/** "Ano todo" é a tela de antes; os outros são os rápidos e o "Personalizado" (dono, 2026-10-03). */
const ANO_TODO = 'ano' as const;
const OPCOES_DE_PERIODO = [{ value: ANO_TODO, label: 'Ano todo' }, ...OPCOES_DE_CALENDARIO];

const ANO_ATUAL = new Date().getFullYear();
// Inclui o ano seguinte — o diretor define a meta antes de ele começar.
// Fixo mesmo assim (não vem de `metas_anos_disponiveis`): é a janela em que
// se DEFINE meta nova, diferente do seletor das telas que só LEEM realizado.
// Deliberado (confirmado na correção da auditoria de 2026-09-22, item 6.4).
//
// Desde a etapa 4 esta lista manda também no comparativo e na conciliação,
// que viraram blocos desta página e perderam os seletores próprios. Era
// justamente por eles montarem o seletor a partir do que já tem dado que
// havia dois anos possíveis na mesma tela. O único efeito colateral: se a
// carga histórica um dia trouxer um ano ANTERIOR ao que `anosDisponiveis`
// cobre, ele não aparecerá aqui — a janela é de definição de meta, não do
// que existe no banco. Hoje não há esse caso (o mais antigo é 2022).
// Registrado em docs/nao-funciona.md.
const ANOS_DISPONIVEIS = anosDisponiveis(true);

/** Chave do mapa de metas: carteira real usa o nome; a meta total usa 'total'. */
function chave(mes: number, carteira: string | null): string {
  return `${mes}-${carteira ?? 'total'}`;
}

export default function DiretoriaMetas() {
  const [ano, setAno] = useState(ANO_ATUAL);
  // Abre ANALÍTICA, ao contrário das telas de leitura: é aqui que o diretor
  // digita meta e realizado, e uma visão que esconde as duas grades entrega
  // a tela sem a coisa que ela faz.
  const [visao, setVisao] = useVisaoRelatorio('diretoria-metas', 'simplificado');
  // O ano desta página manda também nas tabelas por carteira e no
  // comparativo — é o que faz a aba fundida ter um ano só.
  // O período (pedido do dono, 2026-10-03): "Ano todo" é a tela de antes. Com um período, as
  // tabelas por carteira e a conciliação passam a ser dos MESES INTEIROS que ele toca (meta e
  // realizado informado são mensais); as grades de meta e realizado, o simulador e o
  // comparativo continuam do ano — é nelas que se digita, e digitar é por mês do ano.
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<typeof ANO_TODO>(ANO_TODO);
  const metaXRealizado = useMetaXRealizadoAno({ ano, setAno }, intervalo);
  const aviso = avisoDeMesesInteiros('Meta e realizado são mensais', intervalo);
  // O ano da tela acompanha o ano do FIM do período (como `FiltrosComerciais`): é dele a meta do
  // ano e as grades. Só quando o período muda — trocar o ano à mão, depois, continua valendo.
  const anoDoFim = intervalo ? Number(intervalo.ate.slice(0, 4)) : null;
  useEffect(() => {
    if (anoDoFim !== null && anoDoFim !== ano && ANOS_DISPONIVEIS.includes(anoDoFim)) setAno(anoDoFim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anoDoFim]);
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinir = canComoOBanco('metas', 'definir');
  const podeGerirCarteiras = usePodeGerirCarteiras();
  // Frente 6 (.scratch/plano-frente6-importacoes.md §2): o botão "Importar
  // carga histórica" saiu de aqui — era exatamente esta tela que o dono não
  // conseguia importar sozinho ("no painel diretoria não consigo importar
  // os dados, somente no comercial"). Só o caminho para quem procurar aqui.
  const tenantPath = useTenantPath();

  const { data: carteiras = [], isLoading: carregandoCarteiras } = useCarteiras();
  const { data: metas = [], isLoading: carregandoMetas } = useMetasDoAno(ano);
  const salvar = useSalvarMeta();

  const mapa = useMemo(() => {
    const m = new Map<string, { id: string; valor: number }>();
    for (const meta of metas) m.set(chave(meta.mes, meta.carteira), { id: meta.id, valor: meta.valor });
    return m;
  }, [metas]);

  const linhas = useMemo(
    () => [...carteiras.map((nome) => ({ carteira: nome, nome })), { carteira: null, nome: 'Total da empresa' }],
    [carteiras],
  );

  const totalPorMes = useMemo(() => {
    const somas = Array<number>(12).fill(0);
    for (const meta of metas) {
      if (meta.carteira === null) continue; // a meta TOTAL não entra na soma das carteiras
      somas[meta.mes - 1] += meta.valor;
    }
    return somas;
  }, [metas]);

  const isLoading = carregandoCarteiras || carregandoMetas;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Target}
        title="Metas e carteiras"
        description={`A meta é por carteira; a da empresa é a soma delas. ${!podeDefinir ? 'Somente leitura — falta a permissão "metas.definir".' : ''}`}
        actions={(
          <div className="flex items-center gap-2">
            <TutorialDoRelatorio id="diretoria-metas" />
            <SeletorVisao visao={visao} onChange={setVisao} />
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANOS_DISPONIVEIS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">

      {/* O período (2026-10-03). Aqui, e não no cabeçalho ao lado do ano: o "Personalizado" abre dois
          campos de data, que não cabem na linha dos botões. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Período das tabelas por carteira:</span>
        <Select value={periodo} onValueChange={(v) => escolher(v, intervalo ?? { de: `${ano}-01-01`, ate: `${ano}-12-31` })}>
          <SelectTrigger className="w-40" aria-label="Período"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPCOES_DE_PERIODO.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {periodo === PERSONALIZADO && intervalo && (
          <PeriodoPersonalizado de={intervalo.de} ate={intervalo.ate} onChange={definirIntervalo} />
        )}
      </div>
      {intervalo && (
        <p className="text-[13px] text-muted-foreground">
          {aviso ?? `Período de ${rotuloDoIntervalo(intervalo)}.`} As grades de meta e de realizado, o simulador e o
          comparativo continuam do ano {ano}.
        </p>
      )}
      {metaXRealizado.erroNoPeriodo && (
        <p className="text-[13px] text-status-danger">
          Não consegui ler as metas do período — as tabelas por carteira estão vazias por isso, não por falta de
          dado. Recarregue a página.
        </p>
      )}

      {/* Frente 7d (.scratch/plano-frente7d-renomear-carteira.md §4): a
          lista vem sempre visível, não atrás de um botão — é o que mostra,
          sem o dono precisar perguntar, que uma carteira tem 12 linhas e
          nenhum valor. */}
      <SecaoCarteiras podeDefinir={podeDefinir} />

      {/* Frente 7b (.scratch/plano-frente7b-metas-reais-e-simulador.md §3):
          o simulador vem ANTES da grade — é o que o dono pediu ("deveria
          ser antes da meta, e já mostrar em tempo real"). Saiu de atrás do
          botão "Simulador de metas": ficar escondido era parte do que não
          funcionava bem, junto com só simular o total da empresa. */}
      <SimuladorMetas ano={ano} />

      {/* Vinda da aba "Carteiras" (etapa 4): o placar por carteira no ano —
          realizado, meta, cobertura e peso. Fica nas DUAS visões porque é o
          resumo que responde "como cada carteira está indo", que é a
          pergunta desta aba. */}
      <CarteirasNoAno
        carteirasNoAno={metaXRealizado.carteirasNoAno} isLoading={metaXRealizado.isLoading}
        titulo={intervalo ? `Carteiras no período (${rotuloDoIntervalo(intervalo)})` : undefined}
      />

      {visao === 'simplificado' ? (
        <p className="text-[13px] text-muted-foreground">
          Para definir as metas de cada mês, ver as carteiras mês a mês e o comparativo com os anos anteriores, escolha
          <strong className="text-foreground"> Analítico</strong> no alto da tela.
        </p>
      ) : (
        <>
      {/* Item 4.2 do plano da Frente 3: "quem responde por cada carteira"
          atrás de um botão — é configuração que se acessa raramente, não
          algo que se olha toda vez que se abre Metas. */}
      {podeGerirCarteiras && (
        <SecaoRecolhivel titulo="Quem responde por cada carteira" icone={<Users className="w-3.5 h-3.5" aria-hidden="true" />}>
          <QuemRespondePorCarteira carteiras={carteiras} />
        </SecaoRecolhivel>
      )}

      <h3 className="text-[14px] font-semibold text-foreground">Meta</h3>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40">
              <tr>
                <th className="py-2 px-3 text-left font-medium sticky left-0 bg-muted/40">Carteira</th>
                {MESES.map((m) => <th key={m} className="py-2 px-2 text-right font-medium min-w-[92px]">{m}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((linha) => (
                <tr key={linha.carteira ?? 'total'} className={linha.carteira === null ? 'bg-secondary/40 font-medium' : undefined}>
                  <td className="py-1.5 px-3 sticky left-0 bg-inherit">{linha.nome}</td>
                  {MESES.map((_, i) => {
                    const mes = i + 1;
                    // Frente 7c §1 (.scratch/plano-frente7c-total-e-bercario.md):
                    // "Total da empresa" deixou de ser campo digitável — é a
                    // SOMA das metas por carteira, calculada, só para
                    // conferência. Dois números para a mesma meta era o "buga
                    // os valores" que o dono sentiu.
                    if (linha.carteira === null) {
                      return (
                        <td key={mes} className="py-1 px-1">
                          <span
                            className="block text-right text-muted-foreground"
                            title="Soma das metas por carteira neste mês — calculada, nunca digitada."
                          >
                            {formatBRL(totalPorMes[i])}
                          </span>
                        </td>
                      );
                    }
                    const existente = mapa.get(chave(mes, linha.carteira));
                    return (
                      <td key={mes} className="py-1 px-1">
                        <CelulaMeta
                          valorInicial={existente?.valor ?? null}
                          podeEditar={podeDefinir}
                          onSalvar={(valor) => {
                            // A coluna de Meta não permite apagar (permiteNulo
                            // não foi passado a CelulaMeta) — `valor` nunca
                            // chega nulo aqui; a guarda é só para o TypeScript,
                            // já que `onSalvar` agora aceita `number | null`
                            // por causa das colunas de Realizado (abaixo).
                            if (valor === null) return;
                            salvar.mutate({ id: existente?.id, ano, mes, carteira: linha.carteira, valor });
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* O realizado deixou de ser digitado (20270125010000): vem das vendas, na tabela abaixo. */}
      {/* Da aba "Carteiras": a mesma matriz da grade acima, lida como peso,
          meta e cobertura em vez do valor cru. Fica logo abaixo dela de
          propósito — era a comparação que obrigava a trocar de aba. */}
      <CarteirasMesAMes
        carteirasMesAMes={metaXRealizado.carteirasMesAMes} isLoading={metaXRealizado.isLoading}
        meses={intervalo ? metaXRealizado.mesesDoPeriodo : undefined}
      />

      <div className="border-t border-border pt-6">
        <DiretoriaComparativo ano={ano} />
      </div>

        </>
      )}
      </div>
    </div>
  );
}

/** Uma seção fechada por padrão, atrás de um botão — mesmo padrão de `IndicatorsView`. */
function SecaoRecolhivel({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-1.5">{icone}{titulo}</span>
          {aberto ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Frente 7d (.scratch/plano-frente7d-renomear-carteira.md §4): a lista de
 * carteiras conhecidas com quantos meses cada uma tem valor, e o botão de
 * renomear por linha — a tela que o dono aprovou antes da construção. Sem
 * botão de desfazer (decisão dele: a recusa do banco a renomear para um
 * nome que já existe já é a trava).
 */
function SecaoCarteiras({ podeDefinir }: { podeDefinir: boolean }) {
  const { data: carteiras = [], isLoading } = useCarteirasComMeses();
  const { data: renomeacoes = [] } = useRenomeacoesCarteira();
  const renomear = useRenomearCarteira();
  const [editando, setEditando] = useState<string | null>(null);

  // De qual(is) nome(s) antigo(s) esta carteira já veio — para o dono ver o
  // que já está combinado, sem abrir nada (plano §4).
  const antigosPorCarteira = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of renomeacoes) {
      const lista = m.get(r.para) ?? [];
      lista.push(r.de);
      m.set(r.para, lista);
    }
    return m;
  }, [renomeacoes]);

  return (
    <div className="space-y-2">
      <h3 className="text-[14px] font-semibold text-foreground">Carteiras</h3>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="rounded-md border border-border divide-y divide-border">
          {carteiras.map((c) => {
            const antigos = antigosPorCarteira.get(c.carteira);
            return (
              <div key={c.carteira} className="flex items-center justify-between gap-2 px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium">{c.carteira}</p>
                  {antigos && antigos.length > 0 && <p className="text-[12px] text-muted-foreground">Antes: {antigos.join(', ')}</p>}
                </div>
                {podeDefinir && (
                  <Button variant="ghost" size="sm" onClick={() => setEditando(c.carteira)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Renomear
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DialogoRenomearCarteira
        nomeAtual={editando}
        pendente={renomear.isPending}
        onOpenChange={(v) => { if (!v) setEditando(null); }}
        onConfirmar={(novoNome, lembrar) => {
          if (!editando) return;
          renomear.mutate({ de: editando, para: novoNome, lembrar }, {
            onSuccess: () => setEditando(null),
          });
        }}
      />
    </div>
  );
}


function CelulaMeta({
  valorInicial, podeEditar, onSalvar, permiteNulo = false,
}: {
  valorInicial: number | null;
  podeEditar: boolean;
  onSalvar: (valor: number | null) => void;
  /**
   * Regra 1 da Frente 7 (.scratch/plano-frente7-metas-digitadas.md §2):
   * apagar a célula grava NULL — "não informei", nunca zero. Só as colunas
   * de REALIZADO (metas_carteira/metas_ano) passam isto; a coluna de Meta
   * continua sem permitir apagar, comportamento de antes preservado.
   */
  permiteNulo?: boolean;
}) {
  // Vírgula decimal no buffer de edição (Frente 7b) — é a forma que o
  // diretor digita e vê de volta; `String(number)` do JS sai com ponto, daí
  // o `.replace`. `valorInicial` é sempre um número "limpo" (nunca tem mais
  // de um ponto), então a troca é segura.
  const paraTexto = (v: number | null) => (v != null ? String(v).replace('.', ',') : '');
  const [texto, setTexto] = useState(paraTexto(valorInicial));
  // Com foco mostra o número cru (editável); sem foco, formatado em reais
  // (Frente 7b, item 1 — "311254,03" não é dinheiro, R$ 311.254,03 é).
  const [focado, setFocado] = useState(false);

  // Sem isto, trocar de ano com o React Query já em cache não remonta o
  // input (mesma posição na grade) e a célula ficava mostrando o valor do
  // ano anterior até o próximo blur. `useEffect` sincroniza o texto sempre
  // que o valor de fora muda.
  useEffect(() => {
    setTexto(paraTexto(valorInicial));
  }, [valorInicial]);

  if (!podeEditar) {
    return (
      <span className="block text-right text-muted-foreground">{valorInicial != null ? formatBRL(valorInicial) : '—'}</span>
    );
  }

  return (
    <Input
      value={focado ? texto : (valorInicial != null ? formatBRL(valorInicial) : '')}
      onChange={(e) => setTexto(e.target.value)}
      onFocus={() => setFocado(true)}
      onBlur={() => {
        setFocado(false);
        // A guarda de `validity.badInput` que existia aqui (achado da
        // auditoria de 2026-09-24) saiu porque o campo virou type="text"
        // (Frente 7b, item 1 — type="number" não formata em reais).
        // `badInput` é sanitização do PRÓPRIO <input type="number">: só o
        // navegador zera sozinho um texto que ele não reconhece como
        // número. Campo de texto nunca faz isso — "100e" continua "100e"
        // em `e.target.value`, `interpretarValorDigitado` devolve
        // `invalido` na linha de baixo, e a guarda a seguir já cobre o
        // mesmo caso sem precisar da API do navegador.
        const interpretado = interpretarValorDigitado(texto);
        if (interpretado.tipo === 'invalido') return;
        if (interpretado.tipo === 'nulo') {
          if (permiteNulo && valorInicial !== null) onSalvar(null);
          return;
        }
        if (interpretado.valor === valorInicial) return;
        onSalvar(interpretado.valor);
      }}
      placeholder="—"
      type="text"
      inputMode="decimal"
      className="h-7 text-right text-[13px] px-1.5"
    />
  );
}
