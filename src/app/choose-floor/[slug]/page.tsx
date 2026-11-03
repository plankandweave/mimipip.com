import {notFound} from "next/navigation";
import {ChooseDesign} from "@/components/DesignCart";
import games from "./games.json";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const game=games.find(item=>item.slug===slug);
 return {robots:{index:false,follow:true},alternates:game ? {canonical:"https://mimipip.com/"+(slug==="hopscotch-peach-pop" ? "products/"+slug : "floor-games/"+slug+"/")} : undefined};
}
export default async function FloorSelection({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const game=games.find(item=>item.slug===slug);
 if(!game)notFound();
 const pending=slug!=="hopscotch-peach-pop";
 const art="/floor-play-images/"+slug+"/art.png";
 return <main className="container-x py-10"><a href={"/floor-games/"+slug+"/"}>Back to the game</a><h1>{game.name}</h1><p>Floor sticker only · {game.width} × {game.height} cm</p>{pending && <><p>SKU {game.sku}</p><img src={art} width={220} height={220} className="object-contain" alt={game.name+" flat artwork"}/><p>These are nominal artwork dimensions. Finished size, material and pack contents need production confirmation.</p><a href={"/play/"+slug+"/"}>Read the play guide</a></>}<ChooseDesign {...game} floorArtwork={pending ? art : undefined} custom={false} wallpaper={false}/></main>
}
