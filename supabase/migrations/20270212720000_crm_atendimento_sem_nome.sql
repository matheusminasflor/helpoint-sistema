-- ATENDIMENTO DO CRM, RESPOSTA SEM NOME (dono, 2026-11-09; migrations 20270212710000 e 20270212710100).
-- Conferido contra o Kommo: a mensagem que sai com autor 0 não é só robô. Até a Lyra entrar (08/11 18h56), 99% delas
-- saíram em dia útil das 8h às 18h, com demora de gente (2 a 30 minutos), e 5 das 6 vendas ganhas de 02 a 08/11 não
-- tinham nenhuma mensagem com nome — a atendente respondeu pelo Kommo e ele gravou sem o nome dela. A tela dizia 46 de 50
-- sem resposta e 8 h 29 min de 1ª resposta.
-- Regra do dono (o projeto da Lyra já dizia quando é robô e quando é atendente):
--   * antes de a Lyra entrar no ar (08/11/2026 18h56) não havia robô: toda mensagem que saiu é da responsável pelo lead,
--     e a linha do robô fica vazia;
--   * dali em diante, a de autor 0 é do robô quando o lead estava em "Com a Lyra" (a etapa no momento, ou 1 minuto antes:
--     a despedida da Lyra sai junto com a troca) ou quando é transmissão (o mesmo minuto mandou para 5 leads ou mais);
--     fora disso, é da responsável pelo lead, contada como "sem nome no Kommo";
--   * a vez da atendente começa quando o lead passa para "Com atendente": a 1ª resposta conta dali até o primeiro contato
--     dela, e o lead que a Lyra resolveu sozinha (nunca foi para "Com atendente") não é "sem resposta".
-- O robô passa a mandar a troca de etapa dos leads (kommo_etapas) e a mensagem que ficou só no contato vai para o lead dele.

create table public.kommo_etapas (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  evento_id text not null,
  lead_id bigint not null,
  quando timestamptz not null,
  etapa text,                          -- o nome da etapa para onde o lead foi
  primary key (tenant_id, evento_id)
);
create index kommo_etapas_lead on public.kommo_etapas (tenant_id, lead_id, quando);
alter table public.kommo_etapas enable row level security;
revoke all on public.kommo_etapas from public, anon, authenticated;

-- p_etapas: [{ id, lead_id, quando (segundos), etapa }]. Guarda 120 dias, como as mensagens.
create function public.kommo_gravar_etapas(p_tenant uuid, p_etapas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_novas integer;
begin
  insert into public.kommo_etapas (tenant_id, evento_id, lead_id, quando, etapa)
  select p_tenant, e.id, e.lead_id, to_timestamp(e.quando), e.etapa
    from jsonb_to_recordset(coalesce(p_etapas, '[]')) as e(id text, lead_id bigint, quando bigint, etapa text)
  on conflict do nothing;
  get diagnostics v_novas = row_count;
  delete from public.kommo_etapas where tenant_id = p_tenant and quando < now() - interval '120 days';
  return v_novas;
end;
$$;
revoke all on function public.kommo_gravar_etapas(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kommo_gravar_etapas(uuid, jsonb) to service_role;

-- A Lyra entrou no ar no WhatsApp em 08/11/2026 às 18h56 (Brasília): antes disso não havia robô respondendo.
create function public.kommo_lyra_no_ar() returns timestamptz language sql immutable as $$ select timestamptz '2026-11-08 18:56-03' $$;
revoke all on function public.kommo_lyra_no_ar() from public, anon;

-- A etapa do lead num instante: a última troca até ali.
create function public.kommo_etapa_em(p_tenant uuid, p_lead bigint, p_em timestamptz)
returns text language sql stable security definer set search_path = public as $$
  select e.etapa from public.kommo_etapas e
   where e.tenant_id = p_tenant and e.lead_id = p_lead and e.quando <= p_em order by e.quando desc limit 1;
$$;
revoke all on function public.kommo_etapa_em(uuid, bigint, timestamptz) from public, anon, authenticated;

-- As mensagens desde p_desde com quem de fato mandou: `quem` é a pessoa do Kommo (0 = robô) e `sem_nome` marca a
-- resposta que o Kommo gravou sem a pessoa e foi dada à responsável pelo lead.
create function public.kommo_mensagens_com_quem(p_tenant uuid, p_desde timestamptz)
returns table (lead_id bigint, quando timestamptz, entrou boolean, quem bigint, sem_nome boolean)
language sql stable security definer set search_path = public as $$
  with m as (
    select k.lead_id, k.quando, k.entrou, k.autor from public.kommo_mensagens k
     where k.tenant_id = p_tenant and k.quando >= p_desde
  ),
  transmissao as (
    select date_trunc('minute', m.quando) as minuto from m
     where not m.entrou and m.autor = 0 group by 1 having count(distinct m.lead_id) >= 5
  ),
  c as (
    select m.*,
           not m.entrou and m.autor = 0 and m.quando >= public.kommo_lyra_no_ar() and (
             date_trunc('minute', m.quando) in (select minuto from transmissao)
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando + interval '5 seconds'), '') ilike 'com a lyra%'
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando - interval '1 minute'), '') ilike 'com a lyra%'
           ) as robo
      from m
  )
  select c.lead_id, c.quando, c.entrou,
         case when c.entrou then 0 when c.autor <> 0 then c.autor when c.robo then 0 else coalesce(l.responsavel, 0) end,
         not c.entrou and c.autor = 0 and not c.robo and l.responsavel is not null
    from c left join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = c.lead_id;
