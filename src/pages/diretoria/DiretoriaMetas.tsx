// Aba "Metas" do Painel Diretor (L6d) — grade de 12 meses × carteiras,
// editável, com o total da empresa. Ver
// .scratch/plano-l6d-metas-e-carteiras.md §3.1 e
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15.
//
// "As metas nascem vazias e o diretor as preenche" — não há JSON para ler
// aqui: cada célula é gravada de verdade em `com_metas`, uma a uma.
import { useEffect, useMemo, useState } from 'react';
import { Target, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  useAdicionarMembroCarteira, useCarteiraMembros, useCarteiras, useMetasDoAno,
  usePessoasElegiveisParaCarteira, useRemoverMembroCarteira, useSalvarMeta,
} from '@/hooks/useComercialCarteirasMetas';
import { MESES, anosDisponiveis } from '@/lib/comparativoAnos';
import { formatBRL } from '@/types/financeiro';
import SimuladorMetas from './SimuladorMetas';
import type { Carteira } from '@/types/comercial';

const ANO_ATUAL = new Date().getFullYear();
const ANOS_DISPONIVEIS = anosDisponiveis(true); // inclui o ano seguinte — o diretor define a meta antes de ele começar

/** Chave do mapa de metas: carteira real usa o id; a meta total usa 'total'. */
function chave(mes: number, carteiraId: string | null): string {
  return `${mes}-${carteiraId ?? 'total'}`;
}

export default function DiretoriaMetas() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinir = canComoOBanco('metas', 'definir');
  const podeGerirCarteiras = canComoOBanco('carteiras', 'gerir');

  const { data: carteiras = [], isLoading: carregandoCarteiras } = useCarteiras();
  const { data: metas = [], isLoading: carregandoMetas } = useMetasDoAno(ano);
  const salvar = useSalvarMeta();

  const mapa = useMemo(() => {
    const m = new Map<string, { id: string; valor: number }>();
    for (const meta of metas) m.set(chave(meta.mes, meta.carteira_id), { id: meta.id, valor: meta.valor });
    return m;
  }, [metas]);

  const linhas = useMemo(
    () => [...carteiras.map((c) => ({ id: c.id, nome: c.nome })), { id: null, nome: 'Total da empresa' }],
    [carteiras],
  );

  const totalPorMes = useMemo(() => {
    const somas = Array<number>(12).fill(0);
    for (const meta of metas) {
      if (meta.carteira_id === null) continue; // a meta TOTAL não entra na soma das carteiras
      somas[meta.mes - 1] += meta.valor;
    }
    return somas;
  }, [metas]);

  const isLoading = carregandoCarteiras || carregandoMetas;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Target className="w-4 h-4" aria-hidden="true" /> Metas
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Uma linha por carteira, mais o total da empresa. {!podeDefinir && 'Somente leitura — falta a permissão "metas.definir".'}
          </p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANOS_DISPONIVEIS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {podeGerirCarteiras && <QuemRespondePorCarteira carteiras={carteiras} />}

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
                <tr key={linha.id ?? 'total'} className={linha.id === null ? 'bg-secondary/40 font-medium' : undefined}>
                  <td className="py-1.5 px-3 sticky left-0 bg-inherit">{linha.nome}</td>
                  {MESES.map((_, i) => {
                    const mes = i + 1;
                    const existente = mapa.get(chave(mes, linha.id));
                    return (
                      <td key={mes} className="py-1 px-1">
                        <CelulaMeta
                          valorInicial={existente?.valor ?? null}
                          somaDasCarteiras={linha.id === null ? totalPorMes[i] : undefined}
                          podeEditar={podeDefinir}
                          onSalvar={(valor) => salvar.mutate({
                            id: existente?.id, ano, mes, carteiraId: linha.id, valor,
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

      {/* O simulador (§15) vive abaixo da grade — é onde o diretor já está
          quando pensa em meta. Ver src/pages/diretoria/SimuladorMetas.tsx. */}
      <SimuladorMetas ano={ano} />
    </div>
  );
}

/**
 * "Quem responde por cada carteira" (L6d lacuna 1) — sem isto, o aviso pelo
 * sino nunca dispara: `notify_on_meta_definida` só acha gente para avisar
 * se houver linha em `com_carteira_membros`, e antes desta seção nenhuma
 * tela escrevia lá. O seletor já exclui quem já responde por outra carteira
 * (uma pessoa, uma carteira — `unique` no banco); se a corrida acontecer
 * mesmo assim, `useAdicionarMembroCarteira` traduz o 23505 do Postgres.
 */
function QuemRespondePorCarteira({ carteiras }: { carteiras: Carteira[] }) {
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
          {carteiras.map((c) => {
            const daCarteira = membros.filter((m) => m.carteira_id === c.id);
            return (
              <div key={c.id} className="rounded-md border border-border p-2.5 space-y-2">
                <p className="text-[12px] font-medium">{c.nome}</p>
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
                          aria-label={`Tirar ${m.nome} da carteira ${c.nome}`}
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
                    value={pessoaEscolhida[c.id] ?? ''}
                    onValueChange={(v) => setPessoaEscolhida((s) => ({ ...s, [c.id]: v }))}
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
                    disabled={!pessoaEscolhida[c.id] || adicionar.isPending}
                    onClick={() => {
                      const userId = pessoaEscolhida[c.id];
                      if (!userId) return;
                      adicionar.mutate({ carteiraId: c.id, userId }, {
                        onSuccess: () => setPessoaEscolhida((s) => ({ ...s, [c.id]: '' })),
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

  // Achado 7 da correção da auditoria: sem isto, trocar de ano com o React
  // Query já em cache não remonta o input (mesma posição na grade) e a
  // célula ficava mostrando o valor do ano anterior até o próximo blur.
  // `useEffect` sincroniza o texto sempre que o valor de fora muda.
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
