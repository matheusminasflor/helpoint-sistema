-- COMPRAS: A FILIAL BY.MF (dono, 2026-10-19): "em compras ter opção INBRAS, MF e BY.MF". Vale na aprovação da compra
-- e na conta a pagar que nasce dela (`fin_entries.filial`). O Comercial continua só com INBRAS e MF (são as filiais que
-- vendem pelo Forteplus). O cartão da BY.MF usa os dias do cartão da INBRAS, como a MF sem dias cadastrados
-- (`vencimento_da_fatura`): cartão próprio da BY.MF só se o dono pedir.
alter table public.compras_solicitacoes drop constraint if exists compras_solicitacoes_filial_check;
alter table public.compras_solicitacoes add constraint compras_solicitacoes_filial_check
  check (filial in ('INBRAS', 'MF', 'BY.MF'));

alter table public.fin_entries drop constraint if exists fin_entries_filial_check;
alter table public.fin_entries add constraint fin_entries_filial_check
  check (filial in ('INBRAS', 'MF', 'BY.MF'));
