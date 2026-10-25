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
import { useState } from 'react';
import { Gauge, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { foraDaMeta, textoDaMeta } from '@/lib/meta-do-indicador';
import { mensagemDeErro } from '@/lib/supabase-result';
import { PageHeader } from '@/components/layout/PageHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { SeletorPeriodoDaCompetencia } from '@/components/comercial/SeletorPeriodoDaCompetencia';
import { usePeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { useIndicadoresDosSetores, useMetasDosSetores, useSalvarMetaDoSetor, type IndicadorDeSetor } from '@/hooks/useDiretoria';
import { useResumoDaCarteira } from '@/hooks/useComercialLancamentos';
import { avisoDeMesesInteiros, intervaloAnterior } from '@/lib/period';
import { deslocarCompetencia } from '@/lib/competencia-comercial';
import { totalDaEquipe } from '@/lib/resumo-equipe';
import { formatBRL } from '@/types/financeiro';
import { LinhaDaConferencia } from '@/components/financeiro/LinhaDaConferencia';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { toLocalISODate } from '@/lib/dates';

const SETORES: { setor: IndicadorDeSetor['setor']; titulo: string }[] = [
  { setor: 'financeiro', titulo: 'Financeiro' },
  { setor: 'rh', titulo: 'RH' },
  { setor: 'compras', titulo: 'Compras' },
  { setor: 'sac', titulo: 'SAC' },
  { setor: 'marketing', titulo: 'Marketing' },
];

function formatarNumero(formato: IndicadorDeSetor['formato'], v: number): string {
  switch (formato) {
    case 'moeda': return formatBRL(v);
    case 'percentual': return `${Math.round(v * 10) / 10}%`;
    case 'horas': return `${Math.round(v * 10) / 10}h`;
    default: return String(Math.round(v * 10) / 10);
  }
}

function formatar(i: IndicadorDeSetor): string {
  return i.valor === null ? '—' : formatarNumero(i.formato, i.valor);
}

// Comparação e cor (etapa 4 · Diretoria, 2026-10-25): cada número contra o período anterior, vermelho só quando piorou.
// "neutro" compara sem julgar (pagar mais ou admitir mais não é bom nem ruim por si). Os "(hoje)" são fotografia do
// agora: não têm anterior; os dois de dinheiro em atraso ficam vermelhos quando não são zero.
const MELHOR_QUANDO: Record<string, 'mais' | 'menos' | 'neutro'> = {
  a_pagar: 'neutro', a_receber: 'mais', saldo_realizado: 'mais',
  admissoes: 'neutro', desligamentos: 'menos', ausencias: 'menos', folha_bruta: 'neutro',
  aprovado: 'neutro', tempo_aprovacao: 'menos',
  abertos_no_mes: 'menos', em_aberto: 'menos', taxa_resolucao: 'mais', primeira_resposta: 'menos',
  publicados: 'mais',
};
const VERMELHO_SE_NAO_ZERO = new Set(['recebiveis_vencidos', 'inadimplencia']);

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
      {children}
    </Card>
  );
}

