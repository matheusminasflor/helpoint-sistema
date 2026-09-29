-- CHECKLIST DE PEDIDOS COMERCIAL × FINANCEIRO (LEVA S, parte 1 — o banco). 2026-09-29.
--
-- A ESPECIFICAÇÃO é `docs/manual-checklist-pedidos.md`: o manual técnico do sistema que o dono montou
-- fora do Helpoint (Supabase `MF_INTERNO`, em uso desde 16/09). Onde este arquivo e o manual
-- divergirem sem uma decisão registrada abaixo, é defeito deste arquivo.
--
-- O QUE O MANUAL JÁ DECIDIU, E VEM IGUAL
--   * Situação derivada, nunca gravada (§3.3): finalizado → decisão vigente → Em análise.
--   * Versão + decisão carimbada (§3.4): editar sobe a versão; a decisão vigente é a da versão atual,
--     então o recusado que a vendedora corrige volta a "Em análise" sozinho. O contador de recusas
--     ignora a versão — mede retrabalho e não zera.
--   * Decisões, pagamentos e finalizações são só-inserção (§3.5). Nenhuma policy de update/delete.
--   * Aprovado não se edita; decisão repetida na mesma versão é recusada; pagamento depois de Pago é
--     recusado; finalizar exige aprovado E pago (§7.1).
--   * Valor total = só os pedidos tipo Venda (§6.7). Tolerância e travas do espelho: parte S4.
--
-- O QUE MUDA, POR DECISÃO DO DONO (2026-09-29)
--   * O checklist NASCE NO LANÇAMENTO da vendedora (`com_interacoes`): "primeiro o checklist e depois
--     os dados que medem os indicadores". Um lançamento tem no máximo um checklist, e o valor da venda
--     do lançamento passa a ser a soma dos pedidos tipo Venda — uma digitação só.
--   * O recebimento segue o fluxo do manual: aprovado fica "Em negociação" até o Financeiro registrar
--     Pago; recusa volta ao Comercial com o motivo.
--
-- AS DÍVIDAS TÉCNICAS DO MANUAL (§14) QUE ESTA MIGRATION PAGA
--   1. Atendente deixa de ser lista fixa: quem decide é a pessoa logada, carimbada pelo banco.
--   2. Os 14 itens deixam de ser colunas: `ped_itens` (configuração) + `ped_respostas`.
--   3. Leitura deixa de ser aberta a todo autenticado: a vendedora vê os dela; quem gere carteiras, o
--      Financeiro com a permissão e a Diretoria veem todos.
--   5. As três validações que só existiam na tela moram no banco: todos os itens respondidos, nenhum
--      "Não", justificativa onde o item pede, e a coerência do ST com o espelho.
--   7. Editar não apaga e reinsere: os pedidos são atualizados pela ordem, e cada decisão guarda a
--      foto (`snapshot`) do que foi decidido.
--   8. Protocolo sequencial POR EMPRESA.
--   Listas fixas de motivo de recusa (1) viram `ped_motivos_recusa`, editável.
--
-- COMO SE ESCREVE
--   Checklist, pedidos e respostas: só pela função `ped_salvar_checklist` (uma transação, com todas as
--   validações no fim) — não há policy de escrita nessas três tabelas. Decisão, pagamento e
--   finalização: insert direto do Financeiro, com as regras em trigger.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Quem faz o quê
-- ─────────────────────────────────────────────────────────────────────────────
-- Permissões no perfil de acesso do Financeiro, módulo `conferencia`:
--   view      → ver todos os checklists
--   decidir   → aprovar e recusar
--   pagamento → registrar pagamento e finalizar
create or replace function public.ped_pode_decidir()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'conferencia', 'decidir'), false);
$$;

create or replace function public.ped_pode_registrar_pagamento()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'conferencia', 'pagamento'), false);
$$;

create or replace function public.ped_ve_todos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or public.com_pode_gerir_carteiras()
      or public.has_diretoria_access(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'conferencia', 'view'), false)
      or public.ped_pode_decidir()
      or public.ped_pode_registrar_pagamento();
$$;

-- A aba "Conferência de pedidos" nas configurações do Financeiro (itens e motivos).
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha']
    when 'marketing'   then array['chamados']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback']
    when 'educacional' then array['chamados']
    else array[]::text[]
  end;
