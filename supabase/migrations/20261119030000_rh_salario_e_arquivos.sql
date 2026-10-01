-- O SALÁRIO E OS ARQUIVOS DO RH TAMBÉM OBEDECEM O PERFIL. 2026-10-01.
--
-- Fecha os dois tetos que a 20261119020000 deixou escritos (decisão do dono: "pode seguir com
-- ambos"), e põe limite de tamanho no arquivo (pedido dele: o banco não pode crescer à toa).

-- ── 1. "Ver salário" vale no banco ──────────────────────────────────────────────────────────────
-- Antes: quem lia Colaboradores lia `base_salary` junto — a caixinha só escondia a coluna na tela.
-- Agora `authenticated` lê todas as colunas MENOS o salário, e o salário vem por `rh_salarios()`,
-- que devolve só o que a pessoa pode ver: o próprio, ou todos com "Ver salário".
-- (A Folha mostra o bruto por natureza: quem tem "Ver" na Folha vê o bruto da folha.)
revoke select on public.rh_employee_profiles from authenticated;
grant select (id, tenant_id, user_id, admission_date, vacation_balance_days, last_vacation_end, cpf,
              matricula, manager_user_id, created_at, updated_at, birth_date, position, cost_center,
              company_id, full_name, department, job_title, manager_name, contract_type,
              probation_45, probation_90, status, termination_date, access_email)
  on public.rh_employee_profiles to authenticated;

create or replace function public.rh_salarios()
returns table (employee_id uuid, base_salary numeric)
language sql
stable security definer
set search_path to 'public'
as $$
  select e.id, e.base_salary
    from public.rh_employee_profiles e
   where e.tenant_id = public.get_user_tenant_id()
     and (e.user_id = auth.uid() or public.pode_no_rh('employees', 'view_salary'));
$$;

comment on function public.rh_salarios() is
  'O salário que a pessoa logada pode ver: o próprio, ou o de todos com "Ver salário" no perfil do RH. A coluna base_salary não é legível direto por authenticated.';

revoke all on function public.rh_salarios() from public, anon;
grant execute on function public.rh_salarios() to authenticated;

-- Quem não vê o salário também não o grava: sem isto, editar um colaborador sem "Ver salário"
-- mandaria o salário que a tela não tem (zero) por cima do verdadeiro.
create or replace function public.rh_salario_guarda_o_perfil()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or current_user <> 'authenticated' then
    return new;
  end if;
  if (tg_op = 'INSERT' and coalesce(new.base_salary, 0) <> 0
      or tg_op = 'UPDATE' and new.base_salary is distinct from old.base_salary)
     and not public.pode_no_rh('employees', 'view_salary') then
    raise exception 'Seu perfil de acesso não permite alterar salário.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.rh_salario_guarda_o_perfil() from public, anon;

drop trigger if exists rh_salario_guarda_o_perfil on public.rh_employee_profiles;
create trigger rh_salario_guarda_o_perfil
  before insert or update on public.rh_employee_profiles
  for each row execute function public.rh_salario_guarda_o_perfil();

-- ── 2. Os arquivos do RH pela caixinha ──────────────────────────────────────────────────────────
-- O caminho é `{empresa}/{pessoa}/{ano}/{tipo}/arquivo`, e o tipo diz a seção:
-- holerites → Holerites, cofre → Documentos, atestados → Atestados. As policies do próprio
-- funcionário ("lê / envia arquivos RH dele") ficam como estão.
drop policy if exists "RH lê todos arquivos RH do tenant" on storage.objects;
drop policy if exists "RH envia/atualiza arquivos RH do tenant" on storage.objects;
drop policy if exists "RH deleta arquivos RH do tenant" on storage.objects;

create policy rh_arquivos_le on storage.objects for select using (
  bucket_id = 'rh-documents'
  and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  and case (storage.foldername(name))[4]
        when 'holerites' then public.pode_no_rh('payslips', 'view')
        when 'cofre'     then public.pode_no_rh('documents', 'view')
        when 'atestados' then public.pode_no_rh('certificates', 'view')
        else public.is_admin_or_higher(auth.uid())
      end
);

create policy rh_arquivos_envia on storage.objects for insert with check (
  bucket_id = 'rh-documents'
  and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  and case (storage.foldername(name))[4]
        when 'holerites' then public.pode_no_rh('payslips', 'edit')
        when 'cofre'     then public.pode_no_rh('documents', 'edit')
        else public.is_admin_or_higher(auth.uid())
      end
);

create policy rh_arquivos_remove on storage.objects for delete using (
  bucket_id = 'rh-documents'
  and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  and case (storage.foldername(name))[4]
        when 'cofre' then public.pode_no_rh('documents', 'delete')
        else public.is_admin_or_higher(auth.uid())
      end
);

-- ── 3. Tamanho do arquivo ───────────────────────────────────────────────────────────────────────
-- 5 MB por arquivo no balde do RH: um holerite em PDF tem menos de 1 MB, e a foto de celular de
-- um atestado cabe com folga. Acima disso o Storage recusa o envio (a tela avisa antes).
update storage.buckets set file_size_limit = 5 * 1024 * 1024 where id = 'rh-documents';
