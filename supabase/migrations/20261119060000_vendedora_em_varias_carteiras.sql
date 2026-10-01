-- A VENDEDORA EM UMA, DUAS OU MAIS CARTEIRAS. 2026-10-01.
--
-- Antes: `com_carteira_membros` tinha UNIQUE (tenant_id, user_id) — cada pessoa numa carteira só.
-- O dono: "o ideal é que eu consiga atrelar o mesmo vendedor em uma, duas ou até mais carteiras".
-- Decisões dele (múltipla escolha, 2026-10-01):
--   * no Painel do gestor, UMA LINHA POR PESSOA, com as carteiras dela listadas e os números
--     somando tudo o que é dela;
--   * ao trazer cliente do Histórico, a vendedora com mais de uma carteira ESCOLHE para qual (tela).
--
-- O que já aguentava N carteiras e não muda: `com_minhas_carteiras()` (devolve text[] e todo
-- chamador usa `= any`), o RLS de clientes, vendas e lançamentos, `com_atribuir_carteira_em_lote`,
-- o "um responsável por carteira" (índice parcial — uma pessoa pode responder por várias).

-- ── 1. A trava: uma linha por (pessoa, carteira), não por pessoa ────────────────────────────────
alter table public.com_carteira_membros drop constraint if exists com_carteira_membros_tenant_id_user_id_key;
alter table public.com_carteira_membros
  add constraint com_carteira_membros_pessoa_e_carteira unique (tenant_id, user_id, carteira);

-- ── 2. Quem aparece no painel: uma linha por PESSOA ─────────────────────────────────────────────
-- `carteira` passa a ser a lista das carteiras dela ("ESPECIAL, MG"). O painel e o farol agregam
-- por vendedor_id, então com uma linha por pessoa nada se conta duas vezes.
create or replace function public.com_vendedoras_do_painel(p_competencia date)
returns table (vendedor_id uuid, vendedor_nome text, carteira text)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with pessoas as (
    select m.user_id, m.carteira from public.com_carteira_membros m
     where m.tenant_id = public.get_user_tenant_id()
    union
    select i.vendedor_id, null from public.com_interacoes i
     where i.data >= p_competencia and i.data < (p_competencia + interval '1 month')::date
       and not exists (select 1 from public.com_carteira_membros m2
                        where m2.user_id = i.vendedor_id and m2.tenant_id = i.tenant_id)
  )
  select p.user_id, coalesce(nullif(btrim(pr.full_name), ''), pr.email),
         string_agg(distinct p.carteira, ', ' order by p.carteira)
    from pessoas p
    join public.profiles pr on pr.id = p.user_id
   where p.user_id = auth.uid()
      or public.com_pode_gerir_carteiras()
      or public.has_diretoria_access(auth.uid())
   group by p.user_id, pr.full_name, pr.email;
$$;

