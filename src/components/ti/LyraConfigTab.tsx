import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { useTenantSettings, useUpdateTenantSettings, LyraSettings } from '@/hooks/useTenantSettings';
import { TestTube } from 'lucide-react';
import { useAICredentialStatus, useTestAICredential } from '@/hooks/useTenantAICredentials';
import { toast } from 'sonner';

// Só o que tem efeito (rodada 2, decisão 6 do dono, 2026-10-25): ligar a Lyra e o nome dela. Saíram a saudação (nada a
// lia), o tom, a descrição da empresa, o foco e as instruções (só o resumo do dia os lia, e o chat não; nenhuma empresa
// tinha mudado esses campos). A edge function `ai-secretary` deixou de ler os quatro.
export function LyraConfigTab() {
  const { data: settings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const [isTesting, setIsTesting] = useState(false);
  const { data: aiStatus } = useAICredentialStatus();
  const testCredential = useTestAICredential();

  const lyraSettings = settings?.lyra || {};

  const handleChange = <K extends keyof LyraSettings>(key: K, value: LyraSettings[K]) => {
    updateSettings.mutate({ lyra: { ...lyraSettings, [key]: value } });
  };

  const handleTestConfig = async () => {
    if (!aiStatus?.configured || !aiStatus.provider) {
      toast.error('Configure um provedor de IA na aba "Provedor de IA" antes de testar.');
      return;
    }
    setIsTesting(true);
    try {
      const result = await testCredential.mutateAsync({ provider: aiStatus.provider, model: aiStatus.model || '' });
      if (result?.ok) toast.success('Conexão com o provedor de IA validada.');
      else toast.error(result?.error || 'Não foi possível conectar ao provedor de IA.');
    } catch {
      toast.error('Erro ao testar a conexão. Tente novamente ou avise o suporte.');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72" /></CardHeader>
        <CardContent className="space-y-6"><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <LyraAvatar size="lg" />
          <div>
            <CardTitle>Configurações da Lyra</CardTitle>
            <CardDescription>Ligar ou desligar a assistente e escolher o nome dela.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="lyra-ativa">Ativar Lyra</Label>
            <p className="text-sm text-muted-foreground">O resumo do dia que a Lyra faz na fila e no Início.</p>
          </div>
          <Switch id="lyra-ativa" checked={lyraSettings.enabled !== false} onCheckedChange={(checked) => handleChange('enabled', checked)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="customName">Nome da assistente</Label>
          <Input id="customName" placeholder="Lyra (padrão)" value={lyraSettings.customName || ''}
            onChange={(e) => handleChange('customName', e.target.value)} className="max-w-sm" />
          <p className="text-sm text-muted-foreground">Deixe em branco para usar "Lyra".</p>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleTestConfig} disabled={isTesting} variant="outline" className="gap-2">
            <TestTube className="h-4 w-4" aria-hidden="true" />
            {isTesting ? 'Testando…' : 'Testar a conexão com a IA'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
