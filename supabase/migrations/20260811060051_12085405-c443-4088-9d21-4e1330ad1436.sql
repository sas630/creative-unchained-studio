ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS openrouter_api_key text,
  ADD COLUMN IF NOT EXISTS openrouter_model text;