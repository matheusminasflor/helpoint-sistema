// TI › Indicadores › Analítico › Equipe por semana (rodada 2, 2026-11-02): cada pessoa nas últimas 8 semanas confirmadas
// do FSENSE até o fim do período da tela — o detalhe por trás da média da Visão Geral. Cada célula é o % de trabalho,
// com a cor da meta; passar o mouse mostra o ocioso e as horas.
import { CalendarRange } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { metaEmVigor } from '@/config/metas-da-ti';
import { useMetasDosSetores } from '@/hooks/useDiretoria';
import { useFsense, type LinhaFsenseDoBanco } from '@/hooks/useEquipeDaTI';
import { diaCurto } from '@/lib/dates';
import { farol, piorFarol, somarDias, type Farol } from '@/lib/ti-equipe';
import { cn } from '@/lib/utils';

const CLASSE: Record<Farol, string> = {
  no_alvo: 'badge-success', atencao: 'badge-warning', fora: 'badge-danger', sem_meta: '', sem_dado: '',
};
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function EquipePorSemana({ ate }: { ate: string }) {
  const fsense = useFsense({ de: somarDias(ate, -7 * 8 + 1), ate: somarDias(ate, 1) });
  const metas = useMetasDosSetores();
  const metaTrabalho = metaEmVigor(metas.data, 'fsense_trabalho');
  const metaOcioso = metaEmVigor(metas.data, 'fsense_ocioso');

  const confirmadas = (fsense.data ?? []).filter((l) => l.confirmado_em);
  const semanas = [...new Set(confirmadas.map((l) => l.data))].sort().slice(-8);
  const porPessoa = new Map<string, { nome: string; linhas: Map<string, LinhaFsenseDoBanco> }>();
  for (const l of confirmadas) {
    const k = l.colaborador.trim().toLowerCase();
    const p = porPessoa.get(k) ?? { nome: l.colaborador.trim(), linhas: new Map() };
    p.linhas.set(l.data, l);
    porPessoa.set(k, p);
  }
  const pessoas = [...porPessoa.values()].sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <Card id="analitico-equipe" className="p-5 space-y-3 scroll-mt-20">
      <h3 className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-primary" />Equipe por semana (FSENSE)
        <span className="text-xs font-normal text-muted-foreground">· % de trabalho de cada pessoa nas últimas 8 semanas confirmadas; a cor olha trabalho e ocioso</span>
      </h3>
      {pessoas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma semana confirmada nessas 8 semanas.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Colaborador</th>
                {semanas.map((s) => <th key={s} className="text-center py-2 px-1 font-semibold text-muted-foreground text-xs whitespace-nowrap">até {diaCurto(s)}</th>)}
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.nome} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{p.nome}</td>
                  {semanas.map((s) => {
                    const l = p.linhas.get(s);
                    if (!l || l.trabalho === null) return <td key={s} className="text-center text-muted-foreground">—</td>;
                    const f = piorFarol(farol(l.trabalho, metaTrabalho, 'mais', true), farol(l.ocioso, metaOcioso, 'menos', true));
                    return (
                      <td key={s} className="p-1 text-center">
                        <span className={cn('inline-block min-w-[56px] rounded px-1.5 py-0.5 tabular-nums font-semibold', CLASSE[f])}
                          title={`Ocioso ${l.ocioso === null ? '—' : `${num(l.ocioso)}%`} · ${num(l.horas)} h medidas`}>
                          {num(l.trabalho)}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
