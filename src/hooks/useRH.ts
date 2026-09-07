import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { unwrap } from '@/lib/supabase-result';
import { toLocalISODate } from '@/lib/dates';

// ============= Empresas =============
export interface RHCompany {
  id: string;
  code: string;
  name: string;
  cnpj: string | null;
  is_active: boolean;
}

export function useRHCompanies() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['rh-companies', tenantId],
    queryFn: async (): Promise<RHCompany[]> => {
      if (!tenantId) return [];
      const data = unwrap(await supabase.from('rh_companies').select('*').eq('tenant_id', tenantId).order('code'));
      return (data || []) as RHCompany[];
    },
    enabled: !!tenantId,
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<RHCompany> & { code: string; name: string }) => {
      if (!tenantId) throw new Error('Sem tenant');
      const payload: any = { tenant_id: tenantId, ...input };
      const { error } = input.id
        ? await supabase.from('rh_companies').update(payload).eq('id', input.id)
        : await supabase.from('rh_companies').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Empresa salva.'); qc.invalidateQueries({ queryKey: ['rh-companies'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Empresa removida.'); qc.invalidateQueries({ queryKey: ['rh-companies'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return { companies, isLoading, upsert, remove };
}

// ============= Departamentos =============
export function useRHDepartments() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: departments = [] } = useQuery({
    queryKey: ['rh-departments', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase.from('rh_departments_catalog').select('*').eq('tenant_id', tenantId).order('sort_order'));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const upsert = useMutation({
    mutationFn: async (input: { id?: string; name: string; sort_order?: number; is_active?: boolean }) => {
      if (!tenantId) throw new Error('Sem tenant');
      const payload: any = { tenant_id: tenantId, ...input };
      const { error } = input.id
        ? await supabase.from('rh_departments_catalog').update(payload).eq('id', input.id)
        : await supabase.from('rh_departments_catalog').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Departamento salvo.'); qc.invalidateQueries({ queryKey: ['rh-departments'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_departments_catalog').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rh-departments'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return { departments, upsert, remove };
}

// ============= Colaboradores =============
export interface RHEmployee {
  id: string;
  tenant_id: string;
  user_id: string | null;
  company_id: string | null;
  full_name: string | null;
  cpf: string | null;
  birth_date: string | null;
  department: string | null;
  job_title: string | null;
  position: string | null;
  manager_name: string | null;
  contract_type: string | null;
  admission_date: string | null;
  probation_45: string | null;
  probation_90: string | null;
  base_salary: number;
  status: string;
  termination_date: string | null;
  matricula: string | null;
  access_email: string | null;
}

export function useRHEmployees(filters?: { companyId?: string | null; status?: string }) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['rh-employees', tenantId, filters?.companyId, filters?.status],
    queryFn: async (): Promise<RHEmployee[]> => {
      if (!tenantId) return [];
      let q = supabase.from('rh_employee_profiles').select('*').eq('tenant_id', tenantId).order('full_name');
      if (filters?.companyId) q = q.eq('company_id', filters.companyId);
      if (filters?.status) q = q.eq('status', filters.status);
      const data = unwrap(await q);
      return (data || []) as any;
    },
    enabled: !!tenantId,
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<RHEmployee> & { full_name: string }) => {
      if (!tenantId) throw new Error('Sem tenant');
      // Calcula 45/90 dias automaticamente se admissão informada e os campos não vieram
      const payload: any = { tenant_id: tenantId, ...input };
      if (input.admission_date && !input.probation_45) {
        const adm = new Date(input.admission_date);
        payload.probation_45 = toLocalISODate(new Date(adm.getTime() + 45 * 86400000));
        payload.probation_90 = toLocalISODate(new Date(adm.getTime() + 90 * 86400000));
      }
      const q = input.id
        ? await supabase.from('rh_employee_profiles').update(payload).eq('id', input.id).select().single()
        : await supabase.from('rh_employee_profiles').insert(payload).select().single();
      if (q.error) throw q.error;
      return q.data;
    },
    onSuccess: () => { toast.success('Colaborador salvo.'); qc.invalidateQueries({ queryKey: ['rh-employees'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_employee_profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Removido.'); qc.invalidateQueries({ queryKey: ['rh-employees'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const linkAccount = useMutation({
    mutationFn: async (input: { employee_id: string; email: string }) => {
      const { data, error } = await (supabase.rpc as any)('rh_link_employee_user', {
        _employee_id: input.employee_id,
        _email: input.email,
      });
      if (error) throw error;
      return data as { linked: boolean; user_id: string | null };
    },
    onSuccess: (data) => {
      if (data?.linked) toast.success('Conta de acesso vinculada.');
      else toast.info('E-mail salvo. Será vinculado automaticamente quando o usuário aceitar o convite.');
      qc.invalidateQueries({ queryKey: ['rh-employees'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { employees, isLoading, upsert, remove, linkAccount };
}

// ============= Configurações da folha =============
export function useRHPayrollSettings(companyId?: string | null) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['rh-payroll-settings', tenantId, companyId ?? null],
    queryFn: async () => {
      if (!tenantId) return null;
      const data = unwrap(await supabase.from('rh_payroll_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('company_id', { nullsFirst: false })
        .limit(1));
      return (data && data[0]) || null;
    },
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: async (input: any) => {
      if (!tenantId) throw new Error('Sem tenant');
      const payload = { ...input, tenant_id: tenantId };
      if (input.id) {
        const { error } = await supabase.from('rh_payroll_settings').update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rh_payroll_settings').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success('Parâmetros salvos.'); qc.invalidateQueries({ queryKey: ['rh-payroll-settings'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return { settings, isLoading, save };
}

// ============= Folha mensal =============
export function useRHPayroll(month: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['rh-payroll', tenantId, month],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('rh_payroll_entries')
        .select('*, employee:rh_employee_profiles(id, full_name, department, job_title, base_salary, company_id), company:rh_companies(code, name)')
        .eq('tenant_id', tenantId)
        .eq('reference_month', month)
        .order('created_at'));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from('rh_payroll_entries').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rh-payroll'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async (companyId: string | null) => {
      if (!tenantId) throw new Error('Sem tenant');
      const { data, error } = await supabase.rpc('rh_generate_payroll', {
        _tenant: tenantId, _company: companyId, _month: month,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Folha gerada para ${n} colaborador(es).`); qc.invalidateQueries({ queryKey: ['rh-payroll'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_payroll_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rh-payroll'] }); },
  });

  return { entries, isLoading, update, generate, remove };
}

// ============= Faltas =============
export function useRHAbsences(month: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const start = month;
  const [absYear, absMonth] = month.split('-').map(Number);
  const end = toLocalISODate(new Date(absYear, absMonth, 1));

  const { data: absences = [], isLoading } = useQuery({
    queryKey: ['rh-absences', tenantId, month],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('rh_absences')
        .select('*, employee:rh_employee_profiles(id, full_name, department)')
        .eq('tenant_id', tenantId)
        .gte('date', start)
        .lt('date', end)
        .order('date', { ascending: false }));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const upsert = useMutation({
    mutationFn: async (input: any) => {
      if (!tenantId) throw new Error('Sem tenant');
      const payload = { ...input, tenant_id: tenantId };
      const { error } = input.id
        ? await supabase.from('rh_absences').update(payload).eq('id', input.id)
        : await supabase.from('rh_absences').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Lançamento salvo.'); qc.invalidateQueries({ queryKey: ['rh-absences'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_absences').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rh-absences'] }); },
  });

  return { absences, isLoading, upsert, remove };
}

// ============= Reembolsos (VT, VA, Combustível, Descontos) =============
function useMonthly<T = any>(table: string, month: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [table, tenantId, month],
    queryFn: async (): Promise<T[]> => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from(table as any)
        .select('*, employee:rh_employee_profiles(id, full_name, department, base_salary)')
        .eq('tenant_id', tenantId)
        .eq('reference_month', month)
        .order('created_at'));
      return (data || []) as any;
    },
    enabled: !!tenantId,
  });

  const upsert = useMutation({
    mutationFn: async (input: any) => {
      if (!tenantId) throw new Error('Sem tenant');
      const payload = { ...input, tenant_id: tenantId, reference_month: month };
      const { error } = input.id
        ? await (supabase.from(table as any) as any).update(payload).eq('id', input.id)
        : await (supabase.from(table as any) as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Salvo.'); qc.invalidateQueries({ queryKey: [table] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(table as any) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table] }); },
  });

  const replicatePrevious = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Sem tenant');
      const [prevYear, prevMonth] = month.split('-').map(Number);
      const prev = toLocalISODate(new Date(prevYear, prevMonth - 2, 1));
      const prevRows = unwrap(await (supabase.from(table as any) as any)
        .select('*').eq('tenant_id', tenantId).eq('reference_month', prev));
      if (!prevRows?.length) throw new Error('Mês anterior sem dados.');
      const toInsert = prevRows.map((r: any) => {
        const { id, created_at, updated_at, ...rest } = r;
        return { ...rest, reference_month: month };
      });
      const { error } = await (supabase.from(table as any) as any).upsert(toInsert, {
        onConflict: 'tenant_id,employee_id,reference_month',
      });
      if (error) throw error;
      return toInsert.length;
    },
    onSuccess: (n) => { toast.success(`${n} registros replicados do mês anterior.`); qc.invalidateQueries({ queryKey: [table] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return { rows, isLoading, upsert, remove, replicatePrevious };
}

export const useRHTransport = (m: string) => useMonthly('rh_transport_vouchers', m);
export const useRHMeal = (m: string) => useMonthly('rh_meal_vouchers', m);
export const useRHFuel = (m: string) => useMonthly('rh_fuel_reimbursements', m);
export const useRHDeductions = (m: string) => useMonthly('rh_monthly_deductions', m);
