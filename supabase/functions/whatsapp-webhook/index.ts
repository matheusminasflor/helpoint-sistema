// O que a Meta manda quando alguém escreve para o número da empresa (CRM-4a).
//
// GET  — a verificação do endereço, uma vez, quando o webhook é cadastrado no
//        painel da Meta. Devolve o `hub.challenge` se o token bater.
// POST — mensagens recebidas e mudanças de status das que saíram.
//
// Sem JWT (`verify_jwt = false` no config.toml): quem chama é a Meta, não um
// usuário. Quem prova que é ela é a assinatura `X-Hub-Signature-256`, conferida
// contra o segredo do app **daquela empresa**.
//
// Duas coisas que este arquivo trata e não parecem óbvias:
//  1. A Meta **reentrega** o que não foi confirmado com 200 rápido. Por isso a
//     gravação passa por `crm_whatsapp_receber`, que é idempotente pelo id da
//     mensagem — responder 500 aqui significa receber tudo de novo.
//  2. Uma chamada pode trazer várias mensagens, de vários números.
import { adminClient, getConnectionByPhoneNumberId, assinaturaConfere } from '../_shared/whatsapp.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface MetaValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: {
    id?: string; from?: string; type?: string;
    text?: { body?: string };
    image?: { id?: string; mime_type?: string };
    document?: { id?: string; mime_type?: string; filename?: string };
    audio?: { id?: string; mime_type?: string };
    video?: { id?: string; mime_type?: string };
    button?: { text?: string };
    interactive?: { list_reply?: { title?: string }; button_reply?: { title?: string } };
  }[];
  statuses?: { id?: string; status?: string; errors?: { title?: string }[] }[];
}

/** O texto que interessa, seja qual for o tipo de mensagem. */
function textoDe(m: NonNullable<MetaValue['messages']>[number]): string | null {
  return m.text?.body
    ?? m.button?.text
    ?? m.interactive?.button_reply?.title
    ?? m.interactive?.list_reply?.title
    ?? null;
}

/** O anexo, quando há. A Meta manda um id; baixar o arquivo fica para depois. */
function midiaDe(m: NonNullable<MetaValue['messages']>[number]): { tipo: string; id: string } | null {
  for (const k of ['image', 'document', 'audio', 'video'] as const) {
    const v = m[k] as { id?: string; mime_type?: string } | undefined;
    if (v?.id) return { tipo: v.mime_type ?? k, id: v.id };
  }
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Verificação do endereço, feita uma vez pelo painel da Meta ────────────
  if (req.method === 'GET') {
    const modo = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const desafio = url.searchParams.get('hub.challenge');
    if (modo !== 'subscribe' || !token) return new Response('forbidden', { status: 403 });

    const admin = adminClient();
    const { data, error } = await admin
      .from('tenant_whatsapp_connections').select('tenant_id').eq('verify_token', token).maybeSingle();
    if (error) {
      console.error('whatsapp-webhook verify', error.message);
      return new Response('erro', { status: 500 });
    }
    if (!data) return new Response('forbidden', { status: 403 });
    return new Response(desafio ?? '', { status: 200 });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    // O corpo **cru**: a assinatura é sobre estes bytes, não sobre o objeto
    // reserializado, que sai com espaços e ordem diferentes.
    const raw = await req.text();
    const body = JSON.parse(raw || '{}') as {
      entry?: { changes?: { value?: MetaValue }[] }[];
    };

    const admin = adminClient();
    let tratadas = 0;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const cred = await getConnectionByPhoneNumberId(admin, phoneNumberId);

        // Número desconhecido, empresa desligada, segredo ausente e assinatura
        // errada saem todos pela **mesma porta**, com a mesma resposta. Se a
        // recusa por assinatura fosse distinguível da de número desconhecido,
        // quem achasse o endereço do webhook descobriria, um chute por vez,
        // quais números estão ligados ao Helpoint. O log guarda a diferença —
        // quem precisa dela é quem opera, não quem chama.
        const recusa = !cred ? 'numero desconhecido'
          : !cred.is_active ? 'empresa desligada'
            : !cred.app_secret ? 'empresa sem app_secret'
              : !await assinaturaConfere(cred.app_secret, raw, req.headers.get('x-hub-signature-256'))
                ? 'assinatura invalida'
                : null;
        if (recusa || !cred) {
          console.warn('whatsapp-webhook recusado:', recusa, phoneNumberId);
          continue;
        }

        // ── Mensagens recebidas ──────────────────────────────────────────────
        for (const m of value?.messages ?? []) {
          const de = m.from;
          if (!de) continue;
          const nome = value?.contacts?.find(c => c.wa_id === de)?.profile?.name ?? null;
          const midia = midiaDe(m);
          const texto = textoDe(m)
            ?? (midia ? `[${midia.tipo.split('/')[0]}]` : '[mensagem sem texto]');

          // A empresa é resolvida **dentro** da função, pelo número de destino:
          // assim nenhum chamador consegue gravar na empresa errada.
          const { error } = await admin.rpc('crm_whatsapp_receber', {
            p_phone_number_id: phoneNumberId,
            p_wa_id: de,
            p_nome: nome,
            p_wa_message: m.id ?? null,
            p_body: texto,
            p_media_url: midia?.id ?? null,
            p_media_type: midia?.tipo ?? null,
          });
          if (error) throw error;
          tratadas++;
        }

        // ── Status das que saíram (entregue, lida, falhou) ────────────────────
        for (const s of value?.statuses ?? []) {
          if (!s.id || !s.status) continue;
          // `read` não volta para `delivered`: a Meta manda os status fora de
          // ordem, e sem isto uma mensagem lida voltaria a "entregue".
          const ordem = ['queued', 'sent', 'delivered', 'read'];
          const novo = s.status === 'failed' ? 'failed' : s.status;
          // O erro não se engole nem aqui: sem ler o `error`, uma falha de
          // leitura viraria um `continue` calado, e o "entregue"/"lida" sumiria
          // sem ninguém saber por quê.
          const { data: atual, error: leituraErro } = await admin
            .from('crm_messages').select('id, status')
            .eq('tenant_id', cred.tenant_id).eq('wa_message_id', s.id).maybeSingle();
          if (leituraErro) throw leituraErro;
          if (!atual) continue;
          const antes = (atual as { status: string }).status;
          if (novo !== 'failed' && ordem.indexOf(novo) <= ordem.indexOf(antes)) continue;

          const { error } = await admin.from('crm_messages')
            .update({ status: novo, error: s.errors?.[0]?.title ?? null })
            .eq('id', (atual as { id: string }).id).select('id');
          if (error) throw error;
        }
      }
    }

    return json({ ok: true, tratadas });
  } catch (e) {
    // 500 faz a Meta reentregar — que é o certo quando o erro é nosso, porque a
    // gravação é idempotente e nada duplica na segunda tentativa.
    console.error('whatsapp-webhook', e instanceof Error ? e.message : String(e));
    return json({ error: 'erro ao processar' }, 500);
  }
});
