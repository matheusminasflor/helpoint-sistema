import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export default function SACLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/sac/meus-chamados');
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error('E-mail ou senha inválidos.');
    else navigate('/sac/meus-chamados');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-1 p-4">
      <Card className="max-w-sm w-full p-6">
        <h1 className="text-2xl font-bold mb-1">Área do Cliente</h1>
        <p className="text-sm text-muted-foreground mb-6">Acesse para acompanhar seus chamados</p>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div><Label>Senha</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? 'Entrando...' : 'Entrar'}</Button>
        </form>
        <p className="text-xs text-center text-muted-foreground mt-4">
          Ainda não abriu chamado? <Link to="/sac" className="text-primary hover:underline">Abrir agora</Link>
        </p>
      </Card>
    </div>
  );
}
