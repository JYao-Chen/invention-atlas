import {test} from 'node:test';
import assert from 'node:assert/strict';
import {partitionRows,coveragePercent,tableHeading,plottedRows} from '../src/lib/result-tables';

test('overview and coverage rows do not produce a sparse union table',()=>{
 const rows=[{records:300,period:'2019 / 2021',applicants:272,indexed:300},{field:'title',coverage:1},{field:'citations',coverage:140/300}];
 const groups=partitionRows(rows);
 assert.equal(groups.length,2);
 assert.deepEqual(groups[1].keys,['field','coverage']);
 assert.deepEqual(groups.flatMap(g=>g.rows),rows);
 assert.equal(coveragePercent(140/300),'46.67%');
 assert.equal(coveragePercent(0),'0%');
 assert.equal(coveragePercent(1),'100%');
 assert.equal(coveragePercent(null),'—');
});

test('grouping preserves null, zero and optional fields without dropping source rows',()=>{
 const rows=[{patent:'A',score:0},{score:null,patent:'B'},{patent:'C'},{patent:'A',score:0}];
 const groups=partitionRows(rows);
 assert.equal(groups.length,2);assert.equal(groups[0].rows.length,3);
 assert.deepEqual(groups[0].rows[1],rows[1]);
 assert.equal(groups.reduce((n,g)=>n+g.rows.length,0),rows.length);
 assert.deepEqual(partitionRows([]),[]);
});

test('citation and fit sections keep real row types separate',()=>{
 const groups=partitionRows([{metric:'内部引证边',count:0},{patent:'A',pagerank:.02},{source:'A',target:'B',type:'co_citation',weight:1},{source:'A',target:'B',type:'bibliographic_coupling',weight:1}]);
 assert.deepEqual(groups.map(g=>tableHeading(g.keys,g.type)),['引证数量','专利引证指标','共引关系','文献耦合']);
 assert.equal(tableHeading(['type','r2'],'fit_diagnostics'),'拟合诊断');
});
test('time plots retain all periods and exclude fit diagnostics',()=>{const rows=Array.from({length:36},(_,i)=>({year:String(2000+i),cumulative:i}));const chart={kind:'line' as const,x:'year',y:'cumulative'};assert.equal(plottedRows([...rows,{type:'fit_diagnostics'}],chart).length,36);assert.equal(plottedRows(rows,chart).at(-1)?.year,'2035');});
