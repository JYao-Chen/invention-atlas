import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {guideChapters} from '../src/lib/help-guide';
test('manual has distinct chapters, valid destinations, sections and documented demos',()=>{
 assert.equal(new Set(guideChapters.map(c=>c.id)).size,guideChapters.length);
 assert.equal(guideChapters.length,10);
 for(const c of guideChapters){assert.ok(['data','analysis','history','reports','settings','assistant'].includes(c.target));assert.ok(c.body.includes('## '));if(c.question)assert.ok(c.question.length>10);}
});
test('manual screenshots and generated repository guide stay complete',()=>{
 const markdown=readFileSync('docs/USER-GUIDE.md','utf8');
 for(const c of guideChapters){assert.ok(markdown.includes(c.body));if(c.figure)for(const size of ['desktop','mobile'])assert.ok(existsSync(`public/help/${size}-${c.figure}.png`));}
});
