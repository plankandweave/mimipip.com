import Link from "next/link";
import Image from "@/components/SiteImage";
import { homecomingOfferActive } from "@/lib/homecoming-offer";

const KAMAL_BAGH_ROOM = "https://media.zyvorah.com/bagh/rooms/101-kamal-bagh-1.webp";

export function HomecomingOfferHero() {
  if (!homecomingOfferActive()) return null;

  return (
    <section className="homecoming-shell relative mx-4 mt-4 overflow-hidden rounded-[32px] bg-[#134f57] lg:mx-6">
      <div className="relative aspect-[4/5] min-h-[620px] overflow-hidden sm:aspect-[16/9] sm:min-h-0">
        <Image
          src={KAMAL_BAGH_ROOM}
          alt="Kamal Bagh wallpaper in a Diwali setting with lotus flowers, brass lamps and Ganesha"
          fill
          priority
          sizes="100vw"
          className="homecoming-art object-cover object-top"
        />
        <div className="homecoming-wash absolute inset-0 bg-[linear-gradient(90deg,rgba(13,69,77,.94)_0%,rgba(13,69,77,.84)_30%,rgba(13,69,77,.28)_62%,rgba(13,69,77,0)_100%)] max-sm:bg-[linear-gradient(180deg,rgba(13,69,77,.94)_0%,rgba(13,69,77,.8)_48%,rgba(13,69,77,.2)_78%,rgba(13,69,77,0)_100%)]" />
        <div className="container-x relative z-10 flex h-full max-w-none flex-col items-start justify-center py-12 text-[#fff9ef] sm:w-[58%] sm:py-10">
          <p className="homecoming-eyebrow text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[#e0b756] sm:text-xs">
            Kamal Bagh · Diwali 2026
          </p>
          <h1 className="homecoming-title mt-6 max-w-xl font-display text-[clamp(2.5rem,5vw,4.4rem)] leading-[1.03]">
            Bring Diwali home.
          </h1>
          <p className="homecoming-copy mt-5 max-w-lg text-base leading-relaxed text-[#fff9ef]/95 sm:text-xl">
            Free Express Delivery
          </p>
          <Link
            href="/collections/bagh"
            className="homecoming-cta mt-9 inline-flex min-h-11 items-center gap-3 border-b border-[#e0b756] pb-1 text-sm font-bold text-[#e0b756] sm:text-base"
          >
            Explore the Bagh collection <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

