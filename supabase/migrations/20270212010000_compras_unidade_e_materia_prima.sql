-- COMPRAS: UNIDADE NO PEDIDO, QUALQUER UM CADASTRA PRODUTO, CATEGORIA MATÉRIA-PRIMA (dono, 2026-10-27).
--
-- "Em compras quando tem matéria prima, insumos não tem como por KG, Grama e não tem histórico para a diretoria ver
-- qual foram os últimos fornecedores aprovados e qual valor foi pago anteriormente." E: o Lucas (Operador da
-- Qualidade) só via "Usar este nome" ao pedir compra de um produto novo.
-- Decisões (as quatro = as recomendadas):
--   1. a unidade fica no pedido, numa lista fixa, já vindo do produto do catálogo;
--   2. qualquer pessoa que pede cadastra produto novo (nome e unidade); editar e desativar seguem com Compras;
--   3. o histórico mostra o preço por unidade e a diferença (só tela — as colunas já existem);
--   4. nova categoria de Compras "Matéria-prima".

-- ─── 1. A lista de unidades ─────────────────────────────────────────────────────────────────────────
-- A mesma lista de `src/lib/unidades-de-compra.ts`. O catálogo guardava texto livre ("un", "Pacote"): normaliza.
update public.compras_produtos set unidade = case lower(btrim(coalesce(unidade, '')))
    when 'kg' then 'kg' when 'quilo' then 'kg'
    when 'g' then 'g' when 'grama' then 'g'
    when 'l' then 'L' when 'litro' then 'L'
    when 'ml' then 'mL'
    when 'caixa' then 'caixa' when 'cx' then 'caixa'
    when 'pacote' then 'pacote' when 'pct' then 'pacote'
    when 'rolo' then 'rolo'
    when 'metro' then 'metro' when 'm' then 'metro'
    else 'un' end
 where unidade is distinct from case lower(btrim(coalesce(unidade, '')))
    when 'kg' then 'kg' when 'quilo' then 'kg' when 'g' then 'g' when 'grama' then 'g'
    when 'l' then 'L' when 'litro' then 'L' when 'ml' then 'mL'
    when 'caixa' then 'caixa' when 'cx' then 'caixa' when 'pacote' then 'pacote' when 'pct' then 'pacote'
    when 'rolo' then 'rolo' when 'metro' then 'metro' when 'm' then 'metro' else 'un' end;

alter table public.compras_produtos alter column unidade set default 'un';
alter table public.compras_produtos alter column unidade set not null;
alter table public.compras_produtos add constraint compras_produtos_unidade_da_lista
  check (unidade in ('un', 'kg', 'g', 'L', 'mL', 'caixa', 'pacote', 'rolo', 'metro'));

alter table public.compras_solicitacoes add column if not exists unidade text not null default 'un';
alter table public.compras_solicitacoes add constraint compras_solicitacoes_unidade_da_lista
  check (unidade in ('un', 'kg', 'g', 'L', 'mL', 'caixa', 'pacote', 'rolo', 'metro'));
-- As compras de antes herdam a unidade do produto do catálogo (as de nome digitado ficam "un", como eram).
update public.compras_solicitacoes s set unidade = p.unidade
  from public.compras_produtos p where p.id = s.product_id and s.unidade <> p.unidade;

-- ─── 2. Abrir a compra leva a unidade ───────────────────────────────────────────────────────────────
-- Igual a 20270206010000, mais a unidade: a escolhida no pedido; sem ela (tela antiga), a do produto do catálogo.
-- `create or replace` preserva a ACL (regra 14 só vale para drop + create).
create or replace function public.compras_abrir_pedido(p_chamado jsonb, p_pedido jsonb, p_orcamentos jsonb)
returns uuid language plpgsql set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_eu uuid := auth.uid();
  v_solicitacao uuid;
  v_pedido uuid;
  v_atribuido uuid := nullif(p_chamado ->> 'assigned_to', '')::uuid;
  v_qtd numeric := coalesce(nullif(p_pedido ->> 'quantidade', '')::numeric, 1);
  v_estimado numeric;
