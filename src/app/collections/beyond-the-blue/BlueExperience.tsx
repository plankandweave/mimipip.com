'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BLUE_DESIGNS, blueAsset, blueHandle } from '@/lib/beyond-the-blue';
import { blueRoom } from '@/lib/beyond-the-blue-rooms';
import { MarketMoney } from '@/components/MarketMoney';
import { createLandscapeSound } from './sound';

export function BlueExperience({liveHandles}:{liveHandles:string[]}) {
  const [selected,setSelected]=useState(0),[repeat,setRepeat]=useState(false),[room,setRoom]=useState(true);
  const [sound,setSound]=useState(false);
  const [audioError,setAudioError]=useState('');
  const root=useRef<HTMLDivElement>(null),journey=useRef<HTMLElement>(null),player=useRef<ReturnType<typeof createLandscapeSound>|null>(null);
  const d=BLUE_DESIGNS[selected];
  useEffect(()=>{
    const visibility=()=>{if(document.hidden){void player.current?.pause();setSound(false);}};
    document.addEventListener('visibilitychange',visibility);
    return ()=>{document.removeEventListener('visibilitychange',visibility);player.current?.close();};
  },[]);
  useEffect(()=>{
    let frame=0;
    const update=()=>{frame=0;const el=journey.current;if(!el)return;const rect=el.getBoundingClientRect();const progress=Math.max(0,Math.min(1,-rect.top/(el.offsetHeight-innerHeight)));el.style.setProperty('--journey',String(progress));};
    const scroll=()=>{if(!frame)frame=requestAnimationFrame(update);};update();addEventListener('scroll',scroll,{passive:true});addEventListener('resize',scroll);
    return()=>{removeEventListener('scroll',scroll);removeEventListener('resize',scroll);cancelAnimationFrame(frame);};
  },[]);
  function enter(){document.getElementById('blue-journey')?.scrollIntoView({behavior:'smooth'});}
  async function toggleSound(){try{if(!player.current)player.current=createLandscapeSound();if(sound){await player.current.pause();setSound(false);}else{await player.current.resume();setSound(true);}setAudioError('');}catch{setAudioError('Sound is unavailable in this browser.');setSound(false);}}
  function choose(i:number){setSelected(i);setRepeat(false);}
  const handle=blueHandle(d.slug,repeat),live=liveHandles.includes(handle);
  return <div ref={root} className="blue-world">
    <nav className="blue-nav" aria-label="Beyond the Blue navigation"><Link href="/" className="blue-brand" aria-label="Zyvorah home">Z.</Link><a href="#blue-atlas">The landscapes</a><div><button aria-pressed={sound} onClick={toggleSound}>{sound?'◖ Sound on':'◖ Sound off'}</button></div></nav>
    {audioError&&<p role="status" className="blue-audio-error">{audioError}</p>}
    <section className="blue-opening" aria-labelledby="blue-title" onPointerMove={e=>{if(e.pointerType==='touch')return;const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.setProperty('--look-x',`${(e.clientX-r.left-r.width/2)*.009}px`);e.currentTarget.style.setProperty('--look-y',`${(e.clientY-r.top-r.height/2)*.006}px`);}}>
      <img className="blue-opening-art" src={blueAsset('willow-canal','mural')} width="1536" height="1024" alt="A Delft-blue willow landscape opening across still water" fetchPriority="high" />
      <div className="blue-mist" aria-hidden="true"/><div className="blue-opening-copy"><p className="blue-eyebrow">Zyvorah · Blue & White · Bicolor</p><h1 id="blue-title">Beyond<br/>the <em>Blue.</em></h1><p className="blue-whisper">Somewhere you could stay.</p><button className="blue-enter" onClick={enter}>Step into the stillness <span aria-hidden>↓</span></button><a className="blue-skip" href="#blue-atlas">Explore all eleven landscapes</a></div>
      <span className="blue-opening-caption">01 / Willow Canal</span>
    </section>
    <section className="blue-prologue"><p className="blue-eyebrow">A memory of Amsterdam</p><h2>A whole world.<br/>In just two colours.</h2><p>A glimpse of blue-and-white pottery. A tiny painted landscape, holding more space than seemed possible. Beyond the Blue began with the wish to step inside it.</p><p>Inspired by the Delft tradition, eleven original landscapes unfold in cobalt and porcelain white. Water, gardens, distant shores. Places to wander, and places to come home to.</p><div className="blue-colours" aria-label="Cobalt blue and porcelain white"><i/><i/></div></section>
    <section ref={journey} id="blue-journey" className="blue-journey" aria-label="From landscape to home">
      <div className="blue-journey-sticky"><div className="blue-journey-frame"><img className="blue-journey-art" src={blueAsset('willow-canal','mural')} alt="Willow Canal mural" width="1536" height="1024" loading="lazy"/><img className="blue-room-layer" src={blueAsset('willow-canal','room')} alt="Willow Canal in a naturally lit Indian apartment living room" width="1536" height="1024" loading="lazy"/></div><div className="blue-journey-copy"><p className="blue-eyebrow">From a world you wander through</p><h2>To a place<br/>you call home.</h2><a href="#blue-atlas">Find your landscape ↘</a></div></div>
    </section>
    <section id="blue-atlas" className="blue-atlas"><header><p className="blue-eyebrow">The painted atlas / Eleven destinations</p><h2>Where will you go?</h2><p>Follow the water. Take the garden path. Stay a little longer.</p></header>
      <div className="blue-destinations" aria-label="Choose a landscape">{BLUE_DESIGNS.map((item,i)=><button key={item.slug} aria-pressed={selected===i} onClick={()=>choose(i)}><span>{item.number}</span><img src={blueAsset(item.slug,'mural-small')} width="600" height="400" alt="" loading="lazy"/><strong>{item.name}</strong></button>)}</div>
      <div className="blue-current-heading" aria-live="polite"><div><p className="blue-eyebrow">{d.number} / {d.mood}</p><h3>{d.name}</h3></div><p>{d.story}</p></div>
      <div className="blue-scene-controls"><div role="group" aria-label="Composition"><button aria-pressed={!repeat} onClick={()=>setRepeat(false)}>Landscape mural</button><button aria-pressed={repeat} onClick={()=>setRepeat(true)}>Scenic repeat</button></div><button aria-pressed={room} onClick={()=>setRoom(!room)}>{room?'See flat artwork':'See it in a room'}</button></div>
      <figure className="blue-view" data-design={handle}>
        <img key={`${d.slug}-${repeat}-${room}`} src={blueAsset(d.slug,room?(repeat?'repeat-room':'room'):(repeat?'repeat':'mural'))} width="1536" height="1024" alt={`${d.name} ${repeat?'seamless scenic repeat':'continuous landscape mural'}${room?` in a ${blueRoom(d.slug,repeat).label.toLowerCase()}`:' in blue and white'}`} />
        {room&&<figcaption>{blueRoom(d.slug,repeat).label}</figcaption>}
      </figure>

      <div className="blue-shopping"><div><p>{repeat?'A flowing scenic composition that continues across the wall.':'One continuous landscape. Composed at a 15 × 10 ft proportion.'}</p><p><MarketMoney inr={200} /> / sq ft · Mural wallpaper · Smooth matte surface</p></div>{live?<Link className="blue-button" href={`/products/${handle}`}>Make this your wall <span aria-hidden>↗</span></Link>:<Link className="blue-button" href={`/contact?subject=${encodeURIComponent(`Beyond the Blue — ${d.name}${repeat?' Repeat':''}`)}`}>Enquire about this design ↗</Link>}</div>
    </section>
    <section className="blue-interlude" style={{'--interlude':`url(${blueAsset('moonlit-river','mural')})`} as CSSProperties}><div><p className="blue-eyebrow">Leave a little room for wonder</p><h2>The world can wait.<br/><em>You are here.</em></h2><button onClick={toggleSound}>{sound?'Pause the soundscape':'Listen to the landscape'} <span aria-hidden>◖</span></button></div></section>
    <section className="blue-collection" aria-labelledby="blue-collection-title">
      <header><p className="blue-eyebrow">Bring the blue home</p><h2 id="blue-collection-title">A landscape.<br/>A room of its own.</h2><p>Eleven landscapes, twenty-two rooms to call home. Explore each mural and its coordinating scenic repeat in homes filled with daylight. All designs <MarketMoney inr={200} /> / sq ft.</p></header>
      <div className="blue-editorial-collection" data-flat-cards="">{BLUE_DESIGNS.map(item=><article key={item.slug} className="blue-editorial-row" data-blue-pair={item.slug}>
        <div className="blue-editorial-story"><p className="blue-eyebrow">{item.number} / {item.mood}</p><h3>{item.name}</h3><p>{item.story}</p></div>
        <div className="blue-pair-gallery">{[false,true].map(r=>{
          const productHandle=blueHandle(item.slug,r);
          const href=liveHandles.includes(productHandle)?`/products/${productHandle}`:`/contact?subject=${encodeURIComponent(item.name)}`;
          return <figure key={String(r)} data-blue-product={productHandle}>
            <Link href={href} prefetch={false} className="blue-pair-image" aria-label={`Explore ${item.name} ${r?'scenic repeat':'mural'}`}><img src={blueAsset(item.slug,r?'repeat-room':'room')} alt={`${item.name} ${r?'scenic repeat':'mural'} in a ${blueRoom(item.slug,r).label.toLowerCase()}`} width="1536" height="1024" loading="lazy"/></Link>
            <figcaption><div><p>{r?'Scenic repeat':'Landscape mural'}</p><span>{blueRoom(item.slug,r).label} · <MarketMoney inr={200} /> / sq ft</span></div><Link href={href} prefetch={false}>{r?'Shop repeat':'Shop mural'} ↗</Link></figcaption>
          </figure>;
        })}</div>
      </article>)}</div>
      <p className="blue-room-note">Room images are design visualisations. Your final layout is prepared for your wall dimensions.</p>
    </section>
    <footer className="blue-ending"><p className="blue-eyebrow">Beyond the Blue / A Zyvorah collection</p><h2>Find a place.<br/>Make it yours.</h2><div><Link href="/collections/blue-and-white-1">Explore Blue & White</Link><Link href="/how-to-measure">Measure your wall</Link><Link href="/collections">All collections</Link></div><a href="#blue-title">Return to the stillness ↑</a></footer>
  </div>;
}
