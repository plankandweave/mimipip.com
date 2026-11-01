"use client";
import { Fragment, useState, type ReactNode } from "react";
import { ORDER_LANES, documentsForOrder, groupBoardOrders, type BoardOrder, type BoardDocument, type OrderLane } from "@/lib/partner-order-board";

/** The journey cards, light to dark cobalt; white text clears 4.5:1 on every one. */
const LANE_COBALT = ["#3B68D9", "#2B55C2", "#1F43A8", "#16368F"];
const milestones = ["Rendering", "Pending printing", "Printing complete", "Awaiting pickup", "Dispatched", "Delivered"];
export default function OrderBoard({ rows, documents, renderDetails, openDocument, query, loading, error, refresh, updatedAt }: {
  rows: BoardOrder[]; documents: BoardDocument[]; renderDetails: (row: BoardOrder) => ReactNode;
  openDocument: (d: BoardDocument) => void; query: string; loading: boolean;
  error: string | null; refresh: () => void; updatedAt: string | null;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [closed, setClosed] = useState<OrderLane[]>(["archive"]);
  const groups = groupBoardOrders(rows, query, documents);
  const counts = groupBoardOrders(rows).reduce((all, g) => ({ ...all, [g.lane]: (all[g.lane] ?? 0) + 1 }), {} as Record<OrderLane, number>);
  const toggleLane = (id: OrderLane) => setClosed(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
      <p>Orders move through these stages as production updates them.</p>
      <div className="flex items-center gap-3"><span role="status">{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</span><button onClick={refresh} className="font-semibold text-indigo-600">Refresh</button></div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error} <button onClick={refresh} className="underline">Try again</button></p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Order journey">
      {ORDER_LANES.map((lane, i) => <button key={lane.id} onClick={() => { setClosed(v => v.filter(x => x !== lane.id)); document.getElementById(`lane-${lane.id}`)?.scrollIntoView({ block: "start", behavior: "auto" }); }} style={{ backgroundColor: LANE_COBALT[i] }} className="group rounded-2xl p-4 text-left text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F43A8]">
        <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{lane.title}</span>{i < ORDER_LANES.length - 1 ? <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform group-hover:translate-x-0.5"><path d="M4 12h15M13 6l6 6-6 6"/></svg> : <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 12.5l5 5L20 6.5"/></svg>}</div>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{loading && !rows.length ? "—" : counts[lane.id] ?? 0}</p><p className="mt-1 text-xs text-white/80">{lane.description}</p>
      </button>)}
    </div>
    {loading && !rows.length ? <p className="py-10 text-center text-sm text-stone-500">Loading your orders…</p> : <>
      {query && <p className="text-sm text-stone-500">{groups.length} matching order {groups.length === 1 ? "group" : "groups"} · includes archived orders</p>}
      {ORDER_LANES.map(lane => {
        const laneGroups = groups.filter(g => g.lane === lane.id);
        const open = Boolean(query) || !closed.includes(lane.id);
        return <section id={`lane-${lane.id}`} key={lane.id} className="scroll-mt-48 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <button onClick={() => toggleLane(lane.id)} aria-expanded={open} aria-controls={`lane-content-${lane.id}`} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
            <span className={`text-sm font-semibold ${lane.id === "waiting" ? "text-amber-700" : lane.id === "production" ? "text-indigo-600" : lane.id === "dispatch" ? "text-emerald-700" : "text-stone-600"}`}><span aria-hidden="true">{open ? "⌄" : "›"}</span> <span className="ml-2">{lane.title}</span></span>
            <span className="text-xs text-stone-500">{laneGroups.length} {laneGroups.length === 1 ? "order" : "orders"} · {laneGroups.reduce((n,g) => n+g.items.length,0)} {laneGroups.reduce((n,g) => n+g.items.length,0) === 1 ? "wall" : "walls"}</span>
          </button>
          <div id={`lane-content-${lane.id}`} hidden={!open}>
            {!laneGroups.length ? <p className="border-t border-stone-100 px-5 py-5 text-sm text-stone-400">{lane.id === "archive" ? "Completed orders will be kept here with their documents." : "No orders at this stage."}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
              <colgroup><col style={{width:"34%"}}/><col style={{width:"15%"}}/><col style={{width:"21%"}}/><col style={{width:"17%"}}/><col style={{width:"13%"}}/></colgroup><thead className="border-y border-stone-100 bg-stone-50 text-[10px] uppercase tracking-widest text-stone-400"><tr><th className="px-5 py-3">Order / wall</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Dispatch / POD</th><th className="px-4 py-3">Documents</th></tr></thead>
              <tbody>{laneGroups.map(group => <Fragment key={group.key}>
                {group.items.length > 1 && <tr className="border-b border-stone-100 bg-indigo-50/40"><th colSpan={5} className="px-5 py-2 text-xs font-medium text-indigo-700">{group.items[0].po ? `PO ${group.items[0].po}` : `Order group · ${group.items[0].ref}`} · {group.items.length} walls{group.items.some(o => o.stage === "Dispatched" || o.stage === "Delivered" || o.dispatchedAt) && group.lane !== "archive" ? " · Partly dispatched" : ""}</th></tr>}
                {group.items.map(row => { const isOpen = expanded.includes(row.key); const docs = documentsForOrder(row, documents); const step = milestones.indexOf(row.stage); return <Fragment key={row.key}>
                  <tr className="border-b border-stone-100 align-top hover:bg-stone-50/70">
                    <td className="max-w-[300px] px-5 py-4"><button aria-expanded={isOpen} aria-controls={`order-detail-${row.key}`} onClick={() => setExpanded(v => isOpen ? v.filter(k => k !== row.key) : [...v,row.key])} className="flex gap-2 text-left font-semibold text-stone-800"><span aria-hidden="true" className="text-indigo-500">{isOpen ? "⌄" : "›"}</span>{row.imageUrl && <img src={row.imageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border border-stone-100 object-cover" />}<span>{row.ref}<span className="mt-1 block text-xs font-normal text-stone-500">{row.name}</span></span></button><p className="ml-5 mt-1 text-[11px] text-stone-400">{[row.po ? `PO ${row.po}` : null,row.location].filter(Boolean).join(" · ")}</p></td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-stone-600">{row.width && row.height ? `${row.width} × ${row.height} mm` : "—"}</td>
                    <td className="max-w-[230px] px-4 py-4"><p className={`text-xs font-medium ${row.attention ? "text-amber-700" : "text-stone-700"}`}>{row.stage}</p>{step >= 0 && <div className="mt-2 flex items-center gap-1" aria-label={`Production stage ${step+1} of ${milestones.length}: ${row.stage}`}>{milestones.map((m,i) => <span title={m} key={m} className={`h-1.5 w-5 rounded-full ${i <= step ? "bg-indigo-500" : "bg-stone-200"}`} />)}</div>}{row.attention && <p className="mt-1 text-[11px] text-amber-700">{row.attention}</p>}</td>
                    <td className="px-4 py-4 text-xs"><p className="text-stone-600">{row.courier ?? (row.dispatchedAt ? "Dispatched" : "—")}</p>{row.pod && <p className="mt-1 font-mono font-semibold">{row.pod}</p>}{row.trackingUrl && <a href={row.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-indigo-600 underline">Track shipment ↗</a>}{row.dispatchedAt && <p className="mt-1 text-stone-400">{new Date(row.dispatchedAt).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"})}</p>}</td>
                    <td className="px-4 py-4 text-xs">{docs.length ? <button onClick={() => openDocument(docs[0])} className="text-left font-medium text-indigo-600 underline">{docs[0].number}{docs.length > 1 ? ` +${docs.length-1}` : ""}</button> : <span className="text-stone-400">—</span>}<button onClick={() => setExpanded(v => isOpen ? v.filter(k => k !== row.key) : [...v,row.key])} className="mt-2 block text-stone-500 underline">{isOpen ? "Close details" : "View details"}</button></td>
                  </tr>
                  {isOpen && <tr id={`order-detail-${row.key}`}><td colSpan={5} className="border-b border-stone-200 bg-stone-50 p-4">{renderDetails(row)}{docs.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{docs.map(d => <button key={d.id} onClick={() => openDocument(d)} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-indigo-600">{d.kind === "tax" ? "Tax invoice" : d.kind === "proforma" ? "Proforma" : "Quotation"} · {d.number}</button>)}</div>}</td></tr>}
                </Fragment>; })}
              </Fragment>)}</tbody>
            </table></div>}
          </div>
        </section>;
      })}
    </>}
  </div>;
}
