import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageSquare, LogIn, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { useSacTenantSlug } from '@/hooks/useSacTenantSlug';

export default function SACGateway() {
  const navigate = useNavigate();
  const tenantSlug = useSacTenantSlug();
  const qs = tenantSlug ? `?tenant=${tenantSlug}` : '';
  const { tenant, loading } = useTenantBranding(tenantSlug);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/sac/meus-chamados');
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <header className="text-center mb-6">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-14 mx-auto mb-3 object-contain" />
          ) : (
            <div className="inline-flex w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7 text-primary" />
            </div>
          )}
          <h1 className="text-2xl font-bold">Atendimento ao Cliente</h1>
          {tenant?.name && (
            <p className="text-sm text-muted-foreground mt-1">{tenant.name}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            Abra e acompanhe seus chamados em um só lugar.
          </p>
        </header>

        <Card className="p-5 space-y-3">
          <Link to={`/sac/entrar${qs}`} className="block">
            <Button className="w-full h-12 text-base">
              <LogIn className="w-4 h-4 mr-2" />
              Entrar na minha conta
            </Button>
          </Link>
          <Link to={`/sac/cadastro${qs}`} className="block">
            <Button variant="outline" className="w-full h-12 text-base">
              <UserPlus className="w-4 h-4 mr-2" />
              Criar cadastro
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground text-center pt-1">
            Se é a sua primeira vez, crie um cadastro. Já é cliente? Faça login.
          </p>
        </Card>
      </div>
    </div>
  );
}
