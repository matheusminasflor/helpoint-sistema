-- Rodada 2, R5 — o Portal do Distribuidor completo antes do primeiro distribuidor (decisão 7 do dono, 2026-10-25;
-- decisões da R5 em 2026-10-26, docs/proposta-helpoint-rodada-2.md › Andamento).
--
-- O banco já deixava editar o salão, remarcar e cancelar a visita e apagar a venda; faltava a tela. Aqui entra só o
-- que o banco não fazia:
--   1. salão com venda não se apaga (decisão b): o `on delete cascade` levava as vendas junto e o estoque "voltava";
--   2. corrigir a venda (os itens, a data, a observação) de uma vez — o estoque é calculado, então acompanha sozinho;
--   3. o estoque inicial por planilha: muitos "tenho X" de uma vez, com uma conta de estoque só;
--   4. quem sai da equipe deixa os salões e as visitas abertas com o responsável — senão ninguém edita o salão (a
--      policy de UPDATE exige responsável ativo na equipe).
-- As tabelas do Portal estão vazias na produção (2026-10-26): nada aqui transforma dado existente.

-- ── 1. Salão com venda não se apaga ────────────────────────────────────────────────────────────────────────────
-- Só no `delete` direto (profundidade 1): apagar o distribuidor ou a empresa leva os salões em cascata, e isso o
-- sistema faz — o gatilho não pode travar (regra 8 do CLAUDE.md, a mesma ideia do `pg_trigger_depth`).
create or replace function public.dist_salao_com_venda_nao_se_apaga()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and exists (select 1 from public.dist_vendas v where v.salao_id = old.id) then
    raise exception 'Este salão tem vendas registradas: em vez de apagar, mude a etapa para Perdido.' using errcode = '23514';
  end if;
  return old;
end;
$$;
create trigger dist_salao_com_venda_nao_se_apaga before delete on public.dist_saloes
  for each row execute function public.dist_salao_com_venda_nao_se_apaga();
revoke all on function public.dist_salao_com_venda_nao_se_apaga() from public, anon, authenticated;

-- ── 2. Corrigir a venda ────────────────────────────────────────────────────────────────────────────────────────
-- Quem pode: o mesmo da policy de apagar (quem vendeu, ou o responsável pelo distribuidor). O salão não muda —
-- venda no salão errado se apaga e se registra de novo. Quem vendeu continua sendo quem vendeu.
-- `p_itens` no formato de `dist_registrar_venda`: [{ "produto_codigo": "...", "quantidade": 2, "valor_unitario": 35.5 }]
create or replace function public.dist_corrigir_venda(p_venda uuid, p_data date, p_itens jsonb, p_observacao text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_dist uuid := public.dist_ativo();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_dist is null or not exists (select 1 from public.dist_vendas v where v.id = p_venda and v.distribuidor_id = v_dist
                                      and (v.vendedor_id = auth.uid() or public.dist_sou_dono(v_dist))) then
    raise exception 'Só quem vendeu, ou o responsável pelo distribuidor, corrige a venda.' using errcode = '42501';
  end if;
  if p_data is null or p_data > v_hoje then
    raise exception 'A data da venda não pode ser no futuro.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Coloque pelo menos um produto. Para desfazer a venda inteira, apague-a.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x
              where coalesce((x ->> 'quantidade')::numeric, 0) <= 0
                 or coalesce((x ->> 'valor_unitario')::numeric, 0) < 0
                 or not exists (select 1 from public.dist_produtos() p where p.codigo = x ->> 'produto_codigo')) then
    raise exception 'Confira os produtos e as quantidades.' using errcode = '23514';
  end if;

  delete from public.dist_vendas_itens where venda_id = p_venda;
  insert into public.dist_vendas_itens (venda_id, produto_codigo, produto_nome, quantidade, valor_unitario)
  select p_venda, x ->> 'produto_codigo', p.nome, (x ->> 'quantidade')::numeric, coalesce((x ->> 'valor_unitario')::numeric, 0)
    from jsonb_array_elements(p_itens) x
    join public.dist_produtos() p on p.codigo = x ->> 'produto_codigo';
  update public.dist_vendas
     set data = p_data, observacao = nullif(btrim(p_observacao), ''),
         total = (select sum(quantidade * valor_unitario) from public.dist_vendas_itens where venda_id = p_venda)
   where id = p_venda;
