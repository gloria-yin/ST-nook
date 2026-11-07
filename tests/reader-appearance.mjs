import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const readerPath = fileURLToPath(new URL('../index.html', import.meta.url));
const original = await fs.readFile(readerPath, 'utf8');
const api = '\nwindow.__appearanceTest={u,$o,B,jn,lr,nt,_o,It,readerAppearance,initializeAppearance,appearanceStorage,addUploadedFont,deleteUploadedFont,loadUploadedFont,analyzeFrostImage,applyFrostPalette,frostContrast,syncMobileChrome};\n';
const html = original.replace(/(<script type="module">)([\s\S]*?)(<\/script>)/, (_, start, script, end) => start + script + api + end);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'st-nook-appearance-'));
const server = http.createServer((request, response) => {
 if (request.url === '/') {response.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});response.end(html);}
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
 async function until(expression) {for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression+'\n'+errors.join('\n'));}
 async function click(selector) {await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
 async function screenshot(name) {
  if(!process.env.APPEARANCE_SCREENSHOTS)return;
  await fs.mkdir(process.env.APPEARANCE_SCREENSHOTS,{recursive:true});await delay(400);
  const shot=await cdp('Page.captureScreenshot',{format:'png'});
  await fs.writeFile(path.join(process.env.APPEARANCE_SCREENSHOTS,name+'.png'),Buffer.from(shot.data,'base64'));
 }
 await cdp('Runtime.enable');await cdp('Page.enable');
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 await until('!!window.__appearanceTest');
 await evaluate('window.__appearanceTest.initializeAppearance()');
 const chromeColors = await evaluate(`(()=>{const api=window.__appearanceTest,root=document.documentElement;api.u.settings.theme='paper';api.jn();const paper={color:document.querySelector('meta[name=\"theme-color\"]').content,bg:getComputedStyle(root).getPropertyValue('--bg').trim(),apple:document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]').content};api.u.settings.theme='night';api.jn();const night={color:document.querySelector('meta[name=\"theme-color\"]').content,bg:getComputedStyle(root).getPropertyValue('--bg').trim(),apple:document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]').content};api.u.settings.theme='frost';api.u.settings.frostMode='night';api.applyFrostPalette({hue:215,saturation:.68});api.jn();return {paper,night,frost:{color:document.querySelector('meta[name=\"theme-color\"]').content,apple:document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]').content},capable:document.querySelector('meta[name=\"mobile-web-app-capable\"]').content};})()`);
 assert.equal(chromeColors.capable,'yes');
 assert.equal(chromeColors.paper.color,chromeColors.paper.bg);
 assert.equal(chromeColors.paper.apple,'default');
 assert.equal(chromeColors.night.color,chromeColors.night.bg);
 assert.equal(chromeColors.night.apple,'black');
 assert.equal(chromeColors.frost.apple,'black');
 await evaluate(`window.__appearanceTest.u.settings.theme='paper';window.__appearanceTest.u.settings.frostMode='day';window.__appearanceTest.jn()`);
 await evaluate('window.__appearanceTest.$o()');
 assert.equal(await evaluate('document.querySelectorAll("[data-theme-choice]").length'),7);
 assert.equal(await evaluate('[...document.querySelectorAll("[data-theme-choice]")].at(-1).dataset.themeChoice'),'frost');
 await click('#setting-edit-fonts');await until('!!document.querySelector("#custom-font-add")');
 await click('#custom-font-add');await until('document.querySelector("#custom-font-status").textContent.includes("请填写字体名称")');
 assert.equal(await evaluate('window.__appearanceTest.readerAppearance.fonts.size'),0);
 const invalid = await evaluate(`(async()=>{try{await window.__appearanceTest.addUploadedFont('损坏字体',new File(['bad data'],'bad.woff2'));return '';}catch(error){return error.message;}})()`);
 assert.match(invalid,/有效的字体文件/);
 await evaluate('document.querySelector("#custom-font-name").value="我的衬线 <试用>"');
 const fontPath=process.env.TEST_FONT_PATH || 'C:/Windows/Fonts/calibri.ttf';
 await fs.access(fontPath);
 const dom=await cdp('DOM.getDocument');
 const fontInput=await cdp('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#custom-font-file'});
 await cdp('DOM.setFileInputFiles',{nodeId:fontInput.nodeId,files:[fontPath]});
 await click('#custom-font-add');
 await until('window.__appearanceTest.readerAppearance.fonts.size===1 && document.querySelector("#custom-font-status").textContent.includes("已添加")');
 const fontId=await evaluate('window.__appearanceTest.u.settings.font');
 assert.match(fontId,/^custom-/);
 assert.equal(await evaluate('document.querySelector(".custom-font-row strong").textContent'),'我的衬线 <试用>');
 assert.equal(await evaluate('document.querySelector("试用")===null'),true);
 assert.equal(await evaluate('window.__appearanceTest.readerAppearance.faces.has(window.__appearanceTest.u.settings.font)'),true);
 await screenshot('fonts-desktop');
 await click('[data-modal-button="0"]');await until('!!document.querySelector("#setting-font")');
 assert.equal(await evaluate('document.querySelector("#setting-font").value'),fontId);
 await cdp('Page.reload');await until('!!window.__appearanceTest');
 await evaluate('window.__appearanceTest.initializeAppearance()');
 await until('window.__appearanceTest.readerAppearance.faces.size===1');
 assert.equal(await evaluate('window.__appearanceTest.u.settings.font'),fontId);
 console.log('Passed: font name/file validation, real font upload, escaped names, dropdown and persistence.');

 await evaluate('window.__appearanceTest.$o()');
 // A synthetic landscape exercises image decoding/resizing without bundling personal images.
 await evaluate(`(async()=>{
  const canvas=document.createElement('canvas');canvas.width=3000;canvas.height=2000;const c=canvas.getContext('2d');
  const sky=c.createLinearGradient(0,0,0,2000);sky.addColorStop(0,'#9fb8bb');sky.addColorStop(.45,'#efdfb7');sky.addColorStop(1,'#385e51');c.fillStyle=sky;c.fillRect(0,0,3000,2000);
  c.fillStyle='#f3e9c6';c.beginPath();c.arc(2200,510,165,0,Math.PI*2);c.fill();
  for(let i=0;i<4;i++){c.fillStyle=['#93a99c','#6d8d7b','#46695c','#294b41'][i];c.beginPath();c.moveTo(-100,1100+i*170);for(let x=0;x<=3200;x+=100)c.lineTo(x,900+i*220+Math.sin(x/470+i*2)*230);c.lineTo(3100,2100);c.lineTo(-100,2100);c.fill();}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),transfer=new DataTransfer();transfer.items.add(new File([blob],'云岚.png',{type:'image/png'}));
  const input=document.querySelector('#frost-image');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 await until('document.querySelector("#appearance-status").textContent.includes("背景已保存")');
 assert.equal(await evaluate('document.documentElement.dataset.theme'),'frost');
 assert.equal(await evaluate('document.documentElement.dataset.frostMode'),'day');
 assert.deepEqual(await evaluate('(async()=>{const bitmap=await createImageBitmap(window.__appearanceTest.readerAppearance.wallpaper.blob);const size=[bitmap.width,bitmap.height];bitmap.close();return size;})()'),[2560,1707]);
 await evaluate('document.querySelector(".themes").scrollLeft=10000');await screenshot('settings-desktop');
 const dayInk=await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--ink")');
 await click('#frost-mode');
 assert.equal(await evaluate('document.documentElement.dataset.frostMode'),'night');
 assert.notEqual(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--ink")'),dayInk);
 await cdp('Page.reload');await until('!!window.__appearanceTest');await evaluate('window.__appearanceTest.initializeAppearance()');
 assert.equal(await evaluate('window.__appearanceTest.readerAppearance.wallpaper.name'),'云岚.png');
 assert.equal(await evaluate('document.documentElement.dataset.frostMode'),'night');
 assert.match(await evaluate('document.documentElement.style.getPropertyValue("--frost-image")'),/blob:/);
 console.log('Passed: image upload/resizing, day/night colors, wallpaper and mode persistence.');
 const paletteChecks=await evaluate(`(()=>{const api=window.__appearanceTest,canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d'),result=[];const rgb=hex=>hex.match(/[a-f0-9]{2}/gi).map(value=>parseInt(value,16));for(const color of ['#ff0000','#00ff00','#0000ff','#888888','#ffffff','#000000']){c.fillStyle=color;c.fillRect(0,0,64,64);const palette=api.analyzeFrostImage(canvas);api.applyFrostPalette(palette);const style=document.documentElement.style;result.push({color,palette,day:api.frostContrast(rgb(style.getPropertyValue('--frost-day-accent')),[255,255,255]),dayPrimary:api.frostContrast(rgb(style.getPropertyValue('--frost-day-primary')),[255,255,255]),night:api.frostContrast(rgb(style.getPropertyValue('--frost-night-accent')),[7,12,20]),nightPrimary:api.frostContrast(rgb(style.getPropertyValue('--frost-night-primary')),[7,12,20])});}c.fillStyle='#888888';c.fillRect(0,0,64,64);c.fillStyle='#0000ff';c.fillRect(0,0,6,6);const mostlyNeutral=api.analyzeFrostImage(canvas);api.applyFrostPalette(api.readerAppearance.wallpaper.palette);api.jn();return {result,mostlyNeutral,saved:api.readerAppearance.palette};})()`);
 assert.ok(paletteChecks.result[0].palette.hue<10 || paletteChecks.result[0].palette.hue>350);
 assert.ok(Math.abs(paletteChecks.result[1].palette.hue-120)<10);
 assert.ok(Math.abs(paletteChecks.result[2].palette.hue-240)<10);
 for(const item of paletteChecks.result){assert.ok(item.day>=5.5&&item.dayPrimary>=4.8&&item.night>=7&&item.nightPrimary>=7,JSON.stringify(item));if(['#888888','#ffffff','#000000'].includes(item.color))assert.equal(item.palette.saturation,0);}
 assert.equal(paletteChecks.mostlyNeutral.saturation,0);
 await cdp('Page.reload');await until('!!window.__appearanceTest');await evaluate('window.__appearanceTest.initializeAppearance()');
 assert.deepEqual(await evaluate('window.__appearanceTest.readerAppearance.palette'),paletteChecks.saved);
 await evaluate('(async()=>{const api=window.__appearanceTest,record={...api.readerAppearance.wallpaper};delete record.palette;await api.appearanceStorage("readwrite",store=>store.put(record));})()');
 await cdp('Page.reload');await until('!!window.__appearanceTest');await evaluate('window.__appearanceTest.initializeAppearance()');
 assert.equal(await evaluate('(async()=>{const api=window.__appearanceTest,record=await api.appearanceStorage("readonly",store=>store.get("wallpaper"));return record.palette.version;})()'),1);
 console.log('Passed: image-derived hues, neutral-image handling, accent/button contrast and palette persistence.');

 await evaluate(String.raw`window.__appearanceBook={id:'appearance-book',title:'山色与书页',subtitle:'风起时，读一封写给山野的信。',created:Date.now(),readingMode:'scroll',files:[{id:'landscape-file',name:'山居札记.jsonl',created:Date.now(),messages:[{name:'旅人',user:false,date:Date.now(),text:('清晨的风拂过窗棂，远山沉在薄雾里。\n\n他合上手中的书，抬眼看向窗外：“故事还很长，我们慢慢读。”\n\n山色一层一层向天边延展，像一封还未读完的长信。每一页都留着草木的气息，也留着昨日没有说出口的话。\n\n').repeat(18)}]}],rules:[],keepUser:true,annotations:[],textEdits:{},deleted:[]};window.__appearanceTest.u.books=[window.__appearanceBook];window.__appearanceTest.B();window.__appearanceTest.u.settings.font='serif';window.__appearanceTest.jn();window.__appearanceTest.lr(window.__appearanceBook,0,{cover:false})`);
 await until('!!document.querySelector(".message-content")');
 await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
 await evaluate('window.__appearanceBook.title="一封写给山野的长信LongBookNameWithoutSpaces1234567890";window.__appearanceBook.files[0].name="VeryLongChatFileNameWithoutSpaces1234567890.jsonl";window.__appearanceTest.nt()');
 await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 async function tap(selector) {
  const point=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,visible:x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&node.contains(document.elementFromPoint(x,y))};})()`);
  assert.equal(point.visible,true,'Touch target must be visible: '+selector);delete point.visible;
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 for(const action of ['reader-toc','reader-memory']) {
  assert.equal(await evaluate(`document.querySelector('.reader-top [data-action="${action}"]').classList.contains('icon-btn')`),true);
  await tap(`.reader-top [data-action="${action}"]`);
  await until('!!document.querySelector(".modal")');await delay(300);
  const geometry=await evaluate(`(()=>{const m=document.querySelector('.modal'),b=m.querySelector('.modal-body'),r=m.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,innerWidth,innerHeight,bodyWidth:b.clientWidth,bodyOverflow:b.scrollWidth,buttons:[...m.querySelectorAll('button')].filter(x=>{const s=x.getBoundingClientRect();return s.left<r.left||s.right>r.right;}).map(x=>x.textContent||x.getAttribute('aria-label'))};})()`);
  assert.ok(geometry.x>=0&&geometry.y>=0&&geometry.right<=geometry.innerWidth&&geometry.bottom<=geometry.innerHeight,JSON.stringify(geometry));
  assert.equal(geometry.bodyWidth,geometry.bodyOverflow,JSON.stringify(geometry));assert.deepEqual(geometry.buttons,[]);
  await screenshot(action+'-mobile');
  if(action==='reader-toc') {
   await evaluate('const search=document.querySelector("#toc-search");search.value="清晨";search.dispatchEvent(new Event("input",{bubbles:true}))');
   await until('!!document.querySelector(".toc-snippet mark")');
   await tap('.toc-item[data-chapter="0"]');await until('!document.querySelector(".modal")');continue;
  }
  for(const mode of ['year','month','day']){await tap(`[data-calendar-mode="${mode}"]`);assert.equal(await evaluate(`document.querySelector('[data-calendar-mode="${mode}"]').getAttribute('aria-pressed')`),'true');}
  await click('.modal-header [data-action="close-modal"]');
 }
 await evaluate('window.__appearanceBook.theater={enabled:true};window.__appearanceTest.nt()');
 for(const size of [{width:320,height:360},{width:390,height:844}]) {
  await cdp('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:true});
  for(const mode of ['day','night']) {
   await evaluate(`window.__appearanceTest.u.settings.frostMode='${mode}';window.__appearanceTest.jn()`);
   assert.equal(await evaluate('[...document.querySelectorAll(".reader-tools button")].every(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})'),true);
   for(const action of ['reader-toc','reader-memory']) {
    await tap(`.reader-top [data-action="${action}"]`);await until('!!document.querySelector(".reader-auxiliary-modal")');await delay(150);
    assert.equal(await evaluate('(()=>{const m=document.querySelector(".modal"),b=m.querySelector(".modal-body"),r=m.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&b.scrollWidth<=b.clientWidth;})()'),true);
    if(action==='reader-memory') {
     await evaluate('document.querySelector("#calendar-jump").scrollIntoView({block:"center"})');
     assert.equal(await evaluate('(()=>{const field=document.querySelector("#calendar-jump"),r=field.getBoundingClientRect(),m=document.querySelector(".modal").getBoundingClientRect();return r.left>=m.left&&r.right<=m.right&&r.bottom<=m.bottom;})()'),true);
    }
    await tap('.modal-header [data-action="close-modal"]');
   }
  }
 }
 console.log('Passed: real mobile touches, directory search/navigation, calendar modes/date fields, long titles and short-screen dialog bounds.');
 await tap('.reader-top [data-action="reader-toc"]');await until('!!document.querySelector("#toc-search")');
 await evaluate('document.querySelector("#toc-search").dispatchEvent(new Event("input",{bubbles:true}));window.__appearanceTest.B()');await delay(200);
 await evaluate('delete window.__appearanceBook.theater');
 await evaluate('window.__appearanceBook.title="山色与书页";window.__appearanceBook.files[0].name="山居札记.jsonl";window.__appearanceTest.nt()');
 async function readerGeometry(paged) {
  await delay(200);
  const value=await evaluate(`(()=>{const scroll=document.querySelector('.reader-scroll'),page=document.querySelector('.reading-page'),viewport=document.querySelector('.paged-viewport'),r=viewport.getBoundingClientRect(),p=page.getBoundingClientRect(),s=getComputedStyle(viewport),glass=getComputedStyle(document.querySelector('.reader'),'::after');return {bodyOverflow:document.documentElement.scrollWidth>innerWidth,pageWidth:p.width,viewportWidth:r.width,viewportHeight:r.height,windowWidth:innerWidth,windowHeight:innerHeight,top:r.top,bottom:r.bottom,pageHeight:p.height,contentHeight:viewport.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom),scrollHeight:scroll.scrollHeight,scrollClientHeight:scroll.clientHeight,pages:window.__appearanceTest.u.reader.pageCount,glassWidth:parseFloat(glass.width),glassHeight:parseFloat(glass.height),blur:glass.backdropFilter,pageBackground:getComputedStyle(page).backgroundColor};})()`);
  assert.equal(value.bodyOverflow,false,JSON.stringify(value));
  assert.ok(value.viewportWidth<=value.windowWidth,JSON.stringify(value));
  assert.equal(value.glassWidth,value.windowWidth,JSON.stringify(value));
  assert.equal(value.glassHeight,value.windowHeight,JSON.stringify(value));
  assert.match(value.blur,/blur\(26px\)/);
  assert.equal(value.pageBackground,'rgba(0, 0, 0, 0)');
  if(paged){assert.ok(Math.abs(value.pageHeight-value.contentHeight)<2,JSON.stringify(value));assert.ok(value.bottom<=value.windowHeight,JSON.stringify(value));assert.ok(value.pages>1,JSON.stringify(value));}
  else assert.ok(value.scrollHeight>value.scrollClientHeight,JSON.stringify(value));
 }
 for(const mobile of [false,true,'small']) {
  await cdp('Emulation.setDeviceMetricsOverride',{width:mobile==='small'?320:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:1,mobile:!!mobile});
  for(const mode of ['day','night']) {
   await evaluate(`window.__appearanceTest.u.reader.chrome=true;window.__appearanceTest.u.settings.frostMode='${mode}';window.__appearanceTest.jn();window.__appearanceBook.readingMode='scroll';window.__appearanceTest.nt()`);
   await readerGeometry(false);await screenshot(`reader-${mobile==='small'?'small-mobile':mobile?'mobile':'desktop'}-${mode}`);
   await evaluate('window.__appearanceBook.readingMode="paged";window.__appearanceTest.nt()');
   await readerGeometry(true);await screenshot(`paged-${mobile==='small'?'small-mobile':mobile?'mobile':'desktop'}-${mode}`);
   await evaluate('window.__appearanceTest.It(1)');
   assert.equal(await evaluate('window.__appearanceTest.u.reader.page'),1);
   await evaluate('window.__appearanceTest.u.reader.chrome=false;document.querySelector(".reader").classList.add("chrome-hidden");window.__appearanceTest._o()');
   await readerGeometry(true);
  }
 }
 console.log('Passed: desktop/mobile scrolling, paginated glass geometry, hidden controls and page navigation.');

 await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
 await evaluate('window.__appearanceTest.u.reader.chrome=true;window.__appearanceTest.nt()');
 await readerGeometry(true);await screenshot('paged-small-mobile');
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});

 await evaluate(`window.__appearanceTest.u.reader=null;window.__appearanceTest.u.view='shelf';window.__appearanceTest.u.books=[window.__appearanceBook,{...window.__appearanceBook,id:'blue-book',title:'晚风来信',subtitle:'把温柔写进每一次相遇。',accent:'#456792'},{...window.__appearanceBook,id:'night-book',title:'深蓝色的夜',subtitle:'星光落在你读过的页角。',accent:'#273a5a'}];window.__appearanceBook.accent='#587da7';window.__appearanceTest.u.render()`);
 for(const mobile of [false,true,'small']) {
  await cdp('Emulation.setDeviceMetricsOverride',{width:mobile==='small'?320:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:1,mobile:!!mobile});
  for(const mode of ['day','night']) {
   await evaluate(`window.__appearanceTest.u.settings.frostMode='${mode}';window.__appearanceTest.jn()`);
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   assert.match(await evaluate('getComputedStyle(document.querySelector(".workspace"),"::before").backdropFilter'),/blur/);
   await screenshot(`shelf-${mobile==='small'?'small-mobile':mobile?'mobile':'desktop'}-${mode}`);
   await evaluate('window.scrollTo(0,document.querySelector(".library-tabs").getBoundingClientRect().top+scrollY-24)');
   assert.equal(await evaluate('document.querySelector(".topbar").getBoundingClientRect().top'),0);
   await screenshot(`shelf-scrolled-${mobile==='small'?'small-mobile':mobile?'mobile':'desktop'}-${mode}`);
   await evaluate('window.scrollTo(0,0)');
  }
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});

 await evaluate('window.__appearanceTest.$o();document.querySelector(".themes").scrollLeft=10000');
 await screenshot('settings-mobile');
 assert.deepEqual(await evaluate('(()=>{const mode=document.querySelector("#frost-mode").getBoundingClientRect(),upload=document.querySelector(".frost-upload").getBoundingClientRect(),theme=document.querySelector(".frost-theme").getBoundingClientRect();return [mode.left>=theme.left,upload.right<=theme.right,mode.top>=theme.top,upload.bottom<=theme.bottom,upload.left>mode.right];})()'),[true,true,true,true,true]);
 await click('[data-theme-choice="paper"]');
 assert.equal(await evaluate('document.documentElement.dataset.theme'),'paper');
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace")).backdropFilter'),'none');
 await click('[data-theme-choice="frost"]');
 await click('#setting-edit-fonts');await until('!!document.querySelector("#custom-font-add")');
 await click('[data-custom-font-use]');
 assert.equal(await evaluate('window.__appearanceTest.u.settings.font'),fontId);
 await screenshot('fonts-mobile');
 await click('[data-custom-font-delete]');await until('window.__appearanceTest.readerAppearance.fonts.size===0');
 assert.equal(await evaluate('window.__appearanceTest.u.settings.font'),'serif');
 assert.equal(await evaluate('window.__appearanceTest.readerAppearance.faces.size'),0);
 await click('[data-modal-button="0"]');await until('!!document.querySelector("#frost-remove-image")');
 assert.equal(await evaluate('document.querySelectorAll("#setting-font option").length'),5);
 await click('#frost-remove-image');await until('!window.__appearanceTest.readerAppearance.wallpaper');
 await evaluate('window.__appearanceTest.B()');
 for(const mode of ['day','night']) {await evaluate(`window.__appearanceTest.u.settings.frostMode='${mode}';window.__appearanceTest.jn()`);await screenshot('shelf-default-'+mode);}
 await cdp('Page.reload');await until('!!window.__appearanceTest');await evaluate('window.__appearanceTest.initializeAppearance()');
 assert.equal(await evaluate('window.__appearanceTest.readerAppearance.fonts.size'),0);
 assert.equal(await evaluate('window.__appearanceTest.readerAppearance.wallpaper'),null);
 await evaluate('window.__appearanceTest.u.settings.font="custom-missing";window.__appearanceTest.jn()');
 await cdp('Page.reload');await until('!!window.__appearanceTest');await evaluate('window.__appearanceTest.initializeAppearance()');
 assert.equal(await evaluate('window.__appearanceTest.u.settings.font'),'serif');
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("str-settings")).font'),'serif');

 const localFile=path.join(profile,'reader-local.html');await fs.writeFile(localFile,html);
 await cdp('Page.navigate',{url:pathToFileURL(localFile).href});await until('!!window.__appearanceTest');
 await evaluate('window.__appearanceTest.initializeAppearance();window.__appearanceTest.$o()');
 await click('#setting-edit-fonts');await until('!!document.querySelector("#custom-font-file")');
 await evaluate('document.querySelector("#custom-font-name").value="本地离线字体"');
 const localDom=await cdp('DOM.getDocument'),localInput=await cdp('DOM.querySelector',{nodeId:localDom.root.nodeId,selector:'#custom-font-file'});
 await cdp('DOM.setFileInputFiles',{nodeId:localInput.nodeId,files:[fontPath]});await click('#custom-font-add');
 await until('window.__appearanceTest.readerAppearance.fonts.size===1');
 await cdp('Page.reload');await until('!!window.__appearanceTest');await evaluate('window.__appearanceTest.initializeAppearance()');
 await until('window.__appearanceTest.readerAppearance.faces.size===1');
 assert.equal(await evaluate('[...window.__appearanceTest.readerAppearance.fonts.values()][0].name'),'本地离线字体');
 assert.deepEqual(errors,[]);
 assert.equal(await fs.readFile(readerPath,'utf8'),original,'Tests must not modify the reader source');
 console.log('Passed: frosted shelf, in-card tools, theme isolation, font deletion/missing-font fallback and persistent image removal.');
 console.log('Passed: small mobile viewport and local HTML font persistence.');
} finally {
 socket?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await delay(500);await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