export default function DiretoriaIndicadores() {
  // O mês de sempre, ou um período (2026-10-03): "Este trimestre", "Personalizado"… Os números
  // com data usam os dias exatos; a folha, mensal, os meses inteiros que o período toca.
  const recorteDaTela = usePeriodoDaCompetencia();
  const { competencia, intervalo } = recorteDaTela;
  const noRecorte = intervalo ? 'no período' : 'no mês';
  const aviso = avisoDeMesesInteiros('A folha é mensal', intervalo);
  const { data: indicadores = [], isLoading } = useIndicadoresDosSetores(competencia, intervalo);
  const { data: resumo = [], isLoading: carregandoComercial } = useResumoDaCarteira(competencia, intervalo);
  const equipe = totalDaEquipe(resumo);
  // O período anterior: o mês de antes, ou o intervalo do mesmo tamanho colado antes.
  const competenciaAnterior = deslocarCompetencia(competencia, -1);
  const anteriorIntervalo = intervalo ? intervaloAnterior(intervalo) : null;
  const { data: indicadoresAntes = [] } = useIndicadoresDosSetores(competenciaAnterior, anteriorIntervalo);
  const { data: resumoAntes } = useResumoDaCarteira(competenciaAnterior, anteriorIntervalo);
  const equipeAntes = resumoAntes ? totalDaEquipe(resumoAntes) : null;
  const antes = new Map(indicadoresAntes.map((i) => [`${i.setor}.${i.indicador}`, i.valor]));
  // A meta fixa de cada número (decisão do dono, 2026-10-25): vermelho é o que passou da meta.
  const { data: metas = new Map<string, number>() } = useMetasDosSetores();
  const perfil = useConfiguracaoDosSetores();
  const podeDefinirMetas = !perfil.isLoading && !perfil.isError && perfil.pode('diretoria', 'indicadores', 'definir_metas');
  const [definindo, setDefinindo] = useState(false);
  // Simplificado (2026-10-15): os três números principais de cada setor; o Analítico, todos. Cor só onde o número
  // diz bom ou ruim — contagem sem meta fica neutra (a régua da casa).
  const [visao, setVisao] = useVisaoRelatorio('diretoria-indicadores', 'simplificado');
  const analitico = visao === 'analitico';

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Gauge}
        title="Indicadores dos setores"
        description="Os totais do mês (ou do período) de cada setor. Só totais: o detalhe de cada conta ou pessoa fica na tela do setor."
        actions={(
          <div className="flex items-center gap-2">
            {podeDefinirMetas && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDefinindo(true)}>
                <Target className="w-3.5 h-3.5" aria-hidden="true" /> Metas
              </Button>
            )}
            <TutorialDoRelatorio id="diretoria-indicadores" />
          </div>
        )}
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SeletorPeriodoDaCompetencia {...recorteDaTela} />
          <SeletorVisao visao={visao} onChange={setVisao} />
        </div>
        <p className="text-[13px] text-muted-foreground">
          Cada número vem com o {intervalo ? 'período anterior, do mesmo tamanho' : 'mês anterior'} e, quando tem, com a meta;
          vermelho só quando passou da meta ou piorou.
          Os números marcados "(hoje)" são uma fotografia do agora e não mudam com o {intervalo ? 'período' : 'mês'} escolhido.
          {aviso && <> {aviso}</>}
        </p>

        <Bloco titulo="Comercial">
          {carregandoComercial ? <Skeleton className="h-20" /> : (
            <KPIGrid lgCols={4}>
              <KPICard value={formatBRL(equipe.valor_vendido)} label={`Venda ${noRecorte}`} color="grey"
                numero={equipe.valor_vendido} anterior={equipeAntes?.valor_vendido} formatarDiferenca={formatBRL} />
              <KPICard value={equipe.compradores} label="Clientes que compraram" color="grey" anterior={equipeAntes?.compradores} />
              <KPICard value={equipe.relacionados} label="Clientes contatados" color="grey" anterior={equipeAntes?.relacionados} />
              <KPICard value={`${equipe.ativos} de ${equipe.total_carteira}`} label="Clientes ativos nas carteiras" color="grey" />
            </KPIGrid>
          )}
        </Bloco>

        {/* A conferência de pedidos Comercial × Financeiro (LEVA S): completa no Financeiro; aqui, a linha do resumo
            no mesmo período da tela (dono, 2026-10-15). */}
        <LinhaDaConferencia de={intervalo?.de ?? competencia}
          ate={intervalo?.ate ?? toLocalISODate(new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0))} />

        {SETORES.map(({ setor, titulo }) => (
          <Bloco key={setor} titulo={titulo}>
            {isLoading ? <Skeleton className="h-20" /> : (
              <KPIGrid lgCols={5}>
                {indicadores
                  .filter((i) => i.setor === setor)
                  .sort((a, b) => a.ordem - b.ordem)
                  .slice(0, analitico ? undefined : 3)
                  .map((i) => {
                    const sentido = MELHOR_QUANDO[i.indicador];
                    const meta = sentido && sentido !== 'neutro' ? metas.get(`${i.setor}.${i.indicador}`) : undefined;
                    const fora = sentido && sentido !== 'neutro' && foraDaMeta(i.valor, meta, sentido);
                    return (
                    <KPICard key={i.indicador} value={formatar(i)} label={i.rotulo}
                      color={fora || (VERMELHO_SE_NAO_ZERO.has(i.indicador) && i.valor) ? 'red' : 'grey'}
                      nota={meta !== undefined && sentido && sentido !== 'neutro' ? textoDaMeta(formatarNumero(i.formato, meta), sentido) : undefined}
                      notaRuim={!!fora}
                      numero={i.valor} melhorQuando={MELHOR_QUANDO[i.indicador]}
                      anterior={MELHOR_QUANDO[i.indicador] ? antes.get(`${i.setor}.${i.indicador}`) : null}
                      formatarDiferenca={(n) => formatarNumero(i.formato, n)} />
                    );
                  })}
              </KPIGrid>
            )}
          </Bloco>
        ))}
      </div>
      <MetasDosSetores aberto={definindo} onFechar={() => setDefinindo(false)} indicadores={indicadores} metas={metas} />
    </div>
  );
}

