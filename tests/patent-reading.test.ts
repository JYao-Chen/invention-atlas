import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../src/server/importers';
import {readPatentMechanism,readingRowSources} from '../src/server/patent-reading';
test('mechanism reading preserves separate problem means effect and exact source',async()=>{
 const patent=normalize({id:'TEST',abstract:'Delays occur. We cache messages. This reduces delay.'},'TEST');
 const notes=await readPatentMechanism(patent,new AbortController().signal,async()=>JSON.stringify({problem:[{interpretation:'延迟问题',quote:'Delays occur.'}],means:[{interpretation:'缓存消息',quote:'We cache messages.'}],effect:[{interpretation:'降低延迟',quote:'This reduces delay.'}]}));
 assert.deepEqual(notes.map(n=>n.kind),['problem','means','effect']);for(const note of notes)assert.equal(patent.abstract.slice(note.start,note.end),note.quote);assert.match(notes[2].assessment,/非独立验证/);
});
test('reading retains multiple means and locates split claims in the original saved item',async()=>{
 const text='**1**. A sensor.\n**2**. A valve and a controller.',patent=normalize({id:'TEST',claims:[{number:1,text}]},'TEST');
 const notes=await readPatentMechanism(patent,new AbortController().signal,async(_instruction,context)=>{const part=JSON.parse(context);return JSON.stringify({problem:[],effect:[],means:part.claimNumber===2?[{interpretation:'阀门',quote:'A valve'},{interpretation:'控制器',quote:'a controller.'}]:[]});});
 assert.equal(notes.length,2);for(const note of notes){assert.equal(note.claimNumber,2);assert.equal(note.source_claim,1);assert.equal(text.slice(note.source_claim_offset,note.source_claim_offset!+note.quote.length),note.quote);}
 const sources=readingRowSources(notes.map(note=>({...note,patent:patent.id})),[patent]);assert.equal(sources[0].representatives[0].claim,1);assert.equal(sources[0].representatives[0].quote,notes[0].quote);assert.equal(sources[0].representatives[0].offset,notes[0].source_claim_offset);
 assert.throws(()=>readingRowSources([{...notes[0],patent:patent.id,quote:'fabricated'}],[patent]),/不一致/);
});
test('absent disclosures remain empty and invented quotes fail bounded repair',async()=>{
 const patent=normalize({id:'TEST',abstract:'Only a device.'},'TEST'),signal=new AbortController().signal;
 assert.deepEqual(await readPatentMechanism(patent,signal,async()=>JSON.stringify({problem:[],means:[],effect:[]})),[]);
 let calls=0;await assert.rejects(readPatentMechanism(patent,signal,async()=>{calls++;return JSON.stringify({problem:[],means:[],effect:[{interpretation:'提升效果',quote:'Invented effect.'}]});}),/不能定位/);assert.equal(calls,2);
});
test('reading checkpoints reuse completed sections but not changed source text',async()=>{
 const patent=normalize({id:'TEST',abstract:'Original abstract.',description:'Original description.'},'TEST'),saved=new Map<string,unknown>(),signal=new AbortController().signal;
 const options={load:async(part:{section:string})=>saved.get(part.section),save:async(part:{section:string},value:unknown)=>{saved.set(part.section,value);}};
 let calls=0;await assert.rejects(readPatentMechanism(patent,signal,async()=>{calls++;if(calls>1)throw new Error('provider failed');return JSON.stringify({problem:[],means:[],effect:[]});},options),/provider failed/);assert.equal(saved.size,1);
 calls=0;await readPatentMechanism(patent,signal,async()=>{calls++;return JSON.stringify({problem:[],means:[],effect:[]});},options);assert.equal(calls,1);
 calls=0;await readPatentMechanism({...patent,abstract:'Changed abstract.'},signal,async()=>{calls++;return JSON.stringify({problem:[],means:[],effect:[]});},options);assert.equal(calls,1);
});
