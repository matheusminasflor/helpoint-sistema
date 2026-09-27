-- "FINANCEIRO APROVADO" deixa de ser vendedor: quem assina é o responsável pela carteira
--
-- 2026-09-26, pedido do dono, com as três decisões dele:
--
--   1. o cliente é atrelado a uma das **carteiras que já existem** (ESPECIAL, MG,
--      DEMAIS ESTADOS, BERCARIO), e quem responde pela carteira é o vendedor;
--   2. a troca acontece **na leitura** — o histórico continua sendo cópia fiel do
--      Forteplus;
--   3. o sistema sabe quem é gente **ligando os códigos que SÃO vendedor**; o que
--      ninguém ligar fica de fora por si.
--
-- ══ O PROBLEMA, MEDIDO ══════════════════════════════════════════════════════
--
-- `com_vendas_itens.vendedor_codigo` vem do Forteplus, e os dois maiores não são
-- pessoas:
--
--   1638  FINANCEIRO APROVADO      R$ 5.017.738,47   168 clientes
--   1637  FINANCEIRO CONFERENCIA   R$   770.936,66    96 clientes
--   1610  CONECTA                  R$   148.040,37    30 clientes
--   1340  VENDEDOR 02              R$       247,88     1 cliente
--
-- R$ 5,79 milhões — **56% do faturamento** — em etapas do processo financeiro.
--
-- E adivinhar pelo histórico não resolve, o que é a razão de existir o vínculo
-- explícito: dos 186 clientes com nota nesses códigos, só **29** têm uma única
-- pessoa vendendo nas outras notas (R$ 785.818,33). **109 têm várias**
-- (R$ 4.884.387,13) e 48 nunca tiveram pessoa nenhuma (R$ 266.757,92). Escolher
-- por maioria seria inventar em 82% do valor.
--
-- ══ O CUSTO DA DECISÃO 1, QUE FOI AVISADO E É REAL ══════════════════════════
--
-- A carteira é REGIÃO, não pessoa: se três vendedores atendem MG, a região não
-- diz qual deles assina. `com_carteira_membros` permite vários por carteira de
-- propósito (é quem recebe o aviso da meta pelo sino).
--
-- Resolvido no banco, e não na sorte: a coluna `responsavel` marca **um** por
-- carteira, com índice único parcial. Sem isso, "o vendedor da carteira" seria
-- `limit 1` sem `order by` — o Postgres devolveria qualquer um, e mudaria de
-- resposta entre duas execuções. Um trigger marca o primeiro membro de cada
-- carteira automaticamente, então o caso comum (uma pessoa por carteira) não
-- pede clique nenhum.

begin;

-- ── 1. A carteira do cliente ────────────────────────────────────────────────
-- Texto, e sem CHECK: carteira é DADO do dono (`com_carteiras_conhecidas()` a
-- descobre de `metas_carteira`), e ele renomeia carteira pela tela. Um CHECK
-- aqui reprovaria a renomeação seguinte.
alter table public.com_clientes
  add column if not exists carteira text;

comment on column public.com_clientes.carteira is
  'A carteira (região) a que o cliente pertence. É por ela que a nota sem '
  'vendedor de verdade encontra quem assina — o responsável da carteira. Nulo = '
  'não atrelado, e a tela pede para atrelar.';

create index if not exists com_clientes_carteira_idx
  on public.com_clientes (tenant_id, carteira)
  where carteira is not null;

-- ── 2. Um responsável por carteira ──────────────────────────────────────────
alter table public.com_carteira_membros
  add column if not exists responsavel boolean not null default false;

comment on column public.com_carteira_membros.responsavel is
  'Quem ASSINA as notas da carteira quando o Forteplus não manda vendedor de '
  'verdade. Um por carteira (índice único parcial). Os outros membros continuam '
  'recebendo o aviso da meta pelo sino — para isso a carteira pode ter vários.';

-- Um por carteira. Parcial: os não-responsáveis não colidem entre si.
drop index if exists public.com_carteira_um_responsavel;
create unique index com_carteira_um_responsavel
  on public.com_carteira_membros (tenant_id, carteira)
  where responsavel;

