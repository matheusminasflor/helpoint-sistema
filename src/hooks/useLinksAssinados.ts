import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * O link do anexo é montado na hora, e não guardado.
 *
 * `ticket-attachments` é um balde **privado**: endereço público dele não
 * existe, e era isso que estava gravado em `ticket_attachments.file_url`. O
 * anexo aparecia na conversa com o nome certo e, ao clicar, não abria — sem
 * nenhuma mensagem. Agora a coluna guarda o **caminho** e o link assinado nasce
 * aqui, com uma hora de validade. É o mesmo desenho de
 * `src/components/sac/CommentAttachments.tsx`.
 */
export function useLinksAssinados(caminhos: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const chave = caminhos.join('|');
  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!caminhos.length) return;
      const mapa: Record<string, string> = {};
      for (const caminho of caminhos) {
        const { data, error } = await supabase.storage
          .from('ticket-attachments').createSignedUrl(caminho, 60 * 60);
        if (error) { console.error(error); continue; }
        if (data?.signedUrl) mapa[caminho] = data.signedUrl;
      }
      if (!cancelado) setUrls(mapa);
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return urls;
}
