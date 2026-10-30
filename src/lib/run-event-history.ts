type RunEvent={seq:number;event:string;payload:string};

// Reopening a running task displays its existing text in one update.
export function collapseTextHistory(events:RunEvent[]):RunEvent[]{
 let answer='',hasText=false;
 const remaining=events.filter(event=>{
  if(event.event==='text-snapshot'){answer=JSON.parse(event.payload).text;hasText=true;return false;}
  if(event.event==='text-reset'){answer='';hasText=true;return false;}
  if(event.event==='text-delta'){answer+=JSON.parse(event.payload).text;hasText=true;return false;}
  return true;
 });
 if(hasText)remaining.push({seq:events.at(-1)!.seq,event:'text-snapshot',payload:JSON.stringify({text:answer})});
 return remaining;
}
