import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DepartmentMember {
  id: string;
  full_name: string | null;
  email: string;
}

export function useDepartmentMembers(department?: string) {
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['department-members', department],
    queryFn: async (): Promise<DepartmentMember[]> => {
      if (!department) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('department', department)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return (data || []) as DepartmentMember[];
    },
    enabled: !!department,
  });

  return { members, isLoading };
}
