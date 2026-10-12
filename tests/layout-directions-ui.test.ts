import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import LayoutDirections from '../src/components/LayoutDirections';
const direction={title:'SYNTHETIC 方向',function:'SYNTHETIC 措施',effect:'SYNTHETIC 效果',hypothesis:'SYNTHETIC 研发假设',reason:'SYNTHETIC 目标依据',query:'title:SYNTHETIC',relationStatus:'unobserved_recombination_hypothesis',observedPublications:0,limitation:'SYNTHETIC 不构成专利空白判断',evidence:[{row:7,patent:'SYNTHETIC-P',quote:'原文 <script> 保持逐字'}]};
test('direction review exposes hypothesis, exact escaped evidence and real unavailable status',()=>{
 const html=renderToStaticMarkup(createElement(LayoutDirections,{suggestions:{objective:'SYNTHETIC 目标',directions:[direction],unresolved:['SYNTHETIC 缺少可行性验证']},searches:[{query:direction.query,tool:'search_patents',status:'completed',returned:0,summary:'无匹配记录'},{query:direction.query,tool:'search_patent_passages',status:'unavailable',returned:0,summary:'未建立段落索引'}]}));
 for(const value of ['待验证组合假设','原始证据行 8','原文 &lt;script&gt; 保持逐字','无匹配记录','未建立段落索引','不可用','SYNTHETIC 缺少可行性验证'])assert.ok(html.includes(value));
 assert.match(html,/<td>不可用<\/td><td>—<\/td>/);assert.match(html,/<td>已完成<\/td><td>0<\/td>/);
 assert.ok(!html.includes('<script>'));
});
test('empty suggestions do not manufacture directions or legal conclusions',()=>{
 const html=renderToStaticMarkup(createElement(LayoutDirections,{suggestions:{objective:'SYNTHETIC',directions:[],unresolved:['原文关系不足']},searches:[]}));
 assert.ok(html.includes('没有形成有证据支持的候选方向'));assert.ok(html.includes('原文关系不足'));assert.ok(!html.includes('<article>'));
});
