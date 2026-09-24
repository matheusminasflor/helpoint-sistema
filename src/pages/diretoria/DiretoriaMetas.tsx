// Aba "Metas" do Painel Diretor — grade de 12 meses × carteiras, editável,
// com o total da empresa. Ver docs/metas-e-carteiras-fonte-da-verdade.md e
// .scratch/plano-frente2-metas-e-carteiras.md §4.
//
// Duas fontes aqui, complementares: esta grade grava em `com_metas` — o que
// o diretor DEFINE daqui pra frente, célula a célula, e é ela que dispara
// o aviso pelo sino. O botão "Importar" (abaixo) grava em
// `metas_carteira`/`metas_ano` — o que ele JÁ MEDIU, do HISTORICO_METAS.json
// do dono. As duas nunca se misturam.
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Sliders, Target, Upload, Users, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  useAdicionarMembroCarteira, useCarteiraMembros, useCarteiras, useMetasAnoDoAno,
  useMetasCarteiraDoAno, useMetasDoAno, usePessoasElegiveisParaCarteira, useRemoverMembroCarteira,
  useSalvarMeta, useSalvarRealizadoCarteira, useSalvarTotalRealizado,
} from '@/hooks/useComercialCarteirasMetas';
import { ImportarMetasDialog } from '@/components/comercial/ImportarMetasDialog';
import { compararCarteira } from '@/lib/carteira-nome';
import { MESES, anosDisponiveis } from '@/lib/comparativoAnos';
import { interpretarValorDigitado } from '@/lib/valor-celula';
import { formatBRL } from '@/types/financeiro';
import SimuladorMetas from './SimuladorMetas';

const ANO_ATUAL = new Date().getFullYear();
// Inclui o ano seguinte — o diretor define a meta antes de ele começar.
// Fixo mesmo assim (não vem de `metas_anos_disponiveis`): é a janela em que
// se DEFINE meta nova, diferente do seletor das telas que só LEEM realizado.
// Deliberado (confirmado na correção da auditoria de 2026-09-22, item 6.4) e
// DIFERENTE das outras três abas de Diretoria (Meta × realizado,
// Comparativo, Conciliação), que montam o seletor a partir do que já tem
// dado — aqui o caso normal é definir meta de um ano que ainda não tem
// venda nenhuma.
const ANOS_DISPONIVEIS = anosDisponiveis(true);

/** Chave do mapa de metas: carteira real usa o nome; a meta total usa 'total'. */
function chave(mes: number, carteira: string | null): string {
  return `${mes}-${carteira ?? 'total'}`;
}

