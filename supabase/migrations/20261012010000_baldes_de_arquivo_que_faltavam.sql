-- Os três baldes de arquivo que o código usa e o banco não tinha. 2026-09-18.
--
-- Achado ao planejar o chat: `storage.buckets` tinha sete baldes, e o código
-- gravava e lia de três que não estavam lá. Quebravam, em silêncio e na cara do
-- usuário: trocar a foto de perfil, subir o logotipo da empresa — que desde a
-- ADR-010 aparece na tela de login — e anexar orçamento ou nota fiscal numa
-- compra.
--
-- ┌─ A causa, que é o que interessa ───────────────────────────────────────┐
-- │ As **policies** dos três já existem, escritas por migrations antigas.  │
-- │ Os **baldes** nunca foram criados por migration nenhuma: foram criados │
-- │ à mão no painel, num banco que não é este. Então em todo banco montado │
-- │ do zero — o do CI, e a produção no dia do go-live — os três faltam,    │
-- │ com as regras de acesso prontas guardando uma porta que não existe.    │
-- │                                                                        │
-- │ Nenhum teste da casa toca em `storage`, então nada acusou. A L8        │
-- │ (Compras) foi entregue com 34 asserções provando as regras do banco e  │
-- │ o anexo do mesmo fluxo não tinha onde cair.                            │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Esta migration cria só os baldes. Não escreve policy: as que existem estão
-- certas, e reescrevê-las seria mexer no que já funciona.

-- `avatars` — **privado**. As quatro policies que existem são todas do papel
-- `authenticated`, e foto de funcionário é dado de pessoa: nada aqui deve
-- abrir por link solto. O código lê com link assinado
-- (`createSignedUrl`), que funciona em balde privado.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- `tenant-branding` — **público**, e de propósito. A policy que já existe se
-- chama `tenant_branding_public_read` e vale para o papel `public`, não só para
-- quem está logado. É o que a tela de login precisa: desde a ADR-010 ela mostra
-- o logotipo da empresa **antes** de alguém entrar, e quem ainda não entrou é
-- anônimo. Escrever continua sendo só de administrador (três policies).
insert into storage.buckets (id, name, public)
values ('tenant-branding', 'tenant-branding', true)
on conflict (id) do nothing;

-- `fin-purchases` — **privado**. Orçamento e nota fiscal de compra são dinheiro
-- da empresa; as quatro policies que existem prendem tudo à pasta do próprio
-- tenant (`storage.foldername(name)[1] = get_user_tenant_id()`), e o código lê
-- com link assinado de 10 minutos.
insert into storage.buckets (id, name, public)
values ('fin-purchases', 'fin-purchases', false)
on conflict (id) do nothing;

-- Se o balde já existia com o sinal errado, corrige — é o caso de quem criou à
-- mão no painel e marcou o contrário.
update storage.buckets set public = false where id in ('avatars', 'fin-purchases') and public is distinct from false;
update storage.buckets set public = true  where id = 'tenant-branding' and public is distinct from true;
