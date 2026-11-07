-- Chamado reaberto continuava com a data de resolução e seguia contando nos indicadores (auditoria 2026-11-06). A regra
-- fica no banco para valer em toda reabertura, por qualquer tela. A linha de hoje é o #305, reaberto como agendado.
create or replace function public.chamado_reaberto_limpa_resolucao()
returns trigger
language plpgsql
as $$
begin
  new.resolved_at := null;
  return new;
end;
$$;

revoke all on function public.chamado_reaberto_limpa_resolucao() from public, anon;

create trigger trg_chamado_reaberto_limpa_resolucao
  before update of status on public.tickets
  for each row
  when (old.status in ('resolved', 'closed') and new.status not in ('resolved', 'closed'))
  execute function public.chamado_reaberto_limpa_resolucao();

update public.tickets
   set resolved_at = null
 where resolved_at is not null
   and status not in ('resolved', 'closed');
