import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Dataset,Patent} from '../src/lib/types';
import {guideChapters} from '../src/lib/help-guide';
import {professionalExamples,professionalPreset,toolExampleParams} from '../src/lib/guide-launch';
const dataset={id:'SYNTHETIC-D',years:['2030','2031','2032']} as Dataset;
const records=[{id:'SYNTHETIC-A',applicants:['SYNTHETIC 企业甲'],ipc:['H04L9/00']},{id:'SYNTHETIC-B',applicants:['SYNTHETIC 企业乙'],ipc:['H04L9/32']}] as Patent[];
test('four professional examples resolve to their real workflow forms',()=>{
 assert.equal(Object.keys(professionalExamples).length,4);
 for(const [id,example] of Object.entries(professionalExamples)){assert.deepEqual(guideChapters.find(chapter=>chapter.id===id)?.example,example);const preset=professionalPreset(example.workflow,dataset,records);assert.equal(preset.datasetId,dataset.id);assert.equal(preset.yearEnd,2032);assert.equal(preset.counting,'publication');}
});
test('professional presets use current years and real applicant names',()=>{
 const competitor=professionalPreset('competitor-analysis',dataset,records);assert.equal(competitor.entities,'SYNTHETIC 企业甲\nSYNTHETIC 企业乙');assert.equal(competitor.yearStart,2030);assert.equal(competitor.ipc,undefined);
 const landscape=professionalPreset('technology-landscape',dataset,records);assert.equal(landscape.yearStart,2031);assert.equal(landscape.ipc,'H04L');
 const novelty=professionalPreset('novelty-search',dataset,records);assert.ok(novelty.proposal!.startsWith('演示方案：'));assert.ok(novelty.proposal!.length>=20);
 const layout=professionalPreset('patent-layout',dataset,records);assert.ok(layout.objective!.length>=10);
 assert.equal(professionalPreset('competitor-analysis',dataset,[]).entities,'');
});
test('tool presets preserve catalogue parameters and current patent references',()=>{
 const defaults={top_k:17,k:4};const params=toolExampleParams('search_patents',defaults,records);assert.equal(params.top_k,17);assert.ok(params.query);assert.deepEqual(defaults,{top_k:17,k:4});
 assert.deepEqual(toolExampleParams('compare_claims',{},records).patent_numbers,['SYNTHETIC-A','SYNTHETIC-B']);
 assert.deepEqual(toolExampleParams('analyze_claim_elements',{patent_numbers:['SYNTHETIC-SERVER']},records).patent_numbers,['SYNTHETIC-SERVER']);
 assert.ok(toolExampleParams('search_patent_passages',{},records).query);
});
test('non-tool guide entries target actual management modules',()=>{
 for(const [id,module] of [['workspace','workspace'],['materials','materials'],['disclosures','disclosures'],['integrations','credentials']])assert.equal(guideChapters.find(chapter=>chapter.id===id)?.module,module);
});
