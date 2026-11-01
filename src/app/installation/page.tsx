
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { TaashFilm } from "@/components/TaashFilm";
import { filmAspect, getSiteFilm, shapeOf } from "@/lib/site-films";
import { INSTALL_CITIES_LABEL, INSTALL_MIN_SQFT, INSTALL_RATE_LABEL } from "@/lib/pricing";

export const metadata: Metadata = editorialMetadata("/installation");

// The hanging film is whatever cleared Library film is filed with the link
// zyvorah.com/installation (page key 'installation'; src/lib/site-films.ts).
// Until one is live the section is simply absent. The publisher refreshes
// this path when a film goes live or comes down; the hour is the backstop.
export const revalidate = 3600;

  async function InstallationPage() {
  const film = await getSiteFilm("page", "installation");

  // Installation is quoted EX-GST in pricing.ts (₹35/sq ft) with GST added on
  // top — this page must show the GST-inclusive rate, computed here rather
  // than hard-coded, so a rate change upstream never leaves stale copy behind.

  return (
    <InfoPage
      eyebrow="Guide"
      title="Installation & care"
      intro="Your mural arrives as clearly-labelled drops, numbered in order, with a fitting guide in the box."
      sections={[
        {
          heading: "Before you start",
          body: "Check for damp, peeling paint or a rough surface before ordering a fitter. Let new plaster and paint cure fully; fill and sand dents, then clean and dry the wall. Arrange suitable wallpaper paste with your installer, plus a sharp blade, smoothing tool, plumb line and step ladder. If the wall condition or paste choice is uncertain, send us a wall photo before ordering.",
        },
        {
          heading: "How the seams meet",
          body: <><p>Your mural is divided into numbered, left-to-right drops. The fitter aligns the artwork at each adjacent edge, smooths from the centre and trims the excess at the skirting. A hairline join may remain visible close up depending on lighting and wall condition; view the wall from normal room distance as well.</p><div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-edge bg-charcoal/30" aria-label="Illustration of three numbered wallpaper panels meeting at two seams">{[1, 2, 3].map((n) => <div key={n} className="bg-wash px-3 py-8 text-center text-sm text-charcoal"><span className="block text-xs font-semibold">Panel {n}</span><span className="mt-2 block text-[0.65rem] text-slate">{n === 3 ? "Trim at edge" : "Align artwork at seam →"}</span></div>)}</div><p className="mt-2 text-xs">Panel layout illustration, not a photograph of a finished wall. Ask us for the panel layout of your design before ordering if seams matter to you.</p></>,
        },
        {
          heading: "Hanging (paste-the-wall)",
          body: "Soft Matte hangs paste-the-wall: roll paste directly onto the wall one drop-width at a time, then hang the dry drop onto it. Match the pattern along the seam, smooth from the centre outwards, and trim at skirting and sockets with a fresh blade. The material doesn't expand, so there's no soaking time when hanging.",
        },
        ...(film
          ? [
              {
                heading: "Watch it hung",
                body: (
                  <TaashFilm
                    src={film.src}
                    poster={film.poster}
                    title={film.title}
                    film={film}
                    style={filmAspect(film)}
                    className={`w-full rounded-[16px] ${shapeOf(film) === "tall" ? "mx-auto max-w-[340px]" : ""}`}
                  />
                ),
              },
            ]
          : []),
        {
          heading: "We can fit it for you",
          body: (
            <>
              <p>
                Prefer not to hang it yourself? Our own installers fit your mural in{" "}
                {INSTALL_CITIES_LABEL}, for {INSTALL_RATE_LABEL}, on orders from{" "}
                {INSTALL_MIN_SQFT} sq ft. Add it in Step 4 of the configurator when you order — it&apos;s
                billed with your wallpaper, at checkout, not paid to the fitter separately.
              </p>
              <p className="mt-2">
                Outside those cities, any local wallpaper fitter can hang it — see &ldquo;Anywhere
                else&rdquo; below.
              </p>
            </>
          ),
        },
        {
          heading: "Anywhere else: any local wallpaper fitter can hang it",
          body: (
            <>
              <p>
                Show your fitter the numbered drops and the fitting guide that comes in the box — the
                drop order and seam matching are marked on both.
              </p>
              <p className="mt-2">
                Tell them it&apos;s paste-the-wall (no soaking) and the panels are numbered left to
                right.
              </p>
            </>
          ),
        },
        {
          heading: "Care",
          body: "Once hung, wipe gently with a barely-damp cloth. Avoid harsh cleaners and scrubbing.",
        },
        {
          heading: "Removing it later",
          body: "Soft Matte wallpaper is intended for long-term installation. Removal generally requires dampening and peeling the wallpaper from the wall. Removed panels should not be expected to remain suitable for reuse.",
        },
      ]}
      cta={{ label: "How to measure", href: "/how-to-measure" }}
    />
  );
}

export default withBrandEditorial("/installation", InstallationPage);
