-- COMISSÃO CONFIGURÁVEL E "POSSÍVEL × REAL" (dono, 2026-11-12).
--   * As porcentagens saem do código e vão para `com_comissao_percentuais`, editadas em Configurações do Comercial ›
--     Comissão (aba nova `comissao`, liberada no perfil de acesso como as outras). Cada % tem um "vale a partir de"
--     (o mês): mudar o % não reescreve os meses que já passaram.
--   * O número grande do cartão passa a ser a COMISSÃO POSSÍVEL (o % sobre toda a venda, lançada e faturada) e o de
--     baixo a REAL (só o faturado; na carteira, só com a meta do mês batida). Na carteira, a possível só existe nos
--     meses que têm meta (mês sem meta nunca paga). A condição continua contando como hoje (decisão do dono).
--   * Colunas de `com_comissao` mantidas: `garantida` = real; `a_confirmar` = possível − real.

-- 1) As porcentagens, em % (0,5 = 0,5%).
create table public.com_comissao_percentuais (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('carteira', 'crm')),
  -- Carteira: o nome dela. CRM: o segmento do funil do Kommo.
  origem text not null check (tipo = 'carteira' or origem in ('consumidor', 'salao', 'distribuidor')),
  percentual numeric(6, 3) not null check (percentual >= 0 and percentual <= 100),
  vale_de date not null check (extract(day from vale_de) = 1),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, tipo, origem, vale_de)
);
create trigger inject_tenant_id_com_comissao_percentuais before insert on public.com_comissao_percentuais
  for each row execute function public.inject_tenant_id();
alter table public.com_comissao_percentuais enable row level security;

create policy com_comissao_percentuais_select on public.com_comissao_percentuais for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.has_comercial_access(auth.uid())) or (select public.has_diretoria_access(auth.uid()))));
create policy com_comissao_percentuais_altera on public.com_comissao_percentuais for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'comissao'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'comissao'));

-- As regras de hoje (docs/regra-comissao.md), valendo desde o começo de 2026.
insert into public.com_comissao_percentuais (tenant_id, tipo, origem, percentual, vale_de)
select t.id, x.tipo, x.origem, x.percentual, date '2026-01-01'
  from public.tenants t
 cross join (values ('carteira', 'ESPECIAL', 0.5), ('carteira', 'DEMAIS ESTADOS', 0.5),
                    ('crm', 'consumidor', 10), ('crm', 'salao', 10), ('crm', 'distribuidor', 5)) x(tipo, origem, percentual)
on conflict do nothing;

-- 2) A aba nova no perfil de acesso (espelho de src/config/abas-de-configuracao.ts).
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['empresas', 'departamentos', 'folha', 'feriados', 'holerites']
    when 'marketing'   then array['chamados', 'beneficio']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto', 'comprador']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias', 'diretrizes', 'comissao']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;

-- 3) O % que vale num mês (fração: 0,5% → 0,005). Sem linha, zero: sem comissão.
create function public.com_percentual_da_comissao(p_tenant uuid, p_tipo text, p_origem text, p_mes date)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select coalesce((select p.percentual / 100 from public.com_comissao_percentuais p
                    where p.tenant_id = p_tenant and p.tipo = p_tipo and p.origem = p_origem
                      and p.vale_de <= date_trunc('month', p_mes)::date
                    order by p.vale_de desc limit 1), 0);
$$;
revoke all on function public.com_percentual_da_comissao(uuid, text, text, date) from public, anon;
grant execute on function public.com_percentual_da_comissao(uuid, text, text, date) to authenticated;