end;
$$;
revoke all on function public.dist_corrigir_venda(uuid, date, jsonb, text) from public, anon;
grant execute on function public.dist_corrigir_venda(uuid, date, jsonb, text) to authenticated;

-- ── 3. Estoque inicial por planilha ────────────────────────────────────────────────────────────────────────────
-- O mesmo "tenho X" de `dist_ajustar_estoque`, para várias linhas: cada uma vira um ajuste com a diferença para o
-- que o sistema contava. Linha que já bate não grava nada. Só o responsável, como o ajuste de um produto.
-- `p_linhas`: [{ "produto_codigo": "...", "tenho": 12 }]. Devolve quantos produtos mudaram.
create or replace function public.dist_importar_estoque(p_linhas jsonb)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_dist uuid := public.dist_ativo();
  v_gravou integer;
begin
  if v_dist is null or not public.dist_sou_dono(v_dist) then
    raise exception 'Só o responsável pelo distribuidor informa o estoque.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'A planilha não tem nenhuma linha com produto.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) x
              where (x ->> 'tenho') is null or (x ->> 'tenho')::numeric < 0
                 or not exists (select 1 from public.dist_produtos() p where p.codigo = x ->> 'produto_codigo')) then
    raise exception 'Confira os códigos dos produtos e as quantidades (zero ou mais).' using errcode = '23514';
  end if;
  if (select count(*) <> count(distinct x ->> 'produto_codigo') from jsonb_array_elements(p_linhas) x) then
    raise exception 'O mesmo produto aparece em duas linhas da planilha.' using errcode = '23514';
  end if;

  insert into public.dist_estoque_ajustes (distribuidor_id, produto_codigo, produto_nome, diferenca, tenho)
  select v_dist, p.codigo, p.nome, (x ->> 'tenho')::numeric - coalesce(e.saldo, 0), (x ->> 'tenho')::numeric
    from jsonb_array_elements(p_linhas) x
    join public.dist_produtos() p on p.codigo = x ->> 'produto_codigo'
    left join public.dist_estoque(v_dist) e on e.produto_codigo = p.codigo
   where (x ->> 'tenho')::numeric is distinct from coalesce(e.saldo, 0);
  get diagnostics v_gravou = row_count;
  return v_gravou;
end;
$$;
revoke all on function public.dist_importar_estoque(jsonb) from public, anon;
grant execute on function public.dist_importar_estoque(jsonb) to authenticated;

-- ── 4. Quem sai da equipe passa os salões ao responsável ───────────────────────────────────────────────────────
-- A produção é a verdade do corpo da função (`pg_get_functiondef`); troca só o trecho.
create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

select pg_temp.troca('public.dist_tirar_da_equipe(uuid)'::regprocedure,
  'update public.dist_membros set ativo = false where id = p_membro;',
  'update public.dist_membros set ativo = false where id = p_membro;
  -- Os salões e as visitas ainda por fazer passam a quem tirou (o responsável): salão sem responsável ativo não se
  -- edita (policy de UPDATE), e a visita marcada sumiria da agenda de todo mundo menos a do dono.
  if v_m.user_id is not null then
    update public.dist_saloes set responsavel_id = auth.uid()
     where distribuidor_id = v_m.distribuidor_id and responsavel_id = v_m.user_id;
    update public.dist_visitas set responsavel_id = auth.uid()
     where distribuidor_id = v_m.distribuidor_id and responsavel_id = v_m.user_id and feita_em is null;
  end if;');
