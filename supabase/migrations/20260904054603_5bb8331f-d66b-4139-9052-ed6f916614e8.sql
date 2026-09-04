ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gemini_api_keys text,
  ADD COLUMN IF NOT EXISTS gemini_model text;