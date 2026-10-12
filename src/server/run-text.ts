import type {Run} from '@/lib/types';
import {event,saveRun} from './db';

// Deltas remain durable; the much larger run snapshot is checkpointed once per second.
export function runTextWriter(run:Run,writeEvent=event,writeRun=saveRun,clock=Date.now){
 let lastSaved=clock();
 return {
  async push(text:string){
   run.answer+=text;
   await writeEvent(run.id,'text-delta',{text});
   const now=clock();
   if(now-lastSaved>=1000){await writeRun(run);lastSaved=now;}
  },
  async flush(){await writeRun(run);lastSaved=clock();},
 };
}
