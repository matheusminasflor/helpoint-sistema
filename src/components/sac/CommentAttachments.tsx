import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download } from 'lucide-react';

interface Attachment { file_name: string; file_path: string; mime_type?: string; file_size?: number; }
interface Props { attachments?: Attachment[] | null; }

export function CommentAttachments({ attachments }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      if (!attachments?.length) return;
      const map: Record<string, string> = {};
      for (const a of attachments) {
        const { data, error } = await supabase.storage.from('sac-attachments').createSignedUrl(a.file_path, 60 * 60);
        if (error) { console.error(error); continue; }
        if (data?.signedUrl) map[a.file_path] = data.signedUrl;
      }
      setUrls(map);
    })();
  }, [attachments]);

  if (!attachments?.length) return null;

  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {attachments.map((a) => {
        const url = urls[a.file_path];
        const isImg = (a.mime_type || '').startsWith('image/');
        return (
          <a key={a.file_path} href={url} target="_blank" rel="noreferrer"
            className="border rounded-md p-1.5 bg-background/60 hover:bg-background transition flex flex-col gap-1 text-xs text-foreground">
            {isImg && url
              ? <img src={url} alt={a.file_name} className="w-full h-20 object-cover rounded" />
              : <div className="w-full h-20 flex items-center justify-center bg-muted rounded"><FileText className="w-5 h-5 text-muted-foreground" /></div>}
            <span className="truncate flex items-center gap-1" title={a.file_name}>
              <Download className="w-3 h-3 shrink-0" />{a.file_name}
            </span>
          </a>
        );
      })}
    </div>
  );
}
