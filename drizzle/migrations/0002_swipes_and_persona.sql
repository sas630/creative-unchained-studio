ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS alternatives jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_persona text;