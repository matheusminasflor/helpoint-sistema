-- Indicadores da TI, rodada 3 (dono, 2026-11-02; docs/proposta-indicadores-da-semana.md).
--
-- 1. A META SOBE EM DEGRAUS. A TI tem uma pessoa no helpdesk e o líder de recursos operacionais, que atende quando dá;
--    90% de SLA de saída não se sustenta (as últimas 4 semanas deram 80% em média). Cada indicador tem degraus: "a
--    partir de tal mês, a meta é tal". Sem degrau gravado, vale a escada padrão (`src/config/metas-da-ti.ts`); com
--    algum gravado, valem só os gravados. A meta de um período é a do degrau em vigor no último dia dele.
--    Muda quem altera a aba Chamados da configuração da TI (como as metas da rodada 2) ou quem define metas na
--    Diretoria; lê quem vê os Indicadores da TI. As metas da TI da rodada 2 (`dir_metas_dos_setores`, setor 'ti')
--    estavam vazias na produção e deixam de ser lidas.
--
-- 2. O AVISO DE "ATUALIZAÇÃO DO SISTEMA" VAI SÓ PARA QUEM PODE LER A NOTÍCIA. `avisa_atualizacao_do_sistema` avisava
--    todo perfil ativo, mesmo com a notícia só para alguns setores ou filiais: quem não podia ler recebia o aviso e
--    clicava no vazio. Agora a régua é a mesma de `jornal_e_para_mim`, pessoa por pessoa.

-- ─── 1. Os degraus ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ti_metas_degraus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  indicador text not null check (indicador in
    ('sla_cumprido', 'primeira_resposta', 'tempo_medio_horas', 'fsense_trabalho', 'fsense_ocioso', 'interrupcoes')),
  a_partir_de date not null,
  meta numeric not null check (meta >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists ti_metas_degraus_um_por_dia on public.ti_metas_degraus (tenant_id, indicador, a_partir_de);

alter table public.ti_metas_degraus enable row level security;
revoke all on public.ti_metas_degraus from anon;
grant select, insert, update, delete on public.ti_metas_degraus to authenticated;

create policy ti_metas_degraus_le on public.ti_metas_degraus for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('ti', 'reports', 'view'))
              or (select public.pode_alterar_aba('ti', 'chamados'))
              or (select public.dir_pode_ver('indicadores'))));
-- Escrita: o `with check` repete a permissão do `using` (regra 15 do CLAUDE.md).
create policy ti_metas_degraus_muda on public.ti_metas_degraus for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_alterar_aba('ti', 'chamados')) or (select public.dir_pode_definir_metas_dos_setores())))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_alterar_aba('ti', 'chamados')) or (select public.dir_pode_definir_metas_dos_setores())));

-- Gravar a escada de um indicador de uma vez (apaga a anterior e grava a nova, na mesma transação). Lista vazia volta
-- à escada padrão. `security invoker`: as policies de cima valem como se a pessoa gravasse direto.
create or replace function public.ti_metas_salvar(p_indicador text, p_degraus jsonb)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  delete from public.ti_metas_degraus where tenant_id = public.get_user_tenant_id() and indicador = p_indicador;
  insert into public.ti_metas_degraus (tenant_id, indicador, a_partir_de, meta)
  select public.get_user_tenant_id(), p_indicador, (d ->> 'a_partir_de')::date, (d ->> 'meta')::numeric
    from jsonb_array_elements(coalesce(p_degraus, '[]'::jsonb)) d;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.ti_metas_salvar(text, jsonb) from public, anon;
grant execute on function public.ti_metas_salvar(text, jsonb) to authenticated;

-- ─── 2. O aviso só para quem pode ler ────────────────────────────────────────────────────────────────
create or replace function public.avisa_atualizacao_do_sistema()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.tipo <> 'atualizacao_sistema' or new.status <> 'publicada'
     or (tg_op = 'UPDATE' and old.status = 'publicada') then
    return null;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select new.tenant_id, p.id, 'system_update', 'jornal', new.id, 'Atualização do sistema', new.titulo, true
    from public.profiles p
   where p.tenant_id = new.tenant_id and coalesce(p.is_active, true)
     -- A régua de `jornal_e_para_mim`, para cada pessoa (lá é `auth.uid()`).
     and (new.publico = 'todos'
          or new.publico = any (public.filiais_da_pessoa(p.id))
          or (new.publico = 'setores' and exists (select 1 from public.user_module_access m
                                                   where m.user_id = p.id and m.module = any (new.setores)))
          or public.is_admin_or_higher(p.id));
  return null;
end;
$$;
