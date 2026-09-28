-- O acompanhamento por carteira e o grupo de cliente (LEVA O, parte 2)
--
-- As abas "VIP - Fenício", "MG - Júlia" e "Outros Estados - Jaqueline" da planilha de Gestão
-- Comercial (manual §8), dentro do sistema — com as duas decisões do dono de 2026-09-28:
--
-- 1. SEM META POR CLIENTE. "A meta é definida diretamente pelo diretor … a meta de cada
--    carteira." O cabeçalho da carteira compara a meta da Diretoria (`com_metas`) com a venda
--    lançada; as linhas de cliente não têm meta individual. (A planilha tinha uma fórmula de
--    meta automática — que, medido, nem funcionava: usa `FILTER`, dá erro e cai num plano B.)
--
-- 2. O GRUPO DE CLIENTE ("cliente de acompanhamento"). A linha da carteira na planilha não é um
--    código do Forteplus: é o grupo que junta os códigos do mesmo dono. Medido na Base: 405
--    clientes em 399 grupos, só 5 grupos com mais de um código (o maior, CLARA & BELLA, com 3).
--    Sem o grupo, a CLARA & BELLA vira três linhas pequenas, e quando ela compra por um CNPJ num
--    mês e por outro no seguinte parece que dois clientes pararam e um apareceu.
--
-- DE ONDE VEM CADA NÚMERO — as duas fontes, cada uma no seu lugar:
--   * o MÊS (venda, contatos, último contato, prazo) vem do LANÇAMENTO das vendedoras — a fonte
--     que o dono escolheu na leva 1;
--   * o HISTÓRICO (faturado dos 12 meses anteriores, meses com compra, recompra) vem do
--     faturado do Forteplus, porque é o único histórico que existe. Medido: o histórico da
--     planilha não é o faturado (ARILMA tem 18 mil, 23 mil, 12 mil por mês na planilha; 1,7 mil,
--     4,9 mil, nada, 2 mil, 25 mil, 99 mil no Forteplus) e ninguém sabe de onde ele veio.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O grupo
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.com_clientes add column if not exists grupo text;

comment on column public.com_clientes.grupo is
  'Cliente de acompanhamento: o nome que junta códigos do mesmo dono (vários CNPJs). Nulo = o '
  'cliente é o próprio grupo. O acompanhamento por carteira mostra uma linha por grupo.';

