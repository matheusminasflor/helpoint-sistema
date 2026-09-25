// As tabelas por carteira da Diretoria (Frente 3, item 4.3 do plano).
//
// ── Etapa 4 (2026-09-25) ────────────────────────────────────────────────
// Isto ERA a aba "Carteiras". Deixou de ser página e virou dois BLOCOS, que
// a aba "Metas e carteiras" (`DiretoriaMetas.tsx`) monta. O motivo é o que a
// auditoria mediu: o realizado por carteira × mês e a meta por carteira × mês
// já apareciam nas grades editáveis de "Metas" — a mesma matriz, dos mesmos
// hooks, em duas abas que o diretor tinha de abrir alternadamente para
// comparar.
//
// Junto saiu um defeito: esta página tinha o SEU seletor de ano e o
// `DiretoriaComparativo` embutido tinha OUTRO, com estado próprio. Dava para
// deixar um em 2026 e outro em 2025 sem perceber, e ler as duas tabelas como
// se falassem do mesmo ano. Agora o ano é um só, da página que monta tudo.
//
// Os blocos recebem os dados PRONTOS por prop em vez de chamarem
// `useMetaXRealizadoAno` por conta própria. Não é pela ida ao banco — as
// chaves do React Query são as mesmas, então a consulta seria uma só de
// qualquer jeito (a primeira versão deste comentário dizia "duas idas ao
// banco" e exagerava; achado da auditoria de 2026-09-25). É pelo ANO: um
// bloco com gancho próprio teria estado próprio, e foi exatamente assim que
// esta tela e o comparativo embutido nela podiam ficar em anos diferentes
// sem ninguém perceber.
import { CalendarRange } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { MESES } from '@/lib/comparativoAnos';
import { formatBRL } from '@/types/financeiro';
import type { useMetaXRealizadoAno } from '@/hooks/useDiretoriaMetaXRealizado';

type DadosMetaXRealizado = ReturnType<typeof useMetaXRealizadoAno>;

/** "Carteiras no ano" — realizado, meta, cobertura e peso de cada carteira. */
export function CarteirasNoAno({
  carteirasNoAno, isLoading,
}: { carteirasNoAno: DadosMetaXRealizado['carteirasNoAno']; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <div>
      <h2 className="text-[13px] font-semibold text-foreground mb-2">Carteiras no ano</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="py-2 px-3 font-medium">Carteira</th>
              <th className="py-2 px-3 font-medium text-right">Realizado</th>
              <th className="py-2 px-3 font-medium text-right">Meta</th>
              <th className="py-2 px-3 font-medium text-right">Cobertura</th>
              <th className="py-2 px-3 font-medium text-right">Peso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {carteirasNoAno.map((c) => (
              <tr key={c.nome}>
                <td className="py-1.5 px-3">{c.nome}</td>
                <td className="py-1.5 px-3 text-right font-mono">{c.realizado != null ? formatBRL(c.realizado) : '—'}</td>
                <td className="py-1.5 px-3 text-right font-mono">{c.meta != null ? formatBRL(c.meta) : '—'}</td>
                <td className="py-1.5 px-3 text-right">{c.cobertura != null ? `${Math.round(c.cobertura * 100)}%` : '—'}</td>
                <td className="py-1.5 px-3 text-right">{c.peso != null ? `${Math.round(c.peso * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "Carteiras mês a mês" — em cada célula: peso, meta e cobertura. */
export function CarteirasMesAMes({
  carteirasMesAMes, isLoading,
}: { carteirasMesAMes: DadosMetaXRealizado['carteirasMesAMes']; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-56 w-full" />;
  return (
    <div>
      <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
        <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" /> Carteiras mês a mês
      </h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="py-2 px-3 font-medium sticky left-0 bg-muted/40">Carteira</th>
              {MESES.map((m) => <th key={m} className="py-2 px-2 text-right font-medium min-w-[100px]">{m}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {carteirasMesAMes.map((c) => (
              <tr key={c.nome}>
                <td className="py-1.5 px-3 sticky left-0 bg-card">{c.nome}</td>
                {c.porMes.map((l, i) => (
                  <td key={i} className="py-1.5 px-2 text-right align-top">
                    <div className="font-medium">{l.peso != null ? `${Math.round(l.peso * 100)}%` : '—'}</div>
                    <div className="text-muted-foreground">{l.meta != null ? formatBRL(l.meta) : '—'}</div>
                    <div className="text-muted-foreground">{l.cobertura != null ? `${Math.round(l.cobertura * 100)}%` : '—'}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">Em cada mês: peso, meta e cobertura, nesta ordem.</p>
    </div>
  );
}
