
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getSignatureDesigns } from "@/lib/queries";

export const metadata: Metadata = editorialMetadata("/founders-note");

// Author-supplied copy — keep verbatim.
const OPENING = [
  "I have always believed that walls are never just walls.",
  "They are the largest canvas in a room. They hold the light, surround the furniture, frame the people within them—and quietly determine how a space makes us feel.",
  "I have always had an extraordinary love for walls. When I walk into a room, I instinctively notice them first. I imagine what they could become: a sweeping landscape, an intricate garden, a quiet wash of colour, an Indian story retold in a more contemporary language, or a mural that makes you pause every single time you see it.",
  "That love is what became Zyvorah.",
];

const MAGIC = {
  heading: "The magic of wallpaper",
  paras: [
    "To me, wallpaper is one of the most magical elements in design.",
    "A room may already have beautiful furniture, lovely fabrics and carefully chosen objects, yet still feel as though something is missing. Then the right wallpaper arrives—and suddenly, everything belongs together.",
    "It can make an ordinary bedroom feel deeply personal. It can give a child's room wonder without making it childish. It can turn a dining room into a place where evenings feel more special. It can bring softness to an office, imagination to a restaurant and identity to a hotel or café.",
    "Sometimes it changes the entire character of a space. Sometimes it simply gives the room the final layer it was waiting for.",
    "That is the beauty of it. Wallpaper does not merely sit on a wall. It changes the way the whole room is experienced.",
  ],
};

const PHILOSOPHY: { heading: string; paras: string[] }[] = [
  {
    heading: "I love the possibilities",
    paras: [
      "I love that a wall can become almost anything.",
      "It can open into a misty forest, a painted garden or an imagined landscape. It can carry birds, botanicals, geometry, architecture, abstraction or art. It can be expressive and dramatic, or so quiet that its beauty reveals itself only slowly.",
      "I love murals because they allow a wall to tell a larger story. Unlike a repeated pattern, a mural has movement, composition and a sense of arrival. It can draw the eye across the room, create depth where there was none and turn a blank surface into something unforgettable.",
      "I also love the smaller decisions: the exact scale of a flower, the position of a tree, the balance of an empty area, the way one colour speaks to the upholstery, and whether a design should command attention or simply make the room feel complete.",
      "These details matter enormously to me. The same artwork can feel entirely different depending on how it is placed on the wall. That is why I never think of wallpaper as something chosen separately from the space. The wall, the room, the light, the furniture and the people living there must all be part of the decision.",
    ],
  },
  {
    heading: "Why I created Zyvorah",
    paras: [
      "I created Zyvorah because choosing wallpaper should feel inspiring—not confusing or intimidating.",
      "People often know what they want to feel, but they may not know what to search for. They may say, “I want the room to feel calmer,” or “I love this fabric, but I don't know what wallpaper will go with it,” or “I want something Indian, but not traditional.” They may have saved hundreds of images and still be unable to choose one.",
      "I understand that completely.",
      "Zyvorah was created to help people move from that feeling to the right wall.",
      "You can begin with a room, a photograph, a colour, an idea or simply a mood. You can ask Zyvorah to help you find what belongs. You can see designs in your own space, change their scale, position the artwork and understand the exact price for your wall before ordering.",
      "Technology makes this possible, but the purpose is deeply human: to help you recognise the wall that feels like yours.",
    ],
  },
  {
    heading: "Designed around your wall",
    paras: [
      "I have never believed that a beautiful mural should be forced into a standard size.",
      "Every wall is different. Its width, height, furniture placement, doors, windows and sightlines are different. The composition must respond to the actual space.",
      "At Zyvorah, the wallpaper is prepared around your wall—not the other way around.",
      "You can choose the dimensions, review the crop and decide exactly how the artwork should sit. A face should not disappear behind a cupboard. The most beautiful part of a tree should not be cut away. The focal point should land where it makes sense in the room.",
      "That attention to composition is not a technical detail. It is the difference between putting an image on a wall and creating a wall that feels considered.",
    ],
  },
];

const VISION: { heading: string; paras: string[] }[] = [
  {
    heading: "For every kind of space",
    paras: [
      "My love for wallpaper has never been limited to homes.",
      "I see walls everywhere: in restaurants waiting for an identity, offices that need warmth, cafés that could become memorable, hotel corridors that could tell a story, clinics that could feel calmer, stores that could create a world of their own, and children's spaces that could invite curiosity and imagination.",
      "Wherever there is a wall, there is an opportunity to create feeling.",
      "Wallpaper can make a space quieter, richer, brighter, more intimate, more imaginative or more alive. It can be the hero of the room or the beautiful thread that brings everything else together.",
    ],
  },
  {
    heading: "My promise to you",
    paras: [
      "I want Zyvorah to offer more than an enormous catalogue of attractive images.",
      "I want it to help you choose well.",
      "I want you to understand what will work in your room, how it will look on your wall, what it will cost and what you will receive. I want the experience to feel personal even when you complete it entirely on your own.",
      "Most of all, I want the wallpaper you choose to continue giving you joy long after it has been installed.",
      "Because the right wall does something almost impossible to explain. It changes the atmosphere without changing the architecture. It can make an old space feel new, a large room feel intimate, a simple room feel complete and an everyday corner feel like somewhere you want to stay.",
      "That is the magic I have always loved.",
      "And that is the magic I hope you find at Zyvorah.",
    ],
  },
];

