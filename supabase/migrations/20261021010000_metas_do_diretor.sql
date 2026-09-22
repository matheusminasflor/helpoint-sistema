-- Frente 2 — metas e carteiras: desfaz o erro da L6d e liga a fonte real do
-- dono. Ver docs/metas-e-carteiras-fonte-da-verdade.md (manda sobre tudo
-- aqui) e .scratch/plano-frente2-metas-e-carteiras.md. Idempotente: pode ser
-- reaplicada sem erro.
--
-- O ERRO QUE SAI: a L6d fez o realizado por carteira ser CALCULADO somando
-- as vendas dos clientes daquela carteira (`com_metas_x_realizado`,
-- `com_metas_x_realizado_ano`, e para isso `com_carteiras` +
-- `com_clientes.carteira_id` + `com_atribuir_carteira`). Carteira não existe
-- no ERP — ela vive só nas tabelas de metas, alimentadas por
-- HISTORICO_METAS.json, onde o realizado por carteira JÁ VEM somado mês a
-- mês. Calcular pela venda inventa um número que o processo do dono não
-- produz, e é por não baterem que a conciliação existe.
--
-- O QUE FICA, ADAPTADO: `com_carteira_membros` ("quem responde por cada
-- carteira") e `com_metas` (a grade onde o diretor DEFINE, daqui pra frente,
-- uma meta por carteira ou total — funcionalidade nova que ele pediu, e que
-- dispara o aviso pelo sino). As duas perdiam a FK para `com_carteiras`
-- (que está saindo) e passam a guardar o NOME da carteira como TEXTO livre,
-- sem tabela de domínio — carteira é dado do dono; se ele criar uma quinta,
-- ela entra sozinha, sem migration.
--
-- Não são fontes concorrentes, são complementares: `metas_carteira` e
-- `metas_ano` (novas, abaixo) são o que o diretor JÁ MEDIU, importado do
-- JSON — realizado por carteira, total realizado e as metas históricas,
-- olhando pra trás. `com_metas` é o que ele DEFINE daqui pra frente, digitado
-- na grade do sistema — olhando pra diante. Nenhuma das duas soma venda.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_carteira_membros: carteira_id (uuid, FK para com_carteiras) → texto.
-- Guardado em `do $$ ... $$` com um `if exists` porque a migration precisa
-- ser idempotente: a segunda vez que rodar, a coluna `carteira_id` já não
-- existe mais (foi convertida na primeira), e um `update ... from com_
-- carteiras` estático quebraria quando `com_carteiras` já tiver sido
-- apagada (bloco 5). O `if exists` faz o bloco não rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'com_carteira_membros' and column_name = 'carteira_id'
  ) then
    alter table public.com_carteira_membros add column if not exists carteira text;
    update public.com_carteira_membros cm
      set carteira = c.nome
      from public.com_carteiras c
      where c.id = cm.carteira_id;
    alter table public.com_carteira_membros alter column carteira set not null;
    alter table public.com_carteira_membros drop column carteira_id;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_metas: a MESMA conversão (item 4 do plano manda fazer isto em com_
-- carteira_membros; com_metas tem a mesma FK para com_carteiras e por isso
-- precisa da mesma transformação — sem ela é impossível apagar com_
-- carteiras). `carteira_id` nulo era "meta TOTAL da empresa"; `carteira`
-- nula continua com o MESMO sentido — não se converte para uma string
-- "total", que voltaria a confundir com o balde "Sem carteira" que existia
-- em com_metas_x_realizado (esse balde não existe mais: sai com a função).
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'com_metas' and column_name = 'carteira_id'
  ) then
    alter table public.com_metas add column if not exists carteira text;
    update public.com_metas cm
      set carteira = c.nome
      from public.com_carteiras c
      where c.id = cm.carteira_id;
    alter table public.com_metas drop column carteira_id;
  end if;
end $$;

-- O índice de expressão antigo (`coalesce(carteira_id, sentinela)`) morreu
-- junto com a coluna que ele indexava (Postgres apaga índice dependente ao
-- apagar a coluna) — recriado aqui sobre o texto. Carteira nunca é '' de
-- verdade (vem do JSON do diretor ou da grade), então '' segue servindo de
-- sentinela para "isto é a meta total".
create unique index if not exists com_metas_unica
  on public.com_metas (tenant_id, ano, mes, coalesce(carteira, ''));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. notify_on_meta_definida — o aviso pelo sino continua no MESMO lugar
