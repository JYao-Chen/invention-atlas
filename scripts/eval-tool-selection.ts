import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {toolSelectionDatasetSchema,evaluateToolSelection,TEST_SET_DISCIPLINE} from '../src/server/tool-selection-evaluation';

const {values}=parseArgs({options:{split:{type:'string'},'dry-run':{type:'boolean',default:false}},strict:true});
if(values.split&&!['dev','test'].includes(values.split))throw new Error('--split 必须是 dev 或 test');
console.log(TEST_SET_DISCIPLINE);
const data=toolSelectionDatasetSchema.parse(JSON.parse(await readFile(new URL('../evals/tool-selection/questions.json',import.meta.url),'utf8')));
const cases=data.cases.filter(c=>!values.split||c.split===values.split);
if(values['dry-run'])console.log(JSON.stringify({dryRun:true,seed:data.seed,total:data.cases.length,selected:cases.length,dev:data.cases.filter(c=>c.split==='dev').length,test:data.cases.filter(c=>c.split==='test').length,validToolNames:true}));
else{
 if(!values.split)throw new Error('真实评测必须显式选择 --split dev|test（可能产生模型费用）');
 // Importing the actual Planner is deliberately deferred: dry-run needs neither
 // a database nor model configuration and cannot issue model requests.
 const {planned}=await import('../src/server/agent');
 const {normalize}=await import('../src/server/importers');
 const records=['US100001B1','US100002B1'].map(id=>({...normalize({id,title:'Synthetic authentication sensor',abstract:'A sensor authenticates a network device.',claims:[{number:1,text:'A sensor with a controller.'}],description:'A sensor communicates with a controller.',publicationDate:'2020-01-01',applicants:['Synthetic applicant'],ipc:['H04L9/00'],citations:['US100003B1'],familyMembers:[id],embedding:[1,0],legalStatus:'Active',legalAsOf:'2026-10-29'},'SYNTHETIC EVAL ONLY'),embedding:[1,0]}));
 console.log(JSON.stringify(await evaluateToolSelection(cases,async question=>(await planned(question,records,new AbortController().signal,'tool-selection-eval',undefined,[])).steps.map(s=>s.tool)),null,2));
}
