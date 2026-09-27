import { useState } from 'react';
import { FileSpreadsheet, Settings, Trash2, Tags, Wallet, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeleteFinImport, useFinImports } from '@/hooks/useFinanceiro';
import { BudgetSettingsCard } from '@/components/financeiro/BudgetSettingsCard';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { AutomationsTab } from '@/components/automations/AutomationsTab';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { KIND_LABEL, competenceLabel, formatBRL, formatDateBR, type FinImport } from '@/types/financeiro';

export default function FinSettings() {
  const { data: imports = [], isLoading } = useFinImports();
  const remove = useDeleteFinImport();
  const [deleting, setDeleting] = useState<FinImport | null>(null);
  const { can } = useDepartmentPermissions('financeiro');
  const canViewCategories = can('categories', 'view') || can('categories', 'edit');
  const canEditCategories = can('categories', 'edit');
  const [tab, setTab] = useState<'geral' | 'categorias' | 'automacoes'>('geral');

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Configurações do Financeiro"
        description="Categorias de solicitação, teto de gasto por setor e histórico de planilhas importadas."
        icon={Settings}
      />

      <div className="p-4 lg:p-6 space-y-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="geral" className="gap-2"><Wallet className="h-4 w-4" />Teto e importações</TabsTrigger>
            {canViewCategories && (
              <TabsTrigger value="categorias" className="gap-2"><Tags className="h-4 w-4" />Categorias</TabsTrigger>
            )}
            <TabsTrigger value="automacoes" className="gap-2"><Zap className="h-4 w-4" />Automações</TabsTrigger>
          </TabsList>

          {canViewCategories && (
            <TabsContent value="categorias">
              <Card>
                <CardHeader>
                  <CardTitle>Categorias de solicitação</CardTitle>
                  <CardDescription>
                    Defina as categorias e subcategorias das solicitações ao Financeiro e, se quiser, os campos
                    personalizados de cada uma. A categoria "Compras" mantém os campos de link, orçamentos e produto.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CategoryManager
                    module="financeiro"
                    allowForms
                    readOnly={!canEditCategories}
                    emptyLabel="o Financeiro"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="geral" className="space-y-6">
        <BudgetSettingsCard />


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
          </TabsContent>

          <TabsContent value="automacoes">
            <AutomationsTab module="financeiro" />
          </TabsContent>
        </Tabs>
      </div>


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
    </div>
  );
}
