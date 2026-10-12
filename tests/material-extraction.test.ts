import {test} from 'node:test';
import assert from 'node:assert/strict';
import {docxMaterialText,extractMaterial} from '../src/server/material-extraction';
test('material text preserves UTF-8 text, reports preview only and rejects unsupported inputs',async()=>{
 const text='技术方案\n第一步：验证身份。\n第二步：处理交易。';
 const parsed=await extractMaterial(new File([text],'方案.txt'));assert.equal(parsed.text,text);assert.equal(parsed.saved,false);assert.equal(parsed.pages[0].page,null);
 await assert.rejects(extractMaterial(new File(['x'],'legacy.doc')),/请选择/);
 await assert.rejects(extractMaterial(new File([],'empty.txt')),/1字节/);
});
test('Word extraction preserves paragraph/table order, tabs and excludes deleted text',()=>{
 const xml='<w:document><w:body><w:p><w:r><w:t>领域 &amp; 方案</w:t><w:tab/><w:t>备注</w:t></w:r><w:del><w:r><w:t>已删除</w:t></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>部件A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>连接B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
 const text=docxMaterialText(xml);assert.ok(text.includes('领域 & 方案\t备注'));assert.ok(!text.includes('已删除'));assert.ok(text.indexOf('部件A')<text.indexOf('连接B'));
});
