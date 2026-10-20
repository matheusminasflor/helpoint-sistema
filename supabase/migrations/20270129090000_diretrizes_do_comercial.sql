-- Diretrizes do Comercial (dono, 2026-10-20): "no Comercial quero criar Diretriz de processo e não de vendas —
-- por exemplo, sempre que a Diretoria solicitar um pedido, deve ser Série 75, venda em nome da pessoa da Diretoria".
-- Em 2026-10-04 o Comercial ficou fora das diretrizes-documento porque lá "Diretrizes" era só a regra de benefício
-- (`com_diretrizes`, seção `diretrizes_beneficio`). As duas passam a conviver: a regra de benefício segue onde está
-- (a aba das Configurações vira "Regras de benefício"), e o Comercial ganha as "Diretrizes do Comercial" iguais às
-- dos outros setores (seção `diretrizes` do perfil, `pode_no_setor('comercial','diretrizes',…)`).

alter table public.diretrizes drop constraint diretrizes_setor_check;
alter table public.diretrizes add constraint diretrizes_setor_check check (setor = any (array[
  'ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional', 'expedicao', 'producao']));

-- O mesmo critério de 20261204010000: quem altera as configurações de chamados do setor cuida das diretrizes dele.
update public.access_profiles
   set permissions = permissions || jsonb_build_object('diretrizes',
         jsonb_build_object('view', true, 'edit', true, 'publish', true, 'delete', true))
 where department = 'comercial'
   and coalesce((permissions -> 'config_chamados' ->> 'edit')::boolean, false)
   and not (permissions ? 'diretrizes');
