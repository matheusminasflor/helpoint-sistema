// O WhatsApp oficial da Meta, num lugar só (CRM-4a, ADR-006).
//
// A conexão é **por empresa**: cada tenant registra o próprio número na Meta e
// guarda aqui o `phone_number_id`, o `waba_id` e o token. A tabela é fechada —
// nem `authenticated` lê — então tudo passa pela chave de serviço.
//
// Nada de conexão por QR code: num produto vendido a terceiros, banimento do
// número de um cliente não é risco aceitável (ADR-006).
import { adminClient, timingSafeEqual } from './payment-credentials.ts';

/** Versão da Graph API. Subir isto é decisão consciente, não efeito colateral. */
const GRAPH = 'https://graph.facebook.com/v21.0';

export interface WhatsAppConnection {
  tenant_id: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  display_phone: string | null;
  verify_token: string;
  app_secret: string | null;
  is_active: boolean;
}

export async function getConnectionByPhoneNumberId(
  admin: ReturnType<typeof adminClient>,
  phoneNumberId: string,
): Promise<WhatsAppConnection | null> {
  const { data, error } = await admin
    .from('tenant_whatsapp_connections').select('*')
    .eq('phone_number_id', phoneNumberId).maybeSingle();
  if (error) throw error;
  return (data as WhatsAppConnection | null) ?? null;
}

export async function getConnectionByTenant(
  admin: ReturnType<typeof adminClient>,
  tenantId: string,
): Promise<WhatsAppConnection | null> {
  const { data, error } = await admin
    .from('tenant_whatsapp_connections').select('*')
    .eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return (data as WhatsAppConnection | null) ?? null;
}

/**
 * Chamada à Graph API com o token da empresa. O erro da Meta vem em
 * `error.message`, e é ele que interessa a quem está na tela — "(#131030)
 * Recipient phone number not in allowed list" diz o que fazer; "erro 400" não.
 */
export async function metaFetch<T>(
  cred: Pick<WhatsAppConnection, 'access_token'>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let motivo = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      motivo = j?.error?.message ?? motivo;
    } catch { /* corpo não-JSON: fica o texto cru mesmo */ }
    throw new Error(`whatsapp: ${motivo}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Manda um texto simples. Só vale dentro das 24h desde a última mensagem do cliente. */
export async function enviarTexto(
  cred: WhatsAppConnection,
  para: string,
  texto: string,
): Promise<string | null> {
  const r = await metaFetch<{ messages?: { id: string }[] }>(
    cred,
    `${cred.phone_number_id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: para,
        type: 'text',
        text: { preview_url: false, body: texto },
      }),
    },
  );
  return r?.messages?.[0]?.id ?? null;
}

/**
 * Manda uma **mensagem-modelo** (template). É o único jeito de falar com quem
 * não escreveu nas últimas 24 h, e o texto precisa estar aprovado pela Meta.
 *
 * `vars` preenche as lacunas `{{1}}`, `{{2}}`… na ordem. A Meta recusa a
 * mensagem inteira se faltar uma, então quem chama confere antes.
 */
