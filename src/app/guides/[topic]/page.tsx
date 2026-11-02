import Link from "next/link";
import { notFound } from "next/navigation";
import { guides } from "@/brand/review/guides";

type Props = { params: Promise<{topic: string}> };
export async function generateMetadata({params}: Props) {
  const guide = guides[(await params).topic];
  return { title: guide?.[0] ?? "Shopping help" };
}
export default async function Guide({params}: Props) {
  const {topic} = await params;
  const guide = guides[topic];
  if (!guide) notFound();
  return <article className="container-x max-w-3xl py-12">
    <h1>{guide[0]}</h1>
    {guide[1].map(line => <p key={line} className="my-5 leading-relaxed">{line}</p>)}
    {topic === "trade" && <nav aria-label="Buyer collections" className="my-6 grid gap-3">
      {[
        ["Browse all designs", "/browse/collection"],
        ["Wallpaper worlds", "/browse/collection?value=wallpaper-worlds"],
        ["Wall borders", "/browse/collection?value=mimi-borders"],
        ["Floor games", "/floor-games"],
        ["Bathroom characters", "/browse/collection?value=bathroom-buddies"],
        ["Stair stickers", "/browse/collection?value=little-steps-big-adventures"],
      ].map(([name, href]) => <Link className="underline" key={href} href={href}>{name}</Link>)}
    </nav>}
    {(topic === "contact" || topic === "trade") && <p className="my-5"><a className="underline" href="mailto:hello@mimipip.com">hello@mimipip.com</a></p>}
    {topic === "contact" && <Link className="underline" href="/trade">Retail buyers and marketplace teams</Link>}
    {topic === "tools" && <Link className="underline" href="/products/colour-create-bunny-garden">Try the wall and room previews with Bunny Garden</Link>}
    <nav aria-label="Explore and plan" className="mt-8 flex flex-wrap gap-5">
      <Link href="/browse/age?value=baby">Nursery designs</Link>
      <Link href="/browse/age?value=toddler">Toddler designs</Link>
      <Link href="/browse/color">Shop by Color</Link><Link href="/browse/concept">Shop by Concept</Link>
      <Link href="/how-to-measure">Measuring guide</Link><Link href="/materials">Surfaces</Link>
      <Link href="/installation">Installation</Link><Link href="/wishlist">Saved designs</Link>
    </nav>
  </article>;
}
