// O estoque que ele já tinha, por planilha (rodada 2, R5): baixar o modelo com o catálogo e o que o sistema conta,
// corrigir a coluna TENHO, enviar, ver o que vai mudar e confirmar. Grava `dist_importar_estoque` (só o responsável).
import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useEstoqueDoPortal, useImportarEstoque, useProdutosDoPortal } from '@/hooks/usePortalDoDistribuidor';
import { readSheets } from '@/lib/planilha';
import { todayISO } from '@/lib/dates';
import {
  ModeloDeEstoqueInvalido, baixarModeloDeEstoque, lerModeloDeEstoque, type LeituraDoModeloDeEstoque,
} from '@/lib/modelo-de-estoque-do-distribuidor';

export function ImportarEstoqueDialog({ fechar }: { fechar: () => void }) {
  const produtos = useProdutosDoPortal();
  const estoque = useEstoqueDoPortal();
  const importar = useImportarEstoque();
  const [leitura, setLeitura] = useState<LeituraDoModeloDeEstoque | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const saldo = useMemo(() => new Map((estoque.data ?? []).map((e) => [e.produto_codigo, Number(e.saldo)])), [estoque.data]);
  const pronto = !!produtos.data && !!estoque.data;

  const ler = async (arquivo: File | undefined) => {
    setLeitura(null); setErro(null);
    if (!arquivo) return;
    try {
      setLeitura(lerModeloDeEstoque(await readSheets(arquivo), produtos.data ?? [], saldo));
    } catch (e) {
      setErro(e instanceof ModeloDeEstoqueInvalido ? e.message : 'Não consegui ler o arquivo. Envie a planilha do modelo (.xlsx).');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Informar o estoque por planilha</DialogTitle>
          <DialogDescription>Para o que você já tinha antes de entrar no portal, ou para conferir a prateleira inteira de uma vez.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[14px] font-semibold">1. Baixe o modelo</p>
            <p className="text-[14px] text-muted-foreground">Vem com todos os produtos da Minasflor e o que o sistema conta hoje. Escreva na
              coluna TENHO o que está na prateleira; deixe vazio o que não quer mudar.</p>
            <Button variant="outline" className="h-11 gap-1.5" disabled={!pronto}
              onClick={() => baixarModeloDeEstoque(produtos.data ?? [], saldo, `estoque-${todayISO()}.xlsx`)}>
              <Download className="w-4 h-4" aria-hidden="true" /> Baixar o modelo
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="imp-estoque" className="text-[14px] font-semibold">2. Envie o modelo preenchido</Label>
            <input id="imp-estoque" type="file" accept=".xlsx,.xls" disabled={!pronto} onChange={(e) => ler(e.target.files?.[0])}
              className="block w-full text-[14px] file:mr-3 file:h-11 file:rounded-md file:border file:border-input file:bg-background file:px-3" />
          </div>
          {erro && <p className="text-[14px] text-status-danger" role="alert">{erro}</p>}
          {leitura && (
            <div className="space-y-2 text-[14px]" role="status">
              <p><b>{leitura.mudam.length}</b> produto(s) vão mudar{leitura.iguais ? `; ${leitura.iguais} já batiam e ficam como estão` : ''}.</p>
              {leitura.mudam.length > 0 && (
                <ul className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {leitura.mudam.map((l) => (
                    <li key={l.produto_codigo} className="px-3 py-1.5 flex gap-2">
                      <span className="flex-1 min-w-0 truncate">{l.produto_nome}</span>
                      <span className="tabular-nums text-muted-foreground">{l.conta} → <b className="text-foreground">{l.tenho}</b></span>
                    </li>
                  ))}
                </ul>
              )}
              {leitura.recusadas.length > 0 && (
                <div className="rounded-md border border-status-warning/40 p-2 space-y-1">
                  <p className="flex gap-1.5 text-status-warning"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    {leitura.recusadas.length} linha(s) ficam de fora:</p>
                  <ul className="text-[13px] text-muted-foreground">
                    {leitura.recusadas.map((r) => <li key={r.linha}>linha {r.linha}: {r.motivo}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Voltar</Button>
          <Button className="gap-1.5" disabled={!leitura?.mudam.length || importar.isPending}
            onClick={() => importar.mutate(leitura!.mudam.map((l) => ({ produto_codigo: l.produto_codigo, tenho: l.tenho })), { onSuccess: fechar })}>
            <Upload className="w-4 h-4" aria-hidden="true" /> {importar.isPending ? 'Gravando…' : 'Atualizar o estoque'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
