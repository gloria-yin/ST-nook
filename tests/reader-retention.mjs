import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const readerPath = fileURLToPath(new URL('../index.html', import.meta.url));
const original = await fs.readFile(readerPath, 'utf8');
const core = original.split('/* reader-retention:start */')[1].split('/* reader-retention:end */')[0];
const context = vm.createContext({Map, Set, setTimeout, chatTextFingerprint: text => text, ve: () => 'test-id'});
vm.runInContext(core, context);
const map = (before, after, start, length) => context.readerMapRange(before, after, start, length);
assert.equal(map('AAA目标BBB目标CCC', '目标BBB目标CCC', 8, 2).start, 5);
assert.ok(map('甲目标乙，丙目标丁', '丙目标丁', 1, 2).status);
assert.ok(map('目标目标', '目标', 0, 2).status);
assert.ok(map('目标目标', '目标', 2, 2).status);
assert.equal(map('前原文中正文后', '新增前原文中正文后追加', 5, 2).start, 7);
assert.equal(context.mergeReaderSourceText('甲唯一目标乙', '甲手改乙', '甲乙').text, '甲乙');
assert.equal(context.mergeReaderSourceText('甲删乙改丙', '甲乙手改丙', '新甲删乙改丙尾').text, '新甲乙手改丙尾');
let seed = 12345;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < 300; i++) {
 const before = Array.from({length: 15}, () => 'abc'[Math.floor(random() * 3)]).join('');
 const at = Math.floor(random() * before.length), after = before.slice(0, at) + 'XY' + before.slice(at + 1);
 const spans = context.readerEqualSpans(before, after);
 for (const [a, b, c] of spans) assert.equal(before.slice(a, b), after.slice(c, c + b - a));
}
console.log('Range mapping: unique text, duplicate ambiguity, removed targets, multiple raw edits and randomized equal spans passed.');

