-- ÚLTIMA RESPOSTA DO CHAMADO (proposta "Helpoint no dia a dia", etapa 4 · Chamados, aprovada em 2026-10-24): a fila
-- mostra há quanto tempo o chamado foi aberto e há quanto tempo alguém respondeu nele. Resposta é o comentário visível
-- ao solicitante (nota interna não conta: quem pediu não a vê).
--
-- Tabela própria, e não coluna em `tickets`, de propósito: gravar em `tickets` a cada comentário dispararia os gatilhos
-- do chamado (automações de "registro alterado", avisos, auditoria) por algo que não mudou o chamado.

create table if not exists public.chamado_ultima_resposta (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quando timestamptz not null
);
alter table public.chamado_ultima_resposta enable row level security;
-- Quem vê o chamado vê a hora da última resposta (a subconsulta passa pelo RLS de `tickets`).
create policy chamado_ultima_resposta_le on public.chamado_ultima_resposta for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = chamado_ultima_resposta.ticket_id));
-- Só o gatilho escreve.

insert into public.chamado_ultima_resposta (ticket_id, tenant_id, quando)
select c.ticket_id, t.tenant_id, max(c.created_at)
  from public.ticket_comments c join public.tickets t on t.id = c.ticket_id
 where not c.is_internal
 group by c.ticket_id, t.tenant_id
on conflict (ticket_id) do nothing;

create or replace function public.chamado_registra_ultima_resposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_internal then
    insert into public.chamado_ultima_resposta (ticket_id, tenant_id, quando)
    values (new.ticket_id, new.tenant_id, new.created_at)
    on conflict (ticket_id) do update set quando = greatest(chamado_ultima_resposta.quando, excluded.quando);
  end if;
  return new;
end;
$$;
revoke all on function public.chamado_registra_ultima_resposta() from public, anon;

drop trigger if exists chamado_registra_ultima_resposta on public.ticket_comments;
create trigger chamado_registra_ultima_resposta after insert on public.ticket_comments
  for each row execute function public.chamado_registra_ultima_resposta();
