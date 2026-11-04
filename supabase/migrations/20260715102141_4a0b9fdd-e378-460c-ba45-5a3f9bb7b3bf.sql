CREATE TABLE public.endpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL DEFAULT 'GET',
  body TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'application/json',
  status_code INT NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX endpoints_slug_idx ON public.endpoints(slug);
GRANT SELECT, INSERT ON public.endpoints TO anon;
GRANT SELECT, INSERT ON public.endpoints TO authenticated;
GRANT ALL ON public.endpoints TO service_role;
ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read endpoints" ON public.endpoints FOR SELECT USING (true);
CREATE POLICY "Anyone can create endpoints" ON public.endpoints FOR INSERT WITH CHECK (
  char_length(body) <= 100000
  AND status_code BETWEEN 100 AND 599
  AND method IN ('GET','POST','PUT','DELETE','PATCH','OPTIONS')
);