import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Package, Image as ImageIcon, Download } from 'lucide-react';

export interface SACProductItem {
  id: string;
  sort_order: number;
  product_name: string | null;
  product_batch: string | null;
  quantity: number | string | null;
  description: string | null;
  attachments: Array<{
    file_name: string;
    file_path: string;
    mime_type?: string;
    file_size?: number;
  }> | unknown;
}

type SignedMap = Record<string, string>;

interface Props {
  items: SACProductItem[];
  /** 'customer' (mais leve/intimista) ou 'staff' (mais informativo) */
  variant?: 'customer' | 'staff';
}

/**
 * Renderiza, em destaque, a reclamação completa de cada produto do SAC
 * (nome, lote, quantidade, descrição, anexos clicáveis com miniaturas).
 */
export function ProductComplaintsList({ items, variant = 'customer' }: Props) {
  const [signed, setSigned] = useState<SignedMap>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paths: string[] = [];
      for (const it of items) {
        const atts = Array.isArray(it.attachments) ? it.attachments : [];
        for (const a of atts as any[]) if (a?.file_path) paths.push(a.file_path);
      }
      if (!paths.length) { setSigned({}); return; }
      const out: SignedMap = {};
      await Promise.all(
        paths.map(async (p) => {
          const { data } = await supabase.storage
            .from('sac-attachments')
            .createSignedUrl(p, 3600);
          if (data?.signedUrl) out[p] = data.signedUrl;
        }),
      );
      if (!cancelled) setSigned(out);
    })();
    return () => { cancelled = true; };
  }, [items]);

  if (!items.length) return null;

  const isImage = (mime?: string, name?: string) => {
    if (mime?.startsWith('image/')) return true;
    if (!name) return false;
    return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Reclamações por produto ({items.length})
        </h3>
      </div>

      <div className="space-y-3">
        {items.map((p, i) => {
          const atts = Array.isArray(p.attachments) ? (p.attachments as any[]) : [];
          return (
            <div
              key={p.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Produto {i + 1} de {items.length}
                  </p>
                  <p className="text-base font-bold text-foreground mt-0.5 break-words">
                    {p.product_name || '—'}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    {p.product_batch && <span>Lote: <strong className="text-foreground">{p.product_batch}</strong></span>}
                    {p.quantity != null && p.quantity !== '' && (
                      <span>Quantidade: <strong className="text-foreground">{p.quantity}</strong></span>
                    )}
                  </div>
                </div>
              </div>

              {p.description ? (
                <div className="mt-3 rounded-md bg-surface-1 border border-border/60 p-3">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">
                    {variant === 'customer' ? 'O que você relatou' : 'Relato do cliente'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-foreground">{p.description}</p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground italic">
                  Sem descrição adicional para este produto.
                </p>
              )}

              {atts.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> Anexos ({atts.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {atts.map((a: any, j: number) => {
                      const url = signed[a.file_path];
                      const img = isImage(a.mime_type, a.file_name);
                      if (img && url) {
                        return (
                          <a
                            key={j}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-20 h-20 rounded-md border overflow-hidden bg-surface-2 hover:ring-2 hover:ring-primary transition"
                            title={a.file_name}
                          >
                            <img
                              src={url}
                              alt={`${p.product_name || 'Produto'} — ${a.file_name}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        );
                      }
                      return (
                        <a
                          key={j}
                          href={url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border bg-surface-2 hover:bg-surface-1 ${url ? '' : 'pointer-events-none opacity-60'}`}
                          title={a.file_name}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="max-w-[180px] truncate">{a.file_name}</span>
                          <Download className="w-3 h-3 opacity-60" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
