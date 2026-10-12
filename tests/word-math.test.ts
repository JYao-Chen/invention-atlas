import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wordMath} from '../src/server/word-math';
const slash=String.fromCharCode(92);
test('Word formulas convert structural mathematics but do not flatten unsupported matrices',()=>{
 for(const tex of ['(1+'+slash+'ln'+slash+'mathrm{TF})(1+'+slash+'ln'+slash+'frac{N+1}{DF+1})','x_i^2','x^2',slash+'sqrt{x}',slash+'sqrt[3]{x}'])assert.ok(wordMath(tex),tex);
 assert.equal(wordMath(slash+'begin{matrix}a&b'+slash+slash+'c&d'+slash+'end{matrix}'),undefined);
 assert.equal(wordMath(slash+'unknownmacro{x}'),undefined);
});
test('Word supports summation and integral limits instead of flattening operators',()=>{
 for(const tex of [slash+'sum_{i=1}^{N}x_i',slash+'sum'+slash+'limits_{i=1}^{N}x_i',slash+'int_0^1 f(x)dx'])assert.ok(wordMath(tex),tex);
});
