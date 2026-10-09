import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {dataset,patents,savePatent,updateDataset,dataRoot} from '../src/server/db';
import {htmlText} from '../src/server/public-enrichment';
const meta=dataset()!,p=patents(meta.id).find(p=>p.id==='US9646029B1')!;if(!p.publicEvidence)throw new Error('先完成公开信息补充');
const sourceUrl='https://www.hederacouncil.org/faq',file=resolve(dataRoot,'sources/public-enrichment/hedera-commercial.json');
let cached:{html:string;retrievedAt:string};if(existsSync(file))cached=JSON.parse(readFileSync(file,'utf8'));else{const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Hedera官方说明下载失败');cached={retrievedAt:new Date().toISOString(),html:await response.text()};writeFileSync(file,JSON.stringify(cached));}
const text=htmlText(cached.html),amount=/purchase price for the IP[\s\S]{0,600}?representing a USD value of \$([\d,]+)/i.exec(text);if(!amount||!text.includes('Swirlds')||!text.includes('2022'))throw new Error('官方页面未找到可核验的交易背景金额');
p.publicEvidence.commercialContext={sourceUrl,retrievedAt:cached.retrievedAt,transactionYear:2022,assetScope:'hashgraph知识产权组合、许可协议买断及非竞争条款，不是单项专利',reportedAmount:Number(amount[1].replace(/,/g,'')),currency:'USD',pricingBasis:'交易方披露的当时美元价值，主要基于原许可协议买断成本的净现值；不换算为今天价格',associationBasis:'本编号页面记录2022年Swirlds至Hedera的权属事件；官方FAQ描述相关技术组合交易，但未逐项列出专利分配价格',limitation:'只作技术组合交易背景，不是US9646029B1的成交价或估值，不按件数分摊，也不外推其他专利。'};
savePatent(meta.id,p);const note='US9646029B1附加Hedera官方披露的2022年Hashgraph知识产权组合交易背景；金额不是单项专利估值。';if(!meta.warnings.includes(note)){meta.warnings.push(note);updateDataset(meta);}console.log(JSON.stringify(p.publicEvidence.commercialContext,null,2));
