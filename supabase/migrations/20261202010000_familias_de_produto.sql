-- FAMÍLIAS DE PRODUTO E O HISTÓRICO DO CLIENTE POR FAMÍLIA (decisão do dono, 2026-10-03).
--
-- `com_produtos` tem os 351 produtos vendidos, mas nenhum diz de que família é. O nome diz:
-- "6.0 LOURO ESCURO" é coloração, "BISNAGA TONALIZANTE CREME 50GR" é tonalizante, "AGUA
-- OXIGENADA MINAS COLOR 20 VOLUMES 900 ML" é OX de 20 volumes. O dono decidiu: o SISTEMA SUGERE
-- a família pelo nome, e o Comercial CONFIRMA ou corrige numa tela. Produto que nascer de uma
-- importação futura já nasce com a sugestão — e "a confirmar" até alguém olhar.
--
--   1. `com_familias` — a lista de famílias de cada empresa. A semente é EXEMPLO, nunca regra
--      (decisão do dono sobre os assistentes): o Comercial renomeia, cria e desativa na tela.
--   2. `com_produtos.familia_id` + `familia_confirmada`.
--   3. `com_sugerir_familia(nome)` — a regra da sugestão, pura, testável sozinha.
--   4. O gatilho que sugere no INSERT, e a sugestão dos produtos que já existem.
--   5. Quem altera: a aba nova "Famílias de produto" das Configurações do Comercial
--      (`pode_alterar_aba('comercial', 'familias')`), o mesmo mecanismo das outras abas desde a
--      LEVA P parte 7. NÃO `pode_configurar_setor('comercial')`: essa pergunta é a da aba
--      Chamados, e quem configura categorias de chamado não é, por isso, quem classifica produto.
--   6. `com_historico_do_cliente` e `com_compras_do_cliente` — o que a ficha mostra.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. As famílias
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.com_familias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  ordem int not null default 0,
  -- Desativar em vez de apagar: produto já classificado não perde a família por um clique.
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nome)
);

comment on table public.com_familias is
  'Famílias de produto do Comercial (decisão do dono, 2026-10-03). A semente é exemplo; o Comercial edita em Configurações › Famílias de produto.';

alter table public.com_familias enable row level security;

-- Ler: todo mundo da empresa (a ficha, a Diretoria, a tela de configuração).
drop policy if exists com_familias_le on public.com_familias;
create policy com_familias_le on public.com_familias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));

-- Alterar: quem altera a aba. O `with check` repete a permissão do `using` (lição 15).
drop policy if exists com_familias_altera on public.com_familias;
create policy com_familias_altera on public.com_familias for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'familias'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'familias'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A família do produto
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.com_produtos
  add column if not exists familia_id uuid references public.com_familias(id) on delete set null,
  -- `false` = é a sugestão do sistema, ninguém conferiu ainda. A tela filtra por isso.
  add column if not exists familia_confirmada boolean not null default false;

