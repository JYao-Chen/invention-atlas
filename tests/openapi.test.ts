import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openApiDocument,toolInputSchema} from '../src/server/openapi';
import {TOOL_DEFS,paramsSchema} from '../src/server/tools';
import {requiredParameters,stepSchema} from '../src/server/planning';
test('OpenAPI documents each real tool with required parameters and resolvable response schemas',()=>{
 const doc=openApiDocument();assert.equal(doc.openapi,'3.1.0');const ids:string[]=[];
 for(const [name] of TOOL_DEFS){const route=doc.paths['/tools/'+name] as {post:{operationId:string;requestBody:{content:{'application/json':{schema:{properties:{params:unknown}}}}}}};assert.equal(route.post.operationId,name);ids.push(route.post.operationId);const schema=toolInputSchema(name);assert.deepEqual(schema.required,requiredParameters(name));for(const key of Object.keys(schema.properties))assert.ok(key in paramsSchema.shape);}
 assert.equal(new Set(ids).size,TOOL_DEFS.length);
 const serialized=JSON.stringify(doc);for(const match of serialized.matchAll(/#\/components\/schemas\/([A-Za-z]+)/g))assert.ok(match[1] in doc.components.schemas);
 assert.equal(toolInputSchema('generate_wordcloud').properties.top_k.maximum,1000);
 assert.equal(toolInputSchema('analyze_clustering').properties.k.maximum,12);
 assert.equal(toolInputSchema('compare_claims').properties.patent_numbers.maxItems,5);
 assert.equal(toolInputSchema('compare_claims').properties.patent_numbers.minItems,2);
 assert.equal(toolInputSchema('search_patents').properties.query.minLength,1);
 assert.deepEqual(toolInputSchema('analyze_patent_reading').required,['patent_numbers']);
 assert.throws(()=>stepSchema.parse({tool:'analyze_patent_reading',params:{}}));
 assert.throws(()=>stepSchema.parse({tool:'analyze_patent_reading',params:{patent_numbers:[]}}));
 assert.equal(stepSchema.parse({tool:'analyze_patent_reading',params:{patent_numbers:['US123B1']}}).params.patent_numbers?.length,1);
 const readback=doc.paths['/results/{id}'] as {get:{parameters:{name:string;schema:{maximum?:number}}[]}};
 assert.equal(readback.get.parameters.find(p=>p.name==='limit')?.schema.maximum,200);
 assert.ok(readback.get.parameters.some(p=>p.name==='function'));assert.ok(readback.get.parameters.some(p=>p.name==='effect'));
});
test('report download contracts expose snapshot versions and binary document types',()=>{
 const doc=openApiDocument();
 for(const [format,mime] of [['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['pdf','application/pdf']]){
  const route=doc.paths['/reports/{id}/'+format] as {get:{parameters:{name:string;schema:{minimum?:number;default?:number}}[];responses:Record<string,{content:Record<string,{schema:{format:string}}>}>}};
  assert.equal(route.get.parameters.find(p=>p.name==='version')?.schema.minimum,0);assert.equal(route.get.responses[200].content[mime].schema.format,'binary');
  assert.ok(doc.paths['/reports/{id}/publications/{edition}/'+format]);
 }
});
test('scheduled source API declares session-only authorization and the exact supported window bounds',()=>{
 const doc=openApiDocument();
 const route=doc.paths['/source-schedules'] as {post:{security:unknown;requestBody:{content:{'application/json':{schema:{required:string[];properties:{params:{required:string[];properties:Record<string,{minimum?:number;maximum?:number}>};intervalHours:{maximum:number}}}}}}}};
 assert.deepEqual(route.post.security,[{projectSession:[]}]);
 const schema=route.post.requestBody.content['application/json'].schema;
 assert.deepEqual(schema.required,['params','intervalHours','enabled']);
 assert.deepEqual(schema.properties.params.required,['datasetId','offset','batches']);
 assert.equal(schema.properties.params.properties.offset.maximum,49024);assert.equal(schema.properties.params.properties.batches.maximum,10);assert.equal(schema.properties.intervalHours.maximum,8760);
 assert.ok('projectSession' in doc.components.securitySchemes);assert.ok('SourceSchedule' in doc.components.schemas);
});
test('material OCR contract exposes submission, checkpoints and recovery actions',()=>{
 const document=openApiDocument(),paths=document.paths as Record<string,any>;
 const submit=paths['/materials/{id}/ocr'].post;
 assert.ok(submit.responses[202]);
 assert.equal(submit.requestBody.content['application/json'].schema.additionalProperties,false);
 const result=paths['/materials/{id}/ocr/{jobId}'].get.responses[200].content['application/json'].schema;
 assert.equal(result.properties.derived.const,true);
 assert.ok(result.properties.pages.items.properties.meanWordConfidence);
 assert.ok(paths['/materials/{id}/ocr/{jobId}/retry'].post.responses[202]);
 assert.ok(paths['/materials/{id}/ocr/{jobId}/cancel'].post.responses[200]);
});
