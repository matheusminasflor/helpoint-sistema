-- Turma cancelada seguia em "Próximos" como Inscrito, sem aviso (auditoria 2026-11-06). A pessoa passa a ver a situação
-- da turma, e quem está inscrito recebe o aviso no momento do cancelamento.
drop function public.meus_treinamentos();

create function public.meus_treinamentos()
returns table (
  inscricao_id uuid, treinamento text, horas numeric, inicio timestamptz, fim timestamptz, modalidade text,
  local text, situacao text, concluido_em timestamptz, turma_situacao text
)
language sql stable security definer set search_path to 'public' as $$
  select e.id, t.title, t.hours, s.starts_at, s.ends_at, s.modality, s.location, e.status, e.completed_at, s.status
    from public.training_enrollments e
    join public.training_sessions s on s.id = e.session_id
    join public.trainings t on t.id = s.training_id
   where e.profile_id = auth.uid() and e.tenant_id = public.get_user_tenant_id()
   order by s.starts_at desc
$$;

revoke all on function public.meus_treinamentos() from public, anon;
grant execute on function public.meus_treinamentos() to authenticated;

create or replace function public.turma_cancelada_avisa_inscritos()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select new.tenant_id, e.profile_id, 'reminder', 'training_session', new.id,
         'Turma cancelada',
         'A turma de ' || t.title || ' de ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || ' foi cancelada.'
    from public.training_enrollments e
    join public.trainings t on t.id = new.training_id
   where e.session_id = new.id and e.profile_id is not null and e.status = 'inscrito';
  return new;
end;
$$;

revoke all on function public.turma_cancelada_avisa_inscritos() from public, anon;

create trigger trg_turma_cancelada_avisa_inscritos
  after update of status on public.training_sessions
  for each row
  when (new.status = 'cancelada' and old.status is distinct from 'cancelada')
  execute function public.turma_cancelada_avisa_inscritos();
