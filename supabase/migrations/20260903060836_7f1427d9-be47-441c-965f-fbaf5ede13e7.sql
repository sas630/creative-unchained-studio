ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_style text,
  ADD COLUMN IF NOT EXISTS voice_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_source_chat uuid,
  ADD COLUMN IF NOT EXISTS voice_source_label text,
  ADD COLUMN IF NOT EXISTS voice_trained_at timestamptz,
  ADD COLUMN IF NOT EXISTS voice_enabled boolean NOT NULL DEFAULT true;