// A designed placeholder for a personal photograph not yet supplied — a stone
// panel carrying a line from the story, so the layout reads as intentional
// (never a broken/empty image box). Swap for Roheena's real portrait when ready.
function PortraitSlot({ quote, className = "" }: { quote: string; className?: string }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-[24px] bg-gradient-to-br from-wash via-blush/40 to-peach/40 p-8 ${className}`}>
      <p className="max-w-[16rem] text-center font-display text-lg font-medium leading-snug text-charcoal/70">
        &ldquo;{quote}&rdquo;
      </p>
    </div>
  );
}

  async function FoundersNotePage() {
  // Genuine Zyvorah design imagery (installed scenes / patterns) for the visual
  // pauses — never stock or process photos.
  const pics = (await getSignatureDesigns(8)).filter((p) => p.image);
  const mural = pics[0];
  const strip = pics.slice(1, 4);

  return (
    <div className="pb-8">
      {/* 1 · opening portrait + heading */}
      <section className="container-x pt-12">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <span className="caps text-slate">A Note from Our Founder</span>
            <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.3rem)] leading-[1.08]">
              I have always believed that walls are never just walls.
            </h1>
            <p className="mt-5 font-display text-base font-semibold text-charcoal">Roheena</p>
            <p className="text-sm text-slate">Founder, Zyvorah</p>
          </div>
          <PortraitSlot quote="I imagine what a wall could become." className="aspect-[4/5] w-full" />
        </div>
      </section>

      {/* 2 · opening text */}
      <section className="container-x pt-12">
        <div className="mx-auto max-w-2xl space-y-4 text-[1.02rem] leading-relaxed text-slate">
          {OPENING.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="mx-auto mt-10 max-w-2xl">
          <h2 className="font-display text-2xl font-bold text-charcoal lg:text-[1.7rem]">{MAGIC.heading}</h2>
          <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-slate">
            {MAGIC.paras.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {/* 3 · mural pause — shown whole, matted, never cropped */}
      {mural?.image && (
        <section className="container-x pt-14">
          <div className="relative mx-auto aspect-square w-full max-w-2xl overflow-hidden rounded-[28px] bg-wash">
            <Image src={mural.image} alt="" fill sizes="(max-width:768px) 100vw, 42rem" className="object-contain" />
          </div>
        </section>
      )}

      {/* 4 · the founder's philosophy — narrow, readable column */}
      <section className="container-x pt-14">
        <div className="mx-auto max-w-2xl space-y-12">
          {PHILOSOPHY.map((s) => (
            <div key={s.heading}>
              <h2 className="font-display text-2xl font-bold text-charcoal lg:text-[1.7rem]">{s.heading}</h2>
              <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-slate">
                {s.paras.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5 · editorial image strip — each design shown whole, matted, never cropped */}
      {strip.length > 0 && (
        <section className="container-x pt-14">
          <div className="grid gap-4 sm:grid-cols-3">
            {strip.map((p) => (
              <div key={p.handle} className="relative aspect-square overflow-hidden rounded-[22px] bg-wash">
                {p.image && <Image src={p.image} alt="" fill sizes="(max-width:640px) 100vw, 22rem" className="object-contain" />}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6 · the broader vision */}
      <section className="container-x pt-14">
        <div className="mx-auto max-w-2xl space-y-12">
          {VISION.map((s) => (
            <div key={s.heading}>
              <h2 className="font-display text-2xl font-bold text-charcoal lg:text-[1.7rem]">{s.heading}</h2>
              <div className="mt-4 space-y-4 text-[1.02rem] leading-relaxed text-slate">
                {s.paras.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7 · signature */}
      <section className="container-x pt-12">
        <div className="mx-auto max-w-2xl border-t border-edge pt-8">
          <p className="text-slate">With love,</p>
          <p className="mt-1 font-display text-xl font-bold text-charcoal">Roheena</p>
          <p className="text-sm text-slate">Founder, Zyvorah</p>
        </div>
      </section>

      {/* 8 · shopping transition — never a dead end */}
      <section className="container-x pt-12">
        <div className="pastel-section mx-auto max-w-2xl bg-sage/30 text-center">
          <h2 className="text-2xl font-semibold lg:text-3xl">Let&apos;s find the wall that feels like yours.</h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/design-with" className="btn">Find My Wallpaper</Link>
            <Link href="/see-it-in-my-room" className="btn btn-ghost">See It in My Room</Link>
          </div>
          <Link href="/collections/wall-art" className="mt-4 inline-block text-sm font-semibold text-slate underline underline-offset-4 hover:text-charcoal">
            Explore all wallpapers
          </Link>
        </div>
      </section>
    </div>
  );
}

export default withBrandEditorial("/founders-note", FoundersNotePage);
