import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function RHHolerites() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [referenceMonth, setReferenceMonth] = useState('');
  const [type, setType] = useState<'mensal' | '13o' | 'ferias' | 'rescisao'>('mensal');
  const [file, setFile] = useState<File | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['tenant-users-for-payslip', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, department')
        .eq('tenant_id', tenantId)
        .order('full_name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: recent = [] } = useQuery({
    queryKey: ['rh-payslips-recent', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('rh_payslips')
        .select('*, profile:user_id(full_name, email)')
        .eq('tenant_id', tenantId)
        .order('uploaded_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !userId || !referenceMonth || !tenantId) throw new Error('Preencha tudo');
      const refDate = referenceMonth + '-01';
      const year = new Date(refDate).getFullYear();
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `${tenantId}/${userId}/${year}/holerites/${type}-${referenceMonth}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('rh-documents').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('rh_payslips').insert({
        tenant_id: tenantId, user_id: userId, reference_month: refDate, type, file_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Holerite enviado e disponível para o colaborador.');
      setFile(null); setReferenceMonth(''); setUserId('');
      qc.invalidateQueries({ queryKey: ['rh-payslips-recent'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Receipt className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Holerites</h1>
          <p className="text-sm text-muted-foreground">Envie o holerite do mês. O colaborador recebe automaticamente em "Meu RH".</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enviar holerite</CardTitle>
          <CardDescription>Selecione o colaborador, mês de referência e o arquivo PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
                <SelectContent>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email} {u.department && `· ${u.department}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="13o">13º Salário</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="rescisao">Rescisão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mês de referência</Label>
              <Input type="month" value={referenceMonth} onChange={(e) => setReferenceMonth(e.target.value)} />
            </div>
            <div>
              <Label>Arquivo PDF</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <Button onClick={() => upload.mutate()} disabled={!file || !userId || !referenceMonth || upload.isPending}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> {upload.isPending ? 'Enviando...' : 'Enviar holerite'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos envios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum holerite enviado ainda.</div>
          ) : recent.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
              <div>
                <span className="font-medium">{p.profile?.full_name || p.profile?.email}</span>
                <span className="text-muted-foreground"> · {format(new Date(p.reference_month), "MMM 'de' yyyy", { locale: ptBR })} · {p.type}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {p.viewed_at ? `Visto em ${format(new Date(p.viewed_at), 'dd/MM HH:mm')}` : 'Não lido'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
