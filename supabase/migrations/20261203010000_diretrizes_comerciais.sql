-- DIRETRIZES COMERCIAIS (decisão do dono, 2026-10-04).
--
-- O exemplo do dono: "se o cliente comprou no mês 36 OX 6 volumes, ele consegue na próxima compra
-- um cashback de R$ 100". As quatro respostas dele, que esta migration segue ao pé da letra:
--
--   1. A diretriz mede uma FAMÍLIA ou um PRODUTO (um dos dois, escolhido na regra), com uma
--      QUANTIDADE MÍNIMA em unidades, contada no FATURADO (as notas importadas) do MÊS de
--      calendário — mês inteiro, como tudo que é mensal no Comercial.
--   2. O benefício: cashback em R$ (fixo), cashback em % do que o cliente comprou daquela
--      família/produto no mês, ou bonificação (um produto + quantas unidades). E uma condição
--      em texto livre.
--   3. O sistema CONTROLA a concessão: quem atingiu entra numa lista "a conceder"; quem aplica o
--      benefício marca "concedido", com quando, quem e o pedido. Nada esquecido, nada dado duas
--      vezes: uma concessão por diretriz × cliente × mês.
--   4. A diretriz vale para todos os clientes ou só para algumas tabelas de preço
--      (`com_clientes.tabela_base`, o mesmo atributo da grade de cashback).
--
-- E "quem está perto" (75% do mínimo ou mais, sem ter atingido) — o mesmo um quarto do farol do
-- cashback (`com_cashback_farol_clientes`): a vendedora liga e empurra.
--
-- O DESENHO DO "NUNCA DUAS VEZES". A lista "a conceder" NÃO é gravada: é a apuração de agora
-- (`com_diretrizes_apuracao`) menos o que já foi concedido. Linha em `com_diretrizes_concessoes`
-- só existe quando alguém CONCEDEU, e o `unique (diretriz_id, cliente_codigo, competencia)` é a
-- trava. Gravar o "a conceder" pediria um job para mantê-lo em dia a cada importação — e uma
-- devolução importada depois deixaria na lista quem já não atingiu mais.
--
-- O QUE A CONCESSÃO GRAVA É O QUE O BANCO APUROU. O gatilho de INSERT confere que o cliente
-- atingiu a diretriz naquele mês e grava a quantidade e o valor do benefício da apuração — a tela
-- não manda valor nenhum. Quem marcou e quando também são do banco (`auth.uid()`, `now()`).
--
-- QUEM FAZ O QUÊ:
--   * ler: quem tem o Comercial ou a Diretoria (o mesmo de `com_vendas_itens`);
--   * criar e editar diretriz: quem altera a aba nova "Diretrizes" das Configurações do Comercial
--     (`pode_alterar_aba('comercial', 'diretrizes')`);
--   * marcar concedido e desfazer: a mesma aba OU o gestor do Comercial
--     (`com_pode_gerir_carteiras()`). A vendedora NÃO marca — ela vê a lista e avisa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. As diretrizes
-- ─────────────────────────────────────────────────────────────────────────────
-- A chave estrangeira não sabe de empresa: sem o par (id, tenant_id), uma diretriz poderia
-- apontar para a família de outra empresa. O `unique` abaixo existe para a chave composta.
alter table public.com_familias
  drop constraint if exists com_familias_id_tenant_key,
  add constraint com_familias_id_tenant_key unique (id, tenant_id);

create table if not exists public.com_diretrizes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  -- Desativar em vez de apagar: a concessão já feita não perde a regra que a justificou.
  ativo boolean not null default true,

  -- O que se mede: uma família OU um produto, nunca os dois, nunca nenhum.
  familia_id uuid,
  produto_codigo text check (produto_codigo is null or btrim(produto_codigo) <> ''),
  quantidade_minima numeric not null check (quantidade_minima > 0),

  -- Nulo ou vazio = todas as tabelas de preço.
  tabelas text[],

  beneficio_tipo text not null
    check (beneficio_tipo in ('cashback_valor', 'cashback_percentual', 'bonificacao')),
  -- R$ no cashback em valor; % no cashback percentual; nulo na bonificação.
  beneficio_valor numeric,
  bonificacao_produto_codigo text,
  bonificacao_quantidade numeric,
  condicao text,

  -- A vigência é de MESES inteiros (a apuração é mensal): sempre o dia 1. Sem fim = sem prazo.
  vigencia_inicio date not null
    default date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
  vigencia_fim date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),

  unique (id, tenant_id),
  foreign key (familia_id, tenant_id) references public.com_familias (id, tenant_id),

  constraint com_diretrizes_familia_ou_produto
    check ((familia_id is null) <> (produto_codigo is null)),
  -- O `coalesce` é a trava do nulo: CHECK que dá nulo PASSA, e `null > 0` é nulo — sem ele, um
  -- cashback sem valor entraria.
  constraint com_diretrizes_beneficio_coerente check (coalesce(
    case beneficio_tipo
      when 'cashback_valor' then
        beneficio_valor > 0 and bonificacao_produto_codigo is null and bonificacao_quantidade is null
      when 'cashback_percentual' then
        beneficio_valor > 0 and beneficio_valor <= 100
        and bonificacao_produto_codigo is null and bonificacao_quantidade is null
      when 'bonificacao' then
        beneficio_valor is null
        and coalesce(btrim(bonificacao_produto_codigo), '') <> '' and bonificacao_quantidade > 0
      else false
    end, false)
  ),
  constraint com_diretrizes_vigencia check (
    extract(day from vigencia_inicio) = 1
    and (vigencia_fim is null or (extract(day from vigencia_fim) = 1 and vigencia_fim >= vigencia_inicio))
  )
);

