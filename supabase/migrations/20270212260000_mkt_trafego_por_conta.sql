-- TRÁFEGO PAGO POR CONTA DE INSTAGRAM (dono, 2026-11-03, proposta v3 aprovada: "em tráfego pago separar os anúncios e
-- seus indicadores por conta, o que foi da BY.MF, minasflor ou MF.PRO"). O grão já existe: `mkt_redes_semana` tem uma
-- linha por conta por semana; o tráfego da conta entra nela. `mkt_trafego_semana` continua com o total da conta de
-- anúncios (o alcance do total não é a soma das contas: a mesma pessoa pode ver anúncios de duas) e com os leads, que o
-- Kommo não separa por Instagram. As policies das duas tabelas já cobrem as colunas novas.

alter table public.mkt_redes_semana
  add column if not exists investimento numeric(12,2) check (investimento >= 0),
  add column if not exists alcance_pago integer check (alcance_pago >= 0),
  add column if not exists visitas_pagas integer check (visitas_pagas >= 0),
  add column if not exists campanhas_ativas integer check (campanhas_ativas >= 0),
  -- As campanhas da conta na semana, [{nome, investimento, alcance, ativa}]: quem preenche é o coletor da Meta.
  add column if not exists campanhas jsonb;

-- Leads que ainda estão no funil Entrada do Kommo, sem segmento (proposta v2: "quantos ainda sem triagem").
alter table public.mkt_trafego_semana
  add column if not exists leads_sem_triagem integer check (leads_sem_triagem >= 0);
