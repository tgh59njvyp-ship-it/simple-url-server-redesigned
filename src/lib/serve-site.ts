import { createClient } from "@supabase/supabase-js";

type Files = Record<string, { t: string; b: string }>;

export async function serveSite(request: Request, slug: string, splat: string | undefined) {
  const reqUrl = new URL(request.url);
  if (!splat && !reqUrl.pathname.endsWith("/")) {
    return Response.redirect(`${reqUrl.origin}${reqUrl.pathname}/${reqUrl.search}`, 301);
  }
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supabase = createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await supabase.from("sites").select("files").eq("slug", slug).maybeSingle();
  if (!data) return new Response("Site not found", { status: 404 });
  const files = data.files as Files;
  let path = decodeURIComponent(splat ?? "").replace(/^\/+/, "");
  if (path === "" || path.endsWith("/")) path += "index.html";
  const clean = path.replace(/\/+$/, "");
  const f = files[path] ?? files[`${clean}/index.html`] ?? files[`${clean}.html`];
  if (!f) return new Response("File not found", { status: 404 });
  const bin = atob(f.b);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { "content-type": f.t, "access-control-allow-origin": "*" } });
}