comment on table public.com_diretrizes is
  'Diretrizes comerciais (decisão do dono, 2026-10-04): família ou produto, quantidade mínima no faturado do mês, e o benefício. Editadas em Comercial › Configurações › Diretrizes.';

create index if not exists com_diretrizes_tenant_idx on public.com_diretrizes (tenant_id, ativo);

drop trigger if exists trg_com_diretrizes_updated_at on public.com_diretrizes;
create trigger trg_com_diretrizes_updated_at
  before update on public.com_diretrizes
  for each row execute function public.handle_updated_at();

alter table public.com_diretrizes enable row level security;

drop policy if exists com_diretrizes_le on public.com_diretrizes;
create policy com_diretrizes_le on public.com_diretrizes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

-- Alterar: quem altera a aba. O `with check` repete a permissão do `using` (lição 15).
drop policy if exists com_diretrizes_altera on public.com_diretrizes;
create policy com_diretrizes_altera on public.com_diretrizes for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'diretrizes'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'diretrizes'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. As concessões — uma linha só quando alguém CONCEDEU
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.com_diretrizes_concessoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  diretriz_id uuid not null,
  cliente_codigo text not null,
  -- O mês apurado (dia 1).
  competencia date not null check (extract(day from competencia) = 1),
  quantidade_atingida numeric not null,
  -- R$ do benefício nos dois cashbacks; nulo na bonificação (o que se dá está na diretriz).
  valor_beneficio numeric,
  concedido_em timestamptz not null default now(),
  concedido_por uuid not null default auth.uid(),
  pedido text,
  observacao text,
  created_at timestamptz not null default now(),
  -- A trava do "nunca duas vezes".
  unique (diretriz_id, cliente_codigo, competencia),
  -- Concessão feita prende a diretriz: apagar a regra apagaria a história — desative.
  foreign key (diretriz_id, tenant_id) references public.com_diretrizes (id, tenant_id) on delete restrict
);

comment on table public.com_diretrizes_concessoes is
  'O benefício de uma diretriz comercial já concedido ao cliente naquele mês (decisão do dono, 2026-10-04). O "a conceder" é apurado, não gravado.';

create index if not exists com_diretrizes_concessoes_mes_idx
  on public.com_diretrizes_concessoes (tenant_id, competencia);

alter table public.com_diretrizes_concessoes enable row level security;

drop policy if exists com_diretrizes_concessoes_le on public.com_diretrizes_concessoes;
create policy com_diretrizes_concessoes_le on public.com_diretrizes_concessoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

-- Conceder: quem altera a aba ou o gestor. Não há policy de UPDATE: concessão errada se desfaz
-- (DELETE) e se marca de novo — o "quem" e o "quando" nunca são reescritos por cima.
drop policy if exists com_diretrizes_concessoes_concede on public.com_diretrizes_concessoes;
create policy com_diretrizes_concessoes_concede on public.com_diretrizes_concessoes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
    and (public.pode_alterar_aba('comercial', 'diretrizes') or (select public.com_pode_gerir_carteiras())));

drop policy if exists com_diretrizes_concessoes_desfaz on public.com_diretrizes_concessoes;
create policy com_diretrizes_concessoes_desfaz on public.com_diretrizes_concessoes for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
    and (public.pode_alterar_aba('comercial', 'diretrizes') or (select public.com_pode_gerir_carteiras())));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A apuração
