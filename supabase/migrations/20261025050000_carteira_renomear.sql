-- Frente 7d — renomear carteira, com memória. Ver
-- .scratch/plano-frente7d-renomear-carteira.md. A fonte é o dono,
-- 2026-09-24: "Não existe Carteira VIP e sim Carteira Especial (...)
-- Reconstrói o que é VIP virou Especial, assim toda vez que eu importar o
-- sistema já troca para Especial."
--
-- Carteira não tem cadastro (Frente 2, e continua) — ela existe por
-- aparecer escrita em `metas_carteira`, `com_metas` e `com_carteira_
-- membros`. Renomear é, portanto, reescrever o nome onde ele está e
-- lembrar a troca para a próxima importação.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. normalizar_nome_carteira — o lado do banco de `normalizarNomeCarteira`
-- (src/lib/carteira-nome.ts): sem acento, maiúsculo, sem espaço nas pontas.
-- As duas normalizações têm de casar byte a byte, senão "Berçário" gravado
-- pela tela não bate com "BERCARIO" vindo do HISTORICO_METAS.json — testado
-- contra os mesmos casos nas duas suítes (pgTAP aqui, Vitest em
-- src/lib/carteira-nome.test.ts). `unaccent` (schema `extensions`, já
-- instalada neste projeto) reproduz o mesmo strip de diacríticos que o
-- `normalize('NFD').replace(...)` do JavaScript faz — conferido caso a
-- caso, não por suposição.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.normalizar_nome_carteira(p_nome text)
returns text
language sql
immutable
as $$
  select upper(trim(extensions.unaccent(coalesce(p_nome, ''))));
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_carteira_renomeacoes — a memória. `de` é a forma NORMALIZADA (é
-- ela que uma importação futura, lendo a chave do JSON, também normaliza
-- antes de perguntar "isto já foi renomeado?"); `para` é o nome de destino,
-- também normalizado (mesma razão do item 1 do plano). PK em (tenant_id,
-- de): uma origem só pode apontar para um destino por vez — é a própria
-- cadeia (item 3 do plano) que reaproveita essa chave com `on conflict`.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.com_carteira_renomeacoes (
  tenant_id uuid not null default public.get_user_tenant_id(),
  de text not null,
  para text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (tenant_id, de)
);

alter table public.com_carteira_renomeacoes enable row level security;

-- Leitura: mesma porta de `metas_carteira`/`com_metas` — Comercial OU
-- Diretoria. A tela usa isto para mostrar, na lista de carteiras, quais
-- nomes antigos caem em cada uma (plano §4).
drop policy if exists com_carteira_renomeacoes_select on public.com_carteira_renomeacoes;
create policy com_carteira_renomeacoes_select on public.com_carteira_renomeacoes for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

-- Escrita: só quem grava a memória é `com_renomear_carteira` (abaixo),
-- rodando `security invoker` — passa por esta mesma policy, e é aqui que a
-- checagem de permissão da função encontra a segunda porta (RLS), não só a
-- primeira (o `if not ... raise` dentro dela).
drop policy if exists com_carteira_renomeacoes_insert on public.com_carteira_renomeacoes;
create policy com_carteira_renomeacoes_insert on public.com_carteira_renomeacoes for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