$$;

-- Os perfis que já existem. O Financeiro de hoje (3 pessoas, manual §8) confere, registra
-- pagamento e finaliza — Gestor e Operador ganham as três; Somente leitura, só ver. A aba de
-- configuração vai para quem já configura o resto do Financeiro.
-- ponytail: empresa criada depois disto nasce com os perfis da semente, sem `conferencia`; quem
-- configura marca no perfil. Só a Minasflor usa o sistema (ADR-005 revertida).
update public.access_profiles
   set permissions = permissions
       || jsonb_build_object('conferencia', case name
            when 'Somente leitura' then '{"view": true}'::jsonb
            else '{"view": true, "decidir": true, "pagamento": true}'::jsonb end)
 where department = 'financeiro' and name in ('Gestor', 'Operador', 'Somente leitura')
   and not permissions ? 'conferencia';
update public.access_profiles
   set permissions = permissions || jsonb_build_object('config_conferencia', permissions -> 'config_chamados')
 where department = 'financeiro' and permissions ? 'config_chamados' and not permissions ? 'config_conferencia';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Configuração: os itens da conferência e os motivos de recusa
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ped_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  rotulo text not null check (btrim(rotulo) <> ''),
  -- A dica que aparece embaixo do item ("a mesma do cadastro, nunca em branco").
  ajuda text,
  ordem int not null default 0,
  -- "Sim" abre justificativa obrigatória (bonificação, cashback, publicidade — manual §6.2).
  pede_justificativa boolean not null default false,
  -- A única regra que o banco reconhece por item: 'st' confere a resposta com o ST do espelho.
  regra text check (regra in ('st')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, rotulo)
);
create unique index ped_itens_uma_regra on public.ped_itens (tenant_id, regra) where regra is not null;

create table public.ped_motivos_recusa (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (tenant_id, nome)
);

alter table public.ped_itens enable row level security;
alter table public.ped_motivos_recusa enable row level security;

create policy ped_itens_select on public.ped_itens for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.has_comercial_access(auth.uid())) or (select public.has_fin_access(auth.uid()))
              or (select public.ped_ve_todos())));
create policy ped_itens_escrita on public.ped_itens for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_alterar_aba('financeiro', 'conferencia')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_alterar_aba('financeiro', 'conferencia')));

create policy ped_motivos_select on public.ped_motivos_recusa for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.has_comercial_access(auth.uid())) or (select public.has_fin_access(auth.uid()))
              or (select public.ped_ve_todos())));
create policy ped_motivos_escrita on public.ped_motivos_recusa for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_alterar_aba('financeiro', 'conferencia')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_alterar_aba('financeiro', 'conferencia')));

