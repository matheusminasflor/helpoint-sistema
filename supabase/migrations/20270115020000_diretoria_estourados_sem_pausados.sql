-- REVISÃO DOS INDICADORES (dono, 2026-10-15). A Diretoria contava como "estourado" o chamado com o prazo PAUSADO
-- (Pendente, Aguardando aprovação, Agendado) — os Indicadores do setor não contam: o mesmo chamado era atrasado num
-- lugar e no prazo no outro. Agora a mesma regra dos setores, com a exceção nova de 20270115010000: o agendado com
-- o prazo já vencido conta como atrasado. Troca no texto da função no ar; recusa seguir se o texto não estiver lá.
do $$
declare
  v_def text := pg_get_functiondef('public.dir_chamados_por_setor(timestamptz, timestamptz)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    'select tk.module, tk.status, tk.created_at, tk.resolved_at, tk.sla_due_at',
    'select tk.module, tk.status, tk.created_at, tk.resolved_at, tk.sla_due_at, tk.agendou_vencido');
  v_novo := replace(v_novo,
    'and t.sla_due_at < now())',
    'and t.sla_due_at < now()
             and (t.status not in (''waiting_user'', ''waiting_parts'', ''scheduled'')
                  or (t.status = ''scheduled'' and t.agendou_vencido)))');
  if v_novo = v_def or position('agendou_vencido)))' in v_novo) = 0 then
    raise exception 'dir_chamados_por_setor mudou: revise a migration';
  end if;
  execute v_novo;
end;
$$;