const UNIDADE: Record<IndicadorDeSetor['formato'], string> = { moeda: 'R$', percentual: '%', horas: 'horas', numero: '' };

/** "Metas": a meta fixa de cada número que tem sentido (mais ou menos é melhor). Grava ao sair do campo; vazio apaga. */
function MetasDosSetores({ aberto, onFechar, indicadores, metas }: {
  aberto: boolean; onFechar: () => void; indicadores: IndicadorDeSetor[]; metas: Map<string, number>;
}) {
  const salvar = useSalvarMetaDoSetor();
  const comMeta = indicadores.filter((i) => MELHOR_QUANDO[i.indicador] === 'mais' || MELHOR_QUANDO[i.indicador] === 'menos');
  const gravar = (i: IndicadorDeSetor, texto: string) => {
    const atual = metas.get(`${i.setor}.${i.indicador}`);
    const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
    const meta = limpo === '' ? null : Number(limpo);
    if (meta !== null && (!Number.isFinite(meta) || meta < 0)) { toast.error('Escreva um número.'); return; }
    if (meta === (atual ?? null)) return;
    salvar.mutate({ setor: i.setor, indicador: i.indicador, meta }, {
      onSuccess: () => toast.success(meta === null ? 'Meta apagada.' : 'Meta gravada.'),
      onError: (e) => toast.error('Não gravou a meta', { description: mensagemDeErro(e) }),
    });
  };
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Metas dos setores</DialogTitle>
          <DialogDescription>
            Uma meta por número, que vale todo mês até você mudar. Onde menos é melhor, a meta é o máximo aceito; onde mais
            é melhor, o mínimo. Deixe vazio para não ter meta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {SETORES.map(({ setor, titulo }) => {
            const doSetor = comMeta.filter((i) => i.setor === setor).sort((a, b) => a.ordem - b.ordem);
            if (!doSetor.length) return null;
            return (
              <section key={setor} className="space-y-2">
                <h3 className="text-[14px] font-semibold">{titulo}</h3>
                {doSetor.map((i) => (
                  <label key={i.indicador} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="min-w-0">
                      {i.rotulo}
                      <span className="block text-[12px] text-muted-foreground">{MELHOR_QUANDO[i.indicador] === 'menos' ? 'até' : 'pelo menos'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {UNIDADE[i.formato] === 'R$' && <span className="text-[13px] text-muted-foreground">R$</span>}
                      <Input className="w-28 text-right tabular-nums" inputMode="decimal"
                        defaultValue={metas.get(`${i.setor}.${i.indicador}`)?.toString().replace('.', ',') ?? ''}
                        onBlur={(e) => gravar(i, e.target.value)} aria-label={`Meta de ${i.rotulo}`} />
                      {UNIDADE[i.formato] !== 'R$' && <span className="text-[13px] text-muted-foreground w-10">{UNIDADE[i.formato]}</span>}
                    </span>
                  </label>
                ))}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
