import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type VacationType = 'ferias' | 'abono' | 'banco_horas';
export type VacationStatus = 'pendente' | 'aprovada' | 'recusada' | 'cancelada';
export type CertificateStatus = 'recebido' | 'validado' | 'rejeitado';
export type PayslipType = 'mensal' | '13o' | 'ferias' | 'rescisao';

export interface RHEmployeeProfile {
  id: string;
  user_id: string;
  admission_date: string | null;
  vacation_balance_days: number;
  last_vacation_end: string | null;
  cpf: string | null;
  matricula: string | null;
  manager_user_id: string | null;
}

export interface VacationRequest {
  id: string;
  user_id: string;
  ticket_id: string | null;
  start_date: string;
  end_date: string;
  days_requested: number;
  type: VacationType;
  status: VacationStatus;
  notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  created_at: string;
}

export interface MedicalCertificate {
  id: string;
  user_id: string;
  ticket_id: string | null;
  issue_date: string;
  days_off: number;
  doctor_name: string | null;
  doctor_crm: string | null;
  cid_code: string | null;
  file_path: string;
  status: CertificateStatus;
  validated_by: string | null;
  validated_at: string | null;
  validation_notes: string | null;
  created_at: string;
}

export interface Payslip {
  id: string;
  user_id: string;
  reference_month: string;
  type: PayslipType;
  file_path: string;
  uploaded_at: string;
  viewed_at: string | null;
}

// --- Perfil do colaborador ---
export function useMyRHProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rh-employee-profile', user?.id],
    queryFn: async (): Promise<RHEmployeeProfile | null> => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('rh_employee_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      return data as RHEmployeeProfile | null;
    },
    enabled: !!user?.id,
  });
}

// --- Férias ---
export function useMyVacationRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rh-vacation-requests', user?.id],
    queryFn: async (): Promise<VacationRequest[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('rh_vacation_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as VacationRequest[];
    },
    enabled: !!user?.id,
  });
}

export function useCreateVacationRequest() {
  const { user, tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { start_date: string; end_date: string; type: VacationType; notes?: string }) => {
      if (!user?.id || !tenantId) throw new Error('Sem sessão');
      const start = new Date(input.start_date);
      const end = new Date(input.end_date);
      const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      const { data, error } = await supabase
        .from('rh_vacation_requests')
        .insert({
          tenant_id: tenantId,
          user_id: user.id,
          start_date: input.start_date,
          end_date: input.end_date,
          days_requested: days,
          type: input.type,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Solicitação enviada! O RH foi notificado.');
      qc.invalidateQueries({ queryKey: ['rh-vacation-requests'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['helpdesk'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao enviar solicitação'),
  });
}

export function useCancelVacationRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('rh_vacation_requests')
        .update({ status: 'cancelada' as VacationStatus })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Solicitação cancelada');
      qc.invalidateQueries({ queryKey: ['rh-vacation-requests'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// --- Atestados ---
export function useMyCertificates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rh-medical-certificates', user?.id],
    queryFn: async (): Promise<MedicalCertificate[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('rh_medical_certificates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as MedicalCertificate[];
    },
    enabled: !!user?.id,
  });
}

export function useUploadCertificate() {
  const { user, tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      issue_date: string;
      days_off: number;
      doctor_name?: string;
      doctor_crm?: string;
      cid_code?: string;
    }) => {
      if (!user?.id || !tenantId) throw new Error('Sem sessão');
      const year = new Date(input.issue_date).getFullYear();
      const ext = input.file.name.split('.').pop() || 'bin';
      const path = `${tenantId}/${user.id}/${year}/atestados/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('rh-documents')
        .upload(path, input.file, { upsert: false });
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from('rh_medical_certificates')
        .insert({
          tenant_id: tenantId,
          user_id: user.id,
          issue_date: input.issue_date,
          days_off: input.days_off,
          doctor_name: input.doctor_name ?? null,
          doctor_crm: input.doctor_crm ?? null,
          cid_code: input.cid_code ?? null,
          file_path: path,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Atestado enviado! O RH foi notificado.');
      qc.invalidateQueries({ queryKey: ['rh-medical-certificates'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['helpdesk'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao enviar atestado'),
  });
}

// --- Holerites ---
export function useMyPayslips() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rh-payslips', user?.id],
    queryFn: async (): Promise<Payslip[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('rh_payslips')
        .select('*')
        .eq('user_id', user.id)
        .order('reference_month', { ascending: false });
      if (error) throw error;
      return (data || []) as Payslip[];
    },
    enabled: !!user?.id,
  });
}

export function useDownloadRHFile() {
  return useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage
        .from('rh-documents')
        .createSignedUrl(path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível abrir o arquivo'),
  });
}

export function useMarkPayslipViewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('rh_payslips')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', id)
        .is('viewed_at', null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh-payslips'] }),
  });
}

// --- Benefícios ---
export type BenefitCategory =
  | 'saude' | 'odonto' | 'vale_refeicao' | 'vale_alimentacao'
  | 'vale_transporte' | 'seguro_vida' | 'gympass' | 'educacao' | 'outros';
export type BenefitStatus = 'ativo' | 'suspenso' | 'encerrado';

export interface BenefitPlan {
  id: string;
  name: string;
  category: BenefitCategory;
  provider: string | null;
  description: string | null;
  monthly_value: number | null;
  is_active: boolean;
}

export interface EmployeeBenefit {
  id: string;
  user_id: string;
  plan_id: string;
  start_date: string;
  end_date: string | null;
  status: BenefitStatus;
  dependents: Array<{ name: string; relationship: string; birth_date?: string }>;
  notes: string | null;
  plan?: BenefitPlan;
}

export function useMyBenefits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rh-my-benefits', user?.id],
    queryFn: async (): Promise<EmployeeBenefit[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('rh_employee_benefits')
        .select('*, plan:rh_benefit_plans(*)')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!user?.id,
  });
}

// --- Cofre de Documentos ---
export type RHDocumentType =
  | 'contrato' | 'aditivo' | 'aso' | 'epi' | 'rg_cpf' | 'ctps'
  | 'comprovante_residencia' | 'diploma' | 'curso'
  | 'advertencia' | 'suspensao' | 'outros';

export interface RHDocument {
  id: string;
  user_id: string;
  document_type: RHDocumentType;
  title: string;
  file_path: string;
  issue_date: string | null;
  expires_at: string | null;
  version: number;
  notes: string | null;
  created_at: string;
}

export function useMyDocuments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rh-my-documents', user?.id],
    queryFn: async (): Promise<RHDocument[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('rh_documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as RHDocument[];
    },
    enabled: !!user?.id,
  });
}

