-- AVISO QUANDO A LIGAÇÃO COM A META CAIR (proposta aprovada em 2026-11-04, https://claude.ai/artifact/TkNdvQJSmuor8FAUsHaaWM).
-- O dono: "vale ter uma notificação se a API do Meta desconectar com o Helpoint" — para o setor de TI, com chamado que
-- conta nos indicadores e nas Interrupções, e "como configuração em TI visual para que eu possa no futuro modificar".
--
--   · cai quando a Meta recusa a chave (o coletor avisa na hora) ou quando passa X horas sem uma busca que deu certo
--     (a conferência de hora em hora pega até o coletor parado);
--   · ao cair, uma vez por queda: aviso para quem é do setor escolhido, chamado na fila da TI em nome de quem conectou a
--     Meta, e uma interrupção aberta (tipo escolhido, "Sistema" por padrão);
--   · ao voltar: a interrupção fecha, o chamado ganha uma nota interna "a ligação voltou" (a TI resolve; o dono escolheu
--     que não se resolve sozinho) e sai o aviso "voltou a funcionar";
--   · a chave vai vencer: aviso N dias antes (a Meta informa a data no debug_token).
-- A configuração mora em `tenants.settings.alerts.ligacoes.meta` (TI › Configurações › Alertas, pela
-- `salvar_configuracao_da_aba`); sem nada gravado vale o padrão aprovado.

alter type public.notification_type add value if not exists 'ligacao_caiu';

alter table public.mkt_meta_ligacao
  -- A última busca SEM erro (coletado_em é a última busca, com ou sem erro).
  add column if not exists ok_em timestamptz,
  -- Queda aberta: nulo = funcionando.
  add column if not exists caiu_em timestamptz,
  add column if not exists caiu_motivo text,
  add column if not exists queda_chamado uuid references public.tickets (id) on delete set null,
  add column if not exists queda_interrupcao uuid references public.ti_interrupcoes (id) on delete set null,
  add column if not exists chave_vence_em timestamptz,
  -- O vencimento que já foi avisado (avisa uma vez por data).
  add column if not exists vencimento_avisado timestamptz;

/** A configuração da Meta com o padrão aprovado por baixo. */
create or replace function public.ligacao_meta_config(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ligado', true, 'setor', 'ti', 'chamado', true, 'prioridade', 'high', 'interrupcao', true,
                            'tipo', 'sistema', 'horas', 12, 'dias', 7)
         || coalesce((select settings -> 'alerts' -> 'ligacoes' -> 'meta' from public.tenants where id = p_tenant), '{}'::jsonb);
$$;

/** Avisa quem é do setor (acesso ao módulo, ativo). */
create or replace function public.ligacao_meta_avisar(p_tenant uuid, p_setor text, p_titulo text, p_texto text,
                                                      p_ref_tipo text, p_ref uuid)
returns void
-- plpgsql, e não sql: o corpo só é analisado ao rodar, depois que o valor novo do enum (acima) já foi gravado.
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select p_tenant, p.id, 'ligacao_caiu', p_ref_tipo, p_ref, p_titulo, p_texto
    from public.profiles p
   where p.tenant_id = p_tenant and coalesce(p.is_active, true)
     and exists (select 1 from public.user_module_access m where m.user_id = p.id and m.module = p_setor);
end;
$$;

create or replace function public.ligacao_meta_caiu(p_tenant uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  c jsonb := public.ligacao_meta_config(p_tenant);
  v_categoria uuid;
  v_chamado uuid;
  v_interrupcao uuid;
  v_quem uuid;
  v_agora timestamptz := now();
  v_hora text := to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
begin
  select * into l from public.mkt_meta_ligacao where tenant_id = p_tenant for update;
  if l.tenant_id is null or l.caiu_em is not null then
    return; -- sem ligação, ou a queda já está aberta: uma vez por queda
  end if;
  if not coalesce((c ->> 'ligado')::boolean, true) then
    update public.mkt_meta_ligacao set caiu_em = v_agora, caiu_motivo = p_motivo where tenant_id = p_tenant;
    return;
  end if;

  if coalesce((c ->> 'chamado')::boolean, true) then
    v_categoria := nullif(c ->> 'categoria', '')::uuid;
    if v_categoria is null then
      select id into v_categoria from public.ti_categories
       where tenant_id = p_tenant and module = 'tickets' and is_active and name in ('Sistemas Internos', 'Sistemas')
       order by name = 'Sistemas Internos' desc limit 1;
    end if;
    -- O chamado é em nome de quem conectou a Meta (é quem reconecta); sem ele, do dono mais antigo.
    v_quem := coalesce(l.conectado_por,
      (select ur.user_id from public.user_roles ur join public.profiles p on p.id = ur.user_id
        where p.tenant_id = p_tenant and ur.role = 'owner' order by p.created_at limit 1));
    if v_quem is not null then
      insert into public.tickets (tenant_id, module, title, description, category_id, priority, status, requester_id, created_by)
      values (p_tenant, 'tickets', 'Ligação com a Meta caiu: reconectar',
              format(E'Aberto pelo Helpoint (robô da Meta), %s.\n\nO que aconteceu: %s.\n\nO que fazer: Marketing › Indicadores › "Conectar com a Meta" (dono ou admin), depois "Buscar agora". Se a chave que caiu for a de anúncios (usuário do sistema), gerar outra no Business Manager e trocar o segredo META_TOKEN_ANUNCIOS.\n\nQuando o robô voltar a buscar, este chamado recebe uma nota "a ligação voltou".',
                     v_hora, p_motivo),
              v_categoria, coalesce(nullif(c ->> 'prioridade', ''), 'high')::ticket_priority, 'open', v_quem, v_quem)
      returning id into v_chamado;
    end if;
  end if;

  if coalesce((c ->> 'interrupcao')::boolean, true) then
    insert into public.ti_interrupcoes (tenant_id, tipo, inicio, observacao, created_by)
    values (p_tenant, coalesce(nullif(c ->> 'tipo', ''), 'sistema'), v_agora, 'Ligação com a Meta: ' || p_motivo, null)
    returning id into v_interrupcao;
  end if;

  update public.mkt_meta_ligacao
     set caiu_em = v_agora, caiu_motivo = p_motivo, queda_chamado = v_chamado, queda_interrupcao = v_interrupcao
   where tenant_id = p_tenant;

  perform public.ligacao_meta_avisar(p_tenant, coalesce(nullif(c ->> 'setor', ''), 'ti'), 'A ligação com a Meta caiu',
    format('%s (%s). Os Indicadores do Marketing param de atualizar.%s', p_motivo, v_hora,
           case when v_chamado is not null then ' Chamado aberto na TI.' else '' end),
    case when v_chamado is not null then 'ticket' else 'ligacao_meta' end, coalesce(v_chamado, p_tenant));
end;
$$;

create or replace function public.ligacao_meta_voltou(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  c jsonb := public.ligacao_meta_config(p_tenant);
  v_hora text := to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
begin
  select * into l from public.mkt_meta_ligacao where tenant_id = p_tenant for update;
  if l.tenant_id is null or l.caiu_em is null then
    return;
  end if;
  update public.ti_interrupcoes set fim = now() where id = l.queda_interrupcao and fim is null;
  if l.queda_chamado is not null then
    -- Nota interna: não assume o chamado nem muda o status (a TI resolve).
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal, mantem_status)
    select p_tenant, t.id, t.requester_id, format('A ligação com a Meta voltou (%s): o robô voltou a buscar os números. Pode resolver o chamado.', v_hora), true, true
      from public.tickets t where t.id = l.queda_chamado;
  end if;
  update public.mkt_meta_ligacao
     set caiu_em = null, caiu_motivo = null, queda_chamado = null, queda_interrupcao = null
   where tenant_id = p_tenant;
  if coalesce((c ->> 'ligado')::boolean, true) then
    perform public.ligacao_meta_avisar(p_tenant, coalesce(nullif(c ->> 'setor', ''), 'ti'), 'A ligação com a Meta voltou',
      format('O robô voltou a buscar os números (%s).', v_hora),
      case when l.queda_chamado is not null then 'ticket' else 'ligacao_meta' end, coalesce(l.queda_chamado, p_tenant));
  end if;
end;
$$;

/**
 * O que o coletor diz a cada passada: deu certo (ok), a Meta recusou a chave (desconectou), e quando a chave vence.
 * Só a chave de serviço chama (o coletor).
 */
create or replace function public.ligacao_meta_resultado(p_tenant uuid, p_ok boolean, p_desconectou boolean,
                                                         p_motivo text, p_vence_em timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb := public.ligacao_meta_config(p_tenant);
  l record;
begin
  if p_vence_em is not null then
    update public.mkt_meta_ligacao set chave_vence_em = p_vence_em where tenant_id = p_tenant;
  end if;
  if p_ok then
    update public.mkt_meta_ligacao set ok_em = now() where tenant_id = p_tenant;
    perform public.ligacao_meta_voltou(p_tenant);
  elsif p_desconectou then
    perform public.ligacao_meta_caiu(p_tenant, coalesce(p_motivo, 'a Meta recusou a chave do Helpoint'));
  end if;

  select * into l from public.mkt_meta_ligacao where tenant_id = p_tenant;
  if coalesce((c ->> 'ligado')::boolean, true) and l.chave_vence_em is not null
     and l.chave_vence_em - make_interval(days => coalesce((c ->> 'dias')::int, 7)) <= now()
     and l.vencimento_avisado is distinct from l.chave_vence_em then
    perform public.ligacao_meta_avisar(p_tenant, coalesce(nullif(c ->> 'setor', ''), 'ti'), 'A chave da Meta vai vencer',
      format('A chave que liga o Helpoint à Meta vence em %s. Reconecte antes (Marketing › Indicadores › "Conectar com a Meta") para os números não pararem.',
             to_char(l.chave_vence_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')),
      'ligacao_meta', p_tenant);
    update public.mkt_meta_ligacao set vencimento_avisado = l.chave_vence_em where tenant_id = p_tenant;
  end if;
end;
$$;

/** De hora em hora: ligação sem busca que deu certo há mais de X horas cai (pega até o coletor parado). */
create or replace function public.ligacoes_conferir()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_horas int;
begin
  for l in select * from public.mkt_meta_ligacao where caiu_em is null loop
    v_horas := coalesce((public.ligacao_meta_config(l.tenant_id) ->> 'horas')::int, 12);
    if coalesce(l.ok_em, l.conectado_em) < now() - make_interval(hours => v_horas) then
      perform public.ligacao_meta_caiu(l.tenant_id, format('o robô está há mais de %s horas sem conseguir buscar os números', v_horas));
    end if;
  end loop;
end;
$$;

/** A situação para o cartão da TI (quem configura os alertas da TI, ou gestor para cima). */
create or replace function public.situacao_da_ligacao_meta()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.pode_alterar_aba('ti', 'alertas') or public.is_supervisor_or_higher(auth.uid()) then
    (select jsonb_build_object('conectada', true, 'ok_em', ok_em, 'coletado_em', coletado_em, 'caiu_em', caiu_em,
                               'caiu_motivo', caiu_motivo, 'chave_vence_em', chave_vence_em)
       from public.mkt_meta_ligacao where tenant_id = public.get_user_tenant_id())
  end;
$$;

-- Só o coletor (chave de serviço) e o cron chamam as de dentro; a tela só a situação.
revoke all on function public.ligacao_meta_config(uuid) from public, anon, authenticated;
revoke all on function public.ligacao_meta_avisar(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ligacao_meta_caiu(uuid, text) from public, anon, authenticated;
revoke all on function public.ligacao_meta_voltou(uuid) from public, anon, authenticated;
revoke all on function public.ligacao_meta_resultado(uuid, boolean, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.ligacoes_conferir() from public, anon, authenticated;
grant execute on function public.ligacao_meta_resultado(uuid, boolean, boolean, text, timestamptz) to service_role;
revoke all on function public.situacao_da_ligacao_meta() from public, anon;
grant execute on function public.situacao_da_ligacao_meta() to authenticated;

-- Quem conectou antes de existir `ok_em` começa da última busca, para não cair na primeira conferência.
update public.mkt_meta_ligacao set ok_em = coletado_em where ok_em is null and ultimo_erro is null;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ligacoes-conferir') then
    perform cron.unschedule('ligacoes-conferir');
  end if;
end $$;
select cron.schedule('ligacoes-conferir', '30 * * * *', $job$ select public.ligacoes_conferir(); $job$);
