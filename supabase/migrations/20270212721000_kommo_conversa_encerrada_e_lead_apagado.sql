-- "Aguardando resposta" sem os casos já resolvidos (dono, 2026-11-11; proposta https://claude.ai/artifact/YTvjHrndVfG5dmoiNS9RxZ).
--   * Conversa ENCERRADA no Kommo (a atendente fechou o chat, como na Regiane, 104596735) não está esperando ninguém:
--     o robô lê a situação da conversa mais recente de cada lead (`talks`, status `closed` ou `in_work`) e grava em
--     `conversa_fechada`. Se o cliente escreve de novo, o Kommo reabre a conversa e a próxima leitura desmarca.
--   * Lead APAGADO no Kommo (ou unido a um duplicado, como a Priscila, 120987979) some da leitura "o que mudou" e ficava
--     aberto para sempre aqui. O robô confere pelo número os leads que estariam esperando; o que o Kommo não devolve
--     fica `apagado` e sai de todas as contas (as mensagens dele param de contar). Se voltar da lixeira, a gravação do
--     lead desmarca.
-- Só create or replace e função nova: as permissões das antigas ficam como estão.

alter table public.kommo_leads
  add column if not exists conversa_fechada boolean not null default false,
  add column if not exists apagado boolean not null default false;
-- "Atualizado às" no alto do Atendimento do CRM: a leitura de 10 em 10 minutos (conversas) e a de hora em hora (vendas).
alter table public.mkt_kommo_robo add column if not exists conversas_em timestamptz;

-- Chamada pelo robô a cada 10 minutos, depois de gravar as conversas.
create function public.kommo_gravar_conversas(p_tenant uuid, p_fechadas bigint[], p_abertas bigint[], p_apagados bigint[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v integer;
begin
  update public.kommo_leads l set conversa_fechada = l.lead_id = any (coalesce(p_fechadas, '{}'))
   where l.tenant_id = p_tenant and l.lead_id = any (coalesce(p_fechadas, '{}') || coalesce(p_abertas, '{}'))
     and l.conversa_fechada is distinct from (l.lead_id = any (coalesce(p_fechadas, '{}')));
  get diagnostics v = row_count;
  update public.kommo_leads l set apagado = true
   where l.tenant_id = p_tenant and l.lead_id = any (coalesce(p_apagados, '{}')) and not l.apagado;
  update public.mkt_kommo_robo set conversas_em = now() where tenant_id = p_tenant;
  return v;
end;
$$;
revoke all on function public.kommo_gravar_conversas(uuid, bigint[], bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.kommo_gravar_conversas(uuid, bigint[], bigint[], bigint[]) to service_role;

-- A hora das duas leituras, para quem abre o Atendimento do CRM (a tabela do robô continua só do administrador).
create function public.crm_atualizado_em()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v jsonb;
begin
  if v_tenant is null or not (public.com_pode_gerir_carteiras() or public.pode_no_setor('comercial', 'reports', 'view')) then
    raise exception 'sem acesso ao Atendimento do CRM' using errcode = '42501';
  end if;
  select jsonb_build_object('conversas', r.conversas_em, 'vendas', r.ok_em) into v
    from public.mkt_kommo_robo r where r.tenant_id = v_tenant;
  return coalesce(v, '{}'::jsonb);
end;
$$;
revoke all on function public.crm_atualizado_em() from public, anon;
grant execute on function public.crm_atualizado_em() to authenticated;

-- Os leads que o robô confere pelo número: abertos, não apagados, com mensagem nos últimos 7 dias.
create function public.kommo_leads_para_conferir(p_tenant uuid)
returns setof bigint language sql stable security definer set search_path = public as $$
  select l.lead_id from public.kommo_leads l
   where l.tenant_id = p_tenant and not l.fechado and not l.apagado
     and exists (select 1 from public.kommo_mensagens m
                  where m.tenant_id = p_tenant and m.lead_id = l.lead_id and m.quando >= now() - interval '7 days');
$$;
revoke all on function public.kommo_leads_para_conferir(uuid) from public, anon, authenticated;
grant execute on function public.kommo_leads_para_conferir(uuid) to service_role;

-- O lead que o Kommo devolveu existe: desmarca `apagado`. O resto igual a 20270212720900.
create or replace function public.kommo_gravar_atendimento(p_tenant uuid, p_mensagens jsonb, p_leads jsonb, p_usuarios jsonb, p_tarefas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_novas integer;
begin
  insert into public.kommo_mensagens (tenant_id, evento_id, lead_id, quando, entrou, autor, canal)
  select p_tenant, m.id, m.lead_id, to_timestamp(m.quando), m.entrou, coalesce(m.autor, 0), m.canal
    from jsonb_to_recordset(coalesce(p_mensagens, '[]')) as m(id text, lead_id bigint, quando bigint, entrou boolean, autor bigint, canal text)
  on conflict do nothing;
  get diagnostics v_novas = row_count;

  insert into public.kommo_leads (tenant_id, lead_id, nome, segmento, funil, etapa, fechado, responsavel, link, interno, uf, origem)
  select p_tenant, l.lead_id, l.nome, l.segmento, l.funil, l.etapa, coalesce(l.fechado, false), l.responsavel, l.link,
         coalesce(l.interno, false), l.uf, l.origem
    from jsonb_to_recordset(coalesce(p_leads, '[]')) as l(lead_id bigint, nome text, segmento text, funil text, etapa text,
                                                           fechado boolean, responsavel bigint, link text, interno boolean, uf text,
                                                           origem text)
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, segmento = excluded.segmento, funil = excluded.funil, etapa = excluded.etapa,
        fechado = excluded.fechado, responsavel = excluded.responsavel, link = excluded.link, interno = excluded.interno,
        uf = coalesce(excluded.uf, kommo_leads.uf), origem = coalesce(excluded.origem, kommo_leads.origem), apagado = false;

  insert into public.kommo_usuarios (tenant_id, kommo_id, nome, user_id)
  select p_tenant, u.kommo_id, u.nome,
         coalesce(
           (select p.id from public.profiles p where p.tenant_id = p_tenant and lower(p.email) = lower(u.email) limit 1),
           (select min(p.id::text)::uuid from public.profiles p
             where p.tenant_id = p_tenant and p.is_active
               and lower(split_part(trim(p.full_name), ' ', 1)) = lower(split_part(trim(u.nome), ' ', 1))
            having count(*) = 1))
    from jsonb_to_recordset(coalesce(p_usuarios, '[]')) as u(kommo_id bigint, nome text, email text)
  on conflict (tenant_id, kommo_id) do update
    set nome = excluded.nome, user_id = coalesce(kommo_usuarios.user_id, excluded.user_id);

  insert into public.kommo_tarefas_feitas (tenant_id, tarefa_id, responsavel, feita_em, lead_id)
  select p_tenant, t.id, t.responsavel, to_timestamp(t.feita_em), t.lead_id
    from jsonb_to_recordset(coalesce(p_tarefas, '[]')) as t(id bigint, responsavel bigint, feita_em bigint, lead_id bigint)
  on conflict (tenant_id, tarefa_id) do update
    set responsavel = excluded.responsavel, feita_em = excluded.feita_em, lead_id = coalesce(excluded.lead_id, kommo_tarefas_feitas.lead_id);

  delete from public.kommo_mensagens where tenant_id = p_tenant and quando < now() - interval '120 days';
  delete from public.kommo_tarefas_feitas where tenant_id = p_tenant and feita_em < now() - interval '120 days';
  -- Tarefa de lead da equipe, de fornecedor ou de artista não é atendimento.
  delete from public.kommo_tarefas_feitas t using public.kommo_leads l
   where t.tenant_id = p_tenant and l.tenant_id = p_tenant and l.lead_id = t.lead_id and l.interno;
  return jsonb_build_object('mensagens', v_novas);
end;
$$;

-- As mensagens do lead apagado no Kommo param de contar, como as da equipe. O resto igual a 20270212720300.
create or replace function public.kommo_mensagens_com_quem(p_tenant uuid, p_desde timestamptz)
returns table (lead_id bigint, quando timestamptz, entrou boolean, quem bigint, sem_nome boolean)
language sql stable security definer set search_path = public as $$
  with m as (
    select k.lead_id, k.quando, k.entrou, k.autor, k.canal,
           lag(k.quando) over w as ant_quando, lag(k.entrou) over w as ant_entrou
      from public.kommo_mensagens k
     where k.tenant_id = p_tenant and k.quando >= p_desde
    window w as (partition by k.lead_id order by k.quando)
  ),
  transmissao as (
    select date_trunc('minute', m.quando) as minuto from m
     where not m.entrou and m.autor = 0 group by 1 having count(distinct m.lead_id) >= 5
  ),
  c as (
    select m.*,
           not m.entrou and m.autor = 0 and m.quando >= public.kommo_lyra_no_ar() and (
             date_trunc('minute', m.quando) in (select minuto from transmissao)
             or (m.canal = 'instagram_business' and coalesce(m.ant_entrou, false) and m.quando - m.ant_quando <= interval '15 seconds')
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando + interval '1 minute'), '') ilike 'com a lyra%'
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando - interval '1 minute'), '') ilike 'com a lyra%'
           ) as robo
      from m
  )
  select c.lead_id, c.quando, c.entrou,
         case when c.entrou then 0 when c.autor <> 0 then c.autor when c.robo then 0 else coalesce(l.responsavel, 0) end,
         not c.entrou and c.autor = 0 and not c.robo and l.responsavel is not null
    from c left join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = c.lead_id
   where not coalesce(l.interno, false) and not coalesce(l.apagado, false);
$$;

-- Esperando = lead aberto, fora de "Com a Lyra", com a conversa aberta no Kommo e a última mensagem do cliente.
-- O resto igual a 20270212720400.
create or replace function public.kommo_esperando(p_tenant uuid)
returns table (lead_id bigint, desde timestamptz)
language sql stable security definer set search_path = public as $$
  with msg as (select * from public.kommo_mensagens_com_quem(p_tenant, now() - interval '7 days')),
  ultima as (select m.lead_id, max(m.quando) as em from msg m where not m.entrou and m.quem <> 0 group by m.lead_id),
  espera as (
    select m.lead_id, min(m.quando) as desde from msg m left join ultima u on u.lead_id = m.lead_id
     where m.entrou and m.quando > coalesce(u.em, '-infinity') group by m.lead_id
  )
  select e.lead_id,
         greatest(e.desde, (select max(t.quando) from public.kommo_etapas t
                             where t.tenant_id = p_tenant and t.lead_id = e.lead_id and t.etapa ilike 'com atendente%'))
    from espera e join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = e.lead_id
   where not l.fechado and not l.conversa_fechada and not l.apagado and coalesce(l.etapa, '') not ilike 'com a lyra%';
$$;
