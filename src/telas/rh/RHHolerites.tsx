import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { quemEhDoArquivo, type PessoaDoLote } from '@/lib/holerite-em-lote';
import { useAuth } from '@/contexts/AuthContext';
import { usePodeNoRH } from '@/hooks/useAccessProfiles';
import { conferirTamanhoDoArquivoRH } from '@/lib/rh-arquivo';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TipoDeHolerite = 'mensal' | '13o' | 'ferias' | 'rescisao';

/** Sobe o PDF e registra o holerite; a escrita prova que gravou (regra 2). */
async function enviarHolerite(tenantId: string, userId: string, referenceMonth: string, type: TipoDeHolerite, file: File) {
  const refDate = referenceMonth + '-01';
  const year = referenceMonth.slice(0, 4);
  const ext = file.name.split('.').pop() || 'pdf';
  const path = `${tenantId}/${userId}/${year}/holerites/${type}-${referenceMonth}-${Date.now()}.${ext}`;
  conferirTamanhoDoArquivoRH(file);
  const { error: upErr } = await supabase.storage.from('rh-documents').upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  expectRows(await supabase.from('rh_payslips').insert({
    tenant_id: tenantId, user_id: userId, reference_month: refDate, type, file_path: path,
  }).select('id'), 'o holerite');
}

export default function RHHolerites() {
  const { tenantId } = useAuth();
  // Enviar holerite é caixinha do perfil do RH (2026-10-01), como no banco.
  const podeEnviar = usePodeNoRH().pode('payslips', 'edit');
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [referenceMonth, setReferenceMonth] = useState('');
  const [type, setType] = useState<'mensal' | '13o' | 'ferias' | 'rescisao'>('mensal');
  const [file, setFile] = useState<File | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['tenant-users-for-payslip', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('profiles')
        .select('id, full_name, email, department')
        .eq('tenant_id', tenantId)
        .order('full_name'));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: recent = [] } = useQuery({
    queryKey: ['rh-payslips-recent', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('rh_payslips')
        .select('*, profile:user_id(full_name, email)')
        .eq('tenant_id', tenantId)
        .order('uploaded_at', { ascending: false })
        .limit(50));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !userId || !referenceMonth || !tenantId) throw new Error('Preencha tudo');
      await enviarHolerite(tenantId, userId, referenceMonth, type, file);
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

      {podeEnviar && <Card>
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
              <Label>Arquivo PDF (máx 5 MB)</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <Button onClick={() => upload.mutate()} disabled={!file || !userId || !referenceMonth || upload.isPending}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> {upload.isPending ? 'Enviando...' : 'Enviar holerite'}
          </Button>
        </CardContent>
      </Card>}

      {podeEnviar && tenantId && (
        <EnviarEmLote tenantId={tenantId} pessoas={users as PessoaDoLote[]}
          aoTerminar={() => qc.invalidateQueries({ queryKey: ['rh-payslips-recent'] })} />
      )}

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
                <span className="text-muted-foreground"> · {format(parseISO(p.reference_month), "MMM 'de' yyyy", { locale: ptBR })} · {p.type}</span>
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

/**
 * Vários holerites de uma vez (etapa 4 · RH, 2026-10-25): escolhe o mês e o tipo, solta os PDFs, e cada um vai para
 * a pessoa cujo nome está no nome do arquivo (`quemEhDoArquivo`). O que não casou, o RH escolhe na lista antes de enviar.
 */
function EnviarEmLote({ tenantId, pessoas, aoTerminar }: { tenantId: string; pessoas: PessoaDoLote[]; aoTerminar: () => void }) {
  const [mes, setMes] = useState('');
  const [tipo, setTipo] = useState<TipoDeHolerite>('mensal');
  const [linhas, setLinhas] = useState<{ file: File; userId: string; situacao?: 'enviado' | string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const escolher = (files: FileList | null) =>
    setLinhas(Array.from(files ?? []).map((file) => ({ file, userId: quemEhDoArquivo(file.name, pessoas) ?? '' })));
  const prontos = linhas.filter((l) => l.userId && l.situacao !== 'enviado');
  const enviar = async () => {
    setEnviando(true);
    let ok = 0;
    for (const l of prontos) {
      try {
        await enviarHolerite(tenantId, l.userId, mes, tipo, l.file);
        ok++;
        setLinhas((ls) => ls.map((x) => (x === l ? { ...x, situacao: 'enviado' } : x)));
      } catch (e) {
        setLinhas((ls) => ls.map((x) => (x === l ? { ...x, situacao: mensagemDeErro(e) } : x)));
      }
    }
    setEnviando(false);
    aoTerminar();
    if (ok === prontos.length) toast.success(`${ok} holerite${ok === 1 ? '' : 's'} enviado${ok === 1 ? '' : 's'}.`);
    else toast.error(`${ok} de ${prontos.length} enviados. Veja na lista o que falhou.`);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enviar vários de uma vez</CardTitle>
        <CardDescription>
          Escolha o mês e os PDFs. Cada arquivo vai para a pessoa cujo nome está no nome dele (ex.: "Holerite 10-2026 -
          Maria Souza.pdf"). Confira a lista antes de enviar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="lote-mes">Mês de referência</Label>
            <Input id="lote-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDeHolerite)}>
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
            <Label htmlFor="lote-arquivos">Arquivos PDF (máx 5 MB cada)</Label>
            <Input id="lote-arquivos" type="file" accept="application/pdf" multiple onChange={(e) => escolher(e.target.files)} />
          </div>
        </div>
        {linhas.length > 0 && (
          <div className="rounded-md border border-border divide-y divide-border">
            {linhas.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
                <span className="flex-1 min-w-[12rem] truncate" title={l.file.name}>{l.file.name}</span>
                <Select value={l.userId} disabled={l.situacao === 'enviado'}
                  onValueChange={(v) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, userId: v, situacao: undefined } : x)))}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Não achei: escolha a pessoa" /></SelectTrigger>
                  <SelectContent>
                    {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className={`w-40 text-right ${l.situacao && l.situacao !== 'enviado' ? 'text-status-danger' : 'text-muted-foreground'}`}>
                  {l.situacao === 'enviado' ? 'Enviado' : l.situacao ?? (l.userId ? 'Pronto' : 'Falta a pessoa')}
                </span>
              </div>
            ))}
          </div>
        )}
        <Button onClick={enviar} disabled={!mes || prontos.length === 0 || enviando}>
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          {enviando ? 'Enviando…' : `Enviar ${prontos.length} holerite${prontos.length === 1 ? '' : 's'}`}
        </Button>
      </CardContent>
    </Card>
  );
}
