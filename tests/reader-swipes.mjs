import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const readerPath = fileURLToPath(new URL('../index.html', import.meta.url));
const original = await fs.readFile(readerPath, 'utf8');
const api = '\nwindow.__swipeTest={u,vd,vl,readerSwipeFields,readerSwipeVersions,readerSwipeUpdateCount,compareChatMessages,applyChatUpdate,prepareChatIdentity,confirmChatUpdate,nu,lr,nt,mr,wn,B,jn,Le,Ml,normalizeBackupBook,readerAllSwipeVersions,readerSwipeChoice,readerSelectionAnchor,reconcileReaderRecords,zo,As,qo,Wo,He,si,lu,Pe,Ia,Wd};\n';
const html = original.replace(/(<script type="module">)([\s\S]*?)(<\/script>)/, (_, start, script, end) => start + script + api + end);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'st-nook-swipes-'));
const sourceBytes = process.env.SWIPE_TEST_SOURCE ? await fs.readFile(process.env.SWIPE_TEST_SOURCE) : null;
const server = http.createServer((request, response) => {
 if (request.url === '/') {response.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});response.end(html);}
 else if (request.url === '/source' && process.env.SWIPE_TEST_SOURCE) {response.writeHead(200, {'Content-Type':'application/octet-stream'});response.end(sourceBytes);}
 else {response.writeHead(404);response.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], {windowsHide:true,stdio:'ignore'});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
 let port;
 for (let i=0;i<100;i++) {try {port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;} catch {await delay(100);}}
 assert.ok(port, 'Browser must start; set EDGE_PATH if needed');
 const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(response=>response.json());
 socket = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let serial=0;const pending=new Map(), errors=[];
 socket.addEventListener('message',event=>{
  const message=JSON.parse(event.data);
  if (message.id) {const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}
  if (message.method==='Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
 });
 const cdp = (method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate = async expression=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 async function until(expression) {for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression+'\n'+errors.join('\n')+'\n'+JSON.stringify(await evaluate('window.__inlineBook ? ({text:document.querySelectorAll(".message-content")[1]?.textContent.slice(0,140),key:document.querySelectorAll(".message-content")[1]?.dataset.readerSwipeKey,edits:window.__inlineBook.textEdits,selection:window.__inlineBook.readerSwipeSelections,context:window.__swipeTest.u.progress[window.__inlineBook.id]?.readerSwipeContext,toast:document.querySelector("#toast")?.textContent}) : null')));}
 async function click(selector) {await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
 async function screenshot(name) {
  if(!process.env.SWIPE_SCREENSHOTS)return;
  await fs.mkdir(process.env.SWIPE_SCREENSHOTS,{recursive:true});await delay(400);
  const shot=await cdp('Page.captureScreenshot',{format:'png'});
  await fs.writeFile(path.join(process.env.SWIPE_SCREENSHOTS,name+'.png'),Buffer.from(shot.data,'base64'));
 }
 await cdp('Runtime.enable');await cdp('Page.enable');
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 await until('!!window.__swipeTest');
 await until('!!document.querySelector(".topbar")');
 const result = await evaluate(`(async()=>{
  const api=window.__swipeTest, rows=[{create_date:'2026-11-05T10:00:00Z'},
   {name:'Reader',is_user:true,mes:'A question',send_date:'2026-11-05T10:00:00Z'},
   {name:'Character',mes:'Current answer. Keep note and edit.',send_date:'2026-11-05T10:01:00Z',swipe_id:1,
    swipes:['First answer. [remove]Hidden detail[/remove]','Current answer. Keep note and edit.','Third answer.'],
    swipe_info:[{send_date:'2026-11-05T09:59:00Z',extra:{privateCache:'unused'}},{send_date:'2026-11-05T10:01:00Z'},null]}];
  window.__swipeRows=rows;
  const parsed=await api.vd(new File([rows.map(row=>JSON.stringify(row)).join('\\n')],'chat.jsonl'));
  const json=await api.vd(new File([JSON.stringify({messages:rows})],'chat.json'));
  const transfer=api.vl(rows,'transfer.jsonl');
  const fields=api.readerSwipeFields({mes:'current',swipes:[null,'old',42,'current'],swipe_id:99});
  const variants=api.readerSwipeVersions({text:'edited current',readerSourceText:'current',swipes:['old','current'],swipe_id:1});
  const currentMissing=api.readerSwipeVersions({text:'new current',swipes:['old'],swipe_id:0});
  window.__swipeParsed=parsed;
  return {parsed:parsed.messages[1],json:json.messages[1],transfer:transfer.messages[1],fields,variants,currentMissing};
 })()`);
 assert.deepEqual(result.parsed.swipes,['First answer. [remove]Hidden detail[/remove]','Current answer. Keep note and edit.','Third answer.']);
 for(const message of [result.parsed,result.json,result.transfer]) {assert.equal(message.swipe_id,1);assert.deepEqual(message.swipes,result.parsed.swipes);assert.equal(message.swipe_info[0].extra,undefined);assert.equal(message.text,result.parsed.text);}
 assert.deepEqual(result.fields.swipes,[null,'old',null,'current']);assert.equal(result.fields.swipe_id,3);
 assert.equal(result.variants[1].current,true);assert.equal(result.currentMissing[1].text,'new current');
 console.log('Passed: JSONL/JSON/transfer-row history, selected indices, legacy data and separate current text.');

 const update=await evaluate(`(async()=>{
  const api=window.__swipeTest,rows=window.__swipeRows.map(({swipes,swipe_id,swipe_info,...row})=>row),file=api.vl(rows,'chat.jsonl');
  const book={id:'swipe-test-book',title:'Swipe preview',created:Date.now(),files:[file],rules:[{id:'hide-rule',findRegex:'/\\\\[remove\\\\][\\\\s\\\\S]*?\\\\[\\\\/remove\\\\]/g',replaceString:'',placement:[1,2],disabled:false}],keepUser:true,annotations:[],textEdits:{},deleted:[]};
  const chapter=api.wn(book.files)[0],text=file.messages[1].text;
  book.annotations=[{id:'swipe-note',chapterId:chapter.id,messageIndex:1,text:'note',start:text.indexOf('note'),end:text.indexOf('note')+4,note:'Keep this annotation'}];
  book.textEdits[chapter.id]=[{id:'swipe-edit',messageIndex:1,original:'edit',replacement:'EDIT',start:text.indexOf('edit')}];
  await api.Le(book);api.u.draft=book;api.u.view='editor';
  const identity=api.prepareChatIdentity(book,file),incoming=window.__swipeParsed;
  const comparison=await api.compareChatMessages([...identity.messages,...identity.archived],incoming.messages,identity.messages.length);
  window.__swipeBook=book;window.__swipeIdentity=identity;window.__swipeComparison=comparison;
  window.__swipeConfirmation=api.confirmChatUpdate(file,incoming,comparison,identity,false);
  return {comparison,mainBefore:await api.mr(book,chapter)};
 })()`);
 assert.equal(update.comparison.added.length+update.comparison.removed.length+update.comparison.modified.length,0);assert.equal(update.comparison.swipeChanges,1);
 assert.match(await evaluate('document.querySelector(".chat-update-root .modal-footer .primary").textContent'),/确认更新/);
 await click('.chat-update-root .modal-footer .primary');assert.equal(await evaluate('window.__swipeConfirmation'),'update');
 const saved=await evaluate(`(async()=>{const api=window.__swipeTest,book=window.__swipeBook;await api.applyChatUpdate(book,book.files[0],window.__swipeParsed,window.__swipeComparison,window.__swipeIdentity);await api.Le(book);const restored=api.normalizeBackupBook(structuredClone(book)).book;return {file:book.files[0],annotations:book.annotations,textEdits:book.textEdits,restoredSwipes:restored.files[0].messages[1].swipes,render:await api.mr(book,api.wn(book.files)[0])};})()`);
 assert.equal(saved.annotations[0].id,'swipe-note');assert.equal(saved.annotations[0].readerStatus,undefined);assert.equal(Object.values(saved.textEdits)[0][0].readerStatus,undefined);
 assert.match(saved.render.html,/EDIT/);assert.deepEqual(saved.restoredSwipes,result.parsed.swipes);assert.equal(saved.file.messages[1].text,result.parsed.text);
 console.log('Passed: history-only updates, explicit confirmation, annotation/edit retention and backup history.');

 if(sourceBytes) {
  const expected=sourceBytes.toString('utf8').split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line)).filter(row=>row.role!=='system'&&(typeof row.mes==='string'||typeof row.content==='string'));
  const count=expected.filter(row=>Array.isArray(row.swipes)&&row.swipes.filter(text=>typeof text==='string').length>1).length;
  const digest=createHash('sha256').update(JSON.stringify(expected.map(row=>Array.isArray(row.swipes)?row.swipes.map(text=>typeof text==='string'?text:null):null))).digest('hex');
  const imported=await evaluate(`(async()=>{const api=window.__swipeTest,bytes=await fetch('/source').then(r=>r.arrayBuffer()),file=await api.vd(new File([bytes],'source.jsonl'));window.__sourceSwipeFile=file;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(file.messages.map(m=>m.swipes||null))));return {floors:file.messages.length,withHistory:file.messages.filter(m=>m.swipes?.filter(t=>typeof t==='string').length>1).length,max:Math.max(...file.messages.map(m=>m.swipes?.length||0)),digest:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')};})()`);
  assert.equal(imported.floors,expected.length);assert.equal(imported.withHistory,count);assert.equal(imported.digest,digest);
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
  const source=await evaluate(`(async()=>{const api=window.__swipeTest,file=window.__sourceSwipeFile,target=file.messages.reduce((best,m)=>(m.swipes?.length||0)>(best.swipes?.length||0)?m:best,file.messages[0]),chapters=api.wn([file]),index=chapters.findIndex(c=>c.messages.includes(target)),book={id:'source-preview',title:'Local source',created:Date.now(),files:[file],rules:[],keepUser:true,showSwipes:true,annotations:[],textEdits:{},deleted:[]};api.u.draft=null;await api.lr(book,index,{cover:false});return {floor:chapters[index].messages.indexOf(target),versions:api.readerAllSwipeVersions(target).length};})()`);
  await until('!!document.querySelector(".message-content")');
  if(await evaluate('!!document.querySelector("#reader-swipe-floor")'))await evaluate(`document.querySelector('#reader-swipe-floor').value='${source.floor}';document.querySelector('#reader-swipe-floor').dispatchEvent(new Event('change'))`);
  assert.match(await evaluate('document.querySelector("#reader-swipe-number").textContent'),new RegExp('/ '+source.versions));
  const prevDisabled=await evaluate('document.querySelector("[data-action=reader-swipe-prev]").disabled');
  await click(prevDisabled?'[data-action="reader-swipe-next"]':'[data-action="reader-swipe-prev"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content")');
  assert.equal(await evaluate('!!document.querySelector(".modal")'),false);
  console.log('Passed: original JSONL checksum and inline reader ('+imported.floors+' floors, '+count+' floors with history, up to '+imported.max+' versions).');
 }

 await evaluate(`(async()=>{
  const api=window.__swipeTest,tail='\\n\\n'+('A long reading paragraph keeps a separate position in every version.\\n\\n').repeat(80),shared=' Shared anchor. change-me. delete-me.';
  const rows=[{name:'Reader',is_user:true,mes:'Question B',swipe_id:1,swipes:['Question A','Question B'],send_date:'2026-11-05T10:00:00Z',message_id:'user-1'},
    {name:'Character',mes:'Version B.'+shared+tail,swipe_id:1,swipes:['Version A.'+shared+tail,'Version B.'+shared+tail,'Version C.'+shared+tail],swipe_info:[{send_date:'2026-11-05T10:01:00Z'},{send_date:'2026-11-05T10:02:00Z'},{send_date:'2026-11-05T10:03:00Z'}],send_date:'2026-11-05T10:02:00Z',message_id:'character-1'},
    {name:'Character',mes:'Other floor. Shared anchor. change-me. delete-me.',swipe_id:1,swipes:['Other floor A. Shared anchor.','Other floor. Shared anchor. change-me. delete-me.'],send_date:'2026-11-05T10:04:00Z',message_id:'character-2'}];
  const file=api.vl(rows,'inline.jsonl'),book={id:'inline-book',title:'Inline history',created:Date.now(),files:[file],rules:[],keepUser:true,annotations:[],textEdits:{},deleted:[],showSwipes:false};
  window.__inlineBook=book;await api.Le(book);api.u.draft=null;await api.lr(book,0,{cover:false});
  window.__selectSwipeText=(text,index=1)=>{const scope=document.querySelectorAll('.message-content')[index],value=scope.textContent,start=value.indexOf(text);if(start<0)throw Error('Selection text missing');const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT),range=document.createRange();let offset=0,first=false;while(walker.nextNode()){const n=walker.currentNode;if(!first&&offset+n.length>start){range.setStart(n,start-offset);first=true;}if(first&&offset+n.length>=start+text.length){range.setEnd(n,start+text.length-offset);break;}offset+=n.length;}const selection=getSelection();selection.removeAllRanges();selection.addRange(range);api.zo();};
 })()`);
 await until('!!document.querySelector(".message-content")');assert.equal(await evaluate('!!document.querySelector(".reader-swipe-navigation")'),false);
 await click('[data-action="reader-menu"]');await until('!!document.querySelector("#reader-show-swipes")');await click('#reader-show-swipes');await until('!!document.querySelector(".reader-swipe-navigation") && !document.querySelector(".modal")');
 assert.equal(await evaluate('document.querySelector(".reader-swipe-navigation").getBoundingClientRect().bottom <= document.querySelector(".chapter-navigation").getBoundingClientRect().top'),true);
 async function showVersion(name,action){await click('[data-action="'+action+'"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content") && document.querySelectorAll(".message-content")[1].textContent.includes('+JSON.stringify(name)+')');}
 async function selectText(text,index=1){await evaluate(`window.__selectSwipeText(${JSON.stringify(text)},${index})`);await until('!!document.querySelector(".selection-toolbar")');}
 async function modify(text,replacement){await selectText(text);await click('[data-action="reader-modify-text"]');await until('!!document.querySelector("#selected-text-edit")');await evaluate('document.querySelector("#selected-text-edit").value='+JSON.stringify(replacement));await click('.modal-footer .primary');await until('!document.querySelector(".modal") && !!document.querySelector(".message-content") && document.querySelectorAll(".message-content")[1].textContent.includes('+JSON.stringify(replacement)+')');}
 await showVersion('Version A.','reader-swipe-prev');await selectText('Shared anchor.');await click('[data-action="reader-annotate"]');await until('!!document.querySelector("#annotation-text")');await evaluate('document.querySelector("#annotation-text").value="Note in A"');await click('.modal-footer .primary');await until('window.__inlineBook.annotations.length===1 && !!document.querySelector("mark[data-annotation]")');
 const noteA=await evaluate('window.__inlineBook.annotations[0].id');
 await modify('change-me','changed in A');await selectText('delete-me');await click('[data-action="reader-delete-text"]');await until('!!document.querySelector(".modal")');await click('.modal-footer button:last-child');await until('!document.querySelector(".modal") && !!document.querySelector(".message-content") && !document.querySelectorAll(".message-content")[1].textContent.includes("delete-me")');
 await evaluate('document.querySelector(".reader-scroll").scrollTop=700;window.__swipeTest.Pe()');
 await showVersion('Version B.','reader-swipe-next');assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+noteA+'"]\')'),false);assert.match(await evaluate('document.querySelectorAll(".message-content")[1].textContent'),/change-me.*delete-me/);
 await selectText('Shared anchor.');await click('[data-action="reader-highlight"]');await until('window.__inlineBook.annotations.length===2');const noteB=await evaluate('window.__inlineBook.annotations[1].id');await modify('change-me','changed in B');
 await evaluate('document.querySelector(".reader-scroll").scrollTop=180;window.__swipeTest.Pe()');await showVersion('Version A.','reader-swipe-prev');
 assert.equal(await evaluate('Math.abs(document.querySelector(".reader-scroll").scrollTop-700)<3'),true);assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+noteA+'"]\')'),true);assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+noteB+'"]\')'),false);assert.match(await evaluate('document.querySelectorAll(".message-content")[1].textContent'),/changed in A/);
 assert.equal(await evaluate('document.querySelectorAll(".message-content")[1].textContent.includes("delete-me")'),false);
 await showVersion('Version B.','reader-swipe-next');assert.equal(await evaluate('Math.abs(document.querySelector(".reader-scroll").scrollTop-180)<3'),true);assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+noteB+'"]\')'),true);
 await evaluate(`window.__swipeTest.Wo(window.__inlineBook,window.__inlineBook.annotations.find(n=>n.id===${JSON.stringify(noteA)}))`);await until('!!document.querySelector(".message-content") && document.querySelectorAll(".message-content")[1].textContent.includes("Version A.")');
 assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+noteA+'"]\')'),true);
 console.log('Passed: in-page arrows, same-phrase annotation/edit/delete isolation, per-version reading positions and annotation return links.');

 await click('[data-action="reader-edit"]');await until('document.querySelectorAll("[data-raw-message]").length===2');await evaluate('document.querySelectorAll("[data-raw-message]")[1].value+="\\nRaw-local-A"');await click('.modal-footer .primary');await until('!document.querySelector(".modal") && !!document.querySelector(".message-content") && document.querySelectorAll(".message-content")[1].textContent.includes("Raw-local-A")');
 await showVersion('Version B.','reader-swipe-next');assert.equal(await evaluate('document.querySelectorAll(".message-content")[1].textContent.includes("Raw-local-A")'),false);await showVersion('Version A.','reader-swipe-prev');
 await click('[data-action="reader-next"]');await until('!!document.querySelector(".message-content") && document.querySelector(".message-content").textContent.includes("Other floor")');assert.equal(await evaluate('!!document.querySelector("mark[data-annotation]")'),false);await click('[data-action="reader-prev"]');await until('!!document.querySelector(".message-content") && document.querySelectorAll(".message-content")[1].textContent.includes("Version A.")');
 await evaluate('document.querySelector("#reader-swipe-floor").value="0";document.querySelector("#reader-swipe-floor").dispatchEvent(new Event("change"))');await click('[data-action="reader-swipe-prev"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content") && document.querySelector(".message-content").textContent.includes("Question A")');assert.match(await evaluate('document.querySelectorAll(".message-content")[1].textContent'),/Version A\./);
 await selectText('Question A',0);await click('[data-action="reader-highlight"]');await until('window.__inlineBook.annotations.length===3');
 await click('[data-action="reader-swipe-next"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content") && document.querySelector(".message-content").textContent.includes("Question B")');assert.equal(await evaluate('!!document.querySelectorAll(".message-content")[0].querySelector("mark")'),false);assert.equal(await evaluate('!!document.querySelectorAll(".message-content")[1].querySelector("mark")'),true);
 await evaluate('document.querySelector("#reader-swipe-floor").value="1";document.querySelector("#reader-swipe-floor").dispatchEvent(new Event("change"))');
 await evaluate(`(()=>{const a=document.querySelectorAll('.message-content')[0],b=document.querySelectorAll('.message-content')[1],range=document.createRange();range.setStart(a.querySelector('p').firstChild,0);range.setEnd(b.querySelector('p').firstChild,'Version A.'.length);getSelection().removeAllRanges();getSelection().addRange(range);window.__swipeTest.zo();})()`);await until('!!document.querySelector(".selection-toolbar")');await click('[data-action="reader-highlight"]');await until('window.__inlineBook.annotations.length===4');
 const combined=await evaluate('window.__inlineBook.annotations[3].id');assert.equal(await evaluate('window.__inlineBook.annotations[3].readerSwipeContext.length'),2);
 await evaluate('document.querySelector("#reader-swipe-floor").value="0";document.querySelector("#reader-swipe-floor").dispatchEvent(new Event("change"))');await click('[data-action="reader-swipe-prev"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content") && document.querySelector(".message-content").textContent.includes("Question A")');assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+combined+'"]\')'),false);assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+noteA+'"]\')'),true);
 await click('[data-action="reader-swipe-next"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content") && document.querySelector(".message-content").textContent.includes("Question B")');assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+combined+'"]\')'),true);await evaluate('document.querySelector("#reader-swipe-floor").value="1";document.querySelector("#reader-swipe-floor").dispatchEvent(new Event("change"))');
 const canonical=await evaluate('window.__swipeTest.mr(window.__inlineBook,window.__swipeTest.wn(window.__inlineBook.files)[0])');assert.match(canonical.html,/Version B\./);assert.match(canonical.html,/changed in B/);assert.equal(canonical.html.includes('Raw-local-A'),false);assert.equal(canonical.html.includes('changed in A'),false);
 console.log('Passed: raw chapter edits stay in their version and user/character floors switch independently.');

 for(const size of [{width:320,height:568,mobile:true},{width:390,height:844,mobile:true},{width:1280,height:900,mobile:false}]) {
  await cdp('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1});await cdp('Emulation.setTouchEmulationEnabled',{enabled:size.mobile,maxTouchPoints:1});
  for(const mode of ['day','night'])for(const readingMode of ['scroll','paged']){
   await evaluate(`window.__inlineBook.readingMode='${readingMode}';window.__swipeTest.u.settings.theme='frost';window.__swipeTest.u.settings.frostMode='${mode}';window.__swipeTest.jn();window.__swipeTest.nt()`);await until('!!document.querySelector(".message-content")');await delay(100);
   const geometry=await evaluate('(()=>{const row=document.querySelector(".reader-swipe-navigation"),footer=document.querySelector(".reader-bottom"),r=row.getBoundingClientRect(),f=footer.getBoundingClientRect(),v=document.querySelector(".paged-viewport").getBoundingClientRect();return {row:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,footer:f.top>=0&&f.bottom<=innerHeight,controls:[...row.querySelectorAll("button,select,output")].every(n=>{const x=n.getBoundingClientRect();return x.left>=0&&x.right<=innerWidth}),body:document.documentElement.scrollWidth<=innerWidth,paged:window.__inlineBook.readingMode!=="paged"||v.bottom<=f.top};})()');assert.deepEqual(geometry,{row:true,footer:true,controls:true,body:true,paged:true});
   if(readingMode==='scroll')await screenshot('inline-swipes-'+size.width+'-'+mode);
   if(size.mobile){const point=await evaluate('(()=>{const r=document.querySelector("[data-action=reader-swipe-next]").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content") && document.querySelectorAll(".message-content")[1].textContent.includes("Version B.")');await showVersion('Version A.','reader-swipe-prev');}
  }
 }
 console.log('Passed: day/night inline navigation, mobile touch targets, scrolling/paged footer bounds and current reading layout.');

 await evaluate('window.__inlineBook.readingMode="scroll";window.__swipeTest.Ia(window.__inlineBook)');await until('!!document.querySelector("#draft-show-swipes")');assert.equal(await evaluate('document.querySelector("#draft-show-swipes").checked'),true);await click('#draft-show-swipes');await click('[data-action="editor-save"]');await until('window.__swipeTest.u.view==="shelf"');
 await evaluate('window.__inlineBook=window.__swipeTest.u.books.find(b=>b.id==="inline-book");window.__swipeTest.Ia(window.__inlineBook)');await until('!!document.querySelector("#draft-show-swipes")');assert.equal(await evaluate('document.querySelector("#draft-show-swipes").checked'),false);await click('#draft-show-swipes');await click('[data-action="editor-save"]');await until('window.__swipeTest.u.view==="shelf"');await evaluate('window.__inlineBook=window.__swipeTest.u.books.find(b=>b.id==="inline-book")');
 await cdp('Page.reload');await until('!!window.__swipeTest && window.__swipeTest.u.books.some(b=>b.id==="inline-book")');await evaluate('window.__inlineBook=window.__swipeTest.u.books.find(b=>b.id==="inline-book");window.__swipeTest.lr(window.__inlineBook,0,{cover:false})');await until('!!document.querySelector(".message-content")');assert.match(await evaluate('document.querySelectorAll(".message-content")[1].textContent'),/Raw-local-A/);assert.equal(await evaluate('!!document.querySelector(\'mark[data-annotation="'+noteA+'"]\')'),true);
 await click('[data-action="reader-menu"]');await until('!!document.querySelector("#reader-show-swipes")');await click('#reader-show-swipes');await until('!document.querySelector(".modal") && !document.querySelector(".reader-swipe-navigation") && !!document.querySelector(".message-content")');assert.match(await evaluate('document.querySelectorAll(".message-content")[1].textContent'),/Version B\./);
 await click('[data-action="reader-menu"]');await until('!!document.querySelector("#reader-show-swipes")');await click('#reader-show-swipes');await until('!document.querySelector(".modal") && !!document.querySelector(".reader-swipe-navigation") && !!document.querySelector(".message-content")');assert.match(await evaluate('document.querySelectorAll(".message-content")[1].textContent'),/Raw-local-A/);
 console.log('Passed: shared editor/reader toggle and persistent version selection, raw edits and highlights after reopening.');

 const retention=await evaluate(`(async()=>{
  const api=window.__swipeTest,book=structuredClone(window.__inlineBook),file=book.files[0];book.id='update-swipes';api.u.draft=book;api.u.view='editor';
  const other=api.vl([{name:'Other',mes:'Other main',swipes:['Other alternate','Other main'],swipe_id:1}],'other.jsonl');book.files.push(other);const otherChapter=api.wn([other])[0],otherKey=api.readerAllSwipeVersions(other.messages[0])[0].key;other.messages[0].readerMessageId='unrelated-message';book.annotations.push({id:'unrelated-note',chapterId:otherChapter.id,messageIndex:0,readerMessageId:'unrelated-message',readerSwipeKey:otherKey,text:'Other',start:0,end:5});
  await api.reconcileReaderRecords(book);
  const identity=api.prepareChatIdentity(book,file),incoming={...file,messages:file.messages.map(m=>({name:m.name,user:m.user,text:m.readerSourceText??m.text,date:m.date,rawDate:m.rawDate,sourceId:m.sourceId,depth:m.depth,swipes:m.swipes,swipe_id:m.swipe_id,swipe_info:m.swipe_info}))},target=incoming.messages[1];
  target.swipes=[target.swipes[2],target.swipes[0],target.swipes[1]];target.swipe_info=[target.swipe_info[2],target.swipe_info[0],target.swipe_info[1]];target.swipe_id=2;
  incoming.messages.unshift({name:'Reader',user:true,text:'Inserted user floor',date:Date.now(),rawDate:'inserted',sourceId:'inserted',depth:100});
  let comparison=await api.compareChatMessages([...identity.messages,...identity.archived],incoming.messages,identity.messages.length);await api.applyChatUpdate(book,file,incoming,comparison,identity);
  const first=book.annotations.filter(n=>n.id!=='unrelated-note'),reordered=first.every(n=>!n.readerStatus),newFile=book.files[0],chapter=api.wn([newFile])[0],a=first.find(n=>n.note==='Note in A'),view=await api.mr(book,chapter,{swipeKeys:{[a.messageIndex]:a.readerSwipeKey}});
  const backup=api.normalizeBackupBook(structuredClone(book)).book,restored=backup.annotations.find(n=>n.id===a.id);
  const beforeRemoval=api.prepareChatIdentity(book,newFile),removed={...newFile,messages:newFile.messages.map(m=>({...m,text:m.readerSourceText??m.text}))},character=removed.messages.find(m=>m.sourceId==='character-1');character.swipes=character.swipes.filter((_,i)=>i!==1);character.swipe_info=character.swipe_info.filter((_,i)=>i!==1);character.swipe_id=1;delete character.readerSwipeRawEdits;
  comparison=await api.compareChatMessages([...beforeRemoval.messages,...beforeRemoval.archived],removed.messages,beforeRemoval.messages.length);await api.applyChatUpdate(book,newFile,removed,comparison,beforeRemoval);
  const removedA=book.annotations.find(n=>n.id===a.id),b=book.annotations.find(n=>n.id===${JSON.stringify(noteB)}),unrelated=book.annotations.find(n=>n.id==='unrelated-note');
  return {reordered,view:view.html,restoredKey:restored.readerSwipeKey,key:a.readerSwipeKey,removedA:removedA.readerStatus,b:b.readerStatus,unrelated:unrelated.readerStatus,index:a.messageIndex,rawPreserved:view.html.includes('Raw-local-A')};
 })()`);
 assert.equal(retention.reordered,true);assert.equal(retention.rawPreserved,true);assert.equal(retention.index,2);assert.equal(retention.restoredKey,retention.key);assert.equal(retention.removedA,'removed');assert.equal(retention.b,undefined);assert.equal(retention.unrelated,undefined);
 console.log('Passed: version reordering and inserted floors preserve bindings; deleted versions suspend records without affecting other versions/files; backup keys survive.');

 const duplicates=await evaluate(`(async()=>{const api=window.__swipeTest,file=api.vl([{name:'Duplicate',mes:'Current separate text.',swipe_id:2,swipes:['Shared duplicate text.','Shared duplicate text.','Current separate text.'],send_date:'2026-11-05T15:00:00Z'}],'duplicates.jsonl'),book={id:'duplicates-book',title:'Duplicates',created:Date.now(),files:[file],rules:[],keepUser:true,showSwipes:true,annotations:[],textEdits:{},deleted:[]};file.messages[0].readerMessageId='duplicate-floor';book.readerSwipeSelections={'duplicate-floor':api.readerAllSwipeVersions(file.messages[0])[0].key};window.__duplicateBook=book;await api.lr(book,0,{cover:false});return true;})()`);assert.equal(duplicates,true);await until('!!document.querySelector(".message-content")');
 await evaluate(`(()=>{const n=document.querySelector('.message-content p').firstChild,r=document.createRange();r.setStart(n,0);r.setEnd(n,6);getSelection().removeAllRanges();getSelection().addRange(r);window.__swipeTest.zo();})()`);await click('[data-action="reader-highlight"]');await until('window.__duplicateBook.annotations.length===1');await click('[data-action="reader-swipe-next"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content")');assert.equal(await evaluate('!!document.querySelector("mark[data-annotation]")'),false);
 await evaluate(`(()=>{const n=document.querySelector('.message-content p').firstChild,r=document.createRange();r.setStart(n,0);r.setEnd(n,6);getSelection().removeAllRanges();getSelection().addRange(r);window.__swipeTest.zo();})()`);await click('[data-action="reader-highlight"]');await until('window.__duplicateBook.annotations.length===2');
 const duplicateResult=await evaluate(`(async()=>{const api=window.__swipeTest,b=window.__duplicateBook,f=b.files[0];await api.reconcileReaderRecords(b);api.u.draft=b;api.u.view='editor';const identity=api.prepareChatIdentity(b,f),incoming={...f,messages:[{...f.messages[0],swipes:['Shared duplicate text.','Current separate text.'],swipe_id:1}]},comparison=await api.compareChatMessages(identity.messages,incoming.messages,identity.messages.length);await api.applyChatUpdate(b,f,incoming,comparison,identity);return b.annotations.map(note=>note.readerStatus);})()`);assert.deepEqual(duplicateResult,['removed','removed']);
 console.log('Passed: cross-floor marks require the same version combination, exports keep the canonical text, and ambiguous identical versions never borrow marks.');

 const regex=await evaluate(`(async()=>{const api=window.__swipeTest,b=structuredClone(window.__inlineBook);b.rules=[{findRegex:'/Version A\\\\. Shared anchor\\\\./g',replaceString:'',placement:[1,2],disabled:false}];await api.reconcileReaderRecords(b);return {a:b.annotations.find(n=>n.id===${JSON.stringify(noteA)}).readerStatus,b:b.annotations.find(n=>n.id===${JSON.stringify(noteB)}).readerStatus};})()`);assert.equal(regex.a,'removed');assert.equal(regex.b,undefined);
 const localFile=path.join(profile,'reader-local.html');await fs.writeFile(localFile,html);await cdp('Page.navigate',{url:pathToFileURL(localFile).href});await until('!!window.__swipeTest && !!document.querySelector(".topbar")');await evaluate(`(async()=>{const api=window.__swipeTest,file=await api.vd(new File([JSON.stringify({name:'Character',mes:'Local current',swipe_id:1,swipes:['Local old','Local current']})],'local.jsonl')),book={id:'local-view',title:'Local HTML',created:Date.now(),files:[file],rules:[],keepUser:true,showSwipes:true,annotations:[],textEdits:{},deleted:[]};await api.lr(book,0,{cover:false});})()`);await until('!!document.querySelector(".message-content")');await click('[data-action="reader-swipe-prev"]');await until('!window.__swipeTest.u.reader.swipeBusy && !!document.querySelector(".message-content") && document.querySelector(".message-content").textContent.includes("Local old")');
 assert.deepEqual(errors,[]);assert.equal(await fs.readFile(readerPath,'utf8'),original);
 console.log('Passed: regex changes respect version boundaries and direct local HTML import/navigation works.');

} finally {
 socket?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await delay(500);await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
