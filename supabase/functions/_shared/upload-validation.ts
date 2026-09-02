// Validação de uploads no servidor: whitelist de extensão + mime, limite de tamanho
// e saneamento de nome de arquivo (anti path traversal).

export type UploadKind = 'attachment' | 'document' | 'image' | 'branding';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const DOC_EXT = [...IMAGE_EXT, 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'];
const DOC_MIME = [
  ...IMAGE_MIME,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
];

const RULES: Record<UploadKind, { ext: string[]; mime: string[]; maxBytes: number }> = {
  attachment: { ext: DOC_EXT, mime: DOC_MIME, maxBytes: 10 * 1024 * 1024 },
  document: { ext: DOC_EXT, mime: DOC_MIME, maxBytes: 10 * 1024 * 1024 },
  image: { ext: IMAGE_EXT, mime: IMAGE_MIME, maxBytes: 10 * 1024 * 1024 },
  branding: { ext: IMAGE_EXT, mime: IMAGE_MIME, maxBytes: 2 * 1024 * 1024 },
};

/** Remove diretórios, caracteres perigosos e limita o tamanho do nome. */
export function sanitizeFileName(name: string): string {
  const base = String(name || 'arquivo').split(/[\\/]/).pop() || 'arquivo';
  const cleaned = base
    .replace(/\.\./g, '.')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-120);
  return cleaned || 'arquivo';
}

export function validateUploadMeta(
  file: { name: string; size?: number; mime?: string },
  kind: UploadKind,
): { ok: true; safeName: string } | { ok: false; error: string } {
  const rule = RULES[kind];
  const safeName = sanitizeFileName(file.name);
  const ext = safeName.includes('.') ? safeName.split('.').pop()!.toLowerCase() : '';

  if (!ext || !rule.ext.includes(ext)) return { ok: false, error: 'file_type_not_allowed' };
  if (file.mime && !rule.mime.includes(String(file.mime).toLowerCase())) {
    return { ok: false, error: 'file_type_not_allowed' };
  }
  if (typeof file.size === 'number' && (file.size <= 0 || file.size > rule.maxBytes)) {
    return { ok: false, error: 'file_too_large' };
  }
  return { ok: true, safeName };
}
