import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Technician {
  id: string;
  full_name: string | null;
  email: string;
}

export function useTechnicians() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['technicians', tenantId],
    queryFn: async (): Promise<Technician[]> => {
      // Fetch profiles that have technician or higher roles
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          user_roles!user_roles_user_id_fkey!inner(role)
        `)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;

      // Filter to only include users with technician or higher roles
      const technicians = (data || []).filter((profile: any) => {
        const roles = profile.user_roles || [];
        return roles.some((r: any) => 
          ['member', 'manager', 'admin', 'owner'].includes(r.role)
        );
      }).map((profile: any) => ({
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      }));

      return technicians;
    },
  });
}