-- ── 3. O resumo da carteira: os clientes de TODAS as carteiras da pessoa ────────────────────────
-- Antes comparava `s.carteira = vd.carteira`; com a lista ("ESPECIAL, MG") isso não casaria nada.
-- Agora a base da pessoa é a união das carteiras dela. Corpo igual ao de 20261113010000, com
-- `carteiras_de` no lugar da comparação.
create or replace function public.com_resumo_da_carteira(p_competencia date)
returns table (
  vendedor_id uuid, vendedor_nome text, carteira text,
  total_carteira bigint, ativos bigint, inativos bigint, nunca_compraram bigint,
  relacionados bigint, compradores bigint, relacionados_sem_compra bigint, valor_vendido numeric,
  compradores_ativos bigint, vendas_ativos numeric, ticket_ativos numeric,
  compradores_inativos bigint, vendas_inativos numeric, ticket_inativos numeric,
  media_base_ativa numeric
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with janela as (
    select date_trunc('month', p_competencia)::date as de,
           (date_trunc('month', p_competencia) + interval '1 month')::date as ate,
           least((now() at time zone 'America/Sao_Paulo')::date,
                 (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date) as ref
  ),
  situacao_agora as (
    select * from public.com_situacao_120_dias((select ref from janela))
  ),
  situacao_antes as (
    select * from public.com_situacao_120_dias((select de - 1 from janela))
  ),
  vend as (select * from public.com_vendedoras_do_painel(p_competencia)),
  carteiras_de as (
    select m.user_id, m.carteira from public.com_carteira_membros m
     where m.tenant_id = public.get_user_tenant_id()
  ),
  base as (
    select cd.user_id, s.* from carteiras_de cd join situacao_agora s on s.carteira = cd.carteira
  ),
  mes as (
    select i.* from public.com_interacoes i, janela
     where i.data >= janela.de and i.data < janela.ate and i.cliente_codigo is not null
  ),
  venda as (
    select m.vendedor_id, m.cliente_codigo, sum(m.valor_venda) as valor
      from mes m where m.status = 'concluido' and m.valor_venda > 0
     group by m.vendedor_id, m.cliente_codigo
  ),
  venda_classificada as (
    select v.*, coalesce(sa.situacao = 'ativo', false) as era_ativo
      from venda v left join situacao_antes sa on sa.cliente_codigo = v.cliente_codigo
  )
  select vd.vendedor_id, vd.vendedor_nome, vd.carteira,
         (select count(*) from base b where b.user_id = vd.vendedor_id),
         (select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'ativo'),
         (select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'inativo'),
         (select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'nunca_comprou'),
         (select count(distinct m.cliente_codigo) from mes m where m.vendedor_id = vd.vendedor_id),
         (select count(*) from venda_classificada c where c.vendedor_id = vd.vendedor_id),
         (select count(distinct m.cliente_codigo) from mes m
           where m.vendedor_id = vd.vendedor_id
             and not exists (select 1 from venda v where v.vendedor_id = vd.vendedor_id and v.cliente_codigo = m.cliente_codigo)),
         coalesce((select sum(c.valor) from venda_classificada c where c.vendedor_id = vd.vendedor_id), 0),
         (select count(*) from venda_classificada c where c.vendedor_id = vd.vendedor_id and c.era_ativo),
         coalesce((select sum(c.valor) from venda_classificada c where c.vendedor_id = vd.vendedor_id and c.era_ativo), 0),
         (select round(sum(c.valor) / nullif(count(*), 0), 2) from venda_classificada c
           where c.vendedor_id = vd.vendedor_id and c.era_ativo),
         (select count(*) from venda_classificada c where c.vendedor_id = vd.vendedor_id and not c.era_ativo),
         coalesce((select sum(c.valor) from venda_classificada c where c.vendedor_id = vd.vendedor_id and not c.era_ativo), 0),
         (select round(sum(c.valor) / nullif(count(*), 0), 2) from venda_classificada c
           where c.vendedor_id = vd.vendedor_id and not c.era_ativo),
         (select round(coalesce(sum(c.valor), 0)
                       / nullif((select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'ativo'), 0), 2)
            from venda_classificada c where c.vendedor_id = vd.vendedor_id and c.era_ativo)
    from vend vd
   order by vd.vendedor_nome;
$$;

-- ── 4. A importação de carteiras: a vendedora pode estar em outra carteira também ───────────────
-- Antes: quem já estava em outra carteira "não era movida" (`em_outra_carteira`). Agora ela entra
-- nesta também. O membro procurado é o daquela carteira. Corpo de 20261117020000 com as duas linhas
-- trocadas; assinatura e ACL ficam (create or replace).
create or replace function public.com_importar_carteiras(p_carteiras jsonb, p_confirmar boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_item jsonb;
  v_nome text;
  v_codigos text[];
  v_todos text[] := array[]::text[];
  v_responsavel uuid;
  v_membro public.com_carteira_membros%rowtype;
  v_outro_responsavel uuid;
  v_situacao_resp text;
  v_entram int;
  v_ja_estavam int;
  v_grupos int;
  v_mudam jsonb;
  v_nao_encontrados jsonb;
  v_resultado jsonb := '[]'::jsonb;
begin
  if v_tenant is null or not public.com_pode_gerir_carteiras() then
    raise exception 'Só quem gere as carteiras do Comercial importa carteiras.' using errcode = '42501';
  end if;

  select coalesce(array_agg(cl ->> 'codigo'), array[]::text[]) into v_todos
    from jsonb_array_elements(coalesce(p_carteiras, '[]'::jsonb)) i,
         jsonb_array_elements(i -> 'clientes') cl;
  if (select count(*) <> count(distinct x) from unnest(v_todos) x) then
    raise exception 'Há código de cliente repetido na importação; resolva os conflitos antes.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_carteiras, '[]'::jsonb)) loop
    v_nome := nullif(public.normalizar_nome_carteira(v_item ->> 'carteira'), '');
    if v_nome is null then
      raise exception 'Carteira sem nome.' using errcode = '22023';
    end if;
    select coalesce((select r.para from public.com_carteira_renomeacoes r
                      where r.tenant_id = v_tenant and r.de = v_nome), v_nome) into v_nome;

    select coalesce(array_agg(cl ->> 'codigo'), array[]::text[]) into v_codigos
      from jsonb_array_elements(v_item -> 'clientes') cl;

    select count(*) filter (where c.carteira is null),
           count(*) filter (where c.carteira = v_nome),
           coalesce(jsonb_agg(jsonb_build_object('codigo', c.codigo, 'nome', c.razao_social, 'de', c.carteira)
                               order by c.razao_social)
                      filter (where c.carteira is not null and c.carteira <> v_nome), '[]'::jsonb)
      into v_entram, v_ja_estavam, v_mudam
      from public.com_clientes c
     where c.tenant_id = v_tenant and c.codigo = any (v_codigos);

    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_nao_encontrados
      from unnest(v_codigos) x
     where not exists (select 1 from public.com_clientes c where c.tenant_id = v_tenant and c.codigo = x);

    select count(*) into v_grupos
      from jsonb_array_elements(v_item -> 'clientes') cl
      join public.com_clientes c on c.tenant_id = v_tenant and c.codigo = cl ->> 'codigo'
     where nullif(btrim(cl ->> 'grupo'), '') is not null
       and c.grupo is distinct from btrim(cl ->> 'grupo');

    v_responsavel := nullif(v_item ->> 'responsavel', '')::uuid;
    v_situacao_resp := null;
    v_membro := null;
    v_outro_responsavel := null;
    if v_responsavel is not null then
      select * into v_membro from public.com_carteira_membros m
       where m.tenant_id = v_tenant and m.user_id = v_responsavel and m.carteira = v_nome;
      select m.user_id into v_outro_responsavel from public.com_carteira_membros m
       where m.tenant_id = v_tenant and m.carteira = v_nome and m.responsavel and m.user_id <> v_responsavel;
      v_situacao_resp := case
        when v_outro_responsavel is not null then 'carteira_ja_tem_responsavel'
        when v_membro.id is not null and v_membro.responsavel then 'ja_era'
        else 'definido'
      end;
    end if;

    if p_confirmar then
      update public.com_clientes c set carteira = v_nome, updated_at = now()
       where c.tenant_id = v_tenant and c.codigo = any (v_codigos)
         and c.carteira is distinct from v_nome;

      update public.com_clientes c set grupo = btrim(cl ->> 'grupo'), updated_at = now()
        from jsonb_array_elements(v_item -> 'clientes') cl
       where c.tenant_id = v_tenant and c.codigo = cl ->> 'codigo'
         and nullif(btrim(cl ->> 'grupo'), '') is not null
         and c.grupo is distinct from btrim(cl ->> 'grupo');

      if v_situacao_resp = 'definido' then
        if v_membro.id is null then
          insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
          values (v_tenant, v_responsavel, v_nome, true);
        else
          update public.com_carteira_membros set responsavel = true where id = v_membro.id;
        end if;
      end if;
    end if;

    v_resultado := v_resultado || jsonb_build_object(
      'carteira', v_nome,
      'entram', v_entram,
      'ja_estavam', v_ja_estavam,
      'mudam', v_mudam,
      'nao_encontrados', v_nao_encontrados,
      'grupos', v_grupos,
      'responsavel', v_situacao_resp
    );
  end loop;

  return jsonb_build_object('confirmado', p_confirmar, 'carteiras', v_resultado);
end;
$$;

-- ── 5. A meta de valor no Painel do gestor: a SOMA das metas das carteiras da pessoa ────────────
-- Antes casava `com_metas.carteira = v.carteira`; com a lista ("ESPECIAL, MG") não casaria nada. Agora
-- soma a meta de cada carteira em que ela está. Corpo de 20261114010000, só `meta_da_carteira` muda.
create or replace function public.com_painel_do_gestor(p_competencia date)
returns table (
  vendedor_id uuid, vendedor_nome text, carteira text,
  ordem int, metrica text, rotulo text, periodo text,
  meta numeric, realizado numeric, cor text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with janela as (
    select date_trunc('month', p_competencia)::date as de,
           (date_trunc('month', p_competencia) + interval '1 month')::date as ate,
           least((now() at time zone 'America/Sao_Paulo')::date,
                 (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date) as ref
  ),
  semana as (
    select date_trunc('week', janela.ref)::date as de,
           (date_trunc('week', janela.ref) + interval '7 days')::date as ate
      from janela
  ),
  vend as (select * from public.com_vendedoras_do_painel(p_competencia)),
  mes as (
    select i.* from public.com_interacoes i, janela
     where i.data >= janela.de and i.data < janela.ate
  ),
  vendas as (
    select m.vendedor_id,
           sum(m.valor_venda) as valor,
           count(distinct m.cliente_codigo) as clientes
      from mes m
     where m.status = 'concluido' and m.valor_venda > 0 and m.cliente_codigo is not null
     group by m.vendedor_id
  ),
  relacionados as (
    select m.vendedor_id, count(distinct m.cliente_codigo) as clientes
      from mes m where m.cliente_codigo is not null
     group by m.vendedor_id
  ),
  catalogo as (
    select * from public.com_indicadores where ativo
  ),
  marcas as (
    select i.vendedor_id, ind.id as indicador_id, count(*) as qtd
      from public.com_interacao_marcas mk
      join public.com_interacoes i on i.id = mk.interacao_id
      join catalogo ind on ind.id = mk.indicador_id
      cross join janela cross join semana
     where (ind.periodo = 'mes'    and i.data >= janela.de and i.data < janela.ate)
        or (ind.periodo = 'semana' and i.data >= semana.de and i.data < semana.ate)
     group by i.vendedor_id, ind.id
  ),
  abertas as (
    select i.vendedor_id, ind.id as indicador_id, count(*) as qtd
      from public.com_interacao_marcas mk
      join public.com_interacoes i on i.id = mk.interacao_id
      join catalogo ind on ind.id = mk.indicador_id and ind.conta_em_aberto
      cross join janela
     where i.status <> 'concluido' and i.data <= janela.ref
     group by i.vendedor_id, ind.id
  ),
  metas as (
    select distinct on (mi.vendedor_id, mi.metrica)
           mi.vendedor_id, mi.metrica, mi.meta
      from public.com_metas_indicador mi, janela
     where mi.competencia <= janela.de
     order by mi.vendedor_id, mi.metrica, mi.competencia desc
  ),
  -- A META DE VALOR É A DA DIRETORIA: a soma de `com_metas` das carteiras da vendedora, no mês.
  meta_da_carteira as (
    select m.user_id as vendedor_id, sum(cm.valor) as meta
      from public.com_carteira_membros m
      cross join janela
      join public.com_metas cm
        on cm.tenant_id = m.tenant_id
       and cm.carteira is not null
       and public.normalizar_nome_carteira(cm.carteira) = m.carteira
       and cm.ano = extract(year from janela.de)::int
       and cm.mes = extract(month from janela.de)::int
     where m.tenant_id = public.get_user_tenant_id()
     group by m.user_id
  ),
  linhas as (
    select v.vendedor_id, v.vendedor_nome, v.carteira, 1 as ordem,
           'valor_vendas'::text as metrica, 'Valor de venda acumulada do mês'::text as rotulo,
           'mes'::text as periodo, coalesce(vd.valor, 0)::numeric as realizado
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 2, 'pct_meta',
           '% de vendas acumulada x meta', 'mes', null
      from vend v
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 3, 'clientes_com_venda',
           'Quantidade de clientes com vendas no mês', 'mes', coalesce(vd.clientes, 0)
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 4, 'clientes_relacionados',
           'Quantidade de clientes que relacionou', 'mes', coalesce(r.clientes, 0)
      from vend v left join relacionados r on r.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 10 + ind.ordem * 2,
           'ind:' || ind.id, coalesce(ind.rotulo_painel, ind.nome), ind.periodo,
           coalesce(mk.qtd, 0)
      from vend v
      cross join catalogo ind
      left join marcas mk on mk.vendedor_id = v.vendedor_id and mk.indicador_id = ind.id
     where ind.tipo = 'indicador'
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 11 + ind.ordem * 2,
           'aberto:' || ind.id, regexp_replace(coalesce(ind.rotulo_painel, ind.nome), ' na semana$| no mês$', '') || ' em aberto',
           'aberto', coalesce(ab.qtd, 0)
      from vend v
      cross join catalogo ind
      left join abertas ab on ab.vendedor_id = v.vendedor_id and ab.indicador_id = ind.id
     where ind.tipo = 'indicador' and ind.conta_em_aberto
  )
  select l.vendedor_id, l.vendedor_nome, l.carteira, l.ordem, l.metrica, l.rotulo, l.periodo,
         case l.metrica
           when 'valor_vendas' then mc.meta
           when 'pct_meta' then case when mc.meta > 0 then 100 end
           else mt.meta
         end as meta,
         case when l.metrica = 'pct_meta'
              then case when mc.meta > 0 then round(coalesce(vd.valor, 0) / mc.meta * 100, 1) end
              else l.realizado end as realizado,
         case l.metrica
           when 'valor_vendas' then public.com_cor_do_farol(l.realizado, mc.meta)
           when 'pct_meta' then public.com_cor_do_farol(coalesce(vd.valor, 0), mc.meta)
           else public.com_cor_do_farol(l.realizado, mt.meta)
         end as cor
    from linhas l
    left join metas mt on mt.vendedor_id = l.vendedor_id and mt.metrica = l.metrica
    left join meta_da_carteira mc on mc.vendedor_id = l.vendedor_id
    left join vendas vd on vd.vendedor_id = l.vendedor_id
   order by l.vendedor_nome, l.ordem;
$$;
