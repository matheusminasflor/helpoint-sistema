// Importar colaboradores pela planilha (rodada 2, R4; decisões do dono de 2026-10-25). Baixar o modelo (vazio, ou com a
// lista atual para completar), preencher, ver a PRÉVIA (o banco confere e conta sem gravar) e importar. O CPF identifica:
// importar de novo atualiza; sem CPF igual, o banco procura pelo e-mail (as pessoas copiadas do login ainda não têm CPF).
// Empresa que o RH ainda não tem é criada pelo nome. O molde é `ImportarModeloDeClientesDialog.tsx`.
import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { readSheets } from '@/lib/planilha';
import { todayISO } from '@/lib/dates';
import {
  OBRIGATORIAS_DO_MODELO, baixarModeloDeColaboradores, lerModeloDeColaboradores, type LeituraDoModeloDeColaboradores,
} from '@/lib/modelo-de-colaboradores';
import {
  useImportarColaboradores, useRHCompanies, useRHEmployees, type ResultadoDaImportacaoDeColaboradores,
} from '@/hooks/useRH';

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

export function ImportarColaboradoresDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraDoModeloDeColaboradores | null>(null);
  const [previa, setPrevia] = useState<ResultadoDaImportacaoDeColaboradores | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { employees } = useRHEmployees();
  const { companies } = useRHCompanies();
  const importar = useImportarColaboradores();

  const reset = () => {
    setArquivo(null); setLeitura(null); setPrevia(null); setErro(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const baixar = (comALista: boolean) => {
    const empresa = new Map(companies.map((c) => [c.id, c.name]));
    baixarModeloDeColaboradores(
      comALista ? employees.map((e) => ({ ...e, empresa: e.company_id ? empresa.get(e.company_id) ?? null : null })) : [],
      comALista ? `colaboradores-${todayISO()}.xlsx` : 'modelo-colaboradores.xlsx',
    );
  };

  const lerArquivo = async (file: File) => {
    setErro(null); setPrevia(null);
    try {
      const lida = lerModeloDeColaboradores(await readSheets(file));
      if (lida.linhas.length === 0 && lida.recusadas.length === 0) throw new Error('A planilha não tem nenhuma pessoa preenchida.');
      setLeitura(lida);
      setArquivo(file.name);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLeitura(null);
    }
  };

  const enviar = (confirmar: boolean) => importar.mutateAsync({ linhas: leitura?.linhas ?? [], confirmar });
  const verPrevia = async () => setPrevia(await enviar(false));
  const confirmar = async () => { await enviar(true); reset(); onOpenChange(false); };
  // As linhas recusadas já na leitura (data que não é data) somam com as que o banco recusa.
  const recusadas = [...(leitura?.recusadas ?? []), ...(previa?.recusadas ?? [])].sort((a, b) => a.linha - b.linha);
  const vaiGravar = !!previa && previa.criar + previa.atualizar > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar colaboradores pela planilha</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-[14px]">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="font-semibold">1. Baixe o modelo</p>
            <p className="text-muted-foreground">
              Uma linha por pessoa, com ou sem login no Helpoint. Obrigatórios:{' '}
              <strong>{OBRIGATORIAS_DO_MODELO.map((c) => c.toLowerCase()).join(', ')}</strong>. O CPF identifica a pessoa:
              importar de novo atualiza, não duplica. Baixe com a lista atual para completar quem já está nela.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => baixar(true)}>
                <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Baixar a lista atual no modelo
              </Button>
              <Button size="sm" variant="outline" onClick={() => baixar(false)}>
                <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Baixar modelo vazio
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imp-colaboradores" className="font-semibold">2. Envie o modelo preenchido (.xlsx)</Label>
            <p className="text-muted-foreground">
              Célula vazia não apaga o que está gravado. A prévia mostra o que vai acontecer antes de gravar.
            </p>
            <input
              id="imp-colaboradores"
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }}
              className="block w-full text-[14px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[14px] file:font-semibold"
            />
          </div>

          {erro && (
            <p className="flex items-center gap-2 rounded-lg badge-danger p-3 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />{erro}
            </p>
          )}

          {leitura && (
            <p className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="w-4 h-4 text-primary" aria-hidden="true" />{arquivo}
              <span className="font-normal text-muted-foreground">· {leitura.linhas.length} pessoa(s)</span>
            </p>
          )}

          {previa && (
            <div className="space-y-2">
              <p className="font-semibold">Prévia — nada foi gravado ainda</p>
              <p>
                <strong>{previa.criar}</strong> {previa.criar === 1 ? 'pessoa nova' : 'pessoas novas'}
                {' · '}<strong>{previa.atualizar}</strong> {previa.atualizar === 1 ? 'atualizada' : 'atualizadas'}
              </p>
              {previa.empresas_novas.length > 0 && (
                <p className="text-muted-foreground">
                  Vai criar {previa.empresas_novas.length === 1 ? 'a empresa' : 'as empresas'}{' '}
                  <strong className="text-foreground">{previa.empresas_novas.join(', ')}</strong>. O CNPJ se completa depois em RH ›
                  Configurações.
                </p>
              )}
              {previa.salario_ignorado && (
                <p className="rounded-lg badge-warning p-3 text-[13px]">
                  A coluna SALÁRIO será ignorada: o seu perfil do RH não tem "Ver salário".
                </p>
              )}
            </div>
          )}

          {recusadas.length > 0 && (
            <details className="rounded-lg badge-warning p-3 text-[13px]" open>
              <summary className="cursor-pointer font-semibold">Ficam de fora ({recusadas.length})</summary>
              <ul className="pt-1 space-y-0.5 max-h-56 overflow-y-auto">
                {recusadas.map((r, i) => <li key={i}>Linha {r.linha}: {r.motivo}</li>)}
              </ul>
            </details>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          {!previa ? (
            <Button onClick={verPrevia} disabled={!leitura || leitura.linhas.length === 0 || importar.isPending}>
              {importar.isPending ? 'Conferindo...' : 'Ver prévia'}
            </Button>
          ) : (
            <Button onClick={confirmar} disabled={!vaiGravar || importar.isPending}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              {importar.isPending ? 'Importando...' : 'Importar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
