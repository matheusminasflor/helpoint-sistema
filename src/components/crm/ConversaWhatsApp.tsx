import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, AlertTriangle, Check, CheckCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EscolherModelo } from '@/components/crm/EscolherModelo';
import {
  useConversa, useUltimaEntrada, useEnviarWhatsApp, useModelosWhatsApp, useEnviarModelo,
  useModeloBloqueadoAte, janelaAberta, faltaLacuna, type MensagemRow, type EscolhaDeModelo,
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
          <ModeloParaRetomar dealId={dealId} contactId={contactId} nomeDoCliente={nomeDoCliente} />
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
function ModeloParaRetomar({ dealId, contactId, nomeDoCliente }: {
  dealId: string;
  contactId: string;
  nomeDoCliente: string;
}) {
  const { data: modelos = [] } = useModelosWhatsApp();
  const { data: bloqueadoAte } = useModeloBloqueadoAte(contactId);
  const enviar = useEnviarModelo(dealId);
  const [escolha, setEscolha] = useState<EscolhaDeModelo>({ modelo: '', idioma: 'pt_BR', vars: [] });

  const temAprovado = modelos.some(m => m.status === 'APPROVED');

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Passaram-se mais de 24 horas desde a última mensagem de {nomeDoCliente}.
          {temAprovado
            ? ' Para retomar, escolha uma mensagem-modelo — cada envio é cobrado pela Meta.'
            : ' A Meta só permite retomar com uma mensagem-modelo aprovada por ela.'}
        </p>
      </div>

      {/* A trava de uma mensagem por cliente vale para os fluxos automáticos.
          Aqui ela **avisa** e deixa passar: quem está com o cliente na mão sabe
          o que a regra não sabe — mas decide sabendo. */}
      {bloqueadoAte && (
        <p className="text-[12px] text-foreground rounded-md border border-border bg-muted/60 p-2">
          Este cliente já recebeu uma mensagem-modelo nos últimos 7 dias. Os fluxos automáticos não
          vão mandar outra antes de {new Date(bloqueadoAte).toLocaleDateString('pt-BR')} — você pode
          mandar assim mesmo, e o envio será cobrado normalmente.
        </p>
      )}

      <EscolherModelo valor={escolha} onChange={setEscolha} placeholderPrimeira={nomeDoCliente} />

      {escolha.modelo && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={faltaLacuna(escolha, modelos) || enviar.isPending}
            onClick={() => enviar.mutate(escolha)}
          >
            <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            {bloqueadoAte ? 'Enviar assim mesmo' : 'Enviar modelo'}
          </Button>
        </div>
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
