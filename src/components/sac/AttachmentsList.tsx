import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Paperclip, Image as ImageIcon, FileText, Download } from 'lucide-react';

interface Props { ticketId: string; }

export function AttachmentsList({ ticketId }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sac_ticket_attachments').select('*').eq('ticket_id', ticketId).order('created_at');
      setItems(data || []);
      const map: Record<string, string> = {};
      for (const a of data || []) {
        const { data: signed } = await supabase.storage.from('sac-attachments').createSignedUrl(a.file_path, 60 * 60);
        if (signed?.signedUrl) map[a.id] = signed.signedUrl;
      }
      setUrls(map);
    })();
  }, [ticketId]);

  if (!items.length) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
          <Paperclip className="w-3 h-3" /> Anexos do cliente
        </h3>
        <p className="text-xs text-muted-foreground italic">Nenhum anexo enviado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
        <Paperclip className="w-3 h-3" /> Anexos do cliente ({items.length})
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {items.map(a => {
          const isImg = (a.mime_type || '').startsWith('image/');
          const url = urls[a.id];
          return (
            <a key={a.id} href={url} target="_blank" rel="noreferrer"
              className="border rounded-md p-2 bg-card hover:bg-surface-2 transition flex flex-col gap-2 text-xs">
              {isImg && url
                ? <img src={url} alt={a.file_name} className="w-full h-24 object-cover rounded" />
                : <div className="w-full h-24 flex items-center justify-center bg-surface-2 rounded"><FileText className="w-6 h-6 text-muted-foreground" /></div>}
              <div className="flex items-center justify-between gap-1">
                <span className="truncate" title={a.file_name}>{a.file_name}</span>
                <Download className="w-3 h-3 shrink-0 text-muted-foreground" />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