-- A semente: os 14 itens e os 18 motivos do sistema atual, na ordem dele. Exemplo, não regra.
create or replace function public.ped_semear_configuracao(p_tenant uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.ped_itens (tenant_id, rotulo, ajuda, ordem, pede_justificativa, regra)
  select p_tenant, s.rotulo, nullif(s.ajuda, ''), s.ordem, s.just, s.regra
  from (values
    ('Código do cliente',             'se houver cadastro duplicado, usar o da última nota fiscal',  1, false, null),
    ('Tipo de venda',                 'preenchido como Venda',                                      2, false, null),
    ('Orçamento convertido em Venda', '',                                                           3, false, null),
    ('Tabela de preço',               'a mesma do cadastro, nunca em branco',                       4, false, null),
    ('Natureza da operação',          '',                                                           5, false, null),
    ('Série',                         'Série 1 publicidade, Série 75 bonificação',                  6, false, null),
    ('Forma e condição de pagamento', '',                                                           7, false, null),
    ('Transportadora',                '',                                                           8, false, null),
    ('Cliente Condição',              '',                                                           9, false, null),
    ('Reserva ativada',               '',                                                          10, false, null),
    ('Atualizar ST',                  '',                                                          11, false, 'st'),
    ('Justificar bonificação',        'qual pedido anterior concedeu',                             12, true,  null),
    ('Justificar cashback',           'qual pedido anterior concedeu',                             13, true,  null),
    ('Justificar publicidade',        'qual pedido anterior concedeu',                             14, true,  null)
  ) as s(rotulo, ajuda, ordem, just, regra)
  on conflict (tenant_id, rotulo) do nothing;

  insert into public.ped_motivos_recusa (tenant_id, nome, ordem)
  select p_tenant, m.nome, m.ordem
  from unnest(array[
    'Código do cliente (cadastro duplicado)', 'Tipo de venda', 'Natureza da operação', 'Tabela de preço',
    'Série', 'Forma / condição de pagamento', 'Transportadora', 'Cliente Condição',
    'Orçamento não convertido em venda', 'Reserva não ativada', 'ST', 'Bonificação', 'Cashback',
    'Publicidade', 'Justificativa incompleta', 'Análise de crédito / limite', 'Valor divergente', 'Outro'
  ]) with ordinality as m(nome, ordem)
  on conflict (tenant_id, nome) do nothing;
$$;
revoke all on function public.ped_semear_configuracao(uuid) from public, anon, authenticated;

create or replace function public.ped_semear_configuracao_on_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ped_semear_configuracao(new.id);
  return new;
end;
$$;
create trigger trg_ped_semear_configuracao after insert on public.tenants
  for each row execute function public.ped_semear_configuracao_on_tenant();

select public.ped_semear_configuracao(t.id) from public.tenants t;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O checklist, os pedidos e as respostas
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ped_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  -- `restrict`: lançamento que tem checklist não se apaga — o histórico de conferência iria junto.
  interacao_id uuid not null unique references public.com_interacoes(id) on delete restrict,
  -- CK-AAAA-NNNNN, por empresa (dívida 8). Preenchido por trigger; a carga do histórico traz o seu.
  protocolo text not null,
  versao int not null default 1,
  -- Copiados do lançamento e do cadastro a cada envio, como o sistema antigo guardava. O
  -- Financeiro lê o checklist sem poder ler os lançamentos da vendedora nem o cadastro do
  -- Comercial — e a foto do cliente e da tabela é a do dia em que o pedido foi conferido.
  vendedor_id uuid not null references public.profiles(id) on delete restrict,
  cliente_codigo text not null,
  cliente_nome text not null,
  tabela_preco text,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz not null default now(),
  editado_em timestamptz,
  contato text not null check (btrim(contato) <> ''),
  rota text,
  observacao text,
  unique (tenant_id, protocolo)
);

create table public.ped_pedidos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checklist_id uuid not null references public.ped_checklists(id) on delete cascade,
  ordem int not null check (ordem between 1 and 10),
  tipo text not null check (tipo in ('Venda', 'Bonificação', 'Publicidade', 'Cashback')),
  filial text not null check (filial in ('INBRAS', 'MF')),
  numero text not null check (btrim(numero) <> ''),
  -- Total líquido, já com o desconto (manual §6.2).
  valor numeric(14, 2) not null check (valor >= 0),
  desconto numeric(14, 2) not null default 0 check (desconto >= 0),
  -- Do espelho em PDF (parte S4). `importado_em` marca que o pedido veio de espelho.
  espelho_total numeric(14, 2),
  espelho_st numeric(14, 2),
  qtd_coloracao int,
  qtd_tonalizante int,
  importado_em timestamptz,
  unique (checklist_id, ordem)
);

create table public.ped_respostas (
  pedido_id uuid not null references public.ped_pedidos(id) on delete cascade,
  -- `restrict`: item já respondido não se apaga, se desliga (`ativo = false`).
  item_id uuid not null references public.ped_itens(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resposta text not null check (resposta in ('Sim', 'Não', 'Não se aplica')),
  justificativa text,
  primary key (pedido_id, item_id)
);

create index ped_pedidos_checklist on public.ped_pedidos (checklist_id);

-- O protocolo: ano do Brasil + sequencial de 5 dígitos, por empresa.
create or replace function public.ped_checklists_protocolo()
returns trigger language plpgsql set search_path = public as $$
declare
  v_ano text := extract(year from (now() at time zone 'America/Sao_Paulo'))::int::text;
  v_n int;
begin
  if new.protocolo is null then
    perform pg_advisory_xact_lock(hashtext('ped_protocolo:' || new.tenant_id::text));
    select coalesce(max(substring(c.protocolo from 9)::int), 0) + 1 into v_n
      from public.ped_checklists c
     where c.tenant_id = new.tenant_id and c.protocolo like 'CK-' || v_ano || '-%';
    new.protocolo := 'CK-' || v_ano || '-' || lpad(v_n::text, 5, '0');
  end if;
  return new;
end;
$$;
create trigger trg_ped_checklists_protocolo before insert on public.ped_checklists
  for each row execute function public.ped_checklists_protocolo();

alter table public.ped_checklists enable row level security;
alter table public.ped_pedidos enable row level security;
alter table public.ped_respostas enable row level security;

-- Ler: a vendedora do lançamento, ou quem vê todos. Comparação direta de coluna (lição 13).
create policy ped_checklists_select on public.ped_checklists for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (vendedor_id = auth.uid() or (select public.ped_ve_todos())));

