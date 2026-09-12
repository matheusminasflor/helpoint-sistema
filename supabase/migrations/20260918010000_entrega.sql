-- Leva CRM-2c: entrega. 2026-09-12.
-- Decisão do dono (ADR-008): cobrar, emitir nota e entregar são três escolhas
-- separadas. A da entrega, para quem não despacha pela Yampi/Correios, é a
-- transportadora do próprio cliente (o distribuidor manda a dele) e uma tarefa
-- para a expedição quando o pedido é pago — modelo de fluxo, não código.
--
-- O que este arquivo cria:
--   crm_contacts.carrier   a transportadora que o cliente usa (vai na ficha do chamado e na tarefa da expedição)
-- O contexto do fluxo já leva o contato inteiro (`automation_enrich_payload`, to_jsonb),
-- então `{{trigger.contact.carrier}}` passa a existir sem mais nada.

alter table public.crm_contacts add column carrier text;
comment on column public.crm_contacts.carrier is 'Transportadora do cliente (CRM-2c). Livre: nome, e como combina a retirada.';
