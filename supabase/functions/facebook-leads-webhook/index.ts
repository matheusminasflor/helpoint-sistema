// O lead que o Facebook entrega quando alguém preenche um anúncio (CRM-4c).
//
// GET  — a verificação do endereço, uma vez, ao cadastrar o webhook no painel.
// POST — os leads. O corpo traz só o **id** do lead; o conteúdo se busca na
//        Graph API com o token da página, que o Marketing já guarda.
//
// Sem JWT: quem chama é a Meta. Quem prova que é ela é a assinatura do corpo
// contra o segredo do app **daquela empresa**.
//
// A regra que manda neste arquivo é a do dono: **o lead não escolhe funil.** Ele
// é guardado inteiro e, se o formulário ainda não foi ligado a um destino, fica
// retido até alguém ligar. Nunca se inventa um lugar para ele, e nunca se
// descarta — lead de anúncio é pago, e o Facebook não reentrega.
import { adminClient } from '../_shared/payment-credentials.ts';
import { graphFetch, assinaturaConfere } from '../_shared/meta.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface LeadDaMeta {
  id?: string;
  form_id?: string;
  field_data?: { name?: string; values?: string[] }[];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const modo = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const desafio = url.searchParams.get('hub.challenge');
    if (modo !== 'subscribe' || !token) return new Response('forbidden', { status: 403 });

    const admin = adminClient();
    const { data, error } = await admin
      .from('tenant_lead_ads_connections').select('tenant_id').eq('verify_token', token).maybeSingle();
    if (error) {
      console.error('facebook-leads-webhook verify', error.message);
      return new Response('erro', { status: 500 });
    }
    if (!data) return new Response('forbidden', { status: 403 });
    return new Response(desafio ?? '', { status: 200 });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    // O corpo **cru**: a assinatura é sobre estes bytes.
    const raw = await req.text();
    const body = JSON.parse(raw || '{}') as {
      entry?: { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[];
    };

    const admin = adminClient();
    let guardados = 0;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const v = change.value ?? {};
        const pageId = String(v.page_id ?? entry.id ?? '');
        const leadgenId = String(v.leadgen_id ?? '');
        const formId = String(v.form_id ?? '');
        if (!pageId || !leadgenId) continue;

        // De quem é esta página? É o Marketing que a conecta.
        const { data: conta, error: contaErro } = await admin
          .from('mkt_social_accounts').select('tenant_id, id')
          .eq('page_id', pageId).eq('is_active', true).maybeSingle();
        if (contaErro) throw contaErro;

        const tenantId = (conta as { tenant_id: string } | null)?.tenant_id;
        if (!tenantId) {
          // Página que não é de nenhuma empresa nossa. 200 assim mesmo: a Meta
          // não tem o que fazer com um erro e reentregaria para sempre.
          console.warn('facebook-leads-webhook: pagina desconhecida', pageId);
          continue;
        }

        const { data: cred, error: credErro } = await admin
          .from('tenant_lead_ads_connections').select('app_secret, is_active')
          .eq('tenant_id', tenantId).maybeSingle();
        if (credErro) throw credErro;
        const c = cred as { app_secret: string | null; is_active: boolean } | null;

        // Todas as recusas saem pela mesma porta, como no webhook do WhatsApp:
        // distinguir "página desconhecida" de "assinatura inválida" deixa
        // descobrir, um chute por vez, quais páginas estão ligadas ao Helpoint.
        const recusa = !c ? 'empresa sem conexao de lead ads'
          : !c.is_active ? 'conexao desligada'
            : !c.app_secret ? 'empresa sem app_secret'
              : !await assinaturaConfere(c.app_secret, raw, req.headers.get('x-hub-signature-256'))
                ? 'assinatura invalida'
                : null;
        if (recusa) {
          console.warn('facebook-leads-webhook recusado:', recusa, pageId);
          continue;
        }

        // O conteúdo do lead. O token da página é o que o Marketing guardou, e
        // ele precisa do escopo `leads_retrieval` — sem isso a Meta recusa aqui,
        // e o lead fica registrado com o erro em vez de sumir.
        const { data: segredo, error: segredoErro } = await admin
          .from('mkt_social_account_secrets').select('access_token')
          .eq('account_id', (conta as { id: string }).id).maybeSingle();
        if (segredoErro) throw segredoErro;
        const token = (segredo as { access_token: string } | null)?.access_token;

        const campos: Record<string, string> = {};
        let erro: string | null = null;
        if (!token) {
          erro = 'a página não tem token guardado — reconecte o Facebook em Marketing';
        } else {
          try {
            const lead = await graphFetch<LeadDaMeta>(token, `${leadgenId}?fields=id,form_id,field_data`);
            for (const f of lead?.field_data ?? []) {
              if (f.name) campos[f.name] = (f.values ?? []).join(', ');
            }
          } catch (e) {
            erro = (e instanceof Error ? e.message : String(e)).slice(0, 400);
          }
        }

        // Guardado **sempre**, mesmo quando a busca falhou: o id do lead é o que
        // permite tentar de novo depois, e a Meta não reentrega.
        const { data: linha, error: gravaErro } = await admin
          .from('crm_lead_ads_raw').upsert({
            tenant_id: tenantId,
            leadgen_id: leadgenId,
            page_id: pageId,
            form_id: formId || null,
            campos,
            status: erro ? 'erro' : 'retido',
            erro,
          }, { onConflict: 'tenant_id,leadgen_id' }).select('id, status').maybeSingle();
        if (gravaErro) throw gravaErro;
        guardados++;

        // Se o formulário já tem destino, o lead entra agora. Se não tem, a
        // função devolve nulo e ele continua retido — sem inventar funil.
        const l = linha as { id: string; status: string } | null;
        if (l && l.status === 'retido') {
          const { error: aplicarErro } = await admin.rpc('crm_lead_ads_aplicar', { p_raw: l.id });
          if (aplicarErro) throw aplicarErro;
        }
      }
    }

    return json({ ok: true, guardados });
  } catch (e) {
    // 500 faz a Meta reentregar — o que é o certo quando o erro é nosso, porque
    // a gravação é idempotente pelo id do lead.
    console.error('facebook-leads-webhook', e instanceof Error ? e.message : String(e));
    return json({ error: 'erro ao processar' }, 500);
  }
});
