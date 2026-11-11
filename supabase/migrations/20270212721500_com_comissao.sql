-- A COMISSÃO DO COMERCIAL (dono, 2026-11-12; especificação em docs/regra-comissao.md).
--   * Paga só sobre o faturado (nota emitida). "Garantida" = com nota; "A confirmar" = lançado ou vendido sem nota.
--   * Carteiras ESPECIAL e DEMAIS ESTADOS: 0,5% sobre toda a venda do mês, só se a carteira bater 100% da meta (tudo
--     ou nada). BERÇÁRIO e ARTISTAS: sem comissão.
--   * Atendimento do CRM, por segmento: consumidor final e salão 10% da venda com nota (a nota da loja ainda não chega
--     ao Helpoint: até o Bling, só "a confirmar", pelo valor ganho no Kommo); novo distribuidor 5% do 1º pedido
--     faturado de um CNPJ que nunca comprou (a nota do Forteplus casada pelo CNPJ, como em mkt_kommo_faturado).
--   * O mês fecha no último dia do mês; a venda conta no mês da nota.
-- ponytail: as porcentagens e as carteiras moram aqui, numa função, e não numa tabela de regras. Mudou a regra, muda
-- esta migration (e docs/regra-comissao.md). Saída: uma tabela de regras quando o dono quiser editar pela tela.

-- A regra da carteira, isolada para o teste: tudo ou nada sobre a venda do mês.
create function public.com_comissao_da_carteira(p_venda numeric, p_a_confirmar numeric, p_meta numeric)
returns table (garantida numeric, a_confirmar numeric, falta numeric)
language sql immutable as $$
  with b as (
    select coalesce(p_venda, 0) as venda, coalesce(p_venda, 0) - coalesce(p_a_confirmar, 0) as com_nota, coalesce(p_meta, 0) as meta
  )
  select case when b.meta > 0 and b.com_nota >= b.meta then round(b.com_nota * 0.005, 2) else 0 end,
         -- O que ainda pode entrar: se a venda com a prévia bate a meta, a comissão prevista menos a já garantida.
         greatest(case when b.meta > 0 and b.venda >= b.meta then round(b.venda * 0.005, 2) else 0 end
                  - case when b.meta > 0 and b.com_nota >= b.meta then round(b.com_nota * 0.005, 2) else 0 end, 0),
         case when b.meta > 0 then greatest(b.meta - b.venda, 0) end
    from b;
$$;
revoke all on function public.com_comissao_da_carteira(numeric, numeric, numeric) from public, anon;
grant execute on function public.com_comissao_da_carteira(numeric, numeric, numeric) to authenticated;

-- Uma linha por pessoa e origem (carteira ou segmento do CRM). Quem gere as carteiras vê todos; os outros, só a sua.
create function public.com_comissao(p_de date, p_ate date)
returns table (pessoa_id uuid, pessoa_nome text, tipo text, origem text, percentual numeric, base_garantida numeric,
               base_a_confirmar numeric, meta numeric, falta numeric, garantida numeric, a_confirmar numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_todos boolean := public.com_pode_gerir_carteiras();
begin
  if v_tenant is null or not (v_todos or public.pode_no_setor('comercial', 'reports', 'view')) then
    raise exception 'sem acesso à comissão' using errcode = '42501';
  end if;

  return query
  with
  carteiras(carteira) as (values ('ESPECIAL'), ('DEMAIS ESTADOS')),
  donos as (
    select distinct on (m.carteira) m.carteira, m.user_id, p.full_name
      from public.com_carteira_membros m join public.profiles p on p.id = m.user_id
     where m.tenant_id = v_tenant and m.carteira in (select carteira from carteiras)
     order by m.carteira, m.responsavel desc nulls last, m.created_at
  ),
  metas as (
    select c.carteira, sum(cm.valor) as meta
      from carteiras c join public.com_metas cm on cm.tenant_id = v_tenant and cm.carteira = c.carteira
     where make_date(cm.ano, cm.mes, 1) between date_trunc('month', p_de)::date and p_ate
     group by c.carteira
  ),
  vendas as (
    select c.carteira, v.venda_total, v.a_confirmar
      from carteiras c cross join lateral public.com_composicao_da_venda(p_de, p_ate, c.carteira, null, null) v
  ),
  da_carteira as (
    select d.user_id, d.full_name, 'carteira'::text as tipo, c.carteira as origem, 0.005::numeric as percentual,
           coalesce(v.venda_total, 0) - coalesce(v.a_confirmar, 0) as base_garantida, coalesce(v.a_confirmar, 0) as base_a_confirmar,
           mt.meta, r.falta, r.garantida, r.a_confirmar
      from carteiras c
      join donos d on d.carteira = c.carteira
      left join vendas v on v.carteira = c.carteira
      left join metas mt on mt.carteira = c.carteira
      cross join lateral public.com_comissao_da_carteira(v.venda_total, v.a_confirmar, mt.meta) r
  ),
  -- CRM: as vendas ganhas no Kommo no período, fora as da equipe (etiqueta "Equipe interna" e afins).
  ganhas as (
    select v.lead_id, v.funil, coalesce(v.valor, 0) as valor, v.fechou, v.documento, u.user_id, u.nome
      from public.mkt_kommo_vendas v
      join public.kommo_usuarios u on u.tenant_id = v.tenant_id and u.kommo_id = v.responsavel and u.user_id is not null
     where v.tenant_id = v_tenant and v.situacao = 'ganha' and v.fechou between p_de and p_ate
       and not exists (select 1 from public.kommo_leads l where l.tenant_id = v_tenant and l.lead_id = v.lead_id and l.interno)
  ),
  -- Distribuidor novo: o cliente do CNPJ não tinha nota de venda antes da janela do 1º pedido (15 dias antes do
  -- fechamento); o 1º pedido é a nota (ou as notas do mesmo dia) mais antiga da janela.
  distribuidor as (
    select g.lead_id, g.user_id, g.nome, g.valor as valor_kommo,
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
  do_crm as (
    -- Consumidor final e salão: sem a nota da loja no Helpoint, tudo é "a confirmar" pelo valor do Kommo.
    select g.user_id, g.nome, 'crm'::text as tipo,
           case g.funil when 'consumidor' then 'Consumidor final' else 'Salão' end as origem, 0.10::numeric as percentual,
           0::numeric as base_garantida, sum(g.valor) as base_a_confirmar
      from ganhas g where g.funil in ('consumidor', 'salao')
     group by g.user_id, g.nome, g.funil
    union all
    select d.user_id, d.nome, 'crm', 'Novo distribuidor', 0.05,
           coalesce(sum(d.primeira_nota) filter (where d.primeira_nota is not null), 0),
           coalesce(sum(d.valor_kommo) filter (where d.primeira_nota is null), 0)
      from distribuidor d where d.novo
     group by d.user_id, d.nome
  )
  select x.user_id, x.full_name, x.tipo, x.origem, x.percentual, x.base_garantida, x.base_a_confirmar, x.meta, x.falta,
         x.garantida, x.a_confirmar
    from da_carteira x
   where v_todos or x.user_id = auth.uid()
  union all
  select c.user_id, c.nome, c.tipo, c.origem, c.percentual, c.base_garantida, c.base_a_confirmar, null::numeric, null::numeric,
         round(c.base_garantida * c.percentual, 2), round(c.base_a_confirmar * c.percentual, 2)
    from do_crm c
   where v_todos or c.user_id = auth.uid();
end;
$$;
revoke all on function public.com_comissao(date, date) from public, anon;
grant execute on function public.com_comissao(date, date) to authenticated;
