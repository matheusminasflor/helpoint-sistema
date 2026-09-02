-- Remove possíveis duplicidades preservando um registro por (user_id, role)
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.ctid < b.ctid
  AND a.user_id = b.user_id
  AND a.role = b.role;

-- Cria índice único compatível com ON CONFLICT (user_id, role)
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key
  ON public.user_roles (user_id, role);