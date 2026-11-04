import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, KeyRound, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { rewriteSiteLinks } from "@/lib/links.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addStoredItem, b64ToText, isTextType, loadStoredItems, mimeFor, randomSlug, textToB64,
  type SiteFiles, type StoredItem,
} from "@/lib/hosting";

const KEY_STORAGE = "gemini-api-key";
const MODEL_STORAGE = "gemini-model";
const MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash（高精度）" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash（速い）" },
] as const;
type ModelId = (typeof MODELS)[number]["id"];
type Mode = "improve" | "api" | "explain" | "links";

async function callGemini(model: string, key: string, prompt: string, json: boolean): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: json ? { responseMimeType: "application/json" } : {},
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? `エラー (${res.status})`;
    if (res.status === 400 || res.status === 403) throw new Error(`APIキーを確認してください: ${msg}`);
    if (res.status === 429) throw new Error("Geminiの利用上限に達しました。しばらく待ってから試してください");
    throw new Error(msg);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("AIから回答がありませんでした");
  return text;
}

type Loaded = { item: StoredItem; files: Record<string, string> };

async function loadContent(item: StoredItem): Promise<Loaded> {
  if (item.kind === "html") {
    const { data } = await supabase.from("pages").select("html").eq("slug", item.slug).single();
    return { item, files: { "index.html": data?.html ?? "" } };
  }
  if (item.kind === "api") {
    const { data } = await supabase.from("endpoints").select("body").eq("slug", item.slug).single();
    return { item, files: { response: data?.body ?? "" } };
  }
  const { data } = await supabase.from("sites").select("files").eq("slug", item.slug).single();
  const files: Record<string, string> = {};
  for (const [p, f] of Object.entries((data?.files ?? {}) as SiteFiles)) {
    if (isTextType(f.t)) files[p] = b64ToText(f.b);
  }
  return { item, files };
}

function filesToPrompt(files: Record<string, string>) {
  return Object.entries(files).map(([p, c]) => `--- ${p} ---\n${c}`).join("\n\n").slice(0, 400000);
}