begin
  if v_tenant is null or v_eu is null then
    raise exception 'Entre no sistema para pedir uma compra.' using errcode = '42501';
  end if;
  if coalesce(trim(p_pedido ->> 'product_name'), '') = '' then
    raise exception 'Informe o produto da compra.' using errcode = '23514';
  end if;
  if v_qtd <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.' using errcode = '23514';
  end if;

  -- O menor total é a estimativa — já no insert, porque o aviso a quem aprova a mostra.
  select min(coalesce(round(nullif(o ->> 'valor_unitario', '')::numeric * v_qtd + coalesce(nullif(o ->> 'frete', '')::numeric, 0), 2),
                      nullif(o ->> 'amount', '')::numeric))
    into v_estimado
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) o
   where coalesce(trim(o ->> 'supplier'), '') <> ''
     and coalesce(nullif(o ->> 'valor_unitario', '')::numeric, nullif(o ->> 'amount', '')::numeric, 0) > 0;

  perform set_config('helpoint.abrindo_compra', 'sim', true);
  insert into public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, detalhes)
  values (v_tenant, 'compra', v_eu, v_eu,
          coalesce(nullif(trim(p_chamado ->> 'title'), ''), 'Compra: ' || trim(p_pedido ->> 'product_name')),
          nullif(trim(coalesce(p_chamado ->> 'description', '')), ''))
  returning id into v_solicitacao;
  perform set_config('helpoint.abrindo_compra', '', true);

  insert into public.compras_solicitacoes (
    tenant_id, solicitacao_id, category_id, comprador_id, product_id, product_name, product_link, department, quantidade,
    unidade, motivo_recomendacao, estimated_amount, created_by, caixinha_id
  ) values (
    v_tenant, v_solicitacao, nullif(p_chamado ->> 'category_id', '')::uuid, v_atribuido,
    nullif(p_pedido ->> 'product_id', '')::uuid,
    trim(p_pedido ->> 'product_name'),
    nullif(trim(p_pedido ->> 'product_link'), ''),
    nullif(p_pedido ->> 'department', ''),
    v_qtd,
    coalesce(nullif(p_pedido ->> 'unidade', ''),
             (select p.unidade from public.compras_produtos p where p.id = nullif(p_pedido ->> 'product_id', '')::uuid),
             'un'),
    nullif(trim(coalesce(p_pedido ->> 'motivo_recomendacao', '')), ''),
    v_estimado, v_eu, nullif(p_pedido ->> 'caixinha_id', '')::uuid
  )
  returning id into v_pedido;

  -- O total de cada um sai de `compras_orcamento_total`; sem unitário (chamada antiga), vale o `amount`.
  insert into public.compras_orcamentos (
    tenant_id, request_id, supplier, supplier_id, amount, valor_unitario, frete, prazo_entrega_dias,
    link, notes, file_path, position
  )
  select v_tenant, v_pedido,
         trim(o ->> 'supplier'),
         nullif(o ->> 'supplier_id', '')::uuid,
         coalesce(nullif(o ->> 'amount', '')::numeric, nullif(o ->> 'valor_unitario', '')::numeric * v_qtd),
         nullif(o ->> 'valor_unitario', '')::numeric,
         coalesce(nullif(o ->> 'frete', '')::numeric, 0),
         nullif(o ->> 'prazo_entrega_dias', '')::integer,
         nullif(trim(o ->> 'link'), ''),
         nullif(trim(o ->> 'notes'), ''),
         nullif(o ->> 'file_path', ''),
         n::int
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) with ordinality as x(o, n)
   where coalesce(trim(o ->> 'supplier'), '') <> ''
     and coalesce(nullif(o ->> 'valor_unitario', '')::numeric, nullif(o ->> 'amount', '')::numeric, 0) > 0;

  -- O recomendado é o orçamento marcado por quem pediu (opcional).
  update public.compras_solicitacoes s
     set orcamento_recomendado_id = (
           select q.id from public.compras_orcamentos q
             join jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) with ordinality as x(o, n) on q.position = x.n
            where q.request_id = v_pedido and coalesce((x.o ->> 'recomendado')::boolean, false)
            limit 1)
   where s.id = v_pedido;

  return v_solicitacao;
end;
$$;

-- ─── 3. Quem pede cadastra produto ──────────────────────────────────────────────────────────────────
-- Era só "Catálogo › Criar e editar" de Compras (20261124010000). Agora qualquer pessoa da empresa cadastra produto
-- comum — é o que faz o histórico juntar as compras do mesmo item, em vez de cada um digitar o nome do seu jeito.
-- Produto de ESTOQUE (suprimento, com mínimo que avisa Compras) continua de quem cuida do catálogo; renomear,
-- desativar e excluir não mudam.
drop policy if exists compras_produtos_insert on public.compras_produtos;
create policy compras_produtos_insert on public.compras_produtos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('compras', 'catalogo', 'edit'))
                   or (not coalesce(suprimento, false) and coalesce(estoque_minimo, 0) = 0)));

-- ─── 4. Categoria Matéria-prima ─────────────────────────────────────────────────────────────────────
-- Ao lado de "Embalagens e insumos". Só onde ainda cabe (até 8 principais ativas, `categoria_ate_8_por_setor`).
insert into public.ti_categories (tenant_id, module, name, sort_order, is_purchase)
select t.id, 'compras', 'Matéria-prima', 1, true
  from public.tenants t
 where not exists (select 1 from public.ti_categories c
                    where c.tenant_id = t.id and c.module = 'compras' and c.parent_id is null
                      and lower(btrim(c.name)) in ('matéria-prima', 'materia-prima', 'matéria prima', 'materia prima'))
   and (select count(*) from public.ti_categories c
         where c.tenant_id = t.id and c.module = 'compras' and c.parent_id is null and coalesce(c.is_active, true)) < 8;
