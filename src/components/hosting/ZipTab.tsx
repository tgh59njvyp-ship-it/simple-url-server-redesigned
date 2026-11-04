import { useEffect, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { Upload, FolderArchive, Copy, ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addStoredItem, mimeFor, randomSlug, siteUrl, type SiteFiles, type StoredItem,
} from "@/lib/hosting";

const MAX_BYTES = 8 * 1024 * 1024;

async function readZip(file: File): Promise<SiteFiles> {
  const zip = await JSZip.loadAsync(file);
  const entries = (Object.values(zip.files) as JSZip.JSZipObject[]).filter(
    (f) => !f.dir && !f.name.startsWith("__MACOSX/") && !f.name.split("/").pop()!.startsWith("."),
  );
  const out: SiteFiles = {};
  for (const e of entries) out[e.name] = { t: mimeFor(e.name), b: await e.async("base64") };
  return out;
}

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function normalize(out: SiteFiles): SiteFiles {
  const names = Object.keys(out);
  if (out["index.html"]) return out;
  const idx = names.filter((n) => n.endsWith("index.html")).sort((a, b) => a.length - b.length)[0];
  if (idx) {
    const prefix = idx.slice(0, -"index.html".length);
    const stripped: SiteFiles = {};
    for (const n of names) if (n.startsWith(prefix)) stripped[n.slice(prefix.length)] = out[n];
    return stripped;
  }
  // Strip a shared top folder, then use the only HTML file as the top page.
  const top = names[0]?.split("/")[0];
  let res = out;
  if (names.length && names.every((n) => n.includes("/") && n.split("/")[0] === top)) {
    res = {};
    for (const n of names) res[n.slice(top.length + 1)] = out[n];
  }
  const htmls = Object.keys(res).filter((n) => /\.html?$/i.test(n));
  if (htmls.length === 1) res = { ...res, "index.html": res[htmls[0]] };
  return res;
}

export function ZipTab() {
  const [files, setFiles] = useState<SiteFiles | null>(null);
  const [fileName, setFileName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ slug: string; token: string } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<StoredItem>).detail;
      if (item.kind !== "site" || !item.editToken) return;
      setEditing({ slug: item.slug, token: item.editToken });
      setCustomSlug(item.slug);
      setUrl(item.url);
      setFiles(null);
      toast.success("新しいファイルを選ぶと、このサイトを上書きします");
    };
    window.addEventListener("edit-saved-item", handler);
    return () => window.removeEventListener("edit-saved-item", handler);
  }, []);

  async function onPick(list?: FileList | null) {
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) return;
    const total = picked.reduce((s, f) => s + f.size, 0);
    if (total > MAX_BYTES) return toast.error("合計8MB以下にしてください");
    try {
      let out: SiteFiles = {};
      for (const file of picked) {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const base = rel.split("/").pop()!;
        if (base.startsWith(".")) continue;
        if (/\.zip$/i.test(file.name)) {
          out = { ...out, ...(await readZip(file)) };
        } else {
          out[rel] = { t: mimeFor(rel), b: await fileToB64(file) };
        }
      }
      const f = normalize(out);
      if (Object.keys(f).length === 0) return toast.error("ファイルが見つかりませんでした");
      if (!f["index.html"]) toast.warning("index.html が見つかりません。トップページが表示されない可能性があります");
      setFiles(f);
      setFileName(picked.length === 1 ? picked[0].name : `${picked.length}個のファイル`);
    } catch {
      toast.error("ファイルを読み込めませんでした");
    }
  }

  function renamePage(oldPath: string, input: string) {
    if (!files) return;
    const clean = input.trim().replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9\-_/]/g, "");
    const next = clean === "" ? "index.html" : `${clean}.html`;
    if (next === oldPath) return;
    if (files[next]) return toast.error("そのURLは既に使われています");
    const copy: SiteFiles = {};
    for (const [k, v] of Object.entries(files)) copy[k === oldPath ? next : k] = v;
    setFiles(copy);
    toast.success(`/${clean} に変更しました（公開/上書き保存で反映）`);
  }

  async function publish() {
    if (!files) return toast.error("ファイルを選んでください");
    setLoading(true);
    try {
      const title = fileName.replace(/\.zip$/i, "");
      if (editing) {
        const { data: ok, error } = await supabase.rpc("update_site", {
          _slug: editing.slug, _token: editing.token, _files: files, _title: title,
        });
        if (error || !ok) throw error ?? new Error("update failed");
        const u = siteUrl(editing.slug);
        setUrl(u);
        addStoredItem({ kind: "site", slug: editing.slug, url: u, title, editToken: editing.token });
        toast.success("更新しました！");
        return;
      }
      const base = customSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      let slug = base || randomSlug();
      const token = crypto.randomUUID();
      let ok = false;
      for (let i = 0; i < 5; i++) {
        const { error } = await supabase.from("sites").insert({ slug, files, title, edit_token: token });
        if (!error) { ok = true; break; }
        if (base) { toast.error("そのURL名は既に使われています"); return; }
        slug = randomSlug();
      }
      if (!ok) throw new Error("failed");
      const u = siteUrl(slug);
      setUrl(u);
      addStoredItem({ kind: "site", slug, url: u, title, editToken: token });
      toast.success("公開しました！");
    } catch (e) {
      console.error(e);
      toast.error("公開に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const names = files ? Object.keys(files).sort() : [];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 bg-code px-4 py-3 text-code-foreground sm:px-5">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <FolderArchive className="h-4 w-4 text-code-foreground/60" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
          {editing ? `Editing — ${editing.slug}` : "Site upload"}
        </span>
        {editing && (
          <Button variant="ghost" size="sm" className="ml-auto gap-1 text-code-foreground hover:bg-white/10 hover:text-code-foreground" onClick={() => { setEditing(null); setFiles(null); setUrl(null); setCustomSlug(""); }}>
            <X className="h-3.5 w-3.5" /> 編集をやめる
          </Button>
        )}
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className={`flex flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed p-8 text-center transition-colors ${files ? "border-brand/50 bg-brand/[0.04]" : "border-foreground/25 bg-muted/30"}`}>
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${files ? "bg-brand text-brand-foreground" : "bg-foreground text-background"}`}>
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-bold">{fileName || "Zip・ファイル・フォルダを選択"}</span>
          <span className="max-w-sm text-xs leading-relaxed text-muted-foreground">index.html・CSS・JS・画像など（合計8MBまで）。HTMLが1つだけならトップページになります</span>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">Zipを選ぶ<input type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => onPick(e.target.files)} /></label>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">ファイル<input type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} /></label>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">フォルダ<input type="file" className="hidden" {...({ webkitdirectory: "", directory: "" } as object)} onChange={(e) => onPick(e.target.files)} /></label>
            </Button>
          </div>
        </div>
        {names.length > 0 && (
          <div className="space-y-2">
            <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Page URLs — 各ページのURL</Label>
            {names.filter((n) => /\.html?$/i.test(n)).map((n) => {
              const shown = n === "index.html" ? "" : n.replace(/(\/index)?\.html?$/i, "");
              const slug = editing?.slug || customSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "（URL名）";
              return (
                <div key={n} className="flex items-center gap-1 rounded-xl border border-border bg-card p-1.5 pl-3 text-xs">
                  <span className="shrink-0 font-mono text-muted-foreground">/s/{slug}/</span>
                  <Input
                    defaultValue={shown}
                    placeholder="（トップページ）"
                    className="h-9 border-0 bg-muted/50 font-mono text-xs focus-visible:ring-0"
                    onBlur={(e) => renamePage(n, e.target.value)}
                  />
                </div>
              );
            })}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-1 font-bold hover:text-foreground">すべてのファイル（{names.length}）</summary>
              <div className="mt-1 max-h-40 overflow-auto rounded-xl bg-code p-3.5 font-mono leading-relaxed text-code-foreground">
                {names.map((n) => <div key={n}>{n}</div>)}
              </div>
            </details>
          </div>
        )}
        {!editing && (
          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">URL name — 任意</Label>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap font-mono text-sm font-medium text-muted-foreground">/s/</span>
              <Input value={customSlug} onChange={(e) => setCustomSlug(e.target.value)} placeholder="my-site" className="font-mono" />
            </div>
          </div>
        )}
        <Button onClick={publish} disabled={loading || !files} size="lg" className="w-full">
          {loading ? "アップロード中…" : editing ? "上書き保存" : "公開する"}
        </Button>
        {url && (
          <div className="flex items-center gap-2 rounded-[16px] bg-foreground p-3 pl-4 text-background">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate font-mono text-sm">{url}</a>
            <Button size="sm" variant="outline" className="border-white/25 text-background hover:border-background hover:text-background" onClick={() => { navigator.clipboard.writeText(url); toast.success("コピーしました"); }}><Copy className="h-3.5 w-3.5" /></Button>
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-background hover:text-foreground" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
          </div>
        )}
      </div>
    </Card>
  );
}
