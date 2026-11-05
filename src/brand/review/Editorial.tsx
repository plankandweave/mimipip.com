import Link from "next/link";
import pages from "./editorial.json";
import {find,card} from "./data";
import {ProductCard} from "@/components/ProductCard";

export function editorialMetadata(key:keyof typeof pages) {
 const {title,intro}=pages[key];
 return {title,description:intro,alternates:{canonical:"https://mimipip.com/"+key+"/"}};
}
export function Editorial({id}:{id:keyof typeof pages}) {
 const page=pages[id];
 return <main className="container-x py-12"><h1>{page.title}</h1><p className="my-5 max-w-3xl">{page.intro}</p>
   <div className="grid grid-cols-2 gap-5 md:grid-cols-4">{page.products.map(slug=>{
     const item=find(slug);
     return item ? <ProductCard key={slug} product={card(item)}/> : null;
   })}</div>
   <nav aria-label="Wallpaper guides" className="mt-10 flex flex-col gap-2">{Object.entries(pages).filter(([key])=>key!==id).map(([key,page])=><Link key={key} href={"/"+key+"/"}>{page.title}</Link>)}</nav></main>;
}
