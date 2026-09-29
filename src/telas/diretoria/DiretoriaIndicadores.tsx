// Visão "Indicadores dos setores" da Diretoria (LEVA O, parte 4).
//
// Decisão do dono (2026-09-28): "Todos, só em totais". Um bloco por setor, com os
// números que a tela do próprio setor já mostra, no mês escolhido. Financeiro e RH
// chegam pela função `dir_indicadores_dos_setores`, que só devolve agregado — quem tem
// só o módulo Diretoria continua sem ler as contas e a folha linha a linha.
//
// O Comercial não passa pela função: ele já tem `com_resumo_da_carteira`, aberto à
// Diretoria, e o total da equipe sai de `totalDaEquipe` — a mesma conta da linha TOTAL
// EQUIPE em Comercial › Indicadores. Uma verdade só.
//
// Chamados por setor não se repetem aqui: estão no Resumo, com o seletor de período.
import { Gauge } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { SeletorCompetencia } from '@/components/comercial/SeletorCompetencia';
import { useQueryState } from '@/hooks/useQueryState';
import { useIndicadoresDosSetores, type IndicadorDeSetor } from '@/hooks/useDiretoria';
import { useResumoDaCarteira } from '@/hooks/useComercialLancamentos';
import { competenciaAtual, lerCompetencia } from '@/lib/competencia-comercial';
import { totalDaEquipe } from '@/lib/resumo-equipe';
import { formatBRL } from '@/types/financeiro';
import { IndicadoresDaConferencia } from '@/components/financeiro/IndicadoresDaConferencia';

const SETORES: { setor: IndicadorDeSetor['setor']; titulo: string }[] = [
  { setor: 'financeiro', titulo: 'Financeiro' },
  { setor: 'rh', titulo: 'RH' },
  { setor: 'compras', titulo: 'Compras' },
  { setor: 'sac', titulo: 'SAC' },
  { setor: 'marketing', titulo: 'Marketing' },
];

function formatar(i: IndicadorDeSetor): string {
  if (i.valor === null) return '—';
  switch (i.formato) {
    case 'moeda': return formatBRL(i.valor);
    case 'percentual': return `${i.valor}%`;
    case 'horas': return `${i.valor}h`;
    default: return String(i.valor);
  }
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
      {children}
    </Card>
  );
}

export default function DiretoriaIndicadores() {
  const [bruta, setCompetencia] = useQueryState('competencia', competenciaAtual());
  const competencia = lerCompetencia(bruta) ?? competenciaAtual();
  const { data: indicadores = [], isLoading } = useIndicadoresDosSetores(competencia);
  const { data: resumo = [], isLoading: carregandoComercial } = useResumoDaCarteira(competencia);
  const equipe = totalDaEquipe(resumo);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Gauge}
        title="Indicadores dos setores"
        description="Os totais do mês de cada setor. Só totais: o detalhe de cada conta ou pessoa fica na tela do setor."
      />
      <div className="p-4 sm:p-6 space-y-4">
        <SeletorCompetencia competencia={competencia} onChange={setCompetencia} />
        <p className="text-[12px] text-muted-foreground">
          Os números marcados "(hoje)" são uma fotografia do agora e não mudam com o mês escolhido.
        </p>

        <Bloco titulo="Comercial">
          {carregandoComercial ? <Skeleton className="h-20" /> : (
            <KPIGrid lgCols={4}>
              <KPICard value={formatBRL(equipe.valor_vendido)} label="Venda lançada no mês" color="green" />
              <KPICard value={equipe.compradores} label="Clientes que compraram" color="blue" />
              <KPICard value={equipe.relacionados} label="Clientes contatados" color="purple" />
              <KPICard value={`${equipe.ativos} de ${equipe.total_carteira}`} label="Clientes ativos nas carteiras" color="grey" />
            </KPIGrid>
          )}
        </Bloco>

        {/* A conferência de pedidos Comercial × Financeiro (LEVA S): o 18.4 do dono, só os totais.
            Tem o próprio período, porque mede os checklists enviados entre duas datas. */}
        <Bloco titulo="Conferência de pedidos (Comercial × Financeiro)">
          <IndicadoresDaConferencia resumido />
        </Bloco>

        {SETORES.map(({ setor, titulo }) => (
          <Bloco key={setor} titulo={titulo}>
            {isLoading ? <Skeleton className="h-20" /> : (
              <KPIGrid lgCols={5}>
                {indicadores
                  .filter((i) => i.setor === setor)
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((i) => <KPICard key={i.indicador} value={formatar(i)} label={i.rotulo} color="blue" />)}
              </KPIGrid>
            )}
          </Bloco>
        ))}
      </div>
    </div>
  );
}
