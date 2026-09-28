-- O lançamento da vendedora: a planilha de Gestão Comercial dentro do Helpoint (LEVA O)
--
-- A ESPECIFICAÇÃO é `docs/manual-gestao-comercial.md` — a transcrição do manual que o dono
-- mandou junto com a planilha em 2026-09-28. Onde este arquivo e aquele texto divergirem,
-- é defeito deste arquivo.
--
-- A DECISÃO QUE ORGANIZA TUDO, e que contraria a primeira proposta: **os números vêm do
-- lançamento da vendedora, não da nota fiscal importada.** Nas palavras do dono, o
-- preenchimento é o gancho — para lançar, a vendedora precisa ter o cliente na carteira
-- dela, e isso a obriga a montar a carteira e manter o cadastro. A nota fiscal não cria
-- essa obrigação. (Medido no dia: `com_carteira_membros` com ZERO linhas e os 450
-- clientes sem carteira. A máquina de carteira existia havia um mês e ninguém a usou.)
--
-- O QUE NASCE AQUI
--   1. `com_indicadores` — o catálogo das marcações Sim/Não. Editável pelo gestor; nasce
--      com os 14 indicadores e as 12 ações da planilha, como exemplo.
--   2. `com_interacoes` — uma linha por interação, como a aba da vendedora (manual §3).
--   3. `com_interacao_marcas` — os "Sim" de cada linha. Tabela, e não 26 colunas, porque
--      a lista é editável.
--   4. `com_metas_indicador` — a meta de cada indicador para cada vendedora (manual §9.3).
--   5. A trava de carteira em `com_clientes`: a vendedora TRAZ cliente do Histórico para a
--      carteira dela; TIRAR de outra carteira é só do gestor.
--   6. Quatro leituras para o Painel do Gestor.
--
-- QUEM É VENDEDORA: quem é membro de carteira (`com_carteira_membros`). Não existe
-- cadastro de vendedora à parte — o dono pediu que "quando eu tiver um vendedor novo
-- cadastrado, ele vai ter esses indicadores", e a forma de isso ser verdade sem passo
-- extra é o indicador nascer da carteira, não de uma lista que alguém esquece de manter.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Quem gere carteiras — a régua que já existe, com nome
-- ─────────────────────────────────────────────────────────────────────────────
-- É exatamente a condição das policies de `com_carteira_membros` (admin ou a permissão
-- `comercial.carteiras.gerir`). Vira função porque agora aparece em seis lugares; seis
-- cópias da mesma condição é como uma delas fica para trás na próxima mudança.
create or replace function public.com_pode_gerir_carteiras()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid())
      or public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir');
$$;

revoke all on function public.com_pode_gerir_carteiras() from public, anon;
grant execute on function public.com_pode_gerir_carteiras() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O catálogo de indicadores e ações
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.com_indicadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  -- `indicador` exige cliente (manual §3.1); `acao` não — campanha e treinamento podem ser
  -- internos (§4). A exigência sai do tipo, e não de uma coluna livre, para não existir
  -- "indicador que não exige cliente": seria o FAROL com outro nome.
  tipo text not null check (tipo in ('indicador', 'acao')),
  -- O que a vendedora vê ao marcar ("Venda ativa").
  nome text not null check (btrim(nome) <> ''),
  -- O que o gestor lê no painel ("Número de vendas ativas"). Nulo = usa o nome. Existe
  -- porque a planilha usa as duas redações e o dono conhece as duas.
  rotulo_painel text,
  ordem int not null default 0,
  ativo boolean not null default true,
  -- "No mês" conta a competência inteira; "na semana" conta de segunda a domingo (§6.3).
  periodo text not null default 'mes' check (periodo in ('mes', 'semana')),
  -- Além de contar no período, mostra quantos estão EM ABERTO (não concluídos), em qualquer
  -- data. É a linha 19 do painel, "Demandas pontuais em aberto": um estado, não um evento.
  conta_em_aberto boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, tipo, nome)
);

comment on table public.com_indicadores is
  'Catálogo das marcações Sim/Não da vendedora (indicadores e ações do FAROL). Editável pelo '
  'gestor; nasce com a lista da planilha de Gestão Comercial. Ver docs/manual-gestao-comercial.md.';

alter table public.com_indicadores enable row level security;

drop policy if exists com_indicadores_select on public.com_indicadores;
create policy com_indicadores_select on public.com_indicadores
  for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.has_comercial_access(auth.uid()))
              or (select public.has_diretoria_access(auth.uid()))));

-- Mudar o que se mede é a mesma decisão de mudar a meta: `metas.definir`.
drop policy if exists com_indicadores_escrita on public.com_indicadores;
create policy com_indicadores_escrita on public.com_indicadores
  for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.is_admin_or_higher(auth.uid()))
              or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.is_admin_or_higher(auth.uid()))
                   or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

