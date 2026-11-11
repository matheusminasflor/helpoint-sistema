-- "Aguardando resposta" não mostra a Lyra esperando o cliente (2026-11-11). Desde 20270212721200 a saudação da Lyra em
-- Entrada › Contato inicial é do robô, e o cliente que não respondeu a primeira pergunta dela (Studio Lu Furtado, Divino
-- Cacho) passou a aparecer como "esperando a atendente". Em "Contato inicial" quem conversa é a Lyra: o lead só espera
-- a atendente se a ÚLTIMA mensagem for do cliente (a Lyra não respondeu). O resto igual a 20270212721000.
-- Só create or replace: as permissões ficam como estão.
create or replace function public.kommo_esperando(p_tenant uuid)
returns table (lead_id bigint, desde timestamptz)
language sql stable security definer set search_path = public as $$
  with msg as (select * from public.kommo_mensagens_com_quem(p_tenant, now() - interval '7 days')),
  ultima as (select m.lead_id, max(m.quando) as em from msg m where not m.entrou and m.quem <> 0 group by m.lead_id),
  ultima_de_todas as (
    select distinct on (m.lead_id) m.lead_id, m.entrou from msg m order by m.lead_id, m.quando desc
  ),
  espera as (
    select m.lead_id, min(m.quando) as desde from msg m left join ultima u on u.lead_id = m.lead_id
     where m.entrou and m.quando > coalesce(u.em, '-infinity') group by m.lead_id
  )
  select e.lead_id,
         greatest(e.desde, (select max(t.quando) from public.kommo_etapas t
                             where t.tenant_id = p_tenant and t.lead_id = e.lead_id and t.etapa ilike 'com atendente%'))
    from espera e
    join public.kommo_leads l on l.tenant_id = p_tenant and l.lead_id = e.lead_id
    join ultima_de_todas z on z.lead_id = e.lead_id
   where not l.fechado and not l.conversa_fechada and not l.apagado and coalesce(l.etapa, '') not ilike 'com a lyra%'
     and (coalesce(l.etapa, '') not ilike 'contato inicial%' or z.entrou);
$$;
