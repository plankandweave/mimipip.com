"use client";
import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type NewOrderForm from "@/app/partners/[slug]/new/form";
import PortalInstall from "@/components/partners/portal-install";
const NewOrder = lazy(() => import("@/app/partners/[slug]/new/form"));
const MeasuredOrder = lazy(() => import("@/app/partners/[slug]/site-batches/new/form"));
const Stores = lazy(() => import("@/app/partners/[slug]/stores/stores"));
const Team = lazy(() => import("@/app/partners/[slug]/team/team"));
const Settings = lazy(() => import("@/app/partners/[slug]/settings/settings"));
export type WorkspaceAccess = {
  canCreate: boolean; canManage: boolean; isAdmin: boolean; emailDomain: string;
  form: Omit<ComponentProps<typeof NewOrderForm>, "embedded" | "onPlaced"> | null;
};
const tabs = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "new", label: "Place an order", icon: "+" },
  { id: "documents", label: "Invoices & documents", icon: "▤" },
  { id: "stores", label: "Stores", icon: "⌂" },
  { id: "team", label: "Team", icon: "♧" },
  { id: "settings", label: "Account", icon: "⚙" },
] as const;
type Tab = typeof tabs[number]["id"];
const knownTab = (s: string): s is Tab => tabs.some(t => t.id === s);
export default function AccountWorkspace({ slug, accountName, email, access, dashboard, documents, query, setQuery, onPlaced }: {
  slug: string; accountName: string; email: string; access: WorkspaceAccess;
  dashboard: ReactNode; documents: ReactNode; query: string; setQuery: (q: string) => void; onPlaced: () => void;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [visited, setVisited] = useState<Tab[]>(["dashboard"]);
  const scrollPositions = useRef<Partial<Record<Tab, number>>>({});
  const currentTab = useRef<Tab>("dashboard");
  const [formVersion, setFormVersion] = useState(0);
  const [detail, setDetail] = useState<{url: string; title: string} | null>(null);
  // "Place an order" is two different jobs. A measured store (drawing PDF +
  // wall photographs) is the one the system does end to end — reads the
  // drawing, places the designs, composes and emails the proposal — so it is
  // the first choice for anyone allowed to release it (an account admin or
  // our staff). The single-wall form stays one tap away.
  const [orderKind, setOrderKind] = useState<"measured" | "single">(access.isAdmin ? "measured" : "single");
  function select(next: Tab, updateHistory = true) {
    if (next === "new" && !access.canCreate) next = "dashboard";
    scrollPositions.current[currentTab.current] = window.scrollY;
    currentTab.current = next;
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[next] ?? 0 }));
    setDetail(null); setTab(next); setVisited(v => v.includes(next) ? v : [...v, next]);
    if (updateHistory && location.hash !== `#${next}`) history.pushState(null, "", `#${next}`);
  }
  useEffect(() => {
    const resume = () => { const hash = location.hash.slice(1); select(knownTab(hash) ? hash : "dashboard", false); };
    resume(); window.addEventListener("popstate", resume); window.addEventListener("hashchange", resume);
    return () => { window.removeEventListener("popstate", resume); window.removeEventListener("hashchange", resume); };
    // Effective permissions are fixed for this server-rendered account session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visibleTabs = tabs.filter(t => t.id !== "new" || access.canCreate);
  return <div className="min-h-screen bg-[#FBFBFD] text-stone-800" onClickCapture={e => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(anchor.href, location.href);
    const prefix = `/partners/${slug}/`;
    if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) return;
    const part = url.pathname.slice(prefix.length);
    if (part === "library") return;
    const next = part === "orders" ? "dashboard" : part;
    if (knownTab(next)) { e.preventDefault(); e.stopPropagation(); select(next); }
    else if (/^(quote|site-batches)(\/|$)/.test(part)) { e.preventDefault(); e.stopPropagation(); setDetail({url: url.pathname + url.search, title: anchor.dataset.title || anchor.textContent?.trim() || "Order details"}); }
  }}>
    <div className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-md">
      <header className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3"><img src="/zyvorah-wordmark.svg" alt="Zyvorah" className="h-6 w-auto" /><div className="border-l border-stone-200 pl-3"><h1 className="text-sm font-semibold">{accountName}</h1><p className="mt-0.5 text-[11px] text-stone-400">Your account · {email}</p></div></div>
        <div className="flex items-center gap-4 text-xs"><PortalInstall /><a href={`/partners/${slug}/library`} className="font-semibold text-indigo-600">Design library ↗</a><button onClick={async () => { const r = await fetch("/api/corporate/logout", {method:"POST"}); if (r.ok) location.href = `/partners/${slug}`; }} className="text-stone-500">Sign out</button></div>
      </header>
      <nav aria-label="Account sections" className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3" role="tablist">
        {visibleTabs.map((t,i) => <button id={`tab-${t.id}`} key={t.id} role="tab" aria-selected={tab === t.id && !detail} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => select(t.id)} onKeyDown={e => {
          let next = i;
          if(e.key === "ArrowRight") next = (i+1)%visibleTabs.length;
          else if(e.key === "ArrowLeft") next = (i+visibleTabs.length-1)%visibleTabs.length;
          else if(e.key === "Home") next = 0;
          else if(e.key === "End") next = visibleTabs.length-1;
          else return;
          e.preventDefault(); select(visibleTabs[next].id); document.getElementById(`tab-${visibleTabs[next].id}`)?.focus();
        }} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === t.id && !detail ? "border-indigo-500 text-indigo-600" : "border-transparent text-stone-400 hover:text-stone-700"}`}><span aria-hidden="true" className="mr-2 inline-block align-middle">{t.id === "team" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/></svg> : t.icon}</span>{t.label}</button>)}
      </nav>
      {tab === "dashboard" && !detail && <div className="mx-auto max-w-[1600px] px-5 pb-3 pt-2"><input aria-label="Search account orders" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search orders — ZVY number, PO, store / city, invoice or POD…" className="w-full rounded-full border border-stone-200 bg-white px-5 py-3 text-sm outline-none focus:border-indigo-400" /></div>}
    </div>
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-5">
      {detail && <section><button onClick={() => setDetail(null)} className="mb-3 text-sm font-medium text-indigo-600">← Back to {tabs.find(t => t.id === tab)?.label}</button><h2 className="mb-3 text-lg font-semibold">{detail.title}</h2><iframe src={detail.url} title={detail.title} onLoad={e => {
        // Ancillary survey/sign-off screens share the same account. Their back
        // links return to this shell instead of opening a second shell inside it.
        e.currentTarget.contentDocument?.addEventListener("click", event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const anchor = (event.target as Element).closest("a");
          if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
          const url = new URL(anchor.href, location.href);
          if (url.origin !== location.origin || !url.pathname.startsWith(`/partners/${slug}/`)) return;
          const part = url.pathname.slice(`/partners/${slug}/`.length);
          const next = part === "orders" ? (knownTab(url.hash.slice(1)) ? url.hash.slice(1) as Tab : "dashboard") : part;
          if (knownTab(next)) { event.preventDefault(); event.stopPropagation(); select(next); }
          else if (part === "library") { event.preventDefault(); location.href = url.href; }
        }, true);
      }} className="h-[75vh] w-full rounded-xl border border-stone-200 bg-white" /></section>}
      {visibleTabs.map(t => <section key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={tab !== t.id || Boolean(detail)} tabIndex={0}>
        {visited.includes(t.id) && <Suspense fallback={<p className="p-6 text-sm text-stone-500">Loading {t.label.toLowerCase()}…</p>}>
          {t.id === "dashboard" ? dashboard : t.id === "documents" ? documents : t.id === "new" && access.form ? <div>
            {access.isAdmin && <div role="radiogroup" aria-label="What are you ordering?" className="mb-5 grid gap-3 sm:grid-cols-2">
              {([
                ["measured", "Measured store", "Upload the drawing PDF and the wall photographs. The system reads the drawing, places the designs, composes every wall and sends the proposal for approval."],
                ["single", "Single wall", "One design printed to one wall size, chosen and sized by hand."],
              ] as const).map(([kind, title, body]) => <button key={kind} type="button" role="radio" aria-checked={orderKind === kind} onClick={() => setOrderKind(kind)}
                className={`min-h-[44px] rounded-2xl border p-4 text-left transition-colors ${orderKind === kind ? "border-indigo-500 bg-indigo-50/60" : "border-stone-200 bg-white hover:border-stone-300"}`}>
                <span className="block text-sm font-semibold text-stone-900">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-stone-500">{body}</span>
              </button>)}
            </div>}
            {orderKind === "measured" && access.isAdmin
              ? <MeasuredOrder slug={slug} accountName={accountName} embedded />
              : <NewOrder key={formVersion} {...access.form} embedded onPlaced={() => { onPlaced(); scrollPositions.current.dashboard = 0; select("dashboard"); setFormVersion(v => v+1); }} />}
          </div> : t.id === "stores" ? <Stores slug={slug} accountName={accountName} isAdmin={access.isAdmin} embedded /> : t.id === "team" ? <Team slug={slug} accountName={accountName} email={email} emailDomain={access.emailDomain} canManage={access.canManage} embedded /> : t.id === "settings" ? <Settings slug={slug} accountName={accountName} isOwner={access.canManage} embedded /> : null}
        </Suspense>}
      </section>)}
    </div>
  </div>;
}
