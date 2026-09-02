-- Step 1: Add 'admin' to the existing enum (this is safe, just adds a new value)
ALTER TYPE public.app_role ADD VALUE 'admin';