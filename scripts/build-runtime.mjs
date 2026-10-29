import {build} from 'esbuild';
import {cp,mkdir,readFile} from 'node:fs/promises';
import {builtinModules} from 'node:module';
import {existsSync} from 'node:fs';
const root='.next/standalone';
await mkdir(root+'/scripts',{recursive:true});
const external=new Set();
for(const entry of ['agent-worker','migrate-postgres','import-sqlite-postgres','verify-postgres-import','initialize-admin']){
 const result=await build({entryPoints:['scripts/'+entry+'.ts'],outfile:root+'/scripts/'+entry+'.mjs',bundle:true,platform:'node',format:'esm',packages:'external',target:'node22',logLevel:'warning',metafile:true});
 for(const output of Object.values(result.metafile.outputs))for(const item of output.imports)if(item.external&&!item.path.startsWith('node:'))external.add(item.path.startsWith('@')?item.path.split('/').slice(0,2).join('/'):item.path.split('/')[0]);
}
await cp('migrations',root+'/migrations',{recursive:true});
await import('./build-patent-mcp.mjs');
await cp('integrations/patent-mcp',root+'/integrations/patent-mcp',{recursive:true});
// Next traces only the exports used by Web routes; workers also need the native ESM exports.
for(const name of ['zod','pg','sharp','@langchain/core','@langchain/langgraph','@langchain/langgraph-checkpoint'])await cp('node_modules/'+name,root+'/node_modules/'+name,{recursive:true});
// Packages bundled into Web chunks are absent from Next's trace, and traced copies may
// omit exports the independent scripts use. Copy every package the scripts import
// externally together with its dependency graph.
const copied=new Set();
async function copyPackage(name){
 const path='node_modules/'+name;
 // A dependency missing at the top level is nested in, and copied with, its parent.
 if(copied.has(name)||!existsSync(path+'/package.json'))return;copied.add(name);
 const manifest=JSON.parse(await readFile(path+'/package.json','utf8'));
 await cp(path,root+'/'+path,{recursive:true});
 for(const dependency of Object.keys(manifest.dependencies||{}))await copyPackage(dependency);
}
for(const name of [...external].filter(name=>!builtinModules.includes(name)).sort())await copyPackage(name);
console.log('Runtime worker, migration and initialization scripts built.');
