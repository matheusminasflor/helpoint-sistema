import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar as CalendarIcon, Upload, Download, FileText, Plane, Stethoscope, Receipt, CheckCircle2, XCircle, Clock, User, Briefcase, HeartPulse, FolderLock, AlertTriangle } from 'lucide-react';
import { format, differenceInCalendarDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMyRHProfile, useMyVacationRequests, useCreateVacationRequest, useCancelVacationRequest,
  useMyCertificates, useUploadCertificate, useMyPayslips, useDownloadRHFile, useMarkPayslipViewed,
  useMyBenefits, useMyDocuments,
  type VacationStatus, type CertificateStatus, type VacationType, type PayslipType,
  type BenefitCategory, type RHDocumentType,
} from '@/hooks/useMeuRH';

const BENEFIT_CATEGORY_LABEL: Record<BenefitCategory, string> = {
  saude: 'Plano de saúde', odonto: 'Odontológico', vale_refeicao: 'Vale-refeição',
  vale_alimentacao: 'Vale-alimentação', vale_transporte: 'Vale-transporte',
  seguro_vida: 'Seguro de vida', gympass: 'Gympass / Wellhub', educacao: 'Educação', outros: 'Outros',
};
const DOC_TYPE_LABEL: Record<RHDocumentType, string> = {
  contrato: 'Contrato de trabalho', aditivo: 'Aditivo contratual', aso: 'ASO',
  epi: 'Ficha de EPI', rg_cpf: 'RG / CPF', ctps: 'CTPS',
  comprovante_residencia: 'Comprovante de residência', diploma: 'Diploma', curso: 'Certificado de curso',
  advertencia: 'Advertência', suspensao: 'Suspensão', outros: 'Outros',
};

const VACATION_STATUS_LABEL: Record<VacationStatus, string> = {
  pendente: 'Aguardando RH', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada',
};
const VACATION_STATUS_COLOR: Record<VacationStatus, string> = {
  pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  aprovada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  recusada: 'bg-rose-100 text-rose-800 border-rose-200',
  cancelada: 'bg-slate-100 text-slate-700 border-slate-200',
};
const CERT_STATUS_LABEL: Record<CertificateStatus, string> = {
  recebido: 'Em análise', validado: 'Validado', rejeitado: 'Rejeitado',
};
const CERT_STATUS_COLOR: Record<CertificateStatus, string> = {
  recebido: 'bg-amber-100 text-amber-800 border-amber-200',
  validado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejeitado: 'bg-rose-100 text-rose-800 border-rose-200',
};
const PAYSLIP_TYPE_LABEL: Record<PayslipType, string> = {
  mensal: 'Mensal', '13o': '13º Salário', ferias: 'Férias', rescisao: 'Rescisão',
};

