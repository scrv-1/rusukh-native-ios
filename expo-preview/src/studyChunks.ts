export type StudyChunk = {index:number;start:number;end:number;text:string};
/** UTF-16 offsets are explicit. Chunks cover all characters; no source is dropped. */
export function studyChunks(text:string, limit=1600):StudyChunk[] {
  if (!Number.isInteger(limit) || limit < 32 || limit > 10000) throw new Error('Invalid chunk limit');
  const chunks:StudyChunk[]=[];
  let start=0;
  while(start < text.length) {
    let end=Math.min(start+limit,text.length);
    if (end<text.length) {
      const floor=start+Math.floor(limit/2);
      const para=text.lastIndexOf('\n',end-1);
      const sentence=Math.max(text.lastIndexOf('。',end-1),text.lastIndexOf('؟',end-1),text.lastIndexOf('.',end-1));
      const space=text.lastIndexOf(' ',end-1);
      const boundary=para>=floor?para:sentence>=floor?sentence:space>=floor?space:-1;
      if(boundary>=floor) end=boundary+1;
      const code=text.charCodeAt(end-1);
      if(code>=0xd800 && code<=0xdbff) end--;
    }
    chunks.push({index:chunks.length,start,end,text:text.slice(start,end)});start=end;
  }
  // The AI source contract needs 30 trimmed UTF-16 characters. Retain adjacent
  // context for a short final fact instead of exposing an unusable last button.
  // Some custom limits / whitespace-only tails cannot satisfy both bounds;
  // exact source coverage and the caller's size limit still take precedence.
  if (chunks.length > 1 && chunks[chunks.length-1].text.trim().length < 30) {
    const last=chunks[chunks.length-1];
    const previous=chunks[chunks.length-2];
    const combined=previous.text+last.text;
    let boundary=combined.trimEnd().length-30;
    while(boundary>0 && /\s/u.test(combined[boundary])) boundary--;
    const preceding=combined.charCodeAt(boundary-1);
    if(preceding>=0xd800 && preceding<=0xdbff) boundary--;
    if(boundary>0) {
      const before=combined.slice(0,boundary),after=combined.slice(boundary);
      if(before.trim().length>=30 && after.trim().length>=30 && before.length<=limit && after.length<=limit) {
        previous.end=previous.start+boundary;previous.text=before;
        last.start=previous.end;last.text=after;
      }
    }
  }
  return chunks;
}
