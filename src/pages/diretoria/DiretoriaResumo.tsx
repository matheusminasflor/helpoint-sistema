// Visão "Resumo" da Diretoria (Frente 3, item 4.1 do plano) — abertura do
// painel do diretor. Só os cinco indicadores do ano (§15) e o gráfico meta
// × realizado, nada mais: é recorte do que já existia numa aba só ("Meta ×
// realizado") que empilhava isto, mais duas tabelas por carteira e o
// simulador — as tabelas foram para a visão "Carteiras".
//
// A conta mora em `useMetaXRealizadoAno` (extraída para não duplicar entre
// esta tela e as tabelas por carteira — mesmo dado, dois recortes).
//
// ── Etapa 4 (2026-09-25) ────────────────────────────────────────────────
// O Resumo absorveu a aba "Setores" e virou o painel do diretor de verdade:
// além dos cinco indicadores e do gráfico, os OBJETIVOS DA EMPRESA e os
// CHAMADOS POR SETOR. O dono perguntou "o que o diretor faz ali?" sobre
// Setores — a resposta é esta: ele vê, sem procurar, o que está atrasado.
//
// Simplificado mostra os dois como FAROL (uma linha por item, só o que pede
// ação hoje); analítico traz a tabela completa de chamados, com o seletor de
// período, e os objetivos em cartão. Nada da aba antiga foi apagado.
import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { useMetaXRealizadoAno } from '@/hooks/useDiretoriaMetaXRealizado';
import { formatBRL } from '@/types/financeiro';
import type { PeriodoDiretoria } from '@/hooks/useDiretoria';
import {
  CartoesObjetivos, FarolChamadosPorSetor, FarolObjetivos, TabelaChamadosPorSetor,
} from './ObjetivosEChamados';

export default function DiretoriaResumo() {
  const [visao, setVisao] = useVisaoRelatorio('diretoria-resumo');
  const [periodo, setPeriodo] = useState<PeriodoDiretoria>('30d');
  const {
    ano, setAno, anosDisponiveis, isLoading, dadosGrafico,
    realizadoDoPeriodo, metaDoPeriodo, metaDoAno, mesmoPeriodoAnoAnterior, fechamentoAnoAnterior,
  } = useMetaXRealizadoAno();

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={BarChart3}
        title="Resumo"
        description="O ano até aqui, os objetivos da empresa e quais setores estão atrasados."
      />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        <div className="flex items-center justify-end gap-2">
          <SeletorVisao visao={visao} onChange={setVisao} />
          {/* Não há seletor de filial de propósito — a meta é consolidada
              (confirmado com o dono, 2026-09-22): filtrar o realizado por
              INBRAS ou MF contra uma meta que vale pelas duas faria a
              cobertura mentir. Ver docs/nao-funciona.md. */}
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? <Skeleton className="h-72 w-full" /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Indicador titulo="Realizado no período" valor={realizadoDoPeriodo} />
              <Indicador titulo="Meta do período" valor={metaDoPeriodo} />
              <Indicador titulo="Meta do ano" valor={metaDoAno} />
              <Indicador titulo={`Mesmo período em ${ano - 1}`} valor={mesmoPeriodoAnoAnterior} />
              <Indicador titulo={`Fechamento de ${ano - 1}`} valor={fechamentoAnoAnterior} />
            </div>

            <div className="rounded-lg border border-border p-3">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dadosGrafico} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => formatBRL(v)} width={70} />
                  <Tooltip formatter={(v: number | null) => (v == null ? 'sem dado' : formatBRL(v))} />
                  <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                    {dadosGrafico.map((d) => (
                      <Cell key={d.mes} fill={d.bate == null ? 'hsl(var(--muted-foreground))' : d.bate ? 'hsl(var(--status-success))' : 'hsl(var(--status-danger))'} />
                    ))}
                  </Bar>
                  <Line dataKey="meta" name="Meta" stroke="hsl(var(--foreground))" strokeDasharray="5 5" dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* O conteúdo da antiga aba "Setores". Fica FORA do `isLoading` do
            meta × realizado de propósito: são outras consultas (`goals` e
            `tickets`), e esperar o carregamento das metas para mostrar quais
            chamados estão atrasados atrasaria justamente o número que pede
            ação hoje. */}
        {visao === 'simplificado' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <FarolObjetivos />
            <FarolChamadosPorSetor />
          </div>
        ) : (
          <>
            <CartoesObjetivos />
            <TabelaChamadosPorSetor periodo={periodo} onPeriodoChange={setPeriodo} />
          </>
        )}
      </div>
    </div>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">
        {valor == null ? <span className="text-muted-foreground font-normal">sem dado</span> : formatBRL(valor)}
      </p>
    </div>
  );
}
