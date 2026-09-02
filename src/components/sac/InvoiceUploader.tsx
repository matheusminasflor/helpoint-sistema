import { Paperclip, X, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  maxSizeMB?: number;
}

const ACCEPT = 'image/*,application/pdf';

/**
 * Anexo de Nota Fiscal — aceita imagens e PDF.
 * Limites configuráveis (padrão 5 arquivos × 5MB).
 */
export function InvoiceUploader({ files, onChange, max = 5, maxSizeMB = 5 }: Props) {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    const accepted: File[] = [];
    for (const f of incoming) {
      if (f.size > maxSizeMB * 1024 * 1024) {
        toast.error(`"${f.name}" excede ${maxSizeMB}MB.`);
        continue;
      }
      accepted.push(f);
    }
    const merged = [...files, ...accepted].slice(0, max);
    if (files.length + accepted.length > max) {
      toast.error(`Máximo de ${max} arquivos.`);
    }
    onChange(merged);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <label className="cursor-pointer inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border text-[13px] hover:bg-surface-2">
        <Paperclip className="w-4 h-4" />
        Anexar nota fiscal
        <input type="file" accept={ACCEPT} multiple className="hidden" onChange={handle} />
      </label>
      <p className="text-[11px] text-muted-foreground">
        Aceita PDF, JPG ou PNG · Máx. {max} arquivos × {maxSizeMB}MB cada.
      </p>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs bg-surface-2 border rounded px-2 py-1"
            >
              <FileText className="w-3 h-3" />
              {f.name}
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="ml-1 hover:text-destructive"
                aria-label="Remover"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
