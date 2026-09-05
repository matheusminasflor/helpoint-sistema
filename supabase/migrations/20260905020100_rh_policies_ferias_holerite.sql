-- RH: o colaborador para de poder aprovar as próprias férias e de mexer no
-- próprio holerite.
--
-- O QUE ESTAVA ABERTO
-- ───────────────────
-- 1. `rh_vacation_requests`, policy "Colaborador cancela sua própria
--    solicitação pendente":
--        USING      (user_id = auth.uid() AND status = 'pendente')
--        WITH CHECK (user_id = auth.uid())
--    O nome promete cancelamento; a regra permite qualquer coisa. O USING
--    exige que a linha ESTEJA pendente, mas o WITH CHECK não diz nada sobre o
--    estado FINAL. Um PATCH na própria linha com {"status":"aprovada"} passa
--    — o CHECK da tabela aceita 'aprovada'. O colaborador aprova as próprias
--    férias.
--
-- 2. `rh_payslips`, policy "Colaborador marca holerite como visto":
--        USING      (user_id = auth.uid())
--        WITH CHECK (user_id = auth.uid())
--    Nenhuma restrição de coluna. O colaborador troca `file_path`, `type` e
--    `reference_month` do próprio holerite.
--
-- POR QUE DUAS FERRAMENTAS DIFERENTES
-- ───────────────────────────────────
-- Em férias o risco é o ESTADO de destino, e WITH CHECK resolve: é
-- exatamente a cláusula que avalia a linha depois da alteração.
-- Em holerite o risco é a COLUNA, e RLS não enxerga coluna. Grant por coluna
-- não serve porque o RH também é `authenticated` e perderia o acesso junto.
-- Sobra o trigger.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Férias: o único destino que o colaborador alcança é 'cancelada'
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists "Colaborador cancela sua própria solicitação pendente"
  on public.rh_vacation_requests;

create policy "Colaborador cancela sua própria solicitação pendente"
  on public.rh_vacation_requests
  for update
  using      (user_id = auth.uid() and status = 'pendente')
  with check (user_id = auth.uid() and status = 'cancelada');

-- Nota para quem revisa: com isto o colaborador também deixa de poder EDITAR
-- uma solicitação pendente (datas, dias, motivo) — qualquer UPDATE que não
-- termine em 'cancelada' passa a ser recusado. Hoje o front só oferece
-- cancelar, então nada de tela quebra. Se um dia existir "editar antes da
-- decisão", esta policy precisa de um segundo caminho.

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Holerite: o colaborador só encosta em `viewed_at`
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.rh_payslips_guard_colaborador()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Quem é do RH (ou supervisor) passa direto: a policy do RH já o autoriza,
  -- e é ele quem legitimamente troca arquivo, tipo e competência.
  if public.has_rh_access(auth.uid()) then
    return new;
  end if;

  -- Para o resto, a única diferença tolerada entre a linha velha e a nova é
  -- `viewed_at`. Comparar registro a registro, em vez de listar colunas uma a
  -- uma, faz com que uma coluna nova criada no futuro já nasça protegida.
  if (to_jsonb(new) - 'viewed_at') is distinct from (to_jsonb(old) - 'viewed_at') then
    raise exception 'colaborador so pode marcar o holerite como visto'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists rh_payslips_guard_colaborador on public.rh_payslips;

create trigger rh_payslips_guard_colaborador
  before update on public.rh_payslips
  for each row
  execute function public.rh_payslips_guard_colaborador();
