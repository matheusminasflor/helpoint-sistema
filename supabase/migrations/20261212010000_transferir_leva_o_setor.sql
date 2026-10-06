-- TRANSFERIR PARA ALGUÉM DE OUTRO SETOR LEVA O CHAMADO PARA O SETOR DELA (dono, 2026-10-06).
--
-- MEDIDO NA PRODUÇÃO: o chamado #27 era do Marketing, foi aberto na TI e o dono o transferiu para a
-- Merilyn (setor Marketing, perfil Marketing:Operador). A tela de transferir lista gente de todos os
-- setores, mas só trocava `assigned_to`: o chamado ficou no módulo 'tickets' (TI) e ela não o via
-- na fila dela. Não existia "transferir de setor".
--
-- Decisões do dono (as recomendadas):
--   * quem transfere escolhe a CATEGORIA do novo setor (categorias são de cada setor); as respostas
--     do formulário da categoria antiga ficam guardadas no chamado;
--   * o prazo é RECALCULADO pelo novo setor desde a abertura (expediente, feriados, almoço de quem
--     atende, pausas em Pendente já descontadas); prazo posto à mão fica.
-- Transferir para alguém do MESMO setor continua como antes (a tela faz o UPDATE de `assigned_to`).

-- ─── 1. De que setores a pessoa pode receber chamado ──────────────────────────────────────────
-- A regra de "ser do setor" que já existe (`membros_do_aviso`: setor do perfil, concessão, perfil de
-- acesso ou "acompanhar", E vê os chamados do setor) — aqui, perguntada a partir da pessoa. Compras
-- fica de fora: o chamado de compra tem fluxo próprio (orçamentos, aprovação) e não migra.
-- Devolve módulos de chamado (o da TI é 'tickets'). Só de quem é da mesma empresa de quem pergunta.
create or replace function public.setores_para_transferir(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(m order by m), '{}'::text[])
    from public.profiles p
    cross join lateral unnest(public.setores_de_aviso(p.id)) m
   where p.id = p_user
     and p.tenant_id = public.get_user_tenant_id()
     and coalesce(p.is_active, true)
     and m <> 'compras'
     and public.pode_ver_chamado(p.id, p.tenant_id, m, null, null);
$$;

comment on function public.setores_para_transferir(uuid) is
  'Setores (módulos de chamado) em que a pessoa atende — para a tela de transferir saber se o chamado muda de setor (2026-10-06).';

revoke all on function public.setores_para_transferir(uuid) from public, anon;
grant execute on function public.setores_para_transferir(uuid) to authenticated;

-- ─── 2. Mudar de setor recalcula o prazo como trocar de atendente ──────────────────────────────
-- Igual a 20261210010000, com uma condição a mais: o setor também dispara o recálculo. O teste "o
-- prazo de antes foi posto à mão?" usa o setor de ANTES (`old.module`) e o prazo novo usa o setor
-- NOVO — é o que faz o #27 (já com a Merilyn) ganhar o prazo do Marketing ao ser transferido.
-- `create or replace` preserva a ACL.
create or replace function public.sla_segue_o_atendente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prazo timestamptz;
begin
  if (new.assigned_to is not distinct from old.assigned_to and new.module is not distinct from old.module)
     or new.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    return new;
  end if;

  if new.first_response_at is null
     and new.first_response_due_at is not distinct from old.first_response_due_at then
    new.first_response_due_at := coalesce(
      public.prazo_da_primeira_resposta(new.tenant_id, new.module, new.priority::text, new.created_at, new.assigned_to),
      new.first_response_due_at);
  end if;

  if old.sla_due_at is null or new.sla_due_at is distinct from old.sla_due_at then
    return new;
  end if;
  -- O prazo de antes foi posto à mão? Então fica.
  if old.sla_due_at is distinct from public.prazo_padrao_com_pausa(
       old.tenant_id, old.module, old.priority::text, old.created_at, old.assigned_to, old.due_date,
       old.minutos_pausados) then
    return new;
  end if;
  v_prazo := public.prazo_padrao_com_pausa(new.tenant_id, new.module, new.priority::text,
                                           new.created_at, new.assigned_to, new.due_date,
                                           new.minutos_pausados);
  if v_prazo is not null then
    new.sla_due_at := v_prazo;
  end if;
  return new;
end;
$function$;

