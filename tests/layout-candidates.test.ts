import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import NoveltyCandidates from '../src/components/NoveltyCandidates';
const memberships=[{patent:'SYNTHETIC-A',strategies:[]},{patent:'SYNTHETIC-B',strategies:[]}];
test('layout candidate editor preserves all available records after a subset is saved',()=>{
 const html=renderToStaticMarkup(createElement(NoveltyCandidates,{purpose:'layout',patentIds:['SYNTHETIC-A'],memberships,disabled:false,onSave:async()=>{}}));
 assert.match(html,/选择布局抽取文献/);assert.match(html,/已选 1 \/ 2 件/);
 assert.ok(html.includes('SYNTHETIC-A')&&html.includes('SYNTHETIC-B'));
 assert.match(html,/已显示保存版本/);assert.match(html,/<button disabled="">保存文献选择/);
});
test('reader sees candidate scope but no selection mutation controls',()=>{
 const html=renderToStaticMarkup(createElement(NoveltyCandidates,{purpose:'layout',patentIds:['SYNTHETIC-A'],memberships,disabled:false,readOnly:true,onSave:async()=>{}}));
 assert.ok(!html.includes('保存文献选择')&&!html.includes('清空选择')&&!html.includes('选择全部'));
 assert.equal((html.match(/type="checkbox" disabled=""/g)||[]).length,2);
});
