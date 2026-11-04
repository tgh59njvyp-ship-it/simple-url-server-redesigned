CREATE TABLE public.pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  html TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pages_slug_idx ON public.pages(slug);
GRANT SELECT, INSERT ON public.pages TO anon;
GRANT SELECT, INSERT ON public.pages TO authenticated;
GRANT ALL ON public.pages TO service_role;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read pages" ON public.pages FOR SELECT USING (true);
CREATE POLICY "Anyone can create pages" ON public.pages FOR INSERT WITH CHECK (char_length(html) <= 500000);