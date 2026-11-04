
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS edit_token text;
ALTER TABLE public.endpoints ADD COLUMN IF NOT EXISTS edit_token text;

CREATE POLICY "Update pages with token"
ON public.pages FOR UPDATE
TO public
USING (edit_token IS NOT NULL AND edit_token = current_setting('request.headers', true)::json->>'x-edit-token')
WITH CHECK (edit_token IS NOT NULL AND edit_token = current_setting('request.headers', true)::json->>'x-edit-token');

CREATE POLICY "Update endpoints with token"
ON public.endpoints FOR UPDATE
TO public
USING (edit_token IS NOT NULL AND edit_token = current_setting('request.headers', true)::json->>'x-edit-token')
WITH CHECK (edit_token IS NOT NULL AND edit_token = current_setting('request.headers', true)::json->>'x-edit-token');
