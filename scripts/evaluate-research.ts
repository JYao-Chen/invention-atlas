import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runs,patents,setting} from '../src/server/db';
import {judgmentSchema,evaluateRun} from '../src/server/evaluation';
// Reproducible evaluation of saved runs; optional JSONL contains independently reviewed judgments.
const [goldPath,outputPath]=process.argv.slice(2);if(!outputPath)throw new Error('Usage: npx tsx scripts/evaluate-research.ts <judgments.jsonl|-> <output.json>');
const reviewed=goldPath==='-'?[]:readFileSync(resolve(goldPath),'utf8').split('\n').filter(Boolean).map(line=>judgmentSchema.parse(JSON.parse(line)));
const records=runs().filter(r=>r.status!=='running').map(r=>{const saved=setting('evaluation:'+r.id),judgment=reviewed.find(j=>j.runId===r.id)||(saved?judgmentSchema.parse(JSON.parse(saved).judgment):undefined);return {runId:r.id,question:r.question,datasetId:r.datasetId,model:r.model,createdAt:r.createdAt,evaluation:evaluateRun(r,patents(r.datasetId),judgment)};});
for(const j of reviewed)if(!records.some(r=>r.runId===j.runId))throw new Error('标注引用了不存在的运行：'+j.runId);
writeFileSync(resolve(outputPath),JSON.stringify({evaluatedAt:new Date().toISOString(),protocol:'judged-pool-v1',records},null,2));console.log(JSON.stringify({runs:records.length,humanReviewed:records.filter(r=>r.evaluation.human.status==='reviewed').length,output:resolve(outputPath)}));
