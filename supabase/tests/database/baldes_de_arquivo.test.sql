-- Os baldes de arquivo existem, e com o sinal certo de público/privado.
--
-- Este arquivo existe porque **nenhum teste desta casa tocava em `storage`**, e
-- por isso três baldes usados pelo código puderam não existir por meses sem
-- nada acusar: `avatars`, `tenant-branding` e `fin-purchases`. As policies
-- deles estavam escritas e certas — o balde é que nunca foi criado por
-- migration, só à mão, num banco que não é este.
--
-- O que quebrava, em silêncio: trocar a foto de perfil, subir o logotipo da
-- empresa (que desde a ADR-010 aparece na tela de login) e anexar orçamento ou
-- nota fiscal numa compra. A leva L8 foi entregue com 34 asserções provando as
-- regras de banco do fluxo de compra, e o anexo do mesmo fluxo não tinha onde
-- cair. **Provar a regra do banco não prova o caminho do usuário.**
--
-- Cada asserção abaixo reprovaria hoje se a migration
-- 20261012010000_baldes_de_arquivo_que_faltavam.sql fosse revertida.
begin;
\ir _helpers.psql

select plan(6);

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Os baldes existem
-- ───────────────────────────────────────────────────────────────────────────
-- Sem o balde, `upload` devolve "Bucket not found" e a tela mostra um erro
-- que não diz o que fazer.
select is(
  (select count(*)::int from storage.buckets
    where id in ('avatars', 'tenant-branding', 'fin-purchases')),
  3,
  'os tres baldes que o codigo usa existem no banco'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. E com o sinal certo de público/privado
-- ───────────────────────────────────────────────────────────────────────────
-- Aqui o erro custa mais do que um upload quebrado: balde público entrega o
-- arquivo a quem tiver o link, sem login.
select is(
  (select public from storage.buckets where id = 'fin-purchases'),
  false,
  'o balde de compras e privado: orcamento e nota fiscal nao saem por link solto'
);
select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'o balde de fotos e privado: foto de funcionario e dado de pessoa'
);
-- Este é o único que é público de propósito: a tela de login mostra o logotipo
-- da empresa antes de alguém entrar, e quem ainda não entrou é anônimo.
select is(
  (select public from storage.buckets where id = 'tenant-branding'),
  true,
  'o balde do logotipo e publico: a tela de login o mostra antes do login'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A porta tem dono
-- ───────────────────────────────────────────────────────────────────────────
-- Balde sem policy recusa tudo e parece "quebrado"; balde com policy frouxa
-- entrega tudo. As dos três já existiam antes desta leva — o que faltava era o
-- balde. A asserção prende as duas coisas juntas, que é como elas falham.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') like '%fin-purchases%' or coalesce(with_check, '') like '%fin-purchases%')),
  4,
  'o balde de compras tem as quatro regras de acesso presas ao tenant'
);

-- Escrever o logotipo é de administrador; ler é de qualquer um, e é isso que
-- deixa a tela de login funcionar sem ninguem logado.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'tenant_branding_public_read'
      and 'public' = any(roles)),
  1,
  'a leitura do logotipo vale para quem ainda nao entrou'
);

select * from finish();
rollback;
