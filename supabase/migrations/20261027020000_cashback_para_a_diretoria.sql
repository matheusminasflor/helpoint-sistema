-- O cashback também é número do diretor
--
-- Pedido do dono, 2026-09-25, na mesma frase que gerou a leva das caixas: "o
-- diretor e comercial precisa saber quanto foi faturado, o que foi de
-- bonificação, o que foi de CASHBACK".
--
-- Faturamento e bonificação a Diretoria já tinha. Cashback, não — em tela
-- nenhuma da Diretoria. E ligar a tela não bastava, porque o número chegaria
-- ZERO, em silêncio:
--
--   `com_cashback_mensal`/`com_cashback_resumo` são `stable`, não
--   `security definer` — elas leem com os poderes de quem chama. Entre as onze
--   tabelas `com_*`, dez liberam SELECT para "Comercial **ou** Diretoria";
--   `com_faixas_cashback` liberava só para o Comercial. Sem as faixas, todo
--   cliente sai `sem_tabela`, o cashback de todo mundo vira zero e
--   `com_cashback_indicadores` devolve `cashback_total = 0`.
--
-- Zero é um número plausível. O diretor leria "o cashback deste ano foi
-- R$ 0,00" e acreditaria — é a mesma família de defeito da regra 1 das cinco
-- ("falha de RLS virava lista vazia; o RH ficou meses quebrado assim"), só que
-- do lado da leitura: aqui a policy não levanta erro, ela filtra as linhas.
--
-- ENTÃO O QUE MUDA É UMA POLICY, e só a de LEITURA. Quem configura faixa
-- continua sendo o Comercial (`tem_permissao(..., 'cashback', 'configurar')`) —
-- as policies de INSERT/UPDATE/DELETE não são tocadas. O diretor passa a ler a
-- tabela de faixas porque sem ela o número dele é falso, não porque ele
-- administra o programa.
--
-- É a MESMA condição que `com_vendas_itens`, `com_clientes`, `com_produtos`,
-- `com_metas`, `com_carteira_membros` e `com_carteira_renomeacoes` já usam,
-- palavra por palavra. As três tabelas que continuam só do Comercial
-- (`com_vendas_importacoes`, `com_vendas_competencias`,
-- `com_clientes_tabela_historico`) são de importação e de histórico de cadastro
-- — trabalho do Comercial, que o diretor não faz e nenhuma tela dele lê.
--
-- Provado em `supabase/tests/database/comercial_cashback_do_diretor.test.sql`:
-- um usuário com acesso SÓ à Diretoria lê o cashback e vê o valor de verdade.
-- A asserção nasceu vermelha contra a policy antiga (cashback 0 em vez de
-- 30,00) — é ela que impede a regressão de voltar em silêncio.

drop policy if exists com_faixas_cashback_select on public.com_faixas_cashback;

create policy com_faixas_cashback_select on public.com_faixas_cashback
for select
using (
  tenant_id = (select public.get_user_tenant_id())
  and (
    (select public.has_comercial_access(auth.uid()))
    or (select public.has_diretoria_access(auth.uid()))
  )
);
