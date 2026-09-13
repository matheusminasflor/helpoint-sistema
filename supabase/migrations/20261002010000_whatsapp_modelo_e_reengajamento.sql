-- CRM-4b: a mensagem-modelo, e o lead que esfriou. 2026-09-13.
--
-- Decisões do dono (2026-09-13):
--   • Os modelos são escritos **no painel da Meta**, que é quem os aprova de
--     qualquer jeito. O Helpoint lista e usa. Escrever daqui fica para quando
--     ele souber quais modelos usa de verdade.
--   • Quem dispara à mão é **quem tem permissão** — ou seja, a concessão do
--     Comercial que o sistema já usa em todo o CRM, e não uma régua nova.
--   • As lacunas do modelo são mapeadas **campo a campo** ao montar o passo.
--
-- E uma correção de rumo que o dono deu, que muda o desenho: modelo não é só
-- "retomar um cliente depois das 24 h". É a ferramenta de reengajamento do CRM
-- — lead que esfriou, lead ativo que precisa de empurrão. Por isso esta
-- migration traz **duas** peças: o passo que manda o modelo, e o gatilho que
-- encontra sozinho o negócio parado. Com os dois, "reengajar quem sumiu" é um
-- fluxo montado na tela de sempre, e não uma tela de campanha à parte.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Os modelos, como a Meta os tem
-- ───────────────────────────────────────────────────────────────────────────
-- Cópia local do que existe lá, para a tela poder escolher sem uma ida à Meta a
-- cada clique — e **só** cópia: quem aprova, renomeia e reprova é a Meta, e a
-- sincronização reescreve o que estiver aqui. Nada nesta tabela é fonte de
-- verdade, por isso ela não tem coluna que alguém edite.
create table if not exists public.crm_whatsapp_templates (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  language    text not null,
  category    text,
  -- 'APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED' — palavra da Meta,
  -- guardada como ela vem. Só APPROVED pode ser enviado.
  status      text not null,
  -- O corpo com `{{1}}`, `{{2}}`…, para a tela mostrar a prévia e saber quantas
  -- lacunas pedir.
  body        text,
  variaveis   integer not null default 0,
  components  jsonb not null default '[]'::jsonb,
  synced_at   timestamptz not null default now(),
  primary key (tenant_id, name, language)
);

alter table public.crm_whatsapp_templates enable row level security;

-- Ler o catálogo é de quem tem o Comercial; escrever é da edge function que
-- falou com a Meta.
create policy "Quem tem o CRM ve os modelos" on public.crm_whatsapp_templates
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_crm_access(auth.uid()));
revoke all on public.crm_whatsapp_templates from anon;
revoke insert, update, delete on public.crm_whatsapp_templates from authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A mensagem que sai por modelo
-- ───────────────────────────────────────────────────────────────────────────
-- `crm_messages.template_name` já existia. Falta o que a tela precisa para
-- mostrar o texto de uma mensagem que **não** tem corpo próprio: o modelo é uma
-- forma, e o que o cliente leu é a forma preenchida.
alter table public.crm_messages
  add column if not exists template_language text,
  add column if not exists template_vars jsonb;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O passo de fluxo e o gatilho do lead frio
-- ───────────────────────────────────────────────────────────────────────────
-- O motor valida o desenho do fluxo antes de salvar (`automation_validate_flow`)
-- e a lista de passos e gatilhos conhecidos vive lá dentro. Em vez de reescrever
-- a função inteira — ela é grande e muda a cada leva —, o texto é costurado com
-- guardas: se o alvo não aparecer exatamente uma vez, a migration falha em vez
-- de aplicar pela metade. É o padrão desta casa desde a CRM-1d.
do $$
declare
  v_def text := pg_get_functiondef('public.automation_validate_flow(jsonb, jsonb)'::regprocedure);
  v_novo text;
  n int;