-- (trigger em com_metas, dispara em insert/update de valor), só troca
-- `carteira_id`/join por `carteira`/comparação de texto direta. Nome da
-- carteira agora É o valor da coluna — sem lookup nenhum.
--
-- Cuidado que a versão antiga não precisava ter: com uuid, cada carteira de
-- cada tenant tinha um id PRÓPRIO, então `where carteira_id = new.
-- carteira_id` já era isolado por tenant sem querer. Com texto, "VIP" é o
-- mesmo literal em todas as empresas — por isso o `and tenant_id = new.
-- tenant_id` abaixo é OBRIGATÓRIO, não estético. Testado retirando o
-- filtro (mutação manual, 2026-09-22): com duas empresas que têm uma
-- carteira "VIP" cada, definir a meta da carteira VIP na empresa A tenta
-- notificar também quem responde pela VIP da empresa B — e `notify_users`
-- recusa com `23503 foreign key violation` (o par user_id/tenant_id da
-- notificação não existe em `profiles`), fazendo o INSERT da meta falhar
-- por inteiro. Sem o filtro, a leva quebra a escrita de meta sempre que o
-- nome da carteira colidir entre empresas — não é um vazamento silencioso
-- aqui porque `notify_users` tem sua própria guarda, mas é uma quebra real.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.notify_on_meta_definida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membros uuid[];
begin
  if new.carteira is null then
    return new;
  end if;

  select array_agg(user_id) into v_membros
  from public.com_carteira_membros
  where carteira = new.carteira and tenant_id = new.tenant_id;

  perform public.notify_users(
    new.tenant_id,
    v_membros,
    'meta_definida'::public.notification_type,
    'com_meta',
    new.id,
    format('Meta de %s/%s definida', new.mes, new.ano),
    format('A meta da carteira %s para %s/%s é R$ %s.', new.carteira, new.mes, new.ano, public.fmt_brl(new.valor))
  );

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. O que sai — nesta ordem, porque com_carteiras só pode cair depois que
-- nada mais referencia o id dela (com_carteira_membros e com_metas já foram
-- convertidos acima; falta com_clientes.carteira_id).
-- ═══════════════════════════════════════════════════════════════════════════

-- 4a. com_atribuir_carteira e as duas funções que somavam venda por
-- carteira — são o erro que esta migration desfaz.
drop function if exists public.com_atribuir_carteira(uuid, text[], text);
drop function if exists public.com_metas_x_realizado(int, text);
drop function if exists public.com_metas_x_realizado_ano(int, text);

-- 4b. com_clientes.carteira_id — a policy de UPDATE dedicada a ela cai
-- primeiro (referencia a coluna no with check); o painel de atribuição em
-- lote na visão Clientes do Insights sai só no front (bloco 7 do plano).
drop policy if exists com_clientes_carteira_update on public.com_clientes;
alter table public.com_clientes drop column if exists carteira_id;

-- 4c. com_carteiras inteira: a semeadura automática (trigger em `tenants`,
-- não em com_carteiras — não cai só por apagar a tabela) e a tabela, com
-- RLS e as duas linhas que dependiam dela já convertidas.
drop trigger if exists trg_com_semear_carteiras on public.tenants;
drop function if exists public.com_semear_carteiras_on_tenant();
drop function if exists public.com_semear_carteiras(uuid);
drop table if exists public.com_carteiras;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. O que entra — esquema do anexo, literal (docs/metas-e-carteiras-
-- fonte-da-verdade.md §4), com tenant_id acrescido (isolamento por empresa é
-- barreira de segurança deste sistema, não se abre mão). Carteira é texto
-- livre, sem tabela de domínio — mesma razão do bloco 1.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.metas_carteira (
  tenant_id uuid not null default public.get_user_tenant_id(),
  ano int not null check (ano between 2000 and 2100),
  mes smallint not null check (mes between 1 and 12),
  carteira text not null,
  realizado numeric(14,2), -- NULL = sem dado. NUNCA zero (a causa do "Fechamento de 2025: R$ 0,00").
  primary key (tenant_id, ano, mes, carteira)
);

create table if not exists public.metas_ano (
  tenant_id uuid not null default public.get_user_tenant_id(),
  ano int not null check (ano between 2000 and 2100),
  mes smallint not null check (mes between 1 and 12),
  total_realizado numeric(14,2), -- anos[ano].total[mes] — conta bonificação.
  meta numeric(14,2),            -- anos[ano].meta[mes], ou METAS_<ano> se existir.
  meta_total numeric(14,2),      -- anos[ano].metaTotal[mes].
  primary key (tenant_id, ano, mes)
);

alter table public.metas_carteira enable row level security;
alter table public.metas_ano enable row level security;

-- Leitura: mesma porta de com_metas — Comercial OU Diretoria (a Diretoria
-- pode não ter o módulo Comercial concedido e ainda assim precisa ver a
-- meta; ADR d6/L6d, migration 20261017010000).
drop policy if exists metas_carteira_select on public.metas_carteira;
create policy metas_carteira_select on public.metas_carteira for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

drop policy if exists metas_carteira_insert on public.metas_carteira;
create policy metas_carteira_insert on public.metas_carteira for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

drop policy if exists metas_carteira_update on public.metas_carteira;
create policy metas_carteira_update on public.metas_carteira for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

