import { useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import {
  usePaymentProviders, useSavePaymentCredential, useTestPaymentCredential, useDeletePaymentCredential, useSetDefaultPaymentProvider,
  PAYMENT_PROVIDER_LABELS, type PaymentProvider,
} from '@/hooks/usePaymentProviders';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * Configurações do Comercial → aba "Pagamento" (CRM-2a, ADR-008): cada empresa
 * cola as próprias chaves. Yampi e Stripe podem estar ligados juntos; um é o
 * padrão e o pedido pode trocar. Só owner/admin edita; a chave nunca volta.
 */
export function PaymentProvidersTab() {
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: providers = [], isLoading } = usePaymentProviders();
  const setDefault = useSetDefaultPaymentProvider();
  const remove = useDeletePaymentCredential();
  const status = (p: PaymentProvider) => providers.find((x) => x.provider === p);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como a empresa cobra</CardTitle>
          <CardDescription>
            Cada empresa usa as próprias contas. A chave é guardada no servidor e nunca volta para esta tela — só os 4 últimos caracteres.
            Quem não liga nenhum provedor cobra "por fora" e marca o pedido como pago à mão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum provedor ligado ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <Badge key={p.provider} variant={p.is_default ? 'default' : 'outline'}>
                  {PAYMENT_PROVIDER_LABELS[p.provider as PaymentProvider]}{p.is_default ? ' · padrão' : ''}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ProviderCard
        provider="yampi"
        title="Yampi"
        description="Link de pagamento com cartão (até 12x) e Pix; nota fiscal e Correios continuam como a loja já faz. O preço da tabela do Helpoint vira um cupom de uso único no link."
        current={status('yampi')}
        canEdit={isOwnerOrAdmin}
        fields={[
          { key: 'alias', label: 'Alias da loja', hint: 'O nome da loja na URL do painel da Yampi (ex.: minha-loja).' },
          { key: 'user_token', label: 'User-Token', hint: 'Painel da Yampi → Configurações → Integrações → API.', secret: true },
          { key: 'secret_key', label: 'User-Secret-Key', hint: 'Mesma tela.', secret: true },
        ]}
        webhookNote={`Ao salvar, o Helpoint registra sozinho o aviso "pedido pago" na Yampi, apontando para ${FUNCTIONS_URL}/yampi-webhook.`}
        onSetDefault={() => setDefault.mutate('yampi')}
        onRemove={() => remove.mutate('yampi')}
      />

      <ProviderCard
        provider="stripe"
        title="Stripe"
        description="Link de pagamento com cartão (Pix por convite da Stripe). Não emite nota nem calcula frete — o fluxo da empresa cuida disso."
        current={status('stripe')}
        canEdit={isOwnerOrAdmin}
        fields={[
          { key: 'secret_key', label: 'Chave secreta', hint: 'Painel do Stripe → Developers → API keys (sk_live_… ou sk_test_…).', secret: true },
          { key: 'webhook_secret', label: 'Segredo do webhook', hint: `Registre no Stripe o endereço ${FUNCTIONS_URL}/stripe-webhook com os eventos de checkout e cole aqui o whsec_… gerado.`, secret: true },
        ]}
        onSetDefault={() => setDefault.mutate('stripe')}
        onRemove={() => remove.mutate('stripe')}
      />
    </div>
  );
}

interface Field { key: string; label: string; hint: string; secret?: boolean }

function ProviderCard({ provider, title, description, current, canEdit, fields, webhookNote, onSetDefault, onRemove }: {
  provider: PaymentProvider; title: string; description: string;
  current?: { is_default: boolean; alias: string | null; key_last4: string | null; updated_at: string };
  canEdit: boolean; fields: Field[]; webhookNote?: string; onSetDefault: () => void; onRemove: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const test = useTestPaymentCredential();
  const save = useSavePaymentCredential();

  const payload = () => ({ provider, ...values }) as Parameters<typeof save.mutate>[0];
  const filled = fields.every((f) => (values[f.key] ?? '').trim().length > 0) || !!current;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> {title}
              {current && <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> ligado{current.key_last4 ? ` · …${current.key_last4}` : ''}</Badge>}
              {current?.is_default && <Badge className="text-[10px]">padrão</Badge>}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {current && canEdit && (
            <div className="flex items-center gap-2">
              {!current.is_default && <Button variant="outline" size="sm" onClick={onSetDefault}>Tornar padrão</Button>}
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onRemove}><Trash2 className="h-3.5 w-3.5 mr-1" /> Remover</Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!canEdit ? (
          <p className="text-sm text-muted-foreground">{current ? 'Ligado. Só dono ou administrador altera as chaves.' : 'Só dono ou administrador liga este provedor.'}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label}</Label>
                  <Input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={current ? (f.key === 'alias' && current.alias ? current.alias : 'deixe vazio para manter') : ''}
                  />
                  <p className="text-[11px] text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
            {webhookNote && <p className="text-[11px] text-muted-foreground">{webhookNote}</p>}
            {testResult && <p className="text-xs">{testResult}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!filled || test.isPending} onClick={() => test.mutate(payload(), { onSuccess: (r) => setTestResult(r.ok ? '✓ Conexão OK.' : `✗ ${r.error ?? 'a chave não foi aceita'}`) })}>
                Testar conexão
              </Button>
              <Button size="sm" disabled={!filled || save.isPending} onClick={() => save.mutate(payload(), { onSuccess: (r) => { if (r.ok) { setValues({}); setTestResult(null); } } })}>
                {current ? 'Salvar alterações' : 'Ligar'}
              </Button>
              {provider === 'stripe' && (
                <Button variant="link" size="sm" asChild><a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noreferrer">Painel do Stripe <ExternalLink className="h-3 w-3 ml-1" /></a></Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