-- O primeiro membro de uma carteira vira o responsável, sem ninguém clicar. Se
-- já houver um, o novo entra como membro comum — a tela é que move a marca.
--
-- `before insert` e não `after`: assim a linha já nasce com o valor, e o índice
-- único acima julga a linha final. Num `after` haveria um instante com zero
-- responsáveis e um UPDATE depois, que é trabalho a mais para o mesmo fim.
create or replace function public.com_primeiro_membro_e_responsavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel then
    return new;
  end if;
  if not exists (
    select 1 from public.com_carteira_membros m
     where m.tenant_id = new.tenant_id
       and m.carteira = new.carteira
       and m.responsavel
  ) then
    new.responsavel := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_com_primeiro_membro_e_responsavel on public.com_carteira_membros;
create trigger trg_com_primeiro_membro_e_responsavel
  before insert on public.com_carteira_membros
  for each row execute function public.com_primeiro_membro_e_responsavel();

-- ── 3. Quais códigos do Forteplus SÃO vendedor ──────────────────────────────
-- Pelo contrário, como o dono decidiu: liga-se quem é gente. O que não estiver
-- aqui não é vendedor — e amanhã o Forteplus pode criar "FINANCEIRO LIBERADO"
-- sem que ninguém precise mudar nada.
--
-- `user_id` é OPCIONAL: há 23 códigos de vendedor no histórico e cinco contas no
-- sistema. A maioria dos vendedores não tem login, e exigir um deixaria a tabela
-- vazia — que é o mesmo que não existir.
create table if not exists public.com_vendedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  codigo text not null,
  nome text not null,
  user_id uuid references public.profiles(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint com_vendedores_nome_check check (length(trim(nome)) between 1 and 160),
  constraint com_vendedores_unico unique (tenant_id, codigo)
);

comment on table public.com_vendedores is
  'Os códigos de vendedor do Forteplus que são PESSOA. Quem não está aqui não é '
  'vendedor — é o caso de FINANCEIRO APROVADO, FINANCEIRO CONFERENCIA e CONECTA, '
  'que somam 56% do faturamento do histórico. `user_id` é opcional porque a '
  'maioria dos vendedores não tem login no sistema.';

drop trigger if exists inject_tenant_id_com_vendedores on public.com_vendedores;
create trigger inject_tenant_id_com_vendedores before insert on public.com_vendedores
  for each row execute function public.inject_tenant_id();
drop trigger if exists handle_com_vendedores_updated_at on public.com_vendedores;
create trigger handle_com_vendedores_updated_at before update on public.com_vendedores
  for each row execute function public.handle_updated_at();

alter table public.com_vendedores enable row level security;

drop policy if exists com_vendedores_select on public.com_vendedores;
create policy com_vendedores_select on public.com_vendedores
  for select using (
    tenant_id = get_user_tenant_id()
    and (has_comercial_access(auth.uid()) or has_diretoria_access(auth.uid()))
  );

drop policy if exists com_vendedores_write on public.com_vendedores;
create policy com_vendedores_write on public.com_vendedores
  for all using (tenant_id = get_user_tenant_id() and has_comercial_access(auth.uid()))
  with check (tenant_id = get_user_tenant_id() and has_comercial_access(auth.uid()));

revoke all on public.com_vendedores from anon;

-- ── 4. Os códigos que apareceram nas notas, para a tela de vínculo ──────────
-- Sem isto, a tela ofereceria uma lista fixa ou traria `com_vendas_itens` inteira
-- para o navegador para tirar o `distinct` — o achado 5 da auditoria da L6c, que
-- já mordeu: o PostgREST corta em 1000 **em silêncio**.
create or replace function public.com_codigos_de_vendedor()
returns table (
  vendedor_codigo text,
  vendedor_nome text,
  valor numeric,
  clientes bigint,
  ultima_venda date,
  ligado boolean
)
language sql
stable
set search_path = public
as $$
  select
    i.vendedor_codigo,
    coalesce(max(i.vendedor_nome), i.vendedor_codigo) as vendedor_nome,
    sum(i.valor_curva) as valor,
    count(distinct i.cliente_codigo) as clientes,
    max(i.emissao) as ultima_venda,
    exists (
      select 1 from public.com_vendedores v
       where v.tenant_id = i.tenant_id and v.codigo = i.vendedor_codigo
    ) as ligado
  from public.com_vendas_itens i
  where i.tenant_id = (select public.get_user_tenant_id())
    and i.classe in ('venda', 'devolucao')
    and i.vendedor_codigo is not null
  group by i.tenant_id, i.vendedor_codigo
  order by sum(i.valor_curva) desc;
$$;

revoke all on function public.com_codigos_de_vendedor() from public, anon;
grant execute on function public.com_codigos_de_vendedor() to authenticated;

