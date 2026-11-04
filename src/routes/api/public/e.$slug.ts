import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

async function handle({ params }: { params: { slug: string } }) {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supabase = createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data, error } = await supabase
    .from("endpoints")
    .select("body, content_type, status_code")
    .eq("slug", params.slug)
    .maybeSingle();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json", ...CORS },
    });
  }

  return new Response(data.body, {
    status: data.status_code,
    headers: { "content-type": data.content_type, ...CORS },
  });
}

export const Route = createFileRoute("/api/public/e/$slug")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: handle,
      POST: handle,
      PUT: handle,
      DELETE: handle,
      PATCH: handle,
    },
  },
});
