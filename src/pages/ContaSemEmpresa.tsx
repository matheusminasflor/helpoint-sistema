import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export default function ContaSemEmpresa() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
          <ShieldAlert className="w-7 h-7 text-destructive" strokeWidth={2} />
        </div>
        <h1 className="text-[22px] font-extrabold text-foreground mb-2 font-display">
          Conta ainda sem acesso
        </h1>
        <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-7">
          Sua conta existe, mas ainda não foi ligada à empresa. Peça a quem
          administra o Helpoint que envie um convite para o seu e-mail.
        </p>
        <Button onClick={handleSignOut} variant="outline" className="w-full h-10">
          Sair
        </Button>
      </div>
    </div>
  );
}
