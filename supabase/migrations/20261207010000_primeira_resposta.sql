-- A PRIMEIRA RESPOSTA É REGISTRADA E TEM PRAZO PRÓPRIO (decisão do dono, 2026-10-06).
--
-- MEDIDO NA PRODUÇÃO: o chamado #19 teve resposta pública da equipe e `first_response_at` ficou
-- nulo — só o botão "Assumir" (`assignToMe`) gravava o campo. O "37 min restantes" que o dono viu
-- era o prazo de RESOLUÇÃO, e o de primeira resposta (`sla_policies.first_response_time`) não era
-- calculado nem mostrado. O dono escolheu o padrão do mercado: dois relógios.
--
--   1. a primeira resposta PÚBLICA de alguém que não é o solicitante grava `first_response_at`
--      (ao assumir continua gravando, pela tela);
--   2. `first_response_due_at`: o prazo da 1ª resposta, em minutos ÚTEIS — o mesmo calendário do
--      prazo de resolução (expediente do setor, fim de semana, feriados, almoço do atendente);
--      nasce na abertura e acompanha a troca de atendente enquanto ninguém respondeu.

alter table public.tickets add column if not exists first_response_due_at timestamptz;

comment on column public.tickets.first_response_due_at is
  'Prazo da primeira resposta (minutos úteis de sla_policies.first_response_time). Decisão do dono, 2026-10-06.';

-- ─── 1. O prazo da primeira resposta ──────────────────────────────────────────────────────────
-- A mesma busca de política de `prazo_padrao_do_chamado`, trocando a coluna; a soma é a mesma
-- `prazo_do_chamado` (expediente, feriados, almoço). Sem a data pedida pela pessoa: ela vale para
-- a entrega, não para responder.
create or replace function public.prazo_da_primeira_resposta(
  p_tenant uuid, p_module text, p_priority text, p_inicio timestamptz, p_atendente uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_minutos integer;
begin
  select s.first_response_time into v_minutos
    from public.sla_policies s
   where s.tenant_id = p_tenant and s.priority::text = p_priority and s.is_active
     and (s.module = p_module or s.module is null)
   order by s.module nulls last
   limit 1;
  if v_minutos is null then
    return null;
  end if;
  return public.prazo_do_chamado(p_tenant, p_module, p_inicio, v_minutos, p_atendente);
end;
$$;

revoke all on function public.prazo_da_primeira_resposta(uuid, text, text, timestamptz, uuid) from public, anon;

-- ─── 2. Na abertura, os dois prazos ───────────────────────────────────────────────────────────
-- Cada um independente: o prazo de resolução posto à mão não impede o da resposta de nascer.
create or replace function public.calculate_sla_due_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Prazo de resolução já preenchido (à mão) fica.
  if new.sla_due_at is null then
    new.sla_due_at := public.prazo_padrao_do_chamado(new.tenant_id, new.module, new.priority::text,
                                                     coalesce(new.created_at, now()), new.assigned_to, new.due_date);
  end if;
  if new.first_response_due_at is null then
    new.first_response_due_at := public.prazo_da_primeira_resposta(new.tenant_id, new.module, new.priority::text,
                                                                   coalesce(new.created_at, now()), new.assigned_to);
  end if;
  return new;
end;
$function$;

-- ─── 3. Trocar o atendente: o prazo da resposta também segue o almoço de quem atende ──────────
-- Só enquanto ninguém respondeu e o mesmo comando não mexeu nele. O resto é 20261205060000 igual.
create or replace function public.sla_segue_o_atendente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prazo timestamptz;
begin
  if new.assigned_to is not distinct from old.assigned_to
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
  if old.sla_due_at is distinct from public.prazo_padrao_do_chamado(
       old.tenant_id, old.module, old.priority::text, old.created_at, old.assigned_to, old.due_date) then
    return new;
  end if;
  v_prazo := public.prazo_padrao_do_chamado(new.tenant_id, new.module, new.priority::text,
                                            new.created_at, new.assigned_to, new.due_date);
  if v_prazo is not null then
    new.sla_due_at := v_prazo;
  end if;
  return new;
end;
$$;

-- ─── 4. A resposta pública da equipe grava a primeira resposta ────────────────────────────────
-- `security definer`: quem responde pode não ter permissão de UPDATE no chamado (e a guarda do perfil
-- deixa passar escrita de trigger, `pg_trigger_depth() > 1`). Só a PRIMEIRA: `first_response_at`
-- preenchido não muda. `first_response_at` não está na lista do aviso de "alterado"
-- (`trg_notify_on_ticket_change`); a porta `helpoint.automation` fecha os fluxos só durante este
-- UPDATE — registrar a resposta é arrumação do sistema, não movimentação de alguém.
create or replace function public.chamado_registra_primeira_resposta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes text := current_setting('helpoint.automation', true);
begin
  if new.is_internal or new.author_id is null then
    return null;
  end if;
  perform set_config('helpoint.automation', '1', true);
  update public.tickets t
     set first_response_at = new.created_at
   where t.id = new.ticket_id
     and t.first_response_at is null
     and t.requester_id is distinct from new.author_id;
  perform set_config('helpoint.automation', coalesce(v_antes, '0'), true);
  return null;
end;
$$;

revoke all on function public.chamado_registra_primeira_resposta() from public, anon, authenticated;

drop trigger if exists trg_chamado_registra_primeira_resposta on public.ticket_comments;
create trigger trg_chamado_registra_primeira_resposta
  after insert on public.ticket_comments
  for each row execute function public.chamado_registra_primeira_resposta();

-- ─── 5. O que já existe ───────────────────────────────────────────────────────────────────────
-- O prazo da resposta pela política de hoje; a primeira resposta pela primeira resposta pública da
-- equipe já gravada. Só colunas que nenhum aviso observa; fluxos fechados pela porta.
do $$
begin
  perform set_config('helpoint.automation', '1', true);

  update public.tickets t
     set first_response_due_at = public.prazo_da_primeira_resposta(
           t.tenant_id, t.module, t.priority::text, t.created_at, t.assigned_to)
   where t.first_response_due_at is null;

  update public.tickets t
     set first_response_at = r.primeira
    from (select c.ticket_id, min(c.created_at) as primeira
            from public.ticket_comments c
            join public.tickets t2 on t2.id = c.ticket_id
           where not c.is_internal
             and c.author_id is not null
             and c.author_id is distinct from t2.requester_id
           group by c.ticket_id) r
   where t.id = r.ticket_id and t.first_response_at is null;

  perform set_config('helpoint.automation', '0', true);
end $$;
