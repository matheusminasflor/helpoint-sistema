-- Indicadores da TI, rodada 2 (dono, 2026-11-02; docs/proposta-indicadores-da-semana.md).
--
-- 1. A semana do FSENSE é gravada sempre no DOMINGO que a fecha. A grade sugeria a sexta (a tarefa roda sexta às 17h40)
--    e o histórico estava no domingo: a mesma semana lançada com as duas datas virava duas linhas por pessoa, as horas
--    somavam em dobro e a semana que vira o mês caía em meses diferentes. Agora qualquer dia da semana escolhido vai
--    para o domingo dela, e lançar de novo substitui (o `on conflict` de sempre). O histórico importado da planilha fica
--    com as datas dela — mexer nele mudaria o mês de semanas que a planilha já apresentou.
--
-- 2. As metas da TI passam a ser mudadas também em Configurações de TI › Metas, por quem pode ALTERAR a aba Chamados da
--    configuração da TI (o dono escolheu "quem configura a TI + Diretoria"). Mesma tabela, `dir_metas_dos_setores`: a
--    Diretoria continua vendo e mudando as mesmas. Políticas permissivas somam com OR; o `with check` repete a
--    permissão do `using` (regra 15 do CLAUDE.md), e esta só alcança linhas do setor 'ti'.

-- ─── 1. A semana no domingo ──────────────────────────────────────────────────────────────────────────
create or replace function public.ti_fsense_lancar(p_data date, p_linhas jsonb)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_n integer;
  -- isodow: segunda = 1 … domingo = 7.
  v_domingo date := p_data + (7 - extract(isodow from p_data)::int);
begin
  insert into public.ti_fsense (tenant_id, data, colaborador, horas, trabalho, bloqueada, ocioso, suspenso)
  select public.get_user_tenant_id(), v_domingo, btrim(l ->> 'colaborador'), (l ->> 'horas')::numeric,
         (l ->> 'trabalho')::numeric, (l ->> 'bloqueada')::numeric, (l ->> 'ocioso')::numeric, (l ->> 'suspenso')::numeric
    from jsonb_array_elements(p_linhas) l
  on conflict (tenant_id, data, (lower(btrim(colaborador)))) do update
     set colaborador = excluded.colaborador, horas = excluded.horas, trabalho = excluded.trabalho,
         bloqueada = excluded.bloqueada, ocioso = excluded.ocioso, suspenso = excluded.suspenso, confirmado_em = null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ─── 2. Quem configura a TI muda as metas da TI ──────────────────────────────────────────────────────
create policy dir_metas_ti_configura on public.dir_metas_dos_setores for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and setor = 'ti'
         and (select public.pode_alterar_aba('ti', 'chamados')))
  with check (tenant_id = (select public.get_user_tenant_id()) and setor = 'ti'
              and (select public.pode_alterar_aba('ti', 'chamados')));
