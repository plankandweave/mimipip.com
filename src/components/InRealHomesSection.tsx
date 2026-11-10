import Link from "next/link";

const rooms = [
  {id:"BR01",title:"A little rainbow overhead",detail:"Rainbow Hooray · Ceiling border",alt:"Rainbow border along the ceiling of a compact nursery"},
  {id:"BR02",title:"Colour at their own height",detail:"Up Up Balloon Club · Middle border",alt:"Colourful balloon border across the wall of an everyday nursery"},
  {id:"BR21",title:"Happy little finishing touches",detail:"Fruit Loop Rainbows · Skirting border",alt:"Bright fruit and rainbow border near the floor of a child’s bedroom"},
];

export function InRealHomesSection(){
  return <section id="in-real-homes" style={{scrollMarginTop:150}} aria-labelledby="real-homes-heading" className="mx-4 my-10 rounded-[32px] bg-[#fff4df] px-5 py-10 md:px-10 md:py-14 lg:mx-6 lg:px-12">
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#b94a26]">Little rooms. Lots of personality.</p><h2 id="real-homes-heading" className="text-3xl md:text-4xl lg:text-5xl">In real homes</h2><p className="mt-4 max-w-lg text-base leading-relaxed md:text-lg">A rainbow above the cot. Balloons beside the bed. A little colour can make their everyday space feel like their very own world.</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/nursery-worlds/" className="inline-flex w-fit shrink-0 items-center gap-4 rounded-full bg-[#714414] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5c3512] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#714414]">Explore nursery worlds <span aria-hidden="true">↗</span></Link><Link href="/in-real-homes/" className="inline-flex w-fit shrink-0 items-center gap-4 rounded-full bg-[#ff542b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#b83b1d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#714414]">Explore all 21 rooms <span aria-hidden="true">↗</span></Link></div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">{rooms.map(room=><Link key={room.id} href="/in-real-homes/" className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#714414]" aria-label={room.title+" — explore the room gallery"}><figure><div className="overflow-hidden rounded-2xl"><img src={'/in-real-homes/'+room.id+'.webp'} alt={room.alt} width={1536} height={1024} loading="lazy" className="aspect-[3/2] w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.025]"/></div><figcaption className="pt-4"><h3 className="text-xl">{room.title}</h3><p className="mt-1 text-sm opacity-75">{room.detail}</p></figcaption></figure></Link>)}</div>
      <Link href="/nursery-worlds/" className="group mt-10 grid overflow-hidden rounded-[28px] bg-white md:grid-cols-[1.4fr_1fr] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#714414]"><img src="/nursery-worlds/01-little-fox-orchard-room-v2.webp" alt="Little Fox Orchard wallpaper in a warm baby nursery" width={1536} height={1024} loading="lazy" className="aspect-[3/2] h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.02]"/><div className="flex flex-col justify-center p-7 md:p-10"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b94a26]">Eleven gentle wallpaper worlds</p><h3 className="mt-3 text-3xl md:text-4xl">A little world to come home to</h3><p className="mt-4 text-base leading-relaxed">See each design in a cozy nursery, then discover the artwork behind the room.</p><span className="mt-6 text-sm font-semibold text-[#b94a26]">Explore the nursery worlds ↗</span></div></Link>
      <p className="mt-7 text-xs opacity-60">Illustrative room settings, not customer photographs.</p>
    </div>
  </section>;
}
