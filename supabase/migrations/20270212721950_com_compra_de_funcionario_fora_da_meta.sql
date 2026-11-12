-- COMPRA DE FUNCIONÁRIO NÃO CONTA NA META (dono, 2026-11-11): "Os vendedores e funcionários podem comprar da empresa, mas
-- não calcula na meta. E sempre sai como série 75 venda. Apenas quando a empresa bonifica o funcionário aí é série 75
-- bonificação."
--
-- A meta da carteira soma a venda dos clientes DA carteira (com_composicao_da_venda e com_venda_atribuida, pelo
-- `com_clientes.carteira`). Medido antes: 6 pessoas da equipe estavam cadastradas como cliente, todas na DEMAIS
-- ESTADOS (FENICIO ROCHA, JACQUELINE DIAS, LUCAS GOMES RIBEIRO, Merilyn Oliveira…, RONDINELLY LIMA, Yuri Martins), e a
-- compra delas somava na meta da Jacqueline. A regra: cliente interno (equipe ou a própria empresa, 20270212721600)
-- não é de carteira nenhuma. A venda continua no faturamento da empresa; sai só da meta e da comissão.

-- 1. Quem é da equipe: o nome do cliente é o de uma pessoa do sistema (inteiro, ou começa pelos dois primeiros nomes).
update public.com_clientes c
   set interno = true
  from public.profiles p
 where p.tenant_id = c.tenant_id
   and not c.interno
   and (public.normalizar_nome_carteira(c.razao_social) = public.normalizar_nome_carteira(p.full_name)
        or (length(split_part(btrim(p.full_name), ' ', 2)) > 2
            and public.normalizar_nome_carteira(c.razao_social)
                like public.normalizar_nome_carteira(split_part(btrim(p.full_name), ' ', 1) || ' ' || split_part(btrim(p.full_name), ' ', 2)) || '%'));

-- 2. Interno não tem carteira — agora e sempre (a importação e o cadastro não o põem de volta).
create or replace function public.com_cliente_interno_sem_carteira()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.interno then
    new.carteira := null;
  end if;
  return new;
end;
$$;
revoke all on function public.com_cliente_interno_sem_carteira() from public, anon;
grant execute on function public.com_cliente_interno_sem_carteira() to authenticated;

drop trigger if exists trg_com_cliente_interno_sem_carteira on public.com_clientes;
create trigger trg_com_cliente_interno_sem_carteira
  before insert or update of interno, carteira on public.com_clientes
  for each row execute function public.com_cliente_interno_sem_carteira();

update public.com_clientes set carteira = null where interno and carteira is not null;
