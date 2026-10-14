-- AVISO DAS ATUALIZAÇÕES DO SISTEMA (dono, 2026-10-14: "o usuário ser notificado das atualizações pela Lyra avisa e
-- no Jornal aparecer notificação em azul para ler").
--   1. publicou uma "Atualização do sistema" no Jornal: toda pessoa ativa da empresa recebe o aviso (sem e-mail);
--   2. `jornal_lidas` guarda quem já leu cada notícia — é dela que sai o azul "não lida" do Jornal.

create table if not exists public.jornal_lidas (
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  noticia_id uuid not null references public.jornal_noticias(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  lida_em timestamptz not null default now(),
  primary key (noticia_id, user_id)
);
alter table public.jornal_lidas enable row level security;
create policy jornal_lidas_minhas on public.jornal_lidas for select to authenticated
  using (user_id = auth.uid());
create policy jornal_lidas_marca on public.jornal_lidas for insert to authenticated
  with check (user_id = auth.uid() and tenant_id = (select public.get_user_tenant_id()));

create or replace function public.avisa_atualizacao_do_sistema()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo <> 'atualizacao_sistema' or new.status <> 'publicada'
     or (tg_op = 'UPDATE' and old.status = 'publicada') then
    return null;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select new.tenant_id, p.id, 'system_update', 'jornal', new.id, 'Atualização do sistema', new.titulo, true
    from public.profiles p
   where p.tenant_id = new.tenant_id and coalesce(p.is_active, true);
  return null;
end;
$$;
revoke all on function public.avisa_atualizacao_do_sistema() from public, anon, authenticated;
drop trigger if exists trg_avisa_atualizacao_do_sistema on public.jornal_noticias;
create trigger trg_avisa_atualizacao_do_sistema after insert or update of status on public.jornal_noticias
  for each row execute function public.avisa_atualizacao_do_sistema();

-- As duas já publicadas em 2026-10-14 avisam agora.
insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
select n.tenant_id, p.id, 'system_update', 'jornal', n.id, 'Atualização do sistema', n.titulo, true
  from public.jornal_noticias n
  join public.profiles p on p.tenant_id = n.tenant_id and coalesce(p.is_active, true)
 where n.tipo = 'atualizacao_sistema' and n.status = 'publicada';
