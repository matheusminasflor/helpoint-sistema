-- Fix known auth bug: NULL string columns break the admin users listing
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL;

-- Helper for the signup function: look up a user by email without the buggy admin listing
CREATE OR REPLACE FUNCTION public.get_auth_user_status(_email text)
RETURNS TABLE(user_id uuid, is_confirmed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, (email_confirmed_at IS NOT NULL)
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_status(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_auth_user_status(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_status(text) TO service_role;