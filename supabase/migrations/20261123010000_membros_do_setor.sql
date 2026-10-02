-- Quem atende cada setor (decisão do dono, 2026-10-02).
--
-- O dono: nos Indicadores da TI, "filtrar por colaborador" listava qualquer pessoa da empresa, de
-- qualquer setor. "Se eu sou do TI, eu tenho que ver indicadores somente do departamento." Decisão:
-- aparece quem TEM ACESSO ao setor (a concessão do módulo), não o campo Setor do perfil.
--
-- `user_module_access` só deixa cada um ler a PRÓPRIA concessão (e o administrador todas), e isso
-- está certo. Esta função devolve só nome e e-mail de quem tem o setor, e só para quem também
-- pode ver o setor: quem o tem, a Diretoria, supervisor ou administrador.
create or replace function public.membros_do_setor(p_setor text)
returns table (id uuid, full_name text, email text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.full_name, p.email
    from public.profiles p
    join public.user_module_access m on m.user_id = p.id and m.module = p_setor
   where p.tenant_id = public.get_user_tenant_id()
     and coalesce(p.is_active, true)
     and (public.is_supervisor_or_higher(auth.uid())
          or public.is_admin_or_higher(auth.uid())
          or exists (select 1 from public.user_module_access x
                      where x.user_id = auth.uid() and x.module in (p_setor, 'diretoria')))
   order by coalesce(p.full_name, p.email);
$$;
revoke all on function public.membros_do_setor(text) from public, anon;
grant execute on function public.membros_do_setor(text) to authenticated;
