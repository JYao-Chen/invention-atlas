import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mineruSettings,publicMineruSettings,saveMineruSettings} from '../src/server/mineru-settings';
test('MinerU settings preserve existing keys, encrypt saved values and never expose secrets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-ocr-settings-')),names=['PATENT_DATA_DIR','PATENT_MODEL_CREDENTIAL_KEY','PATENT_MINERU_API_KEY'],previous=names.map(name=>process.env[name]);
 try{process.env.PATENT_DATA_DIR=dir;process.env.PATENT_MODEL_CREDENTIAL_KEY='a'.repeat(64);process.env.PATENT_MINERU_API_KEY='existing-private-key';assert.equal(publicMineruSettings().configured,true);const data={base:'https://mineru.net/api/v4',model:'vlm',language:'ch',apiKey:''};saveMineruSettings(data);assert.equal(mineruSettings().apiKey,'existing-private-key');assert.ok(!readFileSync(join(dir,'mineru-config.json'),'utf8').includes('existing-private-key'));assert.ok(!JSON.stringify(publicMineruSettings()).includes('existing-private-key'));saveMineruSettings({...data,apiKey:'replacement-private-key'});assert.equal(mineruSettings().apiKey,'replacement-private-key');saveMineruSettings({...data,language:'en'});assert.equal(mineruSettings().apiKey,'replacement-private-key');assert.equal(mineruSettings().language,'en');assert.throws(()=>saveMineruSettings({...data,base:'file:///tmp'}));}
 finally{names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});rmSync(dir,{recursive:true});}
});
