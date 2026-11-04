DROP POLICY IF EXISTS "Update pages with token" ON public.pages;
DROP POLICY IF EXISTS "Update endpoints with token" ON public.endpoints;
DROP POLICY IF EXISTS "Update sites with token" ON public.sites;
REVOKE UPDATE ON public.pages, public.endpoints, public.sites FROM anon, authenticated;

REVOKE SELECT ON public.pages, public.endpoints, public.sites FROM anon, authenticated;
GRANT SELECT (id, slug, html, title, created_at) ON public.pages TO anon, authenticated;
GRANT SELECT (id, slug, method, body, content_type, status_code, created_at) ON public.endpoints TO anon, authenticated;
GRANT SELECT (id, slug, title, files, created_at) ON public.sites TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_page(_slug text, _token text, _html text, _title text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF _token IS NULL OR char_length(_html) > 500000 THEN RETURN false; END IF;
  UPDATE public.pages SET html = _html, title = _title
   WHERE slug = _slug AND edit_token IS NOT NULL AND edit_token = _token;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.update_endpoint(_slug text, _token text, _method text, _body text, _content_type text, _status_code int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF _token IS NULL OR char_length(_body) > 100000 OR _status_code NOT BETWEEN 100 AND 599
     OR _method NOT IN ('GET','POST','PUT','DELETE','PATCH','OPTIONS') THEN RETURN false; END IF;
  UPDATE public.endpoints SET method = _method, body = _body, content_type = _content_type, status_code = _status_code
   WHERE slug = _slug AND edit_token IS NOT NULL AND edit_token = _token;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.update_site(_slug text, _token text, _files jsonb, _title text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF _token IS NULL OR pg_column_size(_files) > 12000000 THEN RETURN false; END IF;
  UPDATE public.sites SET files = _files, title = COALESCE(_title, title)
   WHERE slug = _slug AND edit_token IS NOT NULL AND edit_token = _token;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.check_site_token(_slug text, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sites WHERE slug = _slug AND edit_token IS NOT NULL AND edit_token = _token)
$$;

REVOKE ALL ON FUNCTION public.update_page(text,text,text,text), public.update_endpoint(text,text,text,text,text,int),
  public.update_site(text,text,jsonb,text), public.check_site_token(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_page(text,text,text,text), public.update_endpoint(text,text,text,text,text,int),
  public.update_site(text,text,jsonb,text), public.check_site_token(text,text) TO anon, authenticated, service_role;