import type { Metadata } from "next";
import Link from "next/link";
import { FindSimilarButton } from "@/components/NotFoundActions";

export const metadata: Metadata = { title: "The wall took a different turn" };

export default function NotFound() {
  return (
    <section className="container-x py-6 sm:py-10">
      <div className="relative isolate grid min-h-[min(680px,72vh)] overflow-hidden rounded-[32px] bg-wash px-6 py-10 sm:px-12 sm:py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:items-center lg:gap-10 lg:px-20">
        <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-lavender/70 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 -z-10 h-80 w-80 rounded-full bg-peach/70 blur-3xl" aria-hidden="true" />

        <div className="relative z-10 max-w-xl">
          <span className="caps text-mist">404 · a little wayfinding</span>
          <h1 className="mt-5 max-w-lg text-[clamp(2.8rem,7vw,6rem)] leading-[0.94]">
            The wall took a different turn.
          </h1>
          <p className="mt-7 max-w-md text-[1.02rem] leading-8 text-slate">
            The design you were looking for has slipped behind another door. It
            may have moved, been renamed, or simply be waiting for a new story.
          </p>
          <p className="mt-4 max-w-md font-display text-lg font-semibold text-charcoal">
            Good rooms are found by following the feeling.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="https://zyvorah.com/concepts" className="btn">
              Shop complete looks
            </Link>
            <FindSimilarButton />
          </div>
        </div>

        <div className="relative mt-10 min-h-[340px] lg:mt-0" aria-label="A quiet wall waiting for its next story">
          <div className="absolute inset-x-[8%] top-[8%] h-[78%] rounded-[24px] border border-white/80 bg-cloud shadow-[0_24px_70px_rgba(15,15,15,0.08)]" />
          <div className="absolute left-[16%] top-[17%] h-[28%] w-[29%] rounded-[16px] bg-sage shadow-sm transition-transform duration-500 hover:-translate-y-1" />
          <div className="absolute right-[16%] top-[17%] h-[28%] w-[29%] rounded-[16px] bg-blush shadow-sm transition-transform duration-500 hover:-translate-y-1" />
          <div className="absolute bottom-[17%] left-[16%] h-[28%] w-[29%] rounded-[16px] bg-sky shadow-sm transition-transform duration-500 hover:-translate-y-1" />
          <div className="absolute bottom-[17%] right-[16%] h-[28%] w-[29%] rounded-[16px] bg-peach shadow-sm transition-transform duration-500 hover:-translate-y-1" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-[clamp(5rem,15vw,10rem)] font-extrabold tracking-[-0.1em] text-charcoal/10">404</span>
          </div>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-edge bg-surface/90 px-4 py-2 text-xs font-semibold text-slate shadow-sm">
            There is always another wall.
          </span>
        </div>

        <div className="relative z-10 mt-12 grid gap-3 border-t border-charcoal/10 pt-6 sm:grid-cols-2 lg:col-span-2 lg:mt-4 lg:grid-cols-3">
          <Link href="https://zyvorah.com/collections/wall-art" className="group rounded-2xl bg-surface/70 p-5 transition-colors hover:bg-surface">
            <span className="caps text-mist">Start somewhere</span>
            <span className="mt-2 block font-display text-lg font-bold group-hover:underline group-hover:underline-offset-4">Explore all wallpapers →</span>
          </Link>
          <Link href="https://zyvorah.com/design-with" className="group rounded-2xl bg-surface/70 p-5 transition-colors hover:bg-surface">
            <span className="caps text-mist">Make it yours</span>
            <span className="mt-2 block font-display text-lg font-bold group-hover:underline group-hover:underline-offset-4">Ask the Zyvorah Curator →</span>
          </Link>
          <Link href="https://zyvorah.com/real-estate" className="group rounded-2xl bg-surface/70 p-5 transition-colors hover:bg-surface">
            <span className="caps text-mist">Find a bigger story</span>
            <span className="mt-2 block font-display text-lg font-bold group-hover:underline group-hover:underline-offset-4">Explore spaces →</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
