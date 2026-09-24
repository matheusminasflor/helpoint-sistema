-- Frente 7c — bloco 2: o total da empresa deixa de ser um segundo número
-- digitado à parte. Ver .scratch/plano-frente7c-total-e-bercario.md §2.
--
-- Por que trigger, e não a tela: `com_importar_metas` (HISTORICO_METAS.json)
-- também escreve `metas_carteira`, e a tela não está no caminho dela — regra
-- que vale para os dois caminhos de escrita mora no banco, não no front.
--
-- Cuidado central desta migration, e a mutação que a prova (ver relatório do
-- executor): mês em que TODAS as carteiras estão sem realizado tem que
-- manter `metas_ano.total_realizado` NULL, nunca zero. `sum(realizado)` do
-- Postgres já devolve NULL quando não há nenhuma linha, ou quando todas as
-- linhas somadas são nulas — o erro seria escrever
-- `coalesce(sum(realizado), 0)`. Não escrevemos.
create or replace function public.trg_metas_carteira_recalcula_total()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(new.tenant_id, old.tenant_id);
  v_ano int := coalesce(new.ano, old.ano);
  v_mes smallint := coalesce(new.mes, old.mes);
  v_soma numeric(14,2);
begin
  select sum(realizado) into v_soma
  from public.metas_carteira
  where tenant_id = v_tenant_id and ano = v_ano and mes = v_mes;

  insert into public.metas_ano (tenant_id, ano, mes, total_realizado)
  values (v_tenant_id, v_ano, v_mes, v_soma)
  on conflict (tenant_id, ano, mes)
  do update set total_realizado = excluded.total_realizado;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_metas_carteira_recalcula_total on public.metas_carteira;
create trigger trg_metas_carteira_recalcula_total
after insert or update or delete on public.metas_carteira
for each row execute function public.trg_metas_carteira_recalcula_total();

-- ═══════════════════════════════════════════════════════════════════════════
-- `com_importar_metas` (migration 20261021010000) fazia um INSERT simples em
-- `metas_ano` depois de gravar `metas_carteira` do mesmo ano — funcionava
-- porque o ano era apagado (delete) antes de inserir de novo. Com o trigger
-- acima, a PRIMEIRA linha de `metas_carteira` inserida (para um ano com
-- carteira, ex.: 2026+) já cria a linha de `metas_ano` correspondente via
-- upsert — e o INSERT simples que vinha depois bateria de frente com ela
-- (23505, chave primária tenant_id/ano/mes duplicada). Mesma função, corpo
-- idêntico, só o INSERT final de `metas_ano` trocado por upsert —
-- reidempotente contra a linha que o trigger pode já ter criado na mesma
-- transação. O valor final não muda: a medição de 55 meses (plano §"O que a
-- medição diz") prova que a soma das carteiras já bate com o total do JSON
-- até o centavo.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_metas(p_file_name text, p_json jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_ano_key text;
  v_ano int;
  v_ano_obj jsonb;
  v_carteira_key text;
  v_carteira_obj jsonb;
  v_mes int;
  v_anos_importados int[] := '{}';
  v_linhas_carteira int := 0;
  v_linhas_ano int := 0;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if jsonb_typeof(p_json->'anos') is distinct from 'object' then
    raise exception 'JSON sem a chave "anos" (objeto) — não parece um HISTORICO_METAS válido.';
  end if;

  for v_ano_key in select jsonb_object_keys(p_json->'anos') loop
    v_ano := v_ano_key::int;
    v_ano_obj := p_json->'anos'->v_ano_key;
    v_anos_importados := array_append(v_anos_importados, v_ano);

    delete from public.metas_carteira where tenant_id = v_tenant_id and ano = v_ano;
    delete from public.metas_ano where tenant_id = v_tenant_id and ano = v_ano;

    -- Uma linha por carteira presente NESTE ano — "cart" não lista BERCARIO
    -- antes de 2026 porque o próprio JSON não tem a chave; nenhum código
    -- precisa saber disso, o loop só visita o que existe.
    if jsonb_typeof(v_ano_obj->'cart') = 'object' then
      for v_carteira_key in select jsonb_object_keys(v_ano_obj->'cart') loop
        v_carteira_obj := v_ano_obj->'cart'->v_carteira_key;
        for v_mes in 0..11 loop
          insert into public.metas_carteira (tenant_id, ano, mes, carteira, realizado)
          values (v_tenant_id, v_ano, v_mes + 1, v_carteira_key, nullif((v_carteira_obj->>v_mes)::numeric, 0));
          v_linhas_carteira := v_linhas_carteira + 1;
        end loop;
      end loop;
    end if;

    for v_mes in 0..11 loop
      insert into public.metas_ano (tenant_id, ano, mes, total_realizado, meta, meta_total)
      values (
        v_tenant_id, v_ano, v_mes + 1,
        nullif((v_ano_obj->'total'->>v_mes)::numeric, 0),
        -- "meta": null (2023/2024 no JSON do dono) não é ausência de CHAVE,
        -- é a chave presente com valor JSON null — jsonb_typeof devolve
        -- 'null' (texto), nunca SQL NULL, e só o typeof = 'array' abaixo
        -- entra no array. Import não falha: vira meta nula em todo mês.
        (case when jsonb_typeof(v_ano_obj->'meta') = 'array'
              then nullif((v_ano_obj->'meta'->>v_mes)::numeric, 0) end),
        (case when jsonb_typeof(v_ano_obj->'metaTotal') = 'array'
              then nullif((v_ano_obj->'metaTotal'->>v_mes)::numeric, 0) end)
      )
      -- Upsert: esta linha pode já existir, criada pelo trigger de
      -- `metas_carteira` acima, nesta mesma transação (ver comentário do
      -- bloco anterior).
      on conflict (tenant_id, ano, mes) do update set
        total_realizado = excluded.total_realizado,
        meta = excluded.meta,
        meta_total = excluded.meta_total;
      v_linhas_ano := v_linhas_ano + 1;
    end loop;
  end loop;

  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas, itens_gravados)
  values (v_tenant_id, 'metas', p_file_name, v_linhas_carteira + v_linhas_ano, v_linhas_carteira + v_linhas_ano);

  return jsonb_build_object('anos', v_anos_importados, 'linhas_carteira', v_linhas_carteira, 'linhas_ano', v_linhas_ano);
end;
$$;

grant execute on function public.com_importar_metas(text, jsonb) to authenticated;
