-- A AVALIAÇÃO DO ATENDIMENTO É SIGILOSA (dono, 2026-10-09).
--
-- "O atendente consegue ver o que a pessoa avaliou e as estrelas; o ideal é não saber. Somente os gestores de
-- cada setor terem um indicador dos seus atendentes, as avaliações e os motivos. E quem avalia saber que o
-- atendente não vê." Decisões (múltipla escolha): veem o gestor do setor, a Diretoria e o administrador; o
-- indicador fica nos Indicadores do setor; as 44 avaliações que já existiam MUDAM para o registro sigiloso.
--
-- Por onde o atendente via (medido): (1) avaliar gravava um COMENTÁRIO PÚBLICO no chamado ("Solicitante
-- avaliou o atendimento com nota 5/5. Comentário: …"), que ainda disparava o aviso de resposta para ele;
-- (2) a nota ficava em `tickets.satisfaction_rating`, legível por quem vê o chamado; (3) o gráfico de
-- atendentes dos Indicadores mostrava a média de cada um.
--
-- Agora a nota mora em `avaliacoes_do_atendimento`, que o atendente não lê; o chamado só guarda QUE foi
-- avaliado (`avaliado_em`), para quem pediu não ser convidado de novo.

-- ─── 1. O registro sigiloso ──────────────────────────────────────────────────────────────────────
create table if not exists public.avaliacoes_do_atendimento (
  ticket_id uuid primary key references public.tickets (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module text,
  atendente_id uuid references public.profiles (id) on delete set null,
  solicitante_id uuid references public.profiles (id) on delete set null,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);
create index if not exists avaliacoes_do_atendimento_setor on public.avaliacoes_do_atendimento (tenant_id, module, created_at);
alter table public.avaliacoes_do_atendimento enable row level security;
revoke all on public.avaliacoes_do_atendimento from anon;

alter table public.tickets add column if not exists avaliado_em timestamptz;

-- Quem vê as avaliações de um setor: o gestor do setor (menos as que são dele mesmo), a Diretoria e o
-- administrador. O atendente não, nem a própria média.
create or replace function public.ve_avaliacoes_do_setor(p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or exists (select 1 from public.user_module_access m where m.user_id = auth.uid() and m.module = 'diretoria')
      or public.gestor_do_setor(auth.uid(), public.setor_do_modulo(p_module));
$$;
revoke all on function public.ve_avaliacoes_do_setor(text) from public, anon;
grant execute on function public.ve_avaliacoes_do_setor(text) to authenticated;

create policy avaliacoes_do_atendimento_le on public.avaliacoes_do_atendimento for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (solicitante_id = auth.uid()
              or public.is_admin_or_higher(auth.uid())
              or exists (select 1 from public.user_module_access m where m.user_id = auth.uid() and m.module = 'diretoria')
              or (public.gestor_do_setor(auth.uid(), public.setor_do_modulo(module)) and atendente_id is distinct from auth.uid())));
-- Ninguém escreve direto: só `avaliar_atendimento`.

-- ─── 2. Avaliar ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.avaliar_atendimento(p_ticket uuid, p_nota integer, p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = p_ticket and tenant_id = public.get_user_tenant_id();
  if t.id is null or t.requester_id is distinct from auth.uid() then
    raise exception 'Só quem abriu o chamado avalia o atendimento.' using errcode = '42501';
  end if;
  if t.status::text <> 'resolved' then
    raise exception 'O chamado precisa estar resolvido para ser avaliado.' using errcode = '23514';
  end if;
  if t.resolved_at is not null and t.resolved_at < now() - interval '7 days' then
    raise exception 'O prazo de 7 dias para avaliar terminou.' using errcode = '23514';
  end if;
  if t.avaliado_em is not null then
    raise exception 'Este atendimento já foi avaliado.' using errcode = '23514';
  end if;
  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'A nota vai de 1 a 5.' using errcode = '23514';
  end if;
  insert into public.avaliacoes_do_atendimento (ticket_id, tenant_id, module, atendente_id, solicitante_id, nota, comentario)
  values (t.id, t.tenant_id, t.module, t.assigned_to, auth.uid(), p_nota, nullif(btrim(coalesce(p_comentario, '')), ''));
  update public.tickets set avaliado_em = now() where id = t.id;
end;
$$;
revoke all on function public.avaliar_atendimento(uuid, integer, text) from public, anon;
grant execute on function public.avaliar_atendimento(uuid, integer, text) to authenticated;

-- ─── 3. As 44 que já existiam: para o registro sigiloso, e fora do chamado ───────────────────────
insert into public.avaliacoes_do_atendimento (ticket_id, tenant_id, module, atendente_id, solicitante_id, nota, comentario, created_at)
select t.id, t.tenant_id, t.module, t.assigned_to, t.requester_id, t.satisfaction_rating,
       (select nullif(btrim(substring(c.content from 'Comentário: (.*)$')), '')
          from public.ticket_comments c
         where c.ticket_id = t.id and c.content like 'Solicitante avaliou o atendimento com nota%'
         order by c.created_at desc limit 1),
       coalesce((select max(c.created_at) from public.ticket_comments c
                  where c.ticket_id = t.id and c.content like 'Solicitante avaliou o atendimento com nota%'),
                t.updated_at)
  from public.tickets t
 where t.satisfaction_rating between 1 and 5
on conflict (ticket_id) do nothing;

update public.tickets t
   set avaliado_em = a.created_at
  from public.avaliacoes_do_atendimento a
 where a.ticket_id = t.id and t.avaliado_em is null;

-- A nota sai do chamado (onde o atendente a lia) e o comentário público "Solicitante avaliou…" também — o
-- conteúdo dos dois acabou de ir para o registro sigiloso.
update public.tickets set satisfaction_rating = null where satisfaction_rating is not null;
delete from public.ticket_comments where content like 'Solicitante avaliou o atendimento com nota%';
