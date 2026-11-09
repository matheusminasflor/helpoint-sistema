-- ATENDIMENTO DO CRM, REVISÃO DO DONO (2026-11-09, migration 20270212710000):
--   * a linha "Lyra" virou "Robô e mensagens automáticas": o Kommo marca igual (autor 0) a Lyra, o robô antigo, a
--     resposta automática e a transmissão — na semana de 02 a 08/11 a Lyra nem estava ligada;
--   * "Para responder agora" olha só os últimos 7 dias (com 30, outubro tomava o topo da lista);
--   * vendas ganhas com o valor, como na proposta aprovada: o digitado no Kommo e, no Distribuidor, o faturado do
--     Forteplus (`mkt_kommo_faturado`, a mesma conta dos Indicadores). A atendente vê só o digitado: o faturado é de quem
--     gere as carteiras.
-- `create or replace` preserva quem pode chamar a função.

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
  msg as (select * from public.kommo_mensagens m where m.tenant_id = v_tenant and m.quando >= least(v_de, now() - interval '7 days')),
  -- Os leads que a pessoa pode ver: todos, ou os de que ela é responsável ou que ela respondeu.
  visiveis as (
    select l.lead_id from public.kommo_leads l
     where l.tenant_id = v_tenant and (v_todos or l.responsavel = any (v_meus))
    union
    select m.lead_id from msg m where not v_todos and m.autor = any (v_meus)
  ),
  entrada as (
    select m.lead_id, min(m.quando) as em from msg m
     where m.entrou and m.quando >= v_de and m.quando < v_ate and m.lead_id in (select lead_id from visiveis)
     group by m.lead_id
  ),
  resposta as (
    select e.lead_id, e.em as entrada, r.quando as respondeu, r.autor,
           case when r.quando is not null then public.minutos_uteis_do_chamado(v_tenant, 'comercial', e.em, r.quando, null) end as minutos
      from entrada e
      left join lateral (
        select m.quando, m.autor from public.kommo_mensagens m
         where m.tenant_id = v_tenant and m.lead_id = e.lead_id and not m.entrou and m.autor <> 0 and m.quando >= e.em
         order by m.quando limit 1
      ) r on true
  ),
  -- Por pessoa do Kommo (0 é o robô: Lyra, robô antigo, resposta automática e transmissão): as mensagens que saíram no período e os leads delas.
  saidas as (
    select m.autor, count(*) as mensagens, count(distinct m.lead_id) as leads
      from msg m
     where not m.entrou and m.quando >= v_de and m.quando < v_ate and m.lead_id in (select lead_id from visiveis)
     group by m.autor
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
           coalesce(s.leads, 0) as leads, coalesce(s.mensagens, 0) as mensagens,
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
      left join (select h.lead_id, max(h.quando) as em from public.kommo_mensagens h
                  where h.tenant_id = v_tenant and not h.entrou and h.autor <> 0 group by h.lead_id) h on h.lead_id = m.lead_id
     where m.entrou and m.quando > coalesce(h.em, '-infinity') and m.quando >= now() - interval '7 days'
       and m.lead_id in (select lead_id from visiveis)
     group by m.lead_id
  ),
  para_responder as (
    select e.lead_id, e.desde, l.nome, l.segmento, l.funil, l.etapa, l.link
      from espera e join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = e.lead_id
     where not l.fechado
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
    'sem_resposta', (select count(*) from resposta where respondeu is null),
    'primeira_resposta', (select round(avg(minutos)) from resposta),
    'no_prazo', (select count(*) from resposta where minutos <= 30),
    'respondidas', (select count(*) from resposta where respondeu is not null),
    'ganhas', (select count(*) from vendas where situacao = 'ganha'),
    'perdidas', (select count(*) from vendas where situacao = 'perdida'),
    'valor_ganho', (select coalesce(sum(valor), 0) from vendas where situacao = 'ganha' and funil <> 'distribuidor')
                   + case when v_todos then (select coalesce(sum(f.valor), 0) from public.mkt_kommo_faturado(p_de, p_ate) f
                                              where f.lead_id in (select lead_id from vendas)) else 0 end,
    'robo', case when v_todos then (select jsonb_build_object('leads', leads, 'mensagens', mensagens) from saidas where autor = 0) end,
    'atendentes', coalesce((select jsonb_agg(to_jsonb(l) order by l.mensagens desc, l.nome) from linhas l
                             where l.mensagens + l.tarefas + l.ganhas + l.perdidas > 0 or not v_todos), '[]'),
    'sem_resposta_por_funil', coalesce((
      select jsonb_agg(jsonb_build_object('segmento', x.segmento, 'funil', x.funil, 'quantos', x.quantos) order by x.quantos desc)
        from (select l.segmento, case when l.segmento is null then l.funil end as funil, count(*) as quantos
                from resposta r left join public.kommo_leads l on l.tenant_id = v_tenant and l.lead_id = r.lead_id
               where r.respondeu is null group by 1, 2) x), '[]'),
    'para_responder', coalesce((select jsonb_agg(to_jsonb(p) order by p.desde) from para_responder p), '[]'),
    'campos_faltando', coalesce((select jsonb_agg(to_jsonb(f) order by f.fechou desc, f.nome) from faltando f
                                  where cardinality(f.faltam) > 0), '[]')
  ) into v;
  return v;
end;
$$;
