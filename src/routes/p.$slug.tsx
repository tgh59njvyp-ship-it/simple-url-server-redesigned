import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/p/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );
        const { data, error } = await supabase
          .from("pages")
          .select("html")
          .eq("slug", params.slug)
          .maybeSingle();

        if (error || !data) {
          return new Response(
            `<!doctype html><meta charset="utf-8"><title>404</title><body style="font-family:sans-serif;padding:40px;text-align:center"><h1>404</h1><p>ページが見つかりません</p></body>`,
            { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }

        return new Response(data.html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=60",
          },
        });
      },
    },
  },
});
