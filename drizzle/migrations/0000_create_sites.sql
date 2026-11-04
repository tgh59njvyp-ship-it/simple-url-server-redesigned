CREATE TABLE public.sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  files JSONB NOT NULL DEFAULT '{}'::jsonb,
  edit_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sites TO anon;
GRANT SELECT, INSERT, UPDATE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read sites" ON public.sites FOR SELECT USING (true);
CREATE POLICY "Anyone can create sites" ON public.sites FOR INSERT WITH CHECK (pg_column_size(files) <= 12000000);
CREATE POLICY "Update sites with token" ON public.sites FOR UPDATE TO public
USING (edit_token IS NOT NULL AND edit_token = current_setting('request.headers', true)::json->>'x-edit-token')
WITH CHECK (edit_token IS NOT NULL AND edit_token = current_setting('request.headers', true)::json->>'x-edit-token' AND pg_column_size(files) <= 12000000);
GRANT UPDATE ON public.pages TO anon, authenticated;
GRANT UPDATE ON public.endpoints TO anon, authenticated;