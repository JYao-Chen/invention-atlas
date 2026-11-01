import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {reportCitationPlugin,type CitationOptions} from '../lib/report-reading';
import {mathMarkdown} from '../lib/math-markdown';

export default function MathMarkdown({children,citations}:{children:string;citations?:CitationOptions}){
 return <Markdown remarkPlugins={[remarkGfm,remarkMath,...(citations?[[reportCitationPlugin,citations] as [typeof reportCitationPlugin,CitationOptions]]:[])]} components={{a:({href,children,node,...props})=>citations&&href?.startsWith('#'+citations.prefix+'source-')?<sup className="report-citation"><a {...props} href={href} aria-label={'查看来源 '+String(children).replace(/\D/g,'')} onClick={event=>{const target=document.getElementById(href.slice(1));if(target){event.preventDefault();const details=target.closest('details');if(details)details.open=true;target.scrollIntoView({block:'start'});target.focus({preventScroll:true});}}}>{children}</a></sup>:<a {...props} href={href}>{children}</a>}} rehypePlugins={[[rehypeKatex,{strict:false,trust:false}]]}>{mathMarkdown(children)}</Markdown>;
}
