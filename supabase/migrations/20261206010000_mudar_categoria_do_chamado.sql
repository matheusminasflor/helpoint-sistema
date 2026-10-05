-- MUDAR A CATEGORIA DO CHAMADO (decisões do dono, 2026-10-05, múltipla escolha).
--
-- O dono: "ter como alterar categoria dos chamados, pois hoje tem chamados que colaboradores abriram
-- na categoria errada". MEDIDO ANTES: nenhuma tela mudava a categoria, e a guarda do perfil
-- (`chamado_guarda_o_perfil`) não olhava a categoria — quem pudesse gravar o chamado, mudava.
-- Decisões:
--   * caixinha nova "Mudar categoria" (`tickets.change_category`) na seção Chamados de todo setor;
--     quem hoje muda status já vem com ela marcada;
--   * só para categoria do MESMO setor — chamado no setor errado continua sendo transferir de setor;
--   * sem atendente, vale o responsável da categoria nova (como se tivesse sido aberto nela); com
--     atendente, ninguém tira o chamado de quem já está trabalhando nele.

-- ── 1. O padrão dos perfis ganha a caixinha ─────────────────────────────────────────────────────
-- Mesma regra da semente: quem muda status (Gestor e Operador) muda categoria; Somente leitura não.
create or replace function public.chamados_do_perfil_padrao(p_nome text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_nome = 'Gestor' then
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":true,"change_priority":true,"change_category":true,"internal_notes":true,"delete":true,
        "repassar_ausencias":true}'::jsonb
    when p_nome = 'Somente leitura' then
      '{"view_all":true,"assume":false,"change_status":false,"close":false,"reopen":false,
        "transfer":false,"change_priority":false,"change_category":false,"internal_notes":false,"delete":false}'::jsonb
    else
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":false,"change_priority":false,"change_category":true,"internal_notes":true,"delete":false}'::jsonb
  end;
$$;

-- Os perfis que existem: quem muda status ganha "Mudar categoria". No perfil e no ajuste pessoal.
-- `jsonb_set` dentro de `tickets`, para não trocar a seção inteira.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets,change_category}', 'true'::jsonb)
 where coalesce((permissions -> 'tickets' ->> 'change_status')::boolean, false);

update public.user_access_profiles
   set overrides = jsonb_set(overrides, '{tickets,change_category}', 'true'::jsonb)
 where coalesce((overrides -> 'tickets' ->> 'change_status')::boolean, false);

-- ── 2. A guarda pergunta pela caixinha ──────────────────────────────────────────────────────────
-- Igual a 20261119010000, com a categoria (id, nome ou subcategoria) pedindo `change_category`.
-- `create or replace` mantém a ACL.
create or replace function public.chamado_guarda_o_perfil()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_fechado constant text[] := array['resolved', 'closed', 'cancelled', 'rejected'];
  v_acoes text[] := array[]::text[];
  v_assumiu boolean := false;
  v_acao text;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.module <> 'compras' and not public.pode_no_chamado(old.module, 'delete') then
      raise exception 'Seu perfil de acesso não permite excluir este chamado.' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.module = 'compras' then
    return new;
  end if;

  -- Quem abriu avalia ou reabre o que lhe entregaram. Não é ação de equipe — e não muda categoria.
  if old.requester_id = auth.uid() and old.status = 'resolved'
     and new.status::text in ('closed', 'in_progress')
     and new.assigned_to is not distinct from old.assigned_to
     and new.priority is not distinct from old.priority
     and new.due_date is not distinct from old.due_date
     and new.category_id is not distinct from old.category_id
     and new.category is not distinct from old.category
     and new.subcategory is not distinct from old.subcategory then
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    v_assumiu := old.assigned_to is null and new.assigned_to = auth.uid();
    v_acoes := v_acoes || (case when v_assumiu then 'assume' else 'transfer' end);
  end if;

  if new.status is distinct from old.status then
    if new.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'close'::text;
    elsif old.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'reopen'::text;
    elsif not (v_assumiu and old.status = 'open' and new.status = 'in_progress') then
      v_acoes := v_acoes || 'change_status'::text;
    end if;
  end if;

  if new.priority is distinct from old.priority or new.due_date is distinct from old.due_date then
    v_acoes := v_acoes || 'change_priority'::text;
  end if;

  if new.category_id is distinct from old.category_id
     or new.category is distinct from old.category
     or new.subcategory is distinct from old.subcategory then
    v_acoes := v_acoes || 'change_category'::text;
  end if;

  foreach v_acao in array v_acoes loop
    if not public.pode_no_chamado(new.module, v_acao) then
      raise exception 'Seu perfil de acesso não permite % neste chamado.',
        case v_acao
          when 'assume' then 'assumir'
          when 'transfer' then 'transferir'
          when 'close' then 'resolver ou fechar'
          when 'reopen' then 'reabrir'
          when 'change_status' then 'mudar o status'
          when 'change_priority' then 'mudar a prioridade ou o prazo'
          when 'change_category' then 'mudar a categoria'
        end
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