export async function enviarTemplate(
  cred: WhatsAppConnection,
  para: string,
  nome: string,
  idioma: string,
  vars: string[],
): Promise<string | null> {
  const components = vars.length
    ? [{ type: 'body', parameters: vars.map(v => ({ type: 'text', text: v })) }]
    : [];
  const r = await metaFetch<{ messages?: { id: string }[] }>(
    cred,
    `${cred.phone_number_id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: para,
        type: 'template',
        template: { name: nome, language: { code: idioma }, components },
      }),
    },
  );
  return r?.messages?.[0]?.id ?? null;
}

export interface ResultadoModelo {
  enviado: boolean;
  motivo?: string;
  message_id?: string | null;
  para?: string;
  /** Recusado pela trava de uma mensagem por cliente, não por erro. */
  travado?: boolean;
}

/**
 * Manda a mensagem-modelo para o cliente de um negócio e **grava na conversa**.
 *
 * Mora aqui, e não em cada chamador, porque quem a usa são dois caminhos muito
 * diferentes — o vendedor clicando na tela e o fluxo automático rodando de
 * madrugada — e eles precisam se comportar igual. A validação do modelo é a
 * parte que mais custa caro se divergir: a Meta recusa a mensagem inteira
 * quando falta uma lacuna, e a mensagem de erro dela não diz qual.
 *
 * Não confere a janela de 24 h de propósito: o modelo existe exatamente para
 * atravessá-la.
 */
export async function enviarModeloNoNegocio(
  admin: ReturnType<typeof adminClient>,
  tenantId: string,
  dealId: string,
  nome: string,
  idioma: string,
  vars: string[],
  sentBy: string | null = null,
  /**
   * `fluxo` respeita a trava de uma mensagem-modelo por cliente a cada sete
   * dias; `manual` passa por cima dela. Foi decisão do dono: a trava existe
   * para o automático, que é onde o cliente recebe duas sem ninguém perceber —
   * e o vendedor, que está com o cliente na mão, sabe o que a regra não sabe.
   */
  origem: 'manual' | 'fluxo' = 'manual',
): Promise<ResultadoModelo> {
  const { data: deal, error: dealErro } = await admin
    .from('crm_deals').select('contact_id, contact:crm_contacts(name, whatsapp_id)')
    .eq('id', dealId).eq('tenant_id', tenantId).maybeSingle();
  if (dealErro) throw dealErro;
  const d = deal as unknown as {
    contact_id: string; contact: { name: string; whatsapp_id: string | null } | null;
  } | null;
  if (!d) return { enviado: false, motivo: 'negócio não encontrado' };
  const para = d.contact?.whatsapp_id;
  if (!para) return { enviado: false, motivo: 'este cliente ainda não tem WhatsApp conhecido' };

  if (origem === 'fluxo') {
    // A pergunta é feita ao banco, e não recalculada aqui, porque a tela faz a
    // mesma pergunta para avisar — e aviso dizendo uma coisa enquanto a trava
    // faz outra é pior do que não avisar.
    const { data: ate, error: travaErro } = await admin
      .rpc('crm_modelo_bloqueado_ate', { p_tenant: tenantId, p_contact: d.contact_id });
    if (travaErro) throw travaErro;
    if (ate) {
      return {
        enviado: false,
        motivo: `este cliente já recebeu uma mensagem-modelo há menos de 7 dias — o próximo envio automático só depois de ${new Date(ate as string).toLocaleDateString('pt-BR')}`,
        travado: true,
      };
    }
  }

  const cred = await getConnectionByTenant(admin, tenantId);
  if (!cred || !cred.is_active) {
    return { enviado: false, motivo: 'o WhatsApp não está ligado nesta empresa' };
  }

  const { data: tpl, error: tplErro } = await admin
    .from('crm_whatsapp_templates').select('status, body, variaveis')
    .eq('tenant_id', tenantId).eq('name', nome).eq('language', idioma).maybeSingle();
  if (tplErro) throw tplErro;
  const t = tpl as { status: string; body: string | null; variaveis: number } | null;
  if (!t) return { enviado: false, motivo: `o modelo "${nome}" não está na lista sincronizada da Meta` };
  if (t.status !== 'APPROVED') {
    return { enviado: false, motivo: `o modelo "${nome}" está como ${t.status} na Meta — só aprovado pode ser enviado` };
  }
  if (vars.length !== t.variaveis) {
    return { enviado: false, motivo: `o modelo pede ${t.variaveis} informação(ões) e recebeu ${vars.length}` };
  }
  if (vars.some(v => v.trim() === '')) {
    return { enviado: false, motivo: 'há lacuna do modelo sem preencher' };
  }

  // O que fica na conversa é o modelo **preenchido** — é o que o cliente leu.
  const corpo = (t.body ?? nome).replace(/\{\{(\d+)\}\}/g, (_, i) => vars[Number(i) - 1] ?? '');
  const comum = {
    tenant_id: tenantId, contact_id: d.contact_id, deal_id: dealId,
    direction: 'out', body: corpo, template_name: nome,
    template_language: idioma, template_vars: vars, sent_by: sentBy,
  };

  let messageId: string | null = null;
  try {
    messageId = await enviarTemplate(cred, para, nome, idioma, vars);
  } catch (e) {
    const motivo = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    // Grava a tentativa falhada: conversa em que a mensagem some sem deixar
    // rastro é pior do que uma que mostra "não saiu, e por quê".
    const { error } = await admin.from('crm_messages')
      .insert({ ...comum, status: 'failed', error: motivo }).select('id');
    if (error) throw error;
    return { enviado: false, motivo };
  }

  const { error } = await admin.from('crm_messages')
    .insert({ ...comum, wa_message_id: messageId, status: 'sent' }).select('id');
  if (error) throw error;
  return { enviado: true, message_id: messageId, para };
}

export interface TemplateDaMeta {
  name: string;
  language: string;
  category?: string;
  status: string;
  components?: { type?: string; text?: string }[];
}

/** O catálogo como a Meta o tem. Ela é a dona: aqui só se lê. */
export async function listarTemplates(cred: WhatsAppConnection): Promise<TemplateDaMeta[]> {
  const r = await metaFetch<{ data?: TemplateDaMeta[] }>(
    cred, `${cred.waba_id}/message_templates?limit=200`,
  );
  return r?.data ?? [];
}

/** O corpo do modelo e quantas lacunas ele tem. */
export function corpoDoTemplate(t: TemplateDaMeta): { body: string; variaveis: number } {
  const body = t.components?.find(c => c.type === 'BODY')?.text ?? '';
  // `{{1}}`, `{{2}}`… — conta as distintas, porque a mesma pode repetir.
  const achadas = new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]));
  return { body, variaveis: achadas.size };
}

/**
 * Confere que a chamada veio mesmo da Meta: `X-Hub-Signature-256` é o HMAC-SHA256
 * do corpo **cru** com o segredo do app. Sem isto, qualquer um que descubra o
 * endereço do webhook escreve mensagem na conversa de um cliente.
 */
export async function assinaturaConfere(
  appSecret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const sig = await hmacSha256(appSecret, rawBody);
  const esperado = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(esperado, header.slice('sha256='.length));
}

/**
 * HMAC-SHA256 cru. Cada fornecedor formata o resultado do seu jeito — a Yampi
 * manda base64, a Meta manda hexadecimal — então o que se compartilha é a
 * conta, não o formato.
 */
export async function hmacSha256(secret: string, body: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
}

export { adminClient };
