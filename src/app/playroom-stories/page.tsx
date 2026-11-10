import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Playroom stories",
  description: "Illustrated story worlds imagined for shared toddler playrooms and residential play areas.",
  alternates: { canonical: "/playroom-stories" },
};

const stories = [
  { file: "01-great-puddle-race", title: "The Great Puddle Race", scene: "Paper boats set off through puddles while little friends cheer them on." },
  { file: "02-kite-catchers", title: "The Kite Catchers", scene: "A breezy afternoon becomes a small adventure when everyone helps rescue a kite." },
  { file: "03-lantern-walk", title: "The Lantern Walk", scene: "Handmade lanterns light the way through a garden at dusk." },
  { file: "04-giant-sandcastle", title: "The Giant Sandcastle", scene: "Many hands build one magnificent castle beside the sea." },
  { file: "05-backyard-campout", title: "The Backyard Campout", scene: "Blankets and bunting turn a familiar garden into a place to explore." },
  { file: "06-apple-orchard-picnic", title: "The Apple Orchard Picnic", scene: "Friends gather apples and settle down for a picnic beneath the branches." },
  { file: "07-snow-day", title: "The Snow Day", scene: "A winter hillside fills with snow angels, laughter and a new snowman." },
  { file: "08-little-gardeners", title: "The Little Gardeners", scene: "Seeds, watering cans and sunflowers bring a little garden to life." },
  { file: "09-moonlight-sleepover", title: "The Moonlight Sleepover", scene: "A blanket fort becomes the perfect place for one more bedtime story." },
  { file: "10-rainbow-chalk-street", title: "The Rainbow Chalk Street", scene: "Colourful chalk drawings grow across the courtyard as friends play together." },
  { file: "11-birthday-banner", title: "The Birthday Banner", scene: "Everyone lends a hand to make a garden celebration feel special." },
] as const;

export default function PlayroomStoriesPage() {
  return (
    <main>
      <section className="bg-wash py-14 md:py-20">
        <div className="container-x max-w-4xl text-center">
          <p className="caps text-slate">MimiPip playroom ideas</p>
          <h1 className="mt-3 text-4xl md:text-6xl">A wall full of stories to share</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate">
            Illustrated worlds imagined for community playrooms, clubhouses and shared children’s spaces.
            Each scene gives little ones something to notice, talk about and make their own.
          </p>
          <p className="mt-4 text-sm text-slate">Illustrative concepts. Final artwork is adapted to your wall and approved before production.</p>
        </div>
      </section>

      <section className="container-x py-12 md:py-20" aria-label="Playroom story designs">
        <div className="grid gap-10 md:grid-cols-2">
          {stories.map((story, index) => (
            <article key={story.file} className={index === 0 ? "md:col-span-2" : ""}>
              <div className="overflow-hidden rounded-[24px] bg-wash">
                <Image
                  src={`/playroom-stories/${story.file}.webp`}
                  alt={`${story.title}: ${story.scene}`}
                  width={1672}
                  height={941}
                  sizes={index === 0 ? "(max-width: 768px) 100vw, 90vw" : "(max-width: 768px) 100vw, 45vw"}
                  priority={index === 0}
                  className="h-auto w-full"
                />
              </div>
              <h2 className="mt-4 text-2xl">{story.title}</h2>
              <p className="mt-2 text-slate">{story.scene}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x pb-16 md:pb-24">
        <div className="rounded-[28px] bg-sage/40 px-6 py-10 text-center md:px-12">
          <h2 className="text-3xl">Bring a story into your playroom</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate">
            Tell us about your space and the stories you like. We can plan the composition around its walls, furniture and age group.
          </p>
          <Link href="/contact?question=playroom%20story%20wallpaper" className="btn mt-6 inline-flex px-6 py-3">
            Enquire about a playroom wall
          </Link>
        </div>
      </section>
    </main>
  );
}
