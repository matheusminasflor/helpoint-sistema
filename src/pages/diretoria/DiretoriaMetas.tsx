// Aba "Metas" do Painel Diretor (L6d) — grade de 12 meses × carteiras,
// editável, com o total da empresa. Ver
// .scratch/plano-l6d-metas-e-carteiras.md §3.1 e
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15.
//
// "As metas nascem vazias e o diretor as preenche" — não há JSON para ler
// aqui: cada célula é gravada de verdade em `com_metas`, uma a uma.
import { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useCarteiras, useMetasDoAno, useSalvarMeta } from '@/hooks/useComercialCarteirasMetas';
import { formatBRL } from '@/types/financeiro';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ANO_ATUAL = new Date().getFullYear();
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL + 1 - i); // ano seguinte até 5 anos atrás

/** Chave do mapa de metas: carteira real usa o id; a meta total usa 'total'. */
function chave(mes: number, carteiraId: string | null): string {
  return `${mes}-${carteiraId ?? 'total'}`;
}

export default function DiretoriaMetas() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinir = canComoOBanco('metas', 'definir');

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
