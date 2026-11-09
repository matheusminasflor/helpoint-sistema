-- ATENDIMENTO DO CRM SEM A EQUIPE E SEM FORNECEDOR (dono, 2026-11-09; projeto do Kommo, parte 4.7 adiantada aqui).
-- Em 09/11, 6 das 21 conversas eram da própria equipe (Mairon, Matheus, Thayná, os números da Minasflor). Decisão do dono:
-- o lead ou o contato com a etiqueta "Equipe interna" ou "Fornecedor" no Kommo sai do Atendimento do CRM. Contato novo da
-- equipe: basta pôr a etiqueta. O robô manda `interno` em cada lead; a conta ignora as mensagens dele.

alter table public.kommo_leads add column interno boolean not null default false;

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

  insert into public.kommo_leads (tenant_id, lead_id, nome, segmento, funil, etapa, fechado, responsavel, link, interno)
  select p_tenant, l.lead_id, l.nome, l.segmento, l.funil, l.etapa, coalesce(l.fechado, false), l.responsavel, l.link, coalesce(l.interno, false)
    from jsonb_to_recordset(coalesce(p_leads, '[]')) as l(lead_id bigint, nome text, segmento text, funil text, etapa text,
                                                           fechado boolean, responsavel bigint, link text, interno boolean)
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, segmento = excluded.segmento, funil = excluded.funil, etapa = excluded.etapa,
        fechado = excluded.fechado, responsavel = excluded.responsavel, link = excluded.link, interno = excluded.interno;

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

  insert into public.kommo_tarefas_feitas (tenant_id, tarefa_id, responsavel, feita_em)
  select p_tenant, t.id, t.responsavel, to_timestamp(t.feita_em)
    from jsonb_to_recordset(coalesce(p_tarefas, '[]')) as t(id bigint, responsavel bigint, feita_em bigint)
  on conflict (tenant_id, tarefa_id) do update set responsavel = excluded.responsavel, feita_em = excluded.feita_em;

  delete from public.kommo_mensagens where tenant_id = p_tenant and quando < now() - interval '120 days';
  delete from public.kommo_tarefas_feitas where tenant_id = p_tenant and feita_em < now() - interval '120 days';
  return jsonb_build_object('mensagens', v_novas);
end;
$$;

-- As mensagens dos leads da equipe e de fornecedor não entram em nenhuma conta.
create or replace function public.kommo_mensagens_com_quem(p_tenant uuid, p_desde timestamptz)
returns table (lead_id bigint, quando timestamptz, entrou boolean, quem bigint, sem_nome boolean)
language sql stable security definer set search_path = public as $$
  with m as (
    select k.lead_id, k.quando, k.entrou, k.autor, k.canal,
           lag(k.quando) over w as ant_quando, lag(k.entrou) over w as ant_entrou
      from public.kommo_mensagens k
     where k.tenant_id = p_tenant and k.quando >= p_desde
    window w as (partition by k.lead_id order by k.quando)
  ),
  transmissao as (
    select date_trunc('minute', m.quando) as minuto from m
     where not m.entrou and m.autor = 0 group by 1 having count(distinct m.lead_id) >= 5
  ),
  c as (
    select m.*,
           not m.entrou and m.autor = 0 and m.quando >= public.kommo_lyra_no_ar() and (
             date_trunc('minute', m.quando) in (select minuto from transmissao)
             or (m.canal = 'instagram_business' and coalesce(m.ant_entrou, false) and m.quando - m.ant_quando <= interval '15 seconds')
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando + interval '1 minute'), '') ilike 'com a lyra%'
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando - interval '1 minute'), '') ilike 'com a lyra%'
           ) as robo
      from m
  )
  select c.lead_id, c.quando, c.entrou,
         case when c.entrou then 0 when c.autor <> 0 then c.autor when c.robo then 0 else coalesce(l.responsavel, 0) end,
         not c.entrou and c.autor = 0 and not c.robo and l.responsavel is not null
    from c left join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = c.lead_id
   where not coalesce(l.interno, false);
$$;