-- ── 5. Quem atende este cliente, com a regra aplicada NA LEITURA ────────────
-- Devolve UMA linha, e ela responde as três situações que o dono descreveu:
--
--   'vendedor'                → o responsável da carteira do cliente
--   'sem_carteira'            → cliente não atrelado a carteira: a tela pede
--                               para atrelar
--   'carteira_sem_responsavel'→ está na carteira, mas ninguém responde por ela
--
-- A FRASE fica na tela, não aqui: `situacao` é código, e texto de interface em
-- função SQL é tradução em dois lugares.
create or replace function public.com_atendimento_do_cliente(p_codigo text)
returns table (
  carteira text,
  situacao text,
  responsavel_id uuid,
  responsavel_nome text
)
language sql
stable
security invoker
set search_path = public
as $$
  with cli as (
    select c.carteira
    from public.com_clientes c
    where c.tenant_id = (select public.get_user_tenant_id())
      and c.codigo = p_codigo
  ),
  resp as (
    select m.user_id, p.full_name, p.email
    from public.com_carteira_membros m
    join public.profiles p on p.id = m.user_id
    where m.tenant_id = (select public.get_user_tenant_id())
      and m.responsavel
      and m.carteira = (select carteira from cli)
  )
  select
    (select carteira from cli) as carteira,
    case
      when (select carteira from cli) is null then 'sem_carteira'
      when not exists (select 1 from resp)    then 'carteira_sem_responsavel'
      else 'vendedor'
    end as situacao,
    (select user_id from resp) as responsavel_id,
    (select coalesce(nullif(trim(full_name), ''), email) from resp) as responsavel_nome;
$$;

revoke all on function public.com_atendimento_do_cliente(text) from public, anon;
grant execute on function public.com_atendimento_do_cliente(text) to authenticated;

-- ── 6. A lista por nota passa a dizer quem é gente ──────────────────────────
-- Mesma função da leva G, com UMA coluna a mais: `e_vendedor`. A tela usa isso
-- para não chamar "FINANCEIRO APROVADO" de vendedor — e para dizer, ao lado,
-- para quem aquela nota conta.
--
-- `drop` + `create`, e não `create or replace`: acrescentar coluna a um
-- `returns table` muda o tipo de retorno, e o Postgres recusa o replace com
-- "cannot change return type of existing function". Por isso esta é a única
-- função do arquivo que leva o par de **regra 14** no fim — sem ele, ela renasce
-- com `execute` para PUBLIC, e `anon` é público. Foi assim que o CI #115 caiu.
drop function if exists public.com_quem_atende_cliente(text, date, date, text);

create function public.com_quem_atende_cliente(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns table (
  vendedor_codigo text,
  vendedor_nome text,
  valor numeric,
  notas bigint,
  ultima_venda date,
  e_vendedor boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.vendedor_codigo,
    -- Quando o código está ligado, o nome que vale é o do CADASTRO: o Forteplus
    -- escreve "lorrany.samara" e "wagner.quintao" em algumas linhas, que é login
    -- e não nome de gente.
    coalesce(
      (select v.nome from public.com_vendedores v
        where v.tenant_id = i.tenant_id and v.codigo = i.vendedor_codigo),
      max(i.vendedor_nome),
      i.vendedor_codigo
    ) as vendedor_nome,
    sum(i.valor_curva) as valor,
    count(distinct i.documento) as notas,
    max(i.emissao) as ultima_venda,
    exists (
      select 1 from public.com_vendedores v
       where v.tenant_id = i.tenant_id and v.codigo = i.vendedor_codigo and v.ativo
    ) as e_vendedor
  from public.com_vendas_itens i
  where i.cliente_codigo = p_codigo
    and i.classe in ('venda', 'devolucao')
    and i.emissao between p_de and p_ate
    and (p_filial is null or i.filial = p_filial)
    and i.vendedor_codigo is not null
  group by i.tenant_id, i.vendedor_codigo
  order by sum(i.valor_curva) desc;
$$;

comment on function public.com_quem_atende_cliente(text, date, date, text) is
  'Os códigos de vendedor nas notas do cliente, com `e_vendedor` dizendo se '
  'aquele código é pessoa (está em `com_vendedores`). Quem responde de verdade '
  'pelo cliente é `com_atendimento_do_cliente`.';

revoke all on function public.com_quem_atende_cliente(text, date, date, text) from public, anon;
grant execute on function public.com_quem_atende_cliente(text, date, date, text) to authenticated;

commit;
