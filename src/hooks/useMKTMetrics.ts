import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MKTMetrics {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  draftPosts: number;
  totalAssets: number;
  totalSuppliers: number;
}

export function useMKTMetrics() {
  return useQuery({
    queryKey: ['mkt-metrics'],
    queryFn: async (): Promise<MKTMetrics> => {
      const [postsRes, assetsRes, suppliersRes] = await Promise.all([
        supabase.from('mkt_social_posts').select('id, status'),
        supabase.from('mkt_assets' as any).select('id', { count: 'exact', head: true }),
        supabase.from('mkt_suppliers').select('id', { count: 'exact', head: true }),
      ]);

      const posts = (postsRes.data || []) as Array<{ status: string }>;
      return {
        totalPosts: posts.length,
        scheduledPosts: posts.filter(p => p.status === 'scheduled').length,
        publishedPosts: posts.filter(p => p.status === 'published').length,
        draftPosts: posts.filter(p => p.status === 'draft').length,
        totalAssets: assetsRes.count || 0,
        totalSuppliers: suppliersRes.count || 0,
      };
    },
  });
}
