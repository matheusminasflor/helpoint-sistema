// Configurações do Financeiro — a aba Chamados do molde de todo setor (LEVA P), mais o histórico
// de planilhas importadas.
//
// O TETO DE GASTO SAIU DAQUI em 2026-09-28 e foi para Compras › Configurações, por decisão do
// dono: tudo o que é de compra num lugar só. Quem edita continua sendo decidido pelo perfil. E o
// texto "a categoria Compras mantém os campos de orçamento" também saiu: desde a leva N a
// categoria de compra é de Compras, e marcá-la aqui não ligava nada.
import { useState } from 'react';
import { Banknote, FileSpreadsheet, PackageCheck, Trash2 } from 'lucide-react';
import { ConfiguracaoDaConferencia } from '@/components/financeiro/ConfiguracaoDaConferencia';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';
import { useDeleteFinImport, useFinImports } from '@/hooks/useFinanceiro';
import { KIND_LABEL, competenceLabel, formatBRL, formatDateBR, type FinImport } from '@/types/financeiro';

export default function FinSettings() {
  return (
    <ConfiguracaoDoSetor
      label="Financeiro"
      icon={Banknote}
      modulo="financeiro"
      nomeNaFrase="o Financeiro"
      abas={[
        { valor: 'importacoes', permissao: 'importacoes', rotulo: 'Planilhas importadas', icone: FileSpreadsheet, conteudo: <PlanilhasImportadas /> },
        {
          valor: 'conferencia', permissao: 'conferencia', rotulo: 'Conferência de pedidos', icone: PackageCheck,
          conteudo: (podeAlterar: boolean) => <ConfiguracaoDaConferencia podeAlterar={podeAlterar} />,
        },
      ]}
    />
  );
}

function PlanilhasImportadas() {
  const { data: imports = [], isLoading } = useFinImports();
  const remove = useDeleteFinImport();
  const [deleting, setDeleting] = useState<FinImport | null>(null);

  return (
    <>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-1">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : imports.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="Nenhuma planilha importada ainda"
            description="Use o botão Importar planilha em Contas a Pagar ou Contas a Receber."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-semibold border-r border-border">Arquivo</th>
                  <th className="px-3 py-2 font-semibold border-r border-border">Tipo</th>
                  <th className="px-3 py-2 font-semibold border-r border-border">Formato</th>
                  <th className="px-3 py-2 font-semibold border-r border-border">Competência</th>
                  <th className="px-3 py-2 font-semibold border-r border-border text-right">Linhas</th>
                  <th className="px-3 py-2 font-semibold border-r border-border text-right">Total</th>
                  <th className="px-3 py-2 font-semibold border-r border-border">Importado em</th>
                  <th className="px-3 py-2 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(imp => (
                  <tr key={imp.id} className="border-b border-border hover:bg-secondary/50">
                    <td className="px-3 py-2 max-w-[240px] truncate" title={imp.file_name}>{imp.file_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{KIND_LABEL[imp.kind]}</td>
                    <td className="px-3 py-2 text-muted-foreground">{imp.format === 'forteplus' ? 'Forteplus' : 'Genérico'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{competenceLabel(imp.competence)}</td>
                    <td className="px-3 py-2 font-mono text-right">{imp.row_count}</td>
                    <td className="px-3 py-2 font-mono text-right">{formatBRL(Number(imp.total_amount))}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatDateBR(imp.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" title="Remover importação" onClick={() => setDeleting(imp)}>
                        <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                        <span className="sr-only">Remover importação</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a importação "{deleting?.file_name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {deleting?.row_count ?? 0} lançamentos criados por este arquivo serão excluídos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter importação</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) remove.mutate(deleting.id); setDeleting(null); }}>
              Remover importação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