-- A semente: a lista da planilha, na ordem da planilha. É EXEMPLO, não regra — o gestor
-- edita pela tela. `on conflict do nothing` para a função poder rodar de novo sem
-- ressuscitar o que o gestor renomeou (o nome antigo não existe mais, então nada colide,
-- e o que ele mantém não é duplicado).
create or replace function public.com_semear_indicadores(p_tenant uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.com_indicadores (tenant_id, tipo, nome, rotulo_painel, ordem, periodo, conta_em_aberto)
  select p_tenant, s.tipo, s.nome, s.rotulo, s.ordem, s.periodo, s.aberto
  from (values
    ('indicador', 'Contato para venda',          'Quantidade de contatos para vendas',                 1, 'mes',    false),
    ('indicador', 'Venda ativa',                 'Número de vendas ativas',                            2, 'mes',    false),
    ('indicador', 'Venda passiva',               'Número de vendas passivas',                          3, 'mes',    false),
    ('indicador', 'Passiva aumentada',           'Número de vendas passivas aumentadas',               4, 'mes',    false),
    ('indicador', 'Venda promocional',           'Número de vendas de promoções',                      5, 'mes',    false),
    ('indicador', 'Marcar reunião técnica',      'Marcação de reunião de dúvidas técnicas na semana',  6, 'semana', false),
    ('indicador', 'Reunião técnica realizada',   'Reuniões de dúvidas técnicas realizadas no mês',     7, 'mes',    false),
    ('indicador', 'Venda de evento',             'Venda de eventos na semana',                         8, 'semana', false),
    ('indicador', 'Evento realizado',            'Eventos realizados no mês',                          9, 'mes',    false),
    ('indicador', 'Prospecção ativa',            'Quantidade de contatos de prospecção ativa',        10, 'mes',    false),
    ('indicador', 'Prospecção passiva',          'Quantidade de contatos de prospecção passiva',      11, 'mes',    false),
    ('indicador', 'Contato inadimplente',        'Contatos feitos com inadimplentes',                 12, 'mes',    false),
    ('indicador', 'Venda inadimplente/inativo',  'Vendas para inadimplentes ou inativos',             13, 'mes',    false),
    ('indicador', 'Demanda pontual',             'Demandas pontuais na semana',                       14, 'semana', true),
    ('acao', 'Campanhas',                               null,  1, 'mes', false),
    ('acao', 'Eventos',                                 null,  2, 'mes', false),
    ('acao', 'Treinamento semanal com distribuidores',  null,  3, 'mes', false),
    ('acao', 'Pós-venda',                               null,  4, 'mes', false),
    ('acao', 'Indicação de novos distribuidores',       null,  5, 'mes', false),
    ('acao', 'Venda direta',                            null,  6, 'mes', false),
    ('acao', 'Evento PCF',                              null,  7, 'mes', false),
    ('acao', 'Proposta para diretoria',                 null,  8, 'mes', false),
    ('acao', 'Dúvidas relacionadas aos produtos',       null,  9, 'mes', false),
    ('acao', 'Pedido para evento',                      null, 10, 'mes', false),
    ('acao', 'Pedidos gerais',                          null, 11, 'mes', false),
    ('acao', 'Cashback',                                null, 12, 'mes', false)
  ) as s(tipo, nome, rotulo, ordem, periodo, aberto)
  on conflict (tenant_id, tipo, nome) do nothing;
$$;

-- Semente é caminho de dentro: quem está logado não semeia empresa alheia passando um uuid.
-- Mesma régua de `seed_crm_stages` em `anon_so_nas_portas_publicas.test.sql`.
revoke all on function public.com_semear_indicadores(uuid) from public, anon, authenticated;

create or replace function public.com_semear_indicadores_on_tenant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.com_semear_indicadores(new.id);
  return new;
end;
$$;

drop trigger if exists trg_com_semear_indicadores on public.tenants;
create trigger trg_com_semear_indicadores
  after insert on public.tenants
  for each row execute function public.com_semear_indicadores_on_tenant();

-- As empresas que já existem.
select public.com_semear_indicadores(t.id) from public.tenants t;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A interação — a linha da aba da vendedora
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.com_interacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  -- Quem lançou. A atividade conta para quem lançou (manual §6: "a atribuição é feita pela
  -- aba em que o lançamento foi registrado"). A policy obriga a ser `auth.uid()`.
  vendedor_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  -- Nulo permitido: ação interna (campanha, treinamento) não tem cliente (§4).
  cliente_codigo text,
  -- Obrigatória: define o mês e a semana dos painéis (§3.1).
  data date not null,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'agendado', 'concluido')),
  -- Um valor só, como a planilha. Só SOMA com status `concluido` e valor > 0 — a regra
  -- está nas leituras, não aqui, porque guardar o valor de um pedido ainda agendado é
  -- legítimo: é o que a vendedora sabe hoje.
  valor_venda numeric(14, 2) check (valor_venda is null or valor_venda >= 0),
  prazo date,
  observacoes text,
  -- O escape (decisão do dono): lançar para cliente de outra carteira, registrado.
  fora_da_carteira boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, cliente_codigo)
    references public.com_clientes(tenant_id, codigo) on update cascade on delete restrict
);

create index if not exists com_interacoes_vendedor_data on public.com_interacoes (tenant_id, vendedor_id, data);
create index if not exists com_interacoes_cliente on public.com_interacoes (tenant_id, cliente_codigo, data);

comment on table public.com_interacoes is
  'Uma linha por interação da vendedora (manual de Gestão Comercial §3). É daqui que sai todo '
  'número do Painel do Gestor. Venda só soma com status concluido e valor > 0.';

alter table public.com_interacoes enable row level security;

-- Ler: a própria, ou quem gere carteiras, ou a Diretoria.
drop policy if exists com_interacoes_select on public.com_interacoes;
create policy com_interacoes_select on public.com_interacoes
  for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (vendedor_id = auth.uid()
              or (select public.com_pode_gerir_carteiras())
              or (select public.has_diretoria_access(auth.uid()))));

