import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chartColors,toolGroups} from '../src/components/chart-colors';
import {TOOL_DEFS} from '../src/server/tools';
const css=readFileSync('src/app/globals.css','utf8');
test('all real tools have a visual group; chart categories retain 12 distinct colours',()=>{assert.equal(new Set(chartColors).size,12);for(const [tool,,group] of TOOL_DEFS)assert.equal(toolGroups[tool],group);});
test('each functional group keeps one distinct marker colour and no tinted surfaces',()=>{const groups=[...css.matchAll(/^\[data-group="([^"]+)"\]\s*\{([^}]+)\}/gm)];assert.equal(groups.length,9);const colours=groups.map(([,name,body])=>{const match=/--section-color:(#[a-f0-9]{6})/.exec(body);assert.ok(match,name+' marker colour');return match![1];});assert.equal(new Set(colours).size,9);assert.doesNotMatch(css,/--section-(tint|ink)/);});