const api = '\nwindow.__retentionTest = {u, mr, si, wn, V, Ls, Le, Ia, Wd, lu, qo, As, Uo, zo, B, normalizeBackupBook, prepareBackupWrites, saveBackupWrites, prepareChatIdentity, compareChatMessages, applyChatUpdate, reconcileReaderRecords, readerPendingRecords, readerRecordRange, readerSelectionAnchor, reviewReaderRecords, Rl, Ml, Nl};\n';
const html = original.replace(/(<script type="module">)([\s\S]*?)(<\/script>)/, (_, start, script, end) => start + script + api + end);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'st-nook-retention-'));
const server = http.createServer((request, response) => {
 if (request.url === '/') {response.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});response.end(html);}
 else {response.writeHead(404);response.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browserPath = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {windowsHide: true, stdio: 'ignore'});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
 let port;
 for (let i = 0; i < 100; i++) {try {port=Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);break;}catch {await delay(100);}}
 assert.ok(port, 'Browser must start; set EDGE_PATH if needed');
 const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
 socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
 await new Promise((resolve, reject) => {socket.addEventListener('open', resolve, {once:true});socket.addEventListener('error', reject, {once:true});});
 let serial = 0;const pending = new Map(), errors = [];
 socket.addEventListener('message', event => {
  const message=JSON.parse(event.data);
  if(message.id){const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}
  if(message.method==='Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
 });
 const cdp = (method, params={}) => new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate = async expression => {const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 async function until(expression) {for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression+'\n'+errors.join('\n'));}
 await cdp('Runtime.enable');await cdp('Page.enable');
 await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 await until('!!window.__retentionTest');
 const results = await evaluate(`(async()=>{
  const api=window.__retentionTest,{u,mr,si,wn,reconcileReaderRecords,prepareChatIdentity,compareChatMessages,applyChatUpdate}=api;
  const results=[];let serial=0;
  const message=(text,index=0,user=false)=>({text,name:user?'用户':'角色',user,date:1793325600000+index,rawDate:'date-'+index,sourceId:'message-'+index,depth:0});
  function book(text){return {id:'review-book-'+serial++,title:'检查用书',created:Date.now(),files:[{id:'review-file-'+serial,name:'chat.jsonl',created:1793325600000,messages:[message(text)]}],rules:[],keepUser:true,annotations:[],textEdits:{},deleted:[]};}
  function rule(findRegex,replaceString=''){return {id:'review-rule',scriptName:'测试规则',findRegex,replaceString,placement:[1,2],disabled:false,trimStrings:[]};}
  function annotation(b,text,start,index=0){return {id:'note-'+serial,chapterId:wn(b.files)[0].id,messageIndex:index,text,start,end:start+text.length,note:'保留批注',created:Date.now()};}
  function edit(b,text,start,replacement,index=0){b.textEdits[wn(b.files)[0].id]=[{id:'edit-'+serial,original:text,start,messageIndex:index,replacement}];}
  async function render(b){document.querySelectorAll('#reading-body').forEach(node=>node.remove());const chapter=wn(b.files)[0],result=await mr(b,chapter);const host=document.createElement('div');host.id='reading-body';host.innerHTML=result.html;document.body.append(host);si(b,chapter);const mark=host.querySelector('mark[data-annotation]'),scope=host.querySelector('.message-content');let markedOffset=null;if(mark){const range=document.createRange();range.selectNodeContents(scope);range.setEndBefore(mark);markedOffset=range.toString().length;}const value={text:scope?.textContent||'',markedText:mark?.textContent||null,markedOffset,pending:api.readerPendingRecords(b).length,errors:result.errors};host.remove();return value;}
  async function update(b,messages){await reconcileReaderRecords(b);u.draft=b;u.view='editor';u.progress={};const file=b.files[0],identity=prepareChatIdentity(b,file),incoming={...file,messages:typeof messages==='string'?[message(messages)]:messages};const comparison=await compareChatMessages([...identity.messages,...identity.archived],incoming.messages,identity.messages.length);await applyChatUpdate(b,file,incoming,comparison,identity);return comparison;}
  function check(condition,label,details){if(!condition)throw Error(label+': '+JSON.stringify(details));results.push(label);}
  {
   const b=book('AAA目标BBB目标CCC');b.annotations=[annotation(b,'目标',8)];await reconcileReaderRecords(b);b.rules=[rule('/AAA/g')];const preview=await render(b);check(preview.markedOffset===5,'regex preview retains second duplicate',preview);await reconcileReaderRecords(b);const saved=await render(b);check(saved.markedOffset===5,'saved regex retains second duplicate',saved);
  }
  {
   const b=book('甲目标乙，丙目标丁');b.annotations=[annotation(b,'目标',1)];await reconcileReaderRecords(b);b.rules=[rule('/甲目标乙，/g')];const preview=await render(b);check(preview.markedText===null,'removed annotation never jumps to duplicate',preview);await reconcileReaderRecords(b);check(b.annotations[0].readerStatus==='pending','ambiguous note retained for review',b.annotations);
  }
  {
   const b=book('甲目标乙，丙目标丁');edit(b,'目标',1,'');await reconcileReaderRecords(b);b.rules=[rule('/甲目标乙，/g')];const preview=await render(b);check(preview.text.trim()==='丙目标丁','regex cannot delete another duplicate',preview);await reconcileReaderRecords(b);check(api.readerPendingRecords(b).length===1,'unresolved deletion preserved in review',b);
  }
  {
   const b=book('甲唯一目标乙');edit(b,'唯一目标',1,'手改');b.annotations=[annotation(b,'手改',1)];await reconcileReaderRecords(b);await update(b,'甲乙');const output=await render(b);check(output.text.trim()==='甲乙','chat update does not resurrect removed replacement',output);check(output.pending===2,'removed edit and note retained inactive',output);
  }
  {
   const b=book('甲目标乙，丙目标丁');b.annotations=[annotation(b,'目标',1)];await update(b,'丙目标丁');const output=await render(b);check(output.markedText===null,'chat update uses same duplicate safety',output);
  }
  {
   const b=book('前缀甲乙正文丙丁');edit(b,'甲乙',2,'手改');b.annotations=[annotation(b,'正文',4)];await reconcileReaderRecords(b);await update(b,'新增前缀甲乙正文丙丁尾');const output=await render(b);check(output.text.trim()==='新增前缀手改正文丙丁尾'&&output.markedText==='正文','unique edits and notes survive surrounding source changes',output);
  }
  {
   const b=book('甲乙正文丙丁');edit(b,'甲乙',0,'手改');await reconcileReaderRecords(b);b.textEdits[wn(b.files)[0].id].push({id:'edit-second',messageIndex:0,original:'手改正文',replacement:'连续修改',start:0});await reconcileReaderRecords(b);b.rules=[rule('/丙丁/g')];await reconcileReaderRecords(b);const output=await render(b);check(output.text.trim()==='连续修改','dependent edits replay in order',output);
  }
  {
   const b=book('前唯一目标后');edit(b,'唯一目标',1,'手改');b.annotations=[annotation(b,'手改',1)];await reconcileReaderRecords(b);b.rules=[rule('/唯一目标/g')];await reconcileReaderRecords(b);const normalized=api.normalizeBackupBook(JSON.parse(JSON.stringify(b))).book;
   check(api.readerPendingRecords(normalized).length===2,'full backup keeps suspended records and anchor snapshots',normalized);
   normalized.rules=[];for(const record of [...normalized.annotations,...Object.values(normalized.textEdits).flat()])delete record.readerStatus;await reconcileReaderRecords(normalized);const restored=await render(normalized);check(restored.text.trim()==='前手改后'&&restored.markedText==='手改','explicit recheck restores records only after original returns',restored);
   u.books=[b];const plan=api.prepareBackupWrites([{book:normalized,action:'copy',match:{book:b},progress:{chapterId:wn(b.files)[0].id}}]);await api.saveBackupWrites(plan);const copy=[...plan.books.values()][0],output=await render(copy);check(copy.id!==b.id&&output.markedText==='手改','backup restore as copy retains independent anchors',output);
  }
  {
   const b=book('只有上下文');b.textEdits[wn(b.files)[0].id]=[{id:'legacy-insertion',messageIndex:0,original:'',replacement:'旧更新插回的文字',readerInsertion:true,start:2}];await reconcileReaderRecords(b);const output=await render(b);check(output.text.trim()==='只有上下文'&&output.pending===1,'legacy forced insertion is suspended during migration',output);
  }
  {
   const b=book('两处目标，还有目标');b.annotations=[annotation(b,'目标',100)];await reconcileReaderRecords(b);const output=await render(b);check(output.markedText===null&&output.pending===1,'ambiguous legacy offset is retained without picking a duplicate',output);
  }
  {
   const b=book('角色正文');b.files[0].messages=[message('用户正文',0,true),message('角色正文',1)];b.annotations=[annotation(b,'角色正文',0,1)];await reconcileReaderRecords(b);await update(b,[message('用户正文',0,true),message('插入用户',2,true),message('角色正文',1)]);const result=await mr(b,wn(b.files)[0]);check(!b.annotations[0].readerStatus&&b.annotations[0].messageIndex===2,'message identities survive insertion and reindex',b.annotations);
   b.keepUser=false;await reconcileReaderRecords(b);check(!b.annotations[0].readerStatus,'hidden user messages do not affect character anchors',b.annotations);
  }
  {
   const b=book('旧章节');const id=wn(b.files)[0].id;b.deleted=[id];await update(b,'旧章节增加正文');check(wn(b.files)[0].id===id&&b.deleted.includes(id),'deleted chapter stays deleted after update',b);
  }
  {
   const b=book('甲手改乙');Object.assign(b.files[0].messages[0],{readerLocalEdit:true,readerSourceText:'甲唯一目标乙'});await update(b,'甲乙');const output=await render(b);check(output.text.trim()==='甲乙'&&b.readerRetentionConflicts.length===1,'raw source edit conflict is suspended instead of resurrected',output);
  }
  {
   const b=book('AAA目标BBB目标CCC');b.annotations=[annotation(b,'目标',8)];await api.Le(b);await api.Ia(b);u.draft.rules=[rule('/AAA/g')];await api.Wd();const saved=(await api.Ml()).find(item=>item.id===b.id);const output=await render(saved);check(output.markedOffset===5,'editor save persists anchored records in IndexedDB',output);
  }
  {
   const b=book('前缀原文后缀');edit(b,'原文',2,'手改');await reconcileReaderRecords(b);u.books=[b];u.reader={book:b,index:0};u.view='reader';await api.lu();const input=document.querySelector('[data-raw-message]');input.value='新增前缀原文后缀';document.querySelector('.modal-footer .primary').click();await new Promise(resolve=>setTimeout(resolve,350));const output=await render(b);check(output.text.trim()==='新增前缀手改后缀'&&Object.values(b.textEdits).flat().length===1,'raw chapter save preserves selected-text edits',output);u.reader=null;
  }
  {
   const b=book('前缀原文后缀');u.reader={book:b,index:0};u.view='reader';const result=await mr(b,wn(b.files)[0]),host=document.createElement('div');host.id='reading-body';host.innerHTML=result.html;document.body.append(host);const scope=host.querySelector('.message-content');
   const record=api.readerSelectionAnchor(b,{id:'new-note',chapterId:wn(b.files)[0].id,messageIndex:0,text:'原文',start:2},{readerTextSnapshot:scope.textContent});b.annotations=[record];host.remove();await update(b,'新前缀原文后缀');const output=await render(b);check(output.markedText==='原文'&&!!b.annotations[0].readerAnchorId,'new selection saves stable scope and message anchors',output);u.reader=null;
  }
  window.__reviewBook=book('甲目标乙，丙目标丁');edit(window.__reviewBook,'目标',1,'');await reconcileReaderRecords(window.__reviewBook);window.__reviewBook.rules=[rule('/甲目标乙，/g')];await reconcileReaderRecords(window.__reviewBook);u.draft=window.__reviewBook;u.view='editor';u.render();
  return results;
 })()`);
 results.forEach(result=>console.log('Passed: '+result));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate('document.querySelector("[data-action=editor-review-records]").click()');
 await until('!!document.querySelector("[data-retention-remove]")');
 assert.equal(await evaluate('document.querySelector(".modal").scrollWidth <= document.querySelector(".modal").clientWidth'),true);
 assert.equal(await evaluate('document.querySelector(".modal").textContent.includes("位置不确定")'),true);
 if (process.env.RETENTION_SCREENSHOT) {await delay(350);const shot=await cdp('Page.captureScreenshot',{format:'png'});await fs.writeFile(process.env.RETENTION_SCREENSHOT,Buffer.from(shot.data,'base64'));}
 await evaluate('document.querySelector("[data-retention-remove]").click()');
 assert.equal(await evaluate('window.__retentionTest.readerPendingRecords(window.__reviewBook).length'),0);
 assert.deepEqual(errors,[]);
 console.log('Passed: mobile review dialog and explicit record removal.');
 assert.equal(await fs.readFile(readerPath,'utf8'),original,'Tests must not modify the reader source');
} finally {
 socket?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await delay(500);await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
