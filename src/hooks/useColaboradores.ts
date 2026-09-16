import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';

export interface Colaborador {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * **Todo mundo que trabalha aqui** — a lista de gente da empresa, sem filtro de
 * cargo.
 *
 * Existe porque `useTechnicians` não é isto, e foi usado como se fosse: ele só
 * devolve quem tem linha em `user_roles` com `member` ou acima. Para "atribuir
 * um chamado" isso está certo — chamado vai para quem trabalha nele. Para
 * **inscrever alguém num treinamento** está errado: o funcionário recém-criado,
 * ou o que ficou como `viewer`, simplesmente não aparecia na lista. Sem erro,
 * sem aviso — a pessoa não existia, e quem estava na tela não tinha como saber
 * por quê.
 *
 * A RLS de `profiles` é quem limita à própria empresa.
 */
export function useColaboradores() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['colaboradores', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Colaborador[]> =>
      unwrap(
        await supabase.from('profiles').select('id, full_name, email')
          .eq('is_active', true).order('full_name'),
      ),
  });
}
