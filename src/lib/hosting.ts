import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SiteFiles = Record<string, { t: string; b: string }>;

export type StoredItem = {
  id: string;
  kind: "html" | "api" | "site";
  slug: string;
  url: string;
  title: string;
  createdAt: number;
  editToken?: string;
  meta?: { method?: string; contentType?: string; status?: number };
};

const STORAGE_KEY = "published-items-v1";

export function loadStoredItems(): StoredItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addStoredItem(item: Omit<StoredItem, "id" | "createdAt">) {
  const next: StoredItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now() };
  const rest = loadStoredItems().filter((i) => !(i.kind === item.kind && i.slug === item.slug));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...rest].slice(0, 100)));
  window.dispatchEvent(new Event("published-items-changed"));
}

export function randomSlug(len = 7) {
  const chars = "abcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function editClient(token: string) {
  const URL_ = import.meta.env.VITE_SUPABASE_URL;
  const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return createClient<Database>(URL_, KEY, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${KEY}`) headers.delete("Authorization");
        headers.set("apikey", KEY);
        headers.set("x-edit-token", token);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  mp3: "audio/mpeg", mp4: "video/mp4", xml: "application/xml", csv: "text/csv",
};

export function mimeFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

export function isTextType(t: string) {
  return /^text\/|json|xml|svg|javascript/.test(t);
}

export function b64ToText(b: string) {
  const bin = atob(b);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function textToB64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function siteUrl(slug: string) {
  return `${window.location.origin}/s/${slug}/`;
}
