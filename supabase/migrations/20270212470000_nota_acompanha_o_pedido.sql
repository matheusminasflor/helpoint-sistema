-- Regravar o checklist muda a posição dos pedidos quando um sai da lista, e a nota ficava para trás: o pedido voltava a
-- "falta informar a nota". A nota acompanha o pedido pelo número e pela filial (revisão de 2026-11-06).
do $$
declare
  v_def text := pg_get_functiondef('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure);
  p text[];
begin
  foreach p slice 1 in array array[
    [E'  v_falha text;\nbegin', E'  v_falha text;\n  v_notas jsonb;\nbegin'],
    ['  delete from public.ped_pedidos p where p.checklist_id = v_checklist.id and p.ordem <> all (v_ordens);',
     $x$  select jsonb_agg(jsonb_build_object('numero', p.numero, 'filial', p.filial, 'nota_fiscal', p.nota_fiscal, 'nota_valor', p.nota_valor,
                                         'nota_em', p.nota_em, 'nota_origem', p.nota_origem)) into v_notas
    from public.ped_pedidos p where p.checklist_id = v_checklist.id and p.nota_fiscal is not null;
  delete from public.ped_pedidos p where p.checklist_id = v_checklist.id and p.ordem <> all (v_ordens);$x$],
    [E'  update public.com_interacoes i\n     set updated_at = now()',
     $x$  update public.ped_pedidos p
     set nota_fiscal = n.nota_fiscal, nota_valor = n.nota_valor, nota_em = n.nota_em, nota_origem = n.nota_origem
    from jsonb_to_recordset(v_notas) as n(numero text, filial text, nota_fiscal text, nota_valor numeric, nota_em date, nota_origem text)
   where p.checklist_id = v_checklist.id and p.nota_fiscal is null and p.numero = n.numero and p.filial = n.filial;

  update public.com_interacoes i
     set updated_at = now()$x$]
  ] loop
    if position(p[1] in v_def) = 0 then
      raise exception 'trecho não encontrado: %', p[1];
    end if;
    v_def := replace(v_def, p[1], p[2]);
  end loop;
  execute v_def;
end;
$$;