drop policy if exists com_carteira_renomeacoes_update on public.com_carteira_renomeacoes;
create policy com_carteira_renomeacoes_update on public.com_carteira_renomeacoes for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_renomear_carteira — a função que renomeia. Numa transação só
-- (é a função inteira: metade renomeada é pior que nada). `security
-- invoker`: os UPDATEs abaixo passam pela RLS de escrita de cada tabela,
-- que já exige metas.definir/admin — mas UPDATE barrado por policy só
-- filtra a linha (regra 12 do pgTAP: não levanta erro, afeta zero linhas em
-- silêncio). Por isso o passo 1 checa a permissão explicitamente e levanta
-- 42501 — nunca silêncio, como o plano pede.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_renomear_carteira(p_de text, p_para text, p_lembrar boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_de text;
  v_para text;
  v_linhas_metas_carteira int;
  v_linhas_com_metas int;
  v_linhas_com_carteira_membros int;
begin
  if v_tenant_id is null then
    raise exception 'usuário sem empresa' using errcode = '42501';
  end if;
  if not (public.is_admin_or_higher(auth.uid())
          or public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir')) then
    raise exception 'sem permissão para renomear carteira — falta metas.definir' using errcode = '42501';
  end if;

  v_de := public.normalizar_nome_carteira(p_de);
  v_para := public.normalizar_nome_carteira(p_para);

  if v_de = '' or v_para = '' then
    raise exception 'nome de carteira não pode ser vazio' using errcode = '22023';
  end if;
  if v_de = v_para then
    return jsonb_build_object('de', v_de, 'para', v_para,
      'linhas_metas_carteira', 0, 'linhas_com_metas', 0, 'linhas_com_carteira_membros', 0);
  end if;

  -- Item 2.3 do plano: renomear para um nome que já existe RECUSA — seria
  -- fundir duas carteiras, somando valores na mesma chave primária de
  -- `metas_carteira (tenant_id, ano, mes, carteira)`. Fusão é outra
  -- operação, com outra conversa; não nasce por engano de digitação. Sem
  -- desfazer (decisão do dono): esta recusa é a única trava, e por isso
  -- checa as três tabelas, não só uma.
  if exists (
    select 1 from public.metas_carteira
     where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_para
  ) or exists (
    select 1 from public.com_metas
     where tenant_id = v_tenant_id and carteira is not null and public.normalizar_nome_carteira(carteira) = v_para
  ) or exists (
    select 1 from public.com_carteira_membros
     where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_para
  ) then
    raise exception 'já existe uma carteira "%" — renomear fundiria as duas, e isto não é uma fusão', v_para
      using errcode = '23505';
  end if;

  update public.metas_carteira
     set carteira = v_para
   where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_de;
  get diagnostics v_linhas_metas_carteira = row_count;

  update public.com_metas
     set carteira = v_para
   where tenant_id = v_tenant_id and carteira is not null and public.normalizar_nome_carteira(carteira) = v_de;
  get diagnostics v_linhas_com_metas = row_count;

  update public.com_carteira_membros
     set carteira = v_para
   where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_de;
  get diagnostics v_linhas_com_carteira_membros = row_count;

  if p_lembrar then
    insert into public.com_carteira_renomeacoes (tenant_id, de, para)
    values (v_tenant_id, v_de, v_para)
    on conflict (tenant_id, de) do update
      set para = excluded.para, created_at = now(), created_by = auth.uid();

    -- Item "a cadeia de renomeações" do plano: A→B e depois B→C tem de
    -- deixar a memória resolvendo A→C e B→C — senão um arquivo antigo com A
    -- cairia em B, que já não existe. Ao gravar B→C, toda linha cujo `para`
    -- era B (inclusive a própria A→B recém-existente) passa a apontar para
    -- C.
    update public.com_carteira_renomeacoes
       set para = v_para
     where tenant_id = v_tenant_id and para = v_de and de <> v_para;
  end if;

  return jsonb_build_object('de', v_de, 'para', v_para,
    'linhas_metas_carteira', v_linhas_metas_carteira,
    'linhas_com_metas', v_linhas_com_metas,
    'linhas_com_carteira_membros', v_linhas_com_carteira_membros);
end;
$$;

grant execute on function public.com_renomear_carteira(text, text, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_carteiras_com_meses — a lista do plano §4: cada carteira conhecida
-- (mesma união de `com_carteiras_conhecidas`) com quantos meses ELA tem
-- `realizado` não nulo em `metas_carteira`. É o que mostra, sem o dono
-- precisar perguntar, que BERCARIO tem 12 linhas e nenhum valor. `security
-- invoker`: a RLS de cada tabela de origem (via `com_carteiras_conhecidas`
-- e `metas_carteira`) já filtra por tenant.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_carteiras_com_meses()
returns table (carteira text, meses_com_valor int)
language sql stable security invoker
set search_path = public
as $$
  select c.carteira, count(mc.realizado)::int as meses_com_valor
  from public.com_carteiras_conhecidas() c
  left join public.metas_carteira mc
    on mc.carteira = c.carteira and mc.realizado is not null
  group by c.carteira
  order by 1;
$$;

grant execute on function public.com_carteiras_com_meses() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. com_importar_metas passa a resolver pela memória (item 3 do plano —
-- a prova central desta frente). Mesmo corpo da migration 20261025040000,
-- só o valor gravado em `metas_carteira.carteira` deixa de ser a chave crua
-- do JSON: primeiro se pergunta à memória (pelo nome normalizado) se esta
-- carteira já foi renomeada; se sim, grava o destino; se não, grava a
-- chave do JSON como sempre gravou (nenhuma carteira sem renomeação
-- registrada muda de comportamento).
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
  v_carteira_final text;
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

        -- A memória: "VIP" no arquivo vira "ESPECIAL" no banco, para
        -- sempre, sem o dono lembrar de nada (item 3 do plano). Sem
        -- entrada na memória, grava a chave do JSON como sempre gravou.
        select para into v_carteira_final
          from public.com_carteira_renomeacoes
         where tenant_id = v_tenant_id and de = public.normalizar_nome_carteira(v_carteira_key);
        if v_carteira_final is null then
          v_carteira_final := v_carteira_key;
        end if;

        for v_mes in 0..11 loop
          insert into public.metas_carteira (tenant_id, ano, mes, carteira, realizado)
          values (v_tenant_id, v_ano, v_mes + 1, v_carteira_final, nullif((v_carteira_obj->>v_mes)::numeric, 0));
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
      -- `metas_carteira` acima, nesta mesma transação (ver comentário da
      -- migration 20261025040000).
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
