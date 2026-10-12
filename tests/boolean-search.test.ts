import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBooleanQuery,matchesBoolean,isBooleanQuery,requiresFullText} from '../src/server/boolean-search';
import {normalize} from '../src/server/importers';
const patent=normalize({id:'US1B1',title:'Temperature sensor',abstract:'Controller uses thermal feedback',applicants:['Example Labs'],ipc:['H04L9/00'],description:'A cooling valve'},'TEST');
test('Boolean search honors precedence, negation, phrases and field-scoped groups',()=>{
 for(const query of ['title:temperature AND abstract:feedback','title:(sensor OR valve) AND NOT applicant:Other','"temperature sensor"','description:cool*','ipc:H04L'])assert.equal(matchesBoolean(patent,parseBooleanQuery(query)),true,query);
 assert.equal(matchesBoolean(patent,parseBooleanQuery('title:valve')),false);
 assert.equal(matchesBoolean(patent,parseBooleanQuery('sensor OR absent AND missing')),true);
 assert.equal(matchesBoolean(patent,parseBooleanQuery('(sensor OR absent) AND missing')),false);
 assert.equal(requiresFullText(parseBooleanQuery('title:sensor')),false);assert.equal(requiresFullText(parseBooleanQuery('sensor')),true);
 assert.equal(isBooleanQuery('temperature sensor'),false);assert.equal(isBooleanQuery('temperature AND sensor'),true);
 assert.equal(isBooleanQuery('transaction signature verification and block generation'),false);
 assert.equal(isBooleanQuery('not gate circuit'),false);
 assert.equal(isBooleanQuery('title:sensor and abstract:feedback'),true);
});
test('malformed expressions and unknown fields fail rather than silently changing meaning',()=>{
 for(const query of ['sensor AND','(sensor','sensor)','unknown:sensor','"sensor','sen*sor','AND sensor'])assert.throws(()=>parseBooleanQuery(query),Error,query);
});
