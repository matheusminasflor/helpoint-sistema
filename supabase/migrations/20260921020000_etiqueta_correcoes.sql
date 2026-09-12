-- ENC-1, correções da auditoria. 2026-09-12.
--
-- Três defeitos do encaixe "etiquetar" que o auditor achou, e que não davam
-- para consertar só no código:
--
-- 1. **O pedido não tinha endereço de entrega.** `crm_contacts` guardava
--    cidade e estado e mais nada, então a pré-postagem dos Correios saía sem
--    CEP e sem rua — ou seja, o conector `correios` nascia inutilizável.
--    O endereço entra no contato, ao lado de cidade/estado.
-- 2. **`crm_shipping_status()` tinha o prefixo errado.** A função serve a tela
--    da Expedição e é guardada por `has_expedicao_access`; chamar de `crm_`
--    mandava quem lê para o módulo errado. Vira `exp_shipping_status()`.
-- 3. **Duas telas gravavam `tenants.settings` lendo e reescrevendo o JSON
--    inteiro** (a regra de separação pelo navegador, o conector pela edge
--    function). Salvar as duas ao mesmo tempo perdia uma. `exp_set_config()`
--    grava uma chave só, numa instrução, e confere quem está mandando.

-- ── 1. Endereço de entrega ──────────────────────────────────────────────────
alter table public.crm_contacts
  add column zip_code      text,
  add column street        text,
  add column street_number text,
  add column complement    text,
  add column district      text;

comment on column public.crm_contacts.zip_code is
  'CEP do endereço de entrega. Os Correios exigem na pré-postagem (ENC-1).';

-- ── 2. O nome certo da função de status ─────────────────────────────────────
drop function if exists public.crm_shipping_status();

create or replace function public.exp_shipping_status()
returns table (provider text, correios_ligado boolean, cartao_last4 text, codigo_servico text, remetente jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.settings #>> '{expedicao,label_provider}', 'nenhum'),
         c.tenant_id is not null,
         right(c.cartao_postagem, 4),
         c.codigo_servico,
         c.remetente,
         c.updated_at
    from public.tenants t
    left join public.tenant_correios_credentials c on c.tenant_id = t.id
   where t.id = public.get_user_tenant_id()
     and public.has_expedicao_access(auth.uid());
$$;
revoke execute on function public.exp_shipping_status() from public, anon;
grant execute on function public.exp_shipping_status() to authenticated;

-- ── 3. Uma chave de configuração por vez, sem corrida ───────────────────────
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
end;
$$;
revoke execute on function public.exp_set_config(text, jsonb) from public, anon;
grant execute on function public.exp_set_config(text, jsonb) to authenticated;
