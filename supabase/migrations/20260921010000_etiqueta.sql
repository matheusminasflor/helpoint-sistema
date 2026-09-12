-- Leva ENC-1: o encaixe "etiquetar". 2026-09-12 (ADR-009).
--
-- A Expedição separa e precisa da etiqueta na mão para imprimir. De onde ela
-- vem é escolha da empresa, e são três conectores — nenhum intermediário:
--   bling    — a etiqueta já existe lá (o pedido vai para o Bling pelo passo
--              de fluxo da CRM-2b); o Helpoint só busca o link
--   yampi    — idem, para quem vende pela loja
--   correios — para quem não tem nem um nem outro: o Helpoint faz a
--              pré-postagem com o contrato da empresa e traz o PDF
--   nenhum   — transportadora do cliente ou retirada (o rastreio é digitado)
--
-- O que este arquivo cria, em uma frase cada:
--   tenant_correios_credentials  o contrato dos Correios da empresa (só service_role)
--   crm_shipping_status()        o que a tela vê: conector escolhido, se os Correios estão
--                                ligados, cartão mascarado — nunca a senha
--   exp_shipments.label_*        de onde veio a etiqueta, o link (quando há) e a referência
--   crm_products.weight_grams    peso, que os Correios exigem na pré-postagem

create table public.tenant_correios_credentials (
  tenant_id      uuid primary key references public.tenants(id) on delete cascade,
  usuario        text not null,                  -- usuário do CWS
  codigo_acesso  text not null,                  -- código de acesso (a "senha" da API)
  cartao_postagem text not null,
  contrato       text,
  codigo_servico text not null default '03298',  -- 03298 = PAC contrato; 03220 = SEDEX contrato
  -- Remetente: nome, documento, telefone, e-mail e endereço. O que os Correios exigem no rótulo.
  remetente      jsonb not null default '{}'::jsonb,
  -- Cache do token (vale 24 h): evita pedir um token novo a cada etiqueta.
  access_token   text,
  token_expires_at timestamptz,
  connected_by   uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger tenant_correios_credentials_updated_at before update on public.tenant_correios_credentials
  for each row execute function public.handle_updated_at();

-- Mesmo cuidado das outras tabelas de segredo: REVOKE explícito além do RLS sem
-- policy (neste banco toda tabela nova nasce com ALL para anon/authenticated).
grant all on public.tenant_correios_credentials to service_role;
revoke all on public.tenant_correios_credentials from public, anon, authenticated;
alter table public.tenant_correios_credentials enable row level security;

-- O que a tela vê. Nunca o código de acesso.
create or replace function public.crm_shipping_status()
returns table (provider text, correios_ligado boolean, cartao_last4 text, codigo_servico text, remetente jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.settings #>> '{expedicao,label_provider}', 'nenhum'),
         c.tenant_id is not null,
         right(c.cartao_postagem, 4),
         c.codigo_servico,
         c.remetente,
         c.updated_at
    from public.tenants t
    left join public.tenant_correios_credentials c on c.tenant_id = t.id
   where t.id = public.get_user_tenant_id()
     and public.has_expedicao_access(auth.uid());
$$;
revoke execute on function public.crm_shipping_status() from public, anon;
grant execute on function public.crm_shipping_status() to authenticated;

-- De onde veio a etiqueta e como achá-la de novo.
alter table public.exp_shipments
  add column label_provider text check (label_provider in ('bling', 'yampi', 'correios')),
  add column label_url      text,          -- Bling e Yampi devolvem link; Correios, não (o PDF vem autenticado)
  add column label_ref      text,          -- id da pré-postagem (Correios) ou da venda (Bling)
  add column tracking_url   text;

-- Peso: os Correios exigem na pré-postagem. Em gramas, como a API pede.
alter table public.crm_products add column weight_grams integer check (weight_grams is null or weight_grams > 0);
