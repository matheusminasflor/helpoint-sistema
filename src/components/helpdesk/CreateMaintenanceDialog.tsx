import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useMaintenanceMutations } from '@/hooks/useMaintenances';
import { useAddComment } from '@/hooks/useTicketComments';
import { useAuth } from '@/contexts/AuthContext';
import { getMaintenanceTypeLabel, MaintenanceType } from '@/types/it-management';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CreateMaintenanceDialogProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  assetId?: string | null;
  assetName?: string;
  onCreated?: () => void;
}

interface AssetOption {
  id: string;
  name: string;
  asset_tag: string;
}

const maintenanceTypes: MaintenanceType[] = ['preventive', 'corrective', 'upgrade', 'cleaning'];

export function CreateMaintenanceDialog({
  open,
  onClose,
  ticketId,
  assetId,
  assetName,
  onCreated,
}: CreateMaintenanceDialogProps) {
  const { user } = useAuth();
  const { createMaintenance } = useMaintenanceMutations();
  const { addComment } = useAddComment();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    maintenance_type: 'corrective' as MaintenanceType,
    description: '',
    scheduled_date: '',
    selected_asset_id: assetId || '',
  });

  // Load assets if no assetId provided
  useEffect(() => {
    if (open && !assetId) {
      setLoadingAssets(true);
      supabase
        .from('assets')
        .select('id, name, asset_tag')
        .order('name')
        .then(({ data }) => {
          setAssets(data || []);
          setLoadingAssets(false);
        });
    }
  }, [open, assetId]);

  // Sync assetId prop
  useEffect(() => {
    if (assetId) {
      setFormData(prev => ({ ...prev, selected_asset_id: assetId }));
    }
  }, [assetId]);

  const effectiveAssetId = assetId || formData.selected_asset_id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !effectiveAssetId) {
      toast.error('Preencha o título e selecione um ativo.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createMaintenance.mutateAsync({
        asset_id: effectiveAssetId,
        title: formData.title,
        maintenance_type: formData.maintenance_type,
        description: formData.description || null,
        scheduled_date: formData.scheduled_date || null,
        status: 'scheduled',
        ticket_id: ticketId,
        technician_id: user?.id || null,
        cost: null,
        completed_date: null,
        external_provider: null,
        notes: null,
        auto_create_ticket: false,
      });

      const typeLabel = getMaintenanceTypeLabel(formData.maintenance_type);
      const dateLabel = formData.scheduled_date
        ? format(new Date(formData.scheduled_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })
        : 'a definir';

      await addComment(
        ticketId,
        `🔧 **Manutenção agendada**\n\n- **Tipo:** ${typeLabel}\n- **Título:** ${formData.title}\n- **Data prevista:** ${dateLabel}\n\nO chamado permanecerá em andamento até a conclusão da manutenção.`,
        false
      );

      toast.success('Manutenção agendada com sucesso');
      setFormData({ title: '', maintenance_type: 'corrective', description: '', scheduled_date: '', selected_asset_id: assetId || '' });
      onClose();
      onCreated?.();
    } catch (error: any) {
      toast.error('Erro ao criar manutenção: ' + (error.message || 'Tente novamente'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Agendar Manutenção
          </DialogTitle>
          <DialogDescription>
            {assetName
              ? `Criar manutenção para o ativo "${assetName}" vinculada a este chamado.`
              : 'Criar manutenção vinculada a este chamado.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!assetId && (
            <div className="space-y-2">
              <Label>Ativo *</Label>
              <Select
                value={formData.selected_asset_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, selected_asset_id: v }))}
                disabled={loadingAssets}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingAssets ? 'Carregando...' : 'Selecione um ativo'} />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.asset_tag})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tipo de Manutenção *</Label>
            <Select
              value={formData.maintenance_type}
              onValueChange={(v) => setFormData(prev => ({ ...prev, maintenance_type: v as MaintenanceType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {maintenanceTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {getMaintenanceTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              placeholder="Ex: Troca de bateria do notebook"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Data Agendada</Label>
            <Input
              type="date"
              value={formData.scheduled_date}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              placeholder="Detalhes sobre a manutenção..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !effectiveAssetId}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Agendando...
                </>
              ) : (
                'Agendar Manutenção'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
