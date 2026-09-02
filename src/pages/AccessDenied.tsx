import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface AccessDeniedProps {
  currentTenantName?: string | null;
  currentTenantSlug?: string | null;
  attemptedTenantSlug?: string | null;
}

export default function AccessDenied({
  currentTenantName,
  currentTenantSlug,
  attemptedTenantSlug,
}: AccessDeniedProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const goHome = () => {
    if (currentTenantSlug) navigate(`/t/${currentTenantSlug}/inicio`, { replace: true });
    else navigate('/login', { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
          <ShieldAlert className="w-7 h-7 text-red-500" strokeWidth={2} />
        </div>
        <h1 className="text-[22px] font-extrabold text-foreground mb-2 font-display">
          Acesso negado
        </h1>
        <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-1">
          Esta página pertence à empresa{' '}
          <span className="font-semibold text-foreground">{attemptedTenantSlug || 'desconhecida'}</span>,
          mas você está autenticado em outra conta
          {currentTenantName ? (
            <> (<span className="font-semibold text-foreground">{currentTenantName}</span>)</>
          ) : null}
          .
        </p>
        <p className="text-[12.5px] text-muted-foreground mb-7">
          Cada empresa tem seu próprio painel. Para acessar outra empresa, saia e entre com a conta correta.
        </p>
        <div className="flex flex-col gap-2">
          {currentTenantSlug && (
            <Button onClick={goHome} className="w-full h-10">
              Ir para o painel da minha empresa
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
          <Button onClick={handleSignOut} variant="outline" className="w-full h-10">
            <LogOut className="w-4 h-4 mr-1.5" />
            Sair e entrar em outra conta
          </Button>
        </div>
      </div>
    </div>
  );
}