begin
  -- 3a. O passo novo entra na lista de passos válidos.
  select count(*) into n from regexp_matches(v_def, '''emitir_nfe''', 'g');
  if n <> 1 then
    raise exception 'automation_validate_flow: esperava 1 ocorrencia de ''emitir_nfe'' na lista de passos, achei %', n;
  end if;
  v_novo := replace(v_def, '''emitir_nfe''', '''emitir_nfe'', ''whatsapp_template''');

  -- 3b. O gatilho novo entra na lista de gatilhos válidos. A âncora é a lista
  -- inteira, e não a palavra solta: `deadline_expired` aparece três vezes na
  -- função, e só uma delas é o lugar certo.
  select count(*) into n from regexp_matches(v_novo, '''deadline_expired'', ''schedule'', ''webhook'', ''manual''', 'g');
  if n <> 1 then
    raise exception 'automation_validate_flow: esperava 1 lista de gatilhos, achei %', n;
  end if;
  v_novo := replace(
    v_novo,
    '''deadline_expired'', ''schedule'', ''webhook'', ''manual''',
    '''deadline_expired'', ''deal_idle'', ''schedule'', ''webhook'', ''manual''');

  execute v_novo;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Quem está parado há tempo demais
-- ───────────────────────────────────────────────────────────────────────────
-- No molde do `deadline_expired`, que já varre chamados vencidos: um run por
-- negócio, e `automation_fired` garante que o mesmo negócio não é reengajado
-- duas vezes pelo mesmo fluxo. Sem isso, um fluxo diário mandaria a mesma
-- mensagem para o mesmo cliente todo dia — que é como se queima um número.
create or replace function public.automation_tick_deal_idle()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w      public.automation_workflows;
  d      public.crm_deals;
  v_run  uuid;
  v_dias int;
  n      int := 0;
begin
  for w in
    select * from public.automation_workflows
     where status = 'active' and trigger->>'kind' = 'deal_idle'
  loop
    v_dias := greatest(coalesce((w.trigger->>'dias')::int, 30), 1);

    for d in
      select dl.* from public.crm_deals dl
        join public.crm_pipeline_stages st on st.id = dl.stage_id
       where dl.tenant_id = w.tenant_id
         and st.kind = 'open'
         and dl.updated_at < now() - make_interval(days => v_dias)
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

      insert into public.automation_fired (workflow_id, subject_id) values (w.id, d.id);
      v_run := public.automation_start_run(
        w, 'deal_idle', 'crm_deal', d.id,
        jsonb_build_object(
          'trigger', jsonb_build_object('kind', 'deal_idle', 'entity', 'crm_deal', 'after', to_jsonb(d)),
          'subject', jsonb_build_object('type', 'crm_deal', 'id', d.id)));
      perform public.automation_advance(v_run);
      n := n + 1;
    end loop;
  end loop;

  return n;
end;
$$;

-- E ganha relógio **próprio**, em vez de entrar no `automation_tick`.
--
-- A primeira versão desta migration costurava a chamada dentro do
-- `automation_tick` com `pg_get_functiondef` + `regexp_replace`, como se faz
-- aqui com as funções grandes do motor. Não funcionou, e a razão importa: o
-- texto que `pg_get_functiondef` devolve depende de **como a função foi escrita
-- na migration que a definiu por último**, e isso pode diferir entre o banco de
-- teste e um banco montado do zero. A guarda pegou (o CI #54 falhou em vez de
-- aplicar pela metade), mas costurar ali era frágil por natureza.
--
-- Um job separado é mais simples e melhor: o motor fica intocado, o tique de um
-- minuto não fica mais longo, e a varredura roda **de hora em hora** — que para
-- "parado há 30 dias" é de sobra, e evita reavaliar a base inteira 1 440 vezes
-- por dia para achar o que muda uma vez por mês.
select cron.schedule(
  'deal-idle-hourly',
  '7 * * * *',
  $cron$ select public.automation_tick_deal_idle(); $cron$
);
