// A visão "Clientes" do Insights do Comercial (L6b): clientes a trabalhar —
// quem comprou e parou. Ver `.scratch/plano-l6b-curva-e-condicao.md` §2.4.
//
// "Nunca comprou" é da L6c; esta leva só cobre quem comprou em pelo menos
// 2 dos 3 meses anteriores ao último mês com movimento e não comprou nele.
import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAnosComVenda, useClientesATrabalhar } from '@/hooks/useComercialPainel';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

const ANO_ATUAL = new Date().getFullYear();

export default function ComercialClientes() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [filial, setFilial] = useState<Filial | null>(null);

  const { data: anosComVenda } = useAnosComVenda();
  const anos = anosComVenda && anosComVenda.length > 0 ? anosComVenda : [ANO_ATUAL];
  useEffect(() => {
    if (anosComVenda && anosComVenda.length > 0 && !anosComVenda.includes(ano)) {
      setAno(anosComVenda[0]);
    }
  }, [anosComVenda, ano]);

  const { data, isLoading } = useClientesATrabalhar(ano, filial);
  const linhas = data?.linhas ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        <p className="text-[13px] text-muted-foreground">Clientes a trabalhar: compraram nos meses anteriores e pararam no mais recente.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filial ?? 'todas'} onValueChange={(v) => setFilial(v === 'todas' ? null : (v as Filial))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Filial" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">As duas filiais</SelectItem>
            <SelectItem value="MF">MF</SelectItem>
            <SelectItem value="INBRAS">INBRAS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" aria-hidden="true" />
          Clientes a trabalhar em {ano}
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold">Última compra</th>
              <th className="px-3 py-1.5 font-semibold text-right">Valor nos últimos 3 meses</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">{c.nome}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{c.tabela_preco ?? '—'}</td>
                <td className="px-3 py-1.5">{formatDateBR(c.ultima_compra)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.valor_ultimos_3m)}</td>
              </tr>
            ))}
            {!isLoading && linhas.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente parou de comprar em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {data?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial para ver o restante.
          </p>
        )}
      </div>
    </div>
  );
}
