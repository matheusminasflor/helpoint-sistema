-- ENC-3, correção da auditoria: uma função de configuração, não duas iguais.
--
-- `crm_set_config` nasceu como cópia palavra por palavra de `exp_set_config`:
-- mudava só o ramo de `settings` e a lista de chaves. São trinta linhas de SQL
-- **privilegiado** duplicado — o portão de dono/administrador estava escrito
-- duas vezes, e o terceiro módulo repetiria de novo.
--
-- Agora há uma função com o portão, e as duas viram chamadas dela. O contrato
-- externo não muda: `exp_set_config('picking', …)` e `crm_set_config(…)`
-- continuam existindo, com os mesmos erros.

create or replace function public.tenant_set_config(p_scope text, p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_rotulo text := case p_scope when 'expedicao' then 'da Expedição' else 'do CRM' end;
begin
  if v_tenant is null then
    raise exception 'usuário sem empresa' using errcode = '42501';
  end if;
  if not public.is_admin_or_higher(auth.uid()) then
    raise exception 'só dono ou administrador muda a configuração %', v_rotulo using errcode = '42501';
  end if;
  -- Lista fechada por módulo: chave inventada vira erro, não linha perdida.
  if (p_scope, p_key) not in (
    ('expedicao', 'picking'), ('expedicao', 'label_provider'), ('crm', 'nfe_provider')
  ) then
    raise exception 'configuração desconhecida: %', p_key using errcode = '22023';
  end if;

  update public.tenants
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object(
                         p_scope,
                         coalesce(settings -> p_scope, '{}'::jsonb) || jsonb_build_object(p_key, p_value)
                       )
   where id = v_tenant;

  if not found then
    raise exception 'a configuração não foi gravada' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.tenant_set_config(text, text, jsonb) from public, anon, authenticated;

create or replace function public.exp_set_config(p_key text, p_value jsonb)
returns void
language sql
security definer
set search_path = public
as $$ select public.tenant_set_config('expedicao', p_key, p_value); $$;
revoke execute on function public.exp_set_config(text, jsonb) from public, anon;
grant execute on function public.exp_set_config(text, jsonb) to authenticated;

create or replace function public.crm_set_config(p_key text, p_value jsonb)
returns void
language sql
security definer
set search_path = public
as $$ select public.tenant_set_config('crm', p_key, p_value); $$;
revoke execute on function public.crm_set_config(text, jsonb) from public, anon;
grant execute on function public.crm_set_config(text, jsonb) to authenticated;
