// Gera supabase/migrations/20260915010000_automacoes_modelos.sql a partir do
// motor de fluxos (20260912010000): copia `automation_validate_flow` e
// `automation_run_step` e aplica as mudanças da CRM-1d em pontos nomeados.
// Cada troca precisa casar exatamente uma vez — senão o script para.
// Uso: node scripts/gen-migration-modelos.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('supabase/migrations/20260912010000_automacoes_fluxos.sql', 'utf8').split('\n');
const slice = (from, to) => src.slice(from - 1, to).join('\n');

function replaceOnce(text, from, to, label) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: esperava 1 ocorrência, achei ${n}`);
  return text.replace(from, to);
}

// ── validate_flow (linhas 45–140): só a lista de tipos de passo ─────────────
let validate = slice(45, 140);
validate = replaceOnce(validate,
  "'send_email', 'http_request', 'ai_text') then",
  "'send_email', 'http_request', 'ai_text', 'create_receivable') then",
  'validate_flow: kinds');

// ── run_step (linhas 332–541) ───────────────────────────────────────────────
let run = slice(332, 541);

// (a) "olhar o registro de novo": qualquer passo com refresh=true lê a linha atual do registro.
run = replaceOnce(run,
  "  select * into w from public.automation_workflows where id = r.workflow_id;\n",
  `  select * into w from public.automation_workflows where id = r.workflow_id;

  -- refresh: depois de uma espera, o registro pode ter mudado. O passo pede
  -- para olhar de novo e a condição/ramo decide pelo estado atual, não pelo
  -- do disparo (CRM-1d, modelo "sem resposta 24/48 h").
  if coalesce(cfg->>'refresh', 'false') = 'true' and r.subject_id is not null then
    ctx := jsonb_set(ctx, '{trigger,after}', coalesce(public.automation_subject_row(r.subject_type, r.subject_id), ctx #> '{trigger,after}'), true);
  end if;
`,
  'run_step: refresh');

// (b) create_ticket: quem abre o chamado pode ser um papel do registro (o vendedor que criou o pedido).
run = replaceOnce(run,
  "            coalesce(nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),\n",
  "            coalesce(public.automation_target_user(jsonb_build_object('target', cfg->>'requester_target'), ctx),\n                     nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),\n",
  'run_step: create_ticket requester');

// (c) set_stage: motivo da perda junto (o modelo marca "Sem resposta").
run = replaceOnce(run,
  "    update public.crm_deals set stage_id = (cfg->>'stage_id')::uuid where id = r.subject_id and tenant_id = r.tenant_id;\n",
  "    update public.crm_deals set stage_id = (cfg->>'stage_id')::uuid, lost_reason = coalesce(nullif(cfg->>'lost_reason', ''), lost_reason)\n     where id = r.subject_id and tenant_id = r.tenant_id;\n",
  'run_step: set_stage lost_reason');

// (d) passo novo: conta a receber a partir do pedido.
run = replaceOnce(run,
  "  when 'send_email', 'http_request', 'ai_text' then\n",
  `  when 'create_receivable' then
    -- Conta a receber no Financeiro a partir do pedido (CRM-1d, decisão 6 da
    -- proposta): quem usa só o Helpoint cobra por aqui; quem tem ERP desliga o passo.
    if v_entity <> 'crm_order' then raise exception 'a acao "criar conta a receber" exige um pedido'; end if;
    insert into public.fin_entries (tenant_id, kind, description, counterparty, document_number, amount, due_date, competence, status, source, notes, created_by)
    values (r.tenant_id, 'receivable',
            coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''),
                     'Pedido #' || coalesce(ctx #>> '{trigger,after,number}', '?') || ' — ' || coalesce(ctx #>> '{trigger,contact,name}', '')),
            ctx #>> '{trigger,contact,name}',
            ctx #>> '{trigger,after,number}',
            coalesce((ctx #>> '{trigger,after,total}')::numeric, 0),
            current_date + coalesce((cfg->>'due_in_days')::int, 7),
            current_date, 'pending', 'automation',
            'Criada pelo fluxo "' || w.name || '".', w.created_by)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('entry_id', v_id));

  when 'send_email', 'http_request', 'ai_text' then
`,
  'run_step: create_receivable');

const header = `-- Leva CRM-1d: modelos de fluxo prontos. 2026-09-12.
-- Base: docs/proposta-fluxo-comercial.md (bloco F e seção 6.1) e ADR-008.
--
-- O motor (20260912010000) ganha quatro coisas pequenas; o resto dos modelos é
-- só configuração de fluxo, montada pelo front (src/lib/automation-templates.ts):
--   automation_subject_row(tipo, id)  a linha atual de um registro, em jsonb
--   passo com refresh = true          lê o registro de novo antes de decidir (depois de uma espera)
--   automation_enrich_payload         o gatilho de pedido/negócio leva o contato (e os itens) junto —
--                                     é a "ficha pronta" do chamado de cadastro
--   create_ticket.requester_target    quem abre o chamado pode ser quem criou o pedido (o vendedor)
--   set_stage.lost_reason             mover para "perdido" com o motivo
--   passo create_receivable           conta a receber no Financeiro a partir do pedido
--
-- automation_validate_flow e automation_run_step são copiadas do arquivo
-- original por scripts/gen-migration-modelos.mjs, com as mudanças acima em
-- pontos nomeados. Não edite este arquivo à mão: mude o script e gere de novo.

-- A linha atual de um registro (para o refresh).
create or replace function public.automation_subject_row(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  case p_type
    when 'ticket'      then select to_jsonb(t) into v from public.tickets t where t.id = p_id;
    when 'crm_deal'    then select to_jsonb(d) into v from public.crm_deals d where d.id = p_id;
    when 'crm_contact' then select to_jsonb(c) into v from public.crm_contacts c where c.id = p_id;
    when 'crm_order'   then select to_jsonb(o) into v from public.crm_orders o where o.id = p_id;
    else v := null;
  end case;
  return v;
end;
$$;

-- O que vai junto no contexto do gatilho: o contato (pedido e negócio), o
-- negócio e os itens (pedido). Os textos dos passos usam {{trigger.contact.name}},
-- {{trigger.items_text}} etc.
create or replace function public.automation_enrich_payload(p_entity text, p_after jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contact uuid;
  v_out     jsonb := '{}'::jsonb;
begin
  if p_entity not in ('crm_order', 'crm_deal') then return v_out; end if;
  v_contact := nullif(p_after->>'contact_id', '')::uuid;
  if v_contact is not null then
    select jsonb_build_object('contact', to_jsonb(c) - 'custom' || jsonb_build_object('custom', c.custom,
             'segment', (select s.name from public.crm_segments s where s.id = c.segment_id)))
      into v_out from public.crm_contacts c where c.id = v_contact;
    v_out := coalesce(v_out, '{}'::jsonb);
  end if;
  if p_entity = 'crm_order' then
    v_out := v_out || jsonb_build_object(
      'deal', (select jsonb_build_object('id', d.id, 'title', d.title, 'owner_id', d.owner_id) from public.crm_deals d where d.id = nullif(p_after->>'deal_id', '')::uuid),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price, 'total', i.total) order by i.position), '[]'::jsonb)
                  from public.crm_order_items i where i.order_id = (p_after->>'id')::uuid),
      'items_text', (select coalesce(string_agg(rtrim(rtrim(i.quantity::text, '0'), '.') || ' × ' || i.description || ' — R$ ' || public.fmt_brl(i.total), E'\\n' order by i.position), '')
                       from public.crm_order_items i where i.order_id = (p_after->>'id')::uuid),
      'total_text', public.fmt_brl((p_after->>'total')::numeric));
  end if;
  return v_out;
end;
$$;

create or replace function public.automation_enqueue(p_tenant uuid, p_module text, p_entity text, p_event text, p_payload jsonb, p_subject uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w       public.automation_workflows;
  v_ctx   jsonb;
  v_run   uuid;
  v_extra jsonb := public.automation_enrich_payload(p_entity, p_payload->'after');
  n       int := 0;
begin
  for w in
    select * from public.automation_workflows
     where tenant_id = p_tenant and module = p_module and status = 'active'
       and trigger->>'kind' = p_event and trigger->>'entity' = p_entity
     order by created_at
  loop
    if p_event = 'record_updated' and jsonb_typeof(w.trigger->'fields') = 'array' and jsonb_array_length(w.trigger->'fields') > 0
       and not exists (select 1 from jsonb_array_elements_text(w.trigger->'fields') f
                        where f in (select jsonb_array_elements_text(coalesce(p_payload->'updated_fields', '[]'::jsonb)))) then
      continue;
    end if;
    v_ctx := jsonb_build_object(
      'trigger', p_payload || v_extra || jsonb_build_object('kind', p_event, 'entity', p_entity),
      'subject', jsonb_build_object('type', p_entity, 'id', p_subject));
    if not public.automation_filter_matches(w.trigger->'filter', v_ctx) then
      continue;
    end if;
    v_run := public.automation_start_run(w, p_event, p_entity, p_subject, v_ctx);
    perform public.automation_advance(v_run);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- automation_validate_flow — cópia de 20260912010000 + o passo create_receivable
-- ───────────────────────────────────────────────────────────────────────────
`;

const middle = `

-- ───────────────────────────────────────────────────────────────────────────
-- automation_run_step — cópia de 20260912010000 + refresh, requester_target,
-- lost_reason e create_receivable
-- ───────────────────────────────────────────────────────────────────────────
`;

writeFileSync('supabase/migrations/20260915010000_automacoes_modelos.sql', header + validate + middle + run + '\n');
console.log('ok: migration gerada');
