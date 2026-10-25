// Previsão de caixa semanal (etapa 5; `rel_previsao_de_caixa`): quanto vai faltar ou sobrar nas próximas semanas — o
// saldo de hoje, que o Financeiro informa aqui (não há extrato no sistema), mais o que entra e menos o que sai em
// aberto, com o vencido pesando na primeira semana. Para o Financeiro.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFuncaoDoRelatorio, type SemanaDoCaixa } from '@/hooks/useRelatorios';
import { projetarCaixa } from '@/lib/relatorios-novos';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { parseAmount } from '@/lib/planilha';
import { dataHora } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const SEMANAS = 8;

export default function PrevisaoDeCaixa() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const semanas = useFuncaoDoRelatorio<SemanaDoCaixa>('rel_previsao_de_caixa', { p_semanas: SEMANAS });
  const saldo = useQuery({
    queryKey: ['fin-saldo-informado', tenantId],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.from('fin_saldo_informado' as never).select('valor, informado_em').maybeSingle()) as unknown as
      { valor: number; informado_em: string } | null,
  });
  const [novo, setNovo] = useState('');
  const [gravando, setGravando] = useState(false);
  const informar = async () => {
    const valor = parseAmount(novo);
    if (valor == null) { toast.error('Escreva o saldo em reais.'); return; }
    setGravando(true);
    try {
      unwrap(await supabase.rpc('fin_informar_saldo' as never, { p_valor: valor } as never));
      setNovo('');
      void qc.invalidateQueries({ queryKey: ['fin-saldo-informado'] });
      toast.success('Saldo informado.');
    } catch (e) {
      toast.error('Não gravou o saldo', { description: mensagemDeErro(e) });
    } finally {
      setGravando(false);
    }
  };

  const saldoAtual = saldo.data ? Number(saldo.data.valor) : null;
  const linhas = projetarCaixa(saldoAtual, semanas.data ?? []);
  const pior = linhas.reduce<(typeof linhas)[number] | null>((p, l) => (!p || l.saldo < p.saldo ? l : p), null);
  const vencidoAPagar = Number(linhas[0]?.sai_vencido ?? 0);
  const colunas: ColunaDoRelatorio<(typeof linhas)[number]>[] = [
    { chave: 'semana', rotulo: 'Semana', valor: (l) => l.semana, mostrar: (l) => `${dia(l.semana)} a ${dia(addDias(l.semana, 6))}` },
    { chave: 'entra', rotulo: 'Entra', valor: (l) => Number(l.entra) + Number(l.entra_vencido),
      mostrar: (l) => <>{formatBRL(Number(l.entra) + Number(l.entra_vencido))}{Number(l.entra_vencido) ? <span className="block text-[12px] text-muted-foreground">com {formatBRL(Number(l.entra_vencido))} vencido</span> : null}</>, direita: true },
    { chave: 'sai', rotulo: 'Sai', valor: (l) => Number(l.sai) + Number(l.sai_vencido),
      mostrar: (l) => <>{formatBRL(Number(l.sai) + Number(l.sai_vencido))}{Number(l.sai_vencido) ? <span className="block text-[12px] text-status-danger">com {formatBRL(Number(l.sai_vencido))} vencido</span> : null}</>, direita: true },
    { chave: 'saldo', rotulo: 'Saldo no fim da semana', valor: (l) => l.saldo,
      mostrar: (l) => <b className={l.saldo < 0 ? 'text-status-danger' : undefined}>{formatBRL(l.saldo)}</b>, direita: true },
  ];
  return (
    <ModeloDeRelatorio titulo="Previsão de caixa" icone={Landmark} arquivo="previsao-de-caixa"
      descricao="Quanto vai faltar ou sobrar nas próximas semanas: o saldo de hoje, mais o que entra e menos o que sai em aberto. O vencido pesa na primeira semana."
      linhas={linhas} colunas={colunas} chave={(l) => l.semana} carregando={semanas.isLoading || saldo.isLoading} erro={semanas.error}
      vazio="Nada em aberto nas próximas semanas."
      acima={(
        <section className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Saldo informado</p>
            <p className="text-[20px] font-semibold tabular-nums">{saldoAtual == null ? 'não informado' : formatBRL(saldoAtual)}</p>
            {saldo.data && <p className="text-[12px] text-muted-foreground">em {dataHora(saldo.data.informado_em)}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="saldo-hoje">Saldo em conta hoje (R$)</Label>
            <Input id="saldo-hoje" inputMode="decimal" className="w-40 tabular-nums" value={novo} onChange={(e) => setNovo(e.target.value)} />
          </div>
          <Button disabled={!novo.trim() || gravando} onClick={informar}>{gravando ? 'Gravando…' : 'Informar'}</Button>
          {saldoAtual == null && <p className="text-[13px] text-muted-foreground w-full">Sem o saldo, a previsão parte do zero: ela mostra só o que entra e sai.</p>}
        </section>
      )}
      resumo={[
        { rotulo: 'Menor saldo previsto', valor: pior?.saldo ?? null, formatar: formatBRL, ruim: !!pior && pior.saldo < 0,
          nota: pior ? `na semana de ${dia(pior.semana)}` : undefined },
        { rotulo: 'Vencido a pagar', valor: vencidoAPagar, formatar: formatBRL, ruim: vencidoAPagar > 0 },
        { rotulo: `Saldo daqui a ${SEMANAS} semanas`, valor: linhas.at(-1)?.saldo ?? null, formatar: formatBRL, ruim: (linhas.at(-1)?.saldo ?? 0) < 0 },
      ]} />
  );
}

function addDias(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(a, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
