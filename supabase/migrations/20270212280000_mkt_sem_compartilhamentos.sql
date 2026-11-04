-- Compartilhamentos saem das Redes sociais do Marketing (dono, 2026-11-04): o Insights da Meta não mostra o número,
-- então não havia como conferir o que o robô trazia. A tela, o formulário e o coletor já não usam a coluna.
alter table public.mkt_redes_semana drop column if exists compartilhamentos;
