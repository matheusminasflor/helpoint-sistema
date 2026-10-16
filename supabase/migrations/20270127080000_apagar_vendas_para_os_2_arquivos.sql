-- APAGAR A IMPORTAÇÃO DE 2026 PARA REIMPORTAR COM OS 2 ARQUIVOS DO MÊS (dono, 2026-10-16). Os arquivos do ano inteiro
-- (um por série) vieram com o defeito do Forteplus: o relatório junta venda e remessa do mesmo cliente e produto no mês
-- numa linha só, e no período maior ainda multiplica as quantidades — setembro da INBRAS tinha 171,5 mil no sistema
-- contra 138,9 mil no relatório do mês; o N D FIGUEIREDO tinha 6.258,58 de venda onde o certo é 3.643,36. O dono
-- reimporta mês a mês, por filial, com os 2 arquivos (tudo + só 5910/6910; `combinarAeB` no front). A Diretoria
-- calcula das vendas: apagar aqui limpa os dois. Ficam cadastro, carteiras, lançamentos e checklists.
delete from public.com_vendas_itens_espera;
delete from public.com_vendas_itens;
delete from public.com_vendas_competencias;
delete from public.com_vendas_importacoes where tipo = 'vendas';
