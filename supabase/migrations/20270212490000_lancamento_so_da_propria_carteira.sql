-- Cliente de outra carteira a vendedora não lança: "afinal não é da carteira dele" (dono, 2026-11-06). Lança quem gere
-- carteiras; a vendedora pede ao gestor para mudar o cliente de carteira. O do Histórico ela traz para a carteira dela
-- antes. O `fora_da_carteira` era o escape de todo mundo: agora só registra o lançamento do gestor. O que já foi lançado
-- fica como está, e por isso a policy de UPDATE não muda: a vendedora ainda completa o lançamento antigo.
drop policy if exists com_interacoes_insert on public.com_interacoes;
create policy com_interacoes_insert on public.com_interacoes
  for insert to authenticated
  with check (
    tenant_id = (select public.get_user_tenant_id())
    and vendedor_id = auth.uid()
    and (select public.has_comercial_access(auth.uid()))
    and (
      cliente_codigo is null
      or (select public.com_pode_gerir_carteiras())
      or exists (select 1 from public.com_clientes c
                  where c.tenant_id = com_interacoes.tenant_id and c.codigo = com_interacoes.cliente_codigo
                    and c.carteira = any (coalesce((select public.com_minhas_carteiras()), array[]::text[])))
    )
  );

-- A policy é a barreira; aqui é só a frase, para a tela antiga não mostrar o erro cru.
do $$
declare
  v_def text := pg_get_functiondef('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure);
  v_de text := $x$    if v_cliente is not null then
      v_pessoa := null;
$x$;
begin
  if position(v_de in v_def) = 0 then
    raise exception 'trecho não encontrado em com_salvar_interacao';
  end if;
  execute replace(v_def, v_de, v_de || $x$      if not public.com_pode_gerir_carteiras() and not exists (
        select 1 from public.com_clientes c
         where c.tenant_id = public.get_user_tenant_id() and c.codigo = v_cliente
           and c.carteira = any (coalesce(public.com_minhas_carteiras(), array[]::text[]))) then
        raise exception 'Este cliente não é da sua carteira. Peça ao gestor para mudá-lo de carteira.' using errcode = '42501';
      end if;
$x$);
end;
$$;
