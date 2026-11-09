-- ATENDIMENTO DO CRM: TAREFA DE LEAD DA EQUIPE NÃO CONTA (2026-11-09, migration 20270212720400).
-- As 14 tarefas que fechei nos leads da equipe, dos fornecedores e dos artistas, ao mover para o funil "Equipe e
-- parceiros", contaram como tarefas feitas pela Thayná (25 em vez de 11 no dia). A tarefa agora guarda o lead, e a do
-- lead marcado como interno não entra (nem a que já estava gravada).

alter table public.kommo_tarefas_feitas add column lead_id bigint;

create or replace function public.kommo_gravar_atendimento(p_tenant uuid, p_mensagens jsonb, p_leads jsonb, p_usuarios jsonb, p_tarefas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_novas integer;
begin
  insert into public.kommo_mensagens (tenant_id, evento_id, lead_id, quando, entrou, autor, canal)
  select p_tenant, m.id, m.lead_id, to_timestamp(m.quando), m.entrou, coalesce(m.autor, 0), m.canal
    from jsonb_to_recordset(coalesce(p_mensagens, '[]')) as m(id text, lead_id bigint, quando bigint, entrou boolean, autor bigint, canal text)
  on conflict do nothing;
  get diagnostics v_novas = row_count;

  insert into public.kommo_leads (tenant_id, lead_id, nome, segmento, funil, etapa, fechado, responsavel, link, interno, uf)
  select p_tenant, l.lead_id, l.nome, l.segmento, l.funil, l.etapa, coalesce(l.fechado, false), l.responsavel, l.link,
         coalesce(l.interno, false), l.uf
    from jsonb_to_recordset(coalesce(p_leads, '[]')) as l(lead_id bigint, nome text, segmento text, funil text, etapa text,
                                                           fechado boolean, responsavel bigint, link text, interno boolean, uf text)
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, segmento = excluded.segmento, funil = excluded.funil, etapa = excluded.etapa,
        fechado = excluded.fechado, responsavel = excluded.responsavel, link = excluded.link, interno = excluded.interno,
        uf = coalesce(excluded.uf, kommo_leads.uf);

  insert into public.kommo_usuarios (tenant_id, kommo_id, nome, user_id)
  select p_tenant, u.kommo_id, u.nome,
         coalesce(
           (select p.id from public.profiles p where p.tenant_id = p_tenant and lower(p.email) = lower(u.email) limit 1),
           (select min(p.id::text)::uuid from public.profiles p
             where p.tenant_id = p_tenant and p.is_active
               and lower(split_part(trim(p.full_name), ' ', 1)) = lower(split_part(trim(u.nome), ' ', 1))
            having count(*) = 1))
    from jsonb_to_recordset(coalesce(p_usuarios, '[]')) as u(kommo_id bigint, nome text, email text)
  on conflict (tenant_id, kommo_id) do update
    set nome = excluded.nome, user_id = coalesce(kommo_usuarios.user_id, excluded.user_id);

  insert into public.kommo_tarefas_feitas (tenant_id, tarefa_id, responsavel, feita_em, lead_id)
  select p_tenant, t.id, t.responsavel, to_timestamp(t.feita_em), t.lead_id
    from jsonb_to_recordset(coalesce(p_tarefas, '[]')) as t(id bigint, responsavel bigint, feita_em bigint, lead_id bigint)
  on conflict (tenant_id, tarefa_id) do update
    set responsavel = excluded.responsavel, feita_em = excluded.feita_em, lead_id = coalesce(excluded.lead_id, kommo_tarefas_feitas.lead_id);

  delete from public.kommo_mensagens where tenant_id = p_tenant and quando < now() - interval '120 days';
  delete from public.kommo_tarefas_feitas where tenant_id = p_tenant and feita_em < now() - interval '120 days';
  -- Tarefa de lead da equipe, de fornecedor ou de artista não é atendimento.
  delete from public.kommo_tarefas_feitas t using public.kommo_leads l
   where t.tenant_id = p_tenant and l.tenant_id = p_tenant and l.lead_id = t.lead_id and l.interno;
  return jsonb_build_object('mensagens', v_novas);
end;
$$;
