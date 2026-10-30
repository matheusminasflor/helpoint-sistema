-- Rotinas do dia (dono, 2026-10-30; docs/proposta-rotinas.md): cada colaborador vê no Início o que fazer de manhã, à
-- tarde e no fim do dia, antes dos chamados.
--
-- Decisões do dono: o gestor cria as da equipe e a pessoa cria as suas (a do gestor ela não muda); a não feita fica
-- registrada e não acumula; férias pausam, e a rotina pode "passar ao substituto".
--
-- Duas tabelas: `rotinas` (o modelo) e `rotina_registros` (cada vez que alguém marcou ou pulou). A lista do dia NÃO é
-- gerada por robô: `rotinas_de_hoje()` calcula na hora, a partir dos modelos. "Não feita" é o dia que passou sem
-- registro — não existe linha para isso.

-- ─── 1. O modelo ──────────────────────────────────────────────────────────────────────────────
create table public.rotinas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  -- O setor da rotina: é por ele que o gestor tem a caixinha (`pode_no_setor(setor, 'rotinas', …)`).
  setor text not null check (setor in ('ti','marketing','rh','qualidade','financeiro','compras','comercial','educacional','expedicao','producao')),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 140),
  como_fazer text check (como_fazer is null or char_length(como_fazer) <= 2000),
  periodo text not null check (periodo in ('manha', 'tarde', 'fim_do_dia')),
  repeticao text not null check (repeticao in ('dias_uteis', 'dias_da_semana', 'mensal', 'ultimo_dia_util')),
  -- 1 = segunda … 5 = sexta (o fim de semana nunca tem rotina).
  dias_da_semana smallint[] check (dias_da_semana is null or (cardinality(dias_da_semana) between 1 and 5
                                    and dias_da_semana <@ array[1,2,3,4,5]::smallint[])),
  dia_do_mes smallint check (dia_do_mes is null or dia_do_mes between 1 and 31),
  -- O que pedir ao marcar como feita.
  pede text not null default 'nada' check (pede in ('nada', 'observacao', 'anexo')),
  passa_ao_substituto boolean not null default false,
  pessoas uuid[] not null check (cardinality(pessoas) between 1 and 50),
  criada_por uuid not null default auth.uid() references public.profiles(id),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rotinas_repeticao_completa check (
    ((repeticao = 'dias_da_semana') = (dias_da_semana is not null))
    and ((repeticao = 'mensal') = (dia_do_mes is not null)))
);
create index rotinas_tenant_ativas on public.rotinas (tenant_id) where ativa;
create index rotinas_pessoas on public.rotinas using gin (pessoas);

comment on table public.rotinas is
  'Rotina do dia (2026-10-30): o modelo. A lista de hoje sai de rotinas_de_hoje(); "excluir" é ativa = false (o histórico fica).';

-- ─── 2. O registro ────────────────────────────────────────────────────────────────────────────
create table public.rotina_registros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rotina_id uuid not null references public.rotinas(id) on delete cascade,
  -- De quem é a rotina naquele dia (quem está nela) e quem marcou — o substituto, nas férias.
  pessoa_id uuid not null references public.profiles(id),
  feita_por uuid not null references public.profiles(id),
  dia date not null,
  situacao text not null check (situacao in ('feita', 'pulada')),
  motivo text check (motivo is null or char_length(motivo) <= 500),
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  anexo_path text,
  feita_em timestamptz not null default now(),
  unique (rotina_id, pessoa_id, dia),
  constraint rotina_registros_pulada_tem_motivo check (situacao <> 'pulada' or char_length(btrim(coalesce(motivo, ''))) >= 3)
);
create index rotina_registros_dia on public.rotina_registros (tenant_id, dia);

