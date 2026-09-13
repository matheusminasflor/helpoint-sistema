-- ENC-1, segunda auditoria: `exp_set_config` gravava sem conferir se gravou.
--
-- A função devolve `void`, então um UPDATE que não casasse nenhuma linha
-- voltava em silêncio e a tela dizia "salvo". É a regra 2 das cinco ("escrita
-- prova que gravou") aplicada dentro do banco, já que a chamada do navegador
-- virou RPC e perdeu o `expectRows`.
create or replace function public.exp_set_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if v_tenant is null then
    raise exception 'usuário sem empresa' using errcode = '42501';
  end if;
  if not public.is_admin_or_higher(auth.uid()) then
    raise exception 'só dono ou administrador muda a configuração da Expedição' using errcode = '42501';
  end if;
  if p_key not in ('picking', 'label_provider') then
    raise exception 'configuração desconhecida: %', p_key using errcode = '22023';
  end if;

  update public.tenants
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object(
                         'expedicao',
                         coalesce(settings -> 'expedicao', '{}'::jsonb) || jsonb_build_object(p_key, p_value)
                       )
   where id = v_tenant;

  if not found then
    raise exception 'a configuração não foi gravada' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.exp_set_config(text, jsonb) from public, anon;
grant execute on function public.exp_set_config(text, jsonb) to authenticated;
