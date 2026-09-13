-- CRM-4b, correções da auditoria. 2026-09-13.
--
-- Duas delas invalidavam a metade automática da leva: o passo era aceito pelo
-- validador, aparecia no editor, salvava — e **morria na hora de rodar**.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O executor não conhecia o passo
-- ───────────────────────────────────────────────────────────────────────────
-- A migration anterior costurou `whatsapp_template` em `automation_validate_flow`
-- — que é quem aceita o desenho do fluxo — e esqueceu `automation_run_step`,
-- que é quem o executa. Resultado: o fluxo salvava, o editor mostrava o passo,
-- e no primeiro tique vinha `tipo de passo desconhecido: whatsapp_template`, o
-- run ia a `failed`, e como ele nunca chegava a `waiting` com `pending_kind`, o
-- `case` novo do worker era **código inalcançável**.
--
-- As 17 asserções ficaram verdes porque o teste provava que o validador
-- *aceita* o passo e disparava o fluxo com `add_note`. É o "um comando verde
-- prova que o comando passou" do CLAUDE.md: com o defeito presente, o teste
-- passava igual. O teste desta correção **roda** o passo.
do $$
declare
  v_def  text := pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure);
  v_novo text;
  n int;
begin
  select count(*) into n from regexp_matches(v_def, 'when ''bling_order'' then', 'g');
  if n <> 1 then
    raise exception 'automation_run_step: esperava 1 ancora em bling_order, achei %', n;
  end if;

  v_novo := replace(
    v_def,
    '  when ''bling_order'' then',
    '  when ''whatsapp_template'' then' || chr(10)
      || '    -- Mensagem-modelo no WhatsApp (CRM-4b): externa, com o token da empresa.' || chr(10)
      || '    if v_entity <> ''crm_deal'' then raise exception ''a acao "mensagem no WhatsApp" exige um negocio''; end if;' || chr(10)
      || '    if coalesce(p_step->''config''->>''modelo'', '''') = '''' then' || chr(10)
      || '      raise exception ''a acao "mensagem no WhatsApp" nao diz qual modelo enviar'';' || chr(10)
      || '    end if;' || chr(10)
      || '    return jsonb_build_object(''status'', ''waiting'', ''pending_kind'', p_step->>''kind'');' || chr(10)
      || chr(10)
      || '  when ''bling_order'' then');

  if position('whatsapp_template' in v_novo) = 0 then
    raise exception 'automation_run_step: o passo nao entrou';
  end if;
  execute v_novo;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. As lacunas não eram preenchidas
