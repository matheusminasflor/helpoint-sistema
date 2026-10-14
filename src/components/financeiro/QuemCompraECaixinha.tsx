// Configurações de Compras › Quem compra e Caixinha (dono, 2026-10-14). "Quem faz as compras" recebe toda compra
// aprovada (fora da Caixinha) — "e quando tiver outra pessoa que faz as compras, ser essa pessoa". O aprovador da
// Caixinha decide e compra o que é da Caixinha; o valor semanal só sugere a entrada do repasse.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useComprasConfig, useSalvarComprasConfig, type ComprasConfig } from '@/hooks/useCaixinha';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';

/** Dia do mês de 1 a 28 (o banco recusa o resto: fevereiro não tem 29). */
const dia = (v: string): number | null => {
  const n = Number(v.replace(/\D/g, ''));
  return v.trim() === '' || !n ? null : Math.min(28, n);
};

export function QuemCompraECaixinha({ podeEditar = true }: { podeEditar?: boolean }) {
  const { data: config, isLoading } = useComprasConfig();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const salvar = useSalvarComprasConfig();
  const [form, setForm] = useState<ComprasConfig>({
    comprador_id: null, caixinha_aprovador_id: null, caixinha_valor_semanal: null, cartao_fecha_dia: null, cartao_vence_dia: null,
  });
  useEffect(() => { if (config) setForm(config); }, [config]);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const pessoa = (id: string | null, onChange: (v: string | null) => void, idDoCampo: string) => (
    <select id={idDoCampo} value={id ?? ''} disabled={!podeEditar} onChange={(e) => onChange(e.target.value || null)}
      className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-2 text-sm">
      <option value="">Ninguém</option>
      {[...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </select>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem compra e Caixinha</CardTitle>
        <CardDescription>Quem recebe as compras aprovadas, e quem cuida da Caixinha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="comprador">Quem faz as compras</Label>
          {pessoa(form.comprador_id, (v) => setForm({ ...form, comprador_id: v }), 'comprador')}
          <p className="text-xs text-muted-foreground">Toda compra aprovada (fora da Caixinha) fica no nome desta pessoa, que recebe o aviso para comprar.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aprovador-caixinha">Quem aprova a Caixinha</Label>
          {pessoa(form.caixinha_aprovador_id, (v) => setForm({ ...form, caixinha_aprovador_id: v }), 'aprovador-caixinha')}
          <p className="text-xs text-muted-foreground">
            Decide os pedidos da categoria Caixinha, compra, anexa o recibo e lança no Caixinha (Financeiro › Caixinha).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor-semanal">Valor semanal da Caixinha (R$)</Label>
          <Input id="valor-semanal" inputMode="decimal" className="w-40 font-mono" disabled={!podeEditar}
            value={form.caixinha_valor_semanal ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(',', '.');
              setForm({ ...form, caixinha_valor_semanal: v === '' ? null : Number(v) });
            }} />
          <p className="text-xs text-muted-foreground">O repasse do diretor. Vem preenchido ao registrar a entrada (dá para mudar).</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Cartão de crédito da empresa</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label htmlFor="cartao-fecha">A fatura fecha no dia</Label>
            <Input id="cartao-fecha" inputMode="numeric" className="h-9 w-16 font-mono" disabled={!podeEditar}
              value={form.cartao_fecha_dia ?? ''} onChange={(e) => setForm({ ...form, cartao_fecha_dia: dia(e.target.value) })} />
            <Label htmlFor="cartao-vence">e vence no dia</Label>
            <Input id="cartao-vence" inputMode="numeric" className="h-9 w-16 font-mono" disabled={!podeEditar}
              value={form.cartao_vence_dia ?? ''} onChange={(e) => setForm({ ...form, cartao_vence_dia: dia(e.target.value) })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Compra no cartão vira conta no dia em que a fatura vence (uma por parcela), em aberto até o Financeiro dar baixa na
            fatura. Comprou antes do fechamento: entra na fatura deste mês; no dia do fechamento ou depois, na do mês seguinte.
            Dias de 1 a 28. Em branco: a conta vence no dia da compra.
          </p>
        </div>
        {podeEditar && (
          <Button disabled={salvar.isPending || (form.caixinha_valor_semanal != null && !(form.caixinha_valor_semanal >= 0))}
            onClick={() => salvar.mutate(form)}>
            Salvar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
