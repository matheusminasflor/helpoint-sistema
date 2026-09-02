-- Fix function search path security warnings
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.audit_trigger_fn() SET search_path = public;