-- Os pedidos finalizados antes de a nota existir no checklist (49 em 2026-11-05) também entram: a importação encontra a nota
-- deles, e o que sobrar o comercial informa. A nota que já existe em pedido finalizado continua sem mudar.
create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

select pg_temp.troca('public.ped_achar_notas_importadas(uuid)',
  'and not public.ped_cancelado(c.id) and not public.ped_finalizado(c.id)', 'and not public.ped_cancelado(c.id)');
select pg_temp.troca('public.ped_notas_do_comercial()',
  'and not public.ped_cancelado(c.id) and not public.ped_finalizado(c.id)', 'and not public.ped_cancelado(c.id) and (p.nota_fiscal is null or not public.ped_finalizado(c.id))');
select pg_temp.troca('public.ped_informar_nota(uuid, text, numeric, date)',
  'if public.ped_finalizado(v_ck.id) then', 'if public.ped_finalizado(v_ck.id) and v_ped.nota_fiscal is not null then');

select public.ped_achar_notas_importadas(t.id) from public.tenants t;