-- O lançamento que tem checklist não troca de cliente: o checklist conferiu pedidos daquele
-- cliente. Trocar é apagar o checklist (admin) ou lançar de novo.
create or replace function public.ped_lancamento_nao_troca_cliente()
returns trigger language plpgsql set search_path = public as $$
begin
  -- `pg_trigger_depth() = 1`: a troca de código feita pelo cadastro (FK em cascata) é do sistema.
  if new.cliente_codigo is distinct from old.cliente_codigo and pg_trigger_depth() = 1
     and exists (select 1 from public.ped_checklists c where c.interacao_id = new.id) then
    raise exception 'Este lançamento tem checklist de pedido: o cliente não pode ser trocado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_ped_lancamento_nao_troca_cliente before update of cliente_codigo on public.com_interacoes
  for each row execute function public.ped_lancamento_nao_troca_cliente();
-- Apagar: só admin (manual §8). Pedidos, respostas, decisões e pagamentos vão junto, pela FK.
create policy ped_checklists_delete on public.ped_checklists for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.is_admin_or_higher(auth.uid())));

create policy ped_pedidos_select on public.ped_pedidos for select to authenticated
  using (exists (select 1 from public.ped_checklists c where c.id = ped_pedidos.checklist_id));
create policy ped_respostas_select on public.ped_respostas for select to authenticated
  using (exists (select 1 from public.ped_pedidos p where p.id = ped_respostas.pedido_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Decisões, pagamentos e finalizações — só inserção
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ped_decisoes (
  seq bigint generated always as identity,
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  checklist_id uuid not null references public.ped_checklists(id) on delete cascade,
  versao int not null default 0,
  status text not null check (status in ('Aprovado', 'Recusado')),
  motivos text[] not null default '{}',
  observacao text,
  -- A foto do que foi decidido: os pedidos e as respostas daquela versão (dívida 7).
  snapshot jsonb,
  registrado_por uuid references public.profiles(id) on delete set null,
  registrado_em timestamptz not null default now(),
  check (status <> 'Recusado' or cardinality(motivos) > 0)
);

create table public.ped_pagamentos (
  seq bigint generated always as identity,
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  checklist_id uuid not null references public.ped_checklists(id) on delete cascade,
  status text not null check (status in ('Em negociação', 'Pago', 'Recusado')),
  data_pagamento date,
  observacao text,
  registrado_por uuid references public.profiles(id) on delete set null,
  registrado_em timestamptz not null default now(),
  check (status <> 'Pago' or data_pagamento is not null)
);

create table public.ped_finalizacoes (
  checklist_id uuid primary key references public.ped_checklists(id) on delete cascade,
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  observacao text,
  registrado_por uuid references public.profiles(id) on delete set null,
  registrado_em timestamptz not null default now()
);

create index ped_decisoes_checklist on public.ped_decisoes (checklist_id, seq);
create index ped_pagamentos_checklist on public.ped_pagamentos (checklist_id, seq);

-- A decisão vigente: a mais recente cuja versão é a versão atual do checklist (manual §7.2).
create or replace function public.ped_decisao_vigente(p_checklist uuid)
returns text language sql stable set search_path = public as $$
  select d.status
    from public.ped_decisoes d
    join public.ped_checklists c on c.id = d.checklist_id and d.versao = c.versao
   where d.checklist_id = p_checklist
   order by d.seq desc
   limit 1;
$$;

create or replace function public.ped_ultimo_pagamento(p_checklist uuid)
returns text language sql stable set search_path = public as $$
  select p.status from public.ped_pagamentos p where p.checklist_id = p_checklist order by p.seq desc limit 1;
$$;

-- O carimbo de decisões, pagamentos e finalizações: quem está logado, agora, e a empresa do
-- checklist. A carga do histórico (sem sessão) traz autor e data do sistema antigo.
create or replace function public.ped_carimbar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.tenant_id := (select c.tenant_id from public.ped_checklists c where c.id = new.checklist_id);
  if auth.uid() is not null then
    new.registrado_por := auth.uid();
    new.registrado_em := now();
  end if;
  return new;
end;
$$;

create or replace function public.ped_decisoes_antes_inserir()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.ped_finalizacoes f where f.checklist_id = new.checklist_id) then
    raise exception 'Este checklist já foi finalizado.' using errcode = 'P0001';
  end if;
  case public.ped_decisao_vigente(new.checklist_id)
    when 'Recusado' then raise exception 'Este checklist já foi recusado. O Comercial precisa corrigir e reenviar.' using errcode = 'P0001';
    when 'Aprovado' then raise exception 'Este checklist já foi aprovado.' using errcode = 'P0001';
    else null;
  end case;

  if auth.uid() is not null then
    new.versao := (select c.versao from public.ped_checklists c where c.id = new.checklist_id);
  end if;
  new.snapshot := coalesce(new.snapshot, (
    select jsonb_agg(jsonb_build_object(
             'ordem', p.ordem, 'tipo', p.tipo, 'filial', p.filial, 'numero', p.numero,
             'valor', p.valor, 'desconto', p.desconto,
             'respostas', (select jsonb_object_agg(i.rotulo, r.resposta)
                             from public.ped_respostas r join public.ped_itens i on i.id = r.item_id
                            where r.pedido_id = p.id))
           order by p.ordem)
      from public.ped_pedidos p where p.checklist_id = new.checklist_id));
  return new;
end;
$$;
-- Os carimbos rodam antes das regras (triggers BEFORE disparam em ordem alfabética de nome).
create trigger trg_ped_a_carimbo before insert on public.ped_decisoes
  for each row execute function public.ped_carimbar();
create trigger trg_ped_decisoes_antes_inserir before insert on public.ped_decisoes
  for each row execute function public.ped_decisoes_antes_inserir();

create or replace function public.ped_pagamentos_antes_inserir()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.ped_decisao_vigente(new.checklist_id), '') <> 'Aprovado' then
    raise exception 'Só dá para registrar pagamento de checklist aprovado.' using errcode = 'P0001';
  end if;
  if public.ped_ultimo_pagamento(new.checklist_id) = 'Pago' then
    raise exception 'Este pedido já está pago; o pagamento não volta atrás.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_ped_a_carimbo before insert on public.ped_pagamentos
  for each row execute function public.ped_carimbar();
