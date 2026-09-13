-- Leva ENC-2: o encaixe "cobrar" com o Asaas. 2026-09-13 (ADR-009).
--
-- É o padrão do caminho nativo — quem não tem loja virtual nem ERP cobra por
-- aqui. Uma conexão só por empresa cobra dos três jeitos: **Pix, boleto e
-- cartão**, e o link de pagamento é a própria resposta da cobrança. Stripe e
-- Yampi continuam como opções; "por fora" continua sendo escolha válida.
--
-- Quase nada nasce aqui: a estrutura da CRM-2a serve inteira. A credencial vai
-- para `tenant_payment_credentials` (só `service_role`, REVOKE explícito), a
-- tela lê `crm_payment_providers()` (que já devolve os 4 últimos da chave e
-- nunca a chave), e aviso repetido cai fora por `crm_payment_events`.
--
-- O que este arquivo acrescenta:
--   provider 'asaas'            nas duas listas fechadas (credencial e pedido)
--   crm_contacts.asaas_customer_id   o cliente nasce uma vez lá e se reusa
--   crm_orders.payment_method        como foi cobrado (o cliente pode escolher)
--   crm_orders.payment_due_date      para quando

-- ── O Asaas entra nas duas listas fechadas ──────────────────────────────────
alter table public.tenant_payment_credentials
  drop constraint tenant_payment_credentials_provider_check;
alter table public.tenant_payment_credentials
  add constraint tenant_payment_credentials_provider_check
  check (provider in ('stripe', 'yampi', 'asaas'));

alter table public.crm_orders
  drop constraint crm_orders_payment_provider_check;
alter table public.crm_orders
  add constraint crm_orders_payment_provider_check
  check (payment_provider in ('stripe', 'yampi', 'asaas', 'manual'));

-- ── O cliente do Asaas, aprendido uma vez ───────────────────────────────────
-- Molde do `bling_contact_id` da CRM-2b: a segunda cobrança do mesmo cliente
-- não cria outro cadastro lá.
alter table public.crm_contacts add column asaas_customer_id text;
comment on column public.crm_contacts.asaas_customer_id is
  'Id do cliente no Asaas (cus_…), aprendido na primeira cobrança e reusado (ENC-2).';

-- ── Como e para quando foi cobrado ──────────────────────────────────────────
-- 'undefined' é o padrão do Asaas: a página de pagamento oferece os três e o
-- cliente decide. Quem quer forçar Pix (ou boleto) escolhe na hora de gerar.
alter table public.crm_orders
  add column payment_method   text check (payment_method in ('pix', 'boleto', 'credit_card', 'undefined')),
  add column payment_due_date date;

comment on column public.crm_orders.payment_method is
  'Forma de pagamento pedida ao provedor. "undefined" = o cliente escolhe na página (ENC-2).';
