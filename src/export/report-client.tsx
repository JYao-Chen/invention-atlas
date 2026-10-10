import {createRoot} from 'react-dom/client';
import PatentNarrative from '../components/PatentNarrative';
import type {Run} from '../lib/types';
import 'katex/dist/katex.min.css';
import '../app/globals.css';
import '../app/tally-ui.css';
import '../app/journal-colors.css';
import './report.css';

const report=JSON.parse(document.getElementById('report-data')!.textContent!) as {title:string;run:Run};
const urls=new Map<string,string>();
for(const result of report.run.results)for(const source of result.rowSources||[])for(const patent of source.representatives)if(patent.sourceUrl)urls.set(patent.patent,patent.sourceUrl);
function openPatent(id:string){const candidate=urls.get(id);const url=candidate&&/^https?:\/\//i.test(candidate)?candidate:'https://patents.google.com/patent/'+encodeURIComponent(id)+'/en';window.open(url,'_blank','noopener,noreferrer');}
createRoot(document.getElementById('report-root')!).render(<>
 <header className="export-heading"><h1>{report.title}</h1><p>数据集 {report.run.datasetSnapshot?.name||report.run.datasetId} · {new Date(report.run.createdAt).toLocaleString('zh-CN')} · 保存时的分析结果</p></header>
 <PatentNarrative text={report.run.answer} results={report.run.results} onPatent={openPatent} showMethods/>
</>);
