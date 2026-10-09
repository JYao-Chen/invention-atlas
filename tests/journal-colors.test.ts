import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chartColors,toolGroups} from '../src/components/chart-colors';
import {TOOL_DEFS} from '../src/server/tools';
const css=readFileSync('src/app/journal-colors.css','utf8');
function luminance(hex:string){const rgb=hex.replace('#','').match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function contrast(a:string,b:string){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
test('all real tools have a visual group; chart categories retain 12 distinct colours',()=>{assert.equal(new Set(chartColors).size,12);for(const [tool,,group] of TOOL_DEFS)assert.equal(toolGroups[tool],group);});
test('functional group text is readable on its own pale background',()=>{const groups=[...css.matchAll(/\[data-group="([^"]+)"\]\s*\{([^}]+)\}/g)];assert.equal(groups.length,9);for(const [,name,body] of groups){const background=/--section-tint:(#[a-f0-9]{6})/.exec(body)![1],foreground=/--section-ink:(#[a-f0-9]{6})/.exec(body)![1];assert.ok(contrast(background,foreground)>=4.5,name+' text contrast');}});
