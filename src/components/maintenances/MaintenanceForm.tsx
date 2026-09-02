import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AssetMaintenance, MaintenanceType, MaintenanceStatus, getMaintenanceTypeLabel, getMaintenanceStatusLabel } from '@/types/it-management';
import { useOpenTickets } from '@/hooks/useLinkedMaintenances';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft } from 'lucide-react';

const maintenanceSchema = z.object({
  asset_id: z.string().min(1, 'Ativo é obrigatório'),
  maintenance_type: z.enum(['preventive', 'corrective', 'upgrade', 'cleaning']),
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  scheduled_date: z.string().optional(),
  completed_date: z.string().optional(),
  cost: z.coerce.number().optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  technician_id: z.string().optional().nullable(),
  external_provider: z.string().optional(),
  ticket_id: z.string().optional().nullable(),
  notes: z.string().optional(),
  auto_create_ticket: z.boolean(),
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

interface Asset {
  id: string;
  name: string;
  asset_tag: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface MaintenanceFormProps {
  maintenance?: AssetMaintenance | null;
  onSubmit: (data: MaintenanceFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function MaintenanceForm({ maintenance, onSubmit, onCancel, isLoading }: MaintenanceFormProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const { data: openTickets, isLoading: loadingTickets } = useOpenTickets();

  const form = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      asset_id: maintenance?.asset_id || '',
      maintenance_type: maintenance?.maintenance_type || 'corrective',
      title: maintenance?.title || '',
      description: maintenance?.description || '',
      scheduled_date: maintenance?.scheduled_date || '',
      completed_date: maintenance?.completed_date || '',
      cost: maintenance?.cost || undefined,
      status: maintenance?.status || 'scheduled',
      technician_id: maintenance?.technician_id || '',
      external_provider: maintenance?.external_provider || '',
      ticket_id: maintenance?.ticket_id || '',
      notes: maintenance?.notes || '',
      auto_create_ticket: maintenance?.auto_create_ticket ?? false,
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [assetsRes, techsRes] = await Promise.all([
        supabase.from('assets').select('id, name, asset_tag').order('name'),
        supabase.from('profiles').select('id, full_name, email').eq('is_active', true).order('full_name'),
      ]);

      if (assetsRes.data) setAssets(assetsRes.data);
      if (techsRes.data) setTechnicians(techsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const maintenanceTypes: MaintenanceType[] = ['preventive', 'corrective', 'upgrade', 'cleaning'];
  const maintenanceStatuses: MaintenanceStatus[] = ['scheduled', 'in_progress', 'completed', 'cancelled'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">
          {maintenance ? 'Editar Manutenção' : 'Nova Manutenção'}
        </h2>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="asset_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ativo *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingData}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingData ? 'Carregando...' : 'Selecione um ativo'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {assets.map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.name} ({asset.asset_tag})
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
                name="maintenance_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Manutenção *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {maintenanceTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {getMaintenanceTypeLabel(type)}
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
                name="title"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Troca de bateria do notebook" {...field} />
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
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {maintenanceStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {getMaintenanceStatusLabel(status)}
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
                name="technician_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Técnico Responsável</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || undefined} disabled={loadingData}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingData ? 'Carregando...' : 'Selecione um técnico'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {technicians.map((tech) => (
                          <SelectItem key={tech.id} value={tech.id}>
                            {tech.full_name || tech.email}
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
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Detalhes sobre a manutenção..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agendamento e Custos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="scheduled_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Agendada</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="completed_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Conclusão</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custo (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações Adicionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="ticket_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chamado Vinculado</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      defaultValue={field.value || '__none__'}
                      disabled={loadingTickets}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingTickets ? 'Carregando...' : 'Nenhum chamado vinculado'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {(openTickets || []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            #{t.ticket_number} — {t.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Vincular a um chamado impede seu encerramento até a conclusão da manutenção
                    </FormDescription>
                    <FormMessage />
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
                        Cria um chamado de TI automaticamente quando esta manutenção estiver próxima do vencimento
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
                name="external_provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fornecedor Externo</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome da empresa terceirizada (se aplicável)" {...field} />
                    </FormControl>
                    <FormMessage />
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
                        placeholder="Informações adicionais sobre a manutenção..."
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
              {isLoading ? 'Salvando...' : maintenance ? 'Salvar Alterações' : 'Criar Manutenção'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
