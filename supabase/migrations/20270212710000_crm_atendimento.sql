-- ATENDIMENTO DO CRM (projeto do Kommo, parte 4b, aprovada pelo dono em 2026-11-09,
-- https://claude.ai/artifact/XGuhzJXvTEze4kajUNcdvz): no Comercial, por atendente, quem escreveu pelo WhatsApp e pelo
-- Instagram, quem foi respondido por uma pessoa e em quanto tempo de expediente, o que virou venda, o que a Lyra fez
-- sozinha e as vendas com campo obrigatório vazio (CNPJ, telefone, valor da ganha, motivo da perdida).
--   * O `mkt-kommo-coletar` (modo semResposta, a cada 10 minutos) manda as mensagens novas, os leads mexidos, os
--     usuários e as tarefas concluídas. Mensagem com `autor` 0 é da Lyra (robô ou transmissão); outra, de uma pessoa.
--   * O Kommo só sabe da resposta dada pelo Kommo: quem respondeu pelo WhatsApp do celular aparece como sem resposta.
--   * Quem vê: dono, admin e gestor comercial (com_pode_gerir_carteiras) veem todas; quem tem os Indicadores do
--     Comercial vê só o que é dela (leads de que é responsável no Kommo ou que ela respondeu).
-- ponytail: a pessoa do Kommo se liga à do Helpoint pelo e-mail ou, sem ele, pelo primeiro nome quando só uma pessoa da
-- empresa o tem; outra ligação, por SQL em kommo_usuarios.user_id (o robô não a desfaz).

create table public.kommo_mensagens (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  evento_id text not null,
  lead_id bigint not null,
  quando timestamptz not null,
  entrou boolean not null,             -- true: o cliente escreveu; false: saiu pelo Kommo
  autor bigint not null default 0,     -- usuário do Kommo que mandou; 0 = Lyra
  canal text,
  primary key (tenant_id, evento_id)
);
create index kommo_mensagens_lead on public.kommo_mensagens (tenant_id, lead_id, quando);
create index kommo_mensagens_quando on public.kommo_mensagens (tenant_id, quando);

create table public.kommo_leads (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id bigint not null,
  nome text not null,
  segmento text check (segmento in ('sem_triagem', 'consumidor', 'salao', 'distribuidor')),
  funil text,                          -- o nome do funil no Kommo (ENAD, Educacional… quando não é de venda)
  etapa text,
  fechado boolean not null default false,
  responsavel bigint,
  link text not null,
  primary key (tenant_id, lead_id)
);

create table public.kommo_usuarios (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kommo_id bigint not null,
  nome text not null,
  user_id uuid references public.profiles(id) on delete set null,
  primary key (tenant_id, kommo_id)
);

create table public.kommo_tarefas_feitas (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tarefa_id bigint not null,
  responsavel bigint not null,
  feita_em timestamptz not null,
  primary key (tenant_id, tarefa_id)
);

-- Só o robô grava e só as funções abaixo leem: sem policy, o navegador não alcança as tabelas.
alter table public.kommo_mensagens enable row level security;
alter table public.kommo_leads enable row level security;
alter table public.kommo_usuarios enable row level security;
alter table public.kommo_tarefas_feitas enable row level security;
revoke all on public.kommo_mensagens, public.kommo_leads, public.kommo_usuarios, public.kommo_tarefas_feitas from public, anon, authenticated;

-- O responsável no Kommo de cada venda ganha ou perdida, para a linha de cada atendente.
alter table public.mkt_kommo_vendas add column responsavel bigint;

create or replace function public.mkt_kommo_gravar_vendas(p_tenant uuid, p_desde date, p_vendas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.mkt_kommo_vendas where tenant_id = p_tenant and fechou >= p_desde;
  insert into public.mkt_kommo_vendas (tenant_id, lead_id, nome, funil, situacao, valor, fechou, motivo, link, documento, telefone, responsavel)
  select p_tenant, v.lead_id, v.nome, v.funil, v.situacao, v.valor, v.fechou, v.motivo, v.link,
         nullif(regexp_replace(coalesce(v.documento, ''), '\D', '', 'g'), ''),
         nullif(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g'), ''),
         v.responsavel
    from jsonb_to_recordset(p_vendas) as v(lead_id bigint, nome text, funil text, situacao text, valor numeric, fechou date,
                                           motivo text, link text, documento text, telefone text, responsavel bigint)
   where v.fechou >= p_desde
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, funil = excluded.funil, situacao = excluded.situacao, valor = excluded.valor,
        fechou = excluded.fechou, motivo = excluded.motivo, link = excluded.link,
        documento = excluded.documento, telefone = excluded.telefone, responsavel = excluded.responsavel;
end;
$$;

-- p_mensagens: [{ id, lead_id, quando (segundos), entrou, autor, canal }]
-- p_leads:     [{ lead_id, nome, segmento, funil, etapa, fechado, responsavel, link }]
-- p_usuarios:  [{ kommo_id, nome, email }]   (o e-mail só liga a pessoa; não fica guardado)
-- p_tarefas:   [{ id, responsavel, feita_em (segundos) }]
-- Guarda 120 dias de mensagens e tarefas.
create function public.kommo_gravar_atendimento(p_tenant uuid, p_mensagens jsonb, p_leads jsonb, p_usuarios jsonb, p_tarefas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_novas integer;
begin
  insert into public.kommo_mensagens (tenant_id, evento_id, lead_id, quando, entrou, autor, canal)
  select p_tenant, m.id, m.lead_id, to_timestamp(m.quando), m.entrou, coalesce(m.autor, 0), m.canal
    from jsonb_to_recordset(coalesce(p_mensagens, '[]')) as m(id text, lead_id bigint, quando bigint, entrou boolean, autor bigint, canal text)
  on conflict do nothing;
  get diagnostics v_novas = row_count;

  insert into public.kommo_leads (tenant_id, lead_id, nome, segmento, funil, etapa, fechado, responsavel, link)
  select p_tenant, l.lead_id, l.nome, l.segmento, l.funil, l.etapa, coalesce(l.fechado, false), l.responsavel, l.link
    from jsonb_to_recordset(coalesce(p_leads, '[]')) as l(lead_id bigint, nome text, segmento text, funil text, etapa text,
                                                           fechado boolean, responsavel bigint, link text)
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, segmento = excluded.segmento, funil = excluded.funil, etapa = excluded.etapa,
        fechado = excluded.fechado, responsavel = excluded.responsavel, link = excluded.link;

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
revoke all on function public.kommo_gravar_atendimento(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.kommo_gravar_atendimento(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

-- A tela inteira, de p_de a p_ate (dias do Brasil). A 1ª resposta de cada lead é a primeira mensagem de uma pessoa
-- depois da primeira que o cliente mandou no período, em minutos de expediente (o relógio dos chamados).
create function public.crm_atendimento(p_de date, p_ate date)
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
  msg as (select * from public.kommo_mensagens m where m.tenant_id = v_tenant and m.quando >= least(v_de, now() - interval '30 days')),
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
  -- Por pessoa do Kommo (a Lyra é 0): as mensagens que saíram no período e os leads delas.
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
  -- "Desde" é a primeira mensagem dele nessa espera. Só os últimos 30 dias.
  espera as (
    select m.lead_id, min(m.quando) as desde
      from msg m
      left join (select h.lead_id, max(h.quando) as em from public.kommo_mensagens h
                  where h.tenant_id = v_tenant and not h.entrou and h.autor <> 0 group by h.lead_id) h on h.lead_id = m.lead_id
     where m.entrou and m.quando > coalesce(h.em, '-infinity') and m.quando >= now() - interval '30 days'
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
    'lyra', case when v_todos then (select jsonb_build_object('leads', leads, 'mensagens', mensagens) from saidas where autor = 0) end,
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
revoke all on function public.crm_atendimento(date, date) from public, anon;
grant execute on function public.crm_atendimento(date, date) to authenticated;
