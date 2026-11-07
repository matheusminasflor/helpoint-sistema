-- A lista do Google traz nome e e-mail de quem entrou e ficava na mesma linha da pauta: quem entrou depois no canal
-- conseguia lê-la pela API, contra a regra aprovada (transcrição e presença só para quem participou e a Diretoria).
create table public.reuniao_listas (
  reuniao_id uuid primary key references public.reunioes (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  csv text not null
);
alter table public.reuniao_listas enable row level security;

create policy "Lista: quem participou e a Diretoria" on public.reuniao_listas for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and (public.reuniao_participei(reuniao_id) or public.reuniao_da_diretoria()));

insert into public.reuniao_listas (reuniao_id, tenant_id, csv)
select id, tenant_id, lista_google from public.reunioes where lista_google is not null;

alter table public.reunioes drop column lista_google;

-- Só o robô grava. Sem policy de escrita o RLS já recusa; tirar o privilégio fecha a segunda porta.
revoke insert, update, delete on public.reuniao_series, public.reunioes, public.reuniao_transcricoes, public.reuniao_listas,
  public.reuniao_presencas, public.reuniao_nomes, public.reuniao_leituras, public.reuniao_robo from anon, authenticated;
