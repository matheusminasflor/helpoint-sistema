// O RH registra férias já aprovadas de um colaborador (decisão do dono, 2026-10-03). Até aqui só o
// próprio colaborador pedia. Registrar avisa o gestor para repassar as demandas da pessoa — o
// trigger `ferias_aprovadas_avisam` faz isso, igual à aprovação de um pedido (20261127020000).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { toast } from 'sonner';

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

export function RegistrarFeriasDialog({ open, onOpenChange }: Props) {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  const [pessoa, setPessoa] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [obs, setObs] = useState('');

  const { data: pessoas = [] } = useQuery({
    queryKey: ['rh-pessoas-ativas', tenantId],
    enabled: open && !!tenantId,
    queryFn: async () => unwrap(await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')) ?? [],
  });

  const dias = inicio && fim ? differenceInCalendarDays(parseISO(fim), parseISO(inicio)) + 1 : 0;

  const registrar = useMutation({
    mutationFn: async () => {
      expectRows(await supabase.from('rh_vacation_requests').insert({
        tenant_id: tenantId!,
        user_id: pessoa,
        start_date: inicio,
        end_date: fim,
        days_requested: dias,
        type: 'ferias',
        status: 'aprovada',
        notes: obs.trim() || null,
        decided_by: user?.id ?? null,
        decided_at: new Date().toISOString(),
      }).select('id'), 'registrar as férias');
    },
    onSuccess: () => {
      toast.success('Férias registradas. O gestor foi avisado para repassar as demandas.');
      qc.invalidateQueries({ queryKey: ['rh-all-vacation-requests'] });
      setPessoa(''); setInicio(''); setFim(''); setObs('');
      onOpenChange(false);
    },
    onError: (e) => toast.error(`Não foi possível registrar: ${mensagemDeErro(e)}`),
  });

  const valido = !!pessoa && !!inicio && !!fim && dias > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar férias</DialogTitle>
          <DialogDescription>
            Férias já combinadas com o colaborador. Entram aprovadas, e o gestor dele é avisado para
            repassar os chamados e as categorias.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Colaborador</Label>
            <Select value={pessoa} onValueChange={setPessoa}>
              <SelectTrigger><SelectValue placeholder="Escolha o colaborador" /></SelectTrigger>
              <SelectContent>
                {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ferias-inicio">Início</Label>
              <Input id="ferias-inicio" type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ferias-fim">Fim</Label>
              <Input id="ferias-fim" type="date" value={fim} min={inicio || undefined} onChange={e => setFim(e.target.value)} />
            </div>
          </div>
          {dias > 0 && <p className="text-xs text-muted-foreground">{dias} dia(s).</p>}
          <div className="space-y-1.5">
            <Label htmlFor="ferias-obs">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="ferias-obs" rows={2} value={obs} onChange={e => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => registrar.mutate()} disabled={!valido || registrar.isPending}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
