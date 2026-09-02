import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Headphones, Search, Edit2, KeyRound, Lock, Unlock, Trash2, Save } from 'lucide-react';
import {
  SACCustomerRow,
  useSACCustomers,
  useUpdateSACCustomer,
  useToggleBlockSACCustomer,
  useResetSACCustomerPassword,
  useDeleteSACCustomer,
} from '@/hooks/useSACCustomers';
import { Skeleton } from '@/components/ui/skeleton';

export function SACCustomersTab() {
  const { data: customers, isLoading } = useSACCustomers();
  const update = useUpdateSACCustomer();
  const toggleBlock = useToggleBlockSACCustomer();
  const reset = useResetSACCustomerPassword();
  const del = useDeleteSACCustomer();

  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<SACCustomerRow | null>(null);
  const [deleting, setDeleting] = useState<SACCustomerRow | null>(null);
  const [form, setForm] = useState<Partial<SACCustomerRow>>({});

  const filtered = useMemo(() => {
    const list = customers ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter(c =>
      c.full_name?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.document?.toLowerCase().includes(s) ||
      c.cnpj?.toLowerCase().includes(s),
    );
  }, [customers, q]);

  const startEdit = (c: SACCustomerRow) => {
    setEditing(c);
    setForm({
      full_name: c.full_name, email: c.email, phone: c.phone, whatsapp: c.whatsapp,
      document: c.document, cnpj: c.cnpj, razao_social: c.razao_social,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Clientes SAC</CardTitle>
              <CardDescription>
                {customers?.length ?? 0} clientes cadastrados no painel do cliente
              </CardDescription>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, e-mail, CPF/CNPJ..." value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente encontrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{c.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        Cadastrado em {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{c.email}</span>
                      {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{c.cnpj || c.document || '—'}</TableCell>
                  <TableCell>
                    {c.is_blocked
                      ? <Badge variant="destructive">Bloqueado</Badge>
                      : <Badge variant="secondary">Ativo</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => startEdit(c)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Reenviar acesso por e-mail"
                        onClick={() => reset.mutate(c.email)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title={c.is_blocked ? 'Desbloquear' : 'Bloquear'}
                        onClick={() => toggleBlock.mutate({ id: c.id, block: !c.is_blocked })}>
                        {c.is_blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" title="Excluir" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente SAC</DialogTitle>
            <DialogDescription>Atualize os dados de cadastro.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            {([
              ['full_name', 'Nome completo'],
              ['email', 'E-mail'],
              ['phone', 'Telefone'],
              ['whatsapp', 'WhatsApp'],
              ['document', 'CPF'],
              ['cnpj', 'CNPJ'],
              ['razao_social', 'Razão social'],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <Label className="text-xs">{label}</Label>
                <Input value={(form as any)[k] ?? ''} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!editing) return;
              update.mutate({ id: editing.id, patch: form }, { onSuccess: () => setEditing(null) });
            }} disabled={update.isPending}>
              <Save className="h-4 w-4 mr-2" />Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o cadastro e o acesso de <strong>{deleting?.full_name}</strong> definitivamente. Os chamados antigos serão mantidos no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleting) del.mutate(deleting.user_id, { onSuccess: () => setDeleting(null) });
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
