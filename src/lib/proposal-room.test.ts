import test from "node:test";
import assert from "node:assert/strict";
import {proposalRoomSchema} from "./proposal-room";
import {initialProposalConfiguration} from "./proposal-configuration";
const id="30229145-bb7d-463e-84c9-3863ba7411a6";
const valid={areaId:id,studyId:id,revision:2,configuration:initialProposalConfiguration(4318,2769),corners:[{x:.1,y:.1},{x:.8,y:.15},{x:.85,y:.9},{x:.1,y:.8}]};
test("perspective calibration retains physical size and normalised corners",()=>assert.deepEqual(proposalRoomSchema.parse(valid),valid));
test("crossed, collapsed or out-of-photo wall corners cannot be saved",()=>{
 for(const corners of [[valid.corners[0],valid.corners[2],valid.corners[1],valid.corners[3]],Array(4).fill({x:.1,y:.1}),[{x:-.1,y:.1},...valid.corners.slice(1)]]) assert.equal(proposalRoomSchema.safeParse({...valid,corners}).success,false);
});
