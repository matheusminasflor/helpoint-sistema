-- AS METAS DOS INDICADORES PASSAM A SER POR SETOR (dono, 2026-11-03; projeto dos Indicadores de Marketing, decisão 1:
-- "os cartões dos chamados do Marketing têm meta e cor, como na TI"). A tabela das metas da TI (`ti_metas_degraus`,
-- 20270212190000) ganha o setor e vira `metas_degraus`; o Marketing usa a mesma régua (SLA, 1ª resposta, tempo médio),
-- mudada em Configurações de Marketing › Metas por quem altera a aba Chamados da configuração do Marketing.
-- As linhas que existem são da TI.

alter table public.ti_metas_degraus rename to metas_degraus;
alter table public.metas_degraus add column if not exists setor text not null default 'ti'
  check (setor in ('ti', 'marketing'));
alter table public.metas_degraus add constraint metas_degraus_indicador_do_setor
  check (setor = 'ti' or indicador in ('sla_cumprido', 'primeira_resposta', 'tempo_medio_horas'));

drop index if exists public.ti_metas_degraus_um_por_dia;
create unique index if not exists metas_degraus_um_por_dia on public.metas_degraus (tenant_id, setor, indicador, a_partir_de);

-- Ler: quem vê os Indicadores do setor, quem altera a aba Chamados dele, e a Diretoria.
drop policy if exists ti_metas_degraus_le on public.metas_degraus;
drop policy if exists ti_metas_degraus_muda on public.metas_degraus;
create policy metas_degraus_le on public.metas_degraus for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (public.pode_no_setor(setor, 'reports', 'view')
              or public.pode_alterar_aba(setor, 'chamados')
              or (select public.dir_pode_ver('indicadores'))));
-- Escrita: o `with check` repete a permissão do `using` (regra 15 do CLAUDE.md).
create policy metas_degraus_muda on public.metas_degraus for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (public.pode_alterar_aba(setor, 'chamados') or (select public.dir_pode_definir_metas_dos_setores())))
  with check (tenant_id = (select public.get_user_tenant_id())
              and (public.pode_alterar_aba(setor, 'chamados') or (select public.dir_pode_definir_metas_dos_setores())));

-- Gravar a escada de um indicador de um setor de uma vez; lista vazia volta à meta padrão. `security invoker`: as
-- policies de cima valem como se a pessoa gravasse direto. Substitui `ti_metas_salvar`.
drop function if exists public.ti_metas_salvar(text, jsonb);
create or replace function public.metas_salvar(p_setor text, p_indicador text, p_degraus jsonb)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  delete from public.metas_degraus
   where tenant_id = public.get_user_tenant_id() and setor = p_setor and indicador = p_indicador;
  insert into public.metas_degraus (tenant_id, setor, indicador, a_partir_de, meta)
  select public.get_user_tenant_id(), p_setor, p_indicador, (d ->> 'a_partir_de')::date, (d ->> 'meta')::numeric
    from jsonb_array_elements(coalesce(p_degraus, '[]'::jsonb)) d;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.metas_salvar(text, text, jsonb) from public, anon;
grant execute on function public.metas_salvar(text, text, jsonb) to authenticated;
