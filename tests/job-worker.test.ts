import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeNextJob} from '../src/server/job-worker';
import {currentAccess} from '../src/server/postgres';
import type {Job} from '../src/server/job-store';
const job:Job={id:'job',runId:'run',actorId:'actor',organizationId:'org',projectId:'project',kind:'analysis',payload:{},state:'running',attempts:1,workerId:'worker',cancelRequested:false};

test('worker executes with job identity and commits completion only under a live lease',async()=>{
 let finish='';let pulses=0;
 const queue={claim:async()=>job,get:async()=>job,heartbeat:async()=>{pulses++;return true;},finish:async(_id:string,_worker:string,state:string)=>{finish=state;return true;}};
 assert.equal(await executeNextJob({queue,workerId:'worker',signal:new AbortController().signal,execute:async()=>{assert.deepEqual(currentAccess(),{userId:'actor',organizationId:'org',projectId:'project'});}}),true);
 assert.equal(finish,'completed');assert.equal(pulses,2);assert.equal(currentAccess(),undefined);
});

test('cancelled jobs never execute; lost leases and shutdown never commit stale completion',async()=>{
 let finish='';let executed=false;
 const queue={claim:async()=>job,get:async()=>({...job,cancelRequested:true}),heartbeat:async()=>true,finish:async(_id:string,_worker:string,state:string)=>{finish=state;return true;}};
 await executeNextJob({queue,workerId:'worker',signal:new AbortController().signal,execute:async()=>{executed=true;}});
 assert.equal(executed,false);assert.equal(finish,'cancelled');
 finish='';await executeNextJob({queue:{...queue,get:async()=>job,heartbeat:async()=>false},workerId:'worker',signal:new AbortController().signal,execute:async()=>{executed=true;}});
 assert.equal(finish,'');assert.equal(executed,false);
 const shutdown=new AbortController();
 await executeNextJob({queue:{...queue,get:async()=>job},workerId:'worker',signal:shutdown.signal,execute:async(_job,signal)=>{shutdown.abort();assert.equal(signal.aborted,true);}});
 assert.equal(finish,'');
});

test('cancellation persists its business outcome with the submitting identity before releasing the job',async()=>{
 const order:string[]=[];
 const queue={claim:async()=>job,get:async()=>({...job,cancelRequested:true}),heartbeat:async()=>true,finish:async()=>{order.push('finish');return true;}};
 await executeNextJob({queue,workerId:'worker',signal:new AbortController().signal,execute:async()=>{assert.fail('cancelled job executed');},onCancelled:async()=>{assert.equal(currentAccess()?.userId,'actor');order.push('cancel');}});
 assert.deepEqual(order,['cancel','finish']);
});
