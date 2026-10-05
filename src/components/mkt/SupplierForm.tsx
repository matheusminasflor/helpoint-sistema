import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateSupplier, useUpdateSupplier } from '@/hooks/useSuppliers';
import { useGruposPorFornecedor, useSalvarGruposDoFornecedor } from '@/hooks/useGruposDeFornecedor';
import { EscolhaDeGrupos } from '@/components/mkt/GruposDeFornecedor';
import type { Supplier, SupplierStatus } from '@/types/suppliers';
import { SUPPLIER_STATUS_LABELS } from '@/types/suppliers';

// 2026-10-04: a "Categoria" fixa deu lugar aos GRUPOS (vários por fornecedor, criados pela empresa).
const supplierSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  cnpj: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email('Email inválido').optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  status: z.string(),
  notes: z.string().optional(),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

interface SupplierFormProps {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
}

export function SupplierForm({ open, onClose, supplier }: SupplierFormProps) {
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const salvarGrupos = useSalvarGruposDoFornecedor();
  const gruposPorFornecedor = useGruposPorFornecedor();
  const gruposAntes = supplier ? (gruposPorFornecedor.get(supplier.id) ?? []).map(g => g.id) : [];
  const [grupos, setGrupos] = useState<string[]>([]);
  const isEditing = !!supplier;

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      cnpj: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      rating: undefined,
      status: 'active',
      notes: '',
    },
  });

  useEffect(() => {
    if (supplier) {
      form.reset({
        name: supplier.name,
        cnpj: supplier.cnpj || '',
        contact_name: supplier.contact_name || '',
        contact_email: supplier.contact_email || '',
        contact_phone: supplier.contact_phone || '',
        rating: supplier.rating || undefined,
        status: supplier.status,
        notes: supplier.notes || '',
      });
    } else {
      form.reset({
        name: '',
        cnpj: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        rating: undefined,
        status: 'active',
        notes: '',
      });
    }
  }, [supplier, form]);

  // Os grupos marcados recomeçam só ao abrir ou trocar de fornecedor — não quando a lista de grupos
  // recarrega (criar um grupo na hora recarrega, e isso apagaria o que a pessoa acabou de marcar).
  useEffect(() => {
    if (open) setGrupos(gruposAntes);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- de propósito: ver acima
  }, [open, supplier?.id]);

  const onSubmit = async (data: SupplierFormData) => {
    const payload = {
      name: data.name,
      cnpj: data.cnpj || undefined,
      contact_name: data.contact_name || undefined,
      contact_email: data.contact_email || undefined,
      contact_phone: data.contact_phone || undefined,
      rating: data.rating,
      status: data.status as SupplierStatus,
      notes: data.notes || undefined,
    };

    try {
      let supplierId: string;
      if (isEditing && supplier) {
        await updateMutation.mutateAsync({ id: supplier.id, ...payload });
        supplierId = supplier.id;
      } else {
        supplierId = (await createMutation.mutateAsync(payload)).id;
      }
      await salvarGrupos.mutateAsync({ supplierId, antes: isEditing ? gruposAntes : [], depois: grupos });
      onClose();
    } catch {
      // o toast de erro já sai de cada hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do fornecedor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input placeholder="00.000.000/0000-00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium">Grupos</p>
              <p className="text-xs text-muted-foreground">De que é este fornecedor? Marque um ou mais.</p>
              <EscolhaDeGrupos marcados={grupos} onChange={setGrupos} />
            </div>

            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Contato</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do responsável" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@empresa.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(00) 00000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avaliação (0-5)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={0.5}
                        placeholder="Ex: 4.5"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(SUPPLIER_STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Notas adicionais sobre o fornecedor..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending || salvarGrupos.isPending}
              >
                {isEditing ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
