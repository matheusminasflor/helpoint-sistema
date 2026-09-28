-- A fila de cadastro de cliente novo (LEVA O, parte 3)
--
-- As abas "Cadastro - Fenício / Júlia / Jaqueline" da planilha de Gestão Comercial: a vendedora
-- pede, o gestor aprova, e alguém aplica. Decisão do dono (2026-09-28): **cliente NOVO** passa
-- por aqui e vira chamado para quem cadastra no Forteplus; **atualização** de dado continua
-- direta pela vendedora (é o gancho de manter o cadastro em dia — fila para trocar telefone
-- faria ninguém trocar).
--
-- POR QUE CLIENTE NOVO PRECISA DE FILA, medido: no sistema um cliente só nasce com o código do
-- Forteplus (`FormularioCliente` exige). Ou seja, só existe depois que alguém o cadastra lá — e
-- esse caminho corria por WhatsApp. É o mesmo que o dono descreveu como o processo real em
-- 2026-09-10: "abre chamado na TI (formulário = cadastro do cliente) → TI cadastra no Forteplus
-- → TI avisa o vendedor à mão".
--
-- O FLUXO, cada passo com dono e numa transação só:
--   1. a vendedora pede (Pendente) — escrita direta na tabela, pelo RLS;
--   2. o gestor aprova, reprova ou manda ajustar (`com_decidir_solicitacao_cadastro`);
--      APROVAR ABRE O CHAMADO NA MESMA TRANSAÇÃO. É o conserto do que foi medido em Compras: lá o
--      chamado e a solicitação nascem em duas chamadas do navegador, e a falha da segunda deixa
--      chamado órfão;
--   3. quem cadastrou no Forteplus aplica (`com_aplicar_solicitacao_cadastro`): informa o código,
--      o cliente nasce em `com_clientes` já NA CARTEIRA DA VENDEDORA que pediu, e o chamado fecha.
--
-- PARA ONDE VAI O CHAMADO É CONFIGURAÇÃO, não regra do código (regra do dono: "destino é
-- configuração"): `tenants.settings -> comercial -> cadastroCategoriaId`. Sem ela, aprovar é
-- recusado com a instrução — nunca um destino adivinhado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A tabela
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.com_solicitacoes_cadastro (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  vendedor_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  -- Os campos da aba da planilha.
  razao_social text not null check (btrim(razao_social) <> ''),
  documento text check (documento is null or documento ~ '^[0-9]{11}$|^[0-9]{14}$'),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  cidade text,
  telefone text,
  telefone_2 text,
  email text,
  endereco text,
  cep text,
  inscricao_estadual text,
  condicao_fiscal text,
  grupo text,
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  motivo text,
  -- Pendente → (Ajustar → Pendente)* → Aprovado → Aplicado; ou Reprovado.
  status text not null default 'pendente'
    check (status in ('pendente', 'ajustar', 'aprovado', 'reprovado', 'aplicado')),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  parecer text,
  ticket_id uuid references public.tickets(id) on delete set null,
  cliente_codigo text,
  aplicado_por uuid references public.profiles(id),
  aplicado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists com_solicitacoes_cadastro_status on public.com_solicitacoes_cadastro (tenant_id, status);

comment on table public.com_solicitacoes_cadastro is
  'Fila de cadastro de cliente NOVO (planilha de Gestão Comercial, abas "Cadastro - …"): a '
  'vendedora pede, o gestor decide, aprovar abre o chamado, quem cadastra no Forteplus aplica.';

alter table public.com_solicitacoes_cadastro enable row level security;

drop policy if exists com_solicitacoes_cadastro_select on public.com_solicitacoes_cadastro;
create policy com_solicitacoes_cadastro_select on public.com_solicitacoes_cadastro
  for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (vendedor_id = auth.uid()
              or (select public.com_pode_gerir_carteiras())
              or (select public.has_diretoria_access(auth.uid()))));

-- Pedir: em nome próprio, e só como Pendente.
drop policy if exists com_solicitacoes_cadastro_insert on public.com_solicitacoes_cadastro;
create policy com_solicitacoes_cadastro_insert on public.com_solicitacoes_cadastro
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and vendedor_id = auth.uid()
              and status = 'pendente'
              and (select public.has_comercial_access(auth.uid())));

