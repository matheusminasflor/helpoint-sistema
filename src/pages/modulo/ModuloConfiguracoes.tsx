import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Clock, Tag, Users, Zap, Kanban, ListPlus, type LucideIcon } from 'lucide-react';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { AutomationsTab } from '@/components/automations/AutomationsTab';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useSLAPolicies } from '@/hooks/useSLAPolicies';
import { PipelineStagesEditor } from '@/components/crm/PipelineStagesEditor';
import { CustomFieldsManager } from '@/components/crm/CustomFieldsManager';

interface ModuloConfiguracoesProps {
  module: 'comercial' | 'educacional';
  label: string;
  icon: LucideIcon;
}

/**
 * Configurações de Comercial e Educacional — mesmo molde de `RHConfiguracoes`,
 * sem as abas de domínio próprio do RH (Empresas/Departamentos/Folha): estes
 * dois módulos não têm nada além de chamados (plano L3a).
 */
export function ModuloConfiguracoes({ module, label, icon: Icon }: ModuloConfiguracoesProps) {
  const { can } = useDepartmentPermissions(module);
  const canEditCategories = can('categories', 'edit') || can('categories', 'create');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <PageHeader
          className="bg-transparent border-0 px-0 py-0"
          icon={Icon}
          title={`Configurações do ${label}`}
          description="Categorias, prazos, automações e acesso."
        />
      </div>

      <Tabs defaultValue="categorias">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="categorias"><Tag className="w-3.5 h-3.5 mr-1.5" />Categorias</TabsTrigger>
          {module === 'comercial' && (
            <>
              <TabsTrigger value="funil"><Kanban className="w-3.5 h-3.5 mr-1.5" />Funil</TabsTrigger>
              <TabsTrigger value="campos"><ListPlus className="w-3.5 h-3.5 mr-1.5" />Campos</TabsTrigger>
            </>
          )}
          <TabsTrigger value="sla"><Clock className="w-3.5 h-3.5 mr-1.5" />Prazos (SLA)</TabsTrigger>
          <TabsTrigger value="automacoes"><Zap className="w-3.5 h-3.5 mr-1.5" />Automações</TabsTrigger>
          <TabsTrigger value="acesso"><Users className="w-3.5 h-3.5 mr-1.5" />Acesso</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categorias dos chamados do {label}</CardTitle>
              <CardDescription>Organize os tipos de solicitação que podem ser abertos e personalize o formulário de cada categoria.</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryManager module={module} allowForms readOnly={!canEditCategories} emptyLabel={`o ${label}`} />
            </CardContent>
          </Card>
        </TabsContent>

        {module === 'comercial' && (
          <>
            <TabsContent value="funil"><PipelineStagesEditor /></TabsContent>
            <TabsContent value="campos"><CustomFieldsManager /></TabsContent>
          </>
        )}
        <TabsContent value="sla"><ModuloSLATab /></TabsContent>
        <TabsContent value="automacoes"><AutomationsTab module={module} /></TabsContent>
        <TabsContent value="acesso"><ModuloAccessTab label={label} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============= Prazos (SLA) — mesmo molde de RHSLATab: prazos por prioridade, compartilhados entre módulos =============
function ModuloSLATab() {
  const { policies, isLoading, updatePolicy } = useSLAPolicies();
  const [edits, setEdits] = useState<Record<string, { first_response_time: number; resolution_time: number }>>({});

  const priorityLabel: Record<string, string> = {
    critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prazos de atendimento</CardTitle>
        <CardDescription>Tempo máximo, em minutos, para primeira resposta e resolução dos chamados por prioridade.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-2">
            {policies.map(p => {
              const edit = edits[p.id];
              return (
                <div key={p.id} className="grid grid-cols-12 items-center gap-3 rounded-lg border p-3">
                  <div className="col-span-3">
                    <div className="font-medium text-sm">{p.name}</div>
                    <Badge variant="outline" className="text-[10px] mt-1">{priorityLabel[p.priority] || p.priority}</Badge>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Primeira resposta (min)</Label>
                    <Input type="number" value={edit?.first_response_time ?? p.first_response_time}
                      onChange={e => setEdits(s => ({ ...s, [p.id]: { first_response_time: Number(e.target.value), resolution_time: edit?.resolution_time ?? p.resolution_time } }))} />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Resolução (min)</Label>
                    <Input type="number" value={edit?.resolution_time ?? p.resolution_time}
                      onChange={e => setEdits(s => ({ ...s, [p.id]: { first_response_time: edit?.first_response_time ?? p.first_response_time, resolution_time: Number(e.target.value) } }))} />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    {edit && (
                      <Button size="sm" onClick={async () => {
                        await updatePolicy.mutateAsync({ id: p.id, ...edit });
                        setEdits(s => { const c = { ...s }; delete c[p.id]; return c; });
                      }}>Salvar</Button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-2">
              Estes prazos são compartilhados com chamados de outros módulos que usem a mesma prioridade.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============= Acesso (placeholder) — mesmo molde de RHAccessTab =============
function ModuloAccessTab({ label }: { label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem pode operar o {label}</CardTitle>
        <CardDescription>
          Conceda acesso ao módulo {label} em <strong>Configurações → Usuários</strong>, marcando o módulo "{label}" no perfil do colaborador.
          Gestores e administradores têm acesso automático.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground text-center">
          Perfis granulares do {label} entram em uma próxima fase.
        </div>
      </CardContent>
    </Card>
  );
}
