import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {postgresPool,withAccess,connection} from '../src/server/postgres';
import {IdentityStore} from '../src/server/identity';
import {ProjectMaterials} from '../src/server/project-materials';
import {submitMaterialOcr,executeMaterialOcr,materialOcrStatus,retryMaterialOcr,materialOcrResults} from '../src/server/material-ocr-job';
import {JobStore} from '../src/server/job-store';
import {executeNextJob} from '../src/server/job-worker';
import {materialOcrEndpoint} from '../src/server/material-ocr-api';
import {materialProposal} from '../src/server/material-proposal';
import {createMaterialNovelty} from '../src/server/material-novelty';
import {ProfessionalStore} from '../src/server/professional-store';
import {PostgresStore} from '../src/server/postgres-store';
import {datasetMeta} from '../src/server/importers';
function blankPdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];let content='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(content));content+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});const xref=Buffer.byteLength(content);return content+'xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
}
test('material OCR queue works without datasets, prevents duplicates and resumes saved pages',async()=>{
 const admin=postgresPool(),identity=await new IdentityStore(admin).initializeAdmin('ocr-admin','ocr-password-123','OCR fixture'),scope={userId:identity.user!.id,organizationId:identity.organizationId,projectId:identity.projectId};
 const schema=(await admin.query('SELECT current_schema() AS name')).rows[0].name,role='ocr_'+randomUUID().replaceAll('-',''),root=await mkdtemp(join(tmpdir(),'atlas-ocr-queue-test-')),previous=process.env.PATENT_DATA_DIR;process.env.PATENT_DATA_DIR=root;
 let runtime:ReturnType<typeof postgresPool>|undefined;
 try{
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());
  const job=await withAccess(scope,async()=>{const material=await new ProjectMaterials(runtime!).create(new File([blankPdf()],'scan.pdf'));const job=await submitMaterialOcr(runtime!,{materialId:material.id});assert.equal(job.runId,null);await assert.rejects(submitMaterialOcr(runtime!,{materialId:material.id}),/已有OCR任务/);await assert.rejects(submitMaterialOcr(runtime!,{materialId:material.id,pages:[2]}),/超出/);await connection(runtime!).query('INSERT INTO material_ocr_pages(job_id,page,organization_id,project_id,payload) VALUES($1,1,$2,$3,$4)',[job.id,scope.organizationId,scope.projectId,JSON.stringify({page:1,text:'SYNTHETIC CHECKPOINT',method:'ocr'})]);return job;});
  const queue=new JobStore(admin),execute=async()=>{await executeNextJob({queue,workerId:'ocr-fixture',signal:new AbortController().signal,execute:async(claimed,signal)=>{assert.equal(claimed.kind,'material-ocr');if(claimed.kind==='material-ocr')await executeMaterialOcr(runtime!,claimed,signal);}});};
  await execute();assert.equal((await queue.get(job.id))?.state,'completed');
  await admin.query("UPDATE jobs SET state='failed' WHERE id=$1",[job.id]);
  await withAccess(scope,async()=>{if(job.kind!=='material-ocr')return;const other=await submitMaterialOcr(runtime!,{materialId:job.materialId,pages:[1]});await assert.rejects(retryMaterialOcr(runtime!,job.id),/已有OCR任务/);await new JobStore(runtime!).cancel(other.id);await retryMaterialOcr(runtime!,job.id);});await execute();
  await withAccess(scope,async()=>{const jobs=await materialOcrStatus(runtime!,job.kind==='material-ocr'?job.materialId:''),resumed=jobs.find(item=>item.id===job.id);assert.equal(resumed?.done,1);assert.equal(resumed?.state,'completed');});
  await withAccess(scope,async()=>{assert.equal(job.kind,'material-ocr');if(job.kind!=='material-ocr')return;const result=await materialOcrResults(runtime!,job.materialId,job.id);assert.equal(result.done,1);assert.equal(result.pages[0].text,'SYNTHETIC CHECKPOINT');assert.equal(result.derived,true);await assert.rejects(materialOcrResults(runtime!,job.materialId,randomUUID()),/不属于/);});
  await withAccess(scope,async()=>{if(job.kind!=='material-ocr')return;const path=['materials',job.materialId,'ocr',job.id];const response=await materialOcrEndpoint(new Request('http://local/api/'+path.join('/')),path,runtime!);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.json()).pages[0].text,'SYNTHETIC CHECKPOINT');const cancelled=await materialOcrEndpoint(new Request('http://local/cancel',{method:'POST'}),[...path,'cancel'],runtime!);assert.equal((await cancelled.json()).cancelRequested,false);await assert.rejects(materialOcrEndpoint(new Request('http://local/api'),['materials',job.materialId,'ocr',randomUUID()],runtime!),/不属于/);});
  assert.equal((await admin.query('SELECT count(*)::int AS count FROM runs')).rows[0].count,0);
  await withAccess(scope,async()=>{
   const text='SYNTHETIC MATERIAL PROPOSAL\n技术方案：传感器连接控制器。',materials=new ProjectMaterials(runtime!),material=await materials.create(new File([text],'proposal.txt'));
   assert.equal(await materialProposal(runtime!,{id:material.id,filename:material.filename}),text);await assert.rejects(materialProposal(runtime!,{id:material.id,filename:'wrong.txt'}),/文件名/);await assert.rejects(materialProposal(runtime!,{id:material.id,filename:material.filename,pages:[1]}),/页码/);
   const meta=datasetMeta('SYNTHETIC material novelty scope',[],'fixture','TEST ONLY');await new PostgresStore(runtime!).saveDataset(meta,[]);
   const task=await createMaterialNovelty(runtime!,material.id,{datasetId:meta.id});assert.equal(task.status,'ready');assert.equal(task.input.proposal,text);assert.equal(task.input.materialOrigin.id,material.id);
   await assert.rejects(new ProfessionalStore(runtime!).create({workflow:'novelty-search',datasetId:meta.id,proposal:'A DIFFERENT SYNTHETIC PROPOSAL INPUT',materialOrigin:{id:material.id,filename:material.filename}}),/不一致/);
   await materials.remove(material.id);assert.equal((await new ProfessionalStore(runtime!).get(task.id))?.input.proposal,text);await assert.rejects(createMaterialNovelty(runtime!,material.id,{datasetId:meta.id}),/无访问权限/);
  });
  await admin.query("UPDATE project_members SET role='reader' WHERE project_id=$1 AND user_id=$2",[scope.projectId,scope.userId]);
  await withAccess(scope,async()=>{if(job.kind!=='material-ocr')return;assert.equal((await materialOcrResults(runtime!,job.materialId,job.id)).done,1);for(const action of ['',job.id+'/cancel',job.id+'/retry']){const path=['materials',job.materialId,'ocr',...action.split('/').filter(Boolean)];const response=await materialOcrEndpoint(new Request('http://local/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),path,runtime!);assert.equal(response.status,403);}await assert.rejects(submitMaterialOcr(runtime!,{materialId:job.materialId,pages:[1]}),/row-level security/);});
  await admin.query("UPDATE project_members SET role='owner' WHERE project_id=$1 AND user_id=$2",[scope.projectId,scope.userId]);
  await withAccess(scope,async()=>{if(job.kind!=='material-ocr')return;const pending=await submitMaterialOcr(runtime!,{materialId:job.materialId,pages:[1]});const materials=new ProjectMaterials(runtime!);await materials.remove(job.materialId);assert.equal((await new JobStore(runtime!).get(pending.id))?.state,'cancelled');await assert.rejects(materialOcrResults(runtime!,job.materialId,job.id),/无访问权限/);await assert.rejects(retryMaterialOcr(runtime!,pending.id),/已移除/);await materials.restore(job.materialId);assert.equal((await materialOcrResults(runtime!,job.materialId,job.id)).done,1);assert.equal((await new JobStore(runtime!).get(pending.id))?.state,'cancelled');});
  if(process.env.PATENT_OCR_TEST_PDF){
   const bytes=await readFile(process.env.PATENT_OCR_TEST_PDF);
   const realJob=await withAccess(scope,async()=>{const material=await new ProjectMaterials(runtime!).create(new File([new Uint8Array(bytes)],'synthetic-image.pdf'));assert.equal(material.extraction.pages[0].status,'needs_ocr');const response=await materialOcrEndpoint(new Request('http://local/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),['materials',material.id,'ocr'],runtime!);assert.equal(response.status,202);return await response.json() as typeof job;});
   await withAccess(scope,async()=>{if(realJob.kind!=='material-ocr')throw new Error('错误任务类型');const path=['materials',realJob.materialId,'ocr',realJob.id];const cancel=await materialOcrEndpoint(new Request('http://local/cancel',{method:'POST'}),[...path,'cancel'],runtime!);assert.equal((await cancel.json()).cancelRequested,true);assert.equal((await new JobStore(runtime!).get(realJob.id))?.state,'cancelled');const retry=await materialOcrEndpoint(new Request('http://local/retry',{method:'POST'}),[...path,'retry'],runtime!);assert.equal(retry.status,202);assert.equal((await new JobStore(runtime!).get(realJob.id))?.state,'queued');});
   await withAccess(scope,async()=>{if(realJob.kind!=='material-ocr')throw new Error('错误任务类型');await assert.rejects(createMaterialNovelty(runtime!,realJob.materialId,{datasetId:'not-used-before-ocr-check',ocrJobId:realJob.id}),/先完成OCR/);});
   const worker=spawn(process.execPath,['--import','tsx','scripts/agent-worker.ts'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:url.toString(),QUEUE_DATABASE_URL:process.env.DATABASE_URL},stdio:['ignore','pipe','pipe']});
   let output='';worker.stdout.on('data',data=>{output+=data;});worker.stderr.on('data',data=>{output+=data;});
   const exited=new Promise<number|null>(resolve=>worker.once('exit',resolve));
   try{
    const deadline=Date.now()+(process.env.PATENT_MINERU_API_KEY?180000:30000);
    while(Date.now()<deadline){const state=(await queue.get(realJob.id))?.state;if(['completed','failed','cancelled'].includes(state||''))break;if(worker.exitCode!==null)throw new Error('独立worker提前退出：'+output);await delay(100);}
    assert.equal((await queue.get(realJob.id))?.state,'completed',output);
    assert.ok(output.includes('Agent worker ready:'),output);
   }finally{worker.kill('SIGTERM');await exited;}
   await withAccess(scope,async()=>{if(realJob.kind!=='material-ocr')throw new Error('错误任务类型');const result=await materialOcrResults(runtime!,realJob.materialId,realJob.id);assert.equal(result.state,'completed');assert.equal(result.done,1);assert.equal(result.pages[0].status,'recognized');assert.ok(result.pages[0].text.includes('TECHNICAL DISCLOSURE'));assert.ok(result.pages[0].text.replace(/\s+/g,'').includes('技术方案'));assert.equal((await new ProjectMaterials(runtime!).read(realJob.materialId)).extraction.pages[0].status,'needs_ocr');
    if(process.env.PATENT_MINERU_API_KEY){assert.equal(result.pages[0].engine,'mineru-cloud');const parts=(await connection(runtime!).query('SELECT payload FROM material_ocr_parts WHERE job_id=$1',[realJob.id])).rows;assert.equal(parts.length,1);assert.equal(parts[0].payload.checkpoint.uploaded,true);assert.equal(parts[0].payload.results[0].page,1);}
   });
   await withAccess(scope,async()=>{
    if(realJob.kind!=='material-ocr')throw new Error('错误任务类型');
    const meta=datasetMeta('SYNTHETIC OCR novelty scope',[],'fixture','TEST ONLY');await new PostgresStore(runtime!).saveDataset(meta,[]);
    const result=await materialOcrResults(runtime!,realJob.materialId,realJob.id),task=await createMaterialNovelty(runtime!,realJob.materialId,{datasetId:meta.id,ocrJobId:realJob.id,pages:[1]});
    assert.equal(task.input.proposal,result.pages[0].text.trim());assert.equal(task.input.materialOrigin.ocrJobId,realJob.id);assert.deepEqual(task.input.materialOrigin.pages,[1]);
    await assert.rejects(createMaterialNovelty(runtime!,realJob.materialId,{datasetId:meta.id,ocrJobId:realJob.id,pages:[2]}),/页码/);
    await assert.rejects(createMaterialNovelty(runtime!,realJob.materialId,{datasetId:meta.id}),/至少需要20字符/);
   });
  }
 }finally{if(runtime)await runtime.end();await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);if(previous===undefined)delete process.env.PATENT_DATA_DIR;else process.env.PATENT_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
