-- Correções da auditoria da Frente 3
-- (.scratch/plano-frente3-correcoes.md, item 5.2). Idempotente: `comment on
-- function` sempre substitui o comentário anterior, sem erro.
--
-- `com_faturamento_mensal` já tinha `p_de`/`p_ate` desde
-- 20261023010000_organizacao_das_telas.sql — a migration está aplicada e
-- não se edita. Mas nenhuma tela chama este hook com período (o gráfico é
-- o ano inteiro, com o período do seletor só destacado nele — §11 do
-- documento do dono; ver o comentário de `useFaturamentoMensal` em
-- `src/hooks/useComercialPainel.ts`), e sem aviso no próprio banco, a
-- próxima pessoa a ler a assinatura pode achar que o filtro está solto e
-- "consertar" a tela passando o período — o que a leva anterior decidiu
-- não fazer. O comentário existe para essa pessoa ler antes de mudar algo.
comment on function public.com_faturamento_mensal(integer, text, text, date, date) is
  'p_de/p_ate existem por simetria com com_painel_totais (mesma leva, mesma '
  'assinatura) — nenhuma tela os passa. O gráfico mensal é o ano inteiro, '
  'com o período do seletor apenas destacado nele (§11 do documento do '
  'dono). Ver src/hooks/useComercialPainel.ts.';
