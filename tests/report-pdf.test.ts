import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportReportPdf} from '../src/server/report-pdf';
import type {Run} from '../src/lib/types';
test('PDF export rejects an incomplete renderer before returning a download',async()=>{
 const previous=process.env.PATENT_PDF_LIBREOFFICE_DIR;
 process.env.PATENT_PDF_LIBREOFFICE_DIR='/nonexistent-atlas-pdf-runtime';
 try{await assert.rejects(exportReportPdf({title:'合成',run:{} as Run}),/PDF导出环境未就绪/);}
 finally{if(previous===undefined)delete process.env.PATENT_PDF_LIBREOFFICE_DIR;else process.env.PATENT_PDF_LIBREOFFICE_DIR=previous;}
});
