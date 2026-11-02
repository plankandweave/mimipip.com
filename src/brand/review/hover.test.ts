import {test} from "node:test";
import assert from "node:assert/strict";
import {pickFlatSource} from "./hover";
test("use explicit flat first, otherwise latest studio original then last non-scene",()=>{
 assert.equal(pickFlatSource(["/studio-uploads/1.jpg","/flat-a.jpg","/uuid.jpg"]),"/flat-a.jpg");
 assert.equal(pickFlatSource(["/studio-uploads/1.jpg","/studio-uploads/2.jpg","/uuid.jpg"]),"/studio-uploads/2.jpg");
 assert.equal(pickFlatSource(["/uuid-1.jpg","/scene-playroom.png","/uuid-2.jpg","/bedroom.jpg"]),"/uuid-2.jpg");
 assert.equal(pickFlatSource(["/scene-nursery.png"]),undefined);
});
