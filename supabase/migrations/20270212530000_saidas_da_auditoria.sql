-- Prioridade Alta da auditoria de 2026-11-06, aprovada pelo dono.

-- Compra aprovada pode ser cancelada com motivo enquanto não foi paga: se o fornecedor desiste, ela ficava parada. Depois de
-- paga já existe conta a pagar, e o caminho é o reajuste.
do $$
declare
  v_def text := pg_get_functiondef('public.compras_guarda_o_status()'::regprocedure);
  v_de text := $x$  if new.status = 'rejected' and coalesce(trim(new.rejection_reason), '') = '' then
$x$;
begin
  if position(v_de in v_def) = 0 then
    raise exception 'trecho não encontrado em compras_guarda_o_status';
  end if;
  execute replace(v_def, v_de, $x$  if new.status = 'rejected' and old.pagamento_em is not null then
    raise exception 'Esta compra já foi paga: ela não pode mais ser cancelada.' using errcode = '23514';
  end if;
$x$ || v_de);
end;
$$;

-- Laudo concluído só muda com quem assina. A trava olhava só a ida para concluído, e "Salvar rascunho" voltava o laudo.
create or replace function public.laudo_so_finaliza_quem_assina()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.pode_no_setor('qualidade', 'technical_reports', 'sign') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    raise exception 'Laudo concluído só muda com "Assinar/Finalizar" em Laudos técnicos (Qualidade).' using errcode = '42501';
  end if;
  if new.status = 'completed' then
    raise exception 'Finalizar o laudo pede "Assinar/Finalizar" em Laudos técnicos (Qualidade).' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.laudo_so_finaliza_quem_assina() from public, anon;
drop trigger laudo_so_finaliza_quem_assina on public.sac_technical_reports;
create trigger laudo_so_finaliza_quem_assina before insert or update on public.sac_technical_reports
  for each row execute function public.laudo_so_finaliza_quem_assina();

-- O cliente recebe o aviso ao resolver ou encerrar, com o texto de "Como foi resolvido", e de novo se o SAC for reaberto e
-- resolvido outra vez: a chave era só o id do SAC.
do $$
declare
  v_def text := pg_get_functiondef('public.emit_sac_resolved_event()'::regprocedure);
begin
  if position($x$IF NEW.status <> 'resolved' OR OLD.status = 'resolved' THEN$x$ in v_def) = 0
     or position($x$COALESCE(NEW.resolution_summary, '')$x$ in v_def) = 0
     or position($x$'sac-resolved-' || NEW.id$x$ in v_def) = 0 then
    raise exception 'trecho não encontrado em emit_sac_resolved_event';
  end if;
  v_def := replace(v_def, $x$IF NEW.status <> 'resolved' OR OLD.status = 'resolved' THEN$x$,
                          $x$IF NEW.status NOT IN ('resolved', 'closed') OR OLD.status IN ('resolved', 'closed') THEN$x$);
  v_def := replace(v_def, $x$COALESCE(NEW.resolution_summary, '')$x$, $x$COALESCE(NEW.resolution_notes, NEW.resolution_summary, '')$x$);
  execute replace(v_def, $x$'sac-resolved-' || NEW.id$x$, $x$'sac-resolved-' || NEW.id || '-' || extract(epoch from now())::bigint$x$);
end;
$$;
