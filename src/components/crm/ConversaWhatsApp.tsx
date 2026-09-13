import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, AlertTriangle, Check, CheckCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useConversa, useUltimaEntrada, useEnviarWhatsApp, useModelosWhatsApp, useEnviarModelo,
  janelaAberta, type MensagemRow,
} from '@/hooks/useWhatsApp';

/**
 * A conversa do WhatsApp dentro do negócio (CRM-4a).
 *
 * A Meta só deixa escrever livremente nas 24 horas depois da última mensagem do
 * cliente. A tela mostra quanto falta **antes** de a pessoa digitar — descobrir
 * isso depois de escrever um texto longo é a pior hora.
 */
export function ConversaWhatsApp({ dealId, contactId, nomeDoCliente }: {
  dealId: string;
  contactId: string;
  nomeDoCliente: string;
}) {
  const { data: mensagens = [], isLoading } = useConversa(dealId);
  const { data: ultimaEntrada } = useUltimaEntrada(contactId);
  const enviar = useEnviarWhatsApp(dealId);
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  const { aberta, horasRestantes } = janelaAberta(ultimaEntrada);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (mensagens.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
        <p className="text-[13px] text-muted-foreground">
          Nenhuma conversa por WhatsApp com {nomeDoCliente} ainda.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Quando essa pessoa escrever para o número da empresa, a mensagem aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="max-h-[420px] overflow-y-auto p-3 space-y-2 bg-muted/30">
        {mensagens.map(m => <Balao key={m.id} mensagem={m} />)}
        <div ref={fim} />
      </div>

      <div className="border-t border-border p-3 space-y-2 bg-card">
        {!aberta ? (
          <ModeloParaRetomar dealId={dealId} nomeDoCliente={nomeDoCliente} />
        ) : (
          <>
            <Textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`Responder ${nomeDoCliente}…`}
              maxLength={4096}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) {
                  enviar.mutate(texto.trim(), { onSuccess: () => setTexto('') });
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {horasRestantes < 3
                  ? `Resta menos de ${Math.ceil(horasRestantes)} h para responder livremente.`
                  : 'Ctrl + Enter envia.'}
              </span>
              <Button
                size="sm"
                disabled={!texto.trim() || enviar.isPending}
                onClick={() => enviar.mutate(texto.trim(), { onSuccess: () => setTexto('') })}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Enviar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Fora da janela de 24 h, a Meta só aceita mensagem-modelo aprovada por ela.
 * Em vez de mandar a pessoa para o celular, a tela oferece os modelos que a
 * empresa já tem — que é a razão de o dono ter pedido este recurso: retomar
 * quem esfriou.
 */
function ModeloParaRetomar({ dealId, nomeDoCliente }: { dealId: string; nomeDoCliente: string }) {
  const { data: modelos = [] } = useModelosWhatsApp();
  const enviar = useEnviarModelo(dealId);
  const [escolhido, setEscolhido] = useState('');
  const [vars, setVars] = useState<string[]>([]);

  const aprovados = modelos.filter(m => m.status === 'APPROVED');
  const modelo = aprovados.find(m => m.name === escolhido);
  const faltaAlguma = !!modelo && vars.slice(0, modelo.variaveis).some(v => !v?.trim());

  if (aprovados.length === 0) {
    return (
      <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Passaram-se mais de 24 horas desde a última mensagem de {nomeDoCliente}. A Meta só
          permite retomar com uma mensagem-modelo aprovada por ela, e esta empresa ainda não tem
          nenhuma — elas se escrevem no painel da Meta e aparecem em Configurações do Comercial →
          WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Passaram-se mais de 24 horas desde a última mensagem de {nomeDoCliente}. Para retomar,
          escolha uma mensagem-modelo — cada envio é cobrado pela Meta.
        </p>
      </div>

      <Select
        value={escolhido}
        onValueChange={(v) => {
          setEscolhido(v);
          setVars(new Array(aprovados.find(m => m.name === v)?.variaveis ?? 0).fill(''));
        }}
      >
        <SelectTrigger><SelectValue placeholder="Escolha a mensagem" /></SelectTrigger>
        <SelectContent>
          {aprovados.map(m => (
            <SelectItem key={`${m.name}|${m.language}`} value={m.name}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {modelo && (
        <>
          <p className="text-[12px] text-muted-foreground whitespace-pre-wrap rounded-md bg-muted/40 p-2">
            {modelo.body}
          </p>
          {Array.from({ length: modelo.variaveis }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-10 shrink-0 font-mono">{`{{${i + 1}}}`}</span>
              <Input
                value={vars[i] ?? ''}
                onChange={(e) => {
                  const novo = [...vars];
                  novo[i] = e.target.value;
                  setVars(novo);
                }}
                placeholder={i === 0 ? nomeDoCliente : 'preencha'}
              />
            </div>
          ))}
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={faltaAlguma || enviar.isPending}
              onClick={() => enviar.mutate({
                modelo: modelo.name,
                idioma: modelo.language,
                vars: vars.slice(0, modelo.variaveis),
              })}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Enviar modelo
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Balao({ mensagem }: { mensagem: MensagemRow }) {
  const minha = mensagem.direction === 'out';
  const hora = new Date(mensagem.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 ${
          minha ? 'bg-primary/10 border border-primary/20' : 'bg-card border border-border'
        }`}
      >
        {mensagem.media_url && !mensagem.body?.startsWith('[') && (
          <p className="text-[11px] text-muted-foreground mb-1">Anexo: {mensagem.media_type}</p>
        )}
        <p className="text-[13px] text-foreground whitespace-pre-wrap break-words">{mensagem.body}</p>
        <div className="flex items-center justify-end gap-1 mt-1">
          {mensagem.status === 'failed' && (
            <span className="text-[10px] text-destructive" title={mensagem.error ?? undefined}>
              não saiu
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{hora}</span>
          {minha && <Recibo status={mensagem.status} />}
        </div>
      </div>
    </div>
  );
}

/** Os tiquinhos: um enviado, dois entregue, dois azuis lido — como no WhatsApp. */
function Recibo({ status }: { status: string }) {
  if (status === 'failed') return null;
  if (status === 'read') {
    return <CheckCheck className="w-3 h-3 text-primary" aria-label="lida" />;
  }
  if (status === 'delivered') {
    return <CheckCheck className="w-3 h-3 text-muted-foreground" aria-label="entregue" />;
  }
  if (status === 'sent') {
    return <Check className="w-3 h-3 text-muted-foreground" aria-label="enviada" />;
  }
  return <Clock className="w-3 h-3 text-muted-foreground" aria-label="na fila" />;
}
