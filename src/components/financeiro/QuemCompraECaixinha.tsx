// Configurações de Compras › Quem compra e Caixinha (dono, 2026-10-14). "Quem faz as compras" recebe toda compra
// aprovada (fora da Caixinha) — "e quando tiver outra pessoa que faz as compras, ser essa pessoa". Cada Caixinha
// (INBRAS e MF, 2026-10-20) tem um responsável, trocável aqui ("hoje é o Rondinelly, amanhã pode ser outro"): ele
// decide e compra os pedidos dela, lança os gastos e vê só a dela; o valor semanal só sugere a entrada do repasse.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCaixinhas, useComprasConfig, useSalvarComprasConfig, type Caixinha, type ComprasConfig } from '@/hooks/useCaixinha';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';

/** Dia do mês de 1 a 28 (o banco recusa o resto: fevereiro não tem 29). */
const dia = (v: string): number | null => {
  const n = Number(v.replace(/\D/g, ''));
  return v.trim() === '' || !n ? null : Math.min(28, n);
};

export function QuemCompraECaixinha({ podeEditar = true }: { podeEditar?: boolean }) {
  const { data: config, isLoading } = useComprasConfig();
  const { data: caixinhasSalvas, isLoading: carregandoCaixinhas } = useCaixinhas();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const salvar = useSalvarComprasConfig();
  const [form, setForm] = useState<ComprasConfig>({
    comprador_id: null, cartao_fecha_dia: null, cartao_vence_dia: null, cartao_mf_fecha_dia: null, cartao_mf_vence_dia: null,
  });
  const [caixinhas, setCaixinhas] = useState<Caixinha[]>([]);
  useEffect(() => { if (config) setForm(config); }, [config]);
  useEffect(() => { if (caixinhasSalvas) setCaixinhas(caixinhasSalvas); }, [caixinhasSalvas]);

  if (isLoading || carregandoCaixinhas) return <Skeleton className="h-48 w-full" />;

  const pessoa = (id: string | null, onChange: (v: string | null) => void, idDoCampo: string) => (
    <select id={idDoCampo} value={id ?? ''} disabled={!podeEditar} onChange={(e) => onChange(e.target.value || null)}
      className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-2 text-sm">
      <option value="">Ninguém</option>
      {[...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </select>
  );
  const mudaCaixinha = (id: string, campo: Partial<Caixinha>) =>
    setCaixinhas((cs) => cs.map((c) => (c.id === id ? { ...c, ...campo } : c)));
  const valoresValidos = caixinhas.every((c) => c.valor_semanal == null || c.valor_semanal >= 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem compra e Caixinha</CardTitle>
        <CardDescription>Quem recebe as compras aprovadas, e quem cuida de cada Caixinha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="comprador">Quem faz as compras</Label>
          {pessoa(form.comprador_id, (v) => setForm({ ...form, comprador_id: v }), 'comprador')}
          <p className="text-xs text-muted-foreground">Toda compra aprovada (fora da Caixinha) fica no nome desta pessoa, que recebe o aviso para comprar.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Caixinhas</p>
          {caixinhas.map((c) => (
            <div key={c.id} className="flex flex-wrap items-end gap-3">
              <span className="w-16 pb-2 text-sm font-medium">{c.filial}</span>
              <div className="space-y-1 min-w-[220px] flex-1 max-w-sm">
                <Label htmlFor={`cx-resp-${c.filial}`}>Responsável</Label>
                {pessoa(c.responsavel_id, (v) => mudaCaixinha(c.id, { responsavel_id: v }), `cx-resp-${c.filial}`)}
              </div>
              <div className="space-y-1">
                <Label htmlFor={`cx-valor-${c.filial}`}>Valor semanal (R$)</Label>
                <Input id={`cx-valor-${c.filial}`} inputMode="decimal" className="w-32 font-mono" disabled={!podeEditar}
                  value={c.valor_semanal ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(',', '.');
                    mudaCaixinha(c.id, { valor_semanal: v === '' ? null : Number(v) });
                  }} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            O responsável decide e compra os pedidos da categoria Caixinha daquela filial, lança entradas e gastos com o recibo e
            vê só a Caixinha dele (no menu Início › Caixinha). Quem tem a seção Caixinha do Financeiro vê e confere as duas. O
            valor semanal vem preenchido ao registrar a entrada (dá para mudar).
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Cartões de crédito da empresa (um por filial)</p>
          {([['INBRAS', 'cartao_fecha_dia', 'cartao_vence_dia'], ['MF', 'cartao_mf_fecha_dia', 'cartao_mf_vence_dia']] as const)
            .map(([filial, fecha, vence]) => (
              <div key={filial} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-16 font-medium">{filial}</span>
                <Label htmlFor={`cartao-fecha-${filial}`}>a fatura fecha no dia</Label>
                <Input id={`cartao-fecha-${filial}`} inputMode="numeric" className="h-9 w-16 font-mono" disabled={!podeEditar}
                  value={form[fecha] ?? ''} onChange={(e) => setForm({ ...form, [fecha]: dia(e.target.value) })} />
                <Label htmlFor={`cartao-vence-${filial}`}>e vence no dia</Label>
                <Input id={`cartao-vence-${filial}`} inputMode="numeric" className="h-9 w-16 font-mono" disabled={!podeEditar}
                  value={form[vence] ?? ''} onChange={(e) => setForm({ ...form, [vence]: dia(e.target.value) })} />
              </div>
            ))}
          <p className="text-xs text-muted-foreground">
            Compra no cartão vira conta no dia em que a fatura vence (uma por parcela), em aberto até o Financeiro dar baixa na
            fatura. Comprou antes do fechamento: entra na fatura deste mês; no dia do fechamento ou depois, na do mês seguinte.
            Cada compra usa o cartão da filial dela. Dias de 1 a 28. MF em branco: usa os dias da INBRAS; os dois em branco: a
            conta vence no dia da compra.
          </p>
        </div>
        {podeEditar && (
          <Button disabled={salvar.isPending || !valoresValidos} onClick={() => salvar.mutate({ config: form, caixinhas })}>
            Salvar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
