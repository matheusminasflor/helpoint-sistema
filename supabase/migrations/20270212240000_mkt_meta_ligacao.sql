-- A LIGAÇÃO DO MARKETING COM A META PARA OS INDICADORES (dono, 2026-11-03: "o intuito seria ter indicadores do MKT após
-- conectar"; credencial "que não vence"). Uma ligação por empresa, feita em Marketing › Indicadores com a Configuração de
-- usuário do sistema do Login do Facebook para Empresas (META_LOGIN_CONFIG_ID): guarda as páginas, as contas do
-- Instagram e as contas de anúncios que a pessoa liberou. A credencial fica numa tabela à parte, que nenhuma tela lê
-- (sem policy: só a chave de serviço, nas edge functions). Quem grava é a função `mkt-meta-oauth`, pela chave de serviço,
-- depois de conferir que quem conecta é gestor ou acima.

create table if not exists public.mkt_meta_ligacao (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- [{ "tipo": "pagina" | "instagram" | "anuncios", "id": "...", "nome": "..." }]
  contas jsonb not null default '[]'::jsonb,
  conectado_por uuid references auth.users(id) on delete set null,
  conectado_em timestamptz not null default now(),
  -- O último erro ao buscar os números (a busca diária grava aqui; a tela mostra).
  ultimo_erro text,
  atualizado_em timestamptz
);

create table if not exists public.mkt_meta_ligacao_segredo (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  access_token text not null
);

alter table public.mkt_meta_ligacao enable row level security;
alter table public.mkt_meta_ligacao_segredo enable row level security;
revoke all on public.mkt_meta_ligacao, public.mkt_meta_ligacao_segredo from anon, authenticated;
grant select on public.mkt_meta_ligacao to authenticated;

-- Ler: quem vê os Indicadores do Marketing e a Diretoria. Gravar: só a função (chave de serviço). O segredo não tem
-- policy nenhuma, de propósito.
create policy mkt_meta_ligacao_le on public.mkt_meta_ligacao for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));
