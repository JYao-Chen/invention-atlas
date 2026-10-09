import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {modelConfig,publicModelSettings,resolveModelSettings,saveModelSettings} from '../src/server/config';
import {chat,embed} from '../src/server/model';

test('persistent model settings keep blank keys, never expose keys, and preserve embedding connection',async()=>{
 const root=mkdtempSync(join(tmpdir(),'patent-model-settings-'));
 const beforeDir=process.env.PATENT_DATA_DIR,originalFetch=globalThis.fetch;
 process.env.PATENT_DATA_DIR=root;
 try{
  const initial=modelConfig();
  saveModelSettings({model:' local-model ',base:'http://127.0.0.1:9876/v1/',apiKey:'test-secret-not-real'});
  assert.equal(modelConfig().model,'local-model');assert.equal(modelConfig().base,'http://127.0.0.1:9876/v1');
  saveModelSettings({model:'second-model',base:'http://127.0.0.1:9876/v1',apiKey:''});
  assert.equal(modelConfig().key,'test-secret-not-real');assert.equal(modelConfig().embeddingKey,initial.embeddingKey);assert.equal(modelConfig().embeddingBase,initial.embeddingBase);
  assert.ok(!JSON.stringify(publicModelSettings()).includes('test-secret'));assert.equal('key' in publicModelSettings(),false);
  assert.equal(statSync(join(root,'model-config.json')).mode&0o777,0o600);
  assert.equal(JSON.parse(readFileSync(join(root,'model-config.json'),'utf8')).model,'second-model');
  assert.equal(resolveModelSettings({model:'draft',base:'https://example.com/v1',apiKey:''}).key,'test-secret-not-real');
  assert.equal(modelConfig().model,'second-model','testing a draft does not persist');
  assert.throws(()=>saveModelSettings({model:'',base:'bad'}));assert.throws(()=>saveModelSettings({model:'x',base:'file:///tmp/model'}));assert.throws(()=>saveModelSettings({model:'x',base:'https://example.com/v1',embedding:'other'}));
  let calls=0;
  globalThis.fetch=async(input,init)=>{calls++;const body=JSON.parse(String(init?.body));if(String(input).endsWith('/chat/completions')){assert.equal(String(input),'http://127.0.0.1:9876/v1/chat/completions');assert.equal(body.model,'second-model');assert.equal(body.enable_thinking,undefined);assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-secret-not-real');return new Response(JSON.stringify({choices:[{message:{content:'连接正常'},finish_reason:'stop'}]}));}
   assert.equal(String(input),initial.embeddingBase+'/embeddings');assert.equal(body.model,initial.embedding);return new Response(JSON.stringify({data:[{index:0,embedding:Array(1024).fill(0.1)}]}));};
  assert.equal(await chat('test','test'),'连接正常');
  if(initial.embeddingKey){assert.equal((await embed(['source']))[0].length,1024);assert.equal(calls,2);}else assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;if(beforeDir===undefined)delete process.env.PATENT_DATA_DIR;else process.env.PATENT_DATA_DIR=beforeDir;rmSync(root,{recursive:true});}
});
