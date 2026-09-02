
DROP POLICY IF EXISTS "RH documents owner read" ON public.rh_documents;
CREATE POLICY "RH documents owner read" ON public.rh_documents FOR SELECT
USING ((tenant_id = get_user_tenant_id()) AND ((user_id = auth.uid()) OR has_rh_access(auth.uid())));

DROP POLICY IF EXISTS "RH benefits owner read" ON public.rh_employee_benefits;
CREATE POLICY "RH benefits owner read" ON public.rh_employee_benefits FOR SELECT
USING ((tenant_id = get_user_tenant_id()) AND ((user_id = auth.uid()) OR has_rh_access(auth.uid())));

DROP POLICY IF EXISTS "Colaborador lê o próprio perfil RH" ON public.rh_employee_profiles;
CREATE POLICY "Colaborador lê o próprio perfil RH" ON public.rh_employee_profiles FOR SELECT
USING ((tenant_id = get_user_tenant_id()) AND ((user_id = auth.uid()) OR has_rh_access(auth.uid())));

DROP POLICY IF EXISTS "Colaborador vê seus atestados" ON public.rh_medical_certificates;
CREATE POLICY "Colaborador vê seus atestados" ON public.rh_medical_certificates FOR SELECT
USING ((tenant_id = get_user_tenant_id()) AND ((user_id = auth.uid()) OR has_rh_access(auth.uid())));

DROP POLICY IF EXISTS "Colaborador vê seus holerites" ON public.rh_payslips;
CREATE POLICY "Colaborador vê seus holerites" ON public.rh_payslips FOR SELECT
USING ((tenant_id = get_user_tenant_id()) AND ((user_id = auth.uid()) OR has_rh_access(auth.uid())));

DROP POLICY IF EXISTS "Colaborador vê suas solicitações de férias" ON public.rh_vacation_requests;
CREATE POLICY "Colaborador vê suas solicitações de férias" ON public.rh_vacation_requests FOR SELECT
USING ((tenant_id = get_user_tenant_id()) AND ((user_id = auth.uid()) OR has_rh_access(auth.uid())));
