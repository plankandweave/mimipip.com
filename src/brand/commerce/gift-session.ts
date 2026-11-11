type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const GIFT_SESSION_KEY='mimipip-gift-session';
const HISTORY_KEY='mimipip-completed-gifts';
export type CompletedGift={recipientName:string;amount:number;printUrl:string};
function valid(g:any):g is CompletedGift{
 if(!g||typeof g.recipientName!=='string'||!Number.isFinite(g.amount)||typeof g.printUrl!=='string')return false;
 try{const u=new URL(g.printUrl);return u.origin==='https://mimipip.com'&&u.pathname==='/api/gift-card/print';}catch{return false;}
}
export function completedGifts(storage:Store):CompletedGift[]{try{const saved=JSON.parse(storage.getItem(HISTORY_KEY)||'[]');return Array.isArray(saved)?saved.filter(valid).slice(0,10):[];}catch{return[];}}
/** Archive before clearing the current attempt, so a second gift cannot lose its receipt. */
export function finishGiftSession(storage:Store,gift:CompletedGift,status:string){
 if(status!=='active'||!valid(gift))throw new Error('Finish this gift before starting another.');
 const history=[gift,...completedGifts(storage).filter(g=>g.printUrl!==gift.printUrl)].slice(0,10);
 storage.setItem(HISTORY_KEY,JSON.stringify(history));storage.removeItem(GIFT_SESSION_KEY);return history;
}
