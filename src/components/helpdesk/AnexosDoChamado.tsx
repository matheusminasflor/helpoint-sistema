import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { useLinksAssinados } from '@/hooks/useLinksAssinados';

interface Anexo {
  id: string;
  file_name: string;
  file_url: string;
  comment_id: string | null;
  comentario: { is_internal: boolean } | null;
}

/**
 * Todos os anexos do chamado num quadro só, para quem abriu (dono, 2026-10-20, #152): os da abertura e os que o
 * atendente mandou na conversa. Anexo de nota interna fica de fora — o comentário dele não chega a quem abriu
 * (RLS), e aqui também se confere `is_internal`.
 */
export function AnexosDoChamado({ ticketId }: { ticketId: string }) {
  const { tenantId } = useAuth();
  const { data: anexos = [] } = useQuery({
    queryKey: ['anexos-do-chamado', tenantId, ticketId],
    enabled: !!tenantId,
    queryFn: async () => {
      const linhas = unwrap(await supabase
        .from('ticket_attachments')
        .select('id, file_name, file_url, comment_id, comentario:ticket_comments(is_internal)')
        .eq('ticket_id', ticketId)
        .order('created_at')) as unknown as Anexo[];
      return linhas.filter((a) => !a.comment_id || (a.comentario && !a.comentario.is_internal));
    },
  });
  const links = useLinksAssinados(anexos.map((a) => a.file_url));
  if (anexos.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Paperclip className="w-3.5 h-3.5" />
        Anexos ({anexos.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {anexos.map((a) => (
          <a key={a.id} href={links[a.file_url]} aria-disabled={!links[a.file_url]} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-muted hover:bg-accent text-foreground">
            <Paperclip className="w-3 h-3" />
            <span className="max-w-[220px] truncate">{a.file_name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
