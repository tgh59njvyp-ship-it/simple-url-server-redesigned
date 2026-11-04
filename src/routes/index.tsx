import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  Copy,
  ExternalLink,
  Rocket,
  Code2,
  Server,
  FileCode,
  Trash2,
  Pencil,
  X,
  FolderArchive,
  Bot,
  Check,
  Link2,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { ZipTab } from "@/components/hosting/ZipTab";
import { AiTab } from "@/components/hosting/AiTab";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HTMLホスト & APIサーバー — 貼るだけで公開URL" },
      {
        name: "description",
        content:
          "HTMLコードや擬似APIを貼り付けるだけで、共有可能なURLを一瞬で発行。サーバー不要、無料で使えるホスティングサービス。",
      },
      { property: "og:title", content: "HTMLホスト & APIサーバー — 貼るだけで公開URL" },
      {
        property: "og:description",
        content: "HTMLコードや擬似APIを貼り付けるだけで、共有可能なURLを一瞬で発行。サーバー不要、無料で使えるホスティングサービス。",
      },
    ],
  }),
  component: Index,
});

const SAMPLE_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>マイページ</title>
  <style>
    body { font-family: system-ui; text-align: center; padding: 72px 24px; background: #faf9f6; color: #1c1b17; }
    h1 { font-size: 2.6rem; letter-spacing: -0.02em; }
    h1 span { color: #f04e23; }
    p { color: #6b675e; }
  </style>
</head>
<body>
  <h1>こんにちは<span>.</span></h1>
  <p>貼るだけ公開で公開しました。</p>
</body>
</html>`;

const SAMPLE_JSON = `{
  "status": "ok",
  "message": "Hello from your API!",
  "items": [1, 2, 3]
}`;

const CONTENT_TYPES = [
  { value: "application/json", label: "JSON" },
  { value: "text/plain", label: "テキスト" },
  { value: "text/html", label: "HTML" },
  { value: "application/xml", label: "XML" },
  { value: "text/csv", label: "CSV" },
];

function randomSlug(len = 7) {
  const chars = "abcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// A helper client that attaches the edit token header for update requests.
function withEditToken(token: string) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: {
      headers: { "x-edit-token": token },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${SUPABASE_KEY}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", SUPABASE_KEY);
        headers.set("x-edit-token", token);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

type SavedItem = {
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

function loadItems(): SavedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedItem[]) : [];
  } catch {
    return [];
  }
}

function saveItems(items: SavedItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("published-items-changed"));
}

function useSavedItems() {
  const [items, setItems] = useState<SavedItem[]>([]);
  useEffect(() => {
    setItems(loadItems());
    const onChange = () => setItems(loadItems());
    window.addEventListener("published-items-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("published-items-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const add = useCallback((item: Omit<SavedItem, "id" | "createdAt">) => {
    const next: SavedItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now() };
    const existing = loadItems().filter((i) => !(i.kind === item.kind && i.slug === item.slug));
    saveItems([next, ...existing].slice(0, 100));
  }, []);
  const remove = useCallback((id: string) => {
    saveItems(loadItems().filter((i) => i.id !== id));
  }, []);
  const clear = useCallback(() => saveItems([]), []);
  return { items, add, remove, clear };
}

function requestEdit(item: SavedItem) {
  window.dispatchEvent(new CustomEvent("edit-saved-item", { detail: item }));
  const tab = item.kind === "html" ? "html" : item.kind === "site" ? "zip" : "api";
  window.dispatchEvent(new CustomEvent("switch-tab", { detail: tab }));
}

function SavedList() {
  const { items, remove, clear } = useSavedItems();
  if (items.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-foreground/25 px-6 py-10 text-center">
        <p className="text-sm font-bold">まだ何も公開していません</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          公開すると、自動的にここへ保存されます。
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {items.length} items — this browser only
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("履歴をすべて削除しますか？")) clear();
          }}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          すべて削除
        </Button>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-[20px] border bg-card">
      {items.map((item) => (
        <div key={item.id} className="p-4 transition-colors hover:bg-muted/40 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    item.kind !== "api"
                      ? "bg-foreground text-background"
                      : "bg-brand text-brand-foreground"
                  }`}
                >
                  {item.kind === "html" ? (
                    <FileCode className="h-3 w-3" />
                  ) : item.kind === "site" ? (
                    <FolderArchive className="h-3 w-3" />
                  ) : (
                    <Server className="h-3 w-3" />
                  )}
                  {item.kind === "html" ? "HTML" : item.kind === "site" ? "ZIP" : item.meta?.method ?? "API"}
                </span>
                <span className="truncate text-sm font-bold">{item.title || item.slug}</span>
                {item.editToken && (
                  <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    編集可
                  </span>
                )}
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 block truncate font-mono text-xs text-muted-foreground transition-colors hover:text-brand"
              >
                {item.url}
              </a>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.editToken && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestEdit(item)}
                  className="gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" /> 編集
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(item.url);
                  toast.success("URLをコピーしました");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(item.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}


function ResultCard({ url, mode }: { url: string; mode: "created" | "updated" }) {
  return (
    <div className="mt-4 rounded-[20px] bg-foreground p-5 text-background sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        <span className="text-sm font-black tracking-wide">
          {mode === "updated" ? "更新しました" : "公開しました"}
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-background/50">
          Live now
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={url}
          className="h-12 border-white/20 bg-white/10 font-mono text-sm text-background focus-visible:border-white/40 focus-visible:ring-white/20"
          onFocus={(e) => e.target.select()}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("URLをコピーしました");
            }}
            className="h-12 flex-1 gap-2 border-white/25 text-background hover:border-background hover:text-background sm:flex-none"
          >
            <Copy className="h-4 w-4" /> コピー
          </Button>
          <Button asChild className="h-12 flex-1 gap-2 bg-brand text-brand-foreground hover:bg-background hover:text-foreground sm:flex-none">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> 開く
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

type EditingState = { slug: string; token: string } | null;

function HtmlTab() {
  const [html, setHtml] = useState(SAMPLE_HTML);
  const [customSlug, setCustomSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState>(null);
  const { add } = useSavedItems();

  useEffect(() => {
    const handler = async (e: Event) => {
      const item = (e as CustomEvent<SavedItem>).detail;
      if (item.kind !== "html" || !item.editToken) return;
      const { data, error } = await supabase
        .from("pages")
        .select("html,slug")
        .eq("slug", item.slug)
        .maybeSingle();
      if (error || !data) {
        toast.error("読み込みに失敗しました");
        return;
      }
      setHtml(data.html);
      setCustomSlug(data.slug);
      setEditing({ slug: data.slug, token: item.editToken });
      setUrl(item.url);
      toast.success(`編集モード: /p/${data.slug}`);
    };
    window.addEventListener("edit-saved-item", handler);
    return () => window.removeEventListener("edit-saved-item", handler);
  }, []);

  function cancelEdit() {
    setEditing(null);
    setHtml(SAMPLE_HTML);
    setCustomSlug("");
    setUrl(null);
  }

  async function publish() {
    if (!html.trim()) return toast.error("HTMLを入力してください");
    setLoading(true);
    try {
      let title: string | null = null;
      const m = html.match(/<title>([^<]+)<\/title>/i);
      if (m) title = m[1].slice(0, 200);

      if (editing) {
        const { data: ok, error } = await supabase.rpc("update_page", {
          _slug: editing.slug, _token: editing.token, _html: html, _title: title ?? "",
        });
        if (error || !ok) {
          console.error(error);
          toast.error("更新に失敗しました");
          return;
        }
        const finalUrl = `${window.location.origin}/p/${editing.slug}`;
        setUrl(finalUrl);
        add({
          kind: "html",
          slug: editing.slug,
          url: finalUrl,
          title: title ?? editing.slug,
          editToken: editing.token,
        });
        toast.success("更新しました！");
        return;
      }

      const base = customSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      let slug = base || randomSlug();
      const editToken = crypto.randomUUID();

      let ok = false;
      for (let i = 0; i < 5; i++) {
        const { error } = await supabase
          .from("pages")
          .insert({ slug, html, title, edit_token: editToken });
        if (!error) {
          ok = true;
          break;
        }
        if (base) {
          toast.error("そのURL名は既に使われています");
          setLoading(false);
          return;
        }
        slug = randomSlug();
      }
      if (!ok) throw new Error("failed");
      const finalUrl = `${window.location.origin}/p/${slug}`;
      setUrl(finalUrl);
      add({ kind: "html", slug, url: finalUrl, title: title ?? slug, editToken });
      toast.success("公開しました！");

    } catch (e) {
      console.error(e);
      toast.error("公開に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 bg-code px-4 py-3 text-code-foreground sm:px-5">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <Code2 className="h-4 w-4 text-code-foreground/60" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
          index.html
        </span>
        {editing && (
          <span className="ml-1 rounded-full bg-brand px-2.5 py-0.5 font-mono text-[10px] font-semibold text-brand-foreground">
            EDITING /p/{editing.slug}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-code-foreground/50">
          {(html.length / 1024).toFixed(1)} / 500 KB
        </span>
      </div>
      <Textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        spellCheck={false}
        className="code-scroll min-h-[340px] resize-none rounded-none border-0 bg-code px-4 py-4 font-mono text-[13px] leading-relaxed text-code-foreground caret-[#f04e23] focus-visible:ring-0 sm:px-5"
      />
      <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-end sm:p-5">
        <div className="flex-1 space-y-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">URL name — 任意</Label>
          <div className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap font-mono text-sm font-medium text-muted-foreground">/p/</span>
            <Input
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              placeholder="my-page"
              className="font-mono"
              maxLength={40}
              disabled={!!editing}
            />
          </div>
        </div>
        {editing && (
          <Button variant="outline" onClick={cancelEdit} size="lg" className="gap-2">
            <X className="h-4 w-4" /> キャンセル
          </Button>
        )}
        <Button onClick={publish} disabled={loading} size="lg" className="gap-2">
          <Rocket className="h-4 w-4" />
          {loading ? (editing ? "更新中..." : "公開中...") : editing ? "更新する" : "公開する"}
        </Button>
      </div>
      {url && (
        <div className="p-4 pt-0">
          <ResultCard url={url} mode={editing ? "updated" : "created"} />
        </div>
      )}
    </Card>
  );
}

function ApiTab() {
  const [body, setBody] = useState(SAMPLE_JSON);
  const [contentType, setContentType] = useState("application/json");
  const [status, setStatus] = useState("200");
  const [method, setMethod] = useState("GET");
  const [customSlug, setCustomSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState>(null);
  const { add } = useSavedItems();

  useEffect(() => {
    const handler = async (e: Event) => {
      const item = (e as CustomEvent<SavedItem>).detail;
      if (item.kind !== "api" || !item.editToken) return;
      const { data, error } = await supabase
        .from("endpoints")
        .select("body,slug,method,content_type,status_code")
        .eq("slug", item.slug)
        .maybeSingle();
      if (error || !data) {
        toast.error("読み込みに失敗しました");
        return;
      }
      setBody(data.body);
      setMethod(data.method);
      setContentType(data.content_type);
      setStatus(String(data.status_code));
      setCustomSlug(data.slug);
      setEditing({ slug: data.slug, token: item.editToken });
      setUrl(item.url);
      toast.success(`編集モード: /api/public/e/${data.slug}`);
    };
    window.addEventListener("edit-saved-item", handler);
    return () => window.removeEventListener("edit-saved-item", handler);
  }, []);

  function cancelEdit() {
    setEditing(null);
    setBody(SAMPLE_JSON);
    setCustomSlug("");
    setUrl(null);
  }

  async function publish() {
    setLoading(true);
    try {
      const statusCode = parseInt(status, 10) || 200;

      if (editing) {
        const { data: ok, error } = await supabase.rpc("update_endpoint", {
          _slug: editing.slug, _token: editing.token, _method: method, _body: body,
          _content_type: contentType, _status_code: statusCode,
        });
        if (error || !ok) {
          console.error(error);
          toast.error("更新に失敗しました");
          return;
        }
        const finalUrl = `${window.location.origin}/api/public/e/${editing.slug}`;
        setUrl(finalUrl);
        add({
          kind: "api",
          slug: editing.slug,
          url: finalUrl,
          title: editing.slug,
          editToken: editing.token,
          meta: { method, contentType, status: statusCode },
        });
        toast.success("APIを更新しました！");
        return;
      }

      const base = customSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      let slug = base || randomSlug();
      const editToken = crypto.randomUUID();
      const payload = {
        body,
        content_type: contentType,
        status_code: statusCode,
        method,
        edit_token: editToken,
      };

      let ok = false;
      for (let i = 0; i < 5; i++) {
        const { error } = await supabase.from("endpoints").insert({ slug, ...payload });
        if (!error) {
          ok = true;
          break;
        }
        if (base) {
          toast.error("そのURL名は既に使われています");
          setLoading(false);
          return;
        }
        slug = randomSlug();
      }
      if (!ok) throw new Error("failed");
      const finalUrl = `${window.location.origin}/api/public/e/${slug}`;
      setUrl(finalUrl);
      add({
        kind: "api",
        slug,
        url: finalUrl,
        title: slug,
        editToken,
        meta: { method, contentType, status: statusCode },
      });
      toast.success("APIを公開しました！");

    } catch (e) {
      console.error(e);
      toast.error("公開に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 bg-code px-4 py-3 text-code-foreground sm:px-5">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <Server className="h-4 w-4 text-code-foreground/60" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
          Response body
        </span>
        {editing && (
          <span className="ml-1 rounded-full bg-brand px-2.5 py-0.5 font-mono text-[10px] font-semibold text-brand-foreground">
            EDITING {editing.slug}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-code-foreground/50">
          {(body.length / 1024).toFixed(1)} / 100 KB
        </span>
      </div>

      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-3 sm:p-5">
        <div className="space-y-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Content-Type</Label>
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Status code</Label>
          <Input
            value={status}
            onChange={(e) => setStatus(e.target.value.replace(/[^0-9]/g, ""))}
            maxLength={3}
            className="font-mono"
          />
        </div>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        spellCheck={false}
        className="code-scroll min-h-[240px] resize-none rounded-none border-0 bg-code px-4 py-4 font-mono text-[13px] leading-relaxed text-code-foreground caret-[#f04e23] focus-visible:ring-0 sm:px-5"
        placeholder='{"hello": "world"}'
      />

      <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-end sm:p-5">
        <div className="flex-1 space-y-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">URL name — 任意</Label>
          <div className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap font-mono text-sm font-medium text-muted-foreground">/api/public/e/</span>
            <Input
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              placeholder="my-api"
              className="font-mono"
              maxLength={40}
              disabled={!!editing}
            />
          </div>
        </div>
        {editing && (
          <Button variant="outline" onClick={cancelEdit} size="lg" className="gap-2">
            <X className="h-4 w-4" /> キャンセル
          </Button>
        )}
        <Button onClick={publish} disabled={loading} size="lg" className="gap-2">
          <Rocket className="h-4 w-4" />
          {loading ? (editing ? "更新中..." : "公開中...") : editing ? "APIを更新" : "APIを公開"}
        </Button>
      </div>
      {url && (
        <div className="p-4 pt-0">
          <ResultCard url={url} mode={editing ? "updated" : "created"} />
        </div>
      )}
    </Card>
  );
}

function Index() {
  const [tab, setTab] = useState("html");

  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      setTab(t);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("switch-tab", handler);
    return () => window.removeEventListener("switch-tab", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" />

      {/* Nav */}
      <div className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <a href="#" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-foreground text-background">
              <Link2 className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="font-mono text-[13px] font-semibold tracking-[0.08em]">
              SIMPLE URL SERVER
            </span>
          </a>
          <nav className="ml-auto hidden items-center gap-6 text-[13px] font-bold text-muted-foreground sm:flex">
            <a href="#history" className="transition-colors hover:text-foreground">履歴</a>
            <a href="#howto" className="transition-colors hover:text-foreground">使い方</a>
            <a href="#faq" className="transition-colors hover:text-foreground">よくある質問</a>
          </nav>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-bold sm:ml-0">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            無料・登録不要
          </span>
        </div>
      </div>

      {/* Hero */}
      <header className="bg-blueprint border-b border-border">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pb-14 sm:pt-20">
          <p className="flex items-center gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span className="h-px w-8 bg-brand" />
            Paste — Publish — Share
          </p>
          <h1 className="mt-5 text-[44px] font-black leading-[1.08] tracking-tight sm:text-[76px]">
            貼るだけで、
            <br />
            世界に<span className="text-brand">公開</span>。
          </h1>
          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
              HTMLページ、ZIPサイト、擬似APIを、その場で共有URLに。
              サーバーもアカウントもいりません。作って、貼って、押すだけ。
            </p>
            <dl className="flex shrink-0 divide-x divide-border font-mono">
              <div className="pr-5">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Modes</dt>
                <dd className="mt-1 text-xl font-semibold">04</dd>
              </div>
              <div className="px-5">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Sign-up</dt>
                <dd className="mt-1 text-xl font-semibold">なし</dd>
              </div>
              <div className="pl-5">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Price</dt>
                <dd className="mt-1 text-xl font-semibold">¥0</dd>
              </div>
            </dl>
          </div>

          {/* Mode index */}
          <div className="mt-10 grid grid-cols-2 border-t border-foreground/70 lg:grid-cols-4">
            {[
              { n: "01", t: "HTMLページ", d: "HTMLコードを貼って公開", v: "html" },
              { n: "02", t: "ZIPサイト", d: "サイトをまるごとアップ", v: "zip" },
              { n: "03", t: "モックAPI", d: "固定レスポンスを返すAPI", v: "api" },
              { n: "04", t: "AIアシスタント", d: "Geminiで改善・生成・説明", v: "ai" },
            ].map((m) => (
              <button
                key={m.n}
                onClick={() => setTab(m.v)}
                className="group border-b border-border px-1 py-4 text-left transition-colors hover:bg-card sm:px-3 lg:border-b-0"
              >
                <span className={`font-mono text-[11px] font-semibold tracking-[0.14em] ${tab === m.v ? "text-brand" : "text-muted-foreground"}`}>
                  {m.n}
                </span>
                <span className="mt-1.5 flex items-center gap-1 text-sm font-black">
                  {m.t}
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{m.d}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:px-6 sm:py-14">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="html" className="gap-2">
              <FileCode className="h-4 w-4" /> HTML
            </TabsTrigger>
            <TabsTrigger value="zip" className="gap-2">
              <FolderArchive className="h-4 w-4" /> ZIP
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2">
              <Server className="h-4 w-4" /> API
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Bot className="h-4 w-4" /> AI
            </TabsTrigger>
          </TabsList>
          <TabsContent value="html" className="mt-6">
            <HtmlTab />
          </TabsContent>
          <TabsContent value="zip" className="mt-6" forceMount hidden={tab !== "zip"}>
            <ZipTab />
          </TabsContent>
          <TabsContent value="api" className="mt-6">
            <ApiTab />
          </TabsContent>
          <TabsContent value="ai" className="mt-6">
            <AiTab />
          </TabsContent>
        </Tabs>

        {/* Saved history */}
        <section id="history" className="scroll-mt-20">
          <div className="mb-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
              01 — History
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">保存された公開URL</h2>
          </div>
          <SavedList />
        </section>

        {/* Instructions */}
        <section id="howto" className="scroll-mt-20">
          <div className="mb-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
              02 — How to use
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">使い方</h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-[20px] border bg-border md:grid-cols-2">
            {[
              {
                icon: FileCode, n: "01", t: "HTMLページ", path: "/p/xxx", note: "CSS・JavaScript埋め込み可。最大500KB。",
                steps: ["HTMLタブにコードを貼る", "URL名を指定（任意。空欄なら自動生成）", "「公開する」を押してURLをシェア", "履歴の「編集」で後から差し替え可能"],
              },
              {
                icon: FolderArchive, n: "02", t: "ZIPサイト", path: "/s/xxx", note: "合計8MBまで。ページごとのURLも変更できます。",
                steps: ["ZIP・ファイル・フォルダを選ぶ", "index.html がトップページになります", "「公開する」を押してURLをシェア", "履歴の「編集」でファイルを上書き可能"],
              },
              {
                icon: Server, n: "03", t: "モックAPI", path: "/api/public/e/xxx", note: "CORS対応済み。最大100KB。",
                steps: ["レスポンスボディ（JSON等）を入力", "メソッド・Content-Type・ステータスを選択", "「APIを公開」して fetch で呼び出す", "履歴の「編集」でレスポンスを更新可能"],
              },
              {
                icon: Bot, n: "04", t: "AIアシスタント", path: "Gemini", note: "APIキーはこのブラウザだけに保存されます。",
                steps: ["Gemini APIキーを入力", "やりたいことと対象を選ぶ", "指示を書いて「AIに頼む」", "改善案は確認してから保存を押す"],
              },
            ].map((g) => (
              <div key={g.n} className="bg-card p-5 sm:p-6">
                <div className="flex items-center gap-2.5">
                  <g.icon className="h-4.5 w-4.5 text-brand" />
                  <h3 className="font-black">{g.t}</h3>
                  <code className="ml-auto font-mono text-[11px] text-muted-foreground">{g.path}</code>
                </div>
                <ol className="mt-4">
                  {g.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 border-t border-border py-2.5 text-sm text-muted-foreground first:border-t-0 first:pt-0">
                      <span className="font-mono text-[11px] font-semibold leading-5 text-brand">{String(i + 1).padStart(2, "0")}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-muted-foreground">{g.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <div className="mb-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
              03 — FAQ
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">よくある質問</h2>
          </div>
          <div className="border-t border-foreground/70">
            {[
              {
                q: "公開後に内容を変更できますか？",
                a: "はい。同じブラウザで作成したものは「保存された公開URL」の「編集」ボタンから差し替えできます。編集キーはこのブラウザに保存されているため、別ブラウザからは編集できません。",
              },
              {
                q: "動的なサーバー処理はできますか？",
                a: "APIはモックとして固定のレスポンスを返します。フロントエンドの開発やテスト用途に最適です。HTMLページ内のJavaScriptはそのまま動きます。",
              },
              {
                q: "有効期限はありますか？",
                a: "特にありません。URLを知っている人だけがアクセスできます。",
              },
              {
                q: "料金はかかりますか？",
                a: "かかりません。登録も不要です。AI機能だけ、ご自身のGemini APIキーが必要です（キーはブラウザ内にのみ保存されます）。",
              },
            ].map((f) => (
              <details key={f.q} className="group border-b border-border">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[15px] font-bold marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Plus className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:text-brand" />
                </summary>
                <p className="pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-foreground text-background">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="whitespace-nowrap text-[26px] font-black tracking-tight sm:text-4xl">
            貼るだけで、世界に公開<span className="text-brand">。</span>
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 pt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-background/50">
            <span>Simple URL Server</span>
            <span>/p/ — Pages</span>
            <span>/s/ — Sites</span>
            <span>/api/ — Mock API</span>
            <span className="ml-auto normal-case tracking-normal">HTMLホスト & APIサーバー</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
