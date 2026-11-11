import {definitions} from './catalog.js';
const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const statusName={lobby:'等待开局',playing:'进行中',finished:'已结束'};
let csrf='',authenticated=false,rooms=[],roomCode=null,playerId=null,cardName='杀',pendingAction=null,busy=false,refreshing=false,generation=0;
function feedback(message,error=false){$('adminFeedback').textContent=message;$('adminFeedback').classList.toggle('error',error);}
function loginView(message=''){
  generation++;authenticated=false;csrf='';rooms=[];roomCode=null;playerId=null;pendingAction=null;
  $('adminPanel').hidden=true;$('loginPanel').hidden=false;$('logoutAdmin').hidden=$('refreshAdmin').hidden=true;$('loginError').textContent=message;
  $('adminRooms').replaceChildren();$('adminPlayers').replaceChildren();$('adminLog').replaceChildren();$('adminFeedback').textContent='';$('adminConfirm').close();
}
async function request(path,data){
  const response=await fetch(`/api/admin/${path}`,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const result=await response.json();if(!response.ok){const e=Error(result.error||'操作失败');e.status=response.status;throw e;}return result;
}
const room=()=>rooms.find(r=>r.code===roomCode),player=()=>room()?.players.find(p=>p.id===playerId);
function renderCards(){const query=$('adminCardSearch').value.trim();$('selectedCardName').textContent=`已选：${cardName}`;$('adminCards').replaceChildren(...definitions.filter(c=>c.name.includes(query)||c.type.includes(query)).map(c=>{const b=el('button',c.name===cardName?'selected':'',c.name);b.type='button';b.title=c.detail;b.setAttribute('aria-pressed',String(c.name===cardName));b.onclick=()=>{cardName=c.name;renderCards();};return b;}));}
function render(){
  $('roomTotal').textContent=rooms.length;$('adminRooms').replaceChildren(...rooms.map(r=>{const b=el('button',`admin-room ${r.code===roomCode?'selected':''}`);b.append(el('strong','',r.code),el('small','',`${statusName[r.status]} · ${r.players.length} 人`));b.onclick=()=>{roomCode=r.code;playerId=null;render();};return b;}));
  const current=room();$('emptyAdmin').hidden=!!current;$('roomAdmin').hidden=!current;if(!current)return;
  $('adminRoomTitle').textContent=`口令码：${current.code}`;$('adminRoomStatus').textContent=`${statusName[current.status]} · ${current.mode==='identity'?'身份局':'自由混战'} · 第 ${current.round} 轮`;
  if(!current.players.some(p=>p.id===playerId)){playerId=current.players.find(p=>p.alive)?.id||current.players[0]?.id||null;if(player())$('hpValue').value=player().hp;}
  $('adminPlayers').replaceChildren(...current.players.map((p,i)=>{const b=el('button',`admin-player ${p.id===playerId?'selected':''}`);b.append(el('strong','',`${i+1}. ${p.name}`),el('small','',`${p.general} · ${p.hp}/${p.maxHp} HP · 手牌 ${p.count}${p.alive?'':' · 已阵亡'}${p.id===current.turn?' · 当前回合':''}`));b.onclick=()=>{playerId=p.id;$('hpValue').value=p.hp;render();};return b;}));
  const target=player();$('playerTools').hidden=!target;$('setHp').disabled=$('giveCards').disabled=!target?.alive||busy;if(target){$('hpValue').max=target.maxHp;$('hpValue').disabled=!target.alive;}
  $('skipAdmin').disabled=busy||current.status!=='playing';$('finishAdmin').disabled=busy||current.status!=='playing';$('resetAdmin').disabled=$('closeAdminRoom').disabled=$('kickPlayer').disabled=busy;
  $('adminLog').replaceChildren(...current.log.map(l=>{const p=el('p','');p.append(el('time','',l.time),document.createTextNode(l.message));return p;}));renderCards();
}
async function loadRooms(){if(!authenticated||refreshing)return;refreshing=true;const turn=generation;try{const result=await request('rooms');if(turn!==generation)return;rooms=result.rooms;if(!rooms.some(r=>r.code===roomCode)){roomCode=rooms[0]?.code||null;playerId=null;}render();}catch(e){if(turn!==generation)return;if(e.status===401)loginView('登录已过期，请重新登录');else feedback(e.message,true);}finally{refreshing=false;}}
function showAdmin(result){generation++;csrf=result.csrf;authenticated=true;$('loginPanel').hidden=true;$('adminPanel').hidden=false;$('logoutAdmin').hidden=$('refreshAdmin').hidden=false;$('adminPassword').value='';loadRooms();}
$('adminLogin').onsubmit=async e=>{e.preventDefault();$('loginAdmin').disabled=true;$('loginError').textContent='';try{showAdmin(await request('login',{password:$('adminPassword').value}));}catch(error){$('loginError').textContent=error.message;}finally{$('loginAdmin').disabled=false;}};
$('logoutAdmin').onclick=async()=>{try{await request('logout',{});loginView();}catch(e){feedback(e.message,true);}};$('refreshAdmin').onclick=loadRooms;$('adminCardSearch').oninput=renderCards;
async function run(data){if(busy)return;busy=true;render();$('confirmAdminAction').disabled=true;try{await request('action',data);$('adminConfirm').close();pendingAction=null;feedback('操作已执行');await loadRooms();}catch(e){if(e.status===401)loginView('登录已过期，请重新登录');else feedback(e.message,true);}finally{busy=false;$('confirmAdminAction').disabled=false;render();}}
function confirm(command,text){if(!room()||busy)return;pendingAction={room:roomCode,command,player:playerId};$('adminConfirmTitle').textContent='确认管理操作';$('adminConfirmText').textContent=text;$('adminConfirm').showModal();}
$('hpForm').onsubmit=e=>{e.preventDefault();if(player())run({room:roomCode,command:'hp',player:playerId,value:Number($('hpValue').value)});};
$('giveForm').onsubmit=e=>{e.preventDefault();if(player())run({room:roomCode,command:'give',player:playerId,card:cardName,count:Number($('giveCount').value)});};
$('skipAdmin').onclick=()=>confirm('skip','结束当前响应和结算，直接进入下一位玩家的回合？');$('finishAdmin').onclick=()=>confirm('finish','结束当前对局？玩家可在房间内重新开局。');$('resetAdmin').onclick=()=>confirm('reset','清除本局进度、手牌和装备，保留玩家座位并回到等待状态？');$('closeAdminRoom').onclick=()=>confirm('close',`关闭口令码为 ${roomCode} 的房间，并让所有玩家退出？`);$('kickPlayer').onclick=()=>{if(player())confirm('kick',`踢出 ${player().name}？对局中的玩家会被视为阵亡，并结束当前结算。`);};
$('cancelAdminAction').onclick=()=>{$('adminConfirm').close();pendingAction=null;};$('confirmAdminAction').onclick=()=>{if(pendingAction)run(pendingAction);};
setInterval(()=>{if(authenticated&&!busy&&!document.hidden)loadRooms();},5000);
try{showAdmin(await request('session'));}catch{loginView();}
