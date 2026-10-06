// Comercial › Insights › Diretrizes (decisão do dono, 2026-10-04): quem atingiu uma diretriz
// comercial e ainda não recebeu o benefício ("a conceder"), quem está perto (75% do mínimo ou mais)
// e o que já foi concedido — com quando, quem e o pedido.
//
// A diretriz é mensal: o período vale pelos MESES INTEIROS que toca, e a tela diz quais. A conta
// mora no banco (`com_diretrizes_apuracao`); aqui só se separa em listas e se soma o topo.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { SeletorPeriodoDaCompetencia } from '@/components/comercial/SeletorPeriodoDaCompetencia';
import { TabelaDeDiretrizes, type ListaDeDiretriz } from '@/components/comercial/DiretrizesApuradas';
import { usePeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { useApuracaoDiretrizes } from '@/hooks/useComercialDiretrizes';
import { mesDaCompetencia } from '@/lib/lancado-x-faturado';
import { avisoDeMesesInteiros } from '@/lib/period';
import { separarApuracao } from '@/lib/diretrizes-comerciais';
import { formatBRL } from '@/types/financeiro';

export default function ComercialDiretrizes() {
  const recorteDaTela = usePeriodoDaCompetencia();
  const { competencia, intervalo } = recorteDaTela;
  const { de, ate } = intervalo ?? mesDaCompetencia(competencia);
  const aviso = avisoDeMesesInteiros('As diretrizes são apuradas por mês', intervalo);
  const { data, isLoading, isError } = useApuracaoDiretrizes(de, ate);
  const [lista, setLista] = useState<ListaDeDiretriz>('a_conceder');

  const { aConceder, perto, concedidos, valorAConceder, valorConcedido } = separarApuracao(data?.linhas ?? []);
  const linhas = { a_conceder: aConceder, perto, concedidos }[lista];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Diretrizes</h1>
          <p className="text-[14px] text-muted-foreground">
            Quem atingiu uma diretriz comercial no mês e ainda não recebeu o benefício, quem está perto e o que já foi concedido.
          </p>
        </div>
        <TutorialDoRelatorio id="comercial-diretrizes" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SeletorPeriodoDaCompetencia {...recorteDaTela} />
      </div>
      {aviso && <p className="text-[13px] text-muted-foreground">{aviso}</p>}

      {isError && (
        <div className="rounded-lg border border-border badge-danger p-3 text-[14px]">
          <strong>Não consegui carregar as diretrizes.</strong> Recarregue a página — o que aparece abaixo não é "ninguém atingiu".
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi titulo="A conceder" valor={String(aConceder.length)} detalhe={`${formatBRL(valorAConceder)} em cashback`} />
        <Kpi titulo="Concedidos no período" valor={String(concedidos.length)} detalhe={`${formatBRL(valorConcedido)} em cashback`} />
        <Kpi titulo="Perto de atingir" valor={String(perto.length)} detalhe="75% do mínimo ou mais" />
      </div>

      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant={lista === 'a_conceder' ? 'secondary' : 'ghost'} onClick={() => setLista('a_conceder')}>
          A conceder ({aConceder.length})
        </Button>
        <Button size="sm" variant={lista === 'perto' ? 'secondary' : 'ghost'} onClick={() => setLista('perto')}>
          Perto de atingir ({perto.length})
        </Button>
        <Button size="sm" variant={lista === 'concedidos' ? 'secondary' : 'ghost'} onClick={() => setLista('concedidos')}>
          Concedidos ({concedidos.length})
        </Button>
      </div>

      {data?.cortou && (
        <p className="text-[13px] text-muted-foreground">Mostrando as primeiras {data.linhas.length} linhas — escolha um período menor.</p>
      )}

      {isLoading ? <Skeleton className="h-64 w-full" /> : <TabelaDeDiretrizes linhas={linhas} lista={lista} />}

      <p className="text-[13px] text-muted-foreground">
        As regras ficam em{' '}
        <Link to="/comercial/configuracoes" className="text-primary underline underline-offset-2">Comercial → Configurações → Diretrizes</Link>.
      </p>
    </div>
  );
}

function Kpi({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[12px] text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-xl font-semibold font-mono">{valor}</div>
      <div className="text-[12px] text-muted-foreground">{detalhe}</div>
    </div>
  );
}