-- Editar: a própria, enquanto Pendente ou devolvida para Ajustar; e ao salvar ela volta a
-- Pendente. Decidir e aplicar NÃO passam por aqui — são as funções abaixo.
drop policy if exists com_solicitacoes_cadastro_update on public.com_solicitacoes_cadastro;
create policy com_solicitacoes_cadastro_update on public.com_solicitacoes_cadastro
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and vendedor_id = auth.uid() and status in ('pendente', 'ajustar'))
  with check (tenant_id = (select public.get_user_tenant_id())
              and vendedor_id = auth.uid() and status = 'pendente');

drop policy if exists com_solicitacoes_cadastro_delete on public.com_solicitacoes_cadastro;
create policy com_solicitacoes_cadastro_delete on public.com_solicitacoes_cadastro
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and vendedor_id = auth.uid() and status in ('pendente', 'ajustar'));

-- A POLICY DIZ QUAIS LINHAS; O GRANT DIZ QUAIS COLUNAS. Sem isto, a vendedora — que pode editar
-- a própria solicitação pendente — escreveria `decidido_por`, `ticket_id` ou `cliente_codigo`
-- e se aprovaria sozinha. Decisão, chamado e aplicação só se escrevem pelas funções.
revoke update on public.com_solicitacoes_cadastro from authenticated;
grant update (razao_social, documento, uf, cidade, telefone, telefone_2, email, endereco, cep,
              inscricao_estadual, condicao_fiscal, grupo, prioridade, motivo, status, updated_at)
  on public.com_solicitacoes_cadastro to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O CNPJ/CPF já é de alguém?