drop policy if exists metas_carteira_delete on public.metas_carteira;
create policy metas_carteira_delete on public.metas_carteira for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

drop policy if exists metas_ano_select on public.metas_ano;
create policy metas_ano_select on public.metas_ano for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

drop policy if exists metas_ano_insert on public.metas_ano;
create policy metas_ano_insert on public.metas_ano for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

drop policy if exists metas_ano_update on public.metas_ano;
create policy metas_ano_update on public.metas_ano for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

drop policy if exists metas_ano_delete on public.metas_ano;
create policy metas_ano_delete on public.metas_ano for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. com_importar_metas — lê o HISTORICO_METAS.json (ou um recorte dele)
-- campo a campo (anexo §5). `security invoker`: quem grava passa pela
-- policy de insert acima, no molde de com_importar_vendas/com_importar_
-- clientes — sem checagem de permissão duplicada aqui dentro.
--
-- `nullif(x, 0)` é a regra inteira desta leva numa função do Postgres: um
-- valor JSON nulo, extraído com `->>`, já chega NULL antes do nullif; um
-- 0.0 chega 0 e o nullif apaga. As duas coisas nunca se plotam como
-- R$ 0,00 (a causa do "Fechamento de 2025" do anexo).
--
-- Reimportar um ano SUBSTITUI as linhas daquele ano (delete + insert) e não
-- toca nos outros — "importo tudo do zero" é por ano, não pelo arquivo
-- inteiro (o JSON de 2026 não pode apagar 2022-2025 de uma importação
-- anterior que não veio de novo neste arquivo).
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
      );
      v_linhas_ano := v_linhas_ano + 1;
    end loop;
  end loop;

  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas, itens_gravados)
  values (v_tenant_id, 'metas', p_file_name, v_linhas_carteira + v_linhas_ano, v_linhas_carteira + v_linhas_ano);

  return jsonb_build_object('anos', v_anos_importados, 'linhas_carteira', v_linhas_carteira, 'linhas_ano', v_linhas_ano);
end;
$$;

grant execute on function public.com_importar_metas(text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. com_importar_metas_do_ano — METAS_<ano>.json SOBREPÕE `meta` do ano
-- (nunca `total_realizado` nem `meta_total`, que não estão neste arquivo).
-- `p_metas` chega como array Postgres 1-indexado (mês 1 = janeiro direto,
-- sem o +1 do jsonb 0-indexado do bloco 6 — são duas fontes com convenções
-- de índice diferentes, cuidado ao portar).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_metas_do_ano(p_ano int, p_metas numeric[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_mes int;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if coalesce(array_length(p_metas, 1), 0) <> 12 then
    raise exception 'METAS_%s.json precisa ter 12 valores (um por mês); recebi %.', p_ano, coalesce(array_length(p_metas, 1), 0);
  end if;

  for v_mes in 1..12 loop
    update public.metas_ano
       set meta = nullif(p_metas[v_mes], 0)
     where tenant_id = v_tenant_id and ano = p_ano and mes = v_mes;
    if not found then
      insert into public.metas_ano (tenant_id, ano, mes, meta)
      values (v_tenant_id, p_ano, v_mes, nullif(p_metas[v_mes], 0));
    end if;
  end loop;

  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas, itens_gravados)
  values (v_tenant_id, 'metas', format('METAS_%s.json', p_ano), 12, 12);
end;
$$;

grant execute on function public.com_importar_metas_do_ano(int, numeric[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. com_carteiras_conhecidas — sem tabela de domínio (bloco 5), a tela
-- precisa de ALGUMA fonte para listar "quais carteiras existem hoje" (a
-- grade de com_metas, a seção "Quem responde por cada carteira"). É a união
-- das três tabelas que guardam nome de carteira — nunca um enum fixo no
-- código, que voltaria a exigir migration para a quinta carteira do dono.
-- `security invoker`: a RLS de cada tabela de origem já filtra por tenant.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_carteiras_conhecidas()
returns table (carteira text)
language sql stable security invoker
set search_path = public
as $$
  select mc.carteira from public.metas_carteira mc
  union
  select cm.carteira from public.com_metas cm where cm.carteira is not null
  union
  select cb.carteira from public.com_carteira_membros cb
  order by 1;
$$;

grant execute on function public.com_carteiras_conhecidas() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Seletor de ano (item 6 do anexo) — nunca fixo no código. União dos anos
-- com meta importada (metas_ano) e dos anos com venda na BASE
-- (com_anos_com_venda, 20261014020000) — o mesmo padrão, para o mesmo bug.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.metas_anos_disponiveis()
returns table (ano int)
language sql stable security invoker
set search_path = public
as $$
  select distinct ano from public.metas_ano
  union
  select ano from public.com_anos_com_venda()
  order by 1 desc;
$$;

grant execute on function public.metas_anos_disponiveis() to authenticated;