-- A chave do grupo: o nome normalizado quando existe; o próprio código quando não. O prefixo
-- impede que um cliente de código "MG" colida com um grupo chamado "MG".
create or replace function public.com_chave_do_grupo(p_grupo text, p_codigo text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when nullif(btrim(p_grupo), '') is null then 'C:' || p_codigo
    else 'G:' || public.normalizar_nome_carteira(p_grupo)
  end;
$$;

revoke all on function public.com_chave_do_grupo(text, text) from public, anon;
grant execute on function public.com_chave_do_grupo(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Quem pode ver uma carteira
-- ─────────────────────────────────────────────────────────────────────────────
-- A vendedora vê a DELA; quem gere carteiras e a Diretoria veem todas. As leituras abaixo são
-- `security definer` com esta porta explícita, e não `security invoker`, por um motivo medido:
-- pelo RLS, a vendedora só lê os PRÓPRIOS lançamentos. Um lançamento que a colega fez para um
-- cliente desta carteira (pelo escape "fora da minha carteira") sumiria da conta da carteira
-- que ela está olhando — e o total da carteira dela ficaria menor do que é. Aqui a porta é a
-- carteira, e dentro dela o número é o inteiro.
create or replace function public.com_pode_ver_carteira(p_carteira text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.com_pode_gerir_carteiras()
      or public.has_diretoria_access(auth.uid())
      or public.normalizar_nome_carteira(p_carteira) = any (coalesce(public.com_minhas_carteiras(), array[]::text[]));
$$;

revoke all on function public.com_pode_ver_carteira(text) from public, anon;
grant execute on function public.com_pode_ver_carteira(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As linhas da carteira — uma por grupo (manual §8.2)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.com_acompanhamento_da_carteira(p_carteira text, p_competencia date)
returns table (
  grupo_chave text, grupo_nome text, codigos text[], tabelas text, uf_cidade text,
  situacao text, ultima_compra date, dias_sem_comprar int,
  faturado_12m numeric, meses_com_compra int, media_meses_compra numeric, recompra boolean,
  venda_mes numeric, contatos_mes int, ultimo_contato date, status_ultimo_contato text,
  proximo_prazo date, observacao text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := public.normalizar_nome_carteira(p_carteira);
  v_de date := date_trunc('month', p_competencia)::date;
  v_ate date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  -- "Hoje" do Brasil, ou o fim do mês se ele já passou — como no painel (lição 10).
  v_ref date := least((now() at time zone 'America/Sao_Paulo')::date, (v_ate - 1));
begin
  if v_tenant is null or not public.com_pode_ver_carteira(p_carteira) then
    raise exception 'Você não tem acesso a esta carteira.' using errcode = '42501';
  end if;

  return query
  with clientes as (
    select c.codigo, c.razao_social, c.tabela_preco, c.cidade, c.estado,
           public.com_chave_do_grupo(c.grupo, c.codigo) as chave,
           coalesce(nullif(btrim(c.grupo), ''), c.razao_social) as nome
      from public.com_clientes c
     where c.tenant_id = v_tenant and c.carteira = v_carteira
  ),
  -- Histórico do Forteplus: vendas (não bonificação) dos 12 meses ANTERIORES à competência.
  historico as (
    select cl.chave,
           sum(vi.valor_nota) as faturado,
           count(distinct vi.competencia)::int as meses
      from clientes cl
      join public.com_vendas_itens vi
        on vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
     where vi.classe = 'venda' and vi.valor_nota > 0
       and vi.competencia >= (v_de - interval '12 months')::date and vi.competencia < v_de
     group by cl.chave
  ),
  -- Última compra consolidada (§10): o faturado e a venda lançada e concluída, a mais recente.
  ultima as (
    select cl.chave,
           greatest(
             (select max(vi.emissao) from public.com_vendas_itens vi
               where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                 and vi.classe = 'venda' and vi.valor_nota > 0 and vi.emissao <= v_ref),
             (select max(i.data) from public.com_interacoes i
               where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
                 and i.status = 'concluido' and i.valor_venda > 0 and i.data <= v_ref)
           ) as data
      from clientes cl
  ),
  ultima_grupo as (
    select u.chave, max(u.data) as data from ultima u group by u.chave
  ),
  -- O mês, dos lançamentos de QUALQUER vendedora para os clientes desta carteira.
  mes as (
    select cl.chave, i.*
      from clientes cl
      join public.com_interacoes i on i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
     where i.data >= v_de and i.data < v_ate
  ),
  mes_grupo as (
    select m.chave,
           sum(m.valor_venda) filter (where m.status = 'concluido' and m.valor_venda > 0) as venda,
           count(*)::int as contatos
      from mes m group by m.chave
  ),
  -- O último contato do mês, com o status, o prazo e a observação dele (§8.2, colunas Q–U).
  ultimo as (
    select distinct on (m.chave) m.chave, m.data, m.status, m.prazo, m.observacoes
      from mes m
     order by m.chave, m.data desc, m.created_at desc
  )
  select g.chave,
         min(g.nome),
         array_agg(g.codigo order by g.codigo),
         string_agg(distinct g.tabela_preco, ', '),
         string_agg(distinct nullif(concat_ws(' - ', g.estado, g.cidade), ''), '; '),
         case
           when ug.data is null then 'nunca_comprou'
           when v_ref - ug.data <= 120 then 'ativo'
           else 'inativo'
         end,
         ug.data,
         (v_ref - ug.data)::int,
         coalesce(h.faturado, 0),
         coalesce(h.meses, 0),
         case when coalesce(h.meses, 0) > 0 then round(h.faturado / h.meses, 2) end,
         coalesce(h.meses, 0) >= 2,
         coalesce(mg.venda, 0),
         coalesce(mg.contatos, 0),
         ul.data,
         ul.status,
         ul.prazo,
         ul.observacoes
    from clientes g
    left join historico h on h.chave = g.chave
    left join ultima_grupo ug on ug.chave = g.chave
    left join mes_grupo mg on mg.chave = g.chave
    left join ultimo ul on ul.chave = g.chave
   group by g.chave, ug.data, h.faturado, h.meses, mg.venda, mg.contatos, ul.data, ul.status, ul.prazo, ul.observacoes
   order by coalesce(h.faturado, 0) desc, min(g.nome);
end;
$$;

revoke all on function public.com_acompanhamento_da_carteira(text, date) from public, anon;
grant execute on function public.com_acompanhamento_da_carteira(text, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O cabeçalho da carteira — meta da Diretoria × venda lançada, mês a mês (§8.1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Os 12 meses do ano da competência. A tela tira dali o mês escolhido (meta, venda, diferença,
-- cobertura) e a linha do ano. A meta é a da Diretoria (`com_metas`), comparada pelo nome
-- normalizado; a venda é a lançada e concluída para os clientes da carteira, por qualquer
-- vendedora.
-- A cor vem pronta, da mesma `com_cor_do_farol` do painel: uma régua só para "na meta",
-- "atenção" e "abaixo". A tela não recalcula.
create or replace function public.com_carteira_mes_a_mes(p_carteira text, p_ano int)
returns table (mes int, meta numeric, venda numeric, cor text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := public.normalizar_nome_carteira(p_carteira);
begin
  if v_tenant is null or not public.com_pode_ver_carteira(p_carteira) then
    raise exception 'Você não tem acesso a esta carteira.' using errcode = '42501';
  end if;

  return query
  with base as (
    select m.mes as m_mes,
           (select cm.valor from public.com_metas cm
             where cm.tenant_id = v_tenant and cm.ano = p_ano and cm.mes = m.mes
               and cm.carteira is not null
               and public.normalizar_nome_carteira(cm.carteira) = v_carteira
             limit 1) as m_meta,
           coalesce((select sum(i.valor_venda)
                       from public.com_interacoes i
                       join public.com_clientes c
                         on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
                      where i.tenant_id = v_tenant and c.carteira = v_carteira
                        and i.status = 'concluido' and i.valor_venda > 0
                        and extract(year from i.data)::int = p_ano
                        and extract(month from i.data)::int = m.mes), 0) as m_venda
      from generate_series(1, 12) as m(mes)
  )
  select b.m_mes, b.m_meta, b.m_venda, public.com_cor_do_farol(b.m_venda, b.m_meta)
    from base b
   order by b.m_mes;
end;
$$;

revoke all on function public.com_carteira_mes_a_mes(text, int) from public, anon;
grant execute on function public.com_carteira_mes_a_mes(text, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Confere no próprio banco
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_aberta text;
begin
  select string_agg(p.proname, ', ') into v_aberta
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and p.proname in ('com_chave_do_grupo', 'com_pode_ver_carteira',
                       'com_acompanhamento_da_carteira', 'com_carteira_mes_a_mes')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_aberta is not null then
    raise exception 'funções abertas para anon: %', v_aberta;
  end if;
end $$;