-- Gravar: só em nome próprio, e o cliente tem de ser da carteira dela — ou o escape.
--
-- A CONDIÇÃO DE CARTEIRA LÊ `com_clientes`, NÃO `com_interacoes`. É o que a lição 13 exige:
-- uma função que reconsulta a própria tabela não enxerga a linha que está nascendo. Aqui
-- a consulta é na tabela do cliente, que já existe antes do lançamento.
drop policy if exists com_interacoes_insert on public.com_interacoes;
create policy com_interacoes_insert on public.com_interacoes
  for insert to authenticated
  with check (
    tenant_id = (select public.get_user_tenant_id())
    and vendedor_id = auth.uid()
    and (select public.has_comercial_access(auth.uid()))
    and (cliente_codigo is null
         or fora_da_carteira
         or exists (select 1 from public.com_clientes c
                     where c.tenant_id = com_interacoes.tenant_id
                       and c.codigo = com_interacoes.cliente_codigo
                       and c.carteira = any (coalesce((select public.com_minhas_carteiras()), array[]::text[]))))
  );

drop policy if exists com_interacoes_update on public.com_interacoes;
create policy com_interacoes_update on public.com_interacoes
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and vendedor_id = auth.uid())
  with check (
    tenant_id = (select public.get_user_tenant_id())
    and vendedor_id = auth.uid()
    and (cliente_codigo is null
         or fora_da_carteira
         or exists (select 1 from public.com_clientes c
                     where c.tenant_id = com_interacoes.tenant_id
                       and c.codigo = com_interacoes.cliente_codigo
                       and c.carteira = any (coalesce((select public.com_minhas_carteiras()), array[]::text[]))))
  );

-- Apagar: a própria, ou quem gere carteiras (limpar lançamento de quem saiu da empresa).
drop policy if exists com_interacoes_delete on public.com_interacoes;
create policy com_interacoes_delete on public.com_interacoes
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (vendedor_id = auth.uid() or (select public.com_pode_gerir_carteiras())));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As marcações Sim
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.com_interacao_marcas (
  interacao_id uuid not null references public.com_interacoes(id) on delete cascade,
  -- `restrict`: indicador já usado não se apaga, se desliga (`ativo = false`). Apagar
  -- sumiria com o histórico dos meses em que ele contou.
  indicador_id uuid not null references public.com_indicadores(id) on delete restrict,
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  primary key (interacao_id, indicador_id)
);

create index if not exists com_interacao_marcas_indicador on public.com_interacao_marcas (indicador_id);

alter table public.com_interacao_marcas enable row level security;

-- As marcações seguem a interação: quem lê a interação lê as marcas; quem pode mexer na
-- interação mexe nas marcas. A consulta é na tabela PAI, que já existe quando a marca nasce.
drop policy if exists com_interacao_marcas_select on public.com_interacao_marcas;
create policy com_interacao_marcas_select on public.com_interacao_marcas
  for select to authenticated
  using (exists (select 1 from public.com_interacoes i where i.id = interacao_id));

drop policy if exists com_interacao_marcas_insert on public.com_interacao_marcas;
create policy com_interacao_marcas_insert on public.com_interacao_marcas
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and exists (select 1 from public.com_interacoes i
                           where i.id = interacao_id and i.vendedor_id = auth.uid()));

drop policy if exists com_interacao_marcas_delete on public.com_interacao_marcas;
create policy com_interacao_marcas_delete on public.com_interacao_marcas
  for delete to authenticated
  using (exists (select 1 from public.com_interacoes i
                  where i.id = interacao_id
                    and (i.vendedor_id = auth.uid() or (select public.com_pode_gerir_carteiras()))));

-- INDICADOR EXIGE CLIENTE (manual §3.1). Ação não. Checado na marca porque é a marca que
-- sabe o tipo — e na interação, para o cliente não poder ser tirado depois de marcado.
-- `security definer` para ler catálogo e interação sem depender do RLS de quem grava: a
-- regra tem de valer igual para todo mundo, inclusive para o gestor.
create or replace function public.com_marca_exige_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tipo text;
  v_cliente text;
  v_tenant_indicador uuid;
  v_tenant_interacao uuid;
begin
  select tipo, tenant_id into v_tipo, v_tenant_indicador
    from public.com_indicadores where id = new.indicador_id;
  select cliente_codigo, tenant_id into v_cliente, v_tenant_interacao
    from public.com_interacoes where id = new.interacao_id;

  -- Marca de uma empresa num catálogo de outra: impossível pela tela, e por isso mesmo
  -- barrado aqui — é por onde um uuid adivinhado atravessaria a barreira do tenant.
  if v_tenant_indicador is distinct from v_tenant_interacao
     or new.tenant_id is distinct from v_tenant_interacao then
    raise exception 'Indicador e lançamento são de empresas diferentes.' using errcode = '42501';
  end if;

  if v_tipo = 'indicador' and v_cliente is null then
    raise exception 'Indicador comercial exige cliente. Ações do FAROL (campanha, treinamento…) podem ficar sem cliente.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_com_marca_exige_cliente on public.com_interacao_marcas;
create trigger trg_com_marca_exige_cliente
  before insert or update on public.com_interacao_marcas
  for each row execute function public.com_marca_exige_cliente();

create or replace function public.com_interacao_mantem_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.cliente_codigo is null and old.cliente_codigo is not null
     and exists (select 1 from public.com_interacao_marcas m
                   join public.com_indicadores ind on ind.id = m.indicador_id
                  where m.interacao_id = new.id and ind.tipo = 'indicador') then
    raise exception 'Este lançamento tem indicador comercial marcado, e indicador exige cliente. Desmarque o indicador antes de tirar o cliente.'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_com_interacao_mantem_cliente on public.com_interacoes;
