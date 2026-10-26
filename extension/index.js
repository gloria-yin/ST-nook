import { getContext } from '/scripts/extensions.js';
import { getPastCharacterChats, getRequestHeaders, substituteParams, substituteParamsExtended } from '/script.js';
import { getScriptsByType, SCRIPT_TYPES } from '/scripts/extensions/regex/engine.js';

const REPOSITORY='https://github.com/gloria-yin/ST-nook';
const READER_URL='https://gloria-yin.github.io/ST-nook/';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedReader=null,activeDialog=null;

function addButton(){
 const anchor=document.getElementById('chat_import_button');
 if(!anchor||document.getElementById('st-nook-add-book'))return;
 const button=document.createElement('button');button.type='button';button.id='st-nook-add-book';button.className='menu_button menu_button_icon';
 button.innerHTML='<i class="fa-solid fa-book-open"></i><span>添加书籍</span>';
 button.onclick=()=>openImporter().catch(error=>{console.error('[ST Nook]',error);toastr.error(error.message,'酒馆书屋');});anchor.after(button);
}

async function openImporter(){
 if(activeDialog){activeDialog.focus();return;}
 const context=getContext(),character=context.characters?.[context.characterId];
 if(!character||context.groupId){toastr.info('请先打开一张角色卡的聊天。','酒馆书屋');return;}
 const chats=await getPastCharacterChats(context.characterId);
 const current=character.chat||context.chatId||'';
 if(current&&!chats.some(chat=>chat.file_name.replace(/\.jsonl$/,'')===current))chats.unshift({file_name:current+'.jsonl',chat_items:context.chat.length});
 const groups=[['global','全局正则',SCRIPT_TYPES.GLOBAL],['preset','预设正则',SCRIPT_TYPES.PRESET],['local','局部正则',SCRIPT_TYPES.SCOPED]];
 const rules=groups.map(([id,name,type])=>({id,name,rules:getScriptsByType(type,{allowedOnly:true}).filter(rule=>!rule.disabled)}));
 const dialog=document.createElement('dialog');dialog.className='st-nook-dialog';activeDialog=dialog;
 dialog.innerHTML=`<form method="dialog"><header><div><h2>添加书籍</h2><p>${escape(character.name)} · 酒馆书屋</p></div><button class="st-nook-close" value="cancel" aria-label="关闭">×</button></header><div class="st-nook-body"><label class="st-nook-field">书籍名称<input id="st-nook-title" class="text_pole" maxlength="80" value="${escape(character.name)}" required></label><label class="st-nook-field">打开方式<select id="st-nook-mode" class="text_pole"><option value="bundled">插件内的阅读器（离线可用）</option><option value="repository">仓库网页</option><option value="file">选择 HTML 文件</option></select></label><div id="st-nook-repository" hidden><label class="st-nook-field">阅读器网页地址<input id="st-nook-url" class="text_pole" type="url" value="${READER_URL}"></label><p class="st-nook-hint"><a href="${REPOSITORY}" target="_blank" rel="noopener noreferrer">ST Nook 仓库</a></p></div><div id="st-nook-file-wrap" hidden><input id="st-nook-file" type="file" accept=".html,.htm,text/html"><p class="st-nook-hint">请选择新版 index.html。所选文件通过当前酒馆站点打开，书籍保存在该站点的浏览器数据中。</p></div><fieldset><legend>聊天内容</legend><label class="st-nook-check"><input type="checkbox" id="st-nook-all-chats">选择全部聊天</label><div class="st-nook-chat-list">${chats.map((chat,i)=>`<label class="st-nook-chat"><input type="checkbox" data-nook-chat="${i}" ${chat.file_name.replace(/\.jsonl$/,'')===current?'checked':''}><span>${escape(chat.file_name.replace(/\.jsonl$/,''))}${chat.file_name.replace(/\.jsonl$/,'')===current?'<small>当前聊天</small>':''}<small>${chat.chat_items??'—'} 层${chat.last_mes?` · ${escape(chat.last_mes)}`:''}</small></span></label>`).join('')||'<p>此角色还没有聊天记录。</p>'}</div></fieldset><fieldset><legend>导入已开启的正则</legend>${rules.map(group=>`<details class="st-nook-rule-group"><summary><label class="st-nook-check"><input type="checkbox" data-nook-group="${group.id}" ${group.rules.length?'checked':'disabled'}>${group.name}<small>${group.rules.length} 条</small></label></summary><div>${group.rules.map((rule,i)=>`<label class="st-nook-check"><input type="checkbox" data-nook-rule="${group.id}:${i}" checked><span>${escape(rule.scriptName||'未命名规则')}${rule.promptOnly?' · 仅提示词':''}</span></label>`).join('')||'<p class="st-nook-hint">没有已开启的规则</p>'}</div></details>`).join('')}</fieldset><label class="st-nook-check"><input type="checkbox" id="st-nook-avatar" checked>使用当前角色头像作为封面</label><p class="st-nook-hint">确认后自动打开阅读器。聊天和正则保存在目标阅读器的浏览器数据中。</p><p id="st-nook-status" role="status"></p></div><footer><button class="menu_button" value="cancel">取消</button><button type="button" class="menu_button st-nook-submit" id="st-nook-confirm">确认添加</button></footer></form>`;
 document.body.append(dialog);dialog.showModal();
 const $=selector=>dialog.querySelector(selector),$$=selector=>[...dialog.querySelectorAll(selector)];
 dialog.addEventListener('close',()=>{activeDialog=null;dialog.remove();});
 $('#st-nook-mode').onchange=()=>{$('#st-nook-repository').hidden=$('#st-nook-mode').value!=='repository';$('#st-nook-file-wrap').hidden=$('#st-nook-mode').value!=='file';};
 $('#st-nook-file').onchange=()=>{selectedReader=$('#st-nook-file').files[0]||null;};
 $('#st-nook-all-chats').onchange=event=>$$('[data-nook-chat]').forEach(input=>input.checked=event.target.checked);
 $$('[data-nook-chat]').forEach(input=>input.onchange=()=>{$('#st-nook-all-chats').checked=$$('[data-nook-chat]').every(el=>el.checked);});
 $$('[data-nook-group]').forEach(input=>input.onchange=()=>$$(`[data-nook-rule^="${input.dataset.nookGroup}:"]`).forEach(el=>el.checked=input.checked));
 $$('[data-nook-rule]').forEach(input=>input.onchange=()=>{const group=input.dataset.nookRule.split(':')[0],all=$$(`[data-nook-rule^="${group}:"]`),parent=$(`[data-nook-group="${group}"]`);parent.checked=all.every(el=>el.checked);parent.indeterminate=all.some(el=>el.checked)&&!parent.checked;});
 $('#st-nook-confirm').onclick=async()=>{
  const title=$('#st-nook-title').value.trim(),selected=$$('[data-nook-chat]:checked').map(input=>chats[Number(input.dataset.nookChat)]),mode=$('#st-nook-mode').value;
  if(!title){$('#st-nook-title').focus();return;}
  if(!selected.length){$('#st-nook-status').textContent='请至少选择一份聊天。';return;}
  if(mode==='file'&&!selectedReader){$('#st-nook-status').textContent='请选择新版阅读器 HTML 文件。';return;}
  let target;
  try{target=mode==='bundled'?new URL('../index.html',import.meta.url):mode==='repository'?new URL($('#st-nook-url').value):new URL(URL.createObjectURL(selectedReader));if(!['http:','https:','blob:'].includes(target.protocol))throw Error('请使用 HTTP/HTTPS 网页地址，或选择 HTML 文件。');}catch(error){$('#st-nook-status').textContent=error.message;return;}
  const token=crypto.randomUUID();target.hash=new URLSearchParams({'st-nook-import':token,from:location.origin}).toString();
  const win=window.open('about:blank','_blank');
  if(!win){$('#st-nook-status').textContent='浏览器拦截了新窗口，请允许此酒馆站点弹出窗口后重试。';return;}
  $('#st-nook-confirm').disabled=true;
  const report=text=>{if(dialog.isConnected)$('#st-nook-status').textContent=text;};
  let channel;
  try{
   channel=createChannel(win,target.origin,token);win.location.href=target.href;
   report('正在打开阅读器…');await channel.ready;
   const chosen=[];
   for(const input of $$('[data-nook-rule]:checked')){
    const [group,index]=input.dataset.nookRule.split(':'),rule=structuredClone(rules.find(item=>item.id===group).rules[Number(index)]);
    const marker='ST_NOOK_CAPTURE_MATCH_7E3C';
    rule.replaceString=substituteParams(String(rule.replaceString||'').replace(/{{match}}/gi,marker)).replaceAll(marker,'{{match}}');
    rule.trimStrings=(rule.trimStrings||[]).map(text=>substituteParams(text,{name2Override:character.name}));
    if(Number(rule.substituteRegex)===1)rule.findRegex=substituteParamsExtended(rule.findRegex);
    if(Number(rule.substituteRegex)===2)rule.findRegex=substituteParamsExtended(rule.findRegex,{},value=>String(value).replace(/[.*+?^${}()|[\]\\/]/g,'\\$&'));
    rule.substituteRegex=0;chosen.push(rule);
   }
   const cover=$('#st-nook-avatar').checked?await avatarData(character.avatar):'';
   await channel.send('st-nook-begin',{book:{title,name:character.name,cover,rules:chosen}});
   for(const [i,chat] of selected.entries()){
    report(`导入聊天 ${i+1} / ${selected.length}：${chat.file_name}`);
    const isCurrent=chat.file_name.replace(/\.jsonl$/,'')===current;
    let rows;
    if(isCurrent){rows=[{character_name:character.name},...structuredClone(context.chat)];}
    else{
     const response=await fetch('/api/chats/get',{method:'POST',headers:getRequestHeaders(),body:JSON.stringify({ch_name:character.name,avatar_url:character.avatar,file_name:chat.file_name.replace(/\.jsonl$/,'')})});
     if(!response.ok)throw Error(`读取 ${chat.file_name} 失败：${response.status}`);rows=await response.json();
    }
    if(!Array.isArray(rows)||!rows.some(row=>typeof row.mes==='string'||typeof row.content==='string'))throw Error(`${chat.file_name} 没有可导入的正文`);
    await channel.send('st-nook-file',{name:chat.file_name,rows});
   }
   await channel.send('st-nook-finish',{});channel.close();report('导入完成');dialog.close();toastr.success(`已添加《${title}》`,'酒馆书屋');
  }catch(error){channel?.close();console.error('[ST Nook]',error);report(`导入失败：${error.message}`);$('#st-nook-confirm').disabled=false;}
 };
}

