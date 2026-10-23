-- CONFERÊNCIA (20270129130000): o banco perguntava por `ti.cadastros.edit`, seção que não existe; a aba da tela e
-- da matriz é `config_cadastros`. Só o administrador conseguia salvar; o gestor da TI via o botão e recebia erro.
create or replace function public.pode_configurar_conferencia()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid()) or public.tem_permissao(auth.uid(), 'ti', 'config_cadastros', 'edit');
$$;
