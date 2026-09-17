ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS local_base_url text,
  ADD COLUMN IF NOT EXISTS local_model text,
  ADD COLUMN IF NOT EXISTS local_api_key text,
  ADD COLUMN IF NOT EXISTS local_enabled boolean NOT NULL DEFAULT false;