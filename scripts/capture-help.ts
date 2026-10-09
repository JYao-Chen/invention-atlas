import {mkdirSync} from 'node:fs';
// Optional Playwright installation; credentials are loaded from the environment.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
process.loadEnvFile('.env.local');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
mkdirSync('public/help',{recursive:true});
for(const [device,width] of [['desktop',1440],['mobile',390]] as const){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors:string[]=[];
 page.on('pageerror',(error:Error)=>errors.push(error.message));
 await page.goto(process.env.ATLAS_CHECK_URL||'http://127.0.0.1:3017');
 await page.locator('input[name=username]').fill(process.env.PATENT_USERNAME||'jyao');
 await page.locator('input[name=password]').fill(process.env.PATENT_PASSWORD!);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.locator('.patent-title').first().waitFor();
 const capture=async(key:string)=>{await page.screenshot({path:`public/help/${device}-${key}.png`});};
 await capture('data');
 await page.locator('tbody tr').first().getByRole('button',{name:'编辑',exact:true}).click();
 await page.locator('.record-editor').waitFor();await capture('editor');
 await page.locator('.record-editor').getByRole('button',{name:'取消',exact:true}).click();
 const nav=page.getByRole('navigation',{name:device==='mobile'?'手机主导航':'主导航',exact:true});
 await nav.getByRole('button',{name:'查询工作台',exact:true}).click();await capture('tools');
 const conversation=await page.evaluate(async()=>{const list=await fetch('/api/conversations').then(r=>r.json());for(const c of list.conversations){const d=await fetch('/api/conversations/'+c.id).then(r=>r.json());if(d.runs.some((r:{results:{rows:{word?:string}[]}[]})=>r.results.some(v=>v.rows.some(row=>row.word))))return c.id;}return '';});
 if(!conversation)throw Error('Prepare a successful keyword analysis before capturing the manual.');
 await page.evaluate((id:string)=>sessionStorage.setItem('patent-conversation',id),conversation);await page.reload();
 await page.locator('.content .word-cloud svg text').first().waitFor();
 await page.locator('.content .word-cloud').first().scrollIntoViewIfNeeded();await capture('cloud');
 await page.getByRole('button',{name:'打开助手',exact:true}).click();await page.locator('.assistant.is-open').waitFor();await capture('assistant');
 await nav.getByRole('button',{name:'对话历史',exact:true}).click();await capture('history');
 if(errors.length)throw Error(errors.join('\n'));
 await page.close();
}
await browser.close();console.log('Captured desktop/mobile screenshots without editing records or running models.');
