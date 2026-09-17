-- Correção da leva anterior. 2026-09-17.
--
-- A migration `20261007010000` afirma, no comentário: "`on delete` de cada uma
-- é o que já era — o comportamento não muda, só a exigência". Em três das dez
-- isso não é verdade. Elas eram `on delete set null` desde a base do CRM
-- (`20260910010000`, linhas 93, 114 e 125) e ficaram sem cláusula nenhuma, ou
-- seja `no action`.
--
-- O que isso quebra: apagar uma pessoa que já criou contato, negócio ou
-- anotação passa a ser impossível, em vez de deixar o registro com "criado por
-- ninguém". É a mesma armadilha que o item 8 daquela leva foi consertar no RH —
-- e o `crm_orders.created_by`, na mesma migration, manteve o `set null`. A
-- inconsistência dentro do próprio arquivo é a prova de que foi descuido.
--
-- `set null (coluna)` nomeia a coluna de propósito: sem isso o Postgres zeraria
-- o `tenant_id` junto, e a linha viraria órfã de empresa.
alter table public.crm_contacts
  drop constraint if exists crm_contacts_created_by_fkey,
  add  constraint crm_contacts_created_by_fkey foreign key (created_by, tenant_id)
       references public.profiles (id, tenant_id) on delete set null (created_by);

alter table public.crm_deals
  drop constraint if exists crm_deals_created_by_fkey,
  add  constraint crm_deals_created_by_fkey foreign key (created_by, tenant_id)
       references public.profiles (id, tenant_id) on delete set null (created_by);

-- `author_id` nulo quer dizer "o sistema escreveu" — está assim desde a base do
-- CRM, e é de lá que vem a anotação que o formulário do site e o Lead Ads
-- gravam sem ninguém logado.
alter table public.crm_deal_activities
  drop constraint if exists crm_deal_activities_author_id_fkey,
  add  constraint crm_deal_activities_author_id_fkey foreign key (author_id, tenant_id)
       references public.profiles (id, tenant_id) on delete set null (author_id);
