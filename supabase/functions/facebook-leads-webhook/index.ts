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

    // O webhook `leadgen` se cadastra **uma vez por aplicativo da Meta**, e o
    // Helpoint tem um só (`META_APP_ID`, o mesmo que o Marketing usa no OAuth).
    // Então a chave de verificação do aplicativo vem do ambiente. A chave por
    // empresa continua valendo para quem traz o próprio aplicativo — é o
    // desenho do WhatsApp, e não custa nada manter os dois caminhos abertos.
    if (token === Deno.env.get('META_LEADS_VERIFY_TOKEN')) {
      return new Response(desafio ?? '', { status: 200 });
    }

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
        //
        // `platform` no filtro e `limit(1)` em vez de `maybeSingle()`: a conta do
        // Instagram guarda o id da **página** do Facebook a que pertence, então
        // duas linhas com o mesmo `page_id` são normais. Com `maybeSingle()` isso
        // virava erro do PostgREST, 500, e a Meta reentregando para sempre — com
        // o lead pago nunca chegando a ser gravado.
        const { data: contas, error: contaErro } = await admin
          .from('mkt_social_accounts').select('tenant_id, id')
          .eq('page_id', pageId).eq('platform', 'facebook').eq('is_active', true)
          .order('created_at', { ascending: false }).limit(1);
        if (contaErro) throw contaErro;
        const conta = (contas ?? [])[0] as { tenant_id: string; id: string } | undefined;

        const tenantId = conta?.tenant_id;
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

        // Quem assina o corpo é o **aplicativo** da Meta, e a página manda pelo
        // aplicativo em que ela está instalada. Normalmente é o do Helpoint
        // (`META_APP_SECRET`); a empresa que traz o próprio aplicativo guarda o
        // segredo dela.
        //
        // As duas são tentadas, e não só a da empresa: quem colava um segredo
        // próprio enquanto a página continuava instalada no aplicativo do
        // Helpoint via o lead ser recusado em silêncio. Aceitar qualquer uma das
        // duas não afrouxa nada — as duas são chaves nossas, e quem separa as
        // empresas é a **página**, não o segredo.
        const segredos = [c?.app_secret, Deno.env.get('META_APP_SECRET')]
          .filter((s): s is string => !!s);
        const assinatura = req.headers.get('x-hub-signature-256');
        let assinado = false;
        for (const s of segredos) {
          if (await assinaturaConfere(s, raw, assinatura)) { assinado = true; break; }
        }

        // Todas as recusas saem pela mesma porta, como no webhook do WhatsApp:
        // distinguir "página desconhecida" de "assinatura inválida" deixa
        // descobrir, um chute por vez, quais páginas estão ligadas ao Helpoint.
        const recusa = !c ? 'empresa sem conexao de lead ads'
          : !c.is_active ? 'conexao desligada'
            : segredos.length === 0 ? 'sem segredo de aplicativo'
              : !assinado ? 'assinatura invalida'
                : null;
        if (recusa) {
          console.warn('facebook-leads-webhook recusado:', recusa, pageId);
          continue;
        }

        // O conteúdo do lead. O token da página é o que o Marketing guardou, e
        // ele precisa do escopo `leads_retrieval` — sem isso a Meta recusa aqui,
        // e o lead fica registrado com o erro em vez de sumir.
        const { data: segredo, error: segredoErro } = await admin
          .from('mkt_social_account_secrets').select('access_token, page_access_token')
          .eq('account_id', conta.id).maybeSingle();
        if (segredoErro) throw segredoErro;
        const s = segredo as { access_token: string | null; page_access_token: string | null } | null;
        // A credencial **da página** é a que a Meta pede para ler um lead. A da
        // pessoa fica de reserva: contas conectadas antes da CRM-4c não têm a da
        // página, e reconectar é o que a preenche.
        const token = s?.page_access_token || s?.access_token;

        const campos: Record<string, string> = {};
        let erro: string | null = null;
        let formIdDoLead = formId;
        if (!token) {
          erro = 'a página não tem token guardado — reconecte o Facebook em Marketing';
        } else {
          try {
            const lead = await graphFetch<LeadDaMeta>(token, `${leadgenId}?fields=id,form_id,field_data`);
            // A Graph API também diz de que formulário o lead é. Vale como
            // segunda fonte: sem `form_id` a linha fica retida para sempre, porque
            // é por ele que se acha o destino.
            if (!formIdDoLead && lead?.form_id) formIdDoLead = String(lead.form_id);
            for (const f of lead?.field_data ?? []) {
              if (f.name) campos[f.name] = (f.values ?? []).join(', ');
            }
          } catch (e) {
            erro = (e instanceof Error ? e.message : String(e)).slice(0, 400);
          }
        }

        // Guardado **sempre**, mesmo quando a busca falhou: o id do lead é o que
        // permite tentar de novo depois, e a Meta não reentrega.
        //
        // `ignoreDuplicates` — ou seja, `on conflict do nothing` — e não um upsert
        // comum. O upsert reescreve **todas** as colunas do payload, inclusive
        // `status`: numa reentrega da Meta o lead já `aplicado` voltava para
        // `retido`, o guard de `crm_lead_ads_aplicar` deixava de valer e nascia um
        // **segundo negócio**, com o primeiro virando órfão no funil.
        const { error: gravaErro } = await admin
          .from('crm_lead_ads_raw').upsert({
            tenant_id: tenantId,
            leadgen_id: leadgenId,
            page_id: pageId,
            form_id: formIdDoLead || null,
            campos,
            status: erro ? 'erro' : 'retido',
            erro,
          }, { onConflict: 'tenant_id,leadgen_id', ignoreDuplicates: true });
        if (gravaErro) throw gravaErro;

        const { data: linha, error: leErro } = await admin
          .from('crm_lead_ads_raw').select('id, status, campos')
          .eq('tenant_id', tenantId).eq('leadgen_id', leadgenId).maybeSingle();
        if (leErro) throw leErro;
        const l = linha as { id: string; status: string; campos: Record<string, string> | null } | null;
        if (!l) throw new Error('lead gravado e nao encontrado em seguida');
        guardados++;

        // A reentrega é a segunda chance de um lead cujo conteúdo não veio na
        // primeira: quando a linha guardada está vazia e agora há respostas, ela
        // se preenche e volta para a fila. O que já está aplicado não se toca.
        let status = l.status;
        if (status !== 'aplicado'
            && Object.keys(campos).length > 0
            && Object.keys(l.campos ?? {}).length === 0) {
          const { error: refazErro } = await admin.from('crm_lead_ads_raw')
            .update({ campos, form_id: formIdDoLead || null, status: 'retido', erro: null })
            .eq('id', l.id).select('id');
          if (refazErro) throw refazErro;
          status = 'retido';
        }

        // Se o formulário já tem destino, o lead entra agora. Se não tem, a
        // função devolve nulo e ele continua retido — sem inventar funil.
        if (status === 'retido') {
          const { error: aplicarErro } = await admin.rpc('crm_lead_ads_aplicar', { p_raw: l.id });
          if (aplicarErro) throw aplicarErro;
        }
      }
    }

    return json({ ok: true, guardados });
  } catch (e) {
    // 500 faz a Meta reentregar — o que é o certo quando o erro é nosso, porque
    // a gravação é idempotente pelo id do lead: ela não sobrescreve o que já
    // entrou, e por isso reentregar não duplica negócio.
    console.error('facebook-leads-webhook', e instanceof Error ? e.message : String(e));
    return json({ error: 'erro ao processar' }, 500);
  }
});