create trigger trg_com_interacao_mantem_cliente
  before update on public.com_interacoes
  for each row execute function public.com_interacao_mantem_cliente();

-- GRAVAR O LANÇAMENTO É UMA OPERAÇÃO SÓ. Interação e marcas em duas chamadas do navegador
-- deixariam, na falha da segunda, um lançamento sem marca nenhuma — a mesma fragilidade do
-- encadeamento chamado→solicitação de Compras, que é feito em duas etapas no cliente. Aqui é
-- uma função, numa transação.
--
-- E A ORDEM IMPORTA, por dois motivos:
--   * as marcas entram DEPOIS da interação, em comando separado: o trigger que exige cliente
--     reconsulta `com_interacoes`, e dentro do MESMO comando ele não enxergaria a linha que
--     acabou de nascer (lição 13);
--   * na edição, as marcas que saíram são apagadas ANTES de atualizar a interação: senão tirar
--     o cliente e desmarcar o indicador no mesmo salvamento esbarraria no trigger que impede
--     tirar o cliente de quem tem indicador marcado.
--
-- `security invoker`: as policies valem como se a vendedora gravasse direto. O `returning`
-- é o que o PostgREST faria (lição 11) — a policy de SELECT é aplicada já no insert.
create or replace function public.com_salvar_interacao(p_id uuid, p_dados jsonb, p_marcas uuid[])
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_marcas uuid[] := coalesce(p_marcas, array[]::uuid[]);
begin
  if p_id is null then
    insert into public.com_interacoes
      (cliente_codigo, data, status, valor_venda, prazo, observacoes, fora_da_carteira)
    values (
      nullif(btrim(p_dados ->> 'cliente_codigo'), ''),
      (p_dados ->> 'data')::date,
      coalesce(nullif(p_dados ->> 'status', ''), 'em_andamento'),
      nullif(p_dados ->> 'valor_venda', '')::numeric,
      nullif(p_dados ->> 'prazo', '')::date,
      nullif(btrim(p_dados ->> 'observacoes'), ''),
      coalesce((p_dados ->> 'fora_da_carteira')::boolean, false)
    )
    returning id into v_id;
  else
    delete from public.com_interacao_marcas
     where interacao_id = p_id and not (indicador_id = any (v_marcas));

    update public.com_interacoes set
      cliente_codigo   = nullif(btrim(p_dados ->> 'cliente_codigo'), ''),
      data             = (p_dados ->> 'data')::date,
      status           = coalesce(nullif(p_dados ->> 'status', ''), 'em_andamento'),
      valor_venda      = nullif(p_dados ->> 'valor_venda', '')::numeric,
      prazo            = nullif(p_dados ->> 'prazo', '')::date,
      observacoes      = nullif(btrim(p_dados ->> 'observacoes'), ''),
      fora_da_carteira = coalesce((p_dados ->> 'fora_da_carteira')::boolean, false)
    where id = p_id
    returning id into v_id;

    -- Lição 12: UPDATE barrado por policy não levanta erro, afeta zero linhas. Sem esta
    -- linha a tela diria "salvo" para o lançamento de outra pessoa, que não mudou.
    if v_id is null then
      raise exception 'Lançamento não encontrado, ou é de outra pessoa.' using errcode = '42501';
    end if;
  end if;

  insert into public.com_interacao_marcas (interacao_id, indicador_id)
  select v_id, m from unnest(v_marcas) as m
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.com_salvar_interacao(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.com_salvar_interacao(uuid, jsonb, uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. As metas dos indicadores, por vendedora
-- ─────────────────────────────────────────────────────────────────────────────
-- `metrica` é um texto de propósito, porque o painel mistura duas naturezas:
--   'valor_vendas' | 'clientes_com_venda' | 'clientes_relacionados'  — calculadas;
--   'ind:<uuid>'   — um indicador ou ação do catálogo;
--   'aberto:<uuid>' — o "em aberto" de um indicador com `conta_em_aberto`.
-- O "% da meta" não tem meta própria: é o valor dividido pela meta de valor.
--
-- UMA META VALE ATÉ ALGUÉM MUDAR. Na planilha a meta é uma coluna só, que atravessa os
-- meses. Aqui cada mudança grava a competência em que passou a valer, e a leitura pega a
-- mais recente até a competência pedida — o gestor digita uma vez, e o histórico fica.
create table if not exists public.com_metas_indicador (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  vendedor_id uuid not null references public.profiles(id) on delete cascade,
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  metrica text not null check (metrica ~ '^(valor_vendas|clientes_com_venda|clientes_relacionados|ind:[0-9a-f-]{36}|aberto:[0-9a-f-]{36})$'),
  meta numeric(14, 2) not null check (meta >= 0),
  definida_por uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, vendedor_id, competencia, metrica)
);

alter table public.com_metas_indicador enable row level security;

drop policy if exists com_metas_indicador_select on public.com_metas_indicador;
create policy com_metas_indicador_select on public.com_metas_indicador
  for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.has_comercial_access(auth.uid()))
              or (select public.has_diretoria_access(auth.uid()))));

drop policy if exists com_metas_indicador_escrita on public.com_metas_indicador;
create policy com_metas_indicador_escrita on public.com_metas_indicador
  for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.is_admin_or_higher(auth.uid()))
              or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.is_admin_or_higher(auth.uid()))
                   or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A trava de carteira