create trigger trg_ped_pagamentos_antes_inserir before insert on public.ped_pagamentos
  for each row execute function public.ped_pagamentos_antes_inserir();

create or replace function public.ped_finalizacoes_antes_inserir()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(public.ped_decisao_vigente(new.checklist_id), '') <> 'Aprovado'
     or coalesce(public.ped_ultimo_pagamento(new.checklist_id), '') <> 'Pago' then
    raise exception 'Só dá para finalizar depois de aprovado e com o pagamento confirmado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_ped_a_carimbo before insert on public.ped_finalizacoes
  for each row execute function public.ped_carimbar();
create trigger trg_ped_finalizacoes_antes_inserir before insert on public.ped_finalizacoes
  for each row execute function public.ped_finalizacoes_antes_inserir();

alter table public.ped_decisoes enable row level security;
alter table public.ped_pagamentos enable row level security;
alter table public.ped_finalizacoes enable row level security;

-- Ler: quem lê o checklist. Gravar: quem tem a permissão. Nenhuma policy de update nem de delete.
create policy ped_decisoes_select on public.ped_decisoes for select to authenticated
  using (exists (select 1 from public.ped_checklists c where c.id = ped_decisoes.checklist_id));
create policy ped_decisoes_insert on public.ped_decisoes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.ped_pode_decidir()));

create policy ped_pagamentos_select on public.ped_pagamentos for select to authenticated
  using (exists (select 1 from public.ped_checklists c where c.id = ped_pagamentos.checklist_id));
