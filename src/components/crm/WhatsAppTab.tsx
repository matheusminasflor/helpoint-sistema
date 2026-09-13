import { useState } from 'react';
import { MessageCircle, Copy, Check, ExternalLink, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  useEstadoWhatsApp, useSalvarWhatsApp, useTestarWhatsApp, useDesligarWhatsApp,
} from '@/hooks/useWhatsApp';

/**
 * Ligar o WhatsApp da empresa (CRM-4a, ADR-006).
 *
 * É a API oficial da Meta, e o caminho tem duas pontas: aqui se guardam os
 * identificadores e o token; **lá** no painel da Meta se cola o endereço do
 * webhook e a chave de verificação que esta tela mostra. Uma ponta sem a outra
 * não recebe mensagem nenhuma, e é o engano mais comum de quem liga sozinho.
 */
export function WhatsAppTab() {
  const { data: estado, isLoading } = useEstadoWhatsApp();
  const salvar = useSalvarWhatsApp();
  const testar = useTestarWhatsApp();
  const desligar = useDesligarWhatsApp();

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [token, setToken] = useState('');
  const [appSecret, setAppSecret] = useState('');

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const conectado = !!estado?.conectado;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start gap-3">
        <MessageCircle className="w-5 h-5 text-primary mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">WhatsApp da empresa</h3>
          <p className="text-[13px] text-muted-foreground">
            Pela API oficial da Meta. A mensagem de quem escreve para este número vira um negócio
            no funil, e a conversa aparece dentro dele.
          </p>
        </div>
      </div>

      {conectado ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-medium text-foreground">
                {estado?.numero ?? 'número ligado'}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {estado?.ativo ? 'Recebendo mensagens.' : 'Desligado — nada entra por aqui.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={estado?.ativo ? 'default' : 'secondary'} className="text-[10px]">
                {estado?.ativo ? 'Ligado' : 'Desligado'}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => testar.mutate()} disabled={testar.isPending}>
                Testar conexão
              </Button>
              {estado?.ativo && (
                <Button variant="ghost" size="sm" onClick={() => desligar.mutate()} disabled={desligar.isPending}>
                  <Power className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  Desligar
                </Button>
              )}
            </div>
          </div>

          {!estado?.assinatura_configurada && (
            <p className="text-[12px] text-destructive">
              Falta a chave secreta do aplicativo. Sem ela o sistema recusa as mensagens da Meta,
              porque não tem como provar que vieram mesmo dela. Preencha abaixo e salve de novo.
            </p>
          )}

          <div className="rounded-md bg-muted/40 p-3 space-y-2">
            <p className="text-[12px] font-medium text-foreground">
              Cole estes dois no painel da Meta, em Webhooks:
            </p>
            <CampoCopiavel rotulo="Endereço (Callback URL)" valor={estado?.webhook_url ?? ''} />
            <CampoCopiavel rotulo="Chave de verificação (Verify token)" valor={estado?.verify_token ?? ''} />
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
            >
              Abrir o painel da Meta
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="text-[13px] text-muted-foreground">
            Ainda não há número ligado. Você precisa de uma conta Meta Business verificada, um número
            dedicado (que não esteja em nenhum WhatsApp comum) e uma forma de pagamento cadastrada
            na Meta. Com isso em mãos, os três campos abaixo estão no painel deles.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">
          {conectado ? 'Trocar a credencial' : 'Ligar o número'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Identificador do número (Phone number ID)</Label>
            <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="1234567890" />
          </div>
          <div className="space-y-1.5">
            <Label>Identificador da conta (WABA ID)</Label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="0987654321" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Token de acesso permanente</Label>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAA..." />
          <p className="text-[11px] text-muted-foreground">
            Guardado em cofre e nunca mostrado de volta — nem para você. Para trocar, cole um novo.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Chave secreta do aplicativo (App secret)</Label>
          <Input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            É com ela que o sistema confere que a mensagem veio mesmo da Meta.
          </p>
        </div>

        <Button
          disabled={!phoneNumberId.trim() || !wabaId.trim() || !token.trim() || salvar.isPending}
          onClick={() => salvar.mutate(
            {
              phone_number_id: phoneNumberId.trim(),
              waba_id: wabaId.trim(),
              access_token: token.trim(),
              app_secret: appSecret.trim() || undefined,
            },
            { onSuccess: () => { setToken(''); setAppSecret(''); } },
          )}
        >
          {conectado ? 'Salvar credencial' : 'Ligar WhatsApp'}
        </Button>
      </div>
    </div>
  );
}

function CampoCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{rotulo}</Label>
      <div className="flex gap-2">
        <Input readOnly value={valor} className="font-mono text-[11px]" />
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copiar ${rotulo}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              toast.error('Não foi possível copiar — selecione e copie à mão.');
            }
          }}
        >
          {copiado ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
