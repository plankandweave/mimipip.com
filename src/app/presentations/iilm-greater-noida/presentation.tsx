import "server-only";

import { Reveal, type Quad } from "./reveal";
import { AccessGate } from "./access-gate";

const asset = (name: string) => `/api/presentations/iilm-greater-noida/${name}`;

const concepts = [
  {
    number: "01",
    id: "worlds",
    title: "Worlds in Progress",
    kicker: "Science, design and possibility in motion",
    introduction: "A lively world of things being made: a human hand and a robotic hand tend a living experiment while biology, space, climate, architecture and sound unfold around them. It gives modern fields of study a human, curious and imaginative face.",
    artwork: "worlds-flat.jpg",
    vertical: "worlds-vertical.jpg",
    alt: "Opaque Worlds in Progress artwork panel proposed on the sheltered IILM brick corridor",
    rationale: ["Recognisable modern sciences without a textbook diagram", "One bold experiment reads from afar; other fields emerge close up", "Human curiosity and making remain relevant as technology changes"],
    palette: ["#f0e9d8", "#b16d54", "#647b50", "#244861", "#d3a543"],
    names: ["Ivory", "Clay", "Leaf", "Indigo", "Sunlight"],
  },
  {
    number: "02",
    id: "world",
    title: "The Commons",
    kicker: "A contemporary portrait of learning together",
    introduction: "Students investigate, discuss, sketch and build alongside one another. Their different ways of working meet in one energetic composition, with small scenes to discover on every walk past.",
    artwork: "world-flat.jpg",
    vertical: "world-vertical.jpg",
    alt: "Opaque illustrated artwork panel proposed on the sheltered IILM brick corridor",
    rationale: ["Student life and collaboration make the idea immediate", "Bold shapes read at a distance; smaller scenes reward a closer look", "An imagined shared world, never a depiction of actual campus buildings"],
    palette: ["#f1e7d5", "#a86045", "#566e56", "#344e60", "#c59a58"],
    names: ["Limestone", "Clay", "Olive", "Indigo", "Sunlight"],
  },
] as const;

const sites: { title: string; before: string; quad: Quad; note: string }[] = [
  { title: "Garden colonnade · first pier", before: "photo-8365.jpg", quad: [[.101,.108],[.253,.126],[.263,.836],[.101,.837]], note: "The entire visible front face, stopping at the concrete cap and stone base. The garden and walking route stay untouched." },
  { title: "Commons · outward-facing pier", before: "photo-8367.jpg", quad: [[.751,.201],[.868,.183],[.858,.680],[.748,.669]], note: "A vertical artwork on the brick face. The notice on the other pier and adjacent student seating remain visible." },
  { title: "Scholar Café · left brick bay", before: "photo-8378.jpg", quad: [[.218,.313],[.336,.320],[.334,.701],[.202,.702]], note: "The clear bay beside the café entrance. The fire extinguisher, café identity and door glazing are kept clear." },
  { title: "Learning corridor · approach view", before: "photo-8381.jpg", quad: [[.485,.277],[.555,.316],[.556,.613],[.483,.674]], note: "The same campus language continues down the brick circulation wall, within its actual column and skirting limits." },
  { title: "Learning corridor · wall bay", before: "photo-8382.jpg", quad: [[.196,.022],[.486,.075],[.506,.932],[.207,.982]], note: "The large brick bay is filled from just above the skirting to the upper brick edge; the class-room direction sign sits outside the print." },
  { title: "Learning corridor · reverse view", before: "photo-8383.jpg", quad: [[.35,.054],[.497,.235],[.508,.710],[.353,.887]], note: "A second view of the same proposed wall, with the RCC lines and existing wayfinding at their original positions." },
];

const held = [
  { title: "Green façade", refs: "8360 · 8361 · 8376 · 8384", photo: "photo-8360.jpg", reason: "Retain living ivy, windows and the building's brick rhythm." },
  { title: "Teaching doors", refs: "8362 · 8363 · 8364", photo: "photo-8364.jpg", reason: "Doorways, students and circulation leave no continuous printable brick bay." },
  { title: "Colonnade displays", refs: "8366 · 8368 · 8369", photo: "photo-8368.jpg", reason: "Alternate views or existing placement and internship information; proposed art belongs on the clear piers shown above." },
  { title: "Residence entrances", refs: "8370 · 8371 · 8372 · 8373 · 8374", photo: "photo-8372.jpg", reason: "Windows, open entries, an existing mural and stair signage take priority." },
  { title: "Display corridor", refs: "8375", photo: "photo-8375.jpg", reason: "Existing plaques and placement boards should be resolved with IILM before any replacement design." },
  { title: "Café and safety walls", refs: "8377 · 8379 · 8380", photo: "photo-8380.jpg", reason: "Use the clean café bay above; keep notices, fire equipment and accessible doors clear." },
];