-- A tela registra a mudança como nota interna ("Categoria alterada de X para Y"), como faz com as
-- outras ações. A guarda da nota interna passa a aceitar quem tem só "Mudar categoria" — mesma
-- regra de 20261119010000 (o `ponytail:` de lá continua valendo), com a ação nova na lista.
create or replace function public.comentario_interno_guarda_o_perfil()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_modulo text;
begin
  if not new.is_internal or pg_trigger_depth() > 1 or auth.uid() is null
     or current_user <> 'authenticated' then
    return new;
  end if;

  select t.module into v_modulo from public.tickets t where t.id = new.ticket_id;
  if v_modulo is null or v_modulo = 'compras' then
    return new;
  end if;

  if not (public.pode_no_chamado(v_modulo, 'internal_notes')
          or public.pode_no_chamado(v_modulo, 'assume')
          or public.pode_no_chamado(v_modulo, 'transfer')
          or public.pode_no_chamado(v_modulo, 'change_status')
          or public.pode_no_chamado(v_modulo, 'change_category')
          or public.pode_no_chamado(v_modulo, 'close')
          or public.pode_no_chamado(v_modulo, 'reopen')) then
    raise exception 'Seu perfil de acesso não permite nota interna neste chamado.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── 3. A categoria nova: do mesmo setor, e o responsável dela quando não há atendente ───────────
-- Roda depois da guarda (nome em ordem alfabética) e antes de `trg_sla_segue_o_atendente`, para o
-- prazo seguir o responsável que esta função pôs. `security definer` para ler categoria e
-- responsáveis sem depender do RLS de quem mudou.
create or replace function public.chamado_muda_de_categoria()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_resp uuid[];
begin
  if new.category_id is not distinct from old.category_id or new.category_id is null then
    return new;
  end if;

  if not exists (select 1 from public.ti_categories c
                  where c.id = new.category_id and c.tenant_id = new.tenant_id and c.module = new.module) then
    raise exception 'A categoria nova tem de ser do mesmo setor do chamado. Para mandar a outro setor, transfira o chamado.'
      using errcode = '23514';
  end if;

  -- Com atendente (de antes ou escolhido agora), fica quem está. Encerrado não ganha atendente.
  if new.assigned_to is not null or new.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    return new;
  end if;

  -- Sem atendente: a regra da abertura (`chamado_vai_para_o_responsavel`). Um responsável, ele
  -- atende; vários, fica na fila — aqui ninguém está escolhendo entre eles.
  select array_agg(r.id) into v_resp from public.responsaveis_da_categoria(new.category_id) r;
  if array_length(v_resp, 1) = 1 then
    new.assigned_to := v_resp[1];
  end if;
  return new;
end;
$$;

revoke all on function public.chamado_muda_de_categoria() from public, anon;

drop trigger if exists trg_chamado_muda_de_categoria on public.tickets;
create trigger trg_chamado_muda_de_categoria
  before update on public.tickets
  for each row execute function public.chamado_muda_de_categoria();

-- `trg_sla_segue_o_atendente` era `before update OF assigned_to`: só dispara quando a coluna está
-- no SET do comando, e não quando outro trigger a muda. Sem a coluna na lista, o responsável que a
-- função acima põe também recalcula o prazo. A função já sai cedo quando o atendente não mudou.
drop trigger if exists trg_sla_segue_o_atendente on public.tickets;
create trigger trg_sla_segue_o_atendente
  before update on public.tickets
  for each row execute function public.sla_segue_o_atendente();
