-- Frente 2 (correções da auditoria, item 2) — quem tem `metas.definir` não
-- conseguia importar. `com_importar_metas`/`com_importar_metas_do_ano` são
-- `security invoker` e gravam o log da importação em
-- `com_vendas_importacoes` (mesma tabela usada por vendas/clientes), cuja
-- policy de INSERT só aceitava admin OU `vendas.importar` — um member com
-- só `metas.definir` (o perfil que a tela de Metas exige para mostrar o
-- botão "Importar") passava pela policy de `metas_carteira`/`metas_ano`
-- (que já aceitava `metas.definir`) e quebrava no INSERT do log, com 42501
-- e zero linhas gravadas. O log é o mesmo para vendas e para metas: quem
-- pode importar UM dos dois pode escrever a linha do que importou.
drop policy if exists com_vendas_importacoes_insert on public.com_vendas_importacoes;
create policy com_vendas_importacoes_insert on public.com_vendas_importacoes for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

-- Item 3 — duas metas totais do mesmo mês (a importada e a que o diretor
-- define na grade) não podem divergir em silêncio. Decisão: `metas_ano.meta`
-- é a oficial importada (a série que soma R$ 6.199.420 em 2026, batendo com
-- o "23% acima do fechamento de 2025" do INSTRUCOES §18); `com_metas`
-- (carteira nula) vence por cima dela quando o diretor define. `meta_total`
-- continua sendo IMPORTADA (é dado do diretor; jogar fora dado é pior que
-- guardar) mas sai do que o front lê — nenhuma tela usa, de propósito
-- desconhecido. É a segunda série de meta do HISTORICO_METAS.json
-- (`anos[ano].metaTotal`), que só existe a partir de 2026 e tem meses nulos
-- mesmo quando `meta` já está preenchida — não é um espelho dela.
comment on column public.metas_ano.meta_total is
  'Segunda série de meta do HISTORICO_METAS.json (anos[ano].metaTotal), importada mas sem tela que a leia — propósito desconhecido. Nunca confundir com metas_ano.meta (a oficial). Ver docs/metas-e-carteiras-fonte-da-verdade.md §3 e docs/nao-funciona.md.';
