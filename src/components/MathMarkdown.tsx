import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {mathMarkdown} from '../lib/math-markdown';

export default function MathMarkdown({children}:{children:string}){
 return <Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{strict:false,trust:false}]]}>{mathMarkdown(children)}</Markdown>;
}