-- ─────────────────────────────────────────────────────────────────────────────
-- Medido antes desta migration: a policy de UPDATE de `com_clientes` deixa QUALQUER
-- pessoa com o Comercial mudar a carteira de QUALQUER cliente. Com o lançamento exigindo
-- carteira, isso viraria o atalho: a vendedora puxaria para si o cliente da colega para
-- conseguir lançar. A decisão do dono é o escape "fora da minha carteira", registrado —
-- não a troca silenciosa.
--
-- A regra: trazer do Histórico (carteira nula) para a PRÓPRIA carteira, pode; qualquer
-- outra troca é do gestor.
--
-- `pg_trigger_depth() > 1` passa, pela lição 8: escrita de trigger é do sistema, não do
-- usuário. E `auth.uid()` nulo também passa — é o `service_role` e a migration, que não
-- têm usuário e não passam por RLS de qualquer forma.
-- O NOME DA CARTEIRA É NORMALIZADO AO GRAVAR, nas duas pontas. Até aqui nada normalizava
-- `com_clientes.carteira` nem `com_carteira_membros.carteira` — só `com_renomear_carteira`
-- usava `normalizar_nome_carteira`. Não importava enquanto a coluna do cliente estava vazia.
-- Agora o lançamento compara as duas (`c.carteira = any (com_minhas_carteiras())`), e
-- "Norte" num membro contra "NORTE" num cliente faria a vendedora não conseguir lançar para
-- o próprio cliente, sem mensagem que explicasse. A normalização é a mesma função que a
-- renomeação já usa — uma régua só para o que é "a mesma carteira".
create or replace function public.com_normaliza_carteira()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.carteira := nullif(public.normalizar_nome_carteira(new.carteira), '');
  return new;
end;
$$;

-- O `a_` no nome NÃO é enfeite: gatilhos do mesmo momento disparam em ordem alfabética, e
-- este tem de rodar ANTES de `trg_com_clientes_guarda_carteira` — senão a trava compararia o
-- nome cru ("Norte") com as carteiras normalizadas da vendedora ("NORTE") e recusaria.
drop trigger if exists trg_com_clientes_a_normaliza_carteira on public.com_clientes;
create trigger trg_com_clientes_a_normaliza_carteira
  before insert or update of carteira on public.com_clientes
  for each row execute function public.com_normaliza_carteira();

drop trigger if exists trg_com_carteira_membros_normaliza on public.com_carteira_membros;
create trigger trg_com_carteira_membros_normaliza
  before insert or update of carteira on public.com_carteira_membros
  for each row execute function public.com_normaliza_carteira();

update public.com_clientes set carteira = carteira where carteira is not null;
update public.com_carteira_membros set carteira = carteira;

create or replace function public.com_clientes_guarda_carteira()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- `helpoint.renomeando_carteira`: `com_renomear_carteira` move todos os clientes da
  -- carteira de uma vez, e já checou a permissão dela (`metas.definir`). O ajuste é local à
  -- transação (`set_config(..., true)`) e só se escreve por SQL — o PostgREST não expõe
  -- `set_config`, então o navegador não consegue ligá-lo.
  if new.carteira is not distinct from old.carteira
     or pg_trigger_depth() > 1
     or auth.uid() is null
     or current_setting('helpoint.renomeando_carteira', true) = 'on'
     or public.com_pode_gerir_carteiras() then
    return new;
  end if;

  if old.carteira is null
     and new.carteira = any (coalesce(public.com_minhas_carteiras(), array[]::text[])) then
    return new;
  end if;

  raise exception 'Só o gestor muda um cliente de carteira. Você pode trazer para a sua carteira um cliente que ainda está no Histórico; para atender cliente de outra carteira, lance marcando "fora da minha carteira".'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_com_clientes_guarda_carteira on public.com_clientes;
create trigger trg_com_clientes_guarda_carteira
  before update of carteira on public.com_clientes
  for each row execute function public.com_clientes_guarda_carteira();

-- Atribuir em lote: o que faltava para montar carteira sem abrir 450 fichas. A RPC de lote
-- antiga foi removida em `20261021010000`, quando carteira deixou de ser atributo do
-- cliente; voltou a ser em `20261107010000`, e o lote não voltou junto.
--
-- `security invoker`: a trava acima vale linha a linha. Em vez de deixar uma linha
-- proibida derrubar o lote inteiro, a função só tenta o que quem chamou pode fazer, e
-- devolve quantos ficaram de fora — para a tela dizer, em vez de falhar calada.
create or replace function public.com_atribuir_carteira_em_lote(p_codigos text[], p_carteira text)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_gestor boolean := public.com_pode_gerir_carteiras();
  v_carteira text := nullif(public.normalizar_nome_carteira(p_carteira), '');
  v_pedidos int := coalesce(array_length(p_codigos, 1), 0);
  v_atribuidos int;
begin
  if v_carteira is null and not v_gestor then
    raise exception 'Só o gestor devolve cliente ao Histórico.' using errcode = '42501';
  end if;
  if not v_gestor and not (v_carteira = any (coalesce(public.com_minhas_carteiras(), array[]::text[]))) then
    raise exception 'Você só pode trazer clientes para a sua própria carteira.' using errcode = '42501';
  end if;

  with feitos as (
    update public.com_clientes c
       set carteira = v_carteira, updated_at = now()
     where c.tenant_id = public.get_user_tenant_id()
       and c.codigo = any (p_codigos)
       and c.carteira is distinct from v_carteira
       and (v_gestor or c.carteira is null)
    returning 1
  )
  select count(*) into v_atribuidos from feitos;

  return jsonb_build_object(
    'pedidos', v_pedidos,
    'atribuidos', v_atribuidos,
    -- Já estavam nesta carteira, ou (para a vendedora) estavam na carteira de outra.
    'ficaram_de_fora', v_pedidos - v_atribuidos
  );