export function IilmPresentation({ allowed, signedIn }: { allowed: boolean; signedIn: boolean }) {
  if (!allowed) return <AccessGate signedIn={signedIn} />;

  return <main className="iilm-book">
    <header className="iilm-hero">
      <div className="iilm-hero-inner">
        <p className="iilm-eyebrow">ZYVORAH <span>×</span> IILM UNIVERSITY · GREATER NOIDA</p>
        <h1>Many disciplines.<br /><em>More possible futures.</em></h1>
        <p className="iilm-hero-copy">Two visual directions for the places students move through every day. Each responds to the campus’s brick, greenery and belief in learning across fields.</p>
        <a href="#directions" className="iilm-hero-link">Explore the proposals <span aria-hidden="true">↓</span></a>
      </div>
      <p className="iilm-private-label">Private client proposal · Visualisations, not installed work</p>
    </header>

    <section className="iilm-brief iilm-wrap" aria-labelledby="brief-title">
      <p className="iilm-eyebrow">THE BRIEF WE HEARD</p>
      <h2 id="brief-title">A campus that makes connection visible.</h2>
      <div className="iilm-brief-grid">
        <p>Students should see that a future can be built from more than one field of knowledge. The artwork makes that thought visual, so it keeps offering something new as people pass it again.</p>
        <div className="iilm-brief-points"><span>01 / Graphic first, no quotes</span><span>02 / Muted beside red brick and green</span><span>03 / Designed for exterior circulation</span></div>
      </div>
    </section>

    <nav className="iilm-direction-nav iilm-wrap" id="directions" aria-label="Concept directions">
      <a href="#worlds"><span>01</span> Worlds in Progress <b>↗</b></a>
      <a href="#world"><span>02</span> The Commons <b>↗</b></a>
    </nav>

    {concepts.map((concept) => <section key={concept.id} id={concept.id} className={`iilm-concept iilm-concept-${concept.id}`} aria-labelledby={`${concept.id}-title`}>
      <div className="iilm-wrap">
        <div className="iilm-concept-heading"><div><p className="iilm-eyebrow">DIRECTION {concept.number} / {concept.kicker}</p><h2 id={`${concept.id}-title`}>{concept.title}</h2></div><p>{concept.introduction}</p></div>
        <div className="iilm-view-heading"><div><span className="iilm-smallcaps">IN PLACE / CAMPUS PHOTOGRAPHS</span><h3>Across the campus.</h3></div><span>Move across or drag each image · Use arrow keys when focused</span></div>
        <p className="iilm-site-intro">Every after view uses the exact before photograph. Only the opaque proposed print is mapped onto a brick plane. The concrete, signs, floor, people and perspective are unchanged.</p>
        <div className="iilm-sites">{sites.map((site, index) => <article className="iilm-site" key={site.before}>
          <div className="iilm-site-title"><span>{String(index + 1).padStart(2, "0")}</span><h4>{site.title}</h4></div>
          <Reveal before={site.before} artwork={concept.vertical} quad={site.quad} alt={`${concept.title} at ${site.title}`} />
          <p className="iilm-image-note">{site.note}</p>
        </article>)}</div>
        <div className="iilm-detail-grid">
          <div className="iilm-flat"><div className="iilm-flat-heading"><div><span className="iilm-smallcaps">ARTWORK / FLAT VIEW</span><h3>The artwork itself.</h3></div><a href={`${asset(concept.artwork)}?download=1`}>Download concept image ↗</a></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset(concept.artwork)} alt={`Flat concept artwork for ${concept.title}`} />
            <p>Concept artwork for review. The vertical adaptation used on the photographed sites is shown alongside it. Final print files require measured dimensions, panel divisions and approved colour profile.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="iilm-vertical-flat" src={asset(concept.vertical)} alt={`Vertical adaptation of ${concept.title}`} />
          </div>
          <aside className="iilm-logic"><span className="iilm-smallcaps">WHY THIS WORKS</span><ul>{concept.rationale.map((point) => <li key={point}>{point}</li>)}</ul><div className="iilm-palette" aria-label={`${concept.title} palette`}>{concept.palette.map((color, index) => <div key={color}><span style={{ background: color }} /><small>{concept.names[index]}</small></div>)}</div></aside>
        </div>
      </div>
    </section>)}

    <section className="iilm-survey iilm-wrap">
      <p className="iilm-eyebrow">THE FULL PHOTO SURVEY</p>
      <h2>Where the artwork should—and should not—go.</h2>
      <p>The six mapped views above cover the clear brick opportunities in the supplied set. Every other photograph has been considered as an alternate view or a surface to preserve.</p>
      <div className="iilm-survey-grid">{held.map((item) => <div key={item.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset(item.photo)} alt={`Existing ${item.title.toLowerCase()} at IILM`} />
        <span>{item.refs}</span><h3>{item.title}</h3><p>{item.reason}</p>
      </div>)}</div>
    </section>
    <section className="iilm-execution"><div className="iilm-wrap iilm-execution-inner"><div><p className="iilm-eyebrow">FROM CONCEPT TO CAMPUS</p><h2>Designed to be made.</h2></div><p>Both directions are shown as opaque printed graphics fitted to real sheltered brick areas, beginning just above the skirting and ending at the brick edge. Before production, we would verify each face, fixings, services, dimensions and substrate on site, then test the selected 3M textured-surface film and compatible overlaminate before making panelled print files.</p></div></section>
    <footer className="iilm-footer iilm-wrap"><span>Zyvorah × IILM Greater Noida</span><span>Private design presentation · Two directions</span></footer>
  </main>;
}
