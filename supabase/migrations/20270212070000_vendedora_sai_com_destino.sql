-- VENDEDORA DESATIVADA LEVA A CARTEIRA PARA ALGUÉM (dono, 2026-10-28; proposta "Helpoint no celular", decisão 8):
-- desativar o acesso de uma vendedora pergunta para quem vão as carteiras dela. Antes, desativar o acesso deixava a
-- pessoa membro das carteiras e vendedora ativa: os clientes continuavam "dela" e ela seguia no painel.
--
-- `com_vendedora_sai(pessoa, destino)`: o destino entra em cada carteira da pessoa (com o mesmo papel de responsável),
-- a pessoa sai de todas e deixa de ser vendedora ativa. As vendas e os lançamentos antigos continuam no nome dela
-- (a atribuição de venda é pela carteira do cliente, `com_venda_atribuida`; o histórico não muda).
-- Quem chama: quem gere carteiras (`com_pode_gerir_carteiras`, que já inclui dono/admin) — a tela Pessoas e acessos
-- chama antes de desativar.
create or replace function public.com_vendedora_sai(p_pessoa uuid, p_destino uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := (select public.get_user_tenant_id());
  v_carteiras int;
  v_entrou int := 0;
begin
  if not public.com_pode_gerir_carteiras() then
    raise exception 'Só quem gere as carteiras pode passar a carteira de uma vendedora.' using errcode = '42501';
  end if;
  select count(*) into v_carteiras from public.com_carteira_membros where tenant_id = v_tenant and user_id = p_pessoa;
  if v_carteiras > 0 and p_destino is null then
    raise exception 'Esta pessoa cuida de % carteira(s): escolha para quem elas vão.', v_carteiras using errcode = '22023';
  end if;
  if p_destino is not null and (p_destino = p_pessoa or not exists (
      select 1 from public.profiles where id = p_destino and tenant_id = v_tenant and coalesce(is_active, true))) then
    raise exception 'Escolha outra pessoa, ativa, para receber as carteiras.' using errcode = '22023';
  end if;

  if p_destino is not null then
    insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
    select tenant_id, p_destino, carteira, responsavel
      from public.com_carteira_membros where tenant_id = v_tenant and user_id = p_pessoa
    on conflict (tenant_id, user_id, carteira) do nothing;
    get diagnostics v_entrou = row_count;
  end if;
  delete from public.com_carteira_membros where tenant_id = v_tenant and user_id = p_pessoa;
  update public.com_vendedores set ativo = false, updated_at = now() where tenant_id = v_tenant and user_id = p_pessoa;

  return jsonb_build_object('carteiras', v_carteiras, 'destino_entrou_em', v_entrou);
end;
$$;

comment on function public.com_vendedora_sai(uuid, uuid) is
  'Ao desativar uma vendedora: o destino entra nas carteiras dela, ela sai e deixa de ser vendedora ativa (2026-10-28).';
revoke all on function public.com_vendedora_sai(uuid, uuid) from public, anon;
grant execute on function public.com_vendedora_sai(uuid, uuid) to authenticated;
