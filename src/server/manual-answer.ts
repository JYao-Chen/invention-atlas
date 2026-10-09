import {guideChapters,type GuideChapter} from '@/lib/help-guide';
import {questions} from '@/lib/suggestions';
import type {Run} from '@/lib/types';
import {chat} from './model';
import {saveRun,event} from './db';

const aliases:Record<string,string[]>={analyze_lifecycle:['生命周期','Logistic'],analyze_citation_network:['引证','引用网络','共引','耦合','PageRank'],analyze_concentration:['集中度','CR3','CR5','HHI'],charts:['聚类','K-means','PCA','主题'],generate_wordcloud:['词云','词频','TF-IDF','关键词'],analyze_patent_trend:['公开趋势'],analyze_yearly_keywords:['年度关键词'],analyze_burst_terms:['突现'],analyze_co_network:['合作网络'],analyze_tech_roadmap:['主路径','技术路线','SPC'],analyze_patent_valuation:['估值','筛查','Pareto'],compare_claims:['权利要求对照'],analyze_claim_elements:['权利要求','要素'],analyze_tech_matrix:['技术效果','矩阵'],analyze_family_geography:['同族'],analyze_legal_status:['法律状态'],search_patents:['检索']};
export function manualChapters(question:string):GuideChapter[]{
 if(Object.values(questions).includes(question.trim()))return [];
 if(!/介绍|是什么|什么是|含义|定义|原理|如何使用|怎么用|有什么用|用途|作用|讲解|说明|解释|如何操作|怎么操作|如何设置|怎么设置|有何区别|有什么区别|有哪些功能/.test(question))return [];
 if(/(?:请|帮我|并|然后|同时)(?:运行|执行)|运行一下|执行一次/.test(question))return [];
 if(/(?:运行|执行|分析|统计|计算|检索|拆解|对照).{0,12}(?:这批|当前数据集|这些专利)|(?:这批|当前数据集|这些专利).{0,12}(?:运行|执行|分析|统计|计算|检索|拆解|对照)|生成.{0,6}报告/.test(question))return [];
 const lower=question.toLowerCase();
 const matched=guideChapters.filter(c=>lower.includes(c.title.toLowerCase())||c.tool&&lower.includes(c.tool)||aliases[c.id]?.some(word=>lower.includes(word.toLowerCase())));
 if(matched.length)return matched;
 return /系统|平台|有哪些功能|分析助手|(?:这个|该)(?:功能|工具)/.test(question)?guideChapters:[];
}
export async function answerManual(r:Run,chapters:GuideChapter[],signal:AbortSignal){
 event(r.id,'status',{phase:'Manual',message:'正在查阅使用说明'});
 r.kind='help';r.answer='';saveRun(r);
 await chat('依据给定使用说明回答专利分析功能咨询。使用正式、准确的说明文，不用“功能名：通俗翻译”式标题，不使用宣传或拟人比喻。按照问题需要介绍研究用途、实际算法、操作与结果含义，保留方法条件及限制，不强制套相同段落模板。直接陈述，避免“需要明确的是”等空转提示语。公式写普通文本，不能使用LaTeX或美元符号，因为页面未提供公式排版。只描述本系统已经实现的内容，不能声称执行了分析或编造当前数据的计算结果。没有说明的功能明确表示未说明。章节引用必须是可点击Markdown链接，例如[生命周期统计](#guide/analyze_lifecycle)，不能写成[#guide/analyze_lifecycle]。多项方法对比时说明具体差异。',JSON.stringify({question:r.question,chapters:chapters.map(c=>({id:c.id,number:c.number,title:c.title,intro:c.intro,body:c.body,tool:c.tool,link:'#guide/'+c.id}))}),{signal,onDelta:text=>{r.answer+=text;event(r.id,'text-delta',{text});saveRun(r);}});
 if(!/\]\(#guide\//.test(r.answer)){const text='\n\n相关章节：'+chapters.slice(0,6).map(c=>`[${c.number} ${c.title}](#guide/${c.id})`).join(' · ');r.answer+=text;event(r.id,'text-delta',{text});saveRun(r);}
}
