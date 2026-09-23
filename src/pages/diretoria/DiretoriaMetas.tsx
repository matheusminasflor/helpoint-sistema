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
import { ChevronDown, ChevronRight, Sliders, Target, Upload, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  useAdicionarMembroCarteira, useCarteiraMembros, useCarteiras, useMetasDoAno,
  usePessoasElegiveisParaCarteira, useRemoverMembroCarteira, useSalvarMeta,
} from '@/hooks/useComercialCarteirasMetas';
import { ImportarMetasDialog } from '@/components/comercial/ImportarMetasDialog';
import { MESES, anosDisponiveis } from '@/lib/comparativoAnos';
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
              <Button variant="outline" size="sm" onClick={() => setImportando(true)}>
                <Upload className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Importar
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
                          onSalvar={(valor) => salvar.mutate({
                            id: existente?.id, ano, mes, carteira: linha.carteira, valor,
                          })}
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
  valorInicial, somaDasCarteiras, podeEditar, onSalvar,
}: {
  valorInicial: number | null;
  /** Só na linha "Total da empresa": a soma das carteiras, para comparar com a meta total digitada — nunca fundida com ela. */
  somaDasCarteiras?: number;
  podeEditar: boolean;
  onSalvar: (valor: number) => void;
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
        const numero = Number(texto.replace(',', '.'));
        if (texto.trim() === '' || !Number.isFinite(numero) || numero === valorInicial) return;
        onSalvar(numero);
      }}
      placeholder={somaDasCarteiras ? formatBRL(somaDasCarteiras) : '—'}
      type="number"
      min="0"
      step="0.01"
      className="h-7 text-right text-[12px] px-1.5"
    />
  );
}
