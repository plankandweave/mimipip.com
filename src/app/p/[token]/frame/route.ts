import {
  inviteForToken, hasSession, deckBytes, signedPlaybackUrl, contentTypeFor,
} from "@/lib/presentation";

export const runtime = "nodejs";

// Serves the uploaded deck itself, for the <iframe> on the viewer page.
//
// THE SANDBOX IS THE POINT. This file is arbitrary HTML that someone authored
// elsewhere and uploaded — Roheena's own decks today, but the route cannot
// assume that. Served plainly from our origin, a <script> inside it would be
// same-origin with zyvorah.com and could read the visitor's cookies, call our
// authenticated APIs, and rewrite the page around it.
//
// `Content-Security-Policy: sandbox allow-scripts` puts the response in an
// OPAQUE origin: its scripts still run (the Outcreate deck animates a canvas
// and needs them), but document.cookie is empty, localStorage throws, and it
// has no access to anything of ours. Note the absence of `allow-same-origin` —
// adding it back alongside allow-scripts would let the frame remove its own
// sandbox, which is the whole hole reopened.
//
// A consequence worth knowing: a deck that stores anything in localStorage
// silently gets nothing. The Outcreate page wraps those calls in try/catch, so
// it degrades to showing its own (now redundant) email box.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invite = await inviteForToken(token);
  if (!invite) return new Response("Not found", { status: 404 });

  // The frame is fetched by the browser directly, so it re-checks the session
  // rather than trusting that the page above it did. Without this the deck
  // would be readable by anyone with the URL even when require_code is on.
  if (invite.presentation.require_code && !(await hasSession(invite.recipient.id))) {
    return new Response("Not found", { status: 404 });
  }

  // A video is never buffered here — it would be tens of megabytes inside a
  // Worker. The viewer page plays it from a signed storage URL instead; this
  // branch exists only so a direct hit on the frame URL still works.
  if (invite.presentation.format === "video") {
    const signed = await signedPlaybackUrl(invite.presentation.storage_path);
    if (!signed) return new Response("Not found", { status: 404 });
    return Response.redirect(signed, 302);
  }

  const bytes = await deckBytes(invite.presentation.storage_path);
  if (!bytes) return new Response("Not found", { status: 404 });

  const body =
    invite.presentation.format === "html" && token === LTM_KOLKATA_TOKEN
      ? injectLtmKolkataUpdate(new TextDecoder().decode(bytes))
      : bytes;

  return new Response(body, {
    headers: {
      "Content-Type": contentTypeFor(
        invite.presentation.storage_path, invite.presentation.format),
      "Content-Security-Policy": "sandbox allow-scripts allow-popups",
      "X-Content-Type-Options": "nosniff",
      // Private: a shared cache must never hold one recipient's deck and hand
      // it to the next request.
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}


const LTM_KOLKATA_TOKEN = "589162a7721e0e76d118d3fa015d9c2cd12b19ecb8b2fb36c5320d83d12c4914";

/** Keep the current recipient link while organising this one client deck. */
function injectLtmKolkataUpdate(html: string): string {
  if (html.includes("data-ltm-organised")) return html;
  const enhancement = ["<style data-ltm-organised>","html{scroll-behavior:smooth}",".ltm-proposal-film{width:100%;margin:30px 0 38px;background:#111820;border-radius:4px;overflow:hidden;box-shadow:0 18px 42px rgba(45,45,45,.14)}",".ltm-proposal-film video{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#111820}",".ltm-direction-fold{border-top:1px solid var(--hair,#E0E0E0)}",".ltm-direction-fold>summary{list-style:none;cursor:pointer;padding:38px 0;transition:background .2s ease}",".ltm-direction-fold>summary::-webkit-details-marker{display:none}",".ltm-direction-fold>summary:hover{background:rgba(140,123,107,.055)}",".ltm-direction-fold>summary:focus-visible{outline:2px solid var(--taupe,#8C7B6B);outline-offset:-2px}",".ltm-fold-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center}",".ltm-fold-copy h2{margin:0 0 8px}.ltm-fold-copy .eyebrow{margin-bottom:10px}.ltm-fold-copy .tagline{margin:0}",".ltm-fold-action{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--taupe-deep,#6B5D4F);white-space:nowrap}",".ltm-fold-action::before{content:'+';display:inline-block;margin-right:9px;font-size:18px;line-height:1;vertical-align:-1px}",".ltm-direction-fold[open] .ltm-fold-action::before{content:'−'}",".ltm-direction-fold>section{border-top:1px solid var(--hair,#E0E0E0)}","@media(max-width:640px){.ltm-fold-row{grid-template-columns:1fr;gap:12px}}","</style>","<script data-ltm-organised>","(function(){","  var filmUrl='https://iilm-campus-futures.roheenanagpal.chatgpt.site/media/ltm-kolkata-approved.mp4';","  var headings=Array.prototype.slice.call(document.querySelectorAll('h2'));","  var intro=headings.find(function(h){return h.textContent.trim()==='One story, told three ways';});","  if(intro&&!document.querySelector('.ltm-proposal-film')){","    var film=document.createElement('div');film.className='ltm-proposal-film reveal in';","    var video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';","    video.setAttribute('aria-label','LTM Kolkata approved design direction film');video.src=filmUrl;","    film.appendChild(video);intro.insertAdjacentElement('afterend',film);","  }","  function make(tag,cls,text){var el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;}","  function fold(pos,title,tagline){","    var section=document.querySelector('section[data-chapter=\"'+pos+'\"]');if(!section)return;","    var details=make('details','ltm-direction-fold '+(pos==='2'?'sec-wash':'sec-white'));","    details.setAttribute('data-chapter',pos);","    var summary=document.createElement('summary'),row=make('div','wrap ltm-fold-row'),copy=make('div','ltm-fold-copy');","    copy.appendChild(make('p','eyebrow','0'+pos+' — Alternative direction'));","    copy.appendChild(make('h2','',title));copy.appendChild(make('p','tagline',tagline));","    row.appendChild(copy);row.appendChild(make('span','ltm-fold-action','View direction'));summary.appendChild(row);","    section.removeAttribute('data-chapter');section.parentNode.insertBefore(details,section);details.appendChild(summary);details.appendChild(section);","  }","  fold('2','River / Continuum','We keep knowledge moving, long after the handover.');","  fold('3','Inner Order','We turn complexity into something you can decide on.');","  function heading(oldText,newText,eyebrow,introText){","    var h=headings.find(function(x){return x.textContent.trim()===oldText;});if(!h)return;","    h.textContent=newText;","    if(eyebrow){var e=h.previousElementSibling;if(e&&e.classList.contains('eyebrow'))e.textContent=eyebrow;}","    var section=h.closest('section'),p=section&&section.querySelector('.intro p');if(p&&introText)p.textContent=introText;","    return section;","  }","  heading('How we would present the three directions to LTM','The three directions remain available for reference','04 — Direction record','Bengal, Becoming is the direction selected to move forward. River / Continuum and Inner Order remain in this presentation as expandable references.');","  var next=heading('Which direction would you like to take forward?','Taking Bengal, Becoming forward',null,'The creative direction is established. The next stage is to confirm the walls, verify measurements and develop the selected artworks for their final locations.');","  if(next){","    var introBox=next.querySelector('.intro');if(introBox)Array.prototype.slice.call(introBox.querySelectorAll('p')).slice(1).forEach(function(p){p.remove();});","    var stepCopy=['Confirm the walls and their final measurements.','Develop Bengal, Becoming across the selected locations.','Prepare the final scope, quotation and production sequence.'];","    Array.prototype.forEach.call(next.querySelectorAll('.step p'),function(p,i){if(stepCopy[i])p.textContent=stepCopy[i];});","    var cta=next.querySelector('.cta');if(cta)cta.textContent='Share measurements or comments';","  }","})();","</script>"].join("\n");
  return html.includes("</body>")
    ? html.replace("</body>", enhancement + "\n</body>")
    : html + "\n" + enhancement;
}
