import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { useTenantSettings, useUpdateTenantSettings, LyraSettings } from '@/hooks/useTenantSettings';
import { Sparkles, TestTube } from 'lucide-react';
import { useAICredentialStatus, useTestAICredential } from '@/hooks/useTenantAICredentials';
import { toast } from 'sonner';

const TONE_OPTIONS = [
  { value: 'formal', label: 'Formal', description: 'Tom profissional e objetivo' },
  { value: 'semiformal', label: 'Semiformal', description: 'Profissional mas acolhedor' },
  { value: 'casual', label: 'Casual', description: 'Amigável e descontraído' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'sla', label: 'Cumprimento de SLA', description: 'Priorizar chamados próximos do vencimento' },
  { value: 'customer', label: 'Atendimento ao Cliente', description: 'Foco na satisfação do solicitante' },
  { value: 'efficiency', label: 'Eficiência Operacional', description: 'Otimizar tempo e recursos' },
  { value: 'costs', label: 'Redução de Custos', description: 'Minimizar gastos e desperdícios' },
];

export function LyraConfigTab() {
  const { data: settings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const [isTesting, setIsTesting] = useState(false);
  const { data: aiStatus } = useAICredentialStatus();
  const testCredential = useTestAICredential();

  const lyraSettings = settings?.lyra || {};

  const handleChange = <K extends keyof LyraSettings>(key: K, value: LyraSettings[K]) => {
    updateSettings.mutate({
      lyra: {
        ...lyraSettings,
        [key]: value,
      },
    });
  };

  const handlePriorityToggle = (priority: string) => {
    const current = lyraSettings.priorityFocus || [];
    const updated = current.includes(priority)
      ? current.filter(p => p !== priority)
      : [...current, priority];
    handleChange('priorityFocus', updated);
  };

  const handleTestConfig = async () => {
    if (!aiStatus?.configured || !aiStatus.provider) {
      toast.error('Configure um provedor de IA na aba "Provedor de IA" antes de testar.');
      return;
    }
    setIsTesting(true);
    try {
      const result = await testCredential.mutateAsync({
        provider: aiStatus.provider,
        model: aiStatus.model || '',
      });
      if (result?.ok) {
        toast.success('Conexão com o provedor de IA validada.');
      } else {
        toast.error(result?.error || 'Não foi possível conectar ao provedor de IA.');
      }
    } catch {
      toast.error('Erro ao testar a conexão. Tente novamente ou avise o suporte.');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
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
            <CardDescription>
              Personalize o comportamento da assistente IA para sua empresa
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Seção 1: Identidade */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Identidade</h3>
          </div>
          
          <div className="grid gap-4 pl-7">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Ativar Lyra</Label>
                <p className="text-sm text-muted-foreground">
                  Habilitar a assistente IA no dashboard
                </p>
              </div>
              <Switch
                checked={lyraSettings.enabled !== false}
                onCheckedChange={(checked) => handleChange('enabled', checked)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customName">Nome personalizado</Label>
              <Input
                id="customName"
                placeholder="Lyra (padrão)"
                value={lyraSettings.customName || ''}
                onChange={(e) => handleChange('customName', e.target.value)}
                className="max-w-sm"
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para usar "Lyra"
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="greeting">Saudação personalizada</Label>
              <Input
                id="greeting"
                placeholder="Ex: Olá! Como posso ajudar hoje?"
                value={lyraSettings.greeting || ''}
                onChange={(e) => handleChange('greeting', e.target.value)}
                className="max-w-md"
              />
            </div>
          </div>
        </div>

        {/* Seção 2: Tom de Comunicação */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Tom de Comunicação</h3>
          </div>
          
          <div className="pl-7">
            <RadioGroup
              value={lyraSettings.tone || 'semiformal'}
              onValueChange={(value) => handleChange('tone', value as LyraSettings['tone'])}
              className="grid gap-3"
            >
              {TONE_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-start space-x-3">
                  <RadioGroupItem value={option.value} id={`tone-${option.value}`} className="mt-1" />
                  <div className="space-y-0.5">
                    <Label htmlFor={`tone-${option.value}`} className="font-medium cursor-pointer">
                      {option.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        {/* Seção 3: Contexto da Empresa */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Contexto da Empresa</h3>
          </div>
          
          <div className="grid gap-4 pl-7">
            <div className="space-y-2">
              <Label htmlFor="companyContext">Descrição da empresa</Label>
              <Textarea
                id="companyContext"
                placeholder="Ex: Somos uma empresa de tecnologia focada em soluções B2B para o setor industrial. Nossa equipe de TI atende cerca de 500 colaboradores..."
                value={lyraSettings.companyContext || ''}
                onChange={(e) => handleChange('companyContext', e.target.value)}
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                Este contexto ajuda a Lyra a entender seu negócio e dar respostas mais relevantes
              </p>
            </div>

            <div className="space-y-3">
              <Label>Foco de prioridade</Label>
              <div className="grid gap-2">
                {PRIORITY_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-start space-x-3">
                    <Checkbox
                      id={`priority-${option.value}`}
                      checked={(lyraSettings.priorityFocus || []).includes(option.value)}
                      onCheckedChange={() => handlePriorityToggle(option.value)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={`priority-${option.value}`} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Seção 4: Instruções Personalizadas */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Instruções Personalizadas</h3>
          </div>
          
          <div className="pl-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customInstructions">Instruções adicionais</Label>
              <Textarea
                id="customInstructions"
                placeholder="Ex: Sempre mencione o número do chamado ao fazer recomendações. Priorize chamados do setor financeiro. Use termos técnicos quando apropriado..."
                value={lyraSettings.customInstructions || ''}
                onChange={(e) => handleChange('customInstructions', e.target.value)}
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Instruções específicas que a Lyra deve seguir ao gerar resumos e recomendações
              </p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
          <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Sua Lyra, do seu jeito</p>
            <p className="text-sm text-muted-foreground">
              Todas as personalizações feitas aqui são exclusivas da sua empresa. 
              A Lyra aprenderá e se adaptará especificamente às necessidades do seu negócio.
            </p>
          </div>
        </div>

        {/* Test Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={handleTestConfig}
            disabled={isTesting}
            className="gap-2"
          >
            <TestTube className="h-4 w-4" />
            {isTesting ? 'Testando...' : 'Testar Configuração'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