export function AiTab() {
  const [key, setKey] = useState("");
  const [model, setModel] = useState<ModelId>(MODELS[0].id);
  const [mode, setMode] = useState<Mode>("improve");
  const [items, setItems] = useState<StoredItem[]>([]);
  const [target, setTarget] = useState("");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState<{ loaded: Loaded; changes: { path: string; content: string }[] } | null>(null);

  useEffect(() => {
    setKey(localStorage.getItem(KEY_STORAGE) ?? "");
    const saved = localStorage.getItem(MODEL_STORAGE) as ModelId | null;
    if (saved && MODELS.some((m) => m.id === saved)) setModel(saved);
    const load = () => setItems(loadStoredItems());
    load();
    window.addEventListener("published-items-changed", load);
    return () => window.removeEventListener("published-items-changed", load);
  }, []);

  const rewrite = useServerFn(rewriteSiteLinks);
  const targets = items.filter((i) =>
    mode === "improve" ? i.editToken && (i.kind === "html" || i.kind === "site")
    : mode === "links" ? i.editToken && i.kind === "site"
    : mode === "explain",
  );

  async function pickTarget(id: string) {
    setTarget(id);
    const item = items.find((i) => i.id === id);
    if (mode !== "links" || !item) return;
    const { data } = await supabase.from("sites").select("files").eq("slug", item.slug).single();
    const pages = Object.keys((data?.files ?? {}) as SiteFiles).filter((p) => /\.html?$/i.test(p));
    setInstruction(pages.map((p) => `${p} → /s/${item.slug}/${p === "index.html" ? "" : p.replace(/\.html?$/i, "")}`).join("\n"));
  }

  async function runLinks() {
    const item = items.find((i) => i.id === target);
    if (!item?.editToken) return toast.error("対象のサイトを選んでください");
    if (!instruction.trim()) return toast.error("新しいURL一覧を入力してください");
    setLoading(true);
    setAnswer("");
    try {
      const r = await rewrite({ data: { slug: item.slug, token: item.editToken, mapping: instruction, model } });
      if (!r.ok) return toast.error(r.error);
      setAnswer(r.changed.length ? `リンクを書き換えて保存しました\n${item.url}\n\n変更したページ: ${r.changed.join(", ")}` : "変更が必要なリンクは見つかりませんでした");
    } catch (e) {
      console.error(e);
      toast.error("書き換えに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    if (mode === "links") return runLinks();
    if (!key.trim()) return toast.error("Gemini APIキーを入力してください");
    localStorage.setItem(KEY_STORAGE, key.trim());
    localStorage.setItem(MODEL_STORAGE, model);
    setLoading(true);
    setAnswer("");
    setPending(null);
    try {
      if (mode === "api") {
        if (!instruction.trim()) throw new Error("作りたいAPIを入力してください");
        const text = await callGemini(model, key.trim(),
          `あなたはモックAPIの作成者です。次の要望に合うAPIレスポンスを作ってください。\n要望: ${instruction}\n` +
          `JSONで {"method":"GET|POST|PUT|DELETE|PATCH","content_type":"application/json など","status_code":200,"body":"レスポンス本文の文字列（100KB以内）","summary":"日本語での短い説明"} を返してください。`, true);
        const r = JSON.parse(text);
        const slug = randomSlug();
        const token = crypto.randomUUID();
        const method = ["GET", "POST", "PUT", "DELETE", "PATCH"].includes(r.method) ? r.method : "GET";
        const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 2);
        const status = Number(r.status_code) >= 100 && Number(r.status_code) <= 599 ? Number(r.status_code) : 200;
        const ct = typeof r.content_type === "string" ? r.content_type : "application/json";
        const { error } = await supabase.from("endpoints").insert({
          slug, method, body: body.slice(0, 100000), content_type: ct, status_code: status, edit_token: token,
        });
        if (error) throw new Error("APIの保存に失敗しました");
        const url = `${window.location.origin}/api/public/e/${slug}`;
        addStoredItem({ kind: "api", slug, url, title: r.summary?.slice(0, 80) || slug, editToken: token, meta: { method, contentType: ct, status } });
        setAnswer(`APIを作成しました\n${url}\n\n${r.summary ?? ""}\n\n${body.slice(0, 2000)}`);
        return;
      }

      const item = items.find((i) => i.id === target);
      if (!item) throw new Error("対象を選んでください");
      const loaded = await loadContent(item);

      if (mode === "explain") {
        const text = await callGemini(model, key.trim(),
          `次のコードを日本語で分かりやすく説明し、問題点と改善案を挙げてください。${instruction ? `\n特に知りたいこと: ${instruction}` : ""}\n\n${filesToPrompt(loaded.files)}`, false);
        setAnswer(text);
        return;
      }

      if (!instruction.trim()) throw new Error("どう改善したいか入力してください");
      const text = await callGemini(model, key.trim(),
        `あなたはWeb制作者です。次のサイトを要望どおりに改善してください。\n要望: ${instruction}\n\n${filesToPrompt(loaded.files)}\n\n` +
        `JSONで {"summary":"日本語での変更内容","files":[{"path":"ファイルパス","content":"変更後のファイル全文"}]} を返してください。変更したファイル（または新しいファイル）だけを含めてください。`, true);
      const r = JSON.parse(text);
      const changes = (Array.isArray(r.files) ? r.files : []).filter(
        (f: { path?: unknown; content?: unknown }) => typeof f.path === "string" && typeof f.content === "string",
      );
      if (changes.length === 0) throw new Error("変更内容がありませんでした");
      setPending({ loaded, changes });
      setAnswer(`${r.summary ?? ""}\n\n変更するファイル: ${changes.map((c: { path: string }) => c.path).join(", ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!pending) return;
    const { item } = pending.loaded;
    const token = item.editToken!;
    setLoading(true);
    try {
      if (item.kind === "html") {
        const html = pending.changes.find((c) => c.path === "index.html")?.content ?? pending.changes[0].content;
        const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.slice(0, 200) ?? item.title;
        const { data: ok, error } = await supabase.rpc("update_page", { _slug: item.slug, _token: token, _html: html, _title: title });
        if (error || !ok) throw error ?? new Error("update failed");
      } else {
        const { data } = await supabase.from("sites").select("files").eq("slug", item.slug).single();
        const files = { ...((data?.files ?? {}) as SiteFiles) };
        for (const c of pending.changes) {
          const p = c.path.replace(/^\/+/, "");
          files[p] = { t: files[p]?.t ?? mimeFor(p), b: textToB64(c.content) };
        }
        const { data: ok, error } = await supabase.rpc("update_site", { _slug: item.slug, _token: token, _files: files, _title: item.title });
        if (error || !ok) throw error ?? new Error("update failed");
      }
      toast.success("保存しました！URLを開いて確認してください");
      setPending(null);
      setAnswer((a) => `保存済み: ${item.url}\n\n${a}`);
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 bg-code px-4 py-3 text-code-foreground sm:px-5">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <Bot className="h-4 w-4 text-code-foreground/60" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
          Gemini Assistant
        </span>
        <span className="ml-auto hidden font-mono text-[11px] text-code-foreground/50 sm:block">BYOK — your key only</span>
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        {mode !== "links" && <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> Gemini API Key</Label>
          <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza..." className="font-mono" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            キーはこのブラウザだけに保存され、Googleに直接送られます。
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="ml-1 font-bold text-brand underline underline-offset-2">キーを取得する</a>
          </p>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Task — やりたいこと</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v as Mode); setTarget(""); setPending(null); setAnswer(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="improve">サイトを改善する</SelectItem>
                <SelectItem value="api">APIサーバーを作る</SelectItem>
                <SelectItem value="explain">コードを説明してもらう</SelectItem>
                <SelectItem value="links">ページ間リンクを新URLに書き換える</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode !== "api" && (
            <div className="space-y-1.5">
              <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Target — 対象</Label>
              <Select value={target} onValueChange={pickTarget}>
                <SelectTrigger><SelectValue placeholder={targets.length ? "選んでください" : "公開済みのものがありません"} /></SelectTrigger>
                <SelectContent>
                  {targets.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      [{i.kind === "site" ? "Zip" : i.kind === "html" ? "HTML" : "API"}] {i.title || i.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Model — 使うモデル</Label>
          <Select value={model} onValueChange={(v) => setModel(v as ModelId)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{mode === "links" ? "New URLs — 1行に「ファイル → 新URL」" : mode === "api" ? "Request — どんなAPIが欲しいですか？" : mode === "improve" ? "Request — どう改善したいですか？" : "Question — 特に知りたいこと（任意）"}</Label>
          <Textarea
            rows={mode === "links" ? 6 : 3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={mode === "api" ? "例: 日本の都道府県と人口の一覧を返すAPI" : mode === "improve" ? "例: スマホでも見やすくして、色をもっと明るくして" : "例: このJSは何をしていますか？"}
          />
        </div>
        <Button onClick={run} disabled={loading} size="lg" className="w-full gap-2">
          <Wand2 className="h-4 w-4" /> {loading ? "AIが考えています…" : "AIに頼む"}
        </Button>
        {answer && (
          <div className="whitespace-pre-wrap rounded-[16px] bg-code p-4 font-mono text-[13px] leading-relaxed text-code-foreground sm:p-5">{answer}</div>
        )}
        {pending && (
          <Button onClick={apply} disabled={loading} size="lg" className="w-full bg-brand text-brand-foreground hover:bg-foreground hover:text-background">
            この変更を保存する（公開中のURLに反映）
          </Button>
        )}
      </div>
    </Card>
  );
}