export default function DiretoriaMetas() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [importando, setImportando] = useState(false);
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinir = canComoOBanco('metas', 'definir');
  const podeGerirCarteiras = canComoOBanco('carteiras', 'gerir');

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
        title="Metas"
        description={`Uma linha por carteira, mais o total da empresa. ${!podeDefinir ? 'Somente leitura — falta a permissão "metas.definir".' : ''}`}
        actions={(
          <div className="flex items-center gap-2">
            {podeDefinir && (
              // Rótulo explícito (Frente 7, item 4): o JSON é para carga
              // histórica, não para o uso do dia a dia — que agora é
              // digitar direto nas duas grades abaixo. O botão continua
              // aqui até a Frente 6 mover isto para Configurações.
              <Button variant="outline" size="sm" onClick={() => setImportando(true)}>
                <Upload className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Importar carga histórica
              </Button>
            )}
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

      <ImportarMetasDialog open={importando} onOpenChange={setImportando} />

      {/* Item 4.2 do plano da Frente 3: "quem responde por cada carteira"
          atrás de um botão — é configuração que se acessa raramente, não
          algo que se olha toda vez que se abre Metas. */}
      {podeGerirCarteiras && (
        <SecaoRecolhivel titulo="Quem responde por cada carteira" icone={<Users className="w-3.5 h-3.5" aria-hidden="true" />}>
          <QuemRespondePorCarteira carteiras={carteiras} />
        </SecaoRecolhivel>
      )}

      <h3 className="text-[13px] font-semibold text-foreground">Meta</h3>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[12px]">
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
                    const existente = mapa.get(chave(mes, linha.carteira));
                    return (
                      <td key={mes} className="py-1 px-1">
                        <CelulaMeta
                          valorInicial={existente?.valor ?? null}
                          somaDasCarteiras={linha.carteira === null ? totalPorMes[i] : undefined}
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

      <SecaoRealizado ano={ano} podeDefinir={podeDefinir} />

      {/* O simulador vive abaixo da grade — é onde o diretor já está quando
          pensa em meta. Ver src/pages/diretoria/SimuladorMetas.tsx. Atrás de
          um botão (item 4.2 do plano): é uma ferramenta de apoio, não parte
          da leitura direta da grade. */}
      <SecaoRecolhivel titulo="Simulador de metas" icone={<Sliders className="w-3.5 h-3.5" aria-hidden="true" />}>
        <SimuladorMetas ano={ano} />
      </SecaoRecolhivel>
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
 * "Quem responde por cada carteira" — sem isto, o aviso pelo sino nunca
 * dispara: `notify_on_meta_definida` só acha gente para avisar se houver
 * linha em `com_carteira_membros`. O seletor já exclui quem já responde por
 * outra carteira (uma pessoa, uma carteira — `unique` no banco); se a
 * corrida acontecer mesmo assim, `useAdicionarMembroCarteira` traduz o
 * 23505 do Postgres.
 */
function QuemRespondePorCarteira({ carteiras }: { carteiras: string[] }) {
  const { data: membros = [], isLoading } = useCarteiraMembros();
  const { data: pessoas = [] } = usePessoasElegiveisParaCarteira();
  const adicionar = useAdicionarMembroCarteira();
  const remover = useRemoverMembroCarteira();
  const [pessoaEscolhida, setPessoaEscolhida] = useState<Record<string, string>>({});

  const idsJaAlocados = useMemo(() => new Set(membros.map((m) => m.user_id)), [membros]);
  const pessoasDisponiveis = useMemo(
    () => pessoas.filter((p) => !idsJaAlocados.has(p.id)),
    [pessoas, idsJaAlocados],
  );

  return (
    <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
      <p className="text-[12px] font-medium text-foreground flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" aria-hidden="true" /> Quem responde por cada carteira
      </p>
      <p className="text-[11px] text-muted-foreground">
        Quem está aqui recebe o aviso pelo sino quando a meta da carteira é definida. Uma pessoa só pode estar em uma carteira.
      </p>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {carteiras.map((nome) => {
            const daCarteira = membros.filter((m) => m.carteira === nome);
            return (
              <div key={nome} className="rounded-md border border-border p-2.5 space-y-2">
                <p className="text-[12px] font-medium">{nome}</p>
                {daCarteira.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Ninguém responde por esta carteira ainda.</p>
                ) : (
                  <ul className="space-y-1">
                    {daCarteira.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span>{m.nome}</span>
                        <button
                          type="button"
                          onClick={() => remover.mutate(m.id)}
                          aria-label={`Tirar ${m.nome} da carteira ${nome}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-1.5">
                  <Select
                    value={pessoaEscolhida[nome] ?? ''}
                    onValueChange={(v) => setPessoaEscolhida((s) => ({ ...s, [nome]: v }))}
                  >
                    <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue placeholder="Acrescentar pessoa…" /></SelectTrigger>
                    <SelectContent>
                      {pessoasDisponiveis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-[11px] px-2"
                    disabled={!pessoaEscolhida[nome] || adicionar.isPending}
                    onClick={() => {
                      const userId = pessoaEscolhida[nome];
                      if (!userId) return;
                      adicionar.mutate({ carteira: nome, userId }, {
                        onSuccess: () => setPessoaEscolhida((s) => ({ ...s, [nome]: '' })),
                      });
                    }}
                  >
                    Adicionar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CelulaMeta({
  valorInicial, somaDasCarteiras, podeEditar, onSalvar, permiteNulo = false,
}: {
  valorInicial: number | null;
  /** Só na linha/coluna "Total da empresa": a soma das carteiras, para comparar com o valor digitado — nunca fundida com ele, nunca gravada. */
  somaDasCarteiras?: number;
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
  const [texto, setTexto] = useState(valorInicial != null ? String(valorInicial) : '');

  // Sem isto, trocar de ano com o React Query já em cache não remonta o
  // input (mesma posição na grade) e a célula ficava mostrando o valor do
  // ano anterior até o próximo blur. `useEffect` sincroniza o texto sempre
  // que o valor de fora muda.
  useEffect(() => {
    setTexto(valorInicial != null ? String(valorInicial) : '');
  }, [valorInicial]);

  if (!podeEditar) {
    return <span className="block text-right text-muted-foreground">{valorInicial != null ? formatBRL(valorInicial) : '—'}</span>;
  }

  return (
    <Input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const interpretado = interpretarValorDigitado(texto);
        if (interpretado.tipo === 'invalido') return;
        if (interpretado.tipo === 'nulo') {
          if (permiteNulo && valorInicial !== null) onSalvar(null);
          return;
        }
        if (interpretado.valor === valorInicial) return;
        onSalvar(interpretado.valor);
      }}
      placeholder={somaDasCarteiras ? formatBRL(somaDasCarteiras) : '—'}
      type="number"
      min="0"
      step="0.01"
      className="h-7 text-right text-[12px] px-1.5"
    />
  );
}

/**
 * "Realizado" — o que falta desta Frente 7: o diretor digita o realizado por
 * carteira e o total da empresa, direto na grade, sem passar por JSON. Ver
 * .scratch/plano-frente7-metas-digitadas.md §1.
 *
 * Doze linhas (os meses), colunas dinâmicas (as carteiras conhecidas) mais
 * Total da empresa e Meta. As quatro primeiras gravam em `metas_carteira.
 * realizado`; Total da empresa grava em `metas_ano.total_realizado` —
 * CAMPO PRÓPRIO, nunca calculado como soma das carteiras (pode haver venda
 * fora de carteira; decisão do dono). Meta é a mesma de sempre (com_metas,
 * carteira nula) — não muda o caminho de gravação, só aparece aqui de novo
 * para comparação lado a lado com o realizado do mês.
 */
function SecaoRealizado({ ano, podeDefinir }: { ano: number; podeDefinir: boolean }) {
  const { data: carteirasConhecidas = [], isLoading: carregandoCarteiras } = useCarteiras();
  // Carteira criada nesta sessão, ainda sem nenhum realizado gravado — a
  // união com `useCarteiras()` (que lê o banco) só passa a trazê-la sozinha
  // depois do primeiro `.mutate()` bem-sucedido numa célula dela. Até lá, é
  // este estado local que mantém a coluna na tela.
  const [carteirasExtras, setCarteirasExtras] = useState<string[]>([]);
  const carteiras = useMemo(() => {
    const vistas = new Set(carteirasConhecidas.map((c) => c.toUpperCase()));
    return [...carteirasConhecidas, ...carteirasExtras.filter((c) => !vistas.has(c.toUpperCase()))];
  }, [carteirasConhecidas, carteirasExtras]);

  const { data: realizados = [], isLoading: carregandoRealizado } = useMetasCarteiraDoAno(ano);
  const { data: totais = [], isLoading: carregandoTotal } = useMetasAnoDoAno(ano);
  const { data: metas = [] } = useMetasDoAno(ano);
  const salvarRealizado = useSalvarRealizadoCarteira();
  const salvarTotal = useSalvarTotalRealizado();
  const salvarMeta = useSalvarMeta();

  const mapaRealizado = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of realizados) m.set(`${r.mes}-${r.carteira}`, r.realizado);
    return m;
  }, [realizados]);

  const mapaTotal = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const t of totais) m.set(t.mes, t.total_realizado);
    return m;
  }, [totais]);

  const mapaMetaTotal = useMemo(() => {
    const m = new Map<number, { id: string; valor: number }>();
    for (const meta of metas) if (meta.carteira === null) m.set(meta.mes, { id: meta.id, valor: meta.valor });
    return m;
  }, [metas]);

  // Item 4 do plano: "quais anos têm meta e quais só têm realizado" — aqui
  // olhado no ano selecionado (o diretor já troca de ano pelo seletor da
  // página; uma varredura de todos os anos exigiria uma consulta por ano,
  // sem função nova — fora do que esta frente pede).
  const temMeta = totais.some((t) => t.meta != null) || metas.some((m) => m.carteira === null);
  const temRealizado = realizados.some((r) => r.realizado != null) || totais.some((t) => t.total_realizado != null);
  const avisoAno = temRealizado && !temMeta
    ? `${ano} tem realizado informado, mas nenhuma meta — o gráfico de meta × realizado fica sem a linha de meta neste ano.`
    : temMeta && !temRealizado
      ? `${ano} tem meta definida, mas nenhum realizado informado ainda.`
      : null;

  const isLoading = carregandoCarteiras || carregandoRealizado || carregandoTotal;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Realizado</h3>
          <p className="text-[11px] text-muted-foreground">
            Digitado pelo diretor, carteira a carteira e no total da empresa — nunca somado a partir da venda do ERP.
          </p>
        </div>
        {podeDefinir && (
          <BotaoNovaCarteira
            carteirasConhecidas={carteiras}
            onCriar={(nome) => setCarteirasExtras((s) => [...s, nome])}
          />
        )}
      </div>

      {avisoAno && <p className="text-[11px] text-muted-foreground">{avisoAno}</p>}

      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40">
              <tr>
                <th className="py-2 px-3 text-left font-medium sticky left-0 bg-muted/40">Mês</th>
                {carteiras.map((c) => <th key={c} className="py-2 px-2 text-right font-medium min-w-[92px]">{c}</th>)}
                <th className="py-2 px-2 text-right font-medium min-w-[92px]">Total da empresa</th>
                <th className="py-2 px-2 text-right font-medium min-w-[92px]">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MESES.map((nomeMes, i) => {
                const mes = i + 1;
                // Só para o diretor comparar com o que digitou no Total —
                // nunca substitui o valor dele, nunca é gravada (item 1 do
                // plano). Meses sem nenhuma carteira com dado somam zero;
                // mesmo comportamento de `totalPorMes` na grade de Meta.
                const somaCarteiras = carteiras.reduce((acc, c) => {
                  const v = mapaRealizado.get(`${mes}-${c}`);
                  return v != null ? acc + v : acc;
                }, 0);
                const metaTotal = mapaMetaTotal.get(mes);
                return (
                  <tr key={mes}>
                    <td className="py-1.5 px-3 sticky left-0 bg-inherit">{nomeMes}</td>
                    {carteiras.map((c) => (
                      <td key={c} className="py-1 px-1">
                        <CelulaMeta
                          valorInicial={mapaRealizado.get(`${mes}-${c}`) ?? null}
                          podeEditar={podeDefinir}
                          permiteNulo
                          onSalvar={(valor) => salvarRealizado.mutate({ ano, mes, carteira: c, realizado: valor })}
                        />
                      </td>
                    ))}
                    <td className="py-1 px-1">
                      <CelulaMeta
                        valorInicial={mapaTotal.get(mes) ?? null}
                        somaDasCarteiras={somaCarteiras}
                        podeEditar={podeDefinir}
                        permiteNulo
                        onSalvar={(valor) => salvarTotal.mutate({ ano, mes, totalRealizado: valor })}
                      />
                    </td>
                    <td className="py-1 px-1">
                      <CelulaMeta
                        valorInicial={metaTotal?.valor ?? null}
                        podeEditar={podeDefinir}
                        onSalvar={(valor) => {
                          // Mesma guarda da grade de Meta acima: sem
                          // `permiteNulo`, `onSalvar` nunca recebe nulo —
                          // é só para o TypeScript aceitar a assinatura
                          // compartilhada com as colunas de Realizado.
                          if (valor === null) return;
                          salvarMeta.mutate({ id: metaTotal?.id, ano, mes, carteira: null, valor });
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Botão "nova carteira" (item 3 do plano): fácil de criar, impossível por
 * acidente. Digitar nunca cria sozinho — só depois de confirmar com o nome
 * escrito por extenso. Se o nome já existe entre as conhecidas (ignorando
 * caixa e acento — `compararCarteira`), não cria nada: avisa qual coluna já
 * existe, para o diretor usar aquela.
 */
function BotaoNovaCarteira({ carteirasConhecidas, onCriar }: { carteirasConhecidas: string[]; onCriar: (nome: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const fecharTudo = () => { setAberto(false); setTexto(''); setConfirmando(null); };

  const continuar = () => {
    const nome = texto.trim().toUpperCase();
    if (!nome) return;
    const resultado = compararCarteira(nome, carteirasConhecidas);
    if (resultado.existe) {
      toast.info(`"${nome}" já existe como "${resultado.nomeExistente}" — use a coluna que já está na grade.`);
      fecharTudo();
      return;
    }
    setConfirmando(nome);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Nova carteira
      </Button>

      <Dialog open={aberto && !confirmando} onOpenChange={(v) => { if (!v) fecharTudo(); else setAberto(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova carteira</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nova-carteira-nome">Nome da carteira</Label>
            <Input
              id="nova-carteira-nome"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: SUL"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharTudo}>Cancelar</Button>
            <Button onClick={continuar} disabled={!texto.trim()}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmando} onOpenChange={(v) => !v && fecharTudo()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar a carteira {confirmando}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela passa a ter uma coluna própria na grade de Realizado. Não há cadastro para desfazer — confira o nome antes de confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmando) onCriar(confirmando); fecharTudo(); }}>
              Criar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
