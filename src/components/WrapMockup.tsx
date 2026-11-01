import { buildChassis, chassisFor, chassisAlt, panelUnion } from "@/lib/wrap-mockups";
import type { WrapChassis } from "@/lib/wrap-mockups";
import type { WrapFormat } from "@/lib/wraps";
import siteImageLoader from "@/lib/supabaseImageLoader";

/**
 * A design drawn onto an appliance of the chosen format — no photograph needed.
 *
 * One <image> spans the union of every wrapped face and is clipped into each
 * panel, so a multi-panel format shows ONE continuous composition interrupted by
 * the gap, which is exactly how the panels are cut. Clipping each panel to its
 * own copy of the artwork would show the design restarting at every door, which
 * is not the product. This is what makes a top-load washer's three-side wrap
 * read correctly: the pattern carries round the corners because the panels were
 * cut from one composition.
 *
 * Deliberately bare: no handles, no base strip, no invented edge shading. The
 * customer's appliance probably has a recessed pull rather than a bar, and every
 * drawn piece of hardware was either wrong for their machine or sat on top of the
 * artwork the preview exists to show.
 *
 * What IS drawn over the artwork is only what the wrap genuinely stops at — the
 * gap between doors, an AC's louvred air outlet, a washer's porthole, a
 * dishwasher's control strip and kick plate, a top-loader's lid. Each of those is
 * a place the panel is trimmed around or does not reach, so showing artwork
 * across it would be a picture of something we do not sell.
 *
 * Every format of one appliance draws into ONE shared canvas with its base on
 * the canvas floor, so the floor line never moves between formats and the sizes
 * stay true to each other — see mockupFrame() for why both matter, and why the
 * canvas is per appliance rather than shared across the range.
 *
 * Pure SVG and server-renderable: no canvas, no measuring, no effects. That
 * keeps it usable as a product-page preview, inside the format picker, and in
 * a listing tile without three different implementations.
 */
/**
 * The three-quarter body: front and right side, one artwork across both.
 *
 * The two faces draw the SAME image, each transformed so its own slice of the
 * cut list lands on it. That is what makes the pattern continue across the
 * corner instead of restarting at it — which is the entire point of a wrap sold
 * as covering three sides, and the thing the old flat elevation could state but
 * not show.
 *
 * The side face is shaded down a little. Nothing else about the drawing implies
 * a light source, but two faces of one object meeting at a corner have to differ
 * or the corner disappears and the whole thing reads flat again.
 */
function AngularBodyView({
  c,
  uid,
  designUrl,
}: {
  c: WrapChassis;
  uid: string;
  designUrl: string;
}) {
  const a = c.angular!;
  const face = (
    key: string,
    f: {
      path: string;
      matrix: [number, number, number, number, number, number];
      art: { w: number; h: number };
    },
  ) => (
    <g clipPath={`url(#${uid}-${key})`}>
      <g transform={`matrix(${f.matrix.join(" ")})`}>
        <image
          href={designUrl}
          x={0}
          y={0}
          width={f.art.w}
          height={f.art.h}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>
    </g>
  );

  return (
    <>
      <defs>
        <clipPath id={`${uid}-front`}>
          <path d={a.front.path} />
        </clipPath>
        <clipPath id={`${uid}-side`}>
          <path d={a.side.path} />
        </clipPath>
      </defs>

      {/* The lid and console, left unwrapped — it is the surface you put things
          down on, and the wrap deliberately stops below it. */}
      <path d={a.lidTop} fill="#F4F2ED" stroke="rgba(0,0,0,.26)" strokeWidth={2.5} />
      <path d={a.lidFront} fill="#EAE7E1" stroke="rgba(0,0,0,.26)" strokeWidth={2.5} />
      <path d={a.lidSide} fill="#DDD9D2" stroke="rgba(0,0,0,.26)" strokeWidth={2.5} />

      {face("front", a.front)}
      {face("side", a.side)}

      {/* The flank is darker: two faces meeting at a corner must differ or the
          corner vanishes and the body reads as one flat rectangle again. */}
      <path d={a.side.path} fill="rgba(0,0,0,.14)" />

      <path d={a.front.path} fill={`url(#${uid}-sheen)`} style={{ pointerEvents: "none" }} />

      {/* The wrapped faces outlined. The fold between them is drawn once, by
          these two outlines meeting — it is a fold the wrap turns, not a cut. */}
      <path d={a.front.path} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={2.5} />
      <path d={a.side.path} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={2.5} />
    </>
  );
}

