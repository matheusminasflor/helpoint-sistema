import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const DEPARTMENTS = [
  { value: 'ti', label: 'TI / Tecnologia' },
  { value: 'rh', label: 'RH / Recursos Humanos' },
  { value: 'comercial', label: 'Comercial / Vendas' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'producao', label: 'Produção' },
  { value: 'qualidade', label: 'Qualidade' },
  { value: 'educacional', label: 'Educacional' },
  { value: 'expedicao', label: 'Expedição' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'diretoria', label: 'Diretoria' },
];

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

const ERROR_MAP: Record<string, string> = {
  not_authenticated: 'Sua sessão expirou. Faça login novamente.',
  email_not_confirmed: 'Confirme seu e-mail antes de cadastrar a empresa.',
  rate_limited: 'Muitas tentativas. Tente novamente em uma hora.',
  already_has_tenant: 'Você já tem uma empresa cadastrada.',
  invalid_company_name: 'Informe o nome da empresa.',
  invalid_slug: 'Use de 3 a 40 letras minúsculas, números ou hífens.',
  reserved_slug: 'Este identificador é reservado. Escolha outro.',
  invalid_cnpj: 'CNPJ inválido. Use 14 dígitos.',
  slug_taken: 'Este identificador já está em uso.',
  cnpj_taken: 'Este CNPJ já está cadastrado.',
};

export default function OnboardingCompany() {
  const navigate = useNavigate();
  const { user, profile, isLoading, refreshProfile, signOut } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) navigate('/login', { replace: true });
    if (profile?.tenant_id) navigate('/inicio', { replace: true });
    if (user && !fullName) setFullName((user.user_metadata as any)?.full_name || '');
  }, [user, profile, isLoading, navigate, fullName]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(companyName));
  }, [companyName, slugTouched]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !slug || !department || !fullName) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('claim_new_tenant', {
      _company_name: companyName,
      _slug: slug,
      _cnpj: cnpj || null,
      _full_name: fullName,
      _department: department,
    });
    setSaving(false);
    if (error) {
      const code = (error.message || '').match(/[a-z_]+/)?.[0] || '';
      toast.error(ERROR_MAP[code] || `Não foi possível cadastrar: ${error.message}`);
      return;
    }
    if (!data) {
      toast.error('Cadastro não concluído. Tente novamente.');
      return;
    }
    toast.success('Empresa cadastrada! Bem-vindo ao Helpoint.');
    await refreshProfile();
    navigate('/inicio', { replace: true });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center p-4">
      <div className="max-w-xl w-full">
        <header className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-3">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Cadastre sua empresa</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Você é o primeiro usuário e será o administrador do seu painel.
          </p>
        </header>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-xs mb-1 block">Seu nome completo *</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Nome da empresa *</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ex.: Minha Empresa LTDA" required />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Identificador (link) *</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">helpoint.com.br/</span>
                <Input
                  value={slug}
                  onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
                  placeholder="minha-empresa"
                  required
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">3 a 40 caracteres. Letras minúsculas, números e hífens.</p>
            </div>
            <div>
              <Label className="text-xs mb-1 block">CNPJ (opcional)</Label>
              <Input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Seu departamento *</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full h-11" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando empresa...</> : 'Criar minha empresa'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={async () => { await signOut(); navigate('/login'); }}>
              <LogOut className="w-4 h-4 mr-2" />Sair
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
