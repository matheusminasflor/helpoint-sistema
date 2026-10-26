// Estoque, pedidos de arte e Benefício de sexta nos Indicadores do Marketing (rodada 2, R6). Lê com os mesmos ganchos
// das telas de cada um; a conta é `indicadoresDoMarketing`. Cada bloco leva à sua tela.
import { Link } from 'react-router-dom';
import { Boxes, Gift, Palette } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useMovimentosMkt, useProdutosMkt } from '@/hooks/useEstoqueMkt';
import { useSolicitacoesDoSetor } from '@/hooks/useSolicitacoes';
import { useRetiradas } from '@/hooks/useBeneficioDeSexta';
import { useTenantPath } from '@/hooks/useTenantPath';
import { indicadoresDoMarketing } from '@/lib/indicadores-do-marketing';
import { todayISO } from '@/lib/dates';

function Numero({ n, rotulo, ruim }: { n: number; rotulo: string; ruim?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className={`text-2xl font-bold font-mono ${ruim && n > 0 ? 'text-status-danger' : 'text-foreground'}`}>{n}</div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
    </div>
  );
}

export function OutrosIndicadoresDoMarketing({ de, ate }: { de: string; ate: string }) {
  const tenantPath = useTenantPath();
  const { data: produtos = [] } = useProdutosMkt();
  const { data: movimentos = [] } = useMovimentosMkt();
  const { data: pedidos = [] } = useSolicitacoesDoSetor('marketing');
  const { data: retiradas = [] } = useRetiradas();
  const r = indicadoresDoMarketing({ produtos, movimentos, pedidos: pedidos.filter((p) => p.tipo === 'arte'), retiradas, de, ate, hoje: todayISO() });
  const titulo = (Icone: typeof Boxes, texto: string, para: string) => (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Icone className="h-4 w-4 text-primary" aria-hidden="true" /> {texto}</h3>
      <Link to={tenantPath(para)} className="text-xs text-primary hover:underline">Abrir →</Link>
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5">
        {titulo(Palette, 'Pedidos de arte', '/mkt/pedidos-de-arte')}
        <div className="grid grid-cols-2 gap-3">
          <Numero n={r.pedidosNoPeriodo} rotulo="Pedidos no período" />
          <Numero n={r.entreguesNoPeriodo} rotulo="Entregues (do período)" />
          <Numero n={r.abertos} rotulo="Abertos agora" />
          <Numero n={r.atrasados} rotulo="Passaram do prazo" ruim />
        </div>
      </Card>
      <Card className="p-5">
        {titulo(Boxes, 'Estoque do Marketing', '/mkt/estoque')}
        {r.abaixoDoMinimo.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum produto abaixo do mínimo.</p> : (
          <ul className="text-sm divide-y divide-border">
            {r.abaixoDoMinimo.slice(0, 6).map((p) => (
              <li key={p.nome} className="py-1.5 flex gap-3">
                <span className="flex-1 min-w-0 truncate">{p.nome}</span>
                <span className="tabular-nums text-status-danger">{p.saldo} / {p.minimo} {p.unidade}</span>
              </li>
            ))}
          </ul>
        )}
        {r.abaixoDoMinimo.length > 6 && <p className="text-xs text-muted-foreground mt-1">e mais {r.abaixoDoMinimo.length - 6}.</p>}
      </Card>
      <Card className="p-5">
        {titulo(Gift, 'Benefício de sexta', '/mkt/beneficio')}
        <div className="grid grid-cols-2 gap-3">
          <Numero n={r.retiradasNoPeriodo} rotulo="Retiradas no período" />
          <Numero n={r.devolvidasComAtraso} rotulo="Voltaram com atraso" ruim />
          <Numero n={r.foraDoPrazoAgora} rotulo="Fora do prazo agora" ruim />
        </div>
      </Card>
    </div>
  );
}