-- ─── 3. As regras de calendário ───────────────────────────────────────────────────────────────
-- Dia útil da empresa: nem sábado nem domingo, nem feriado nacional, nem feriado cadastrado.
create or replace function public.rotina_dia_util(p_tenant uuid, p_dia date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select extract(isodow from p_dia) < 6
     and not exists (select 1 from public.feriados_nacionais(extract(year from p_dia)::int) f where f.data = p_dia)
     and not exists (select 1 from public.feriados_da_empresa e where e.tenant_id = p_tenant and e.data = p_dia);
$$;

-- O dia útil do mês para "todo dia X": o próprio X (ou o último dia do mês, se ele for menor), e quando não é útil, o
-- dia útil ANTERIOR — antecipa, como conta a vencer, e fica no mesmo mês. "Último dia útil" é o dia 31.
create or replace function public.rotina_dia_do_mes(p_tenant uuid, p_mes date, p_dia smallint)
returns date
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_primeiro date := date_trunc('month', p_mes)::date;
  v_dia date := least(v_primeiro + (p_dia - 1), (v_primeiro + interval '1 month' - interval '1 day')::date);
begin
  while v_dia > v_primeiro and not public.rotina_dia_util(p_tenant, v_dia) loop
    v_dia := v_dia - 1;
  end loop;
  return v_dia;
end;
$$;

-- A rotina vale neste dia?
create or replace function public.rotina_vale_no_dia(r public.rotinas, p_dia date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.ativa and public.rotina_dia_util(r.tenant_id, p_dia) and case r.repeticao
    when 'dias_uteis' then true
    when 'dias_da_semana' then extract(isodow from p_dia)::smallint = any(r.dias_da_semana)
    when 'mensal' then p_dia = public.rotina_dia_do_mes(r.tenant_id, p_dia, r.dia_do_mes)
    when 'ultimo_dia_util' then p_dia = public.rotina_dia_do_mes(r.tenant_id, p_dia, 31::smallint)
  end;
$$;

-- ─── 4. A lista de hoje ───────────────────────────────────────────────────────────────────────
-- "Hoje" é o dia do Brasil (regra 10 do CLAUDE.md). `rotinas.hoje` existe só para o pgTAP fixar um dia útil — num
-- sábado o CI não teria rotina para marcar. O cliente não escreve GUC: o PostgREST só expõe o schema public.
create or replace function public.rotina_hoje()
returns date
language sql
stable
set search_path to 'public'
as $$
  select coalesce(nullif(current_setting('rotinas.hoje', true), '')::date, (now() at time zone 'America/Sao_Paulo')::date);
$$;

-- As minhas, menos as de quando estou de férias ou afastado; mais as de quem eu substituo, quando a rotina foi
-- marcada "passa ao substituto" (o substituto é o de `ferias_substitutos` daquela ausência — sem substituto, pausa).
create or replace function public.rotinas_de_hoje()
returns table (
  rotina_id uuid, pessoa_id uuid, pessoa_nome text, titulo text, como_fazer text, periodo text, pede text,
  situacao text, motivo text, observacao text, anexo_path text, feita_em timestamptz, feita_por_nome text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with hoje as (select public.rotina_hoje() as dia),
  instancias as (
    select r.*, p as pessoa
      from public.rotinas r
      cross join lateral unnest(r.pessoas) as p
      cross join hoje h
     where r.tenant_id = public.get_user_tenant_id()
       and public.rotina_vale_no_dia(r, h.dia)
  ),
  minhas as (
    select i.*, i.pessoa as de_quem from instancias i
     where i.pessoa = auth.uid() and public.ausencia_de_hoje(i.pessoa) is null
    union all
    select i.*, i.pessoa from instancias i
     where i.passa_ao_substituto and i.pessoa <> auth.uid()
       and exists (select 1 from public.ferias_substitutos s
                    where s.ausencia_id = public.ausencia_de_hoje(i.pessoa) and s.substituto_id = auth.uid())
  )
  select m.id, m.de_quem, case when m.de_quem = auth.uid() then null else pp.full_name end,
         m.titulo, m.como_fazer, m.periodo, m.pede,
         g.situacao, g.motivo, g.observacao, g.anexo_path, g.feita_em, pf.full_name
    from minhas m
    cross join hoje h
    join public.profiles pp on pp.id = m.de_quem
    left join public.rotina_registros g on g.rotina_id = m.id and g.pessoa_id = m.de_quem and g.dia = h.dia
    left join public.profiles pf on pf.id = g.feita_por
   order by case m.periodo when 'manha' then 1 when 'tarde' then 2 else 3 end, m.created_at, m.titulo;
$$;

-- Os horários que dividem o dia da pessoa: o fim do almoço dela (RH) e o fim do expediente do setor dela.
create or replace function public.rotina_meus_horarios()
returns table (inicio_almoco time, fim_almoco time, fim_expediente time)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.inicio_almoco, a.fim_almoco,
         coalesce(s.fim_expediente, (select e.fim from public.expediente_padrao(x.modulo) e))
    from (select case lower(btrim(coalesce(p.department, ''))) when 'ti' then 'tickets' when '' then 'tickets'
                 else lower(btrim(p.department)) end as modulo
            from public.profiles p where p.id = auth.uid()) x
    left join public.rh_employee_profiles a on a.user_id = auth.uid()
    left join public.sla_regras_do_setor s on s.tenant_id = public.get_user_tenant_id() and s.module = x.modulo;
$$;

-- ─── 5. Marcar, pular, desmarcar ──────────────────────────────────────────────────────────────
-- Só o que está na MINHA lista de hoje — nunca outro dia, nunca a rotina de outra pessoa que não substituo.
create or replace function public.rotina_marcar(p_rotina uuid, p_pessoa uuid, p_situacao text, p_motivo text default null,
                                                p_observacao text default null, p_anexo text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_pede text;
  v_id uuid;
begin
  select h.pede into v_pede from public.rotinas_de_hoje() h where h.rotina_id = p_rotina and h.pessoa_id = p_pessoa;
  if not found then
    raise exception 'Esta rotina não está na sua lista de hoje.' using errcode = '42501';
  end if;
  if p_situacao = 'feita' then
    if v_pede = 'observacao' and char_length(btrim(coalesce(p_observacao, ''))) < 3 then
      raise exception 'Esta rotina pede uma observação ao marcar.' using errcode = '23514';
    end if;
    if v_pede = 'anexo' and p_anexo is null then
      raise exception 'Esta rotina pede uma foto ou arquivo ao marcar.' using errcode = '23514';
    end if;
  end if;
  -- O arquivo tem de estar na pasta de quem marca (a policy do balde só deixa gravar lá).
  if p_anexo is not null and p_anexo not like public.get_user_tenant_id()::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Arquivo fora da sua pasta.' using errcode = '42501';
  end if;

  insert into public.rotina_registros (tenant_id, rotina_id, pessoa_id, feita_por, dia, situacao, motivo, observacao, anexo_path)
  values (public.get_user_tenant_id(), p_rotina, p_pessoa, auth.uid(), public.rotina_hoje(),
          p_situacao, case when p_situacao = 'pulada' then btrim(p_motivo) end,
          nullif(btrim(coalesce(p_observacao, '')), ''), p_anexo)
  on conflict (rotina_id, pessoa_id, dia) do update
     set situacao = excluded.situacao, motivo = excluded.motivo, observacao = excluded.observacao,
         anexo_path = excluded.anexo_path, feita_por = excluded.feita_por, feita_em = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Desfazer o toque errado: só hoje, e só o que está na minha lista.
create or replace function public.rotina_desmarcar(p_rotina uuid, p_pessoa uuid)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.rotinas_de_hoje() h where h.rotina_id = p_rotina and h.pessoa_id = p_pessoa) then
    raise exception 'Esta rotina não está na sua lista de hoje.' using errcode = '42501';
  end if;
  delete from public.rotina_registros
   where rotina_id = p_rotina and pessoa_id = p_pessoa and dia = public.rotina_hoje();
end;
$$;

-- ─── 6. Quem cria e muda a rotina ─────────────────────────────────────────────────────────────
-- A pessoa cria a sua (só ela na rotina, num setor em que trabalha); o gestor (caixinha "Criar e editar" de Rotinas
-- no setor) cria para as pessoas do setor. Mexer: quem criou, ou o gestor do setor.
create or replace function public.rotina_e_so_minha(p_setor text, p_pessoas uuid[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_pessoas = array[auth.uid()]
     and p_setor = any(array_replace(public.setores_da_pessoa(auth.uid()), 'tickets', 'ti'));
$$;

-- Toda pessoa da rotina é da empresa e trabalha no setor dela; quem criou e a empresa não mudam; "excluir" (ativa
-- = false) de rotina que não é só minha pede a caixinha Excluir.
create or replace function public.rotinas_guarda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id <> old.tenant_id or new.criada_por <> old.criada_por then
      raise exception 'A empresa e quem criou a rotina não mudam.' using errcode = '42501';
    end if;
    if old.ativa and not new.ativa
       and not (old.criada_por = auth.uid() and public.rotina_e_so_minha(old.setor, old.pessoas))
       and not public.pode_no_setor(old.setor, 'rotinas', 'delete') then
      raise exception 'Excluir esta rotina pede a caixinha Excluir de Rotinas do setor.' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  if exists (
    select 1 from unnest(new.pessoas) p
     where not exists (select 1 from public.profiles x where x.id = p and x.tenant_id = new.tenant_id)
        or not (new.setor = any(array_replace(public.setores_da_pessoa(p), 'tickets', 'ti')))
  ) then
    raise exception 'Toda pessoa da rotina precisa ser do setor dela.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger rotinas_guarda before insert or update on public.rotinas
  for each row execute function public.rotinas_guarda();

alter table public.rotinas enable row level security;
alter table public.rotina_registros enable row level security;
revoke all on public.rotinas, public.rotina_registros from anon;
grant select, insert, update on public.rotinas to authenticated;
grant select on public.rotina_registros to authenticated;

create policy rotinas_le on public.rotinas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (auth.uid() = any(pessoas) or criada_por = auth.uid() or public.pode_no_setor(setor, 'rotinas', 'view')));

create policy rotinas_cria on public.rotinas for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and criada_por = auth.uid()
              and (public.rotina_e_so_minha(setor, pessoas) or public.pode_no_setor(setor, 'rotinas', 'edit')));

-- O with check repete a permissão do using (regra 15 do CLAUDE.md): quem só cria a sua não sai dela pela porta do
-- gestor, e o gestor não leva a rotina para um setor em que não tem a caixinha.
create policy rotinas_muda on public.rotinas for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((criada_por = auth.uid() and public.rotina_e_so_minha(setor, pessoas)) or public.pode_no_setor(setor, 'rotinas', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((criada_por = auth.uid() and public.rotina_e_so_minha(setor, pessoas)) or public.pode_no_setor(setor, 'rotinas', 'edit')));

-- O registro se lê pela própria pessoa, por quem marcou e pelo gestor do setor. Escrever, só pelas funções.
create policy rotina_registros_le on public.rotina_registros for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (pessoa_id = auth.uid() or feita_por = auth.uid()
              or exists (select 1 from public.rotinas r where r.id = rotina_registros.rotina_id
                          and public.pode_no_setor(r.setor, 'rotinas', 'view'))));

-- ─── 7. A foto ou o arquivo da rotina ─────────────────────────────────────────────────────────
-- Pasta: <empresa>/<quem marcou>/<arquivo>. Grava e apaga só na própria pasta; lê quem lê o registro que aponta
-- para o arquivo (a policy de rotina_registros decide) ou o dono da pasta.
insert into storage.buckets (id, name, public, file_size_limit)
values ('rotinas', 'rotinas', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy rotinas_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'rotinas' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy rotinas_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'rotinas' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and (storage.foldername(name))[2] = auth.uid()::text);
create policy rotinas_arquivo_le on storage.objects for select to authenticated
  using (bucket_id = 'rotinas' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and ((storage.foldername(name))[2] = auth.uid()::text
              or exists (select 1 from public.rotina_registros g where g.anexo_path = storage.objects.name)));

-- ─── 8. A caixinha nos perfis Gestor de cada setor ────────────────────────────────────────────
-- Dá acesso, não tira: o Gestor de cada setor cria, vê e exclui as rotinas da equipe. Operador cria só as suas.
-- ponytail: só os perfis que já existem; empresa nova nasce sem a caixinha (há uma empresa só, ADR-010).
update public.access_profiles
   set permissions = coalesce(permissions, '{}'::jsonb) || '{"rotinas": {"view": true, "edit": true, "delete": true}}'::jsonb
 where name = 'Gestor' and department <> 'diretoria';

-- ─── 9. Ninguém de fora chama ─────────────────────────────────────────────────────────────────
revoke all on function public.rotina_hoje() from public, anon;
revoke all on function public.rotina_dia_util(uuid, date) from public, anon;
revoke all on function public.rotina_dia_do_mes(uuid, date, smallint) from public, anon;
revoke all on function public.rotina_vale_no_dia(public.rotinas, date) from public, anon;
revoke all on function public.rotinas_de_hoje() from public, anon;
revoke all on function public.rotina_meus_horarios() from public, anon;
revoke all on function public.rotina_marcar(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.rotina_desmarcar(uuid, uuid) from public, anon;
revoke all on function public.rotina_e_so_minha(text, uuid[]) from public, anon;
revoke all on function public.rotinas_guarda() from public, anon;
grant execute on function public.rotina_hoje() to authenticated;
grant execute on function public.rotina_dia_util(uuid, date) to authenticated;
grant execute on function public.rotina_dia_do_mes(uuid, date, smallint) to authenticated;
grant execute on function public.rotina_vale_no_dia(public.rotinas, date) to authenticated;
grant execute on function public.rotinas_de_hoje() to authenticated;
grant execute on function public.rotina_meus_horarios() to authenticated;
grant execute on function public.rotina_marcar(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.rotina_desmarcar(uuid, uuid) to authenticated;
grant execute on function public.rotina_e_so_minha(text, uuid[]) to authenticated;
