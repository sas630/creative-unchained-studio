DROP POLICY IF EXISTS "profiles readable by all" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
CREATE POLICY "own profile readable" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);