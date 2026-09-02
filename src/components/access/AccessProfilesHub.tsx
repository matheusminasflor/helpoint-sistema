import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DEPARTMENT_LIST, DEPARTMENT_SCHEMAS, type Department } from '@/config/access-profile-schemas';
import { useAccessProfiles, useDeleteAccessProfile, type AccessProfile } from '@/hooks/useAccessProfiles';
import { AccessProfileEditor } from './AccessProfileEditor';

function DepartmentPanel({ department }: { department: Department }) {
  const { data: profiles, isLoading } = useAccessProfiles(department);
  const del = useDeleteAccessProfile();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AccessProfile | null>(null);
  const [toDelete, setToDelete] = useState<AccessProfile | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo perfil
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[100px]">Padrão</TableHead>
              <TableHead className="w-[110px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Carregando...</TableCell></TableRow>
            ) : (profiles || []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Nenhum perfil criado para {DEPARTMENT_SCHEMAS[department].label}.</TableCell></TableRow>
            ) : profiles!.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.description || '—'}</TableCell>
                <TableCell>{p.is_default && <Badge variant="secondary">Padrão</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setEditorOpen(true); }} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(p)} title="Excluir">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AccessProfileEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        department={department}
        profile={editing}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Usuários que estiverem usando este perfil ficarão sem perfil específico (mantêm somente as permissões do nível de acesso).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) del.mutate(toDelete.id); setToDelete(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AccessProfilesHub() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Perfis de Acesso</CardTitle>
            <CardDescription>
              Crie modelos de permissões por departamento. Use-os ao convidar novos usuários ou ajustá-los individualmente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="ti">
          <TabsList>
            {DEPARTMENT_LIST.map(d => (
              <TabsTrigger key={d} value={d}>{DEPARTMENT_SCHEMAS[d].label}</TabsTrigger>
            ))}
          </TabsList>
          {DEPARTMENT_LIST.map(d => (
            <TabsContent key={d} value={d} className="pt-4">
              <DepartmentPanel department={d} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
