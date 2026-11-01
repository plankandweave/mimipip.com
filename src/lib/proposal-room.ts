import {z} from "zod";
import {proposalConfigurationSchema} from "./proposal-configuration";
const point=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict();
const corners=z.tuple([point,point,point,point]).refine(q=>{
 const cross=q.map((a,i)=>{const b=q[(i+1)%4]!,c=q[(i+2)%4]!; return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
 return cross.every(n=>n>0.0001);
},"Mark four wall corners clockwise from top left.");
export const proposalRoomSchema=z.object({areaId:z.string().uuid(),studyId:z.string().uuid(),revision:z.number().int().nonnegative(),configuration:proposalConfigurationSchema,corners,mids:z.tuple([point,point,point,point]).optional()}).strict();
