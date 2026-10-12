import {build} from 'esbuild';
import {cp,mkdir,readFile} from 'node:fs/promises';
const root='.next/standalone';
await mkdir(root+'/scripts',{recursive:true});
for(const entry of ['agent-worker','migrate-postgres','import-sqlite-postgres','verify-postgres-import','initialize-admin'])await build({entryPoints:['scripts/'+entry+'.ts'],outfile:root+'/scripts/'+entry+'.mjs',bundle:true,platform:'node',format:'esm',packages:'external',target:'node22',logLevel:'warning'});
await cp('migrations',root+'/migrations',{recursive:true});
await import('./build-patent-mcp.mjs');
await cp('integrations/patent-mcp',root+'/integrations/patent-mcp',{recursive:true});
// Next traces only the exports used by Web routes; workers also need the native ESM exports.
for(const name of ['zod','pg','sharp','@langchain/core','@langchain/langgraph','@langchain/langgraph-checkpoint'])await cp('node_modules/'+name,root+'/node_modules/'+name,{recursive:true});
// XML is bundled into Web chunks, so Next's trace does not include the packages
// imported directly by the independent worker. Copy its actual dependency graph.
const copied=new Set();
async function copyXmlPackage(name){
 if(copied.has(name))return;copied.add(name);
 const path='node_modules/'+name,manifest=JSON.parse(await readFile(path+'/package.json','utf8'));
 await cp(path,root+'/'+path,{recursive:true});
 for(const dependency of Object.keys(manifest.dependencies||{}))await copyXmlPackage(dependency);
}
await copyXmlPackage('fast-xml-parser');
console.log('Runtime worker, migration and initialization scripts built.');
