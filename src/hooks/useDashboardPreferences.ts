import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const WIDGET_REGISTRY = [
  { id: 'open_tickets', label: 'Chamados Abertos', description: 'Total aberto + em andamento' },
  { id: 'sla_compliance', label: 'SLA Cumprido', description: '% de cumprimento e tempo médio' },
  { id: 'assets', label: 'Ativos de TI', description: 'Ativos vs total cadastrados' },
  { id: 'expiring_licenses', label: 'Licenças Expirando', description: 'Alerta de vencimentos' },
  { id: 'ticket_trends', label: 'Tendência de Chamados', description: 'Gráfico de abertura vs resolução' },
  { id: 'priority_distribution', label: 'Distribuição por Prioridade', description: 'Gráfico de barras' },
  { id: 'category_distribution', label: 'Distribuição por Categoria', description: 'Gráfico de pizza' },
  { id: 'expiring_contracts', label: 'Contratos Expirando', description: 'Próximos 30 dias' },
  { id: 'scheduled_maintenances', label: 'Manutenções Agendadas', description: 'Próximas manutenções' },
  { id: 'technician_performance', label: 'Desempenho por Técnico', description: 'Performance individual' },
  { id: 'top_requesters', label: 'Top Solicitantes', description: 'Ranking de quem mais abre chamados' },
  { id: 'overdue_tickets', label: 'Chamados Vencidos (SLA)', description: 'Violações de SLA' },
  { id: 'pop_effectiveness', label: 'Efetividade dos Tutoriais', description: 'Avaliações e taxa de resolução' },
] as const;

export type WidgetId = typeof WIDGET_REGISTRY[number]['id'];

export const DEFAULT_WIDGETS: WidgetId[] = [
  'open_tickets', 'sla_compliance', 'assets', 'expiring_licenses',
  'ticket_trends', 'priority_distribution', 'technician_performance',
];

export const DEFAULT_PERIOD = '30d';

export interface DashboardPreferences {
  id: string;
  visible_widgets: WidgetId[];
  widget_order: WidgetId[];
  default_period: string;
}

export function useDashboardPreferences(module = 'ti') {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dashboard-preferences', module, user?.id],
    queryFn: async (): Promise<DashboardPreferences | null> => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('dashboard_preferences')
        .select('*')
        .eq('module', module)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      return {
        id: data.id,
        visible_widgets: (data.visible_widgets || []) as WidgetId[],
        widget_order: (data.widget_order || []) as WidgetId[],
        default_period: data.default_period || DEFAULT_PERIOD,
      };
    },
    enabled: !!user?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (prefs: { visible_widgets: WidgetId[]; widget_order: WidgetId[]; default_period: string }) => {
      if (!user?.id || !tenantId) throw new Error('Not authenticated');
      
      const { data: existing } = await supabase
        .from('dashboard_preferences')
        .select('id')
        .eq('module', module)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('dashboard_preferences')
          .update({
            visible_widgets: prefs.visible_widgets,
            widget_order: prefs.widget_order,
            default_period: prefs.default_period,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('dashboard_preferences')
          .insert({
            tenant_id: tenantId,
            user_id: user.id,
            module,
            visible_widgets: prefs.visible_widgets,
            widget_order: prefs.widget_order,
            default_period: prefs.default_period,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-preferences', module] });
    },
  });

  // Return ordered visible widgets
  const getOrderedWidgets = (): WidgetId[] => {
    const prefs = query.data;
    if (!prefs) return DEFAULT_WIDGETS;
    
    const visible = prefs.visible_widgets.length > 0 ? prefs.visible_widgets : DEFAULT_WIDGETS;
    const order = prefs.widget_order.length > 0 ? prefs.widget_order : visible;
    
    // Return items in order, filtering to only visible ones
    const ordered = order.filter(id => visible.includes(id));
    // Add any visible items not in the order list
    const missing = visible.filter(id => !ordered.includes(id));
    return [...ordered, ...missing];
  };

  return {
    preferences: query.data,
    orderedWidgets: getOrderedWidgets(),
    defaultPeriod: query.data?.default_period || DEFAULT_PERIOD,
    isLoading: query.isLoading,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
