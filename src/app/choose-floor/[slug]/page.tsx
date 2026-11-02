import {notFound} from "next/navigation";
import {ChooseDesign} from "@/components/DesignCart";
import games from "./games.json";
export default async function FloorSelection({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const game=games.find(item=>item.slug===slug);
 if(!game)notFound();
 return <main className="container-x py-10"><a href={"/floor-games/"+slug+"/"}>Back to the game</a><h1>{game.name}</h1><p>Floor sticker only · {game.width} × {game.height} cm</p><ChooseDesign {...game} custom={false} wallpaper={false}/></main>
}
