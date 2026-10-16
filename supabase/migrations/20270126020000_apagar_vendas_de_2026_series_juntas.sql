-- APAGAR A IMPORTAÇÃO DE 2026 COM AS SÉRIES JUNTAS (dono, 2026-10-15). Os arquivos "2026-INBRAS" e "2026-MF" traziam
-- as séries 1 e 75 no mesmo relatório, e o Forteplus JUNTA a linha de mesmo número de nota e mesmo produto das duas:
-- soma quantidade e valor e marca a série 75. A venda da Daniele (1096) na nota 23385 virou bonificação; no ano inteiro,
-- venda a menos e bonificação a mais. O dono reimporta por filial, uma série por arquivo (a tela agora aceita os dois
-- juntos e recusa arquivo com séries misturadas). A Diretoria calcula das vendas (20270125010000): apagar aqui limpa
-- os dois. Ficam cadastro, carteiras, lançamentos e checklists.
delete from public.com_vendas_itens_espera;
delete from public.com_vendas_itens;
delete from public.com_vendas_competencias;
delete from public.com_vendas_importacoes where tipo = 'vendas';