-- ─── 3. Transferir para outro setor: uma ação só, atômica ──────────────────────────────────────
-- Setor, categoria e atendente mudam no MESMO comando, com a nota interna no histórico. `security
-- definer` porque a pessoa autorizada é quem transfere no setor de ORIGEM — as guardas e o RLS de
-- `tickets` perguntariam pelo setor NOVO, onde ela pode nem ter perfil. As regras de negócio ficam
-- todas aqui, conferidas antes de gravar:
--   * quem pede tem "Transferir para outra pessoa" no setor de origem (dono/admin passam);
--   * a pessoa de destino atende o setor novo (`setores_para_transferir`);
--   * a categoria é do setor novo e da mesma empresa (a guarda `chamado_muda_de_categoria` confere
--     de novo, contra o `module` novo do mesmo comando);
--   * chamado encerrado ou de Compras não muda de setor.
-- Os triggers fazem o resto: o prazo segue o setor novo (acima), o aviso "foi transferido para
-- <setor>" sai do `notify_on_ticket_change` (atendente novo, solicitante, mencionados).
create or replace function public.transferir_chamado(
  p_ticket uuid, p_para uuid, p_modulo text, p_categoria_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t public.tickets%rowtype;
  v_cat public.ti_categories%rowtype;
  v_pai text;
  v_para text;
  v_de_setor text;
  v_para_setor text;
begin
  if auth.uid() is null then
    raise exception 'Entre no sistema para transferir o chamado.' using errcode = '42501';
  end if;

  select * into t from public.tickets
   where id = p_ticket and tenant_id = public.get_user_tenant_id()
   for update;
  if not found then
    raise exception 'Chamado não encontrado.' using errcode = '42501';
  end if;

  if t.module = 'compras' or p_modulo = 'compras' then
    raise exception 'Chamado de Compras não muda de setor: ele tem orçamentos e aprovação próprios.'
      using errcode = '22023';
  end if;
  if t.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    raise exception 'Chamado encerrado não muda de setor. Reabra antes de transferir.' using errcode = '22023';
  end if;
  if not public.pode_no_chamado(t.module, 'transfer') then
    raise exception 'Seu perfil de acesso não permite transferir este chamado.' using errcode = '42501';
  end if;
  if p_modulo is not distinct from t.module then
    raise exception 'A pessoa já é do setor do chamado: transfira sem mudar de setor.' using errcode = '22023';
  end if;
  if p_para is null or not (p_modulo = any (public.setores_para_transferir(p_para))) then
    raise exception 'Essa pessoa não atende o setor %.', public.nome_do_setor_do_chamado(p_modulo)
      using errcode = '22023';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da transferência.' using errcode = '22023';
  end if;

  select * into v_cat from public.ti_categories c
   where c.id = p_categoria_id and c.tenant_id = t.tenant_id and c.module = p_modulo
     and coalesce(c.is_active, true);
  if not found then
    raise exception 'A categoria tem de ser do setor %.', public.nome_do_setor_do_chamado(p_modulo)
      using errcode = '23514';
  end if;
  if v_cat.parent_id is not null then
    select c.name into v_pai from public.ti_categories c where c.id = v_cat.parent_id;
  end if;

  update public.tickets
     set module = p_modulo,
         category_id = v_cat.id,
         category = coalesce(v_pai, v_cat.name),
         subcategory = case when v_pai is not null then v_cat.name end,
         assigned_to = p_para
   where id = t.id;

  select coalesce(full_name, email) into v_para from public.profiles where id = p_para;
  v_de_setor := public.nome_do_setor_do_chamado(t.module);
  v_para_setor := public.nome_do_setor_do_chamado(p_modulo);
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (t.tenant_id, t.id, auth.uid(),
          format('Transferido de %s para %s — para %s. Categoria: %s. Motivo: %s',
                 v_de_setor, v_para_setor, coalesce(v_para, 'outra pessoa'),
                 case when v_pai is not null then v_pai || ' › ' || v_cat.name else v_cat.name end,
                 btrim(p_motivo)),
          true);
  return t.id;
end;
$$;

comment on function public.transferir_chamado(uuid, uuid, text, uuid, text) is
  'Transfere o chamado para alguém de OUTRO setor: setor, categoria e atendente num comando, com nota no histórico (2026-10-06).';

revoke all on function public.transferir_chamado(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.transferir_chamado(uuid, uuid, text, uuid, text) to authenticated;
