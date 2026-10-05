import { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2, Star, Phone, Mail, Truck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteSupplier } from '@/hooks/useSuppliers';
import { useGruposPorFornecedor } from '@/hooks/useGruposDeFornecedor';
import type { Supplier } from '@/types/suppliers';
import { SUPPLIER_STATUS_LABELS } from '@/types/suppliers';

interface SupplierTableProps {
  suppliers: Supplier[];
  isLoading: boolean;
  onEdit: (supplier: Supplier) => void;
  podeEditar?: boolean;
  podeExcluir?: boolean;
}

const statusColors: Record<string, string> = {
  active: 'bg-status-success/20 text-status-success border-status-success/30',
  inactive: 'bg-muted/20 text-muted-foreground border-border/30',
  blocked: 'bg-status-danger/20 text-status-danger border-status-danger/30',
};

export function SupplierTable({ suppliers, isLoading, onEdit, podeEditar = false, podeExcluir = false }: SupplierTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteMutation = useDeleteSupplier();
  const gruposPorFornecedor = useGruposPorFornecedor();

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const renderRating = (rating?: number) => {
    if (!rating) return <span className="text-muted-foreground text-sm">—</span>;
    return (
      <div className="flex items-center gap-1">
        <Star className="w-4 h-4 fill-status-warning text-status-warning" />
        <span className="text-sm font-medium">{rating.toFixed(1)}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Grupos</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Avaliação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-8" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="Nenhum fornecedor cadastrado"
        description="Cadastre fornecedores para comparar orçamentos e manter contatos organizados."
      />
    );
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Grupos</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Avaliação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{supplier.name}</p>
                    {supplier.cnpj && (
                      <p className="text-xs text-muted-foreground">{supplier.cnpj}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(gruposPorFornecedor.get(supplier.id) ?? []).map(g => (
                      <Badge key={g.id} variant="outline">{g.nome}</Badge>
                    ))}
                    {!gruposPorFornecedor.get(supplier.id)?.length && (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {supplier.contact_name && (
                      <p className="text-sm">{supplier.contact_name}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {supplier.contact_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {supplier.contact_email}
                        </span>
                      )}
                      {supplier.contact_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {supplier.contact_phone}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{renderRating(supplier.rating)}</TableCell>
                <TableCell>
                  <Badge className={statusColors[supplier.status]}>
                    {SUPPLIER_STATUS_LABELS[supplier.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(podeEditar || podeExcluir) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {podeEditar && (
                          <DropdownMenuItem onClick={() => onEdit(supplier)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        {podeExcluir && (
                          <DropdownMenuItem
                            onClick={() => setDeleteId(supplier.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O fornecedor será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