export default function MeuRH() {
  const { user } = useAuth();
  const { data: profile } = useMyRHProfile();
  const { data: vacations = [] } = useMyVacationRequests();
  const { data: certificates = [] } = useMyCertificates();
  const { data: payslips = [] } = useMyPayslips();
  const { data: benefits = [] } = useMyBenefits();
  const { data: documents = [] } = useMyDocuments();
  const download = useDownloadRHFile();
  const markViewed = useMarkPayslipViewed();

  const pendingVacations = vacations.filter(v => v.status === 'pendente').length;
  const unreadPayslips = payslips.filter(p => !p.viewed_at).length;

  const handleDownload = async (path: string, payslipId?: string) => {
    const url = await download.mutateAsync(path);
    window.open(url, '_blank');
    if (payslipId) markViewed.mutate(payslipId);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Briefcase}
        title="Meu RH"
        description="Solicite férias, envie atestados e consulte seus holerites."
      />

      {!profile && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Sua conta ainda não está vinculada ao cadastro de RH</div>
            <div className="text-xs mt-1">
              Você ainda pode enviar solicitações e atestados — eles chegam como chamado para o RH. Para ver holerites, benefícios e documentos, peça ao RH para vincular sua conta em <b>RH → Colaboradores</b>
              {user?.email ? <> usando o e-mail <b>{user.email}</b> da sua conta.</> : '.'}
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={Plane} label="Saldo de férias" value={`${profile?.vacation_balance_days ?? 30} dias`} color="text-blue-600" />
        <KPI icon={Clock} label="Solicitações abertas" value={pendingVacations} color="text-amber-600" />
        <KPI icon={Receipt} label="Holerites não lidos" value={unreadPayslips} color="text-emerald-600" />
        <KPI icon={User} label="Matrícula"
             value={profile?.matricula || '—'} color="text-slate-600" />
      </div>

      <Tabs defaultValue="ferias" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ferias">
            <Plane className="w-3.5 h-3.5 mr-1.5" /> Férias
          </TabsTrigger>
          <TabsTrigger value="atestados">
            <Stethoscope className="w-3.5 h-3.5 mr-1.5" /> Atestados
          </TabsTrigger>
          <TabsTrigger value="holerites">
            <Receipt className="w-3.5 h-3.5 mr-1.5" /> Holerites
            {unreadPayslips > 0 && <Badge className="ml-2 h-4 px-1.5 text-[10px]">{unreadPayslips}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="beneficios">
            <HeartPulse className="w-3.5 h-3.5 mr-1.5" /> Benefícios
          </TabsTrigger>
          <TabsTrigger value="documentos">
            <FolderLock className="w-3.5 h-3.5 mr-1.5" /> Documentos
          </TabsTrigger>
          <TabsTrigger value="dados">
            <User className="w-3.5 h-3.5 mr-1.5" /> Meus dados
          </TabsTrigger>
        </TabsList>

        {/* === FÉRIAS === */}
        <TabsContent value="ferias" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Suas solicitações</CardTitle>
                <CardDescription>Histórico e status dos pedidos enviados ao RH.</CardDescription>
              </div>
              <NewVacationDialog balance={profile?.vacation_balance_days ?? 30} />
            </CardHeader>
            <CardContent>
              {vacations.length === 0 ? (
                <EmptyState icon={Plane} text="Nenhuma solicitação ainda. Clique em 'Nova solicitação' para começar." />
              ) : (
                <div className="space-y-2">
                  {vacations.map(v => (
                    <VacationRow key={v.id} v={v} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ATESTADOS === */}
        <TabsContent value="atestados" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Seus atestados</CardTitle>
                <CardDescription>Envie fotos ou PDFs do atestado para o RH validar.</CardDescription>
              </div>
              <NewCertificateDialog />
            </CardHeader>
            <CardContent>
              {certificates.length === 0 ? (
                <EmptyState icon={Stethoscope} text="Nenhum atestado enviado. Clique em 'Enviar atestado' para anexar." />
              ) : (
                <div className="space-y-2">
                  {certificates.map(c => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">
                            {c.days_off} dia{c.days_off > 1 ? 's' : ''} a partir de {format(new Date(c.issue_date), 'dd/MM/yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.doctor_name ? `Dr(a). ${c.doctor_name}` : 'Médico não informado'}
                            {c.cid_code && ` · CID ${c.cid_code}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={CERT_STATUS_COLOR[c.status]}>
                          {CERT_STATUS_LABEL[c.status]}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleDownload(c.file_path)}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === HOLERITES === */}
        <TabsContent value="holerites" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seus holerites</CardTitle>
              <CardDescription>Documentos disponibilizados pelo RH. Clique para baixar.</CardDescription>
            </CardHeader>
            <CardContent>
              {payslips.length === 0 ? (
                <EmptyState icon={Receipt} text="Nenhum holerite disponível ainda. O RH os adicionará quando estiverem prontos." />
              ) : (
                <div className="space-y-2">
                  {payslips.map(p => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                          <Receipt className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="text-sm font-medium flex items-center gap-2">
                            {format(new Date(p.reference_month), "MMMM 'de' yyyy", { locale: ptBR })}
                            {!p.viewed_at && <Badge className="h-4 px-1.5 text-[9px] bg-emerald-100 text-emerald-800 border-0">novo</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{PAYSLIP_TYPE_LABEL[p.type]}</div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleDownload(p.file_path, p.id)}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === BENEFÍCIOS === */}
        <TabsContent value="beneficios" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seus benefícios ativos</CardTitle>
              <CardDescription>Planos contratados pela empresa para você. Para incluir dependentes ou alterar, abra um chamado para o RH.</CardDescription>
            </CardHeader>
            <CardContent>
              {benefits.length === 0 ? (
                <EmptyState icon={HeartPulse} text="Nenhum benefício cadastrado ainda. Procure o RH se acreditar que está faltando algo." />
              ) : (
                <div className="space-y-2">
                  {benefits.map(b => (
                    <div key={b.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                            <HeartPulse className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">
                              {b.plan?.name || BENEFIT_CATEGORY_LABEL[b.plan?.category ?? 'outros']}
                              {b.plan?.provider && <span className="text-muted-foreground font-normal"> · {b.plan.provider}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {b.plan ? BENEFIT_CATEGORY_LABEL[b.plan.category] : '—'}
                              {' · desde '}{format(new Date(b.start_date), 'dd/MM/yyyy')}
                              {b.dependents?.length > 0 && ` · ${b.dependents.length} dependente(s)`}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className={
                          b.status === 'ativo' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : b.status === 'suspenso' ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                        }>
                          {b.status === 'ativo' ? 'Ativo' : b.status === 'suspenso' ? 'Suspenso' : 'Encerrado'}
                        </Badge>
                      </div>
                      {b.dependents?.length > 0 && (
                        <div className="mt-2 pl-12 text-xs text-muted-foreground">
                          Dependentes: {b.dependents.map(d => `${d.name} (${d.relationship})`).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === COFRE DE DOCUMENTOS === */}
        <TabsContent value="documentos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meus documentos</CardTitle>
              <CardDescription>Contratos, ASO, ficha de EPI e demais documentos arquivados pelo RH.</CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <EmptyState icon={FolderLock} text="Nenhum documento arquivado ainda." />
              ) : (
                <div className="space-y-2">
                  {documents.map(d => {
                    const expiresIn = d.expires_at ? differenceInDays(new Date(d.expires_at), new Date()) : null;
                    const expiring = expiresIn !== null && expiresIn >= 0 && expiresIn <= 30;
                    const expired = expiresIn !== null && expiresIn < 0;
                    return (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium flex items-center gap-2">
                              {d.title}
                              {d.version > 1 && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">v{d.version}</Badge>}
                              {expired && <Badge className="h-4 px-1.5 text-[10px] bg-rose-100 text-rose-800 border-0">Vencido</Badge>}
                              {expiring && <Badge className="h-4 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-0">Vence em {expiresIn}d</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {DOC_TYPE_LABEL[d.document_type]}
                              {d.issue_date && ` · Emitido em ${format(new Date(d.issue_date), 'dd/MM/yyyy')}`}
                              {d.expires_at && ` · Válido até ${format(new Date(d.expires_at), 'dd/MM/yyyy')}`}
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleDownload(d.file_path)}>
                          <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === DADOS === */}
        <TabsContent value="dados">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seus dados cadastrais</CardTitle>
              <CardDescription>Para alterar, abra um chamado de "Atualização cadastral" para o RH.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <Field label="Matrícula" value={profile?.matricula || '—'} />
              <Field label="CPF" value={profile?.cpf || '—'} />
              <Field label="Data de admissão" value={profile?.admission_date ? format(new Date(profile.admission_date), 'dd/MM/yyyy') : '—'} />
              <Field label="Saldo de férias" value={`${profile?.vacation_balance_days ?? 30} dias`} />
              <Field label="Última saída de férias" value={profile?.last_vacation_end ? format(new Date(profile.last_vacation_end), 'dd/MM/yyyy') : 'Nunca'} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===== Subcomponentes =====
function KPI({ icon: Icon, label, value, color }: any) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`w-7 h-7 ${color}`} />
        <div>
          <div className="text-lg font-semibold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: any) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      <Icon className="w-8 h-8 mx-auto mb-2 opacity-40" />
      {text}
    </div>
  );
}

function VacationRow({ v }: any) {
  const cancel = useCancelVacationRequest();
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-3">
      <div className="flex items-center gap-3">
        <CalendarIcon className="w-4 h-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">
            {format(new Date(v.start_date), 'dd/MM')} a {format(new Date(v.end_date), 'dd/MM/yyyy')}
            <span className="text-muted-foreground font-normal"> · {v.days_requested} dia(s)</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {v.type === 'ferias' ? 'Férias' : v.type === 'abono' ? 'Abono' : 'Banco de horas'}
            {v.notes && ` · ${v.notes}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={VACATION_STATUS_COLOR[v.status as VacationStatus]}>
          {VACATION_STATUS_LABEL[v.status as VacationStatus]}
        </Badge>
        {v.status === 'pendente' && (
          <Button size="sm" variant="ghost" onClick={() => cancel.mutate(v.id)} disabled={cancel.isPending}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

function NewVacationDialog({ balance }: { balance: number }) {
  const create = useCreateVacationRequest();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<VacationType>('ferias');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');

  const days = useMemo(() => {
    if (!start || !end) return 0;
    return differenceInCalendarDays(new Date(end), new Date(start)) + 1;
  }, [start, end]);

  const exceedsBalance = type === 'ferias' && days > balance;
  const invalid = !start || !end || days < 1 || exceedsBalance;

  const submit = async () => {
    await create.mutateAsync({ start_date: start, end_date: end, type, notes: notes || undefined });
    setOpen(false);
    setStart(''); setEnd(''); setNotes(''); setType('ferias');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plane className="w-3.5 h-3.5 mr-1.5" /> Nova solicitação</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar férias ou folga</DialogTitle>
          <DialogDescription>O RH será notificado e responderá assim que possível.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as VacationType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ferias">Férias (saldo: {balance} dias)</SelectItem>
                <SelectItem value="abono">Abono (1 dia)</SelectItem>
                <SelectItem value="banco_horas">Banco de horas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start} />
            </div>
          </div>
          {days > 0 && (
            <div className={`text-xs ${exceedsBalance ? 'text-rose-600' : 'text-muted-foreground'}`}>
              {days} dia(s) corridos solicitados
              {exceedsBalance && ` · excede seu saldo de ${balance} dias`}
            </div>
          )}
          <div>
            <Label>Observações (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Algo que o RH precise saber?" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={invalid || create.isPending}>
            {create.isPending ? 'Enviando...' : 'Enviar solicitação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewCertificateDialog() {
  const upload = useUploadCertificate();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [daysOff, setDaysOff] = useState(1);
  const [doctor, setDoctor] = useState('');
  const [crm, setCrm] = useState('');
  const [cid, setCid] = useState('');

  const invalid = !file || !issueDate || daysOff < 1;

  const submit = async () => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo grande demais (máx 5 MB).');
      return;
    }
    await upload.mutateAsync({
      file, issue_date: issueDate, days_off: daysOff,
      doctor_name: doctor || undefined, doctor_crm: crm || undefined, cid_code: cid || undefined,
    });
    setOpen(false);
    setFile(null); setIssueDate(''); setDaysOff(1); setDoctor(''); setCrm(''); setCid('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Upload className="w-3.5 h-3.5 mr-1.5" /> Enviar atestado</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar atestado médico</DialogTitle>
          <DialogDescription>Anexe foto ou PDF do atestado. O RH validará o atestado e você será avisado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Arquivo (PDF, JPG ou PNG — máx 5 MB)</Label>
            <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data do atestado</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label>Dias de afastamento</Label>
              <Input type="number" min={1} value={daysOff} onChange={(e) => setDaysOff(Math.max(1, +e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Médico (opcional)</Label>
              <Input value={doctor} onChange={(e) => setDoctor(e.target.value)} />
            </div>
            <div>
              <Label>CRM (opcional)</Label>
              <Input value={crm} onChange={(e) => setCrm(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>CID (opcional)</Label>
            <Input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="ex: J11" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={invalid || upload.isPending}>
            {upload.isPending ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
