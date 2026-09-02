import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useImportFinEntries } from '@/hooks/useFinanceiro';
import {
  FIELD_LABEL, REQUIRED_FIELDS, parseMatrix, readSheet,
  type FinField, type ImportFormat, type ParseResult,
} from '@/lib/finance-import';
import {
  competenceLabel, formatBRL, formatDateBR, KIND_LABEL,
  type FinEntry, type FinKind,
} from '@/types/financeiro';

const FORMATS: { value: ImportFormat; label: string }[] = [
  { value: 'generic', label: 'Planilha genérica (detectar colunas)' },
  { value: 'forteplus', label: 'Exportação Forteplus' },
];

const MAPPABLE: FinField[] = [
  'description', 'counterparty', 'category', 'document_number',
  'amount', 'due_date', 'settled_at', 'status', 'payment_method', 'cost_center', 'notes',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FinKind;
  /** Lançamentos já existentes, usados para alertar competência repetida. */
  existing: FinEntry[];
}

export function FinImportDialog({ open, onOpenChange, kind, existing }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<ImportFormat>('generic');
  const [file, setFile] = useState<File | null>(null);
  const [matrix, setMatrix] = useState<unknown[][]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<FinField, number>>>({});
  const [result, setResult] = useState<ParseResult | null>(null);
  const [reading, setReading] = useState(false);
  const importer = useImportFinEntries();

  const existingCompetences = useMemo(
    () => new Set(existing.map(e => e.competence?.slice(0, 7))),
    [existing],
  );

  const duplicated = useMemo(
    () => (result?.competences || []).filter(c => existingCompetences.has(c.slice(0, 7))),
    [result, existingCompetences],
  );

  const reset = () => {
    setFile(null); setMatrix([]); setResult(null); setOverrides({});
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (selected: File) => {
    setReading(true);
    try {
      const data = await readSheet(selected);
      setFile(selected);
      setMatrix(data);
      setOverrides({});
      setResult(parseMatrix(data, kind, { format }));
    } finally {
      setReading(false);
    }
  };

  const applyOverride = (field: FinField, columnIndex: number) => {
    const next = { ...overrides, [field]: columnIndex };
    setOverrides(next);
    setResult(parseMatrix(matrix, kind, { overrides: next, format }));
  };

  const confirm = async () => {
    if (!result || !file || result.rows.length === 0) return;
    await importer.mutateAsync({ kind, fileName: file.name, format, rows: result.rows });
    reset();
    onOpenChange(false);
  };

  const blocked = !result || result.missingRequired.length > 0 || result.rows.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha — {KIND_LABEL[kind]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fin-format">Formato do arquivo</Label>
              <Select
                value={format}
                onValueChange={(v) => {
                  const next = v as ImportFormat;
                  setFormat(next);
                  if (matrix.length) setResult(parseMatrix(matrix, kind, { overrides, format: next }));
                }}
              >
                <SelectTrigger id="fin-format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-file">Arquivo (.xlsx, .xls ou .csv)</Label>
              <input
                id="fin-file"
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold"
              />
            </div>
          </div>

          {reading && <p className="text-[13px] text-muted-foreground">Lendo a planilha...</p>}

          {result && (
            <>
              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <FileSpreadsheet className="w-4 h-4 text-primary" aria-hidden="true" />
                  {file?.name}
                </div>
                <div className="grid gap-2 sm:grid-cols-3 text-[13px]">
                  <div><span className="text-muted-foreground">Linhas válidas: </span><strong>{result.rows.length}</strong></div>
                  <div><span className="text-muted-foreground">Linhas ignoradas: </span><strong>{result.errors.length}</strong></div>
                  <div><span className="text-muted-foreground">Total: </span><strong className="font-mono">{formatBRL(result.totalAmount)}</strong></div>
                </div>
                <div className="text-[13px]">
                  <span className="text-muted-foreground">Competências no arquivo: </span>
                  <strong>{result.competences.map(competenceLabel).join(', ') || '—'}</strong>
                </div>
              </div>

              {result.missingRequired.length > 0 && (
                <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    Não foi possível identificar automaticamente: {result.missingRequired.map(f => FIELD_LABEL[f]).join(', ')}
                  </div>
                  <p className="mt-1">Aponte as colunas manualmente abaixo antes de confirmar.</p>
                </div>
              )}

              {duplicated.length > 0 && (
                <div className="rounded-lg border border-border badge-warning p-3 text-[13px]">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    Competência já importada: {duplicated.map(competenceLabel).join(', ')}
                  </div>
                  <p className="mt-1">
                    O histórico nunca é sobrescrito: confirmar vai <strong>somar</strong> estes lançamentos aos existentes.
                    Se for reenvio do mesmo mês, remova a importação anterior em Configurações do Financeiro.
                  </p>
                </div>
              )}

              {result.headers.length > 0 && (
                <details className="rounded-lg border border-border bg-card p-3">
                  <summary className="cursor-pointer text-[13px] font-semibold">Conferir o mapa de colunas</summary>
                  <div className="grid gap-2 sm:grid-cols-2 pt-3">
                    {MAPPABLE.map(field => (
                      <div key={field} className="space-y-1">
                        <Label htmlFor={`map-${field}`} className="text-xs">
                          {FIELD_LABEL[field]}{REQUIRED_FIELDS.includes(field) ? ' *' : ''}
                        </Label>
                        <Select
                          value={String(result.mapping[field] ?? -1)}
                          onValueChange={(v) => applyOverride(field, Number(v))}
                        >
                          <SelectTrigger id={`map-${field}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">Não usar</SelectItem>
                            {result.headers.map((h, i) => (
                              <SelectItem key={`${h}-${i}`} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {result.rows.length > 0 && (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-secondary/60 text-left text-muted-foreground">
                        <th className="px-2 py-1.5 font-semibold">Descrição</th>
                        <th className="px-2 py-1.5 font-semibold">Parte</th>
                        <th className="px-2 py-1.5 font-semibold">Vencimento</th>
                        <th className="px-2 py-1.5 font-semibold text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 8).map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1.5 max-w-[240px] truncate">{r.description}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.counterparty || '—'}</td>
                          <td className="px-2 py-1.5 font-mono">{formatDateBR(r.due_date)}</td>
                          <td className="px-2 py-1.5 font-mono text-right">{formatBRL(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.rows.length > 8 && (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground border-t border-border">
                      Prévia das 8 primeiras de {result.rows.length} linhas.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={confirm} disabled={blocked || importer.isPending}>
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            {importer.isPending ? 'Importando...' : `Confirmar importação${result ? ` (${result.rows.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
