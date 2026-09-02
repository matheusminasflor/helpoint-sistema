ALTER TABLE public.software_licenses ADD COLUMN auto_create_ticket boolean NOT NULL DEFAULT false;
ALTER TABLE public.software_contracts ADD COLUMN auto_create_ticket boolean NOT NULL DEFAULT false;
ALTER TABLE public.asset_maintenances ADD COLUMN auto_create_ticket boolean NOT NULL DEFAULT false;