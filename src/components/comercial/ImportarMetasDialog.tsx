// Diálogo de importar as metas do diretor (Frente 2), na aba Metas da
// Diretoria. Ver docs/metas-e-carteiras-fonte-da-verdade.md e
// .scratch/plano-frente2-metas-e-carteiras.md §3. Reaproveita a FORMA de
// `ImportarVendasDialog.tsx` (prévia antes de gravar) — o parser é outro:
// aqui é JSON, não planilha, e a normalização de verdade mora na RPC
// (`com_importar_metas`/`com_importar_metas_do_ano`); este diálogo só
// valida a forma do arquivo e mostra a prévia (`src/lib/metas-import.ts`).
import { useRef, useState } from 'react';
import { AlertTriangle, FileJson, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizarHistoricoMetas, normalizarMetasDoAno, resolverCarteiraImportada, type PreviaHistoricoMetas } from '@/lib/metas-import';
import { useImportarMetas, useImportarMetasDoAno, useRenomeacoesCarteira } from '@/hooks/useComercialCarteirasMetas';
import { formatBRL } from '@/types/financeiro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Modo = 'historico' | 'ano';

export function ImportarMetasDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [modo, setModo] = useState<Modo>('historico');
  const [fileName, setFileName] = useState<string | null>(null);
  const [jsonBruto, setJsonBruto] = useState<unknown | null>(null);
  const [previaHistorico, setPreviaHistorico] = useState<PreviaHistoricoMetas | null>(null);
  const [previaAno, setPreviaAno] = useState<{ ano: number; metas: Array<number | null> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const importarHistorico = useImportarMetas();
  const importarAno = useImportarMetasDoAno();
  const importando = importarHistorico.isPending || importarAno.isPending;
  // Frente 6 (.scratch/plano-frente6-importacoes.md §4): a memória de
  // renomeações, para a prévia mostrar o nome que a RPC vai gravar de
  // verdade — não a chave crua do JSON.
  const { data: renomeacoes = [] } = useRenomeacoesCarteira();

  const reset = () => {
    setFileName(null); setJsonBruto(null); setPreviaHistorico(null); setPreviaAno(null); setErro(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setErro(null);
    setFileName(file.name);
    try {
      const texto = await file.text();
      const json = JSON.parse(texto);
      setJsonBruto(json);
      if (modo === 'historico') {
        setPreviaHistorico(normalizarHistoricoMetas(json));
        setPreviaAno(null);
      } else {
        setPreviaAno(normalizarMetasDoAno(json));
        setPreviaHistorico(null);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler este arquivo como JSON.');
      setJsonBruto(null);
      setPreviaHistorico(null);
      setPreviaAno(null);
    }
  };

  const confirmar = async () => {
    if (jsonBruto == null || !fileName) return;
    if (modo === 'historico') {
      const resultado = await importarHistorico.mutateAsync({ fileName, json: jsonBruto });
      if (resultado) { reset(); onOpenChange(false); }
    } else if (previaAno) {
      await importarAno.mutateAsync({ ano: previaAno.ano, metas: previaAno.metas });
      reset();
      onOpenChange(false);
    }
  };

  const bloqueado = !jsonBruto || !!erro || importando;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar metas do diretor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>O que você está importando</Label>
            <Select value={modo} onValueChange={(v) => { setModo(v as Modo); reset(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="historico">HISTORICO_METAS.json — realizado por carteira, total e metas de todos os anos</SelectItem>
                <SelectItem value="ano">METAS_&lt;ano&gt;.json — só a meta de um ano, sobrepondo a do histórico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="metas-file">Arquivo (.json)</Label>
            <input
              id="metas-file"
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold"
            />
          </div>

          {erro && (
            <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                {erro}
              </div>
            </div>
          )}

          {previaHistorico && !erro && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <FileJson className="w-4 h-4 text-primary" aria-hidden="true" />
                {fileName}
              </div>
              <p className="text-[13px] text-muted-foreground">
                Reimportar um ano substitui as linhas daquele ano no banco — os outros anos não são tocados.
              </p>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="py-1.5 px-2 font-medium">Ano</th>
                      <th className="py-1.5 px-2 font-medium">Carteiras</th>
                      <th className="py-1.5 px-2 font-medium">Meta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previaHistorico.anos.map((a) => (
                      <tr key={a.ano}>
                        <td className="py-1 px-2">{a.ano}</td>
                        {/* Item da Frente 6: nome RESOLVIDO, não a chave crua — "VIP" no
                            arquivo aparece como "VIP → ESPECIAL (renomeada)" quando a
                            memória já resolveu essa carteira, para o dono nunca confirmar
                            uma coisa e o banco gravar outra. */}
                        <td className="py-1 px-2">
                          {a.carteiras.map((c) => {
                            const resolvida = resolverCarteiraImportada(c.carteira, renomeacoes);
                            return resolvida.final === resolvida.original
                              ? resolvida.original
                              : `${resolvida.original} → ${resolvida.final} (renomeada)`;
                          }).join(', ')}
                        </td>
                        <td className="py-1 px-2 text-muted-foreground">
                          {a.meta === null ? 'sem meta neste arquivo' : `${a.meta.filter((v) => v != null).length} de 12 meses`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {previaAno && !erro && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <FileJson className="w-4 h-4 text-primary" aria-hidden="true" />
                {fileName}
              </div>
              <p className="text-[13px]">
                Sobrepõe a meta de <strong>{previaAno.ano}</strong>, mês a mês — não muda o realizado nem a meta_total.
              </p>
              <div className="text-[12px] text-muted-foreground">
                {previaAno.metas.map((v, i) => (
                  <span key={i} className="mr-3">{v == null ? '—' : formatBRL(v)}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={confirmar} disabled={bloqueado}>
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            {importando ? 'Importando...' : 'Confirmar importação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
