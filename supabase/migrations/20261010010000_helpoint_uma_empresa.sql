-- ADR-010: o Helpoint é o sistema da Minasflor, não um produto multi-empresa.
--
-- Esta migration fecha o nascimento de empresa nova. NÃO remove `tenant_id`,
-- NÃO remove policy e NÃO apaga linha: a separação por empresa continua
-- valendo dentro do banco, e é ela que impede dado de escorregar.
--
-- O caminho que existia era um só: `claim_new_tenant`, SECURITY DEFINER,
-- chamável por qualquer pessoa autenticada, usada pela tela
-- `/onboarding/empresa` (removida na leva anterior). `public.tenants` nunca
-- teve policy de INSERT — o REVOKE abaixo é a segunda volta na chave.
--
-- Deliberadamente NÃO se usa índice único de uma linha só: a suíte pgTAP cria
-- duas empresas dentro da transação para provar que uma não enxerga a outra,
-- e um índice assim reprovaria a suíte inteira.

drop function if exists public.claim_new_tenant(text, text, text, text, text);

revoke insert, delete on public.tenants from authenticated;
revoke insert, delete on public.tenants from anon;

comment on table public.tenants is
  'Uma linha por empresa. Desde a ADR-010 (2026-09-18) o Helpoint é da Minasflor: '
  'empresa nova só nasce pelo service_role, no seed da implantação. '
  'tenant_id continua em 142 tabelas e em 395 policies — é a barreira, não sobra.';

comment on column public.tenants.plan_config is
  'MORTO desde a ADR-010 (2026-09-18). Nada no sistema lê esta coluna. '
  'Guardava plano, prazo de teste, limite de usuários e módulos contratados. '
  'Quem decide o que cada pessoa vê é user_module_access. '
  'Mantida porque apagar coluna é irreversível e não muda nada na tela.';

comment on column public.tenants.plan is
  'MORTO desde a ADR-010 (2026-09-18). Nada lê. Ver o comentário de plan_config.';

comment on table public.tenant_signup_attempts is
  'Histórico do cadastro público de empresa, encerrado pela ADR-010 (2026-09-18). '
  'Não recebe linha nova: a função que escrevia aqui (claim_new_tenant) foi removida.';
