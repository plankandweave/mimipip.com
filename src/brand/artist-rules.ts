export const ARTIST_CONSENT_VERSION = '2026-11-14-v1';
export const ARTIST_MIN_SKETCHES = 11;
export const FILE_LIMITS = {sketch:12*1024*1024,video:30*1024*1024,audio:10*1024*1024};
export type ArtistFileKind = keyof typeof FILE_LIMITS;
export const ALLOWED_TYPES:Record<ArtistFileKind,string[]> = {sketch:['image/jpeg','image/png','image/webp'],video:['video/mp4','video/quicktime','video/webm'],audio:['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/webm','audio/ogg']};
export function submissionError(kind:string,files:{kind:string}[],story:Record<string,unknown>){
 if(!['personal','artist'].includes(kind))return 'Choose a project type.';
 if(files.filter(f=>f.kind==='sketch').length<(kind==='artist'?ARTIST_MIN_SKETCHES:1))return kind==='artist'?'Add at least 11 different sketches.':'Add at least one drawing.';
 const required=kind==='artist'?['why','love','spaces']:['spaces'];
 if(required.some(k=>typeof story[k]!=='string'||(story[k] as string).trim().length<2))return 'Tell us a little more in the required story fields.';
 if(kind==='artist'&&(!files.some(f=>f.kind==='video')||!files.some(f=>f.kind==='audio')))return 'Add an introduction video and a short audio recording.';
 return null;
}
export function earnedBadges(kind:string,status:string){
 if(kind!=='artist')return [];
 if(status==='published')return ['Mimi Pip Artist','First Wallpaper','Collection Debut'];
 if(status==='design_approved')return ['Mimi Pip Artist','First Wallpaper'];
 if(status==='accepted')return ['Mimi Pip Artist'];
 return [];
}