create index if not exists com_produtos_familia_idx on public.com_produtos (tenant_id, familia_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A sugestão pelo nome
-- ─────────────────────────────────────────────────────────────────────────────
-- Devolve o NOME da família da semente. A ORDEM das regras é a regra: a primeira que casa ganha.
--   * embalagem e brinde primeiro — "BISNAGA VAZIA" tem cara de tonalizante e não é;
--   * OX antes de coloração — "AGUA OXIGENADA MINAS COLOR 20 VOLUMES" tem "COLOR" no nome;
--   * pós-coloração antes de coloração — "PÓS-COLORAÇÃO" contém "COLORAÇÃO";
--   * o número de tom ("6.0 LOURO ESCURO") por último entre as químicas, depois das palavras de
--     tratamento: "MASCARA 1.0 KG" é máscara, não tom 1.0.
-- Fronteira de palavra no Postgres é `\m` (início) e `\M` (fim), não `\b`. Nunca `\M` logo
-- depois de letra acentuada: dependendo do locale, "Ê" não conta como letra de palavra e a
-- fronteira some. As classes trazem as letras acentuadas nas duas caixas porque `~*` sob locale
-- C não dobra caixa de letra acentuada.
-- ponytail: regex sobre o nome, sem dicionário. O teto é produto de nome atípico cair em
-- "Outros" — e é por isso que a sugestão nasce "a confirmar" e o Comercial corrige na tela.
create or replace function public.com_sugerir_familia(p_nome text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  n text := coalesce(p_nome, '');
  v_vol int;
begin
  if n ~* '(\mSACOLA|\mCAIXA|\mEMBALAGE|\mBRINDE|\mDISPLAY|\mCAT[AÁá]LOGO|\mFOLDER|\mETIQUETA|\mBANNER|\mVAZI[AO]|\mAVENTAL|\mTOALHA|\mPINCEL|\mTIGELA|\mLUVA|\mAMOSTRA)' then
    return 'Embalagem e brindes';
  end if;

  if n ~* '(\mOX\M|\mOXIGENADA|\mOXIDANTE|\mREVELADOR)' then
    v_vol := (regexp_match(n, '(\d{1,2})\s*VOL', 'i'))[1]::int;
    if v_vol in (6, 10, 20, 30, 40) then
      return 'OX ' || v_vol || ' vol';
    end if;
    return 'Outros';
  end if;

  if n ~* '\mDESCOLORA' then
    return 'Descolorante';
  end if;

  if n ~* '\mP[OÓó]S[\s-]*(COLORA|QU[IÍí]MICA)' then
    return 'Pós-coloração';
  end if;

  if n ~* '\mTONALIZA' then
    return 'Tonalizante';
  end if;

  if n ~* '\mCOLORA[CÇç]' then
    return 'Coloração';
  end if;

  if n ~* '(\mFINALIZA|\mLEAVE[\s-]*IN\M|\mSPRAY\M|\mMOUSSE\M|\mGEL\M|\mPOMADA\M|\mDEFINIDOR|\mMODELADOR|\mFIXADOR|\mPROTETOR\s+T[EÉé]RMICO|\mCREME\s+DE\s+PENTEAR)' then
    return 'Finalizador';
  end if;

  if n ~* '(\mM[AÁá]SCARA|\mSHAMPOO|\mXAMPU|\mCONDICIONADOR|\mSACH[EÊê]|\m[OÓó]LEO|\mAMPOLA|\mREPARADOR|\mHIDRATA|\mRECONSTRU|\mNUTRI|\mCAUTERIZA|\mBOTOX|\mPROGRESSIVA|\mSELAGEM|\mALISA|\mCREME|\mTRATAMENTO|\mQUERATINA|\mS[EÉé]RUM)' then
    return 'Tratamento';
  end if;

  -- O tom: "6.0 LOURO ESCURO", "7.1 LOURO MEDIO CINZA", "10.21 ...".
  if n ~ '^\s*\d{1,2}[.,]\d{1,3}\M' then
    return 'Coloração';
  end if;

  return 'Outros';
end;
$$;

comment on function public.com_sugerir_familia(text) is
  'A família sugerida pelo nome do produto (decisão do dono, 2026-10-03). Devolve um nome da semente de com_familias. A sugestão nasce a confirmar.';

revoke all on function public.com_sugerir_familia(text) from public, anon;
grant execute on function public.com_sugerir_familia(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A semente de cada empresa — a que existe e a que nascer
-- ─────────────────────────────────────────────────────────────────────────────
-- Molde de `com_semear_indicadores`: `on conflict do nothing` para rodar de novo sem ressuscitar
-- o que o Comercial renomeou.
create or replace function public.com_semear_familias(p_tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.com_familias (tenant_id, nome, ordem)
  select p_tenant, s.nome, s.ordem
  from (values
    ('Coloração', 1), ('Tonalizante', 2), ('Pós-coloração', 3), ('Descolorante', 4),
    ('OX 6 vol', 5), ('OX 10 vol', 6), ('OX 20 vol', 7), ('OX 30 vol', 8), ('OX 40 vol', 9),
    ('Tratamento', 10), ('Finalizador', 11), ('Embalagem e brindes', 12), ('Outros', 13)
  ) as s(nome, ordem)
  on conflict (tenant_id, nome) do nothing;
$$;

-- Semente é caminho de dentro (mesma régua de `com_semear_indicadores`).
revoke all on function public.com_semear_familias(uuid) from public, anon, authenticated;

create or replace function public.com_semear_familias_on_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.com_semear_familias(new.id);
  return new;
end;
$$;

revoke all on function public.com_semear_familias_on_tenant() from public, anon;

drop trigger if exists trg_com_semear_familias on public.tenants;
create trigger trg_com_semear_familias
  after insert on public.tenants
  for each row execute function public.com_semear_familias_on_tenant();

select public.com_semear_familias(t.id) from public.tenants t;

-- O gatilho da sugestão. `security definer` porque quem grava o produto é a importação, com a
-- identidade de quem importa — e a família tem de ser achada mesmo assim. Procura SÓ na empresa
-- do produto. Família renomeada ou desativada: o produto fica sem família, a confirmar.
create or replace function public.com_produtos_sugere_familia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.familia_id is null then
    select f.id into new.familia_id
      from public.com_familias f
     where f.tenant_id = new.tenant_id and f.ativo
       and f.nome = public.com_sugerir_familia(new.nome);
    new.familia_confirmada := false;
  end if;
  return new;
end;
$$;

revoke all on function public.com_produtos_sugere_familia() from public, anon;

drop trigger if exists trg_com_produtos_sugere_familia on public.com_produtos;
create trigger trg_com_produtos_sugere_familia
  before insert on public.com_produtos
  for each row execute function public.com_produtos_sugere_familia();

-- Os produtos que já existem ganham a sugestão, a confirmar.
update public.com_produtos p
   set familia_id = f.id, familia_confirmada = false
  from public.com_familias f
 where p.familia_id is null
   and f.tenant_id = p.tenant_id and f.ativo
   and f.nome = public.com_sugerir_familia(p.nome);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Quem altera a família do produto
-- ─────────────────────────────────────────────────────────────────────────────
-- A aba nova entra na lista de abas do Comercial. A lista é a mesma de
-- `src/config/abas-de-configuracao.ts` (o Vitest compara as duas).
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
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;

-- Os perfis que já existem: quem altera os Indicadores do Comercial passa a abrir/alterar as
-- famílias do mesmo jeito — é a mesma pessoa que define o que se mede. Perfil novo nasce pela
-- semente (`settings`), que o trigger da parte 7 já converte com a lista acima.
update public.access_profiles
   set permissions = permissions || jsonb_build_object('config_familias', permissions -> 'config_indicadores')
 where department = 'comercial'
   and permissions ? 'config_indicadores'
   and not (permissions ? 'config_familias');

-- A policy de UPDATE que já existia em `com_produtos` é a da importação (`vendas.importar`), e
-- policies de UPDATE se somam com OR (lição 15): sozinha, a policy nova deixaria quem altera
-- famílias mudar o nome do produto, e a antiga deixaria quem importa mudar a família. A policy
-- abre a porta; o gatilho abaixo confere COLUNA POR COLUNA quem mexeu em quê.
drop policy if exists com_produtos_familia_altera on public.com_produtos;
create policy com_produtos_familia_altera on public.com_produtos for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'familias'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'familias'));

create or replace function public.com_produtos_guarda_colunas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Escrita de outro gatilho é do sistema, não da pessoa (lição 8). Sem identidade (`service_role`,
  -- migration) também é sistema: quem chega pela API sem login nem passa da RLS de UPDATE.
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;
  if (new.familia_id is distinct from old.familia_id or new.familia_confirmada is distinct from old.familia_confirmada)
     and not public.pode_alterar_aba('comercial', 'familias') then
    raise exception 'Só quem altera "Famílias de produto" muda a família do produto.' using errcode = '42501';
  end if;
  -- A chave estrangeira não sabe de empresa: sem isto, um uuid de família de outra empresa passaria.
  if new.familia_id is distinct from old.familia_id and new.familia_id is not null
     and not exists (select 1 from public.com_familias f where f.id = new.familia_id and f.tenant_id = new.tenant_id) then
    raise exception 'Família de outra empresa.' using errcode = '42501';
  end if;
  if (new.codigo is distinct from old.codigo or new.nome is distinct from old.nome or new.tenant_id is distinct from old.tenant_id)
     and not (public.is_admin_or_higher(auth.uid())
              or public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar')) then
    raise exception 'O código e o nome do produto vêm da importação.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.com_produtos_guarda_colunas() from public, anon;

drop trigger if exists trg_com_produtos_guarda_colunas on public.com_produtos;
create trigger trg_com_produtos_guarda_colunas
  before update on public.com_produtos
  for each row execute function public.com_produtos_guarda_colunas();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O histórico do cliente por família, e as compras item a item
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma base de `com_ficha_comprou`: classe venda e devolução, `valor_curva`/`quantidade_curva`
-- (a devolução já vem negativa). `security invoker` como toda a ficha: a RLS de
-- `com_vendas_itens` (empresa, módulo e "a vendedora só vê a carteira dela") governa.
-- `p_de`/`p_ate` nulos = a história inteira. `p_filial` segue o filtro de filial da ficha.
create or replace function public.com_historico_do_cliente(
  p_codigo text, p_de date default null, p_ate date default null, p_filial text default null
)
returns table (competencia date, familia_id uuid, familia text, ordem int, quantidade numeric, valor numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select i.competencia, f.id, coalesce(f.nome, 'Sem família'), coalesce(f.ordem, 1000),
         sum(i.quantidade_curva), sum(i.valor_curva)
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    left join public.com_familias f on f.id = p.familia_id
   where i.tenant_id = (select public.get_user_tenant_id())
     and i.cliente_codigo = p_codigo
     and i.classe in ('venda', 'devolucao')
     and (p_de is null or i.emissao >= p_de)
     and (p_ate is null or i.emissao <= p_ate)
     and (p_filial is null or i.filial = p_filial)
   group by i.competencia, f.id, f.nome, f.ordem
   order by i.competencia, coalesce(f.ordem, 1000), coalesce(f.nome, 'Sem família');
$$;

revoke all on function public.com_historico_do_cliente(text, date, date, text) from public, anon;
grant execute on function public.com_historico_do_cliente(text, date, date, text) to authenticated;

-- A lista de compras, a mais recente primeiro. `p_limite` é o "ver mais" da tela: ela pede 50,
-- depois 100… — e `total` diz quantas existem, para o botão saber quando sumir.
create or replace function public.com_compras_do_cliente(
  p_codigo text, p_de date default null, p_ate date default null, p_filial text default null,
  p_limite int default 50
)
returns table (
  emissao date, documento text, serie text, classe text, produto_codigo text, produto text,
  familia text, quantidade numeric, valor numeric, total bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select i.emissao, i.documento, i.serie, i.classe, i.produto_codigo,
         coalesce(p.nome, i.produto_nome), coalesce(f.nome, 'Sem família'),
         i.quantidade_curva, i.valor_curva, count(*) over ()
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    left join public.com_familias f on f.id = p.familia_id
   where i.tenant_id = (select public.get_user_tenant_id())
     and i.cliente_codigo = p_codigo
     and i.classe in ('venda', 'devolucao')
     and (p_de is null or i.emissao >= p_de)
     and (p_ate is null or i.emissao <= p_ate)
     and (p_filial is null or i.filial = p_filial)
   order by i.emissao desc, i.documento desc, coalesce(p.nome, i.produto_nome)
   limit greatest(coalesce(p_limite, 50), 1);
$$;

revoke all on function public.com_compras_do_cliente(text, date, date, text, int) from public, anon;
grant execute on function public.com_compras_do_cliente(text, date, date, text, int) to authenticated;