create policy ped_pagamentos_insert on public.ped_pagamentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.ped_pode_registrar_pagamento()));

create policy ped_finalizacoes_select on public.ped_finalizacoes for select to authenticated
  using (exists (select 1 from public.ped_checklists c where c.id = ped_finalizacoes.checklist_id));
create policy ped_finalizacoes_insert on public.ped_finalizacoes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.ped_pode_registrar_pagamento()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Gravar o checklist: uma função, uma transação, as validações no fim
-- ─────────────────────────────────────────────────────────────────────────────
-- p_dados: {contato, rota, observacao, pedidos: [{ordem, tipo, filial, numero, valor, desconto,
--           espelho?: {total, st, coloracao, tonalizante}, respostas: [{item_id, resposta, justificativa?}]}]}
create or replace function public.ped_salvar_checklist(p_interacao uuid, p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_interacao public.com_interacoes%rowtype;
  v_cliente public.com_clientes%rowtype;
  v_checklist public.ped_checklists%rowtype;
  v_pedidos jsonb := coalesce(p_dados -> 'pedidos', '[]'::jsonb);
  v_ped jsonb;
  v_pedido_id uuid;
  v_ordens int[];
  v_falha text;
begin
  select * into v_interacao from public.com_interacoes i where i.id = p_interacao and i.tenant_id = v_tenant;
  if v_interacao.id is null then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0002';
  end if;
  if not (v_interacao.vendedor_id = auth.uid() or public.is_admin_or_higher(auth.uid())) then
    raise exception 'Só quem fez o lançamento envia o checklist dele.' using errcode = '42501';
  end if;
  if v_interacao.cliente_codigo is null then
    raise exception 'O checklist precisa de cliente no lançamento.' using errcode = '22023';
  end if;
  select * into v_cliente from public.com_clientes c
   where c.tenant_id = v_tenant and c.codigo = v_interacao.cliente_codigo;

  select array_agg((p ->> 'ordem')::int order by (p ->> 'ordem')::int) into v_ordens
    from jsonb_array_elements(v_pedidos) p;
  if coalesce(cardinality(v_ordens), 0) not between 1 and 10
     or v_ordens <> (select array_agg(g order by g) from generate_series(1, cardinality(v_ordens)) g) then
    raise exception 'O checklist tem de 1 a 10 pedidos, numerados em sequência.' using errcode = '22023';
  end if;

  select * into v_checklist from public.ped_checklists c where c.interacao_id = p_interacao for update;
  if v_checklist.id is null then
    insert into public.ped_checklists (tenant_id, interacao_id, vendedor_id, cliente_codigo, cliente_nome, tabela_preco,
                                       criado_por, contato, rota, observacao)
    values (v_tenant, p_interacao, v_interacao.vendedor_id, v_cliente.codigo, v_cliente.razao_social, v_cliente.tabela_preco,
            auth.uid(), p_dados ->> 'contato', nullif(btrim(p_dados ->> 'rota'), ''),
            nullif(btrim(p_dados ->> 'observacao'), ''))
    returning * into v_checklist;
  else
    if exists (select 1 from public.ped_finalizacoes f where f.checklist_id = v_checklist.id) then
      raise exception 'Checklist finalizado não pode ser alterado.' using errcode = 'P0001';
    end if;
    if public.ped_decisao_vigente(v_checklist.id) = 'Aprovado' then
      raise exception 'Checklist já aprovado não pode ser alterado.' using errcode = 'P0001';
    end if;
    -- Editar sobe a versão: a decisão anterior deixa de ser vigente e o checklist volta a
    -- "Em análise" sozinho (manual §3.4).
    update public.ped_checklists c
       set versao = c.versao + 1, editado_em = now(), enviado_em = now(),
           cliente_nome = v_cliente.razao_social, tabela_preco = v_cliente.tabela_preco,
           contato = p_dados ->> 'contato', rota = nullif(btrim(p_dados ->> 'rota'), ''),
           observacao = nullif(btrim(p_dados ->> 'observacao'), '')
     where c.id = v_checklist.id;
  end if;

  -- Os pedidos, pela ordem: atualiza o que existe, cria o que falta, tira o que sobrou (dívida 7).
  delete from public.ped_pedidos p where p.checklist_id = v_checklist.id and p.ordem <> all (v_ordens);
  for v_ped in select * from jsonb_array_elements(v_pedidos) loop
    insert into public.ped_pedidos as p (tenant_id, checklist_id, ordem, tipo, filial, numero, valor, desconto,
                                        espelho_total, espelho_st, qtd_coloracao, qtd_tonalizante, importado_em)
    values (v_tenant, v_checklist.id, (v_ped ->> 'ordem')::int, v_ped ->> 'tipo', v_ped ->> 'filial',
            btrim(v_ped ->> 'numero'), (v_ped ->> 'valor')::numeric, coalesce((v_ped ->> 'desconto')::numeric, 0),
            (v_ped -> 'espelho' ->> 'total')::numeric, (v_ped -> 'espelho' ->> 'st')::numeric,
            (v_ped -> 'espelho' ->> 'coloracao')::int, (v_ped -> 'espelho' ->> 'tonalizante')::int,
            case when v_ped ? 'espelho' and jsonb_typeof(v_ped -> 'espelho') = 'object' then now() end)
    on conflict (checklist_id, ordem) do update
       set tipo = excluded.tipo, filial = excluded.filial, numero = excluded.numero, valor = excluded.valor,
           desconto = excluded.desconto, espelho_total = excluded.espelho_total, espelho_st = excluded.espelho_st,
           qtd_coloracao = excluded.qtd_coloracao, qtd_tonalizante = excluded.qtd_tonalizante,
           importado_em = case when excluded.importado_em is null then null else coalesce(p.importado_em, excluded.importado_em) end
    returning p.id into v_pedido_id;

    delete from public.ped_respostas r where r.pedido_id = v_pedido_id;
    insert into public.ped_respostas (pedido_id, item_id, tenant_id, resposta, justificativa)
    select v_pedido_id, (r ->> 'item_id')::uuid, v_tenant, r ->> 'resposta', nullif(btrim(r ->> 'justificativa'), '')
      from jsonb_array_elements(coalesce(v_ped -> 'respostas', '[]'::jsonb)) r
      join public.ped_itens i on i.id = (r ->> 'item_id')::uuid and i.tenant_id = v_tenant;
  end loop;

  -- As validações que o sistema antigo só fazia na tela (dívida 5). A primeira falha é a mensagem.
  select f into v_falha from (
    select format('Pedido %s: falta responder "%s".', p.ordem, i.rotulo) as f, p.ordem, i.ordem as io, 1 as tipo
      from public.ped_pedidos p cross join public.ped_itens i
     where p.checklist_id = v_checklist.id and i.tenant_id = v_tenant and i.ativo
       and not exists (select 1 from public.ped_respostas r where r.pedido_id = p.id and r.item_id = i.id)
    union all
    select format('Pedido %s: "%s" está como Não — corrija no Forteplus antes de enviar.', p.ordem, i.rotulo), p.ordem, i.ordem, 2
      from public.ped_pedidos p join public.ped_respostas r on r.pedido_id = p.id join public.ped_itens i on i.id = r.item_id
     where p.checklist_id = v_checklist.id and r.resposta = 'Não'
    union all
    select format('Pedido %s: "%s" pede justificativa.', p.ordem, i.rotulo), p.ordem, i.ordem, 3
      from public.ped_pedidos p join public.ped_respostas r on r.pedido_id = p.id join public.ped_itens i on i.id = r.item_id
     where p.checklist_id = v_checklist.id and i.pede_justificativa and r.resposta = 'Sim' and r.justificativa is null
    union all
    select case when p.espelho_st > 0
                then format('Pedido %s: o espelho tem ST de R$ %s, e "%s" está como Não se aplica.', p.ordem, p.espelho_st, i.rotulo)
                else format('Pedido %s: o espelho não tem ST, e "%s" está como Sim.', p.ordem, i.rotulo) end,
           p.ordem, i.ordem, 4
      from public.ped_pedidos p join public.ped_respostas r on r.pedido_id = p.id join public.ped_itens i on i.id = r.item_id
     where p.checklist_id = v_checklist.id and i.regra = 'st' and p.importado_em is not null
       and ((coalesce(p.espelho_st, 0) > 0 and r.resposta = 'Não se aplica')
            or (coalesce(p.espelho_st, 0) = 0 and r.resposta = 'Sim'))
  ) x order by x.ordem, x.tipo, x.io limit 1;
  if v_falha is not null then
    raise exception '%', v_falha using errcode = '23514';
  end if;

  -- O valor da venda do lançamento é a soma dos pedidos tipo Venda (decisão do dono): uma digitação só.
  update public.com_interacoes i
     set valor_venda = (select coalesce(sum(p.valor), 0) from public.ped_pedidos p
                         where p.checklist_id = v_checklist.id and p.tipo = 'Venda'),
         updated_at = now()
   where i.id = p_interacao;

  return v_checklist.id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A leitura única das telas (manual §3.6)
-- ─────────────────────────────────────────────────────────────────────────────
create view public.ped_checklists_situacao with (security_invoker = on) as
select
  c.id, c.tenant_id, c.interacao_id, c.protocolo, c.versao, c.criado_por, c.criado_em, c.enviado_em,
  c.editado_em, c.contato, c.rota, c.observacao,
  c.vendedor_id, vp.full_name as vendedor_nome, c.cliente_codigo, c.cliente_nome, c.tabela_preco,
  (select count(*) from public.ped_pedidos p where p.checklist_id = c.id)::int as qtd_pedidos,
  (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor_total,
  (select count(*) from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Recusado')::int as recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('tentativa', d.versao, 'em', d.registrado_em, 'por', dp.full_name,
                                                'motivos', d.motivos, 'observacao', d.observacao) order by d.seq), '[]'::jsonb)
     from public.ped_decisoes d left join public.profiles dp on dp.id = d.registrado_por
    where d.checklist_id = c.id and d.status = 'Recusado') as historico_recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('status', p.status, 'data', p.data_pagamento, 'em', p.registrado_em,
                                                'por', pp.full_name, 'observacao', p.observacao) order by p.seq), '[]'::jsonb)
     from public.ped_pagamentos p left join public.profiles pp on pp.id = p.registrado_por
    where p.checklist_id = c.id) as historico_pagamentos,
  vig.status as retorno_status, vig.motivos as retorno_motivos, vig.observacao as retorno_observacao,
  vig.registrado_em as retorno_em, vigp.full_name as retorno_por,
  case when f.checklist_id is not null then 'Finalizado' else coalesce(vig.status, 'Em análise') end as situacao,
  coalesce(pg.status, case when vig.status = 'Aprovado' then 'Em negociação' end) as pagamento_status,
  pg.data_pagamento as pagamento_data,
  f.registrado_em as finalizado_em, fp.full_name as finalizado_por, f.observacao as finalizado_observacao
