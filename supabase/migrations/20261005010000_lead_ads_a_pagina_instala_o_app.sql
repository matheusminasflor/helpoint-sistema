-- CRM-4c: a página precisa **instalar** o aplicativo. 2026-09-15.
--
-- Conectar a página pelo Marketing dá ao Helpoint permissão de *ler* a página.
-- Não faz ela *mandar* os leads: isso é uma segunda chamada à Meta
-- (`POST /{page-id}/subscribed_apps` com `subscribed_fields=leadgen`), e sem ela
-- o webhook nunca é chamado. Configurava-se tudo e nenhum lead chegava, sem erro
-- em lugar nenhum — o pior tipo de defeito, porque não deixa rastro.
--
-- Essa chamada precisa da credencial **da página**, que é diferente da credencial
-- da pessoa que conectou. A Meta as entrega juntas (`/me/accounts` devolve uma
-- por página), mas o Marketing só guardava a da pessoa.
--
-- Coluna nova, e não troca da que existe: publicar post (`mkt-meta-publish`) e
-- renovar credencial usam a da pessoa há meses, e trocá-la por baixo seria mexer
-- em coisa que esta leva não veio consertar. Quem precisa da credencial da
-- página é o Lead Ads: instalar o aplicativo e ler o conteúdo do lead.
alter table public.mkt_social_account_secrets
  add column if not exists page_access_token text;

comment on column public.mkt_social_account_secrets.page_access_token is
  'Credencial da própria página do Facebook (CRM-4c). É com ela que a página instala o aplicativo do Helpoint e que se lê o conteúdo de um lead de anúncio. Nula em conta conectada antes desta migration — reconectar a página a preenche.';

-- A tabela já é fechada (RLS ligada, sem policy, grants só para `service_role`),
-- e a coluna nasce sob a mesma porta. Nada a conceder.