end;
$$;

revoke all on function public.com_atribuir_carteira_em_lote(text[], text) from public, anon;
grant execute on function public.com_atribuir_carteira_em_lote(text[], text) to authenticated;

-- RENOMEAR A CARTEIRA LEVA OS CLIENTES JUNTO. Até aqui `com_renomear_carteira` movia metas e
-- membros, e não os clientes — não fazia falta, porque a coluna do cliente estava vazia.
-- Agora faria: renomear "NORTE" para "NORTE MG" deixaria os clientes presos ao nome antigo,
-- e a vendedora deixaria de conseguir lançar para eles.
--
-- `create or replace` preserva a ACL (lição 14): não precisa de revoke/grant. O corpo é o de
-- `20261021010000`/`20261022010000` com uma linha a mais, marcada abaixo.
create or replace function public.com_renomear_carteira(p_de text, p_para text, p_lembrar boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := (select public.get_user_tenant_id());
  v_de   text := public.normalizar_nome_carteira(p_de);
  v_para text := public.normalizar_nome_carteira(p_para);
  v_mc int; v_cm int; v_mb int; v_cl int;
begin
  if not ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))) then
    raise exception 'Sem permissao para renomear carteira (metas.definir).' using errcode = '42501';
  end if;
  if v_de = '' or v_para = '' then
    raise exception 'Nome de carteira vazio.' using errcode = '22023';
  end if;
  if v_de = v_para then
    return jsonb_build_object('metas_carteira', 0, 'com_metas', 0, 'membros', 0, 'clientes', 0);
  end if;
  if exists (select 1 from public.metas_carteira where tenant_id = v_tenant and carteira = v_para) then
    raise exception 'Ja existe a carteira %. Renomear para ela seria fundir as duas, e isso nao se faz por engano.', v_para
      using errcode = '23505';
  end if;

  update public.metas_carteira set carteira = v_para where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_mc = row_count;
  update public.com_metas set carteira = v_para where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_cm = row_count;
  update public.com_carteira_membros set carteira = v_para where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_mb = row_count;

  -- A linha a mais (2026-09-28). A trava de carteira de `com_clientes` barraria quem tem
  -- `metas.definir` sem `carteiras.gerir`; o ajuste local à transação diz a ela que esta
  -- mudança já foi autorizada aqui em cima.
  perform set_config('helpoint.renomeando_carteira', 'on', true);
  update public.com_clientes set carteira = v_para where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_cl = row_count;
  perform set_config('helpoint.renomeando_carteira', 'off', true);

  if p_lembrar then
    update public.com_carteira_renomeacoes set para = v_para
     where tenant_id = v_tenant and para = v_de and de <> v_para;
    insert into public.com_carteira_renomeacoes (tenant_id, de, para)
    values (v_tenant, v_de, v_para)
    on conflict (tenant_id, de) do update set para = excluded.para;
    delete from public.com_carteira_renomeacoes where tenant_id = v_tenant and de = v_para;
  end if;

  return jsonb_build_object('metas_carteira', coalesce(v_mc, 0), 'com_metas', coalesce(v_cm, 0),
                            'membros', coalesce(v_mb, 0), 'clientes', coalesce(v_cl, 0));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. As leituras do Painel do Gestor
-- ─────────────────────────────────────────────────────────────────────────────
-- Todas `security invoker`: o RLS de `com_interacoes` decide o que cada um vê. A vendedora
-- que abrir o painel vê a própria linha; o gestor vê todas — sem uma regra de visibilidade
-- escrita duas vezes.
--
-- "HOJE" É O DIA DO BRASIL (lição 10): `(now() at time zone 'America/Sao_Paulo')::date`,
-- nunca `current_date`, que no servidor é UTC e vira o dia seguinte às 21h.

-- A cor do farol (manual §6.2). Uma verdade só: a tela recebe a cor pronta.
create or replace function public.com_cor_do_farol(p_realizado numeric, p_meta numeric)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    -- Meta zero ou ausente: "não existe uma referência válida para o farol" (§6.2). A tela
    -- avisa em vez de pintar — pintar de verde quem não tem meta ensina a ignorar o farol.
    when p_meta is null or p_meta <= 0 then 'sem_meta'
    when coalesce(p_realizado, 0) >= p_meta then 'verde'
    when coalesce(p_realizado, 0) >= p_meta * 0.70 then 'amarelo'
    else 'vermelho'
  end;
$$;

revoke all on function public.com_cor_do_farol(numeric, numeric) from public, anon;
grant execute on function public.com_cor_do_farol(numeric, numeric) to authenticated;

