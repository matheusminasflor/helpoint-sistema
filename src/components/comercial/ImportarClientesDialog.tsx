// A tela de importar o CSV de clientes × tabela de preço (L6a). O arquivo do
// dono é Windows-1252 sem BOM (§3.6) — `lerCadastroClientes` decodifica com
// UTF-8 estrito primeiro, e cai para Windows-1252 quando ele lança.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { lerCadastroClientes, type LeituraClientes } from '@/lib/comercial-import';
import { useImportarClientes } from '@/hooks/useComercialImport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportarClientesDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<LeituraClientes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const importar = useImportarClientes();

  const tabelasOrdenadas = useMemo(
    () => Object.entries(leitura?.tabelas ?? {}).sort((a, b) => b[1] - a[1]),
    [leitura],
  );

  const reset = () => {
    setFile(null); setLeitura(null); setErro(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (selecionado: File) => {
    setLendo(true);
    setErro(null);
    try {
      const bytes = await selecionado.arrayBuffer();
      setFile(selecionado);
      setLeitura(lerCadastroClientes(bytes));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLeitura(null);
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!leitura || !file) return;
    const resumo = await importar.mutateAsync({ fileName: file.name, clientes: leitura.clientes });
    if (resumo) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar clientes × tabela de preço</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="com-clientes-file">Arquivo (.csv)</Label>
            <input
              id="com-clientes-file"
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold"
            />
          </div>

          {lendo && <p className="text-[13px] text-muted-foreground">Lendo o arquivo...</p>}

          {erro && (
            <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                {erro}
              </div>
            </div>
          )}

          {leitura && !erro && (
            <>
              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                  {file?.name}
                </div>
                <div className="grid gap-2 sm:grid-cols-3 text-[13px]">
                  <div><span className="text-muted-foreground">Clientes: </span><strong>{leitura.clientes.length}</strong></div>
                  <div><span className="text-muted-foreground">Com tabela: </span><strong>{leitura.clientes.length - leitura.semTabela}</strong></div>
                  <div><span className="text-muted-foreground">Sem tabela: </span><strong>{leitura.semTabela}</strong></div>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-secondary/60 text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-semibold">Tabela</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Clientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelasOrdenadas.map(([tabela, n]) => (
                      <tr key={tabela} className="border-t border-border">
                        <td className="px-2 py-1.5">{tabela}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!leitura || importar.isPending}>
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            {importar.isPending ? 'Importando...' : `Confirmar importação${leitura ? ` (${leitura.clientes.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