async function avatarData(avatar){
 const response=await fetch(`/characters/${encodeURIComponent(avatar)}`);if(!response.ok)throw Error('无法读取角色头像，请取消头像选项后重试');
 const image=await createImageBitmap(await response.blob()),scale=Math.min(1,600/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();return canvas.toDataURL('image/jpeg',.86);
}

function createChannel(win,origin,token){
 let readyResolve,readyReject,readyDone=false;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const pending=new Map();
 const timer=setTimeout(()=>{if(!readyDone){readyReject(Error('阅读器未响应。请检查网页是否可访问，或改用插件内阅读器 / 新版 HTML 文件。'));close();}},90000);
 function receive(event){
  const data=event.data;if(event.source!==win||event.origin!==origin||data?.token!==token)return;
  if(data.type==='st-nook-ready'){readyDone=true;clearTimeout(timer);readyResolve();return;}
  if(!['st-nook-ack','st-nook-error'].includes(data.type))return;
  const item=pending.get(data.requestId);if(!item)return;clearTimeout(item.timer);pending.delete(data.requestId);
  if(data.type==='st-nook-error')item.reject(Error(data.error));else item.resolve(data);
 }
 function close(){clearTimeout(timer);window.removeEventListener('message',receive);for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('连接已关闭'));}pending.clear();}
 window.addEventListener('message',receive);
 return {ready,close,send(type,payload){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timeout=setTimeout(()=>{pending.delete(requestId);reject(Error('阅读器导入超时，请查看阅读器页面。'));close();},180000);pending.set(requestId,{resolve,reject,timer:timeout});win.postMessage({...payload,type,token,requestId},origin);});}};
}

addButton();
new MutationObserver(addButton).observe(document.body,{childList:true,subtree:true});
