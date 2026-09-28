// Importar a ficha cadastral de clientes do Forteplus — o "Relatório Geral de Cliente".
//
// POR QUE É OUTRO DIÁLOGO, e não uma opção no `ImportarClientesDialog`. Os dois
// arquivos respondem a perguntas diferentes e o resultado que a pessoa precisa ver é
// diferente: o CSV de clientes × tabela **cria** cliente e o que interessa é quantos
// caíram em cada tabela de preço; a ficha **não cria ninguém** — ela completa quem já
// está lá, e o que interessa é quantos casaram, quantos não, e quantos campos foram
// preenchidos. Um diálogo com dois modos teria dois resumos, dois avisos e um
// "formato" para escolher errado.
import { useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { lerFichaDeArquivo, type LeituraFicha } from '@/lib/forteplus-ficha';
import { useImportarFichaClientes } from '@/hooks/useComercialImport';

const CAMPOS: { chave: keyof LeituraFicha['preenchidos']; label: string }[] = [
  { chave: 'documento', label: 'CNPJ / CPF' },
  { chave: 'endereco', label: 'Endereço' },
  { chave: 'cep', label: 'CEP' },
  { chave: 'cidade', label: 'Cidade' },
  { chave: 'estado', label: 'Estado' },
  { chave: 'email', label: 'E-mail' },
  { chave: 'telefone', label: 'Telefone' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportarFichaDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<LeituraFicha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const importar = useImportarFichaClientes();

  const reset = () => {
    setFile(null); setLeitura(null); setErro(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (selecionado: File) => {
    setLendo(true);
    setErro(null);
    try {
      setLeitura(await lerFichaDeArquivo(selecionado));
      setFile(selecionado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLeitura(null);
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!leitura || !file) return;
    await importar.mutateAsync({ fileName: file.name, fichas: leitura.fichas });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Completar cadastro com a ficha do Forteplus</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            No Forteplus: <strong>Relatório Geral de Cliente</strong>, exportado em Excel. Ele traz
            CNPJ, endereço, CEP, cidade, estado, e-mail e telefone. A importação <strong>não cria
            cliente nenhum</strong> e <strong>não apaga nada</strong>: casa pela razão social e só
            preenche campo que está vazio. O vendedor da carteira não vem do Forteplus — isso
            continua sendo definido aqui.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="com-ficha-file">Arquivo (.xlsx)</Label>
            <input
              id="com-ficha-file"
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold"
            />
          </div>

          {lendo && <p className="text-[13px] text-muted-foreground">Lendo a ficha...</p>}

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
                  <FileSpreadsheet className="w-4 h-4 text-primary" aria-hidden="true" />
                  {file?.name}
                </div>
                <div className="text-[13px]">
                  <span className="text-muted-foreground">Fichas no arquivo: </span>
                  <strong>{leitura.fichas.length}</strong>
                </div>
              </div>

              {leitura.repetidas.length > 0 && (
                <div className="rounded-lg border border-border badge-warning p-3 text-[13px]">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    {leitura.repetidas.length} razões sociais aparecem mais de uma vez
                  </div>
                  {/* Nome repetido é ambíguo: preencher "o primeiro que aparecer"
                      gravaria o endereço de um cliente na ficha de outro. Melhor
                      deixar os dois como estão e mostrar quem são. */}
                  <p className="mt-1">
                    Estas ficam de fora, porque não dá para saber a qual cliente pertencem:{' '}
                    {leitura.repetidas.slice(0, 3).join('; ')}
                    {leitura.repetidas.length > 3 ? ` e ${leitura.repetidas.length - 3} outras` : ''}.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-secondary/60 text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-semibold">Campo</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Fichas que trazem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAMPOS.map(({ chave, label }) => (
                      <tr key={chave} className="border-t border-border">
                        <td className="px-2 py-1.5">{label}</td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {leitura.preenchidos[chave]} de {leitura.fichas.length}
                        </td>
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
          <Button onClick={confirmar} disabled={!leitura || !!erro || importar.isPending}>
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            {importar.isPending ? 'Completando...' : `Completar cadastro${leitura ? ` (${leitura.fichas.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