export function WrapMockup({
  designUrl,
  designAlt,
  format,
  formats,
  formatCode,
  frame,
  stageMaxHeight,
  className,
}: {
  /** The design's flat artwork, authored at this appliance's aspect. */
  designUrl: string;
  designAlt?: string;
  /** The format to draw. Pass this when you already have the row. */
  format?: WrapFormat | null;
  /** Or pass the appliance's formats and a code, and let it resolve. */
  formats?: WrapFormat[];
  formatCode?: string | null;
  /**
   * The shared mm canvas, from mockupFrame(). Omit and the chassis is drawn in
   * its own bounding box — right for a one-off tile, wrong for a picker, where a
   * moving floor line reads as a glitch.
   */
  frame?: [number, number];
  /**
   * Cap on the stage's height, in px.
   *
   * Given this, the stage takes the CANVAS's own proportions and derives its
   * height from the available width, stopping at this cap. That is what keeps a
   * 2.6:1 air conditioner from sitting in the middle of a 340px-tall box of empty
   * space, while a 1:2 fridge door still stops growing before it pushes the rest
   * of the page down.
   *
   * Without it the caller's own box is used as-is and the appliance is centred
   * inside it — right for a fixed tile, wasteful for a stage.
   */
  stageMaxHeight?: number;
  className?: string;
}) {
  const chassis: WrapChassis | null = format
    ? format.isMadeToMeasure && formats?.length
      ? chassisFor(formats, format.code)
      : buildChassis(format)
    : chassisFor(formats ?? [], formatCode);

  // No format rows means no honest shape to draw. An empty frame is better than
  // a guessed one: this renders on a landing page whose ladder may not be seeded.
  if (!chassis) return null;

  const c = chassis;
  const u = panelUnion(c.panels);
  // The artwork through the store's image path, like every other picture on the
  // site: a /media master (2–3 MB PNG) becomes its pre-generated @1200 webp
  // rendition, which the /media route falls back from to the master when it is
  // missing. An SVG <image> never passes through SiteImage, so without this
  // every mockup downloaded the full master.
  const art = siteImageLoader({ src: designUrl, width: 1200 });
  const [vw, vh] = frame ?? c.size;
  // Centred horizontally. A floor-standing appliance is stood on the canvas
  // floor so a taller format grows upward with its base fixed; a wall-hung one
  // is centred vertically, because it has no floor to stand on and hanging it
  // from the top of the canvas would imply a ceiling.
  const dx = (vw - c.cabinet.w) / 2;
  const dy =
    c.anchor === "floor"
      ? vh - (c.cabinet.h + c.baseShadow)
      : (vh - c.cabinet.h) / 2;
  // Stable per-format id: two mockups of different formats can share a page,
  // and a clip path collides if the id is only the panel index.
  const uid = `wm-${c.appliance}-${c.code}`;
  const cid = (i: number) => `${uid}-clip-${i}`;

  // The appliance is drawn INTO A STAGE the caller fixes the size of, and it is
  // scaled to fit inside that stage rather than sized from one axis.
  //
  // The callers used to size by HEIGHT (`h-[420px] w-auto`), which is right for
  // the fridge the studio was built around — a 1:2 door 420px tall is 210px wide
  // and sits happily in a 420px column — and catastrophic for a wide appliance:
  // the same rule on a 2.7:1 air-conditioner cover is about 1,130px wide, so it
  // burst out of its column and ran underneath the design thumbnails.
  //
  // A fixed stage plus `preserveAspectRatio="xMidYMid meet"` cannot overflow in
  // either axis, whatever the appliance's proportions are. Because every format
  // of one appliance shares one mm canvas (see mockupFrame), they all scale by
  // the same factor into that stage — so a mini fridge still draws visibly
  // smaller than a side-by-side, and the floor line still does not move.
  return (
    <div
      className={className}
      style={
        stageMaxHeight
          ? { aspectRatio: `${vw} / ${vh}`, maxHeight: stageMaxHeight, width: "100%" }
          : undefined
      }
    >
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
      role="img"
      aria-label={chassisAlt(c, designAlt)}
    >
      <defs>
        {c.panels.map((p, i) => (
          <clipPath key={i} id={cid(i)}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} />
          </clipPath>
        ))}
        {/* soft, fading contact shadow rather than a hard ellipse edge */}
        <radialGradient id={`${uid}-floor`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.26" />
          <stop offset="60%" stopColor="#000" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="26%" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="70%" stopColor="#000" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.10" />
        </linearGradient>
        {/* The glass of a washer door: dark, and deepest off-centre so it reads
            as a recess rather than a printed black circle. */}
        <radialGradient id={`${uid}-glass`} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#6C6A66" />
          <stop offset="55%" stopColor="#3A3835" />
          <stop offset="100%" stopColor="#232120" />
        </radialGradient>
      </defs>

      <g transform={`translate(${dx} ${dy})`}>
        {/* Where the appliance meets the floor — tight to the base and soft,
            because contact is the only thing being suggested. Outside the
            branch below because it is true of any floor-standing appliance,
            drawn flat or at an angle. A wall-hung unit gets none: there is
            nothing under it to catch a shadow. */}
        {c.anchor === "floor" && (
          <ellipse
            cx={c.cabinet.w / 2}
            cy={c.cabinet.h + c.baseShadow * 0.32}
            rx={c.cabinet.w * 0.52}
            ry={c.baseShadow * 0.34}
            fill={`url(#${uid}-floor)`}
          />
        )}

        {c.angular ? (
          <AngularBodyView c={c} uid={uid} designUrl={art} />
        ) : (
        <>

        {/* carcass behind the wrapped faces */}
        <rect
          x={c.cabinet.x}
          y={c.cabinet.y}
          width={c.cabinet.w}
          height={c.cabinet.h}
          rx={c.cabinet.rx}
          fill="#E8E5DF"
          stroke="rgba(0,0,0,.30)"
          strokeWidth={3}
        />

        {/* the artwork: one continuous image, clipped per panel */}
        {c.panels.map((p, i) => (
          <g key={i} clipPath={`url(#${cid(i)})`}>
            <image
              href={art}
              x={u.x}
              y={u.y}
              width={u.w}
              height={u.h}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        ))}

        {/* a single sheen across the whole front, so the panels read as one
            object catching one light rather than as flat swatches */}
        <rect
          x={u.x}
          y={u.y}
          width={u.w}
          height={u.h}
          fill={`url(#${uid}-sheen)`}
          style={{ pointerEvents: "none" }}
        />

        {/* Bands the wrap does not reach. A louvre strip is drawn with its slats
            because the vent is the recognisable thing about an air conditioner;
            the others are plain fascia. All of them sit over the artwork, which
            is the honest order: the panel is trimmed to them. */}
        {c.strips.map((s, i) => (
          <g key={i}>
            <rect
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={4}
              fill={s.kind === "kickPlate" ? "#CFCBC4" : "#DEDAD3"}
              stroke="rgba(0,0,0,.22)"
              strokeWidth={2}
            />
            {s.kind === "louvreStrip" &&
              [0.3, 0.55, 0.8].map((t) => (
                <line
                  key={t}
                  x1={s.x + s.w * 0.03}
                  x2={s.x + s.w * 0.97}
                  y1={s.y + s.h * t}
                  y2={s.y + s.h * t}
                  stroke="rgba(0,0,0,.28)"
                  strokeWidth={2}
                />
              ))}
          </g>
        ))}

        {/* The door of a front-loader or dryer. Cut around, not printed over —
            the panel arrives with this hole in it. */}
        {c.porthole && (
          <g>
            <circle
              cx={c.porthole.cx}
              cy={c.porthole.cy}
              r={c.porthole.r}
              fill="#DEDAD3"
              stroke="rgba(0,0,0,.26)"
              strokeWidth={3}
            />
            <circle
              cx={c.porthole.cx}
              cy={c.porthole.cy}
              r={c.porthole.r * 0.82}
              fill={`url(#${uid}-glass)`}
            />
          </g>
        )}

        {/* panel outlines and the gaps between them, over the artwork — the wrap
            stops at each panel's edge and does not bridge the gap */}
        {c.panels.map((p, i) => (
          <rect
            key={i}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            rx={p.rx}
            fill="none"
            stroke="rgba(0,0,0,.28)"
            strokeWidth={2.5}
          />
        ))}
        </>
        )}
      </g>
    </svg>
    </div>
  );
}
