-- A TRAVA DE COLUNA DA FILA DE CADASTRO, DE VOLTA. 2026-09-30.
--
-- A migration 20261118060000 devolveu a `authenticated` o UPDATE que o padrão antigo do Supabase dava
-- em toda tabela — e com isso passou por cima de uma trava escrita de propósito em
-- 20261114030000_a_fila_de_cadastro: em `com_solicitacoes_cadastro` a vendedora edita o pedido, mas
-- NÃO escreve `decidido_por`, `ticket_id` nem `cliente_codigo` (senão se aprovaria sozinha). A
-- policy diz quais linhas; o GRANT diz quais colunas.
--
-- Quem acusou foi o pgTAP `a_fila_de_cadastro` (teste 3) no CI #178, num banco do zero. É a única
-- trava por coluna do sistema (procurado em todas as migrations). Mesmo texto da original.
revoke update on public.com_solicitacoes_cadastro from authenticated;
grant update (razao_social, documento, uf, cidade, telefone, telefone_2, email, endereco, cep,
              inscricao_estadual, condicao_fiscal, grupo, prioridade, motivo, status, updated_at)
  on public.com_solicitacoes_cadastro to authenticated;
