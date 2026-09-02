import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateLicenseRenewal } from '@/hooks/useLicenseRenewals';
import { toast } from 'sonner';
import { RefreshCw, Loader2 } from 'lucide-react';
import type { LicenseWithAssignments } from '@/types/it-management';

interface RenewLicenseDialogProps {
  license: LicenseWithAssignments;
  open: boolean;
  onClose: () => void;
  onRenewed?: () => void;
}

export function RenewLicenseDialog({ license, open, onClose, onRenewed }: RenewLicenseDialogProps) {
  const { mutateAsync, isPending } = useCreateLicenseRenewal();
  const [newPurchaseDate, setNewPurchaseDate] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [renewalValue, setRenewalValue] = useState('');
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setNewPurchaseDate('');
    setNewExpiryDate('');
    setRenewalValue('');
    setProvider('');
    setNotes('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!newExpiryDate) {
      toast.error('Informe a nova data de expiração');
      return;
    }
    try {
      await mutateAsync({
        license_id: license.id,
        previous_purchase_date: license.purchase_date,
        previous_expiry_date: license.expiry_date,
        new_purchase_date: newPurchaseDate || null,
        new_expiry_date: newExpiryDate || null,
        renewal_value: renewalValue ? parseFloat(renewalValue) : null,
        provider: provider.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success('Renovação registrada com sucesso');
      onRenewed?.();
      handleClose();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao registrar renovação');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            Renovar {license.domain || license.name}
          </DialogTitle>
          <DialogDescription>
            Registre o novo período, valor pago e fornecedor. O histórico fica salvo e o item é atualizado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-purchase">Nova data de compra</Label>
              <Input
                id="new-purchase"
                type="date"
                value={newPurchaseDate}
                onChange={(e) => setNewPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-expiry">Nova data de expiração *</Label>
              <Input
                id="new-expiry"
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="renewal-value">Valor pago (R$)</Label>
              <Input
                id="renewal-value"
                type="number"
                step="0.01"
                min={0}
                placeholder="0,00"
                value={renewalValue}
                onChange={(e) => setRenewalValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider">Fornecedor/Registrador</Label>
              <Input
                id="provider"
                placeholder="Ex: Registro.br, GoDaddy"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renewal-notes">Observações</Label>
            <Textarea
              id="renewal-notes"
              placeholder="Detalhes da renovação, plano, etc."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <div>Período anterior: {license.purchase_date || '—'} → {license.expiry_date || '—'}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !newExpiryDate}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Registrar renovação'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
