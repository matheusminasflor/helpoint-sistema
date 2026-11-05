-- Lançamento novo exige cliente (dono, 2026-11-05): "sem cliente não consegue lançar". Antes, ação do FAROL entrava sem
-- cliente (manual §4). Vale para o que nasce daqui em diante: os lançamentos antigos sem cliente continuam valendo e
-- podem ser completados.
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

select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$  if p_id is null then
    insert into public.com_interacoes$$,
$$  if p_id is null then
    if nullif(btrim(p_dados ->> 'cliente_codigo'), '') is null then
      raise exception 'Escolha o cliente: todo lançamento precisa de um cliente.' using errcode = '23514';
    end if;
    insert into public.com_interacoes$$);
