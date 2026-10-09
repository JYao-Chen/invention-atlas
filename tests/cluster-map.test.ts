import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clusterMap} from '../src/server/cluster-map';
import type {Patent} from '../src/lib/types';
test('PCA map preserves cluster membership, is deterministic and accounts for variance',()=>{
 const records=[[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]].map((embedding,i)=>({id:String(i),title:'Patent '+i,embedding} as Patent));
 const rows=[{cluster:1,patents:['0','2']},{cluster:2,patents:['1','3']}];
 const map=clusterMap(records,rows);assert.deepEqual(map,clusterMap(records,rows));assert.equal(map.points.length,4);assert.deepEqual(map.points.map(p=>p.cluster),[1,2,1,2]);assert.ok(Math.abs(map.variance.reduce((a,b)=>a+b,0)-1)<1e-8);assert.ok(map.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
test('empty and identical vectors produce finite zero-variance maps',()=>{
 assert.deepEqual(clusterMap([],[]),{points:[],variance:[0,0]});
 const records=[{id:'a',title:'a',embedding:[1,0]},{id:'b',title:'b',embedding:[1,0]}] as Patent[];
 const map=clusterMap(records,[{cluster:1,patents:['a','b']}]);assert.deepEqual(map.variance,[0,0]);assert.ok(map.points.every(p=>p.x===0&&p.y===0));
});
