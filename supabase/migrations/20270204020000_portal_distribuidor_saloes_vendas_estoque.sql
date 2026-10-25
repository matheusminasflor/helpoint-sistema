-- Portal do Distribuidor, parte 2 (etapa 6): os salões com o funil, as visitas (a agenda), as vendas aos salões, o
-- estoque e o "Meu dia". Decisões em docs/proposta-portal-distribuidor.md ("Decidido em 2026-10-25"):
--
--   2. o estoque do distribuidor: o que ele compra da Minasflor ENTRA SOZINHO quando a nota é importada do Forteplus
--      (`com_vendas_itens` do cliente ligado a ele); a venda ao salão ele registra no app;
--   3. LGPD: a Minasflor vê o salão, a cidade, a etapa e o que ele compra; o NOME E O TELEFONE DO CONTATO só o
--      distribuidor e a equipe dele — por isso o contato mora numa tabela própria, sem policy para a Minasflor;
--   5. um login por pessoa: o dono vê tudo; o vendedor vê os salões dele (o responsável) e o que registrou.
--
-- Quem é "da Minasflor" aqui: quem lê o Comercial ou a Diretoria (`has_comercial_access` / `has_diretoria_access`),
-- só leitura. Quem é "do distribuidor": membro ativo de distribuidor LIBERADO (`dist_ativo`).
--
-- O ESTOQUE COMEÇA NO DIA DA LIBERAÇÃO (`estoque_desde`): a nota de antes disso já foi vendida há muito tempo, e
-- contá-la inventaria um estoque que não existe. O que ele tinha no dia, informa uma vez ("Tenho X") — o ajuste.

-- ── Quem está dentro ────────────────────────────────────────────────────────────────────────────────────────────
alter table public.dist_distribuidores add column if not exists estoque_desde date;

create or replace function public.dist_estoque_desde_na_liberacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'liberado' and new.estoque_desde is null then
    new.estoque_desde := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end;
$$;
revoke all on function public.dist_estoque_desde_na_liberacao() from public, anon, authenticated;
create trigger dist_estoque_desde_na_liberacao before insert or update of status on public.dist_distribuidores
  for each row execute function public.dist_estoque_desde_na_liberacao();

-- O distribuidor de quem chama, só se estiver liberado: é a porta de toda escrita do portal.
create or replace function public.dist_ativo()
returns uuid language sql stable security definer set search_path = public as $$
  select m.distribuidor_id from public.dist_membros m
    join public.dist_distribuidores d on d.id = m.distribuidor_id and d.status = 'liberado'
   where m.user_id = auth.uid() and m.ativo limit 1
$$;

-- As duas da TI (parte 1) nunca devolvem nulo: `if not <nulo>` não entra no `if`, e o `raise` não acontece.
-- `create or replace` preserva a ACL (regra 14).
create or replace function public.dist_pode_ver()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.pode_no_setor('ti', 'distribuidores', 'view') or public.pode_no_setor('ti', 'distribuidores', 'liberar'), false)
$$;
create or replace function public.dist_pode_liberar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.pode_no_setor('ti', 'distribuidores', 'liberar'), false)
$$;

-- Quem da Minasflor acompanha os distribuidores (só leitura): o Comercial e a Diretoria.
create or replace function public.dist_minasflor_acompanha(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- coalesce: para quem é de fora o tenant é nulo, e nulo num `or`/`not` deixava passar (pgTAP, 2026-10-25).
  select coalesce(p_tenant = public.get_user_tenant_id()
     and (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())), false)
$$;

