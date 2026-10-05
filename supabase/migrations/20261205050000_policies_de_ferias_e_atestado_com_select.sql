-- REVISÃO DE 2026-10-05 (eixo padrão): três policies de INSERT de férias e atestado chamavam
-- `get_user_tenant_id()` direto, e as outras do sistema usam `(select get_user_tenant_id())` — com o
-- `select` o Postgres calcula uma vez por comando, sem ele, uma vez por linha. A regra não muda:
-- mesmas condições, só o jeito de chamar. `alter policy` mantém nome e papéis.
alter policy rh_ferias_registra on public.rh_vacation_requests
  with check (tenant_id = (select public.get_user_tenant_id())
    and status = 'aprovada'
    and public.pode_no_rh('vacations', 'approve'));

alter policy "Colaborador cria suas solicitações de férias" on public.rh_vacation_requests
  with check (user_id = (select auth.uid())
    and tenant_id = (select public.get_user_tenant_id())
    and status = 'pendente');

alter policy "Colaborador envia seus atestados" on public.rh_medical_certificates
  with check (user_id = (select auth.uid())
    and tenant_id = (select public.get_user_tenant_id())
    and status = 'recebido');
