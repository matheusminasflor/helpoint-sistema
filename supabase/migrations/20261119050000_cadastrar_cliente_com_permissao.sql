-- CADASTRAR CLIENTE NOVO SÓ COM PERMISSÃO. 2026-10-01.
--
-- Antes: qualquer pessoa com o módulo Comercial criava cliente (`has_comercial_access` na policy de
-- INSERT), por três portas na mesma tela — "Importar clientes", "Novo cliente" e a fila "Pedidos de
-- cliente novo". O dono achou confuso e decidiu:
--   * criar cliente só em Configurações › Cadastro de clientes, com a caixinha
--     `comercial.clientes.cadastrar` (dono/admin sempre);
--   * cliente novo se pede por CHAMADO (Comercial › Cadastro de cliente) — a fila sai da tela;
--   * a vendedora continua COMPLETANDO os dados dos clientes dela: a policy de UPDATE não muda, e a
--     de leitura já a limita à carteira dela.
--
-- O ramo `vendas.importar` fica no INSERT: as importações (`com_importar_modelo_de_clientes`,
-- `com_importar_clientes`) não são SECURITY DEFINER e criam cliente com a permissão de quem importa.
alter policy "com_clientes_insert" on public.com_clientes
  with check (
    tenant_id = get_user_tenant_id()
    and (
      is_admin_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'comercial', 'clientes', 'cadastrar')
      or tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar')
    )
  );

-- O Gestor do Comercial nasce com a caixinha (decisão: Gestor marcado; Operador e Somente leitura não).
-- ponytail: só os perfis que existem; a semente de empresa nova não ganha a chave (ADR-010, uma
-- empresa só). Se um dia houver outra, o Gestor dela nasce sem e o dono marca no perfil.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{clientes}', '{"cadastrar": true}'::jsonb)
 where department = 'comercial' and name = 'Gestor';
