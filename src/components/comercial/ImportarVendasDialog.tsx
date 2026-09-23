// A tela de importar o relatório de vendas do Forteplus (L6a; Frente 1:
// qualquer período, não só o mês corrente). Reaproveita a FORMA de
// FinImportDialog.tsx (prévia antes de gravar, contagem na tela) — nunca o
// parser: aqui o cabeçalho impresso aponta pra coluna errada em três campos
// (§3.3), e o leitor é por posição fixa (`comercial-import.ts`).
//
// A importação em si segue o mesmo desenho de `ComercialImportar.tsx` (CRM):
// abre (reserva a competência) → N lotes (a espera) → fecha (só publica se
// bater). Nunca deixa a importação pendurada em silêncio — um lote que falha
// para a tela e oferece descartar; fechar o diálogo no meio também descarta.
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { competenciaDe, lerRelatorioVendas, sugerirFilial, type LeituraVendas } from '@/lib/comercial-import';
import { chunk } from '@/lib/crm-import';
import { useCompetenciasImportadas, usePeriodoImportado } from '@/hooks/useComercialPainel';
import {
  mensagemDeErro,
  useDescartarImportacaoVendas, useFinalizarImportacaoVendas,
  useImportarLoteVendas, useIniciarImportacaoVendas,
} from '@/hooks/useComercialImport';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

const DESCARTE_LABEL: Record<string, string> = {
  cabecalho_repetido: 'Cabeçalho repetido (uma vez por página)',
  em_branco: 'Linhas em branco',
  rodape: 'Rodapé (endereço, site, totais)',
  grupo_cliente: 'Cabeçalho de grupo de cliente',
};

// O tamanho do lote é o teto do corpo da requisição — não uma regra de
// negócio. Ver §4 do plano da Frente 1.
const TAMANHO_DO_LOTE = 2000;

/** Lê a planilha crua — mantém as linhas em branco (o leitor precisa contá-las na conferência, §4.3). */
async function lerMatrizXlsx(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '' });
}

