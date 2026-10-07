import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KeyRound, ShieldCheck, TestTube, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/supabase-result';
import {
  AI_PROVIDERS,
  AIProvider,
  useAICredentialStatus,
  useDeleteAICredential,
  useModelosDaIA,
  useSaveAICredential,
  useTestAICredential,
} from '@/hooks/useTenantAICredentials';
import { useAssistantName } from '@/hooks/useAssistantName';

export function AIProviderTab() {
  const assistantName = useAssistantName();
  const { data: status, isLoading } = useAICredentialStatus();
  const saveMutation = useSaveAICredential();
  const testMutation = useTestAICredential();
  const deleteMutation = useDeleteAICredential();

  const [provider, setProvider] = useState<AIProvider>('google');
  const [model, setModel] = useState('gemini-3.8-flash');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (status?.configured && status.provider) {
      setProvider(status.provider);
      setModel(status.model || '');
    }
  }, [status?.configured, status?.provider, status?.model]);

  const handleProviderChange = (value: AIProvider) => {
    setProvider(value);
    const def = AI_PROVIDERS.find((p) => p.value === value);
    if (def) setModel(def.defaultModel);
  };

  const modelosMutation = useModelosDaIA();
  const [modelos, setModelos] = useState<string[]>([]);
  const handleModelos = async () => {
    try {
      const r = await modelosMutation.mutateAsync({ provider, api_key: apiKey || undefined });
      if (r?.ok && r.modelos?.length) setModelos(r.modelos);
      else toast.error(r?.error || 'O provedor não devolveu nenhum modelo para esta chave.');
    } catch (e) {
      toast.error('Não foi possível consultar os modelos', { description: mensagemDeErro(e) });
    }
  };

  // Falha na chamada (rede, função fora do ar) também vira mensagem — antes a promessa rejeitada
  // ficava sem tratamento e a pessoa não via nada (dono, 2026-10-07).
  const handleTest = async () => {
    try {
      const result = await testMutation.mutateAsync({
        provider,
        model,
        api_key: apiKey || undefined,
      });
      if (result?.ok) toast.success('Conexão com o provedor de IA validada.');
      else toast.error(result?.error || 'Não foi possível conectar ao provedor.');
    } catch (e) {
      toast.error('Não foi possível testar a conexão', { description: mensagemDeErro(e) });
    }
  };

  const handleSave = async () => {
    if (apiKey.trim().length < 12) {
      toast.error('Informe uma chave de API válida.');
      return;
    }
    try {
      const result = await saveMutation.mutateAsync({ provider, api_key: apiKey.trim(), model });
      if (result?.ok) {
        setApiKey('');
        toast.success('Provedor de IA configurado.');
      } else {
        toast.error(result?.error || 'Não foi possível salvar a chave.');
      }
    } catch (e) {
      toast.error('Não foi possível salvar a chave', { description: mensagemDeErro(e) });
    }
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync();
    setApiKey('');
    toast.success('Credencial de IA removida.');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const providerHint = AI_PROVIDERS.find((p) => p.value === provider)?.hint;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Provedor de IA</CardTitle>
            <CardDescription>
              O(A) {assistantName} usa a chave de IA da sua empresa. A chave fica guardada no
              servidor e nunca é exibida de volta.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-2">
          {status?.configured ? (
            <>
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Chave configurada
              </Badge>
              <span className="font-mono text-sm text-muted-foreground">
                ••••{status.key_last4}
              </span>
            </>
          ) : (
            <Badge variant="outline">Nenhuma chave configurada</Badge>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select value={provider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-model">Modelo</Label>
            <Input
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Ex.: gpt-4o-mini"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-key">
            {status?.configured ? 'Substituir chave de API' : 'Chave de API'}
          </Label>
          <Input
            id="ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.configured ? 'Informe uma nova chave para substituir' : 'Cole a chave aqui'}
          />
          <p className="text-xs text-muted-foreground">{providerHint}</p>
        </div>

        {/* Em vez de adivinhar o nome do modelo, pergunta ao provedor quais a chave usa (2026-10-07). */}
        <div className="space-y-2">
          <Button variant="outline" size="sm" onClick={handleModelos} disabled={modelosMutation.isPending}>
            {modelosMutation.isPending ? 'Consultando…' : 'Ver modelos disponíveis para esta chave'}
          </Button>
          {modelos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {modelos.map((m) => (
                <Button key={m} type="button" size="sm" variant={m === model ? 'default' : 'secondary'}
                  className="h-7 text-[12px]" onClick={() => setModel(m)}>
                  {m}
                </Button>
              ))}
            </div>
          )}
          {modelos.length > 0 && (
            <p className="text-xs text-muted-foreground">Clique num modelo para usá-lo; prefira um "flash" (rápido e barato).</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Validando e salvando…' : 'Salvar chave'}
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testMutation.isPending || (!apiKey && !status?.configured)}
          >
            <TestTube className="mr-2 h-4 w-4" />
            {testMutation.isPending ? 'Testando…' : 'Testar conexão'}
          </Button>
          {status?.configured && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remover
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Sem um provedor configurado, os recursos de IA ficam desativados e exibem um aviso para
          quem tentar usá-los.
        </p>
      </CardContent>
    </Card>
  );
}
