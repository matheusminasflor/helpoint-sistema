-- R7 (rodada 2) — limpeza: as tabelas que nenhuma tela usa saem, depois de uma cópia.
--
-- Medido na produção em 2026-10-26:
--   * `mkt_assets` (o estoque antigo do Marketing): 10 itens, os 10 já em `mkt_estoque_produtos` pelo nome;
--     nenhuma tela, função, policy nem chave estrangeira aponta para ela.
--   * `mkt_events`: 0 linhas; só a Lyra lia (`ai-lyra-chat`, tirado no mesmo commit). As três chaves que
--     apontavam para ela (`mkt_social_posts.event_id`, `mkt_quotations`, `mkt_ai_generations`) estão vazias.
--   * `mkt_quotations` e `mkt_ai_generations`: 0 linhas; o código que as lia (`useMKTQuotations`,
--     `useMKTAICreative`) não estava em tela nenhuma e saiu no mesmo commit.
--   * Os perfis de acesso de antes do perfil por setor — `ti_access_profiles`/`ti_user_profiles` e
--     `qualidade_access_profiles`/`qualidade_user_profiles`: 0 linhas nas quatro. Ninguém perde acesso: com
--     `qualidade_user_profiles` vazia, `is_qualidade_tech` já dependia só de `is_supervisor_or_higher`.
--
-- A cópia fica no esquema `arquivo`, fora do alcance da API (nem `anon` nem `authenticated` o enxergam).

create schema if not exists arquivo;
revoke all on schema arquivo from public, anon, authenticated;

create table arquivo.r7_mkt_assets as table public.mkt_assets;
create table arquivo.r7_mkt_events as table public.mkt_events;
create table arquivo.r7_mkt_quotations as table public.mkt_quotations;
create table arquivo.r7_mkt_ai_generations as table public.mkt_ai_generations;
create table arquivo.r7_ti_access_profiles as table public.ti_access_profiles;
create table arquivo.r7_ti_user_profiles as table public.ti_user_profiles;
create table arquivo.r7_qualidade_access_profiles as table public.qualidade_access_profiles;
create table arquivo.r7_qualidade_user_profiles as table public.qualidade_user_profiles;

-- As funções que ainda liam ou escreviam os perfis antigos.
create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

select pg_temp.troca('public.is_qualidade_tech(uuid)'::regprocedure,
  'EXISTS (
      SELECT 1 FROM public.qualidade_user_profiles WHERE user_id = _user_id
    ) OR public.is_supervisor_or_higher(_user_id)',
  'public.is_supervisor_or_higher(_user_id)');

select pg_temp.troca('public.archive_profile(uuid,text)'::regprocedure,
  E'COALESCE((SELECT jsonb_agg(module) FROM public.user_module_access WHERE user_id = _user_id), \'[]\'::jsonb),
    \'ti_profile\', (SELECT to_jsonb(t) FROM public.ti_user_profiles t WHERE user_id = _user_id LIMIT 1),
    \'qualidade_profile\', (SELECT to_jsonb(q) FROM public.qualidade_user_profiles q WHERE user_id = _user_id LIMIT 1)',
  E'COALESCE((SELECT jsonb_agg(module) FROM public.user_module_access WHERE user_id = _user_id), \'[]\'::jsonb)');
select pg_temp.troca('public.archive_profile(uuid,text)'::regprocedure,
  'DELETE FROM public.ti_user_profiles WHERE user_id = _user_id;
  DELETE FROM public.qualidade_user_profiles WHERE user_id = _user_id;
', '');

select pg_temp.troca('public.rh_desativa_o_desligado(uuid,text)'::regprocedure,
  E'coalesce((select jsonb_agg(module) from public.user_module_access where user_id = p_user), \'[]\'::jsonb),
           \'ti_profile\', (select to_jsonb(t) from public.ti_user_profiles t where user_id = p_user limit 1),
           \'qualidade_profile\', (select to_jsonb(q) from public.qualidade_user_profiles q where user_id = p_user limit 1))',
  E'coalesce((select jsonb_agg(module) from public.user_module_access where user_id = p_user), \'[]\'::jsonb))');
select pg_temp.troca('public.rh_desativa_o_desligado(uuid,text)'::regprocedure,
  'delete from public.ti_user_profiles where user_id = p_user;
  delete from public.qualidade_user_profiles where user_id = p_user;
', '');

-- Reativar não recria perfil antigo; o que o arquivamento guardou dele fica só no histórico.
select pg_temp.troca('public.restore_profile(uuid)'::regprocedure,
  E'  -- Restaura perfil TI
  IF _hist.snapshot ? \'ti_profile\' AND _hist.snapshot->\'ti_profile\' IS NOT NULL AND _hist.snapshot->\'ti_profile\' <> \'null\'::jsonb THEN
    INSERT INTO public.ti_user_profiles (tenant_id, user_id, profile_id)
    VALUES (_tenant, _user_id, (_hist.snapshot->\'ti_profile\'->>\'profile_id\')::uuid)
    ON CONFLICT DO NOTHING;
  END IF;

  IF _hist.snapshot ? \'qualidade_profile\' AND _hist.snapshot->\'qualidade_profile\' IS NOT NULL AND _hist.snapshot->\'qualidade_profile\' <> \'null\'::jsonb THEN
    INSERT INTO public.qualidade_user_profiles (tenant_id, user_id, profile_id)
    VALUES (_tenant, _user_id, (_hist.snapshot->\'qualidade_profile\'->>\'profile_id\')::uuid)
    ON CONFLICT DO NOTHING;
  END IF;

', '');

alter table public.mkt_social_posts drop column event_id;

drop table public.mkt_quotations;
drop table public.mkt_ai_generations;
drop table public.mkt_events;
drop table public.mkt_assets;
drop table public.ti_user_profiles;
drop table public.ti_access_profiles;
drop table public.qualidade_user_profiles;
drop table public.qualidade_access_profiles;
