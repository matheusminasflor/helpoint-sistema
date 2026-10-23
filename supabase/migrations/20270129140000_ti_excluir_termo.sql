-- TERMOS (20270129030000): EXCLUIR o termo lançado errado (dono, 2026-10-23: "lancei errado uns dados, preciso excluir
-- não consigo excluir"). A policy de delete já existia; faltava desfazer o que o termo fez no Inventário. Excluir apaga
-- o termo e os itens, e o equipamento que o termo pôs no nome da pessoa volta ao estoque — menos o que outro termo
-- ainda em aberto da mesma pessoa cobre (o caso real: dois termos da Gislene com o mesmo headset). O equipamento não é
-- apagado do Inventário: quem cadastrou errado corrige ou baixa por lá. O arquivo assinado o front apaga do balde.
create or replace function public.ti_excluir_termo(p_termo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.ti_termos%rowtype;
begin
  if not public.pode_no_setor('ti', 'termos', 'delete') then
    raise exception 'Excluir termo pede a permissão "Excluir" em Termos de responsabilidade (TI).' using errcode = '42501';
  end if;
  select * into t from public.ti_termos where id = p_termo and tenant_id = public.get_user_tenant_id() for update;
  if t.id is null then
    raise exception 'Termo não encontrado.' using errcode = '42501';
  end if;
  if t.status <> 'devolvido' and t.colaborador_id is not null then
    update public.assets a set assigned_to = null, status = 'in_stock'
      from public.ti_termo_itens i
     where i.termo_id = t.id and a.id = i.asset_id and a.assigned_to = t.colaborador_id
       and not exists (
         select 1 from public.ti_termo_itens o join public.ti_termos ot on ot.id = o.termo_id
          where o.asset_id = a.id and ot.id <> t.id and ot.colaborador_id = t.colaborador_id and ot.status <> 'devolvido');
  end if;
  delete from public.ti_termos where id = t.id;
end;
$$;
revoke all on function public.ti_excluir_termo(uuid) from public, anon;
grant execute on function public.ti_excluir_termo(uuid) to authenticated;