/** Texto do rodapé/topo: a verdade sobre o que já está publicado (§5 do plano), não sobre a última importação. */
function textoPeriodoImportado(de: string | null, ate: string | null, competencias: number): string {
  if (!de || !ate || competencias === 0) return 'Nenhuma venda importada ainda.';
  return `O sistema tem vendas de ${competenceLabel(de)} a ${competenceLabel(ate)} (${competencias} ${competencias === 1 ? 'mês' : 'meses'}).`;
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

  // Estado da importação em três tempos. `importando` cobre a chamada em
  // andamento AGORA (início, um lote, ou o fim); `importacaoId` cobre a
  // janela maior — existe entre o início e o fim (ou o descarte), mesmo nos
  // instantes entre um lote e o próximo — e é ele que diz "há algo
  // em_andamento que fechar o diálogo agora descartaria".
  const [importando, setImportando] = useState(false);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [confirmandoFechar, setConfirmandoFechar] = useState(false);

  const { data: competenciasImportadas } = useCompetenciasImportadas(filial);
  const { data: periodo } = usePeriodoImportado(filial);
  const iniciar = useIniciarImportacaoVendas();
  const loteMutation = useImportarLoteVendas();
  const finalizar = useFinalizarImportacaoVendas();
  const descartar = useDescartarImportacaoVendas();
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeSubstituir = canComoOBanco('vendas', 'substituir');

  const competenciasDoArquivo = useMemo(
    () => [...new Set((leitura?.itens ?? []).map((i) => competenciaDe(i.emissao)))].sort(),
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

  // O resumo por competência que `inicio` reserva ANTES de qualquer lote —
  // mesma classificação da prévia (item.classe já vem de `classificarCfop`),
  // porque o navegador nunca teve `com_classe_do_cfop` para chamar; a classe
  // que vale de verdade nasce de novo em cada lote, no banco.
  const resumoCompetencias = useMemo(() => {
    const porMes = new Map<string, { linhas: number; total_venda: number }>();
    for (const item of leitura?.itens ?? []) {
      const comp = competenciaDe(item.emissao);
      const atual = porMes.get(comp) ?? { linhas: 0, total_venda: 0 };
      atual.linhas++;
      if (item.classe === 'venda') atual.total_venda += item.valor_nota;
      porMes.set(comp, atual);
    }
    return [...porMes.entries()]
      .map(([competencia, v]) => ({ competencia, ...v }))
      .sort((a, b) => a.competencia.localeCompare(b.competencia));
  }, [leitura]);

  const reset = () => {
    setFile(null); setFilial(null); setLeitura(null); setErro(null); setSubstituir(false);
    setImportando(false); setImportacaoId(null); setProgresso({ feitos: 0, total: 0 }); setErroLote(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const processar = async (selecionado: File) => {
    setLendo(true);
    setErro(null);
    try {
      const matriz = await lerMatrizXlsx(selecionado);
      // Achado 11.3 da auditoria: `lerRelatorioVendas` não recebe mais
      // `filial` — a leitura nunca dependeu dela, e a gambiarra de passar
      // 'MF' como valor de mentira enquanto a pessoa não confirma a filial
      // saiu daqui. `p_filial` da RPC é quem decide, na hora de importar.
      setLeitura(lerRelatorioVendas(matriz));
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
    await processar(selecionado);
  };

  const confirmar = async () => {
    if (!leitura || !file || !filial) return;
    setImportando(true);
    setErroLote(null);
    setProgresso({ feitos: 0, total: leitura.itens.length });

    let id: string;
    try {
      id = await iniciar.mutateAsync({
        filial,
        fileName: file.name,
        linhasLidas: leitura.linhasLidas,
        descartes: leitura.descartes,
        competencias: resumoCompetencias,
        itensEsperados: leitura.itens.length,
        substituir,
        totalImpresso: leitura.totalImpresso,
      });
    } catch (e) {
      setImportando(false);
      setErroLote(mensagemDeErro(e));
      return;
    }
    setImportacaoId(id);

    let feitos = 0;
    for (const lote of chunk(leitura.itens, TAMANHO_DO_LOTE)) {
      try {
        const gravadas = await loteMutation.mutateAsync({ importacaoId: id, itens: lote });
        feitos += gravadas;
        setProgresso({ feitos, total: leitura.itens.length });
      } catch (e) {
        // Para e oferece descartar — a espera fica incompleta de propósito
        // (§3 do plano): nunca publica um mês mais leve em silêncio. O
        // `importacaoId` continua de pé para o botão de descartar usar.
        setImportando(false);
        setErroLote(mensagemDeErro(e));
        return;
      }
    }

    try {
      await finalizar.mutateAsync(id);
      reset();
      onOpenChange(false);
    } catch (e) {
      setImportando(false);
      setErroLote(mensagemDeErro(e));
    }
  };

  const descartarImportacao = async () => {
    if (importacaoId) {
      try {
        await descartar.mutateAsync(importacaoId);
      } catch (e) {
        setErroLote(mensagemDeErro(e));
        return;
      }
    }
    reset();
  };

  const pedirFechar = () => {
    if (importando || importacaoId) {
      setConfirmandoFechar(true);
      return;
    }
    reset();
    onOpenChange(false);
  };

  const confirmarFechamentoComDescarte = async () => {
    setConfirmandoFechar(false);
    await descartarImportacao();
    onOpenChange(false);
  };

  const bloqueado = !leitura || !filial || lendo || importando
    || (competenciasEmConflito.length > 0 && !substituir);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { pedirFechar(); return; } onOpenChange(v); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar vendas — relatório do Forteplus</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              {textoPeriodoImportado(periodo?.competencia_de ?? null, periodo?.competencia_ate ?? null, periodo?.competencias ?? 0)}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="com-vendas-file">Arquivo (.xlsx) — "Mercadorias Vendidas - Produtos"</Label>
                <input
                  id="com-vendas-file"
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={importando}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="com-vendas-filial">Filial</Label>
                <Select
                  value={filial ?? undefined}
                  disabled={importando}
                  // A leitura não depende mais da filial (achado 11.3): trocar
                  // a filial aqui só atualiza a confirmação, sem reprocessar.
                  onValueChange={(v) => setFilial(v as Filial)}
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
                    {/* Achado 5 da auditoria: o checkbox só aparece com
                        vendas.substituir — sem isso, quem só tem vendas.importar
                        marcava, confirmava e só descobria a falta de permissão
                        no fim (a RPC recusa; item 6 da auditoria). */}
                    {podeSubstituir ? (
                      <label className="flex items-center gap-2">
                        <Checkbox checked={substituir} onCheckedChange={(v) => setSubstituir(v === true)} disabled={importando} />
                        <span>Substituir o que já está lá (apaga as linhas dessas competências e grava de novo)</span>
                      </label>
                    ) : (
                      <p className="text-muted-foreground">
                        Substituir uma competência já importada depende de permissão no seu perfil de acesso —
                        fale com o administrador.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {progresso.total > 0 && (
              <div className="space-y-1.5">
                <Progress value={(progresso.feitos / progresso.total) * 100} />
                <p className="text-[13px] text-muted-foreground">
                  {progresso.feitos.toLocaleString('pt-BR')} de {progresso.total.toLocaleString('pt-BR')} itens
                </p>
              </div>
            )}

            {erroLote && (
              <div className="rounded-lg border border-border badge-danger p-3 text-[13px] space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  {erroLote}
                </div>
                <p className="text-muted-foreground">
                  A importação parou no meio — nada do que já subiu entra no faturamento até terminar.
                  Descarte para começar de novo.
                </p>
                <Button size="sm" variant="outline" onClick={descartarImportacao} disabled={descartar.isPending}>
                  Descartar importação
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={pedirFechar}>Cancelar</Button>
            <Button onClick={confirmar} disabled={bloqueado}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              {importando ? 'Importando...' : `Confirmar importação${leitura ? ` (${leitura.itens.length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmandoFechar} onOpenChange={setConfirmandoFechar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar esta importação?</AlertDialogTitle>
            <AlertDialogDescription>
              A importação ainda não terminou. Fechar agora descarta o que já foi enviado — nada
              entra no faturamento pela metade. Recomeçar depois é só importar o arquivo de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar importando</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarFechamentoComDescarte}>Descartar e fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
