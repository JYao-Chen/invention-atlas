import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MonitorStrategyEditor from '../src/components/MonitorStrategyEditor';
test('read-only monitor members see parameter values without an editing action',()=>{
 const html=renderToStaticMarkup(createElement(MonitorStrategyEditor,{id:'fixture',revision:2,params:{query:'blockchain',strategy_id:'fixture',top_k:35,counting:'family'},readOnly:true,busy:false,onSave:async()=>{throw new Error('read-only must not save');},onReload:async()=>true}));
 assert.match(html,/<fieldset disabled=""/);assert.match(html,/value="blockchain"/);assert.match(html,/value="35"/);assert.match(html,/检索策略 · 第2版/);
 assert.doesNotMatch(html,/保存策略版本/);assert.doesNotMatch(html,/以此版本编辑新策略/);
});
