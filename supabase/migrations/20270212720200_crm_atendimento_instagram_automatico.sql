-- ATENDIMENTO DO CRM: A RESPOSTA AUTOMÁTICA DO INSTAGRAM NÃO É DA ATENDENTE (2026-11-09, migration 20270212720100).
-- Conferido lead a lead na produção: no Direct, o lead que fica em "Contato inicial" da Entrada recebe resposta 5 a 6
-- segundos depois da mensagem do cliente (leads 121688622 e 121688716), sem passar por "Com a Lyra" — é a resposta
-- automática do Instagram, e contava como 1ª resposta da atendente em 0 minuto. Desde a Lyra, a mensagem de autor 0 no
-- Instagram que sai até 15 segundos depois da do cliente é do robô.
-- `create or replace` preserva quem pode chamar a função.

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
    from c left join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = c.lead_id;
$$;
