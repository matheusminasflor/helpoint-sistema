import { FileText } from 'lucide-react';
import { useUrlDoAnexo, type AnexoDaMensagem } from '@/hooks/useChat';
import { tipoDoAnexo } from '@/lib/chat-midia';

/** O anexo dentro do balão: a foto, o player do áudio ou o link do arquivo (20270119010000). */
export function AnexoDoChat({ anexo }: { anexo: AnexoDaMensagem }) {
  const apagado = !!anexo.anexo_apagado_em;
  const { data: url } = useUrlDoAnexo(anexo.anexo_path, apagado);
  if (!anexo.anexo_path) return null;
  if (apagado) {
    return <p className="text-[12px] italic text-muted-foreground">Anexo apagado para liberar espaço.</p>;
  }
  if (!url) return <div className="h-10 w-40 rounded bg-muted animate-pulse" />;
  const tipo = tipoDoAnexo(anexo.anexo_tipo);
  if (tipo === 'foto') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt={anexo.anexo_nome ?? 'Foto'} className="max-h-64 max-w-full rounded-md border border-border" loading="lazy" />
      </a>
    );
  }
  if (tipo === 'audio') return <audio controls src={url} className="max-w-full h-10" preload="metadata" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[14px] text-primary underline break-all">
      <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
      {anexo.anexo_nome ?? 'Arquivo'}
      {anexo.anexo_bytes ? <span className="text-muted-foreground no-underline"> ({Math.max(1, Math.round(anexo.anexo_bytes / 1024))} KB)</span> : null}
    </a>
  );
}