-- Classificação de 120 dias (manual §10), pela ÚLTIMA COMPRA CONSOLIDADA: a mais recente
-- entre o histórico importado do Forteplus (classe `venda`, valor > 0) e a última venda
-- LANÇADA e concluída. Reativação automática sai sozinha: a venda lançada muda o máximo.
--
-- O histórico importado entra aqui SEM contrariar a decisão do dono: ele não soma venda de
-- ninguém; só responde "desde quando este cliente não compra", que é o que o manual manda.
--
-- `p_ref` é o dia de referência. Nulo = hoje, no Brasil. O painel de um mês passado usa o
-- último dia daquele mês, para "ativo em março" significar março.
create or replace function public.com_situacao_120_dias(p_ref date default null)
returns table (cliente_codigo text, carteira text, ultima_compra date, dias_sem_comprar int, situacao text)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with ref as (
    select coalesce(p_ref, (now() at time zone 'America/Sao_Paulo')::date) as dia
  ),
  historico as (
    select vi.cliente_codigo, max(vi.emissao) as ultima
      from public.com_vendas_itens vi, ref
     where vi.classe = 'venda' and vi.valor_nota > 0 and vi.emissao <= ref.dia
     group by vi.cliente_codigo
  ),
  lancado as (
    select i.cliente_codigo, max(i.data) as ultima
      from public.com_interacoes i, ref
     where i.status = 'concluido' and i.valor_venda > 0
       and i.cliente_codigo is not null and i.data <= ref.dia
     group by i.cliente_codigo
  )
  select c.codigo,
         c.carteira,
         greatest(h.ultima, l.ultima) as ultima_compra,
         (ref.dia - greatest(h.ultima, l.ultima))::int as dias_sem_comprar,
         case
           when greatest(h.ultima, l.ultima) is null then 'nunca_comprou'
           when ref.dia - greatest(h.ultima, l.ultima) <= 120 then 'ativo'
           else 'inativo'
         end as situacao
    from public.com_clientes c
    cross join ref
    left join historico h on h.cliente_codigo = c.codigo
    left join lancado  l on l.cliente_codigo = c.codigo;
$$;

revoke all on function public.com_situacao_120_dias(date) from public, anon;
grant execute on function public.com_situacao_120_dias(date) to authenticated;

-- Quem aparece no painel: quem está numa carteira, e quem lançou na competência mesmo sem
-- carteira (o gestor que cobriu alguém, por exemplo). Só a própria pessoa, a menos que
-- quem pergunta gira carteiras ou seja da Diretoria.
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
  select distinct p.user_id, coalesce(nullif(btrim(pr.full_name), ''), pr.email), p.carteira
    from pessoas p
    join public.profiles pr on pr.id = p.user_id
   where p.user_id = auth.uid()
      or public.com_pode_gerir_carteiras()
      or public.has_diretoria_access(auth.uid());
$$;

revoke all on function public.com_vendedoras_do_painel(date) from public, anon;
grant execute on function public.com_vendedoras_do_painel(date) to authenticated;

