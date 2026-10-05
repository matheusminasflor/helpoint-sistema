-- "CONCEDER BENEFÍCIO" VIRA CAIXINHA PRÓPRIA (revisão de permissões, 2026-10-04; o dono aprovou).
--
-- Até aqui, marcar "concedido" (e desfazer) numa diretriz comercial era de quem ALTERA a aba
-- Diretrizes ou de quem gere carteiras (20261203010000). Quem só aplica o benefício no pedido
-- ganhava junto o poder de mudar a regra ou mover clientes entre carteiras. Agora é a caixinha
-- `diretrizes_beneficio.conceder` do perfil do Comercial — e só ela (dono e administrador passam).
--
-- Ninguém perde: todo perfil (e toda exceção pessoal) que concedia pelo caminho antigo recebe a
-- caixinha marcada.

create or replace function public.com_pode_conceder_diretriz()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid())
      or public.tem_permissao(auth.uid(), 'comercial', 'diretrizes_beneficio', 'conceder');
$$;

comment on function public.com_pode_conceder_diretriz() is
  'Marca e desfaz "benefício concedido" das diretrizes comerciais: a caixinha diretrizes_beneficio.conceder do Comercial (dono e administrador passam).';

revoke all on function public.com_pode_conceder_diretriz() from public, anon;
grant execute on function public.com_pode_conceder_diretriz() to authenticated;

drop policy if exists com_diretrizes_concessoes_concede on public.com_diretrizes_concessoes;
create policy com_diretrizes_concessoes_concede on public.com_diretrizes_concessoes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_conceder_diretriz()));

drop policy if exists com_diretrizes_concessoes_desfaz on public.com_diretrizes_concessoes;
create policy com_diretrizes_concessoes_desfaz on public.com_diretrizes_concessoes for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_conceder_diretriz()));

-- ── Quem concedia continua concedendo ─────────────────────────────────────────────────────────
-- O caminho antigo: `config_diretrizes.edit`, `carteiras.gerir` ou `config_equipe.edit`
-- (`com_pode_gerir_carteiras`).
update public.access_profiles
   set permissions = permissions || '{"diretrizes_beneficio": {"conceder": true}}'::jsonb
 where department = 'comercial'
   and (coalesce((permissions -> 'config_diretrizes' ->> 'edit')::boolean, false)
        or coalesce((permissions -> 'carteiras' ->> 'gerir')::boolean, false)
        or coalesce((permissions -> 'config_equipe' ->> 'edit')::boolean, false));

update public.user_access_profiles
   set overrides = coalesce(overrides, '{}'::jsonb) || '{"diretrizes_beneficio": {"conceder": true}}'::jsonb
 where department = 'comercial'
   and (coalesce((overrides -> 'config_diretrizes' ->> 'edit')::boolean, false)
        or coalesce((overrides -> 'carteiras' ->> 'gerir')::boolean, false)
        or coalesce((overrides -> 'config_equipe' ->> 'edit')::boolean, false));
