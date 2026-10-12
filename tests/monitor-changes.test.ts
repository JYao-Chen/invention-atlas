import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MonitorChanges from '../src/components/MonitorChanges';

test('monitor field changes expose full escaped before/after text and preserve zero and false',()=>{
 const rendered=renderToStaticMarkup(createElement(MonitorChanges,{changes:[{field:'title',before:'<script>原文</script>',after:'新标题'},{field:'count',before:0,after:false},{field:'missing',before:null,after:'新增字段'}]}));
 assert.match(rendered,/修改前/);assert.match(rendered,/修改后/);
 assert.match(rendered,/&lt;script&gt;原文&lt;\/script&gt;/);assert.doesNotMatch(rendered,/<script>/);
 assert.match(rendered,/<dd>0<\/dd>/);assert.match(rendered,/<dd>false<\/dd>/);
 assert.match(rendered,/空值或未保存/);assert.match(rendered,/新增字段/);
});