-- ───────────────────────────────────────────────────────────────────────────
-- `automation_render_config` trocava `{{campo}}` pelo valor só em **strings de
-- primeiro nível**. As lacunas do modelo são um array (`config.vars`), então
-- passavam cruas: o cliente receberia `{{trigger.contact.name}}` literal numa
-- mensagem cobrada pela Meta — e o pior é que era exatamente o que a própria
-- tela sugeria digitar.
--
-- Agora a função desce em array e em objeto aninhado, que é o que qualquer
-- passo futuro com lista vai precisar.
create or replace function public.automation_render_config(p_cfg jsonb, p_ctx jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  k   text;
  v   jsonb;
  out jsonb := '{}'::jsonb;
  arr jsonb;
  el  jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(p_cfg, '{}'::jsonb)) loop
    case jsonb_typeof(v)
      when 'string' then
        out := out || jsonb_build_object(k, public.automation_render(v #>> '{}', p_ctx));
      when 'array' then
        arr := '[]'::jsonb;
        for el in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(el) = 'string' then
            arr := arr || to_jsonb(public.automation_render(el #>> '{}', p_ctx));
          elsif jsonb_typeof(el) = 'object' then
            arr := arr || jsonb_build_array(public.automation_render_config(el, p_ctx));
          else
            arr := arr || jsonb_build_array(el);
          end if;
        end loop;
        out := out || jsonb_build_object(k, arr);
      when 'object' then
        out := out || jsonb_build_object(k, public.automation_render_config(v, p_ctx));
      else
        out := out || jsonb_build_object(k, v);
    end case;
  end loop;
  return out;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. E o contexto precisa ter o cliente
-- ───────────────────────────────────────────────────────────────────────────
-- Mesmo com o array renderizado, `{{trigger.contact.name}}` — o campo que a
-- tela sugere — daria vazio: o contexto que a varredura monta tem `after`
-- (o negócio) e não o contato. Sem o nome do cliente, a mensagem de
-- reengajamento não tem como ser pessoal, que é a única razão de ela existir.
create or replace function public.automation_tick_deal_idle()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w       public.automation_workflows;
  d       public.crm_deals;
  v_run   uuid;
  v_dias  int;
  v_ctt   jsonb;
  n       int := 0;
begin
  for w in
    select * from public.automation_workflows
     where status = 'active' and trigger->>'kind' = 'deal_idle'
  loop
    -- `dias` fora do formato derrubava o tique **inteiro**, de todas as
    -- empresas: a exceção subia até `automation_tick` e abortava a transação,
    -- parando schedule, prazo, retomada e limpeza a cada minuto até alguém
    -- achar. O validador aceita texto ali, e o SPA fala direto com o banco —
    -- então a defesa é aqui.
    begin
      v_dias := greatest(coalesce((w.trigger->>'dias')::int, 30), 1);
    exception when others then
      v_dias := 30;
    end;

    for d in
      select dl.* from public.crm_deals dl
        join public.crm_pipeline_stages st on st.id = dl.stage_id
       where dl.tenant_id = w.tenant_id
         and st.kind = 'open'
         -- Pré-filtro barato e indexável: `updated_at` entra no `greatest`, logo
         -- ser antigo é **condição necessária** para o negócio estar parado.
         -- Sem ele as duas subconsultas rodavam para todo negócio aberto da
         -- empresa, a cada minuto.
         and dl.updated_at < now() - make_interval(days => v_dias)
         and greatest(
               dl.updated_at,
               coalesce((select max(a.created_at) from public.crm_deal_activities a where a.deal_id = dl.id), dl.created_at),
               coalesce((select max(m.created_at) from public.crm_messages m where m.deal_id = dl.id), dl.created_at)
             ) < now() - make_interval(days => v_dias)
         and not exists (
           select 1 from public.automation_fired f
            where f.workflow_id = w.id and f.subject_id = dl.id)
       order by dl.updated_at
       limit 200
    loop
      if not public.automation_filter_matches(w.trigger->'filter',
           jsonb_build_object('trigger', jsonb_build_object('after', to_jsonb(d)))) then
        continue;
      end if;

      -- Dois tiques ao mesmo tempo colidiam aqui e abortavam o tique inteiro.
      -- Quem já foi pego, foi pego.
      insert into public.automation_fired (workflow_id, subject_id)
      values (w.id, d.id) on conflict do nothing;
      if not found then
        continue;
      end if;

      select to_jsonb(c) into v_ctt from public.crm_contacts c where c.id = d.contact_id;

      v_run := public.automation_start_run(
        w, 'deal_idle', 'crm_deal', d.id,
        jsonb_build_object(
          'trigger', jsonb_build_object(
            'kind', 'deal_idle', 'entity', 'crm_deal',
            'after', to_jsonb(d),
            -- É daqui que sai `{{trigger.contact.name}}`.
            'contact', coalesce(v_ctt, '{}'::jsonb)),
          'subject', jsonb_build_object('type', 'crm_deal', 'id', d.id)));
      perform public.automation_advance(v_run);
      n := n + 1;
    end loop;
  end loop;

  return n;
end;
$$;

-- O pré-filtro só ajuda com índice.
create index if not exists crm_deals_tenant_updated_idx
  on public.crm_deals (tenant_id, updated_at);

-- Índice que nasceu duplicado: `crm_deal_activities_deal_idx (deal_id, created_at)`
-- já existia, e um btree é varrido nos dois sentidos — para `max(created_at)`
-- os dois são equivalentes.
drop index if exists public.crm_deal_activities_deal_created_idx;
