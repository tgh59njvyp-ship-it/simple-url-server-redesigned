import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash"] as const;

const Input = z.object({
  slug: z.string().min(1).max(100),
  token: z.string().min(10).max(100),
  mapping: z.string().min(1).max(10000),
  model: z.enum(MODELS).optional(),
});

export const rewriteSiteLinks = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { streamText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai/gateway.server");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AIの設定が見つかりません" };

    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const db = createClient(process.env.SUPABASE_URL!, key, {
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

    const { data: allowed } = await db.rpc("check_site_token", { _slug: data.slug, _token: data.token });
    const { data: site } = allowed
      ? await db.from("sites").select("files").eq("slug", data.slug).maybeSingle()
      : { data: null };
    if (!site) {
      return { ok: false as const, error: "このサイトを編集する権限がありません" };
    }

    const files = { ...(site.files as Record<string, { t: string; b: string }>) };
    const htmlPaths = Object.keys(files).filter((p) => /\.html?$/i.test(p)).slice(0, 30);
    const fileList = Object.keys(files).join("\n");
    const gateway = createLovableAiGatewayProvider(apiKey, undefined, {
      baseURL: "https://ai.gateway.lovable.dev/v1",
    });

    const changed: string[] = [];
    for (const path of htmlPaths) {
      const html = Buffer.from(files[path].b, "base64").toString("utf8");
      if (html.length > 200000) continue;
      try {
        const result = streamText({
          model: gateway(`google/${data.model ?? "gemini-3.8-flash"}`),
          system:
            "You rewrite links between pages of a static website. Change ONLY href/src/action attributes and JavaScript location strings that point to other pages of this site, so they use the new URLs given by the site owner. Keep everything else byte-for-byte identical. Leave external links, CSS, images and scripts unchanged. Output ONLY the full HTML, no explanations, no code fences.",
          prompt: `Site URL base: /s/${data.slug}/\nCurrent file being edited: ${path}\n\nAll files in the site:\n${fileList}\n\nNew page URL list from the site owner:\n${data.mapping}\n\nHTML:\n${html}`,
        });
        let out = (await result.text).trim();
        out = out.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
        if (out && out !== html.trim() && /<\/?[a-z]/i.test(out)) {
          files[path] = { t: files[path].t, b: Buffer.from(out, "utf8").toString("base64") };
          changed.push(path);
        }
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        console.error("rewrite failed", path, e);
        if (status === 402) return { ok: false as const, error: "AIのクレジットが不足しています" };
        if (status === 429) return { ok: false as const, error: "混み合っています。少し待ってからお試しください" };
        return { ok: false as const, error: "AIでの書き換えに失敗しました" };
      }
    }

    if (changed.length) {
      const { data: ok, error } = await db.rpc("update_site", { _slug: data.slug, _token: data.token, _files: files, _title: null as unknown as string });
      if (error || !ok) return { ok: false as const, error: "保存に失敗しました" };
    }
    return { ok: true as const, changed };
  });
