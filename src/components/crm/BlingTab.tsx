import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileText, Link2, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useBlingStatus, useConnectBling, useExchangeBlingCode, useDisconnectBling, useBlingPaymentMethods, useSaveBlingSettings, type BlingSettings } from '@/hooks/useBling';

/**
 * Configurações do Comercial → aba "Nota fiscal" (CRM-2b, ADR-008): a empresa
 * conecta a própria conta do Bling e escolhe forma de pagamento, se gera a
 * NF-e e se transmite. Quem emite pela Yampi ou por outro sistema não conecta.
 */
export function BlingTab() {
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: status, isLoading } = useBlingStatus();
  const connect = useConnectBling();
  const exchange = useExchangeBlingCode();
  const disconnect = useDisconnectBling();
  const save = useSaveBlingSettings();
  const connected = !!status;
  const { data: methods = [], isLoading: methodsLoading, error: methodsError } = useBlingPaymentMethods(connected && isOwnerOrAdmin);
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<BlingSettings | null>(null);
  const settings: BlingSettings = draft ?? ((status?.settings as BlingSettings | null) ?? {});

  // Volta do Bling: ?bling_code=…&bling_state=… (troca pelo token com o JWT de quem clicou) ou ?bling=erro&motivo=…
  useEffect(() => {
    const code = params.get('bling_code');
    const state = params.get('bling_state');
    const erro = params.get('bling');
    if (!code && !erro) return;
    if (code && state) exchange.mutate({ code, state });
    else if (erro) toast.error(`Não deu para conectar ao Bling: ${params.get('motivo') ?? 'erro desconhecido'}`);
    const next = new URLSearchParams(params);
    for (const k of ['bling_code', 'bling_state', 'bling', 'motivo']) next.delete(k);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez por volta do Bling; `exchange` é estável o bastante
  }, [params, setParams]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Bling
                {connected && <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> conectado</Badge>}
              </CardTitle>
              <CardDescription>
                Quando o pedido é pago, o fluxo lança o pedido de venda no Bling e, se você quiser, gera e transmite a NF-e.
                Cada empresa conecta a própria conta; o Helpoint nunca vê a senha. Quem emite nota pela Yampi ou por outro sistema não precisa conectar.
              </CardDescription>
            </div>
            {isOwnerOrAdmin && (connected ? (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}><Unplug className="h-3.5 w-3.5 mr-1" /> Desconectar</Button>
            ) : (
              <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending || exchange.isPending || isLoading}><Link2 className="h-3.5 w-3.5 mr-1" /> {exchange.isPending ? 'Conectando…' : 'Conectar com Bling'}</Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isLoading ? <p className="text-muted-foreground">Carregando...</p> : !connected ? (
            <p className="text-muted-foreground">{isOwnerOrAdmin ? 'Clique em "Conectar com Bling": o Bling pede seu login e autoriza o Helpoint. Você volta para cá.' : 'Só dono ou administrador conecta o Bling.'}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Última renovação em {new Date(status!.updated_at).toLocaleString('pt-BR')} — a autorização se renova sozinha a cada uso; se ficar 30 dias sem uso, conecte de novo.
              </p>
              {!isOwnerOrAdmin ? (
                <p className="text-muted-foreground">Só dono ou administrador muda as escolhas.</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5 max-w-sm">
                    <Label>Forma de pagamento do pedido no Bling</Label>
                    {methodsError ? (
                      <p className="text-xs text-destructive">Não deu para listar as formas de pagamento: {methodsError.message}</p>
                    ) : (
                      <Select value={settings.forma_pagamento_id ? String(settings.forma_pagamento_id) : ''} onValueChange={(v) => { const m = methods.find((x) => String(x.id) === v); setDraft({ ...settings, forma_pagamento_id: Number(v), forma_pagamento_nome: m?.descricao }); }}>
                        <SelectTrigger><SelectValue placeholder={methodsLoading ? 'Carregando...' : 'Escolha'} /></SelectTrigger>
                        <SelectContent>{methods.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.descricao}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    <p className="text-[11px] text-muted-foreground">O Bling exige uma forma de pagamento na parcela do pedido. Use a que representa "cartão/Pix pelo link" na sua conta.</p>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch id="bling-gerar" checked={!!settings.gerar_nfe} onCheckedChange={(v) => setDraft({ ...settings, gerar_nfe: v, ...(v ? {} : { enviar_nfe: false }) })} />
                    <Label htmlFor="bling-gerar" className="font-normal">Gerar a NF-e a partir do pedido</Label>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch id="bling-enviar" checked={!!settings.enviar_nfe} disabled={!settings.gerar_nfe} onCheckedChange={(v) => setDraft({ ...settings, enviar_nfe: v })} />
                    <Label htmlFor="bling-enviar" className="font-normal">Transmitir a NF-e à SEFAZ na hora (sem revisar no Bling)</Label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Estas são as escolhas padrão; o passo "Pedido no Bling" de cada fluxo pode mudá-las.</p>
                  <Button size="sm" disabled={!draft || save.isPending} onClick={() => save.mutate(settings, { onSuccess: () => setDraft(null) })}>Salvar escolhas</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