from public.ped_checklists c
left join public.profiles vp on vp.id = c.vendedor_id
left join lateral (select d.* from public.ped_decisoes d
                    where d.checklist_id = c.id and d.versao = c.versao order by d.seq desc limit 1) vig on true
left join public.profiles vigp on vigp.id = vig.registrado_por
left join lateral (select p.* from public.ped_pagamentos p where p.checklist_id = c.id order by p.seq desc limit 1) pg on true
left join public.ped_finalizacoes f on f.checklist_id = c.id
left join public.profiles fp on fp.id = f.registrado_por;

grant select on public.ped_checklists_situacao to authenticated;
revoke all on public.ped_checklists_situacao from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Portas: nada novo é alcançável por anon (lição 14)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.ped_pode_decidir() from public, anon;
revoke all on function public.ped_pode_registrar_pagamento() from public, anon;
revoke all on function public.ped_ve_todos() from public, anon;
revoke all on function public.ped_decisao_vigente(uuid) from public, anon;
revoke all on function public.ped_ultimo_pagamento(uuid) from public, anon;
revoke all on function public.ped_salvar_checklist(uuid, jsonb) from public, anon;
grant execute on function public.ped_pode_decidir() to authenticated;
grant execute on function public.ped_pode_registrar_pagamento() to authenticated;
grant execute on function public.ped_ve_todos() to authenticated;
grant execute on function public.ped_decisao_vigente(uuid) to authenticated;
grant execute on function public.ped_ultimo_pagamento(uuid) to authenticated;
grant execute on function public.ped_salvar_checklist(uuid, jsonb) to authenticated;