-- 4) A comissão, possível × real, mês a mês.
create or replace function public.com_comissao(p_de date, p_ate date)
returns table(pessoa_id uuid, pessoa_nome text, tipo text, origem text, percentual numeric, base_garantida numeric,
              base_a_confirmar numeric, meta numeric, falta numeric, garantida numeric, a_confirmar numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_todos boolean := public.com_pode_gerir_carteiras();
begin
  if v_tenant is null or not (v_todos or public.pode_no_setor('comercial', 'reports', 'view')) then
    raise exception 'sem acesso à comissão' using errcode = '42501';
  end if;

  return query
  with
  -- As carteiras que têm (ou já tiveram) comissão configurada.
  carteiras as (
    select distinct p.origem as carteira from public.com_comissao_percentuais p
     where p.tenant_id = v_tenant and p.tipo = 'carteira'
  ),
  donos as (
    select distinct on (m.carteira) m.carteira, m.user_id, p.full_name
      from public.com_carteira_membros m join public.profiles p on p.id = m.user_id
     where m.tenant_id = v_tenant and m.carteira in (select carteira from carteiras)
     order by m.carteira, m.responsavel desc nulls last, m.created_at
  ),
  -- Os meses que o período toca, cada um recortado pelo período.
  meses as (
    select m::date as mes, greatest(p_de, m::date) as de, least(p_ate, (m + interval '1 month - 1 day')::date) as ate
      from generate_series(date_trunc('month', p_de), date_trunc('month', p_ate), interval '1 month') m
  ),
  por_mes as (
    select c.carteira, ms.mes, v.venda_total, v.a_confirmar as previa,
           coalesce(v.venda_total, 0) - coalesce(v.a_confirmar, 0) as com_nota, mt.meta,
           public.com_percentual_da_comissao(v_tenant, 'carteira', c.carteira, ms.mes) as pct
      from carteiras c
     cross join meses ms
     cross join lateral public.com_composicao_da_venda(ms.de, ms.ate, c.carteira, null, null) v
      left join lateral (
        select sum(cm.valor) as meta from public.com_metas cm
         where cm.tenant_id = v_tenant and cm.carteira = c.carteira and make_date(cm.ano, cm.mes, 1) = ms.mes
      ) mt on true
  ),
  calculado as (
    select pm.*,
           case when pm.meta > 0 and pm.com_nota >= pm.meta then round(pm.com_nota * pm.pct, 2) else 0 end as real,
           case when pm.meta > 0 then round(coalesce(pm.venda_total, 0) * pm.pct, 2) else 0 end as possivel,
           case when pm.meta > 0 then greatest(pm.meta - coalesce(pm.venda_total, 0), 0) end as falta_mes
      from por_mes pm
  ),
  da_carteira as (
    select d.user_id, d.full_name, 'carteira'::text as tipo, c.carteira as origem,
           (select k.pct from calculado k where k.carteira = c.carteira order by k.mes desc limit 1) as percentual,
           coalesce(sum(k.com_nota), 0) as base_garantida, coalesce(sum(coalesce(k.previa, 0)), 0) as base_a_confirmar,
           sum(k.meta) as meta,
           case when count(k.mes) = 1 then max(k.falta_mes) end as falta,
           coalesce(sum(k.real), 0) as garantida,
           coalesce(sum(greatest(k.possivel - k.real, 0)), 0) as a_confirmar
      from carteiras c
      join donos d on d.carteira = c.carteira
      left join calculado k on k.carteira = c.carteira
     group by d.user_id, d.full_name, c.carteira
  ),
  -- CRM: as vendas ganhas no Kommo no período, fora as da equipe; o % é o do mês do fechamento.
  ganhas as (
    select v.lead_id, v.funil, coalesce(v.valor, 0) as valor, v.fechou, v.documento, u.user_id, u.nome,
           public.com_percentual_da_comissao(v_tenant, 'crm', v.funil, v.fechou) as pct
      from public.mkt_kommo_vendas v
      join public.kommo_usuarios u on u.tenant_id = v.tenant_id and u.kommo_id = v.responsavel and u.user_id is not null
     where v.tenant_id = v_tenant and v.situacao = 'ganha' and v.fechou between p_de and p_ate
       and not exists (select 1 from public.kommo_leads l where l.tenant_id = v_tenant and l.lead_id = v.lead_id and l.interno)
  ),
  -- Distribuidor novo: o cliente do CNPJ não tinha nota de venda antes da janela do 1º pedido (15 dias antes do
  -- fechamento); o 1º pedido é a nota (ou as notas do mesmo dia) mais antiga da janela.
  distribuidor as (
    select g.lead_id, g.user_id, g.nome, g.valor as valor_kommo, g.pct,
           (select sum(i.valor_nota) from public.com_vendas_itens i
             where i.tenant_id = v_tenant and i.cliente_codigo = c.codigo and i.classe = 'venda'
               and i.emissao = (select min(j.emissao) from public.com_vendas_itens j
                                 where j.tenant_id = v_tenant and j.cliente_codigo = c.codigo and j.classe = 'venda'
                                   and j.emissao between g.fechou - 15 and g.fechou + 7)) as primeira_nota,
           not exists (select 1 from public.com_vendas_itens k
                        where k.tenant_id = v_tenant and k.cliente_codigo = c.codigo and k.classe = 'venda'
                          and k.emissao < g.fechou - 15) as novo
      from ganhas g
      left join public.com_clientes c on c.tenant_id = v_tenant and g.documento is not null
                                     and regexp_replace(coalesce(c.documento, ''), '\D', '', 'g') = g.documento
     where g.funil = 'distribuidor'
  ),
  -- Uma linha por venda: a base com nota e a base sem nota, já com o % do mês dela.
  do_crm_por_venda as (
    -- Consumidor final e salão: sem a nota da loja no Helpoint, tudo é previsão pelo valor do Kommo.
    select g.user_id, g.nome, case g.funil when 'consumidor' then 'Consumidor final' else 'Salão' end as origem,
           g.pct, 0::numeric as base_g, g.valor as base_ac
      from ganhas g where g.funil in ('consumidor', 'salao')
    union all
    select d.user_id, d.nome, 'Novo distribuidor', d.pct,
           coalesce(d.primeira_nota, 0), case when d.primeira_nota is null then d.valor_kommo else 0 end
      from distribuidor d where d.novo
  ),
  do_crm as (
    select x.user_id, x.nome, 'crm'::text as tipo, x.origem, max(x.pct) as percentual,
           sum(x.base_g) as base_garantida, sum(x.base_ac) as base_a_confirmar,
           sum(round(x.base_g * x.pct, 2)) as garantida, sum(round(x.base_ac * x.pct, 2)) as a_confirmar
      from do_crm_por_venda x
     group by x.user_id, x.nome, x.origem
  )
  select x.user_id, x.full_name, x.tipo, x.origem, x.percentual, x.base_garantida, x.base_a_confirmar, x.meta, x.falta,
         x.garantida, x.a_confirmar
    from da_carteira x
   where v_todos or x.user_id = auth.uid()
  union all
  select c.user_id, c.nome, c.tipo, c.origem, c.percentual, c.base_garantida, c.base_a_confirmar, null::numeric, null::numeric,
         c.garantida, c.a_confirmar
    from do_crm c
   where v_todos or c.user_id = auth.uid();
end;
$function$;