-- ─────────────────────────────────────────────────────────────────────────────
-- Por (diretriz, cliente, mês), nos MESES INTEIROS que o período toca (decisão do dono para o que
-- é mensal; 10/03–20/03 apura março inteiro). Mesma base de `com_historico_do_cliente`: classe
-- venda e devolução, `quantidade_curva`/`valor_curva` (a devolução já vem negativa).
--
-- Devolve só o que pede ação ou é história: quem ATINGIU, quem está PERTO (75% ou mais do
-- mínimo) e o que já foi CONCEDIDO no período. Quem comprou pouco não aparece — farol que acende
-- sempre não acende nunca.
--
-- `security invoker` como toda a ficha: a RLS de `com_vendas_itens` (empresa, módulo e "a
-- vendedora só vê a carteira dela") governa. A concessão aparece mesmo se a diretriz foi
-- desativada depois, com a quantidade gravada no dia.
create or replace function public.com_diretrizes_apuracao(p_de date, p_ate date, p_cliente text default null)
returns table (
  diretriz_id uuid, diretriz text, cliente_codigo text, cliente_nome text, tabela_base text,
  competencia date, quantidade numeric, minimo numeric, falta numeric,
  atingiu boolean, perto boolean, valor_comprado numeric,
  beneficio_tipo text, beneficio_valor numeric, valor_beneficio numeric,
  bonificacao_produto_codigo text, bonificacao_quantidade numeric, condicao text,
  concessao_id uuid, concedido boolean, concedido_em timestamptz, concedido_por uuid,
  concedido_por_nome text, pedido text, observacao text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
-- As colunas de saída têm os nomes das colunas das tabelas; dentro da consulta, coluna ganha.
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_de date := date_trunc('month', p_de::timestamp)::date;
  v_ate date := date_trunc('month', p_ate::timestamp)::date;
begin
  if p_de is null or p_ate is null or p_de > p_ate then
    raise exception 'Período inválido: % a %.', p_de, p_ate using errcode = '22023';
  end if;

  return query
  with compras as (
    -- Produto de diretriz por produto casa pelo código; de diretriz por família, pela família do
    -- produto. Do lado que é nulo a comparação dá nulo, e o OR fica só com o outro.
    select d.id as diretriz_id, i.cliente_codigo, i.competencia,
           sum(i.quantidade_curva) as quantidade, sum(i.valor_curva) as valor
      from public.com_diretrizes d
      join public.com_vendas_itens i
        on i.tenant_id = d.tenant_id
       and i.competencia between v_de and v_ate
       and i.competencia >= d.vigencia_inicio
       and (d.vigencia_fim is null or i.competencia <= d.vigencia_fim)
       and i.classe in ('venda', 'devolucao')
       and (p_cliente is null or i.cliente_codigo = p_cliente)
      left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
     where d.tenant_id = v_tenant
       and d.ativo
       and (i.produto_codigo = d.produto_codigo or p.familia_id = d.familia_id)
     group by d.id, i.cliente_codigo, i.competencia
  ),
  apurado as (
    -- A restrição de tabela: cliente sem cadastro (ou sem tabela) só entra em diretriz sem
    -- restrição — a regra de "só SALÃO" não pode valer para quem nem sabemos se é salão.
    select c.diretriz_id, c.cliente_codigo, c.competencia, c.quantidade, c.valor
      from compras c
      join public.com_diretrizes d on d.id = c.diretriz_id
      left join public.com_clientes cl on cl.tenant_id = v_tenant and cl.codigo = c.cliente_codigo
     where coalesce(cardinality(d.tabelas), 0) = 0
        or cl.tabela_base = any (d.tabelas)
  ),
  concessoes as (
    select k.id, k.diretriz_id, k.cliente_codigo, k.competencia, k.quantidade_atingida,
           k.valor_beneficio, k.concedido_em, k.concedido_por, k.pedido, k.observacao
      from public.com_diretrizes_concessoes k
     where k.tenant_id = v_tenant
       and k.competencia between v_de and v_ate
       and (p_cliente is null or k.cliente_codigo = p_cliente)
  ),
  juntos as (
    select coalesce(a.diretriz_id, k.diretriz_id) as diretriz_id,
           coalesce(a.cliente_codigo, k.cliente_codigo) as cliente_codigo,
           coalesce(a.competencia, k.competencia) as competencia,
           coalesce(a.quantidade, k.quantidade_atingida, 0) as quantidade,
           coalesce(a.valor, 0) as valor,
           k.id as concessao_id, k.valor_beneficio as valor_concedido,
           k.concedido_em, k.concedido_por, k.pedido, k.observacao
      from apurado a
      full join concessoes k
        on k.diretriz_id = a.diretriz_id and k.cliente_codigo = a.cliente_codigo and k.competencia = a.competencia
  )
  select j.diretriz_id,
         d.nome,
         j.cliente_codigo,
         coalesce(cl.razao_social, j.cliente_codigo)::text,
         cl.tabela_base::text,
         j.competencia,
         j.quantidade,
         d.quantidade_minima,
         greatest(d.quantidade_minima - j.quantidade, 0),
         j.quantidade >= d.quantidade_minima,
         j.quantidade < d.quantidade_minima and j.quantidade >= d.quantidade_minima * 0.75,
         j.valor,
         d.beneficio_tipo,
         d.beneficio_valor,
         -- Concedido: o valor gravado no dia. A conceder: a conta de agora. Perto: nada ainda.
         case
           when j.concessao_id is not null then j.valor_concedido
           when j.quantidade < d.quantidade_minima then null
           when d.beneficio_tipo = 'cashback_valor' then d.beneficio_valor
           when d.beneficio_tipo = 'cashback_percentual' then round(j.valor * d.beneficio_valor / 100, 2)
         end,
         d.bonificacao_produto_codigo,
         d.bonificacao_quantidade,
         d.condicao,
         j.concessao_id,
         j.concessao_id is not null,
         j.concedido_em,
         j.concedido_por,
         coalesce(nullif(btrim(pr.full_name), ''), pr.email)::text,
         j.pedido,
         j.observacao
    from juntos j
    join public.com_diretrizes d on d.id = j.diretriz_id
    left join public.com_clientes cl on cl.tenant_id = v_tenant and cl.codigo = j.cliente_codigo
    left join public.profiles pr on pr.id = j.concedido_por
   where j.concessao_id is not null
      or j.quantidade >= d.quantidade_minima * 0.75
   order by j.competencia desc, d.nome, j.quantidade desc, j.cliente_codigo;
end;
$$;

comment on function public.com_diretrizes_apuracao(date, date, text) is
  'Diretrizes comerciais por (diretriz, cliente, mês), nos meses inteiros do período: quem atingiu, quem está perto (75%+) e o que já foi concedido. Decisão do dono, 2026-10-04.';

revoke all on function public.com_diretrizes_apuracao(date, date, text) from public, anon;
grant execute on function public.com_diretrizes_apuracao(date, date, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A concessão grava o que o banco apurou
-- ─────────────────────────────────────────────────────────────────────────────
-- `security definer` para a apuração enxergar a venda do cliente inteiro mesmo com "a vendedora
-- só vê a carteira dela" ligada — quem chega aqui já passou da policy de INSERT, que é de gestor.
-- A empresa continua sendo a de quem marca (`get_user_tenant_id()` dentro da apuração).
-- A policy de INSERT é conferida DEPOIS deste gatilho: uma vendedora que tente marcar um cliente
-- que atingiu passa por aqui e é barrada lá, com 42501.
create or replace function public.com_diretrizes_concessoes_confere()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atingiu boolean;
  v_quantidade numeric;
  v_valor numeric;
begin
  new.competencia := date_trunc('month', new.competencia::timestamp)::date;
  new.concedido_em := now();
  new.concedido_por := auth.uid();

  select a.atingiu, a.quantidade, a.valor_beneficio
    into v_atingiu, v_quantidade, v_valor
    from public.com_diretrizes_apuracao(new.competencia, new.competencia, new.cliente_codigo) a
   where a.diretriz_id = new.diretriz_id
     and a.cliente_codigo = new.cliente_codigo
     and a.competencia = new.competencia;

  if not coalesce(v_atingiu, false) then
    raise exception 'O cliente % não atingiu esta diretriz em %.', new.cliente_codigo, to_char(new.competencia, 'MM/YYYY')
      using errcode = '22023';
  end if;

  new.quantidade_atingida := v_quantidade;
  new.valor_beneficio := v_valor;
  return new;
end;
$$;

revoke all on function public.com_diretrizes_concessoes_confere() from public, anon;

drop trigger if exists trg_com_diretrizes_concessoes_confere on public.com_diretrizes_concessoes;
create trigger trg_com_diretrizes_concessoes_confere
  before insert on public.com_diretrizes_concessoes
  for each row execute function public.com_diretrizes_concessoes_confere();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A aba nova "Diretrizes" das Configurações do Comercial
-- ─────────────────────────────────────────────────────────────────────────────
-- A lista é a mesma de `src/config/abas-de-configuracao.ts` (o Vitest compara as duas).
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha']
    when 'marketing'   then array['chamados']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias', 'diretrizes']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;

-- Os perfis que já existem: quem altera os Indicadores do Comercial passa a abrir/alterar as
-- diretrizes do mesmo jeito — é quem define o que se mede (o mesmo critério das famílias).
update public.access_profiles
   set permissions = permissions || jsonb_build_object('config_diretrizes', permissions -> 'config_indicadores')
 where department = 'comercial'
   and permissions ? 'config_indicadores'
   and not (permissions ? 'config_diretrizes');
