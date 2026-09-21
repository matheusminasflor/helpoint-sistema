// A tela de importar o relatório de vendas do Forteplus (L6a). Reaproveita a
// FORMA de FinImportDialog.tsx (prévia antes de gravar, contagem na tela) —
// nunca o parser: aqui o cabeçalho impresso aponta pra coluna errada em três
// campos (§3.3), e o leitor é por posição fixa (`comercial-import.ts`).
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { lerRelatorioVendas, sugerirFilial, type LeituraVendas } from '@/lib/comercial-import';
import { useCompetenciasImportadas } from '@/hooks/useComercialPainel';
import { useImportarVendas } from '@/hooks/useComercialImport';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

const DESCARTE_LABEL: Record<string, string> = {
  cabecalho_repetido: 'Cabeçalho repetido (uma vez por página)',
  em_branco: 'Linhas em branco',
  rodape: 'Rodapé (endereço, site, totais)',
  grupo_cliente: 'Cabeçalho de grupo de cliente',
};

/** Lê a planilha crua — mantém as linhas em branco (o leitor precisa contá-las na conferência, §4.3). */
async function lerMatrizXlsx(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '' });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportarVendasDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filial, setFilial] = useState<Filial | null>(null);
  const [leitura, setLeitura] = useState<LeituraVendas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [lendo, setLendo] = useState(false);

  const { data: competenciasImportadas } = useCompetenciasImportadas(filial);
  const importar = useImportarVendas();

  const competenciasDoArquivo = useMemo(
    () => [...new Set((leitura?.itens ?? []).map((i) => i.emissao.slice(0, 7) + '-01'))].sort(),
    [leitura],
  );
  const competenciasEmConflito = useMemo(
    () => competenciasDoArquivo.filter((c) => (competenciasImportadas ?? []).includes(c)),
    [competenciasDoArquivo, competenciasImportadas],
  );

  const valorPorClasse = useMemo(() => {
    const mapa = new Map<string, { linhas: number; valor: number }>();
    for (const item of leitura?.itens ?? []) {
      const atual = mapa.get(item.classe) ?? { linhas: 0, valor: 0 };
      atual.linhas++;
      atual.valor += item.valor_nota;
      mapa.set(item.classe, atual);
    }
    return mapa;
  }, [leitura]);

  const reset = () => {
    setFile(null); setFilial(null); setLeitura(null); setErro(null); setSubstituir(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const processar = async (selecionado: File, filialEscolhida: Filial | null) => {
    setLendo(true);
    setErro(null);
    try {
      const matriz = await lerMatrizXlsx(selecionado);
      if (filialEscolhida) {
        setLeitura(lerRelatorioVendas(matriz, filialEscolhida));
      } else {
        // Guarda a matriz decodificando a filial sugerida provisoriamente —
        // ela é só um argumento passado adiante (não muda a leitura, §4.8) —
        // então dá pra montar a prévia com qualquer valor e refazer quando
        // a pessoa confirmar.
        setLeitura(lerRelatorioVendas(matriz, 'MF'));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLeitura(null);
    } finally {
      setLendo(false);
    }
  };

  const handleFile = async (selecionado: File) => {
    setFile(selecionado);
    const sugestao = sugerirFilial(selecionado.name);
    setFilial(sugestao);
    await processar(selecionado, sugestao);
  };

  const confirmar = async () => {
    if (!leitura || !file || !filial) return;
    const resumo = await importar.mutateAsync({
      filial,
      fileName: file.name,
      linhasLidas: leitura.linhasLidas,
      descartes: leitura.descartes,
      itens: leitura.itens,
      substituir,
    });
    if (resumo) {
      reset();
      onOpenChange(false);
    }
  };

  const bloqueado = !leitura || !filial || lendo || importar.isPending
    || (competenciasEmConflito.length > 0 && !substituir);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar vendas — relatório do Forteplus</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="com-vendas-file">Arquivo (.xlsx) — "Mercadorias Vendidas - Produtos"</Label>
              <input
                id="com-vendas-file"
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="com-vendas-filial">Filial</Label>
              <Select
                value={filial ?? undefined}
                onValueChange={(v) => { const f = v as Filial; setFilial(f); if (file) processar(file, f); }}
              >
                <SelectTrigger id="com-vendas-filial"><SelectValue placeholder="Confirme a filial" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MF">MF</SelectItem>
                  <SelectItem value="INBRAS">INBRAS</SelectItem>
                </SelectContent>
              </Select>
              {!filial && file && (
                <p className="text-[11px] text-muted-foreground">
                  O nome do arquivo não diz sozinho qual filial é — confirme antes de importar.
                </p>
              )}
            </div>
          </div>

          {lendo && <p className="text-[13px] text-muted-foreground">Lendo a planilha...</p>}

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
                <div className="grid gap-2 sm:grid-cols-3 text-[13px]">
                  <div><span className="text-muted-foreground">Linhas lidas: </span><strong>{leitura.linhasLidas}</strong></div>
                  <div><span className="text-muted-foreground">Itens encontrados: </span><strong>{leitura.itens.length}</strong></div>
                  <div><span className="text-muted-foreground">Competências: </span><strong>{competenciasDoArquivo.map(competenceLabel).join(', ') || '—'}</strong></div>
                </div>
                <div className="text-[13px]">
                  <span className="text-muted-foreground">Descartes: </span>
                  {Object.entries(leitura.descartes).filter(([, n]) => n > 0).map(([motivo, n]) => (
                    <span key={motivo} className="mr-3"><strong>{n}</strong> {DESCARTE_LABEL[motivo] ?? motivo}</span>
                  ))}
                </div>
                <div className="text-[13px]">
                  {[...valorPorClasse.entries()].map(([classe, v]) => (
                    <span key={classe} className="mr-3"><strong>{v.linhas}</strong> {classe}: <strong className="font-mono">{formatBRL(v.valor)}</strong></span>
                  ))}
                </div>
              </div>

              {leitura.cfopsDesconhecidos.length > 0 && (
                <div className="rounded-lg border border-border badge-warning p-3 text-[13px]">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    CFOP fora da lista — entra como "outros" e aparece no quadro da tela
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {leitura.cfopsDesconhecidos.map((c) => (
                      <li key={c.cfop}>CFOP {c.cfop}: {c.linhas} linha(s), {formatBRL(c.valor)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {competenciasEmConflito.length > 0 && (
                <div className="rounded-lg border border-border badge-warning p-3 text-[13px] space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    Competência já importada: {competenciasEmConflito.map(competenceLabel).join(', ')}
                  </div>
                  <label className="flex items-center gap-2">
                    <Checkbox checked={substituir} onCheckedChange={(v) => setSubstituir(v === true)} />
                    <span>Substituir o que já está lá (apaga as linhas dessas competências e grava de novo)</span>
                  </label>
                </div>
              )}
            </>
          )}

          <p className="text-[11px] text-muted-foreground">
            Os números vêm das planilhas importadas aqui. O HTML gerado antes saiu de outra
            exportação e não vai bater — compare com o Forteplus, não com o arquivo antigo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={confirmar} disabled={bloqueado}>
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            {importar.isPending ? 'Importando...' : `Confirmar importação${leitura ? ` (${leitura.itens.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
