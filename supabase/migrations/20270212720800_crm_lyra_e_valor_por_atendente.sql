-- Atendimento do CRM: o trabalho da Lyra e o valor por atendente (dono, 2026-11-10; proposta v2
-- https://claude.ai/artifact/V3CCSk1ZWAuL1YUShGQi2R, partes 1 e 2; a 3 ele recusou).
--   * 'lyra': atendidos, triados, passou para atendente, resolveu sozinha e parou no meio, com os leads de cada um.
--     Só para quem vê todas as atendentes e só depois de a Lyra entrar no ar (antes, null).
--   * 'atendentes' ganha 'valor', pela mesma conta da Venda total (o digitado no Kommo e o faturado do distribuidor).
-- Só create or replace: as permissões ficam como estão.

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
  -- O valor de cada venda pela mesma conta do 'valor_ganho': o digitado no Kommo (fora o distribuidor) mais o faturado.
  vendas_valor as (
    select v.lead_id, v.funil, v.situacao, v.responsavel,
           case when v.situacao = 'ganha' and v.funil <> 'distribuidor' then coalesce(v.valor, 0) else 0 end
           + coalesce((select f.valor from faturado f where f.lead_id = v.lead_id), 0) as valor
      from vendas v
  ),
  vendas_cruzado as (
    select v.funil as segmento, nullif(l.uf, '') as uf,
           count(*) filter (where v.situacao = 'ganha') as ganhas, count(*) filter (where v.situacao = 'perdida') as perdidas,
           sum(v.valor) as valor
      from vendas_valor v left join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = v.lead_id
     group by 1, 2
  ),
  -- O que a Lyra fez (dono, 2026-11-10): os leads em que o robô respondeu até 5 minutos depois do cliente (a transmissão
  -- não conta). Passou = chegou em "Com atendente" depois disso; resolveu = foi para "Link enviado" sem passar;
  -- parou = nem uma coisa nem outra (o cliente não respondeu a triagem).
  lyra_leads as (
    select l.lead_id, l.nome, l.segmento, case when l.segmento is null then l.funil end as funil, l.etapa, l.link,
           a.mensagens, coalesce(l.segmento in ('consumidor', 'salao', 'distribuidor'), false) as triado,
           exists (select 1 from public.kommo_etapas t where t.tenant_id = v_tenant and t.lead_id = l.lead_id
                    and t.quando >= a.primeira and t.etapa ilike 'com atendente%') as passou,
           coalesce(coalesce(public.kommo_etapa_em(v_tenant, l.lead_id, now()), l.etapa) ilike 'link enviado%', false) as no_link
      from (select r.lead_id, min(r.quando) as primeira,
                   (select count(*) from msg z where z.lead_id = r.lead_id and z.quem = 0 and not z.entrou
                       and z.quando >= v_de and z.quando < v_ate) as mensagens
              from msg r
             where r.quem = 0 and not r.entrou and r.quando >= v_de and r.quando < v_ate
               and r.lead_id in (select lead_id from visiveis)
               and exists (select 1 from msg c where c.lead_id = r.lead_id and c.entrou
                            and c.quando <= r.quando and c.quando > r.quando - interval '5 minutes')
             group by r.lead_id) a
      join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = a.lead_id
  ),
  -- Quem são os leads (dono, 2026-11-10): quem conversou no período e quem fechou venda ou perdeu nele.
  lista as (
    select coalesce(r.lead_id, w.lead_id) as lead_id, l.nome, coalesce(l.segmento, w.funil) as segmento,
           case when coalesce(l.segmento, w.funil) is null then l.funil end as funil, nullif(l.uf, '') as uf, l.link,
           (select u.nome from public.kommo_usuarios u where u.tenant_id = v_tenant and u.kommo_id = l.responsavel) as atendente,
           case when r.lead_id is null then null when r.so_lyra then 'so_lyra' when r.respondeu is null then 'sem_resposta'
                when r.minutos <= v_meta then 'no_prazo' else 'fora_do_prazo' end as situacao,
           r.minutos, w.situacao as venda, w.valor
      from resposta r
      full join vendas_valor w on w.lead_id = r.lead_id
      left join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = coalesce(r.lead_id, w.lead_id)
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
    'lyra', case when v_todos and v_ate > public.kommo_lyra_no_ar() then jsonb_build_object(
              'atendidos', (select count(*) from lyra_leads),
              'mensagens', (select coalesce(sum(mensagens), 0) from lyra_leads),
              'triados', (select count(*) from lyra_leads where triado),
              'passou', (select count(*) from lyra_leads where passou),
              'resolveu', (select count(*) from lyra_leads where not passou and no_link),
              'parou', (select count(*) from lyra_leads where not passou and not no_link),
              'leads', coalesce((select jsonb_agg(jsonb_build_object('lead_id', y.lead_id, 'nome', y.nome, 'segmento', y.segmento,
                                   'funil', y.funil, 'etapa', y.etapa, 'link', y.link, 'triado', y.triado, 'passou', y.passou,
                                   'resolveu', not y.passou and y.no_link, 'parou', not y.passou and not y.no_link) order by y.nome)
                                 from lyra_leads y), '[]')) end,
    -- O valor de cada atendente pela mesma conta da Venda total.
    'atendentes', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('valor',
                              (select coalesce(sum(w.valor), 0) from vendas_valor w where w.responsavel = l.kommo_id))
                             order by l.respondidos desc, l.mensagens desc, l.nome) from linhas l
                             where l.mensagens + l.tarefas + l.ganhas + l.perdidas > 0 or not v_todos), '[]'),
    'cruzado', coalesce((select jsonb_agg(to_jsonb(c)) from cruzado c), '[]'),
    'vendas_cruzado', coalesce((select jsonb_agg(to_jsonb(c)) from vendas_cruzado c), '[]'),
    'leads', coalesce((select jsonb_agg(to_jsonb(x) order by x.valor desc nulls last, x.nome) from lista x), '[]'),
    'para_responder', coalesce((select jsonb_agg(to_jsonb(p) order by p.desde) from para_responder p), '[]'),
    'campos_faltando', coalesce((select jsonb_agg(to_jsonb(f) order by f.fechou desc, f.nome) from faltando f
                                  where cardinality(f.faltam) > 0), '[]')
  ) into v;
  return v;
end;
$$;
