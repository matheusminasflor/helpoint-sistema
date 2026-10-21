// A conferência mensal de equipamentos (dono, 2026-10-21: o #175 saiu "no nome do Mairon" e não havia onde mudar):
// ligada ou não, o dia do mês e quem aparece como solicitante. A rotina do banco (`ti_abrir_conferencia_do_mes`,
// 20270129130000) lê esta configuração; sem ela, vale ligada, dia 1, primeiro dono.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTechnicians } from '@/hooks/useTechnicians';
import { expectRows, mensagemDeErro, unwrap } from '@/lib/supabase-result';

interface Config { ativo: boolean; dia_do_mes: number; solicitante_id: string | null }
const PADRAO: Config = { ativo: true, dia_do_mes: 1, solicitante_id: null };
const DIAS = Array.from({ length: 28 }, (_, i) => i + 1);

export function ConferenciaDeEquipamentosConfig({ podeEditar }: { podeEditar: boolean }) {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  const { data: pessoas = [] } = useTechnicians();
  const { data: salvo, isLoading } = useQuery({
    queryKey: ['ti-conferencia-config', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Config | null> =>
      (unwrap(await supabase.from('ti_conferencia_config' as never).select('ativo, dia_do_mes, solicitante_id').maybeSingle())
        ?? null) as Config | null,
  });
  const [form, setForm] = useState<Config>(PADRAO);
  useEffect(() => { if (salvo !== undefined) setForm(salvo ?? PADRAO); }, [salvo]);

  const salvar = useMutation({
    mutationFn: async () => {
      expectRows(await supabase.from('ti_conferencia_config' as never)
        .upsert({ tenant_id: tenantId, ...form, updated_at: new Date().toISOString(), updated_by: user?.id } as never)
        .select('tenant_id'), 'a configuração da conferência');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ti-conferencia-config'] }); toast.success('Conferência configurada.'); },
    onError: (e: Error) => toast.error(`Não salvou: ${mensagemDeErro(e)}`),
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Conferência mensal de equipamentos</CardTitle>
        <CardDescription>
          Todo mês a TI recebe um chamado para conferir, pessoa por pessoa, se o equipamento no nome dela está com ela.
          Abre às 8h do dia escolhido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!podeEditar || isLoading} className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="conf-ativo" checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
            <Label htmlFor="conf-ativo">{form.ativo ? 'Ligada' : 'Desligada'}</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conf-dia">Dia do mês</Label>
              <Select value={String(form.dia_do_mes)} onValueChange={(v) => setForm((f) => ({ ...f, dia_do_mes: Number(v) }))}>
                <SelectTrigger id="conf-dia"><SelectValue /></SelectTrigger>
                <SelectContent>{DIAS.map((d) => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conf-solicitante">Sai em nome de</Label>
              <Select value={form.solicitante_id ?? undefined} onValueChange={(v) => setForm((f) => ({ ...f, solicitante_id: v }))}>
                <SelectTrigger id="conf-solicitante"><SelectValue placeholder="Escolha quem pede a conferência" /></SelectTrigger>
                <SelectContent>{pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {podeEditar && <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>Salvar</Button>}
        </fieldset>
      </CardContent>
    </Card>
  );
}