-- ── Salões ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.dist_saloes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  distribuidor_id uuid not null references public.dist_distribuidores(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  endereco text,
  -- O funil (proposta, 2026-10-21): novo → contato → visita → testando → cliente; perdido quando desistiu.
  etapa text not null default 'novo' check (etapa in ('novo', 'contato', 'visita', 'testando', 'cliente', 'perdido')),
  etapa_desde date not null default (now() at time zone 'America/Sao_Paulo')::date,
  responsavel_id uuid not null default auth.uid() references auth.users(id),
  observacao text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dist_saloes_do_distribuidor on public.dist_saloes (distribuidor_id, etapa);

-- O contato do salão: só o distribuidor e a equipe (decisão 3). Sem policy para a Minasflor, de propósito.
create table if not exists public.dist_saloes_contatos (
  id uuid primary key default gen_random_uuid(),
  salao_id uuid not null references public.dist_saloes(id) on delete cascade,
  distribuidor_id uuid not null references public.dist_distribuidores(id) on delete cascade,
  nome text,
  telefone text,
  created_at timestamptz not null default now(),
  check (nullif(btrim(coalesce(nome, '')), '') is not null or nullif(btrim(coalesce(telefone, '')), '') is not null)
);

-- A etapa muda → a data da etapa recomeça (é dela que sai o "testando há 20 dias"); e o distribuidor do salão
-- vem do próprio salão no contato, nunca do que a tela mandou.
create or replace function public.dist_saloes_antes_de_gravar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.etapa is distinct from old.etapa then
      new.etapa_desde := (now() at time zone 'America/Sao_Paulo')::date;
    end if;
    new.distribuidor_id := old.distribuidor_id;
    new.tenant_id := old.tenant_id;
    new.created_by := old.created_by;
  else
    -- A empresa é a do distribuidor; a policy de INSERT confere que o distribuidor é o de quem grava.
    new.tenant_id := (select d.tenant_id from public.dist_distribuidores d where d.id = new.distribuidor_id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger dist_saloes_antes_de_gravar before insert or update on public.dist_saloes
  for each row execute function public.dist_saloes_antes_de_gravar();

alter table public.dist_saloes enable row level security;
alter table public.dist_saloes_contatos enable row level security;

-- O dono vê todos os salões do distribuidor; o vendedor, os dele. Comparação de coluna direto na policy (regra 13):
-- o salão que está nascendo precisa passar no SELECT do `insert ... returning`.
create policy dist_saloes_select on public.dist_saloes for select to authenticated
  using ((distribuidor_id = public.dist_ativo() and (responsavel_id = auth.uid() or public.dist_sou_dono(distribuidor_id)))
      or public.dist_minasflor_acompanha(tenant_id));
create policy dist_saloes_insert on public.dist_saloes for insert to authenticated
  with check (distribuidor_id = public.dist_ativo()
          and created_by = auth.uid()
          and (responsavel_id = auth.uid() or public.dist_sou_dono(distribuidor_id))
          -- O responsável é da equipe.
          and exists (select 1 from public.dist_membros m where m.distribuidor_id = dist_saloes.distribuidor_id
                         and m.user_id = dist_saloes.responsavel_id and m.ativo));
-- Regra 15: o `with check` repete a permissão do `using`.
create policy dist_saloes_update on public.dist_saloes for update to authenticated
  using (distribuidor_id = public.dist_ativo() and (responsavel_id = auth.uid() or public.dist_sou_dono(distribuidor_id)))
  with check (distribuidor_id = public.dist_ativo() and (responsavel_id = auth.uid() or public.dist_sou_dono(distribuidor_id))
          and exists (select 1 from public.dist_membros m where m.distribuidor_id = dist_saloes.distribuidor_id
                         and m.user_id = dist_saloes.responsavel_id and m.ativo));
create policy dist_saloes_delete on public.dist_saloes for delete to authenticated
  using (distribuidor_id = public.dist_ativo() and public.dist_sou_dono(distribuidor_id));

create or replace function public.dist_vejo_o_salao(p_salao uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dist_saloes s
                  where s.id = p_salao and s.distribuidor_id = public.dist_ativo()
                    and (s.responsavel_id = auth.uid() or public.dist_sou_dono(s.distribuidor_id)))
$$;

create policy dist_saloes_contatos_select on public.dist_saloes_contatos for select to authenticated
  using (public.dist_vejo_o_salao(salao_id));
create policy dist_saloes_contatos_insert on public.dist_saloes_contatos for insert to authenticated
  with check (public.dist_vejo_o_salao(salao_id) and distribuidor_id = public.dist_ativo());
create policy dist_saloes_contatos_update on public.dist_saloes_contatos for update to authenticated
  using (public.dist_vejo_o_salao(salao_id)) with check (public.dist_vejo_o_salao(salao_id) and distribuidor_id = public.dist_ativo());
create policy dist_saloes_contatos_delete on public.dist_saloes_contatos for delete to authenticated
  using (public.dist_vejo_o_salao(salao_id));

-- ── Visitas (a agenda) ──────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.dist_visitas (
  id uuid primary key default gen_random_uuid(),
  distribuidor_id uuid not null references public.dist_distribuidores(id) on delete cascade,
  salao_id uuid not null references public.dist_saloes(id) on delete cascade,
  quando timestamptz not null,
  responsavel_id uuid not null default auth.uid() references auth.users(id),
  feita_em timestamptz,
  resultado text,
  created_at timestamptz not null default now()
);
create index if not exists dist_visitas_agenda on public.dist_visitas (distribuidor_id, quando);
alter table public.dist_visitas enable row level security;

create policy dist_visitas_select on public.dist_visitas for select to authenticated
  using (public.dist_vejo_o_salao(salao_id)
      or exists (select 1 from public.dist_distribuidores d where d.id = distribuidor_id and public.dist_minasflor_acompanha(d.tenant_id)));
create policy dist_visitas_insert on public.dist_visitas for insert to authenticated
  with check (public.dist_vejo_o_salao(salao_id) and distribuidor_id = public.dist_ativo()
          and (responsavel_id = auth.uid() or public.dist_sou_dono(distribuidor_id)));
create policy dist_visitas_update on public.dist_visitas for update to authenticated
  using (public.dist_vejo_o_salao(salao_id))
  with check (public.dist_vejo_o_salao(salao_id) and distribuidor_id = public.dist_ativo());
create policy dist_visitas_delete on public.dist_visitas for delete to authenticated
  using (public.dist_vejo_o_salao(salao_id));

-- ── Vendas ao salão ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.dist_vendas (
  id uuid primary key default gen_random_uuid(),
  distribuidor_id uuid not null references public.dist_distribuidores(id) on delete cascade,
  salao_id uuid not null references public.dist_saloes(id) on delete cascade,
  data date not null,
  vendedor_id uuid not null references auth.users(id),
  total numeric not null default 0,
  observacao text,
  created_at timestamptz not null default now()
);
create table if not exists public.dist_vendas_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.dist_vendas(id) on delete cascade,
  produto_codigo text not null,
  produto_nome text not null,
  quantidade numeric not null check (quantidade > 0),
  valor_unitario numeric not null default 0 check (valor_unitario >= 0)
);
create index if not exists dist_vendas_do_salao on public.dist_vendas (salao_id, data);
create index if not exists dist_vendas_itens_da_venda on public.dist_vendas_itens (venda_id);
alter table public.dist_vendas enable row level security;
alter table public.dist_vendas_itens enable row level security;

-- Venda se registra por `dist_registrar_venda` (venda e itens de uma vez); a tabela não aceita escrita direta.
create policy dist_vendas_select on public.dist_vendas for select to authenticated
  using (public.dist_vejo_o_salao(salao_id)
      or exists (select 1 from public.dist_distribuidores d where d.id = distribuidor_id and public.dist_minasflor_acompanha(d.tenant_id)));
create policy dist_vendas_itens_select on public.dist_vendas_itens for select to authenticated
  using (exists (select 1 from public.dist_vendas v where v.id = venda_id));
-- O dono corrige a venda errada apagando-a (o estoque volta sozinho, porque é calculado).
create policy dist_vendas_delete on public.dist_vendas for delete to authenticated
  using (distribuidor_id = public.dist_ativo() and (vendedor_id = auth.uid() or public.dist_sou_dono(distribuidor_id)));

-- ── Ajuste do estoque ("Tenho X") ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.dist_estoque_ajustes (
  id uuid primary key default gen_random_uuid(),
  distribuidor_id uuid not null references public.dist_distribuidores(id) on delete cascade,
  produto_codigo text not null,
  produto_nome text not null,
  -- A diferença que o ajuste aplicou (o "tenho" menos o que o sistema contava).
  diferenca numeric not null,
  tenho numeric not null check (tenho >= 0),
  feito_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.dist_estoque_ajustes enable row level security;
create policy dist_estoque_ajustes_select on public.dist_estoque_ajustes for select to authenticated
  using (distribuidor_id = public.dist_ativo()
      or exists (select 1 from public.dist_distribuidores d where d.id = distribuidor_id and public.dist_minasflor_acompanha(d.tenant_id)));

-- ── O catálogo e o estoque ──────────────────────────────────────────────────────────────────────────────────────
-- Os produtos da Minasflor, para escolher na venda. O distribuidor não lê `com_produtos` (é do Comercial).
create or replace function public.dist_produtos()
returns table (codigo text, nome text)
language sql stable security definer set search_path = public as $$
  select p.codigo, p.nome from public.com_produtos p
    join public.dist_distribuidores d on d.id = public.dist_ativo() and d.tenant_id = p.tenant_id
   order by p.nome
$$;

-- O estoque de um distribuidor: entradas pelas notas (desde a liberação) + ajustes − vendas aos salões.
-- Bonificação também entra (é produto na prateleira dele); devolução sai. `p_distribuidor` nulo = o meu.
create or replace function public.dist_estoque(p_distribuidor uuid default null)
returns table (produto_codigo text, produto_nome text, entrou numeric, vendeu numeric, ajustou numeric, saldo numeric,
               ultima_entrada date, vendeu_60_dias numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_d public.dist_distribuidores;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_d from public.dist_distribuidores where id = coalesce(p_distribuidor, public.dist_ativo());
  if v_d.id is null or not coalesce(v_d.id = public.dist_ativo() or public.dist_minasflor_acompanha(v_d.tenant_id), false) then
    return;
  end if;
  return query
  with entradas as (
    select i.produto_codigo, max(i.produto_nome) as nome,
           sum(case when i.classe = 'devolucao' then -abs(i.quantidade) else abs(i.quantidade) end) as q,
           max(i.emissao) as ultima
      from public.com_vendas_itens i
     where i.tenant_id = v_d.tenant_id and i.cliente_codigo = v_d.com_cliente_codigo
       and i.classe in ('venda', 'bonificacao', 'devolucao') and i.emissao >= v_d.estoque_desde
     group by i.produto_codigo
  ), saidas as (
    select vi.produto_codigo, max(vi.produto_nome) as nome, sum(vi.quantidade) as q,
           sum(vi.quantidade) filter (where v.data > v_hoje - 60) as q60
      from public.dist_vendas v join public.dist_vendas_itens vi on vi.venda_id = v.id
     where v.distribuidor_id = v_d.id
     group by vi.produto_codigo
  ), ajustes as (
    select a.produto_codigo, max(a.produto_nome) as nome, sum(a.diferenca) as q
      from public.dist_estoque_ajustes a where a.distribuidor_id = v_d.id
     group by a.produto_codigo
  ), produtos as (
    select produto_codigo from entradas union select produto_codigo from saidas union select produto_codigo from ajustes
  )
  select p.produto_codigo, coalesce(e.nome, s.nome, a.nome),
         coalesce(e.q, 0), coalesce(s.q, 0), coalesce(a.q, 0),
         coalesce(e.q, 0) + coalesce(a.q, 0) - coalesce(s.q, 0),
         e.ultima, coalesce(s.q60, 0)
    from produtos p
    left join entradas e on e.produto_codigo = p.produto_codigo
    left join saidas s on s.produto_codigo = p.produto_codigo
    left join ajustes a on a.produto_codigo = p.produto_codigo
   order by 2;
end;
$$;

create or replace function public.dist_ajustar_estoque(p_produto_codigo text, p_tenho numeric)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_dist uuid := public.dist_ativo();
  v_saldo numeric;
  v_nome text;
begin
  if v_dist is null or not public.dist_sou_dono(v_dist) then
    raise exception 'Só o responsável pelo distribuidor ajusta o estoque.' using errcode = '42501';
  end if;
  if p_tenho is null or p_tenho < 0 then
    raise exception 'Informe quanto você tem (zero ou mais).' using errcode = '23514';
  end if;
  select e.saldo, e.produto_nome into v_saldo, v_nome from public.dist_estoque(v_dist) e where e.produto_codigo = p_produto_codigo;
  if v_nome is null then
    select p.nome into v_nome from public.dist_produtos() p where p.codigo = p_produto_codigo;
  end if;
  if v_nome is null then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;
  insert into public.dist_estoque_ajustes (distribuidor_id, produto_codigo, produto_nome, diferenca, tenho)
  values (v_dist, p_produto_codigo, v_nome, p_tenho - coalesce(v_saldo, 0), p_tenho);
end;
$$;

-- A venda ao salão, de uma vez: a venda, os itens, e o salão vira cliente.
-- `p_itens`: [{ "produto_codigo": "...", "quantidade": 2, "valor_unitario": 35.5 }]
create or replace function public.dist_registrar_venda(p_salao uuid, p_data date, p_itens jsonb, p_observacao text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_dist uuid := public.dist_ativo();
  v_id uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_dist is null or not public.dist_vejo_o_salao(p_salao) then
    raise exception 'Salão não encontrado na sua carteira.' using errcode = '42501';
  end if;
  if p_data is null or p_data > v_hoje then
    raise exception 'A data da venda não pode ser no futuro.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Coloque pelo menos um produto.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x
              where coalesce((x ->> 'quantidade')::numeric, 0) <= 0
                 or not exists (select 1 from public.dist_produtos() p where p.codigo = x ->> 'produto_codigo')) then
    raise exception 'Confira os produtos e as quantidades.' using errcode = '23514';
  end if;

  insert into public.dist_vendas (distribuidor_id, salao_id, data, vendedor_id, observacao)
  values (v_dist, p_salao, p_data, auth.uid(), nullif(btrim(p_observacao), ''))
  returning id into v_id;

  insert into public.dist_vendas_itens (venda_id, produto_codigo, produto_nome, quantidade, valor_unitario)
  select v_id, x ->> 'produto_codigo', p.nome, (x ->> 'quantidade')::numeric, coalesce((x ->> 'valor_unitario')::numeric, 0)
    from jsonb_array_elements(p_itens) x
    join public.dist_produtos() p on p.codigo = x ->> 'produto_codigo';

  update public.dist_vendas set total = (select sum(quantidade * valor_unitario) from public.dist_vendas_itens where venda_id = v_id)
   where id = v_id;
  update public.dist_saloes set etapa = 'cliente' where id = p_salao and etapa <> 'cliente';
  return v_id;
end;
$$;

-- ── Meu dia: quem visitar, quem vender de novo, onde está o dinheiro na mesa ─────────────────────────────────────
-- A recompra: o ciclo do salão é a média de dias entre as compras dele (com uma compra só, 30 dias); passou do
-- ciclo, está atrasado. "Testando" parado há 14 dias ou mais é dinheiro na mesa; produto que vende e acabou, também.
create or replace function public.dist_meu_dia()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_dist uuid := public.dist_ativo();
  v_dono boolean;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_dist is null then return null; end if;
  v_dono := public.dist_sou_dono(v_dist);
  return jsonb_build_object(
    'visitas', coalesce((
      select jsonb_agg(jsonb_build_object('id', vi.id, 'salao_id', s.id, 'salao', s.nome, 'cidade', s.cidade,
                                          'quando', vi.quando) order by vi.quando)
        from public.dist_visitas vi join public.dist_saloes s on s.id = vi.salao_id
       where vi.distribuidor_id = v_dist and vi.feita_em is null
         and (vi.quando at time zone 'America/Sao_Paulo')::date <= v_hoje
         and (v_dono or vi.responsavel_id = auth.uid())), '[]'::jsonb),
    'recompras', coalesce((
      select jsonb_agg(r order by (r ->> 'atraso')::int desc) from (
        select jsonb_build_object('salao_id', s.id, 'salao', s.nome, 'cidade', s.cidade, 'ultima', c.ultima,
                                  'ciclo', c.ciclo, 'atraso', v_hoje - (c.ultima + c.ciclo)) as r
          from public.dist_saloes s
          join lateral (
            select max(v.data) as ultima,
                   case when count(distinct v.data) >= 2
                        then greatest(7, round((max(v.data) - min(v.data))::numeric / (count(distinct v.data) - 1)))::int
                        else 30 end as ciclo
              from public.dist_vendas v where v.salao_id = s.id
          ) c on c.ultima is not null
         where s.distribuidor_id = v_dist and s.etapa = 'cliente'
           and (v_dono or s.responsavel_id = auth.uid())
           and v_hoje - (c.ultima + c.ciclo) >= 0
      ) x), '[]'::jsonb),
    'testando', coalesce((
      select jsonb_agg(jsonb_build_object('salao_id', s.id, 'salao', s.nome, 'cidade', s.cidade,
                                          'dias', v_hoje - s.etapa_desde) order by s.etapa_desde)
        from public.dist_saloes s
       where s.distribuidor_id = v_dist and s.etapa = 'testando' and v_hoje - s.etapa_desde >= 14
         and (v_dono or s.responsavel_id = auth.uid())), '[]'::jsonb),
    'acabando', coalesce((
      select jsonb_agg(jsonb_build_object('produto_codigo', e.produto_codigo, 'produto', e.produto_nome,
                                          'saldo', e.saldo, 'vendeu_60_dias', e.vendeu_60_dias) order by e.vendeu_60_dias desc)
        from public.dist_estoque(v_dist) e
       where e.vendeu_60_dias > 0 and e.saldo <= greatest(1, ceil(e.vendeu_60_dias / 4))), '[]'::jsonb)
  );
end;
$$;

-- ── Lição 14 ────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.dist_ativo() from public, anon;
revoke all on function public.dist_minasflor_acompanha(uuid) from public, anon;
revoke all on function public.dist_vejo_o_salao(uuid) from public, anon;
revoke all on function public.dist_saloes_antes_de_gravar() from public, anon;
revoke all on function public.dist_produtos() from public, anon;
revoke all on function public.dist_estoque(uuid) from public, anon;
revoke all on function public.dist_ajustar_estoque(text, numeric) from public, anon;
revoke all on function public.dist_registrar_venda(uuid, date, jsonb, text) from public, anon;
revoke all on function public.dist_meu_dia() from public, anon;
grant execute on function public.dist_ativo() to authenticated;
grant execute on function public.dist_minasflor_acompanha(uuid) to authenticated;
grant execute on function public.dist_vejo_o_salao(uuid) to authenticated;
grant execute on function public.dist_produtos() to authenticated;
grant execute on function public.dist_estoque(uuid) to authenticated;
grant execute on function public.dist_ajustar_estoque(text, numeric) to authenticated;
grant execute on function public.dist_registrar_venda(uuid, date, jsonb, text) to authenticated;
grant execute on function public.dist_meu_dia() to authenticated;