-- ─────────────────────────────────────────────────────────────────────────────
-- Antes de pedir, a tela pergunta. É `security definer` porque, com "cada vendedor só vê a sua
-- carteira" ligado, o cliente de outra carteira some da leitura dela — e o pedido duplicado
-- passaria. Devolve só o necessário para ela reconhecer o cliente: código, nome e carteira.
create or replace function public.com_documento_ja_cadastrado(p_documento text)
returns table (codigo text, razao_social text, carteira text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.codigo, c.razao_social, c.carteira
    from public.com_clientes c
   where c.tenant_id = public.get_user_tenant_id()
     and public.has_comercial_access(auth.uid())
     and c.documento = regexp_replace(coalesce(p_documento, ''), '\D', '', 'g')
     and length(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g')) in (11, 14);
$$;

revoke all on function public.com_documento_ja_cadastrado(text) from public, anon;
grant execute on function public.com_documento_ja_cadastrado(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Avisar quem decide
-- ─────────────────────────────────────────────────────────────────────────────
-- Quem decide: admin ou quem tem `comercial.carteiras.gerir`, na mesma empresa.
create or replace function public.com_quem_decide_cadastro(p_tenant uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(p.id), array[]::uuid[])
    from public.profiles p
   where p.tenant_id = p_tenant
     and (public.is_admin_or_higher(p.id)
          or public.tem_permissao(p.id, 'comercial', 'carteiras', 'gerir'));
$$;

revoke all on function public.com_quem_decide_cadastro(uuid) from public, anon, authenticated;

create or replace function public.com_avisar_pedido_de_cadastro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.notify_users(
    new.tenant_id, public.com_quem_decide_cadastro(new.tenant_id), 'ticket_created',
    'com_solicitacao_cadastro', new.id,
    'Pedido de cadastro de cliente',
    'Novo cliente para aprovar: ' || new.razao_social,
    new.vendedor_id);
  return new;
end;
$$;

drop trigger if exists trg_com_avisar_pedido_de_cadastro on public.com_solicitacoes_cadastro;
create trigger trg_com_avisar_pedido_de_cadastro
  after insert on public.com_solicitacoes_cadastro
  for each row execute function public.com_avisar_pedido_de_cadastro();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Decidir — e aprovar abre o chamado, na mesma transação
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.com_decidir_solicitacao_cadastro(p_id uuid, p_decisao text, p_parecer text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_sol public.com_solicitacoes_cadastro%rowtype;
  v_categoria_id uuid;
  v_cat record;
  v_ticket uuid;
  v_parecer text := nullif(btrim(p_parecer), '');
begin
  if v_tenant is null or not public.com_pode_gerir_carteiras() then
    raise exception 'Só o gestor decide pedidos de cadastro.' using errcode = '42501';
  end if;
  if p_decisao not in ('aprovado', 'reprovado', 'ajustar') then
    raise exception 'Decisão inválida: %', p_decisao using errcode = '22023';
  end if;
  if p_decisao in ('reprovado', 'ajustar') and v_parecer is null then
    raise exception 'Diga à vendedora o motivo — reprovar ou pedir ajuste exige parecer.' using errcode = '22023';
  end if;

  select * into v_sol from public.com_solicitacoes_cadastro
   where id = p_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = '42501';
  end if;
  if v_sol.status <> 'pendente' then
    raise exception 'Este pedido já foi decidido (está "%").', v_sol.status using errcode = '22023';
  end if;

  if p_decisao = 'aprovado' then
    v_categoria_id := nullif(
      (select t.settings -> 'comercial' ->> 'cadastroCategoriaId' from public.tenants t where t.id = v_tenant), '')::uuid;
    if v_categoria_id is null then
      raise exception 'Antes de aprovar, escolha para onde vai o chamado de cadastro (em Solicitações de cadastro › Destino do chamado).'
        using errcode = '22023';
    end if;
    select c.id, c.name, c.module into v_cat
      from public.ti_categories c where c.id = v_categoria_id and c.tenant_id = v_tenant;
    if not found then
      raise exception 'A categoria configurada para o chamado de cadastro não existe mais. Escolha outra.' using errcode = '22023';
    end if;

    insert into public.tickets (tenant_id, title, description, category, category_id, module,
                                priority, requester_id, created_by)
    values (
      v_tenant,
      'Cadastro de cliente: ' || v_sol.razao_social,
      concat_ws(E'\n',
        'Cadastrar no Forteplus e, ao terminar, aplicar o pedido informando o código do cliente.',
        '',
        'Razão social: ' || v_sol.razao_social,
        'CNPJ/CPF: ' || coalesce(v_sol.documento, '—'),
        'Inscrição estadual: ' || coalesce(v_sol.inscricao_estadual, '—'),
        'Condição fiscal: ' || coalesce(v_sol.condicao_fiscal, '—'),
        'Endereço: ' || coalesce(v_sol.endereco, '—'),
        'CEP: ' || coalesce(v_sol.cep, '—') || ' · ' || coalesce(v_sol.cidade, '—') || '/' || coalesce(v_sol.uf, '—'),
        'Telefones: ' || concat_ws(' / ', v_sol.telefone, v_sol.telefone_2),
        'E-mail: ' || coalesce(v_sol.email, '—'),
        'Motivo: ' || coalesce(v_sol.motivo, '—'),
        'Parecer do gestor: ' || coalesce(v_parecer, '—')),
      v_cat.name, v_cat.id, v_cat.module,
      (case v_sol.prioridade when 'alta' then 'high' when 'baixa' then 'low' else 'medium' end)::public.ticket_priority,
      v_sol.vendedor_id, auth.uid()
    )
    returning id into v_ticket;
  end if;

  update public.com_solicitacoes_cadastro
     set status = p_decisao, parecer = v_parecer, decidido_por = auth.uid(), decidido_em = now(),
         ticket_id = coalesce(v_ticket, ticket_id), updated_at = now()
   where id = p_id;

  perform public.notify_users(
    v_tenant, array[v_sol.vendedor_id], 'request_decided', 'com_solicitacao_cadastro', p_id,
    case p_decisao
      when 'aprovado' then 'Cadastro aprovado'
      when 'ajustar' then 'Cadastro precisa de ajuste'
      else 'Cadastro reprovado' end,
    v_sol.razao_social || coalesce(' — ' || v_parecer, ''),
    auth.uid());

  return jsonb_build_object('status', p_decisao, 'ticket_id', v_ticket);
end;
$$;

revoke all on function public.com_decidir_solicitacao_cadastro(uuid, text, text) from public, anon;
grant execute on function public.com_decidir_solicitacao_cadastro(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Aplicar — o cliente nasce na carteira de quem pediu, e o chamado fecha
-- ─────────────────────────────────────────────────────────────────────────────
-- Quem aplica: o gestor, ou a pessoa a quem o chamado foi atribuído — que é, no caminho real,
-- quem cadastrou no Forteplus e não precisa ter o módulo Comercial para isso.
create or replace function public.com_aplicar_solicitacao_cadastro(p_id uuid, p_codigo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_sol public.com_solicitacoes_cadastro%rowtype;
  v_codigo text := nullif(btrim(p_codigo), '');
  v_carteira text;
  v_responsavel uuid;
begin
  if v_tenant is null then
    raise exception 'Usuário sem empresa associada.' using errcode = '42501';
  end if;

  select * into v_sol from public.com_solicitacoes_cadastro
   where id = p_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = '42501';
  end if;

  select t.assigned_to into v_responsavel from public.tickets t where t.id = v_sol.ticket_id;
  if not (public.com_pode_gerir_carteiras() or (v_responsavel is not null and v_responsavel = auth.uid())) then
    raise exception 'Só o gestor ou quem está com o chamado aplica o cadastro.' using errcode = '42501';
  end if;
  if v_sol.status <> 'aprovado' then
    raise exception 'Só pedido aprovado se aplica (este está "%").', v_sol.status using errcode = '22023';
  end if;
  if v_codigo is null then
    raise exception 'Informe o código do cliente no Forteplus.' using errcode = '22023';
  end if;
  if exists (select 1 from public.com_clientes c where c.tenant_id = v_tenant and c.codigo = v_codigo) then
    raise exception 'Já existe cliente com o código % — confira no Forteplus se é o mesmo.', v_codigo using errcode = '23505';
  end if;
  if v_sol.documento is not null
     and exists (select 1 from public.com_clientes c where c.tenant_id = v_tenant and c.documento = v_sol.documento) then
    raise exception 'Já existe cliente com este CNPJ/CPF na base.' using errcode = '23505';
  end if;

  -- A carteira de quem pediu: o cliente nasce onde ela vai atendê-lo.
  select m.carteira into v_carteira from public.com_carteira_membros m
   where m.tenant_id = v_tenant and m.user_id = v_sol.vendedor_id limit 1;

  insert into public.com_clientes
    (tenant_id, codigo, razao_social, documento, telefone, email, endereco, cep, cidade, estado,
     carteira, grupo, ativo, origem)
  values (v_tenant, v_codigo, v_sol.razao_social, v_sol.documento,
          concat_ws(' / ', v_sol.telefone, v_sol.telefone_2), v_sol.email, v_sol.endereco,
          v_sol.cep, v_sol.cidade, v_sol.uf, v_carteira, v_sol.grupo, true, 'cadastro')
  returning codigo into v_codigo;

  update public.com_solicitacoes_cadastro
     set status = 'aplicado', cliente_codigo = v_codigo, aplicado_por = auth.uid(),
         aplicado_em = now(), updated_at = now()
   where id = p_id;

  -- FECHAR O CHAMADO NÃO PODE DESFAZER O CLIENTE. `tickets` tem gatilhos que impedem fechar com
  -- checklist ou manutenção pendente (`enforce_ticket_checklist_before_closing` e irmão). Se um
  -- deles recusar, o cliente — que já está cadastrado no Forteplus — continua criado aqui, e o
  -- chamado fica aberto para quem o atende terminar o checklist. O bloco com `exception` desfaz
  -- só a tentativa de fechar — e captura SÓ `raise_exception` (P0001), que é o que esses dois
  -- gatilhos levantam (`RAISE EXCEPTION` sem código). Qualquer outro erro sobe: engolir tudo
  -- esconderia defeito, que é a regra 1 do repositório do lado do banco.
  if v_sol.ticket_id is not null then
    begin
      update public.tickets
         set status = 'resolved', resolved_at = now(),
             resolution_notes = 'Cliente cadastrado no Forteplus com o código ' || v_codigo || '.'
       where id = v_sol.ticket_id and status not in ('resolved', 'closed', 'cancelled');
    exception when raise_exception then
      null;
    end;
  end if;

  perform public.notify_users(
    v_tenant, array[v_sol.vendedor_id], 'request_decided', 'com_solicitacao_cadastro', p_id,
    'Cliente cadastrado',
    v_sol.razao_social || ' já está no sistema com o código ' || v_codigo
      || coalesce(', na sua carteira ' || v_carteira, '') || '.',
    auth.uid());

  return v_codigo;
end;
$$;

revoke all on function public.com_aplicar_solicitacao_cadastro(uuid, text) from public, anon;
grant execute on function public.com_aplicar_solicitacao_cadastro(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Confere no próprio banco
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_aberta text;
begin
  select string_agg(p.proname, ', ') into v_aberta
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and p.proname in ('com_documento_ja_cadastrado', 'com_decidir_solicitacao_cadastro',
                       'com_aplicar_solicitacao_cadastro', 'com_quem_decide_cadastro')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_aberta is not null then
    raise exception 'funções abertas para anon: %', v_aberta;
  end if;
  if has_function_privilege('authenticated', 'public.com_quem_decide_cadastro(uuid)', 'execute') then
    raise exception 'com_quem_decide_cadastro ficou executável por authenticated';
  end if;
  if has_column_privilege('authenticated', 'public.com_solicitacoes_cadastro', 'decidido_por', 'update') then
    raise exception 'authenticated consegue escrever decidido_por direto na tabela';
  end if;
end $$;
