import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ocrConfidence,recognizePdfPages} from '../src/server/material-ocr';
test('OCR quality reports mean recognized-word confidence without calling it accuracy',()=>{
 const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
 assert.equal(ocrConfidence(header+'\n5\t1\t1\t1\t1\t1\t0\t0\t20\t20\t80\tTest\n5\t1\t1\t1\t1\t2\t0\t0\t20\t20\t100\tword'),90);
 assert.equal(ocrConfidence(header+'\n1\t1\t0\t0\t0\t0\t0\t0\t0\t0\t-1\t'),null);
});
test('OCR rejects duplicate and invalid page selections before invoking external programs',async()=>{
 for(const pages of [[],[0],[1,1],[1.5]])await assert.rejects(recognizePdfPages(Buffer.alloc(0),pages),/页码/);
});
