-- ATENDIMENTO DO CRM: A LYRA RESPONDE ANTES DE O KOMMO MOSTRAR A ETAPA (2026-11-09, migration 20270212720000).
-- Conferido na produção: a primeira mensagem da Lyra sai até 1 minuto antes da troca para "Com a Lyra" (lead 121682278:
-- mensagem às 8h24min15s, etapa às 8h24min56s), e contava como da atendente, com 1ª resposta de 0 minuto. A etapa que vale
-- passa a ser a de 1 minuto depois da mensagem (antes, 5 segundos), além da de 1 minuto antes.
-- `create or replace` preserva quem pode chamar a função.

create or replace function public.kommo_mensagens_com_quem(p_tenant uuid, p_desde timestamptz)
returns table (lead_id bigint, quando timestamptz, entrou boolean, quem bigint, sem_nome boolean)
language sql stable security definer set search_path = public as $$
  with m as (
    select k.lead_id, k.quando, k.entrou, k.autor from public.kommo_mensagens k
     where k.tenant_id = p_tenant and k.quando >= p_desde
  ),
  transmissao as (
    select date_trunc('minute', m.quando) as minuto from m
     where not m.entrou and m.autor = 0 group by 1 having count(distinct m.lead_id) >= 5
  ),
  c as (
    select m.*,
           not m.entrou and m.autor = 0 and m.quando >= public.kommo_lyra_no_ar() and (
             date_trunc('minute', m.quando) in (select minuto from transmissao)
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando + interval '1 minute'), '') ilike 'com a lyra%'
             or coalesce(public.kommo_etapa_em(p_tenant, m.lead_id, m.quando - interval '1 minute'), '') ilike 'com a lyra%'
           ) as robo
      from m
  )
  select c.lead_id, c.quando, c.entrou,
         case when c.entrou then 0 when c.autor <> 0 then c.autor when c.robo then 0 else coalesce(l.responsavel, 0) end,
         not c.entrou and c.autor = 0 and not c.robo and l.responsavel is not null
    from c left join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = c.lead_id;
$$;
