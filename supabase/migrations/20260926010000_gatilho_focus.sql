-- ENC-3b: o aviso automático da Focus NFe. 2026-09-13 (ADR-009).
--
-- Até aqui a nota nascia "na fila" e a situação só mudava quando alguém clicava
-- em "Atualizar situação" ou o fluxo rodava de novo. A Focus tem gatilho
-- (`POST /v2/hooks`), então o Helpoint cadastra o endereço dela sozinho, como
-- já faz na Yampi e no Asaas, e a nota se resolve sem ninguém olhar.
--
-- O gatilho da Focus aceita um cabeçalho de autorização escolhido por quem
-- cadastra (`authorization` + `authorization_header`): o segredo é sorteado no
-- servidor, guardado aqui, e nunca passa pela tela.
alter table public.tenant_focusnfe_connections
  add column hook_id     text,
  add column hook_secret text;

comment on column public.tenant_focusnfe_connections.hook_secret is
  'Segredo que a Focus devolve no cabeçalho do aviso. Sorteado no servidor; nunca sai desta tabela.';
