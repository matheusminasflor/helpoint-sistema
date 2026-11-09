-- ATENDIMENTO DO CRM, TELA NOVA (dono, 2026-11-09; proposta https://claude.ai/artifact/9b6cYeC6VFZFvtwXttya6H, v2).
--   * Meta de 45 minutos em tudo: tarefa da Lyra, aviso e relatório (antes, 30).
--   * Estado de cada lead (`kommo_leads.uf`): o campo quando preenchido, sem ele o DDD (o robô calcula; '' = não deu).
--   * Por segmento e por estado: a conta sai cruzada (segmento × estado) e a tela soma o recorte que a pessoa escolher.
--   * A linha da atendente separa "Respondidos" (conversas em que ela deu a 1ª resposta) de "Ativos" (clientes que ela
--     procurou sem eles terem escrito no período), e diz quantas respondeu no prazo.
--   * "Aguardando resposta" conta de quando o lead chegou em "Com atendente", se foi depois da 1ª mensagem que espera.
--   * Distribuidor sem valor no Kommo e com faturado no Forteplus: o valor é o faturado, e o aviso continua como
--     "valor_kommo" (falta digitar no Kommo), não como venda sem valor.
--   * O aviso de cliente esperando deixa de depender da tarefa do Kommo (`kommo_avisar_esperas`): cliente que escreveu por
--     último e espera há 45 minutos de expediente, fora de "Com a Lyra", avisa a responsável pelo lead, o dono, o admin e
--     o gestor comercial, uma vez por espera.

alter table public.kommo_leads add column uf text;

create or replace function public.kommo_meta_resposta() returns integer language sql immutable as $$ select 45 $$;
revoke all on function public.kommo_meta_resposta() from public, anon;

-- p_leads ganha `uf`. O resto igual a 20270212720300.
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

  insert into public.kommo_leads (tenant_id, lead_id, nome, segmento, funil, etapa, fechado, responsavel, link, interno, uf)
  select p_tenant, l.lead_id, l.nome, l.segmento, l.funil, l.etapa, coalesce(l.fechado, false), l.responsavel, l.link,
         coalesce(l.interno, false), l.uf
    from jsonb_to_recordset(coalesce(p_leads, '[]')) as l(lead_id bigint, nome text, segmento text, funil text, etapa text,
                                                           fechado boolean, responsavel bigint, link text, interno boolean, uf text)
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, segmento = excluded.segmento, funil = excluded.funil, etapa = excluded.etapa,
        fechado = excluded.fechado, responsavel = excluded.responsavel, link = excluded.link, interno = excluded.interno,
        uf = coalesce(excluded.uf, kommo_leads.uf);

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

  insert into public.kommo_tarefas_feitas (tenant_id, tarefa_id, responsavel, feita_em)
  select p_tenant, t.id, t.responsavel, to_timestamp(t.feita_em)
    from jsonb_to_recordset(coalesce(p_tarefas, '[]')) as t(id bigint, responsavel bigint, feita_em bigint)
  on conflict (tenant_id, tarefa_id) do update set responsavel = excluded.responsavel, feita_em = excluded.feita_em;

  delete from public.kommo_mensagens where tenant_id = p_tenant and quando < now() - interval '120 days';
  delete from public.kommo_tarefas_feitas where tenant_id = p_tenant and feita_em < now() - interval '120 days';
  return jsonb_build_object('mensagens', v_novas);
end;
$$;

-- Quem está esperando a atendente agora: lead aberto, fora de "Com a Lyra", cuja última mensagem é do cliente depois da
-- última resposta de uma pessoa. `desde` é a 1ª mensagem dessa espera, ou a chegada em "Com atendente", se veio depois.
create function public.kommo_esperando(p_tenant uuid)
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
   where not l.fechado and coalesce(l.etapa, '') not ilike 'com a lyra%';
$$;
revoke all on function public.kommo_esperando(uuid) from public, anon, authenticated;

create table public.kommo_esperas_avisadas (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id bigint not null,
  desde timestamptz not null,
  avisado_em timestamptz not null default now(),
  primary key (tenant_id, lead_id, desde)
);
alter table public.kommo_esperas_avisadas enable row level security;
revoke all on public.kommo_esperas_avisadas from public, anon, authenticated;

-- Chamada pelo robô a cada 10 minutos, depois de gravar as conversas. Só espera dos últimos 3 dias avisa: na primeira
-- vez, as de 03/11 não viram uma enxurrada de avisos (elas estão na tela, em "Aguardando resposta").
create function public.kommo_avisar_esperas(p_tenant uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_avisos integer := 0;
  e record;
begin
  for e in
    select w.lead_id, w.desde, l.nome, l.funil, l.responsavel
      from public.kommo_esperando(p_tenant) w
      join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = w.lead_id
     where w.desde >= now() - interval '3 days'
  loop
    continue when exists (select 1 from public.kommo_esperas_avisadas a
                           where a.tenant_id = p_tenant and a.lead_id = e.lead_id and a.desde = e.desde);
    continue when public.minutos_uteis_do_chamado(p_tenant, 'comercial', e.desde, now(), null) < public.kommo_meta_resposta();

    insert into public.kommo_esperas_avisadas (tenant_id, lead_id, desde) values (p_tenant, e.lead_id, e.desde);
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    select distinct p_tenant, p.id, 'lead_sem_resposta'::public.notification_type, 'kommo_lead', p_tenant,
           'Cliente aguardando resposta há ' || public.kommo_meta_resposta() || ' minutos',
           e.nome || coalesce(' · ' || e.funil, '') || ' · lead nº ' || e.lead_id || ' no Kommo, esperando desde ' ||
           to_char(e.desde at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.'
      from public.profiles p
     where p.tenant_id = p_tenant and coalesce(p.is_active, true)
       and (exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('owner', 'admin'))
            or public.tem_permissao(p.id, 'comercial', 'carteiras', 'gerir')
            or p.id = (select k.user_id from public.kommo_usuarios k where k.tenant_id = p_tenant and k.kommo_id = e.responsavel));
    v_avisos := v_avisos + 1;
  end loop;
  return v_avisos;
end;
$$;
revoke all on function public.kommo_avisar_esperas(uuid) from public, anon, authenticated;
grant execute on function public.kommo_avisar_esperas(uuid) to service_role;

create or replace function public.crm_atendimento(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_todos boolean := public.com_pode_gerir_carteiras();
  v_meta integer := public.kommo_meta_resposta();
  v_meus bigint[];
  v_de timestamptz := (p_de::timestamp) at time zone 'America/Sao_Paulo';
  v_ate timestamptz := ((p_ate + 1)::timestamp) at time zone 'America/Sao_Paulo';
  v jsonb;
begin
  if v_tenant is null or not (v_todos or public.pode_no_setor('comercial', 'reports', 'view')) then
    raise exception 'sem acesso ao Atendimento do CRM' using errcode = '42501';
  end if;
  select coalesce(array_agg(k.kommo_id), '{}') into v_meus
    from public.kommo_usuarios k where k.tenant_id = v_tenant and k.user_id = auth.uid();

  with
  -- quem = a pessoa do Kommo que mandou (0 = robô); pessoa > 0 é resposta, com nome ou sem.
  msg as (select * from public.kommo_mensagens_com_quem(v_tenant, least(v_de, now() - interval '7 days'))),
  -- Os leads que a pessoa pode ver: todos, ou os de que ela é responsável ou que ela respondeu.
  visiveis as (
    select l.lead_id from public.kommo_leads l
     where l.tenant_id = v_tenant and (v_todos or l.responsavel = any (v_meus))
    union
    select m.lead_id from msg m where not v_todos and m.quem = any (v_meus)
  ),
  entrada as (
    select m.lead_id, min(m.quando) as em from msg m
     where m.entrou and m.quando >= v_de and m.quando < v_ate and m.lead_id in (select lead_id from visiveis)
     group by m.lead_id
  ),
  -- A vez da atendente: se o cliente caiu com a Lyra (a etapa 1 minuto depois da mensagem dele), começa quando o lead
  -- passou para "Com atendente"; sem essa passagem, a Lyra resolveu sozinha. Sem a Lyra, começa na mensagem do cliente.
  lyra as (
    select e.lead_id, e.em,
           coalesce(public.kommo_etapa_em(v_tenant, e.lead_id, e.em + interval '1 minute') ilike 'com a lyra%', false) as com_lyra
      from entrada e
  ),
  vez as (
    select y.lead_id, y.com_lyra,
           case when y.com_lyra
                then (select min(t.quando) from public.kommo_etapas t
                       where t.tenant_id = v_tenant and t.lead_id = y.lead_id and t.quando >= y.em and t.etapa ilike 'com atendente%')
                else y.em end as comeca
      from lyra y
  ),
  resposta as (
    select v.lead_id, v.comeca as entrada, v.com_lyra and v.comeca is null as so_lyra, r.quando as respondeu, r.quem as autor,
           case when r.quando is not null then public.minutos_uteis_do_chamado(v_tenant, 'comercial', v.comeca, r.quando, null) end as minutos
      from vez v
      left join lateral (
        select m.quando, m.quem from msg m
         where m.lead_id = v.lead_id and not m.entrou and m.quem <> 0 and m.quando >= v.comeca
         order by m.quando limit 1
      ) r on true
  ),
  -- Por pessoa (0 é o robô: Lyra, resposta automática e transmissão): as mensagens que saíram no período e os leads delas.
  saidas as (
    select m.quem as autor, count(*) as mensagens, count(*) filter (where m.sem_nome) as sem_nome, count(distinct m.lead_id) as leads,
           count(distinct m.lead_id) filter (where m.lead_id not in (select lead_id from entrada)) as ativos
      from msg m
     where not m.entrou and m.quando >= v_de and m.quando < v_ate and m.lead_id in (select lead_id from visiveis)
     group by m.quem
  ),
  -- O faturado dos distribuidores (Forteplus), só para quem gere as carteiras.
  faturado as (
    select f.lead_id, sum(f.valor) as valor from public.mkt_kommo_faturado(p_de, p_ate) f where v_todos group by f.lead_id
  ),
  vendas as (
    select v.* from public.mkt_kommo_vendas v
     where v.tenant_id = v_tenant and v.fechou between p_de and p_ate and (v_todos or v.responsavel = any (v_meus))
       and not exists (select 1 from public.kommo_leads l where l.tenant_id = v_tenant and l.lead_id = v.lead_id and l.interno)
  ),
  tarefas as (
    select t.responsavel, count(*) as feitas from public.kommo_tarefas_feitas t
     where t.tenant_id = v_tenant and t.feita_em >= v_de and t.feita_em < v_ate group by t.responsavel
  ),
  pessoas as (
    select u.kommo_id, u.nome from public.kommo_usuarios u
     where u.tenant_id = v_tenant and (v_todos or u.kommo_id = any (v_meus))
  ),
  linhas as (
    select p.kommo_id, p.nome,
           coalesce(s.leads, 0) as leads, coalesce(s.mensagens, 0) as mensagens, coalesce(s.sem_nome, 0) as sem_nome,
           coalesce(s.ativos, 0) as ativos,
           (select count(*) from resposta r where r.autor = p.kommo_id) as respondidos,
           (select count(*) from resposta r where r.autor = p.kommo_id and r.minutos <= v_meta) as no_prazo,
           (select round(avg(r.minutos)) from resposta r where r.autor = p.kommo_id) as primeira_resposta,
           coalesce(t.feitas, 0) as tarefas,
           (select count(*) from vendas v where v.responsavel = p.kommo_id and v.situacao = 'ganha') as ganhas,
           (select count(*) from vendas v where v.responsavel = p.kommo_id and v.situacao = 'perdida') as perdidas
      from pessoas p
      left join saidas s on s.autor = p.kommo_id
      left join tarefas t on t.responsavel = p.kommo_id
  ),
  -- Aguardando resposta agora (7 dias), contado da chegada em "Com atendente" quando foi depois.
  para_responder as (
    select w.lead_id, w.desde, l.nome, l.segmento, l.funil, l.etapa, l.link, nullif(l.uf, '') as uf
      from public.kommo_esperando(v_tenant) w join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = w.lead_id
     where w.lead_id in (select lead_id from visiveis)
  ),
  faltando as (
    select v.lead_id, v.nome, v.funil, v.situacao, v.fechou, v.link,
           array_remove(array[
             case when v.documento is null then 'cnpj' end,
             case when v.telefone is null then 'telefone' end,
             case when v.situacao = 'ganha' and coalesce(v.valor, 0) = 0
                  then case when v.funil = 'distribuidor' and exists (select 1 from faturado f where f.lead_id = v.lead_id)
                            then 'valor_kommo' else 'valor' end end,
             case when v.situacao = 'perdida' and v.motivo is null then 'motivo' end], null) as faltam
      from vendas v
  ),
  -- Segmento × estado, para a tela somar o recorte escolhido.
  cruzado as (
    select l.segmento, case when l.segmento is null then l.funil end as funil, nullif(l.uf, '') as uf,
           count(*) as conversas,
           count(*) filter (where r.so_lyra) as so_lyra,
           count(*) filter (where r.respondeu is null and not r.so_lyra) as sem_resposta,
           count(*) filter (where r.respondeu is not null) as respondidas,
           count(*) filter (where r.minutos <= v_meta) as no_prazo,
           coalesce(sum(r.minutos), 0) as soma_minutos
      from resposta r left join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = r.lead_id
     group by 1, 2, 3
  ),
  vendas_cruzado as (
    select v.funil as segmento, nullif(l.uf, '') as uf,
           count(*) filter (where v.situacao = 'ganha') as ganhas, count(*) filter (where v.situacao = 'perdida') as perdidas
      from vendas v left join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = v.lead_id
     group by 1, 2
  )
  select jsonb_build_object(
    'todos', v_todos,
    'meta', v_meta,
    'conversas', (select count(*) from resposta),
    'so_lyra', (select count(*) from resposta where so_lyra),
    'sem_resposta', (select count(*) from resposta where respondeu is null and not so_lyra),
    'primeira_resposta', (select round(avg(minutos)) from resposta),
    'no_prazo', (select count(*) from resposta where minutos <= v_meta),
    'respondidas', (select count(*) from resposta where respondeu is not null),
    'ganhas', (select count(*) from vendas where situacao = 'ganha'),
    'perdidas', (select count(*) from vendas where situacao = 'perdida'),
    'valor_ganho', (select coalesce(sum(valor), 0) from vendas where situacao = 'ganha' and funil <> 'distribuidor')
                   + (select coalesce(sum(f.valor), 0) from faturado f where f.lead_id in (select lead_id from vendas)),
    -- Antes da Lyra não havia robô: a linha fica vazia (null), não zero.
    'robo', case when v_todos and v_ate > public.kommo_lyra_no_ar() then coalesce(
              (select jsonb_build_object('leads', leads, 'mensagens', mensagens) from saidas where autor = 0),
              jsonb_build_object('leads', 0, 'mensagens', 0)) end,
    'atendentes', coalesce((select jsonb_agg(to_jsonb(l) order by l.respondidos desc, l.mensagens desc, l.nome) from linhas l
                             where l.mensagens + l.tarefas + l.ganhas + l.perdidas > 0 or not v_todos), '[]'),
    'cruzado', coalesce((select jsonb_agg(to_jsonb(c)) from cruzado c), '[]'),
    'vendas_cruzado', coalesce((select jsonb_agg(to_jsonb(c)) from vendas_cruzado c), '[]'),
    'para_responder', coalesce((select jsonb_agg(to_jsonb(p) order by p.desde) from para_responder p), '[]'),
    'campos_faltando', coalesce((select jsonb_agg(to_jsonb(f) order by f.fechou desc, f.nome) from faltando f
                                  where cardinality(f.faltam) > 0), '[]')
  ) into v;
  return v;
end;
$$;

-- O aviso antigo, pela tarefa de 30 minutos do Kommo (20270212700100), sai: o de cima olha a conversa.
drop function public.kommo_avisar_sem_resposta(uuid, jsonb);
drop table public.kommo_tarefas_avisadas;
