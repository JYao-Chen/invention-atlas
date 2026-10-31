'use client';
import {resultText} from '@/lib/result-copy';
import {useEffect,useState,useRef} from 'react';
import {MessagesSquare,FileText,LogOut,Plus,Send,Square,PanelRight,Search,ArrowUpRight,ChevronDown,ChevronLeft,X,Play,RefreshCw,ShieldCheck,Upload} from 'lucide-react';
import Markdown from './MathMarkdown';
import TechnicalDisclosures from './TechnicalDisclosures';
import type {GuideChapter} from '@/lib/help-guide';
import {professionalPreset,toolExampleParams,type ProfessionalLaunch} from '@/lib/guide-launch';
import MonitorSubscriptions from './MonitorSubscriptions';
import SourceUpdates from './SourceUpdates';
import SourceVersions from './SourceVersions';
import ProjectEntry,{type Workspace} from './ProjectEntry';
import WorkspaceManager from './WorkspaceManager';
import AccountSettings from './AccountSettings';
import ModelUsage from './ModelUsage';
import ApiCredentials from './ApiCredentials';
import OrganizationModel from './OrganizationModel';
import OcrSettings from './OcrSettings';
import OrganizationManager from './OrganizationManager';
import UserManager from './UserManager';
import PatentAnnotations from './PatentAnnotations';
import ClaimReader from './ClaimReader';
import PatentEvidence from './PatentEvidence';
import type {PatentEvidenceLocation} from '../lib/patent-evidence';
import RecordLabelFilter,{type RecordLabelSelection} from './RecordLabelFilter';
import ReportDraftEditor from './ReportDraftEditor';
import ReceivedReports from './ReceivedReports';
import ReportTaskInbox from './ReportTaskInbox';
import TaskNotifications from './TaskNotifications';
import ProfessionalTasks from './ProfessionalTasks';
import DeepResearch from './DeepResearch';
import FulltextSearch from './FulltextSearch';
import type {Dataset,Patent,AnalysisResult,Run,Conversation,Params,Starter,StarterPool} from '@/lib/types';
import ResultView from './ResultView';
import ExecutionProgress from './ExecutionProgress';
import ReportReview from './ReportReview';
import RetrievalExperiments from './RetrievalExperiments';
import {ExternalCoverage,PatentPapers} from './ExternalReferences';
import SuggestedQuestions from './SuggestedQuestions';
import PatentComposer from './PatentComposer';
import PatentNarrative from './PatentNarrative';
import AnalysisProcess from './AnalysisProcess';
import RunBudget from './RunBudget';
import AtlasNavigation,{atlasPages} from './AtlasNavigation';
import DataResearchPanel from './DataResearchPanel';
import SourceAcquisition from './SourceAcquisition';
import ToolPicker,{type Tool} from './ToolPicker';
import ModelSettings from './ModelSettings';
import IndexProgress from './IndexProgress';
import DataRecords from './DataRecords';
import HelpManual from './HelpManual';
import {restoredNavigation} from '@/lib/navigation-state';
import {readEventStream as readSSE} from '@/lib/event-stream';
// Workbench overview runs these tools directly; the assistant's demo question lives in the help manual.
const OVERVIEW_TOOLS=['get_dataset_summary','analyze_entity_portfolio','analyze_clustering','analyze_patent_valuation','analyze_citation_network','analyze_claim_elements'];
async function api(path:string,body?:unknown,method?:string){const response=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;}
const titles=atlasPages;
function defaults(tool:string,first?:string):Params{if(tool==='search_patents')return {query:'blockchain digital identity authentication',top_k:10};if(tool==='read_patent_details'||tool==='analyze_claim_elements')return {patent_numbers:first?[first]:[]};if(tool==='audit_search_strategy')return {strategies:[{name:'v1',query:'blockchain'},{name:'v2',query:'blockchain identity authentication'}],top_k:20};if(tool==='monitor_patent_changes')return {query:'blockchain',strategy_id:'blockchain-monitor',top_k:20};if(tool==='analyze_clustering')return {k:6};return {};}
export default function Workbench(){
 const [deepOpen,setDeepOpen]=useState(false),[deepGoal,setDeepGoal]=useState('');
 const [registering,setRegistering]=useState(false),[signingIn,setSigningIn]=useState(false);
 const [workspace,setWorkspace]=useState<Workspace>();
 const readOnly=workspace?.projects.find(project=>project.id===workspace.current?.id)?.role==='reader';
 async function refreshWorkspace(){const next:Workspace=await api('workspace');setWorkspace(next);return next;}
 const [patentDatasetId,setPatentDatasetId]=useState<string>();
 const [patentEvidence,setPatentEvidence]=useState<PatentEvidenceLocation>();
 const [recordLabel,setRecordLabel]=useState<RecordLabelSelection>(null);
 const recordsRequest=useRef(0);
 const dataRequest=useRef(0);
 async function selectProject(projectId:string){await api('workspace',{projectId},'PATCH');sessionStorage.removeItem('patent-conversation');sessionStorage.removeItem('atlas-navigation');location.reload();}
 const submitting=useRef('');
 const [modelCallLimit,setModelCallLimit]=useState('');
 const guideSequence=useRef(0),management=useRef<HTMLDetailsElement>(null);
 const [professionalLaunch,setProfessionalLaunch]=useState<ProfessionalLaunch>(),[workspaceOpen,setWorkspaceOpen]=useState<number>(),[credentialsOpen,setCredentialsOpen]=useState<number>(),[materialsOpen,setMaterialsOpen]=useState<{id:number;part:'materials'|'disclosures'}>();
 async function openGuideFunction(chapter:GuideChapter,mode?:'fill'|'run'|'assistant'){
  const example=Boolean(mode);
  if(mode==='assistant'&&chapter.question){
   const question=chapter.question,tool=chapter.tool&&tools.find(t=>t.name===chapter.tool);setReport(undefined);setError('');setView('analysis');setMobileFocus(true);history.replaceState(null,'',location.pathname);
   if(!meta){setError('请先选择数据集，再填入分析助手。');return;}
   if(tool&&!tool.available){setError('当前数据集缺少“'+tool.title+'”所需字段，助手无法运行该示例。');return;}
   chosenStarter.current=tool?{name:tool.name,title:tool.title,group:tool.group,question,datasetId:meta.id,params:toolExampleParams(tool.name,tool.defaultParams||defaults(tool.name,records[0]?.id),records)}:undefined;
   setText(question);setTimeout(()=>document.querySelector<HTMLTextAreaElement>('.patent-composer textarea')?.focus(),50);return;
  }
  const id=++guideSequence.current;setReport(undefined);setError('');
  if(chapter.example){if(!meta){setError('请先选择数据集，再打开专业任务。');return;}try{const sample=example?(await api('patents?'+new URLSearchParams({dataset:meta.id,page:'1',q:''}))).records:[];if(id!==guideSequence.current)return;setProfessionalLaunch({id,workflow:chapter.example.workflow,preset:example?professionalPreset(chapter.example.workflow,meta,sample):{datasetId:meta.id},question:example?chapter.example.question:undefined});}catch(error){setError('读取演示参数失败：'+(error as Error).message);}return;}
  if(chapter.module==='workspace'||chapter.module==='credentials'){if(management.current)management.current.open=true;if(chapter.module==='workspace')setWorkspaceOpen(id);else setCredentialsOpen(id);return;}
  if(chapter.module==='research'){setDeepGoal('');setDeepOpen(true);history.replaceState(null,'',location.pathname);return;}
  if(chapter.module==='materials'||chapter.module==='disclosures'){setView('reports');setMobileFocus(false);setMaterialsOpen({id,part:chapter.module});return;}
  if(chapter.module==='review'){history.replaceState(null,'',location.pathname);setMobileFocus(false);const latest=reports[0];if(latest){nextReportTab.current='review';setReport(latest);setView('analysis');}else{setView('reports');setNotice('报告库还没有已保存报告。先在分析助手完成一次分析并保存报告，再打开逐条复核。');}return;}
  setView(chapter.target==='assistant'?'analysis':chapter.target);setMobileFocus(chapter.target==='assistant');
  history.replaceState(null,'',location.pathname);
  if(chapter.tool){
   const tool=tools.find(t=>t.name===chapter.tool),initial=tool?.defaultParams||defaults(chapter.tool,records[0]?.id),params=example?toolExampleParams(chapter.tool,initial,records):initial;
   setSelectedTool(chapter.tool);setParameters(JSON.stringify(params,null,2));
   if(mode==='run'){if(tool&&!tool.available){setError('当前数据集缺少“'+tool.title+'”所需字段，示例无法运行。');return;}void runTool({steps:[{tool:chapter.tool,params}],title:tool?.title});}
   return;
  }
  if(chapter.target==='assistant'&&chapter.question){if(mode==='run')void send(chapter.question);else if(mode==='fill')setText(chapter.question);}
 }
 const chosenStarter=useRef<Starter|undefined>(undefined);
 const [starterPool,setStarterPool]=useState<StarterPool>({version:'',batches:[]});
 const [logged,setLogged]=useState<boolean|null>(null),[view,setView]=useState<keyof typeof titles>('data'),[meta,setMeta]=useState<Dataset>(),[catalog,setCatalog]=useState<Dataset[]>([]),[tools,setTools]=useState<Tool[]>([]),[records,setRecords]=useState<Patent[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[query,setQuery]=useState('');
 const [conversations,setConversations]=useState<Conversation[]>([]),[conversationId,setConversationId]=useState(''),[turns,setTurns]=useState<Run[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[phase,setPhase]=useState(''),[results,setResults]=useState<AnalysisResult[]>([]),[selectedTool,setSelectedTool]=useState('search_patents'),[parameters,setParameters]=useState(JSON.stringify(defaults('search_patents'),null,2)),[toolBusy,setToolBusy]=useState(false),[mobileFocus,setMobileFocus]=useState(false),[toolRun,setToolRun]=useState<Run>(),[reportTab,setReportTab]=useState<'body'|'review'>('body');
const [patent,setPatent]=useState<Patent>(),[reports,setReports]=useState<{id:string;title:string;createdAt:string;run:Run}[]>([]),[report,setReport]=useState<{id:string;title:string;run:Run;revision?:number}>(),[settings,setSettings]=useState<{model:string;embedding:string;configured:boolean;dimensions:number;username:string;base:string}>();
 const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
 const [historyPage,setHistoryPage]=useState(1);
 const [historySelection,setHistorySelection]=useState<string[]>([]),[reportSelection,setReportSelection]=useState<string[]>([]),[deleting,setDeleting]=useState(false);
 const [navigationReady,setNavigationReady]=useState(false);
 const historyPages=Math.max(1,Math.ceil(conversations.length/10)),visibleHistoryPage=Math.min(historyPage,historyPages);
 useEffect(()=>{setSidebarCollapsed(localStorage.getItem('atlas-sidebar-collapsed')==='true');const saved=restoredNavigation(sessionStorage.getItem('atlas-navigation'),location.hash);setView(saved.page);setMobileFocus(saved.assistant);setDeepOpen(!location.hash.startsWith('#guide/')&&sessionStorage.getItem('atlas-deep-open')==='true');setNavigationReady(true);const openGuide=()=>{if(location.hash.startsWith('#guide/')){setDeepOpen(false);setView('help');setMobileFocus(false);setReport(undefined);}};addEventListener('hashchange',openGuide);return()=>removeEventListener('hashchange',openGuide);},[]);
 useEffect(()=>{if(navigationReady)sessionStorage.setItem('atlas-deep-open',String(deepOpen));},[navigationReady,deepOpen]);
 useEffect(()=>{if(navigationReady){sessionStorage.setItem('atlas-navigation',JSON.stringify({page:view,assistant:mobileFocus,reportId:report?.id}));if(view!=='help'&&(location.hash.startsWith('#guide/')||location.hash.startsWith('#section-')))history.replaceState(null,'',location.pathname);}},[navigationReady,view,mobileFocus,report?.id]);
 function toggleSidebar(){setSidebarCollapsed(value=>{localStorage.setItem('atlas-sidebar-collapsed',String(!value));return !value;});}
 async function logout(){await api('logout',{});setLogged(false);newChat();}
 const stream=useRef<AbortController|null>(null),toolStream=useRef<AbortController|null>(null),currentRun=useRef(''),contentRef=useRef<HTMLElement|null>(null),chatRef=useRef<HTMLDivElement|null>(null),nearBottom=useRef(true);
 const [showLatest,setShowLatest]=useState(false);
 const requestedFollowups=useRef(new Set<string>());
 const [suggesting,setSuggesting]=useState('');
 async function suggest(latest:Run,refresh=false){requestedFollowups.current.add(latest.id);setSuggesting(latest.id);try{const response=await fetch('/api/runs/'+latest.id+'/followups',{method:'POST',headers:{Accept:'text/event-stream','Content-Type':'application/json'},body:JSON.stringify({refresh})});if(!response.ok||!response.body)return;await readSSE(response.body,text=>{const data=JSON.parse(text);if(Array.isArray(data.questions))setTurns(value=>value.map(r=>r.id===latest.id&&r.answer===latest.answer&&r.status!=='running'?{...r,followups:data.questions}:r));});}catch{}finally{setSuggesting(value=>value===latest.id?'':value);}}
 useEffect(()=>{const latest=turns.at(-1);if(report||busy||!latest||latest.followups?.length===5||!latest.answer.trim()||!['completed','partial'].includes(latest.status)||requestedFollowups.current.has(latest.id))return;void suggest(latest);},[turns,busy,report]);
 useEffect(()=>{if(nearBottom.current)chatRef.current?.scrollTo({top:chatRef.current.scrollHeight});},[turns,phase,mobileFocus]);
 useEffect(()=>{contentRef.current?.scrollTo({top:0});},[view,report?.id]);
 const nextReportTab=useRef<'body'|'review'>('body');
 useEffect(()=>{setReportTab(nextReportTab.current);nextReportTab.current='body';},[report?.id]);
async function loadData(id?:string){const request=++dataRequest.current,recordRequest=++recordsRequest.current;setRecordLabel(null);setQuery('');setRecords([]);setTotal(0);const [d,config]=await Promise.all([api('datasets'),api('settings')]);if(request!==dataRequest.current)return;setSettings(config);setCatalog(d.datasets);const selected=d.datasets.find((x:Dataset)=>x.id===(id||d.active));chosenStarter.current=undefined;if(selected){const starters=await api('starters?dataset='+selected.id);if(request!==dataRequest.current)return;setStarterPool(starters);setMeta(selected);const t=await api('tools?dataset='+selected.id);if(request!==dataRequest.current)return;setTools(t.tools);if(recordRequest===recordsRequest.current)await loadRecords(selected.id,1,'',null);}else{setMeta(undefined);setStarterPool({version:"",batches:[]});setTools([]);setRecords([]);setTotal(0);}await refreshHistory();}
 async function changeAfterEdit(id?:string){sessionStorage.removeItem('patent-conversation');setConversationId('');setTurns([]);clearToolRun();setQuery('');setReport(undefined);await loadData(id);}
 async function refreshHistory(){const conversations=(await api('conversations')).conversations,reports=(await api('reports')).reports;setConversations(conversations);setReports(reports);setHistorySelection(ids=>ids.filter(id=>conversations.some((c:Conversation)=>c.id===id)));setReportSelection(ids=>ids.filter(id=>reports.some((r:{id:string})=>r.id===id)));}
 function selectSaved(kind:'reports'|'conversations',id:string,selected:boolean){const update=kind==='reports'?setReportSelection:setHistorySelection;update(ids=>selected?[...new Set([...ids,id])]:ids.filter(value=>value!==id));}
 async function removeSaved(kind:'reports'|'conversations',ids:string[]){
  if(deleting||!ids.length)return;
  const noun=kind==='reports'?'报告':'对话',unit=kind==='reports'?'份':'条',detail=kind==='reports'?'原对话和专利数据仍保留。':'对话及其运行记录会删除；已保存报告和专利数据仍保留。';
  if(!confirm(`删除选中的 ${ids.length} ${unit}${noun}？${detail}此操作不可撤销。`))return;
  setDeleting(true);setError('');
  try{
   await api(kind,{ids},'DELETE');
   if(kind==='conversations'&&toolRun&&ids.includes(toolRun.conversationId))clearToolRun();
   if(kind==='conversations'&&ids.includes(conversationId)){stream.current?.abort();sessionStorage.removeItem('patent-conversation');setConversationId('');setTurns([]);setBusy(false);setPhase('');}
   if(kind==='reports'&&report&&ids.includes(report.id)){setReport(undefined);setView('reports');setMobileFocus(false);}
   await refreshHistory();setNotice(`已删除 ${ids.length} ${unit}${noun}。`);
  }catch(error){setError((error as Error).message);}finally{setDeleting(false);}
 }
async function loadRecords(id:string,p:number,q:string,label:RecordLabelSelection=recordLabel){const request=++recordsRequest.current;const params=new URLSearchParams({dataset:id,page:String(p),q,...(label?{label:label.id,includeChildren:String(label.includeChildren)}:{})});const data=await api('patents?'+params);if(request!==recordsRequest.current)return;setRecords(data.records);setTotal(data.total);setPage(p);}
useEffect(()=>{let current=true;const saved=restoredNavigation(sessionStorage.getItem('atlas-navigation'),location.hash);api('workspace').then(async(next:Workspace)=>{if(!current)return;setWorkspace(next);setLogged(true);if(!next.current)return;await loadData();if(!current)return;if(saved.reportId&&saved.page==='analysis'){const item=(await api('reports')).reports.find((r:{id:string})=>r.id===saved.reportId);if(item){setReport(item);return;}}const toolRunId=sessionStorage.getItem('atlas-tool-run');if(toolRunId&&saved.page==='analysis'){try{const run:Run=await api('runs/'+toolRunId);if(!current)return;setToolRun(run);setResults(run.results);if(run.status==='running')void follow(run.id,'tool',true);}catch{sessionStorage.removeItem('atlas-tool-run');}}const remembered=sessionStorage.getItem('patent-conversation');if(remembered&&(saved.page==='analysis'||saved.assistant)){const items=(await api('conversations')).conversations;const c=items.find((item:Conversation)=>item.id===remembered);if(c){await openConversation(c,false);}else sessionStorage.removeItem('patent-conversation');}}).catch(()=>{if(current)setLogged(false);});return()=>{current=false;stream.current?.abort();toolStream.current?.abort();};},[]);
useEffect(()=>{if(!patent)return;const opener=document.activeElement as HTMLElement;const dialog=document.querySelector<HTMLElement>('.patent-detail');dialog?.querySelector<HTMLElement>('button')?.focus();const handle=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPatent(undefined);return;}if(event.key==='Tab'&&dialog){const controls=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary,input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];const visible=controls.filter(control=>control.getClientRects().length>0);const first=visible[0],last=visible.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',handle);return()=>{document.removeEventListener('keydown',handle);opener?.focus();};},[Boolean(patent)]);
 async function changeDataset(id:string){stream.current?.abort();await api('datasets',{id},'PATCH');sessionStorage.removeItem('patent-conversation');setConversationId('');setTurns([]);clearToolRun();setReport(undefined);await loadData(id);}
 async function openPatent(id:string,datasetId=meta?.id,location?:PatentEvidenceLocation){try{const record=await api(`patents/${id}?dataset=${datasetId}`);setPatentEvidence(location);setPatentDatasetId(datasetId);setPatent(record);}catch(e){setError((e as Error).message);}}
 async function openConversation(c:Conversation,openAssistant=true){if(c.title.startsWith('工具 · ')){await openToolRun(c);return;}stream.current?.abort();setBusy(false);if(openAssistant){setView('analysis');setMobileFocus(true);}try{await loadData(c.datasetId);const detail=await api('conversations/'+c.id);sessionStorage.setItem('patent-conversation',c.id);setConversationId(c.id);setTurns(detail.runs);setReport(undefined);const pending=detail.runs.find((r:Run)=>r.status==='running');if(pending)await follow(pending.id,'chat',true);}catch(e){setError('打开对话失败：'+(e as Error).message);}}
 async function openToolRun(c:Conversation){try{await loadData(c.datasetId);const run:Run|undefined=(await api('conversations/'+c.id)).runs.at(-1);setReport(undefined);setView('analysis');setMobileFocus(false);if(!run)return;sessionStorage.setItem('atlas-tool-run',run.id);setToolRun(run);setResults(run.results);if(run.status==='running')await follow(run.id,'tool',true);}catch(e){setError('打开工具记录失败：'+(e as Error).message);}}
 function clearToolRun(){toolStream.current?.abort();sessionStorage.removeItem('atlas-tool-run');setToolRun(undefined);setResults([]);}
 function newChat(){submitting.current='';chosenStarter.current=undefined;nearBottom.current=true;setShowLatest(false);if(!meta)void loadData();stream.current?.abort();sessionStorage.removeItem('patent-conversation');setConversationId('');setTurns([]);setReport(undefined);setText('');setError('');setBusy(false);setToolBusy(false);setPhase('');setMobileFocus(true);}
 async function follow(id:string,target:'chat'|'tool'='chat',restore=false){const channel=target==='chat'?stream:toolStream;channel.current?.abort();const controller=new AbortController();channel.current=controller;
 // Chat turns and workbench tool runs keep separate state so neither surface shows the other's work.
 const patch=(change:(r:Run)=>Run)=>target==='chat'?setTurns(value=>value.map(r=>r.id===id?change(r):r)):setToolRun(r=>r?.id===id?change(r):r);const say=(message:string)=>{if(target==='chat')setPhase(message);};
 if(target==='chat'){currentRun.current=id;setBusy(true);}if(!restore)patch(r=>({...r,answer:''}));try{
  const response=await fetch('/api/runs/'+id+'/events'+(restore?'?snapshot=1':''),{signal:controller.signal});if(!response.ok||!response.body)throw new Error('无法读取任务进度');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const name=block.split('\n').find(line=>line.startsWith('event: '))?.slice(7);const raw=block.split('\n').find(line=>line.startsWith('data: '))?.slice(6);if(!raw)continue;const data=JSON.parse(raw);
   if(name==='progress')patch(r=>({...r,progress:data}));
   if(name==='status'){say(data.message);patch(r=>({...r,progress:{...r.progress,tool:r.progress?.tool||data.phase,unit:data.message}}));}
   if(name==='plan')patch(r=>({...r,plan:data.steps}));
   if(name==='scope')patch(r=>({...r,scope:data.scope}));
   if(name==='research-review')patch(r=>({...r,reviews:[...(r.reviews||[]),data.review]}));
   if(name==='audit')patch(r=>({...r,audit:data.audit}));
   if(name==='report-preparation')patch(r=>({...r,reportPreparation:data.preparation}));
   if(name==='tool-start'){const message='正在运行 '+(tools.find(t=>t.name===data.tool)?.title||data.tool);say(message);patch(r=>({...r,progress:{tool:data.tool,unit:message}}));}
   if(name==='tool-result'){if(target==='tool')setResults(value=>value.some(r=>r.id===data.result.id)?value:[...value,data.result]);patch(r=>({...r,results:r.results.some(item=>item.id===data.result.id)?r.results:[...r.results,data.result]}));}
   if(name==='text-snapshot')patch(r=>({...r,answer:data.text}));
   if(name==='text-delta')patch(r=>({...r,answer:r.answer+data.text}));
   if(name==='text-reset')patch(r=>({...r,answer:''}));
   if(name==='error')setError(data.message);
  }if(chunk.done)break;}
  const final=await api('runs/'+id);patch(()=>final);say(final.status==='completed'?'分析完成':final.status==='cancelled'?'任务已停止':'已保留工具结果，请查看说明');await refreshHistory();
 }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(target==='chat'&&currentRun.current===id)setBusy(false);}}
 async function send(question=text){if(!meta||busy||submitting.current||!question.trim())return;
 const maxModelCalls=modelCallLimit.trim()?Number(modelCallLimit):undefined;
 if(maxModelCalls!==undefined&&(!Number.isInteger(maxModelCalls)||maxModelCalls<1||maxModelCalls>2147483647)){setError('调用上限须为正整数');return;}
 const pendingId='pending-'+crypto.randomUUID();submitting.current=pendingId;const pending:Run={id:pendingId,conversationId,datasetId:meta.id,question,status:'running',plan:[],results:[],answer:'',error:'',model:'',createdAt:new Date().toISOString(),progress:{tool:'request',unit:'正在提交问题并创建分析任务'}};nearBottom.current=true;setShowLatest(false);setBusy(true);setError('');setReport(undefined);setMobileFocus(true);setTurns(value=>[...value,pending]);setText('');try{let id=conversationId;if(!id){const c=await api('conversations',{datasetId:meta.id});id=c.id;sessionStorage.setItem('patent-conversation',id);setConversationId(id);}const starter=chosenStarter.current;const r=await api('runs',{conversationId:id,datasetId:meta.id,question,...(maxModelCalls!==undefined?{maxModelCalls}:{}),...(starter?.datasetId===meta.id&&starter.question===question?{steps:[{tool:starter.name,params:starter.params}]}:{})});if(submitting.current!==pendingId)return;chosenStarter.current=undefined;setTurns(value=>value.map(t=>t.id===pendingId?r:t));await follow(r.id);}catch(e){if(submitting.current!==pendingId)return;const message=(e as Error).message;setTurns(value=>value.map(t=>t.id===pendingId?{...t,status:'failed',error:message}:t));setError(message);setBusy(false);}finally{if(submitting.current===pendingId)submitting.current='';}}
 function chooseTool(name:string){const tool=tools.find(t=>t.name===name);if(!tool)return;setSelectedTool(name);setParameters(JSON.stringify(tool.defaultParams||defaults(name,records[0]?.id),null,2));}
 async function runTool(input?:{steps:{tool:string;params:Params}[];question?:string;title?:string}){
  if(!meta||readOnly||toolBusy)return;
  let steps=input?.steps;if(!steps){try{steps=[{tool:selectedTool,params:JSON.parse(parameters)}];}catch{setError('参数格式不正确。请检查分析参数。');return;}}
  const title=input?.title||tools.find(t=>t.name===steps[0].tool)?.title||steps[0].tool,question=input?.question||'直接运行：'+title;
  const pending:Run={id:'pending-'+crypto.randomUUID(),conversationId:'',datasetId:meta.id,question,status:'running',plan:steps,results:[],answer:'',error:'',model:'',createdAt:new Date().toISOString(),progress:{tool:'request',unit:'正在提交工具任务'}};
  setError('');setToolBusy(true);setPatent(undefined);setReport(undefined);setView('analysis');setMobileFocus(false);setResults([]);setToolRun(pending);
  try{
   const c=await api('conversations',{datasetId:meta.id,title:'工具 · '+title}),r:Run=await api('runs',{conversationId:c.id,datasetId:meta.id,question,mode:'tool',steps});
   sessionStorage.setItem('atlas-tool-run',r.id);setToolRun(r);await follow(r.id,'tool');setNotice('任务已结束，结果与已完成分段已保存。');
  }catch(e){const message=(e as Error).message;setToolRun(run=>run&&{...run,status:'failed',error:message});setError(message);}
  finally{setToolBusy(false);}
 }
 function runOverview(){const steps=OVERVIEW_TOOLS.flatMap(name=>{const tool=tools.find(t=>t.name===name);return tool?.available?[{tool:name,params:tool.defaultParams||defaults(name,records[0]?.id)}]:[];});if(!steps.length){setError('当前数据没有可运行的概览工具。');return;}void runTool({steps,question:'综合概览：'+steps.map(s=>tools.find(t=>t.name===s.tool)?.title||s.tool).join('、'),title:'综合概览'});}
 async function save(r:Run){try{await api('reports',{runId:r.id});await refreshHistory();setNotice('报告已保存。可在报告库查看或下载。');}catch(e){setError((e as Error).message);}}
 async function retry(r:Run){try{await api('runs/'+r.id+'/retry-report',{});requestedFollowups.current.delete(r.id);setTurns(value=>value.map(t=>t.id===r.id?{...t,status:'running',answer:'',error:'',followups:undefined}:t));await follow(r.id);}catch(e){setError((e as Error).message);}}
 if(logged===null)return <div className="boot">正在打开专利分析工作台…</div>;
 if(!logged)return <main className="login">
<div className="login-intro">
<img className="login-logo" src="/brand/invention-atlas-mark.png" width={80} height={80} alt="Invention Atlas Logo"/>
<h1>Invention Atlas</h1>
<p>Patent analysis with traceable evidence</p>
</div>
<form onSubmit={async e=>{e.preventDefault();if(signingIn)return;const form=new FormData(e.currentTarget);setError('');setSigningIn(true);try{await api(registering?'register':'login',{username:form.get('username'),password:form.get('password'),...(registering?{token:form.get('token'),displayName:form.get('displayName')}:{})});const next=await refreshWorkspace();setLogged(true);if(next.current)await loadData();}catch(e){setError((e as Error).message);}finally{setSigningIn(false);}}}>
<h2>{registering?'凭邀请注册':'登录工作台'}</h2>
<p className="muted">{registering?'使用组织管理员提供的邀请码创建账号':'输入账号和密码'}</p>
{registering&&<><label>组织邀请码<input name="token" required autoComplete="off"/></label><label>姓名<input name="displayName" required maxLength={100} autoComplete="name"/></label></>}
<label>用户名<input name="username" autoComplete="username" required maxLength={80}/>
</label>
<label>密码<input name="password" type="password" autoComplete={registering?'new-password':'current-password'} minLength={registering?10:undefined} maxLength={1024} required/>
</label>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={signingIn}>{signingIn?'正在提交…':registering?'创建账号':'登录'}</button>
<button type="button" disabled={signingIn} onClick={()=>{setRegistering(!registering);setError('');}}>{registering?'已有账号，返回登录':'使用邀请码注册'}</button>
<p className="login-note">
<ShieldCheck size={15}/>
模型密钥保存在服务端</p>
</form>
</main>;
 if(workspace&&!workspace.current)return <ProjectEntry workspace={workspace} onSelect={selectProject} onReload={async()=>{await refreshWorkspace();}} onLogout={logout}/>;
 const visible=report?report.run.results:results;const shownTurns=report?[report.run]:turns;const currentMeta=report?(report.run.datasetSnapshot||catalog.find(d=>d.id===report.run.datasetId)):meta;
 let scopeParams:Params={};try{const value=JSON.parse(parameters);if(value&&typeof value==='object'&&!Array.isArray(value))scopeParams=value;}catch{}
 function changeParam(key:keyof Params,value:string){try{const next=JSON.parse(parameters);if(!value.trim())delete next[key];else next[key]=key==='patent_numbers'?value.split(',').map(v=>v.trim()).filter(Boolean):['year_start','year_end','top_k','k'].includes(key)?Number(value):value;setParameters(JSON.stringify(next,null,2));}catch{setError('请先修正完整参数中的 JSON 格式。');}}
 const lastSearch=[...results].reverse().find(r=>r.tool==='search_patents'&&r.status==='completed'&&r.params.query);
 const latestSearch=lastSearch?{query:lastSearch.params.query!,patentNumbers:[...new Set(lastSearch.rows.map(row=>String(row.patent)))],boolean:/\b(AND|OR|NOT)\b/.test(lastSearch.params.query!)}:undefined;
 const toolTitle=toolRun?.progress?.tool==='request'?'提交工具任务':tools.find(t=>t.name===toolRun?.progress?.tool)?.title||'执行分析任务';
 return <div className={`app-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>
<AtlasNavigation page={view} assistant={mobileFocus} collapsed={sidebarCollapsed} onToggle={toggleSidebar} onNavigate={key=>{setDeepOpen(false);setView(key);setMobileFocus(false);setReport(undefined);if(key!=='help')history.replaceState(null,'',location.pathname);}} onAssistant={()=>{setDeepOpen(false);setMobileFocus(true);}} username={settings?.username||'jyao'} onLogout={()=>void logout()}/>

 <div className={'work-area'+(mobileFocus&&!deepOpen?' conversation-mode':'')+(deepOpen?' research-mode':'')+(report?.run.kind==='research'&&!mobileFocus?' research-report-mode':'')}>
<header className="topbar">
<div className="page-heading">
<h1>{deepOpen?'深度报告':mobileFocus?'分析助手':report?report.title:titles[view]}</h1>
<span className="dataset-caption">{currentMeta?.name||'尚未导入数据'}</span>
</div>
<div className="top-actions">
{workspace&&<details ref={management} className="workspace-actions"><summary>管理<ChevronDown size={15} aria-hidden="true"/></summary><div>
{workspace&&<WorkspaceManager workspace={workspace} onSelect={selectProject} openRequest={workspaceOpen}/>}
{workspace&&<ReceivedReports/>}
{workspace&&<ReportTaskInbox key={workspace.current?.id} onOpen={async(id,revision)=>{const item=await api('reports/'+id+'?version='+revision);setReport(item);setView('analysis');setMobileFocus(false);}}/>}
{workspace&&<TaskNotifications key={'notifications:'+workspace.current?.id} onOpen={async(id,revision)=>{const item=await api('reports/'+id+'?version='+revision);setReport(item);setView('analysis');setMobileFocus(false);}}/>}
{workspace&&<AccountSettings username={workspace.user.username} displayName={workspace.user.displayName}/>}
{workspace?.current&&<ApiCredentials key={'credentials:'+workspace.current.id} projectName={workspace.projects.find(project=>project.id===workspace.current?.id)?.name||workspace.current.id} readOnly={Boolean(readOnly)} openRequest={credentialsOpen}/>}
{workspace?.current&&<OrganizationModel key={'organization-model:'+workspace.current.id}/>}
<OcrSettings/>
{workspace&&<OrganizationManager platformAdmin={workspace.user.platformRole==='admin'} onProjectCreated={selectProject} onChanged={async()=>{await refreshWorkspace();}}/>}
{workspace?.user.platformRole==='admin'&&<UserManager currentUserId={workspace.user.id}/>}
</div></details>}
{workspace&&<button aria-pressed={deepOpen} onClick={()=>{setDeepGoal('');setDeepOpen(true);}}>深度报告</button>}
{workspace&&<ProfessionalTasks onDeepResearch={()=>{setDeepGoal('');setDeepOpen(true);}} datasets={catalog} readOnly={Boolean(readOnly)} launch={professionalLaunch} onOpenRun={async id=>{const r:Run=await api('runs/'+id);await openConversation({id:r.conversationId,datasetId:r.datasetId,title:r.question,updatedAt:r.createdAt});}}/>}
{mobileFocus&&<button aria-label="对话历史" onClick={()=>{setView('history');setMobileFocus(false);setReport(undefined);}}><MessagesSquare size={16}/><span className="mobile-action-label">对话历史</span></button>}
<button aria-label="新对话" onClick={()=>{setDeepOpen(false);newChat();}}>
<Plus size={15}/>
<span className="mobile-action-label">新对话</span></button>
<button className="assistant-toggle" aria-label={mobileFocus?'收起助手':'打开助手'} aria-expanded={mobileFocus} aria-controls="analysis-assistant" onClick={()=>{setDeepOpen(false);setMobileFocus(!mobileFocus);}}>
<PanelRight size={16}/>
<span className="mobile-action-label">{mobileFocus?'返回工作区':'助手'}</span></button>
</div>
</header>
 {deepOpen&&<DeepResearch key={workspace?.current?.id} datasets={catalog} readOnly={Boolean(readOnly)} initialGoal={deepGoal} onClose={()=>setDeepOpen(false)} onPatent={(id,datasetId)=>void openPatent(id,datasetId)} onOpenReport={async id=>{const saved=await api('reports/'+id);setReport(saved);setView('analysis');setMobileFocus(false);setDeepOpen(false);}}/>}
 <div className="workspace">
<main ref={contentRef} className={`content ${mobileFocus?'mobile-hidden':''}`}>
 {(error||notice)&&<div className={error?'notice error':'notice'} role={error?'alert':'status'}>
<span>{error||notice}</span>
<button aria-label="关闭提示" onClick={()=>{setError('');setNotice('');}}>
<X size={15}/>
</button>
</div>}
 {view==='help'&&<HelpManual toolsReady={tools.length>0} readOnly={Boolean(readOnly)} onOpen={openGuideFunction} onDemo={question=>{setView('analysis');setMobileFocus(true);setText(question);history.replaceState(null,'',location.pathname);}}/>}
 {view==='data'&&<>
 <MonitorSubscriptions key={'monitor:'+workspace?.current?.id} datasets={catalog} readOnly={Boolean(readOnly)} onOpenRun={async id=>{const r:Run=await api('runs/'+id);await openConversation({id:r.conversationId,datasetId:r.datasetId,title:r.question,updatedAt:r.createdAt});}}/>
<section className="data-header">
<div>
<h2>当前数据集</h2>
<p>查看来源和字段覆盖，点击公开编号阅读原文。</p>
</div>
<div className="data-header-controls">
<label>数据集<select aria-label="当前数据集" value={meta?.id||''} onChange={e=>changeDataset(e.target.value)}>{catalog.map(d=>
<option key={d.id} value={d.id}>{d.name}</option>)}</select>
</label>
<button onClick={async()=>{const name=prompt('新数据集名称');if(!name?.trim())return;try{const created=await api('datasets',{name});await changeAfterEdit(created.dataset.id);}catch(e){setError((e as Error).message);}}}><Plus size={15}/>新建数据集</button>
</div>
</section>{meta&&<>
<div className="dataset-facts">
<span>
<strong>{meta.count}</strong> 条专利记录</span>
<span>公开年份 <strong>{meta.years[0]}—{meta.years.at(-1)}</strong>
</span>
<span>语义索引 <strong>{meta.indexed}/{meta.count}</strong>
</span>
</div>
{!readOnly&&<div className="dataset-actions">
<IndexProgress key={'index:'+meta.id} datasetId={meta.id} indexed={meta.indexed} total={meta.count} onUpdated={()=>loadData(meta.id)}/>
<details key={'manage:'+meta.id} className="dataset-management"><summary>数据集管理</summary><div className="dataset-danger-actions"><span>删除“{meta.name}”及其 {meta.count} 条记录；对话和已保存报告保留。</span><button className="dataset-delete" onClick={async()=>{if(!confirm(`删除整个“${meta.name}”数据集及其 ${meta.count} 条记录？对话和已保存报告保留，但不能再读取该数据集原文。`))return;try{await api('datasets/'+meta.id,undefined,'DELETE');await changeAfterEdit();}catch(e){setError((e as Error).message);}}}>删除整个数据集</button></div></details></div>}
<ExternalCoverage key={'external:'+meta.id} datasetId={meta.id}/>
<SourceUpdates key={'source:'+meta.id} datasetId={meta.id} readOnly={Boolean(readOnly)} onChanged={()=>void loadData(meta.id)} onOpenRun={async id=>{const r:Run=await api('runs/'+id);await openConversation({id:r.conversationId,datasetId:r.datasetId,title:r.question,updatedAt:r.createdAt});}}/>
<div className="list-heading">
<h3>专利记录 <small>{total} 条</small>
</h3>
<form onSubmit={e=>{e.preventDefault();loadRecords(meta.id,1,query);}} className="search-box">
<Search size={17}/>
<input aria-label="筛选专利记录" placeholder="编号、英文标题或申请人" value={query} onChange={e=>setQuery(e.target.value)}/>
<button>查找</button>
</form>
</div>
<RecordLabelFilter key={meta.id} value={recordLabel} readOnly={Boolean(readOnly)} onApply={async filter=>{setRecordLabel(filter);await loadRecords(meta.id,1,query,filter);}}/>
<DataRecords datasetId={meta.id} records={records} onPatent={openPatent} onChanged={()=>changeAfterEdit(meta.id)} readOnly={readOnly}/>
<div className="pagination">
<button disabled={page<=1} onClick={()=>loadRecords(meta.id,page-1,query)}>上一页</button>
<span>{total?(page-1)*20+1:0}—{Math.min(page*20,total)} / {total}</span>
<button disabled={page*20>=total} onClick={()=>loadRecords(meta.id,page+1,query)}>下一页</button>
</div>
</>
}

{meta&&<FulltextSearch key={meta.id} datasetId={meta.id} readOnly={readOnly}/>}
{meta&&!readOnly&&<DataResearchPanel datasetId={meta.id} onUpdated={()=>void loadData(meta.id)}/>}
{!readOnly&&<SourceAcquisition onImported={id=>void changeDataset(id)}/>}
<details className="import-panel">
<summary>
<Upload size={16}/>
导入数据集</summary>
<form onSubmit={async e=>{e.preventDefault();setToolBusy(true);try{const form=new FormData(e.currentTarget);const response=await fetch('/api/datasets',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw new Error(data.error);await loadData(data.dataset.id);setNotice(`已导入${data.dataset.count}条记录，合并${data.duplicates}条重复编号`);}catch(e){setError((e as Error).message);}finally{setToolBusy(false);}}}>
<label>数据集名称<input name="name" required/>
</label>
<label>文件格式<select name="format">
<option value="canonical">规范化专利 JSONL</option>
<option value="google">Google Patents JSONL</option>
<option value="xml">USPTO授权 XML</option>
<option value="wos">Derwent/WoS</option>
</select>
</label>
<label>文件<input name="files" type="file" multiple required accept=".jsonl,.xml,.txt,.ndjson"/>
</label>
<button className="primary" disabled={toolBusy}>{toolBusy?'正在处理…':'导入并检查字段'}</button>
</form>
</details>
</>
}
 {view==='analysis'&&<>{!report&&toolRun?.status==='running'&&<ExecutionProgress run={toolRun} title={toolTitle} onStop={()=>{if(!toolRun.id.startsWith('pending-'))void api('runs/'+toolRun.id+'/stop',{});}}/>
} {report&&<div className="replay-banner">
<Play size={16}/>
历史运行 · 数据集 {report.run.datasetId.slice(0,8)} · {new Date(report.run.createdAt).toLocaleString('zh-CN')}</div>}{report&&<div className="report-tabs" role="tablist" aria-label="报告视图">{(['body','review'] as const).map(key=><button key={key} type="button" role="tab" aria-selected={reportTab===key} className={reportTab===key?'active':''} onClick={()=>setReportTab(key)}>{key==='body'?'报告正文':'逐条复核'}</button>)}</div>}
{report&&reportTab==='review'&&<ReportReview key={report.id+':'+(report.revision||0)} reportId={report.id} revision={report.revision||0} results={report.run.results} readOnly={Boolean(readOnly)} currentUserId={workspace?.user.id} toolTitle={name=>tools.find(t=>t.name===name)?.title||name} onPatent={id=>void openPatent(id,report.run.datasetId)}/>}
{report&&reportTab==='body'&&<article className="markdown report-narrative">
<ReportDraftEditor key={report.id} reportId={report.id} selectedRevision={report.revision||0} readOnly={Boolean(readOnly)} onRead={version=>setReport(current=>current?{...current,revision:version.revision,title:version.title,run:{...current.run,answer:version.answer}}:current)}/>
<>{report.run.kind==='research'?<PatentNarrative text={report.run.answer} results={report.run.results.filter(r=>r.status==='completed')} appendResults={false} onPatent={(id,datasetId)=>void openPatent(id,datasetId)}/>:<Markdown>{resultText(report.run.answer).replace(/\[\[chart:[^\]]+\]\]/g,'')}</Markdown>}</>
</article>}{!report&&<>
<div className="analysis-intro">
<div>
<h2>运行查询与分析</h2>
<p>选择工具，设定范围，查看结果。</p>
</div>
<button className="primary" disabled={toolBusy||readOnly||!tools.length} title="在本页依次运行数据概况、申请人组合、主题聚类、引证指标、引证网络和权利要求要素" onClick={runOverview}>
<Play size={16}/>
综合分析</button>
</div>
</>}{(!report||reportTab==='body')&&<div className={report?'analysis-workspace':'analysis-workspace has-picker'}>{!report&&<ToolPicker tools={tools} selectedTool={selectedTool} params={scopeParams} years={meta?.years||[]} samplePatent={records[0]?.id} busy={false} toolBusy={toolBusy} onSelect={chooseTool} onParam={changeParam} onParams={value=>setParameters(JSON.stringify(value,null,2))} onRun={()=>void runTool()}/>
}{visible.length?<div className="results">{visible.map(result=>
<ResultView key={result.id} result={result} onPatent={(id,location)=>openPatent(id,result.datasetId,location)}/>
)}</div>:<div className="analysis-empty">
<h3>{toolRun?.status==='running'?'正在运行':'尚无分析结果'}</h3>
<p>{toolRun?.status==='running'?'结果会在完成后显示在这里。':'选择工具并运行后，可在这里查看图表和数据。分析助手的对话结果显示在助手面板中。'}</p>
</div>}</div>}</>
}
 {view==='history'&&<>
<div className="list-heading">
<h2>已保存的对话</h2>
<button onClick={newChat}>
<Plus size={16}/>
新对话</button>
</div>
<div className="saved-list-toolbar"><label><input type="checkbox" aria-label="选择本页对话" checked={conversations.slice((visibleHistoryPage-1)*10,visibleHistoryPage*10).length>0&&conversations.slice((visibleHistoryPage-1)*10,visibleHistoryPage*10).every(c=>historySelection.includes(c.id))} onChange={e=>{const ids=conversations.slice((visibleHistoryPage-1)*10,visibleHistoryPage*10).map(c=>c.id);setHistorySelection(value=>e.target.checked?[...new Set([...value,...ids])]:value.filter(id=>!ids.includes(id)));}}/>选择本页</label><span>已选 {historySelection.length} 条</span><button className="danger-action" disabled={deleting||!historySelection.length} onClick={()=>void removeSaved('conversations',historySelection)}>{deleting?'正在删除…':'删除选中'}</button>{historySelection.length>0&&<button onClick={()=>setHistorySelection([])}>取消选择</button>}</div>
<div className="history-list">{conversations.slice((visibleHistoryPage-1)*10,visibleHistoryPage*10).map(c=>
<div key={c.id} className="history-row" onClick={e=>{if(!(e.target as HTMLElement).closest('button,input,label,a'))void openConversation(c);}}>
<label className="saved-row-select"><input type="checkbox" aria-label={'选择对话：'+c.title} checked={historySelection.includes(c.id)} onChange={e=>selectSaved('conversations',c.id,e.target.checked)}/></label>
<button className="history-open" aria-label={'打开对话：'+c.title} onClick={()=>void openConversation(c)}>
<MessagesSquare size={20}/>
<span>
<strong>{c.title}</strong>
<small>{catalog.find(d=>d.id===c.datasetId)?.name} · {new Date(c.updatedAt).toLocaleString('zh-CN')}</small>
</span>
</button>
<button aria-label="重命名对话" onClick={async()=>{const title=prompt('对话名称',c.title);if(title){await api('conversations/'+c.id,{title},'PATCH');await refreshHistory();}}}>重命名</button>
<button className="danger-action" disabled={deleting} onClick={()=>void removeSaved('conversations',[c.id])}>删除</button>
</div>)}{!conversations.length&&<p className="empty">还没有对话。点击“新对话”开始分析。</p>}</div>
{conversations.length>0&&<nav className="pagination history-pagination" aria-label="对话历史分页">
<span>共 {conversations.length} 条 · 第 {visibleHistoryPage}/{historyPages} 页</span>
<button disabled={visibleHistoryPage===1} onClick={()=>setHistoryPage(visibleHistoryPage-1)}>上一页</button>
<button disabled={visibleHistoryPage===historyPages} onClick={()=>setHistoryPage(visibleHistoryPage+1)}>下一页</button>
</nav>}
</>
}
 {view==='reports'&&<>
 <TechnicalDisclosures key={'disclosures:'+workspace?.current?.id} readOnly={Boolean(readOnly)} datasets={catalog} openRequest={materialsOpen}/>
<h2>已保存的报告</h2>
<p className="muted">保存时的数据和分析结果一并保留，不随当前数据集改变。</p>
<div className="saved-list-toolbar"><label><input type="checkbox" aria-label="选择全部报告" checked={reports.length>0&&reports.every(r=>reportSelection.includes(r.id))} onChange={e=>setReportSelection(e.target.checked?reports.map(r=>r.id):[])}/>选择全部</label><span>已选 {reportSelection.length} 份</span><button className="danger-action" disabled={deleting||!reportSelection.length} onClick={()=>void removeSaved('reports',reportSelection)}>{deleting?'正在删除…':'删除选中'}</button>{reportSelection.length>0&&<button onClick={()=>setReportSelection([])}>取消选择</button>}</div>
<div className="report-list">{reports.map(item=>
<section key={item.id}>
<label className="saved-row-select"><input type="checkbox" aria-label={'选择报告：'+item.title} checked={reportSelection.includes(item.id)} onChange={e=>selectSaved('reports',item.id,e.target.checked)}/></label>
<FileText size={24}/>
<div>
<h3>{item.title}</h3>
<p>{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.run.results.length} 项工具</p>
</div>
<button onClick={()=>{setReport(item);setView('analysis');setMobileFocus(false);}}>查看报告</button>
<button onClick={()=>{nextReportTab.current='review';setReport(item);setView('analysis');setMobileFocus(false);}}>逐条复核</button>
<a className="button" href={'/api/reports/'+item.id+'/html'}>HTML</a>
<a className="button" href={'/api/reports/'+item.id+'/markdown'}>Markdown</a>
<button className="danger-action" disabled={deleting} onClick={()=>void removeSaved('reports',[item.id])}>删除</button>
</section>)}{!reports.length&&<p className="empty">还没有报告。分析结束后，点击回答下方的“保存报告”。</p>}</div>
<RetrievalExperiments key={'experiments:'+workspace?.current?.id} datasetId={meta?.id} datasetName={meta?.name} readOnly={Boolean(readOnly)} latestSearch={latestSearch}/>
</>
}
 {view==='settings'&&!settings&&<p className="muted" role="status">正在读取模型配置…</p>}
 {view==='settings'&&settings&&<ModelSettings settings={settings} request={api} disabled={toolBusy||busy} pending={toolBusy} setPending={setToolBusy} onSaved={setSettings} onError={setError} onNotice={setNotice} usage={workspace?.current&&<ModelUsage key={workspace.current.id} projectName={workspace.projects.find(project=>project.id===workspace.current?.id)?.name||workspace.current.id}/>}/>}
 {view==='settings'&&<button onClick={async()=>{await api('logout',{});setLogged(false);newChat();}}>
<LogOut size={16}/>
退出登录</button>}
 </main>
<aside id="analysis-assistant" className={`assistant ${mobileFocus?'is-open':''}`}>
<header>
<div>
<MessagesSquare size={19}/>
<h2>分析助手</h2><button className="assistant-research-entry" onClick={()=>{setDeepGoal(text.trim());setDeepOpen(true);}}>深度报告<ArrowUpRight size={13}/></button>
</div>
<button onClick={()=>{setView('history');setMobileFocus(false);setReport(undefined);}} aria-label="对话历史"><MessagesSquare size={16}/>对话历史</button>
<button onClick={newChat} aria-label="新对话">
<Plus size={16}/>
新对话</button>
</header>{mobileFocus&&(error||notice)&&<div className={error?'notice error':'notice'} role={error?'alert':'status'}>
<span>{error||notice}</span>
<button aria-label="关闭提示" onClick={()=>{setError('');setNotice('');}}>
<X size={15}/>
</button>
</div>}<div className="assistant-scope">{currentMeta?.count||0} 条记录<span>{report?'已保存报告':meta?.indexed===meta?.count?'语义检索可用':'语义索引未完成'}</span>
</div>
<div className="chat-body" ref={chatRef} onScroll={e=>{const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;setShowLatest(!nearBottom.current);}}>{!shownTurns.length&&<div className="assistant-welcome">
<h3>开始新分析</h3>
<p>输入问题，或选一个问题填入。工具计划和运行进度会显示在这里。</p>
<SuggestedQuestions datasetId={meta?.id} initialPool={starterPool} onPoolChange={setStarterPool} onChoose={item=>{chosenStarter.current=item;setText(item.question);document.querySelector<HTMLTextAreaElement>('.patent-composer textarea')?.focus();}}/>
</div>}{shownTurns.map(r=>
<section className="chat-turn" key={r.id}>
{!(report&&r.kind==='research')&&<div className="question">{r.question}</div>}{r.kind!=='help'&&<AnalysisProcess run={r} tools={tools} onPatent={openPatent}/>}
{!report&&!r.id.startsWith('pending-')&&<RunBudget key={'budget:'+r.id} runId={r.id} readOnly={Boolean(readOnly)}/>}
<PatentNarrative text={r.answer||(r.status==='running'?r.kind==='help'?'正在查阅功能说明。':'':r.results.length?'':'本次没有生成结果。')} results={r.results} streaming={r.status==='running'&&!report} onPatent={(id,datasetId,location)=>openPatent(id,datasetId,location)}/>
{r.kind==='help'&&<small className="graph-note">功能说明 · 依据使用说明回答，未执行数据分析</small>}
{r.error&&<p className="error">{r.error}</p>}<div className="turn-actions">
<span>{r.status==='completed'?'已完成':r.status==='partial'?'部分完成':r.status==='running'?'进行中':r.status==='cancelled'?'已停止':r.status==='interrupted'?'运行中断':'失败'}</span>{!report&&r.kind==='research'&&<button onClick={()=>{sessionStorage.setItem('atlas-deep-research',r.id);setDeepGoal('');setDeepOpen(true);}}>打开研究工作区</button>}{!report&&r.kind!=='research'&&r.status!=='running'&&<>
<button disabled={busy||!meta} onClick={()=>send(r.question)}>重新运行问题</button>{r.results.length>0&&<button onClick={()=>save(r)}>保存报告</button>}{r.results.some(result=>result.status==='completed')&&<button disabled={busy} onClick={()=>retry(r)}>重新生成报告</button>}</>
}</div>
{!report&&r===shownTurns.at(-1)&&['completed','partial'].includes(r.status)&&<div className="followup-questions" aria-label="相关追问"><div className="followup-heading"><small>{suggesting===r.id?'正在生成相关追问…':'相关追问'}</small><button className="followup-refresh" disabled={busy||Boolean(suggesting)} onClick={()=>void suggest(r,true)}><RefreshCw size={13}/>换一组</button></div>{r.followups?.map(question=><button key={question} disabled={busy} onClick={()=>{setText(question);requestAnimationFrame(()=>document.querySelector<HTMLTextAreaElement>('.patent-composer textarea')?.focus());}}>{question}<ArrowUpRight size={14}/></button>)}</div>}
</section>)}</div>{showLatest&&<button className="chat-jump" onClick={()=>{nearBottom.current=true;chatRef.current?.scrollTo({top:chatRef.current.scrollHeight,behavior:'smooth'});setShowLatest(false);}}>回到最新消息</button>}<PatentComposer text={text} onText={setText} onSend={()=>send()} onStop={()=>api('runs/'+currentRun.current+'/stop',{})} busy={busy} stoppable={!submitting.current||!turns.at(-1)?.id.startsWith('pending-')} disabled={!meta||Boolean(report)||Boolean(readOnly)} callLimit={modelCallLimit} onCallLimit={setModelCallLimit}/>
</aside>
</div>
</div>
 {patent&&<div className="detail-overlay" role="dialog" aria-modal="true" aria-label="专利原文">
<section className="patent-detail">
<header>
<button onClick={()=>setPatent(undefined)}>
<ChevronLeft size={16}/>
返回工作台</button>
<a href={patent.sourceUrl} target="_blank" rel="noreferrer">公开文献 <ArrowUpRight size={14}/>
</a>
</header>
<div className="patent-content">
<span className="patent-id">{patent.id}</span>
<h2>{patent.title}</h2>
{patentEvidence&&<PatentEvidence patent={patent} location={patentEvidence}/>}
{patentDatasetId&&<PatentAnnotations key={patentDatasetId+':'+patent.id} datasetId={patentDatasetId} patentId={patent.id} readOnly={Boolean(readOnly)}/>}
{patentDatasetId&&<SourceVersions key={'versions:'+patentDatasetId+':'+patent.id} datasetId={patentDatasetId} patentId={patent.id}/>}
<PatentPapers key={'papers:'+patent.id} patentId={patent.id}/>
<dl>
<dt>申请人</dt>
<dd>{patent.applicants.join('; ')||'未提供'}</dd>
<dt>受让人</dt>
<dd>{patent.assignees.join('; ')||'未提供'}</dd>
<dt>公开日期</dt>
<dd>{patent.publicationDate}</dd>
<dt>IPC / CPC</dt>
<dd>{patent.ipc.join('; ')} / {patent.cpc.join('; ')}</dd>
<dt>原始来源</dt>
<dd>{patent.sourceName}</dd>
</dl>
<h3>摘要</h3>
<p>{patent.abstract}</p>
{!readOnly&&<div className="record-actions"><button disabled={toolBusy||patentDatasetId!==meta?.id} onClick={()=>void runTool({steps:[{tool:'analyze_patent_reading',params:{patent_numbers:[patent.id]}}],question:'整理 '+patent.id+' 的技术问题、解决手段与技术效果，逐项保留原文依据。'})}>分析技术问题、手段与效果</button>{patentDatasetId!==meta?.id&&<span className="muted">请先切换到此专利所属数据集。</span>}</div>}
<ClaimReader key={patent.id} claims={patent.claims} onAnalyze={readOnly?undefined:number=>void runTool({steps:[{tool:'analyze_claim_elements',params:{patent_numbers:[patent.id],claim_numbers:[number]}}],question:'提取 '+patent.id+' 权利要求 '+number+' 的技术要素并保留原文依据。'})} analysisDisabled={toolBusy||patentDatasetId!==meta?.id} analysisNote={patentDatasetId!==meta?.id?'请先切换到此专利所属数据集。':undefined}/><details>
<summary>说明书全文</summary>
<pre className="original-text">{patent.description}</pre>
</details>
<details>
<summary>原始采集文本</summary>
<pre className="original-text">{patent.rawText||'此导入来源未提供单独原文文本'}</pre>
</details>
</div>
</section>
</div>}
 </div>;
}
