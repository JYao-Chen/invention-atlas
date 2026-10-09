import {dataset,patents,savePatent,updateDataset} from '../src/server/db';
import {embed} from '../src/server/model';
const meta=dataset();if(!meta)throw new Error('请先获取真实数据');
const records=patents(meta.id),missing=records.filter(p=>!p.embedding);
for(let offset=0;offset<missing.length;offset+=10){const batch=missing.slice(offset,offset+10);const vectors=await embed(batch.map(p=>p.title+'\n'+p.abstract));batch.forEach((p,i)=>savePatent(meta.id,{...p,embedding:vectors[i]}));console.log(`已索引 ${Math.min(offset+10,missing.length)}/${missing.length}`);}
meta.indexed=records.length;updateDataset(meta);console.log('真实专利语义索引完成');
