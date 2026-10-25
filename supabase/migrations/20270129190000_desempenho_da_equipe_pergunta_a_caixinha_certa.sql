-- PERFORMANCE DA EQUIPE: A TELA E O BANCO PERGUNTAM A MESMA COISA (proposta "Helpoint no dia a dia", aprovada em
-- 2026-10-24, etapa 0).
--
-- A tela abre a Performance da equipe para quem tem "Indicadores · Ver os indicadores da equipe toda"
-- (`reports.view_team_metrics`). Mas os chamados vinham de um select direto em `tickets`, que o RLS filtra por
-- "Ver os chamados do setor" (`tickets.view_all`, em `modulos_de_chamado_visiveis`). Quem tinha só a primeira via o
-- painel com os PRÓPRIOS chamados e achava que era a equipe.
--
-- Agora os chamados do painel vêm desta função, que pergunta a caixinha da tela. Só leitura, só os campos que já
-- estavam na tela, só o setor e o período pedidos. Sem módulo (todos os setores juntos), só dono e administrador.
create or replace function public.chamados_do_desempenho(p_modulo text, p_de timestamptz, p_ate timestamptz)
returns setof public.tickets
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_setor text := public.setor_do_modulo(p_modulo);
begin
  if not (
    public.is_admin_or_higher(auth.uid())
    or (v_setor is not null and (
          coalesce(public.tem_permissao(auth.uid(), v_setor, 'reports', 'view_team_metrics'), false)
          or coalesce(public.tem_permissao(auth.uid(), v_setor, 'tickets', 'view_all'), false)))
  ) then
    raise exception 'Seu perfil não vê os indicadores da equipe deste setor.' using errcode = '42501';
  end if;
  return query
    select t.* from public.tickets t
     where t.tenant_id = v_tenant
       and t.assigned_to is not null
       and t.created_at between p_de and p_ate
       and (p_modulo is null or t.module::text = p_modulo);
end;
$$;

revoke all on function public.chamados_do_desempenho(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.chamados_do_desempenho(text, timestamptz, timestamptz) to authenticated;
