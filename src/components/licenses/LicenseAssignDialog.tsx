import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface Asset {
  id: string;
  name: string;
  asset_tag: string;
}

interface LicenseAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licenseId: string;
  onAssign: (data: { license_id: string; assigned_to?: string; asset_id?: string; assigned_by: string; notes?: string }) => void;
  isLoading?: boolean;
}

export function LicenseAssignDialog({ open, onOpenChange, licenseId, onAssign, isLoading }: LicenseAssignDialogProps) {
  const { user } = useAuth();
  const [assignType, setAssignType] = useState<'user' | 'asset'>('user');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [usersRes, assetsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').eq('is_active', true).order('full_name'),
        supabase.from('assets').select('id, name, asset_tag').eq('status', 'active').order('name'),
      ]);

      if (usersRes.data) setUsers(usersRes.data);
      if (assetsRes.data) setAssets(assetsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = () => {
    if (!user?.id) return;

    const data = {
      license_id: licenseId,
      assigned_by: user.id,
      notes: notes || undefined,
      ...(assignType === 'user' ? { assigned_to: selectedUser } : { asset_id: selectedAsset }),
    };

    onAssign(data);
  };

  const isValid = assignType === 'user' ? !!selectedUser : !!selectedAsset;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir Licença</DialogTitle>
          <DialogDescription>
            Selecione um usuário ou ativo para receber esta licença.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Tabs value={assignType} onValueChange={(v) => setAssignType(v as 'user' | 'asset')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="user">Usuário</TabsTrigger>
              <TabsTrigger value="asset">Ativo</TabsTrigger>
            </TabsList>
            <TabsContent value="user" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Selecione o Usuário</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser} disabled={loadingData}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingData ? 'Carregando...' : 'Selecione um usuário'} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            <TabsContent value="asset" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Selecione o Ativo</Label>
                <Select value={selectedAsset} onValueChange={setSelectedAsset} disabled={loadingData}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingData ? 'Carregando...' : 'Selecione um ativo'} />
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
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              placeholder="Informações adicionais sobre a atribuição..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isLoading}>
            {isLoading ? 'Atribuindo...' : 'Atribuir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
