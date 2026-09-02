import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SoftwareLicense, LicenseType, LicenseItemCategory, LICENSE_ITEM_CATEGORY_LABEL, getLicenseTypeLabel } from '@/types/it-management';
import { ArrowLeft } from 'lucide-react';

const licenseSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  vendor: z.string().optional(),
  license_type: z.enum(['perpetual', 'subscription', 'volume', 'oem']),
  license_key: z.string().optional(),
  total_quantity: z.coerce.number().min(1, 'Quantidade deve ser pelo menos 1'),
  expiry_date: z.string().optional(),
  purchase_date: z.string().optional(),
  purchase_value: z.coerce.number().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
  auto_create_ticket: z.boolean(),
  item_category: z.enum(['software', 'domain', 'hosting', 'ssl', 'online_service', 'other']),
  domain: z.string().optional(),
  public_url: z.string().optional(),
  admin_url: z.string().optional(),
  internal_owner: z.string().optional(),
  technical_notes: z.string().optional(),
});

type LicenseFormData = z.infer<typeof licenseSchema>;

interface LicenseFormProps {
  license?: SoftwareLicense | null;
  onSubmit: (data: LicenseFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function LicenseForm({ license, onSubmit, onCancel, isLoading }: LicenseFormProps) {
  const form = useForm<LicenseFormData>({
    resolver: zodResolver(licenseSchema),
    defaultValues: {
      name: license?.name || '',
      vendor: license?.vendor || '',
      license_type: license?.license_type || 'subscription',
      license_key: license?.license_key || '',
      total_quantity: license?.total_quantity || 1,
      expiry_date: license?.expiry_date || '',
      purchase_date: license?.purchase_date || '',
      purchase_value: license?.purchase_value || undefined,
      notes: license?.notes || '',
      is_active: license?.is_active ?? true,
      auto_create_ticket: license?.auto_create_ticket ?? false,
      item_category: license?.item_category || 'software',
      domain: license?.domain || '',
      public_url: license?.public_url || '',
      admin_url: license?.admin_url || '',
      internal_owner: license?.internal_owner || '',
      technical_notes: license?.technical_notes || '',
    },
  });

  const itemCategory = form.watch('item_category');
  const showWebFields = itemCategory !== 'software';
  const isSoftware = itemCategory === 'software';

  const licenseTypes: LicenseType[] = ['perpetual', 'subscription', 'volume', 'oem'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">
          {license ? 'Editar Licença' : 'Nova Licença'}
        </h2>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tipo de item</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="item_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(Object.keys(LICENSE_ITEM_CATEGORY_LABEL) as LicenseItemCategory[]).map(c => (
                          <SelectItem key={c} value={c}>{LICENSE_ITEM_CATEGORY_LABEL[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Use "Domínio", "Hospedagem" ou "SSL" para itens de site.</FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="internal_owner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável interno</FormLabel>
                    <FormControl><Input placeholder="Ex: João — TI" {...field} /></FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {showWebFields && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Domínio e URLs</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="domain" render={({ field }) => (
                  <FormItem><FormLabel>Domínio *</FormLabel>
                    <FormControl><Input placeholder="meudominio.com.br" {...field} onChange={(e) => {
                      field.onChange(e);
                      if (!isSoftware) form.setValue('name', e.target.value || 'Domínio');
                    }} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="public_url" render={({ field }) => (
                  <FormItem><FormLabel>URL pública</FormLabel>
                    <FormControl><Input placeholder="https://meudominio.com.br" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="admin_url" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>URL do painel/admin</FormLabel>
                    <FormControl><Input placeholder="https://meudominio.com.br/admin" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="technical_notes" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Observações técnicas</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Registrador, servidor DNS, IP, etc." {...field} /></FormControl>
                  </FormItem>
                )} />
              </CardContent>
            </Card>
          )}


          {isSoftware && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Software *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Microsoft Office 365" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vendor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fabricante</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Microsoft" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="license_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Licença *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {licenseTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {getLicenseTypeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="total_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade Total *</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="license_key"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Chave da Licença</FormLabel>
                    <FormControl>
                      <Input placeholder="XXXXX-XXXXX-XXXXX-XXXXX" {...field} />
                    </FormControl>
                    <FormDescription>
                      Armazene a chave de forma segura para consultas futuras
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datas e Valores</CardTitle>
            </CardHeader>
            <CardContent className={isSoftware ? "grid gap-4 md:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
              <FormField
                control={form.control}
                name="purchase_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Compra</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Expiração</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      Deixe em branco para licenças perpétuas
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isSoftware && (
              <FormField
                control={form.control}
                name="purchase_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Licença Ativa</FormLabel>
                      <FormDescription>
                        Licenças inativas não podem receber novas atribuições
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="auto_create_ticket"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Abrir chamado automaticamente</FormLabel>
                      <FormDescription>
                        Cria um chamado de TI automaticamente quando esta licença estiver próxima de expirar
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Informações adicionais sobre a licença..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Salvando...' : license ? 'Salvar Alterações' : 'Criar Licença'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
