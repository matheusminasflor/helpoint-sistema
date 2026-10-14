-- COMERCIAL: PERMISSÃO POR TELA E "SÓ OS MEUS × EQUIPE" (dono, 2026-10-14). Pedido: "deve ter em permissões de
-- perfil como eu configurar acesso a cada parâmetro, pois eu posso querer liberar 1 relatório para X usuário ou
-- perfil. Por exemplo indicadores: o Operador consegue ver os seus indicadores e apenas o dele, não da equipe; já o
-- gestor consegue ver os relatórios de todos". Vendedora por padrão: Meu dia, Indicadores (os dela), ficha do
-- cliente e carteira. Plano: .scratch/plano-comercial-reorganizado.md.
--
-- 1. As caixinhas novas (o perfil e a exceção da pessoa já sabem guardar qualquer seção/ação):
--      lancamentos.view/equipe · carteiras.view/equipe · reports.view/view_team_metrics (já existiam)
--      clientes.view · bonificacao.view · cashback.view · informado_faturado.view · atendimento.view
--      diretrizes_beneficio.view · vendas.view (já existia) — e sai `dashboard`, que nada usava.
-- 2. "Ver a equipe" deixa de depender só de "Montar carteiras" (que também ESCREVE): cada tela ganha a sua.
-- ponytail: as análises (vendas, bonificação, cashback, clientes parados) leem tabelas que todo o Comercial lê — a
-- caixinha delas vale na tela (menu + guarda da rota), não no dado. Saída: RLS por análise, se um dia precisar.

-- ─── 1. Os três perfis do Comercial ──────────────────────────────────────────────────────────────
update public.access_profiles
   set permissions = (permissions - 'dashboard') || jsonb_build_object(
         'lancamentos', coalesce(permissions -> 'lancamentos', '{}'::jsonb) || '{"view": true, "equipe": true}'::jsonb,
         'carteiras', coalesce(permissions -> 'carteiras', '{}'::jsonb) || '{"view": true, "equipe": true}'::jsonb,
         'reports', coalesce(permissions -> 'reports', '{}'::jsonb) || '{"view": true, "view_team_metrics": true}'::jsonb,
         'clientes', coalesce(permissions -> 'clientes', '{}'::jsonb) || '{"view": true}'::jsonb,
         'vendas', coalesce(permissions -> 'vendas', '{}'::jsonb) || '{"view": true}'::jsonb,
         'bonificacao', '{"view": true}'::jsonb,
         'cashback', '{"view": true}'::jsonb,
         'informado_faturado', '{"view": true}'::jsonb,
         'atendimento', '{"view": true}'::jsonb,
         'diretrizes_beneficio', coalesce(permissions -> 'diretrizes_beneficio', '{}'::jsonb) || '{"view": true}'::jsonb)
 where department = 'comercial' and name in ('Gestor', 'Somente leitura');

-- A vendedora: o dia dela, os indicadores e a carteira DELA, e a ficha do cliente. O resto o gestor libera.
update public.access_profiles
   set permissions = (permissions - 'dashboard') || jsonb_build_object(
         'lancamentos', coalesce(permissions -> 'lancamentos', '{}'::jsonb) || '{"view": true, "equipe": false}'::jsonb,
         'carteiras', coalesce(permissions -> 'carteiras', '{}'::jsonb) || '{"view": true, "equipe": false}'::jsonb,
         'reports', coalesce(permissions -> 'reports', '{}'::jsonb) || '{"view": true, "view_team_metrics": false}'::jsonb,
         'clientes', coalesce(permissions -> 'clientes', '{}'::jsonb) || '{"view": true}'::jsonb,
         'vendas', coalesce(permissions -> 'vendas', '{}'::jsonb) || '{"view": false}'::jsonb,
         'bonificacao', '{"view": false}'::jsonb,
         'cashback', '{"view": false}'::jsonb,
         'informado_faturado', '{"view": false}'::jsonb,
         'atendimento', '{"view": false}'::jsonb,
         'diretrizes_beneficio', coalesce(permissions -> 'diretrizes_beneficio', '{}'::jsonb) || '{"view": false}'::jsonb)
 where department = 'comercial' and name = 'Operador';

-- ─── 2. "Ver a equipe", tela a tela ──────────────────────────────────────────────────────────────
/** A pessoa tem esta caixinha do Comercial (no perfil ou na exceção dela)? */
create or replace function public.com_tem(p_secao text, p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.tem_permissao(auth.uid(), 'comercial', p_secao, p_acao), false);
$$;
revoke all on function public.com_tem(text, text) from public, anon;
grant execute on function public.com_tem(text, text) to authenticated;

-- Lançamentos da equipe: quem tem "ver a equipe" nos Lançamentos ou nos Indicadores.
drop policy if exists com_interacoes_select on public.com_interacoes;
create policy com_interacoes_select on public.com_interacoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (vendedor_id = auth.uid()
              or (select public.com_pode_gerir_carteiras())
              or (select public.has_diretoria_access(auth.uid()))
              or (select public.com_tem('lancamentos', 'equipe'))
              or (select public.com_tem('reports', 'view_team_metrics'))));

-- As outras três portas da equipe: troca no texto da função que está no ar (o padrão de 20261214020000), e a
-- migration recusa seguir se o texto não estiver lá.
do $$
declare
  v_def text;
  v_novo text;
begin
  -- Indicadores: quem aparece no painel.
  v_def := pg_get_functiondef('public.com_vendedoras_do_painel(date, date)'::regprocedure);
  v_novo := replace(v_def, 'or public.com_pode_gerir_carteiras()',
                    'or public.com_pode_gerir_carteiras() or public.com_tem(''reports'', ''view_team_metrics'')');
  if v_novo = v_def then raise exception 'com_vendedoras_do_painel mudou: revise a migration'; end if;
  execute v_novo;

  -- Informado × Faturado: a tela inteira é da equipe.
  v_def := pg_get_functiondef('public.com_lancado_x_faturado(date, date)'::regprocedure);
  v_novo := replace(v_def, 'or public.com_pode_gerir_carteiras()',
                    'or public.com_pode_gerir_carteiras() or public.com_tem(''informado_faturado'', ''view'')');
  if v_novo = v_def then raise exception 'com_lancado_x_faturado mudou: revise a migration'; end if;
  execute v_novo;

  -- Carteiras: ver a de qualquer pessoa.
  v_def := pg_get_functiondef('public.com_pode_ver_carteira(text)'::regprocedure);
  v_novo := replace(v_def, 'or public.has_diretoria_access(auth.uid())',
                    'or public.has_diretoria_access(auth.uid()) or public.com_tem(''carteiras'', ''equipe'')');
  if v_novo = v_def then raise exception 'com_pode_ver_carteira mudou: revise a migration'; end if;
  execute v_novo;
end;
$$;
