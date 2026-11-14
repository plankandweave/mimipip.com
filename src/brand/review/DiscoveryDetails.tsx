import type {Rec} from '../seo/site';
const words=(values:string[])=>values.map(s=>s.replace(/-/g,' ')).join(', ');
/** Customer-facing facts from the same editorial catalogue used by feeds. */
export function DiscoveryDetails({product:r}:{product:Rec}) {
 return <details className="my-5 rounded-lg border p-4"><summary>Colours, themes and room ideas</summary><dl className="mt-3 space-y-2">
 {Object.entries({'Design code':r.id,'Colours':words(r.color),'Themes':words(r.concept),'Room ideas':words(r.space),'Collection':words(r.collection)}).map(([label,value])=><div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}
 </dl></details>;
}