-- O PAINEL: uma linha por (vendedora, métrica). EM LINHAS, e não em colunas, porque o dono
-- quer um dia ver na Diretoria os indicadores de todos os setores — e linhas de setores
-- diferentes se somam com `union`; colunas diferentes não.
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
           -- A semana é a da data de referência: hoje, se a competência é a corrente; o
           -- último dia do mês, se é passada.
           least((now() at time zone 'America/Sao_Paulo')::date,
                 (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date) as ref
  ),
  semana as (
    select date_trunc('week', janela.ref)::date as de,
           (date_trunc('week', janela.ref) + interval '7 days')::date as ate
      from janela
  ),
  vend as (select * from public.com_vendedoras_do_painel(p_competencia)),
  -- Interações do mês, de quem está no painel.
  mes as (
    select i.* from public.com_interacoes i, janela
     where i.data >= janela.de and i.data < janela.ate
  ),
  -- VENDA (manual §3.1): concluída, valor > 0, com cliente.
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
  -- Contagem de cada marca no período DELA (mês ou semana).
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
  -- "Em aberto": marcadas e não concluídas, de qualquer data até a referência.
  abertas as (
    select i.vendedor_id, ind.id as indicador_id, count(*) as qtd
      from public.com_interacao_marcas mk
      join public.com_interacoes i on i.id = mk.interacao_id
      join catalogo ind on ind.id = mk.indicador_id and ind.conta_em_aberto
      cross join janela
     where i.status <> 'concluido' and i.data <= janela.ref
     group by i.vendedor_id, ind.id
  ),
  -- A meta vigente: a mais recente com competência até a pedida.
  metas as (
    select distinct on (mi.vendedor_id, mi.metrica)
           mi.vendedor_id, mi.metrica, mi.meta
      from public.com_metas_indicador mi, janela
     where mi.competencia <= janela.de
     order by mi.vendedor_id, mi.metrica, mi.competencia desc
  ),
  linhas as (
    -- 1. Valor de venda acumulada do mês
    select v.vendedor_id, v.vendedor_nome, v.carteira, 1 as ordem,
           'valor_vendas'::text as metrica, 'Valor de venda acumulada do mês'::text as rotulo,
           'mes'::text as periodo, coalesce(vd.valor, 0)::numeric as realizado
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    -- 2. % da meta — calculada abaixo, a partir da linha 1
    select v.vendedor_id, v.vendedor_nome, v.carteira, 2, 'pct_meta',
           '% de vendas acumulada x meta', 'mes', null
      from vend v
    union all
    -- 3. Clientes com vendas no mês
    select v.vendedor_id, v.vendedor_nome, v.carteira, 3, 'clientes_com_venda',
           'Quantidade de clientes com vendas no mês', 'mes', coalesce(vd.clientes, 0)
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    -- 4. Clientes que relacionou
    select v.vendedor_id, v.vendedor_nome, v.carteira, 4, 'clientes_relacionados',
           'Quantidade de clientes que relacionou', 'mes', coalesce(r.clientes, 0)
      from vend v left join relacionados r on r.vendedor_id = v.vendedor_id
    union all
    -- 5 em diante: um por indicador ativo do catálogo (as ações vão para o FAROL)
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
         case when l.metrica = 'pct_meta' then case when mv.meta > 0 then 100 end else mt.meta end as meta,
         case when l.metrica = 'pct_meta'
              then case when mv.meta > 0 then round(coalesce(vd.valor, 0) / mv.meta * 100, 1) end
              else l.realizado end as realizado,
         case when l.metrica = 'pct_meta'
              then public.com_cor_do_farol(coalesce(vd.valor, 0), mv.meta)
              else public.com_cor_do_farol(l.realizado, mt.meta) end as cor
    from linhas l
    left join metas mt on mt.vendedor_id = l.vendedor_id and mt.metrica = l.metrica
    left join metas mv on mv.vendedor_id = l.vendedor_id and mv.metrica = 'valor_vendas'
    left join vendas vd on vd.vendedor_id = l.vendedor_id
   order by l.vendedor_nome, l.ordem;
$$;

revoke all on function public.com_painel_do_gestor(date) from public, anon;
grant execute on function public.com_painel_do_gestor(date) to authenticated;

-- O FAROL de ações (manual §4): quantas vezes cada vendedora marcou cada ação no mês.
-- Ação não exige cliente, então aqui não se filtra cliente.
create or replace function public.com_farol_de_acoes(p_competencia date)
returns table (indicador_id uuid, acao text, ordem int, vendedor_id uuid, vendedor_nome text, quantidade bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select ind.id, ind.nome, ind.ordem, v.vendedor_id, v.vendedor_nome,
         count(i.id) as quantidade
    from public.com_indicadores ind
    cross join public.com_vendedoras_do_painel(p_competencia) v
    left join public.com_interacao_marcas mk on mk.indicador_id = ind.id
    left join public.com_interacoes i
           on i.id = mk.interacao_id
          and i.vendedor_id = v.vendedor_id
          and i.data >= date_trunc('month', p_competencia)::date
          and i.data < (date_trunc('month', p_competencia) + interval '1 month')::date
   where ind.tipo = 'acao' and ind.ativo
   group by ind.id, ind.nome, ind.ordem, v.vendedor_id, v.vendedor_nome
   order by ind.ordem, v.vendedor_nome;
$$;

revoke all on function public.com_farol_de_acoes(date) from public, anon;
grant execute on function public.com_farol_de_acoes(date) to authenticated;

-- O RESUMO DA CARTEIRA (manual §7), por vendedora, com as TRÊS leituras de ticket (§7.1),
-- que de propósito não dão o mesmo número:
--   ticket_ativos      = vendas de ativos    ÷ compradores ativos ÚNICOS
--   ticket_inativos    = vendas de inativos  ÷ compradores inativos únicos
--   media_base_ativa   = vendas de ativos    ÷ TOTAL de clientes ativos da carteira
--
-- "ATIVO" DE UM COMPRADOR é a situação ANTES da venda do mês: se a última compra
-- consolidada até a véspera da competência está a até 120 dias do início dela. Quem
-- estava inativo e comprou é o "reativado" do manual, e conta do lado dos inativos — é
-- exatamente o que o manual chama de "compradores inativos ou reativados".
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
  -- A situação na véspera da competência, para separar ativos de reativados.
  situacao_antes as (
    select * from public.com_situacao_120_dias((select de - 1 from janela))
  ),
  vend as (select * from public.com_vendedoras_do_painel(p_competencia)),
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
         (select count(*) from situacao_agora s where s.carteira = vd.carteira),
         (select count(*) from situacao_agora s where s.carteira = vd.carteira and s.situacao = 'ativo'),
         (select count(*) from situacao_agora s where s.carteira = vd.carteira and s.situacao = 'inativo'),
         (select count(*) from situacao_agora s where s.carteira = vd.carteira and s.situacao = 'nunca_comprou'),
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
                       / nullif((select count(*) from situacao_agora s where s.carteira = vd.carteira and s.situacao = 'ativo'), 0), 2)
            from venda_classificada c where c.vendedor_id = vd.vendedor_id and c.era_ativo)
    from vend vd
   order by vd.vendedor_nome;
$$;

revoke all on function public.com_resumo_da_carteira(date) from public, anon;
grant execute on function public.com_resumo_da_carteira(date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Confere no próprio banco
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_sem_semente int;
  v_aberta text;
begin
  -- Toda empresa nasce com a lista da planilha.
  select count(*) into v_sem_semente
    from public.tenants t
   where (select count(*) from public.com_indicadores i where i.tenant_id = t.id) < 26;
  if v_sem_semente > 0 then
    raise exception '% empresa(s) ficaram sem os 26 indicadores e ações da planilha', v_sem_semente;
  end if;

  -- Nenhuma função nova alcançável por anon (lição 14).
  select string_agg(p.proname, ', ') into v_aberta
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prokind = 'f'
     and p.proname in ('com_pode_gerir_carteiras', 'com_atribuir_carteira_em_lote', 'com_cor_do_farol',
                       'com_salvar_interacao',
                       'com_situacao_120_dias', 'com_vendedoras_do_painel', 'com_painel_do_gestor',
                       'com_farol_de_acoes', 'com_resumo_da_carteira', 'com_semear_indicadores')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_aberta is not null then
    raise exception 'funções abertas para anon: %', v_aberta;
  end if;

  -- A semente fechada até para quem está logado.
  if has_function_privilege('authenticated', 'public.com_semear_indicadores(uuid)', 'execute') then
    raise exception 'com_semear_indicadores ficou executável por authenticated';
  end if;
end $$;
