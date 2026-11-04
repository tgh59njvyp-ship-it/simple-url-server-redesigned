import { createFileRoute } from "@tanstack/react-router";
import { serveSite } from "@/lib/serve-site";

export const Route = createFileRoute("/s/$slug/$")({
  server: { handlers: { GET: ({ request, params }) => serveSite(request, params.slug, params._splat) } },
});