$$;
revoke all on function public.kommo_mensagens_com_quem(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.crm_atendimento(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_todos boolean := public.com_pode_gerir_carteiras();
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
    select m.quem as autor, count(*) as mensagens, count(*) filter (where m.sem_nome) as sem_nome, count(distinct m.lead_id) as leads
      from msg m
     where not m.entrou and m.quando >= v_de and m.quando < v_ate and m.lead_id in (select lead_id from visiveis)
     group by m.quem
  ),
  vendas as (
    select v.* from public.mkt_kommo_vendas v
     where v.tenant_id = v_tenant and v.fechou between p_de and p_ate and (v_todos or v.responsavel = any (v_meus))
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
           (select round(avg(r.minutos)) from resposta r where r.autor = p.kommo_id) as primeira_resposta,
           coalesce(t.feitas, 0) as tarefas,
           (select count(*) from vendas v where v.responsavel = p.kommo_id and v.situacao = 'ganha') as ganhas,
           (select count(*) from vendas v where v.responsavel = p.kommo_id and v.situacao = 'perdida') as perdidas
      from pessoas p
      left join saidas s on s.autor = p.kommo_id
      left join tarefas t on t.responsavel = p.kommo_id
  ),
  -- Esperando agora: lead aberto cuja última mensagem é do cliente e veio depois da última resposta de uma pessoa.
  -- "Desde" é a primeira mensagem dele nessa espera. Só os últimos 7 dias.
  espera as (
    select m.lead_id, min(m.quando) as desde
      from msg m
      left join (select h.lead_id, max(h.quando) as em from msg h where not h.entrou and h.quem <> 0 group by h.lead_id) h
        on h.lead_id = m.lead_id
     where m.entrou and m.quando > coalesce(h.em, '-infinity') and m.quando >= now() - interval '7 days'
       and m.lead_id in (select lead_id from visiveis)
     group by m.lead_id
  ),
  para_responder as (
    select e.lead_id, e.desde, l.nome, l.segmento, l.funil, l.etapa, l.link
      from espera e join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = e.lead_id
     where not l.fechado and coalesce(l.etapa, '') not ilike 'com a lyra%'
  ),
  faltando as (
    select v.lead_id, v.nome, v.funil, v.situacao, v.fechou, v.link,
           array_remove(array[
             case when v.documento is null then 'cnpj' end,
             case when v.telefone is null then 'telefone' end,
             case when v.situacao = 'ganha' and coalesce(v.valor, 0) = 0 then 'valor' end,
             case when v.situacao = 'perdida' and v.motivo is null then 'motivo' end], null) as faltam
      from vendas v
  )
  select jsonb_build_object(
    'todos', v_todos,
    'conversas', (select count(*) from resposta),
    'so_lyra', (select count(*) from resposta where so_lyra),
    'sem_resposta', (select count(*) from resposta where respondeu is null and not so_lyra),
    'primeira_resposta', (select round(avg(minutos)) from resposta),
    'no_prazo', (select count(*) from resposta where minutos <= 30),
    'respondidas', (select count(*) from resposta where respondeu is not null),
    'ganhas', (select count(*) from vendas where situacao = 'ganha'),
    'perdidas', (select count(*) from vendas where situacao = 'perdida'),
    'valor_ganho', (select coalesce(sum(valor), 0) from vendas where situacao = 'ganha' and funil <> 'distribuidor')
                   + case when v_todos then (select coalesce(sum(f.valor), 0) from public.mkt_kommo_faturado(p_de, p_ate) f
                                              where f.lead_id in (select lead_id from vendas)) else 0 end,
    -- Antes da Lyra não havia robô: a linha fica vazia (null), não zero.
    'robo', case when v_todos and v_ate > public.kommo_lyra_no_ar() then coalesce(
              (select jsonb_build_object('leads', leads, 'mensagens', mensagens) from saidas where autor = 0),
              jsonb_build_object('leads', 0, 'mensagens', 0)) end,
    'atendentes', coalesce((select jsonb_agg(to_jsonb(l) order by l.mensagens desc, l.nome) from linhas l
                             where l.mensagens + l.tarefas + l.ganhas + l.perdidas > 0 or not v_todos), '[]'),
    'sem_resposta_por_funil', coalesce((
      select jsonb_agg(jsonb_build_object('segmento', x.segmento, 'funil', x.funil, 'quantos', x.quantos) order by x.quantos desc)
        from (select l.segmento, case when l.segmento is null then l.funil end as funil, count(*) as quantos
                from resposta r left join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = r.lead_id
               where r.respondeu is null and not r.so_lyra group by 1, 2) x), '[]'),
    'para_responder', coalesce((select jsonb_agg(to_jsonb(p) order by p.desde) from para_responder p), '[]'),
    'campos_faltando', coalesce((select jsonb_agg(to_jsonb(f) order by f.fechou desc, f.nome) from faltando f
                                  where cardinality(f.faltam) > 0), '[]')
  ) into v;
  return v;
end;
$$;
