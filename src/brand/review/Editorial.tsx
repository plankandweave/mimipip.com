import Link from "next/link";
import {notFound} from "next/navigation";
import {landingOf,landings} from "@/brand/seo/landing";
import {find,card} from "./data";
import {ProductCard} from "@/components/ProductCard";

export function editorialMetadata(key:string) {
 const page=landingOf(key);
 if(!page)return {robots:{index:false,follow:true}};
 return {title:page.metaTitle,description:page.description,alternates:{canonical:"https://mimipip.com/"+key}};
}
export function Editorial({id}:{id:string}) {
 const page=landingOf(id);
 if(!page)notFound();
 return <main className="container-x py-12"><h1 className="text-3xl lg:text-5xl">{page.h1}</h1><p className="my-5 max-w-3xl text-lg">{page.intro}</p>
   <div className="grid grid-cols-2 gap-5 md:grid-cols-4">{page.products.map(slug=>{
     const item=find(slug);
     return item ? <ProductCard key={slug} product={card(item)}/> : null;
   })}</div>
   {page.sections.map(section=><section key={section.heading} className="mt-10 max-w-3xl"><h2 className="text-2xl">{section.heading}</h2><p className="mt-3">{section.text}</p></section>)}
   <nav aria-label="More from MimiPip" className="mt-10 flex flex-col gap-2">{landings.filter(other=>other.key!==id).map(other=><Link key={other.key} href={"/"+other.key}>{other.h1}</Link>)}</nav></main>;
}
