import {randomUUID,randomInt} from 'node:crypto';
import {definitions,generals,generalInfo,cardInfo} from './public/catalog.js';
export {definitions};
export function makeCard(index=randomInt(definitions.length)) {
  const definition=typeof index==='string'?cardInfo(index):definitions[index];
  if(!definition)throw Error('未知卡牌');
  return {...definition,id:randomUUID(),suit:['♠','♥','♣','♦'][randomInt(4)],rank:['A','2','3','4','5','6','7','8','9','10','J','Q','K'][randomInt(13)]};
}
export function record(r,message){r.log.unshift({message,time:new Date().toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'})});r.log=r.log.slice(0,100);}
export function createRoom(code){return {code,players:[],clients:new Map(),host:null,turn:null,round:1,status:'lobby',mode:'free',phase:'play',pending:null,queue:[],lossQueue:[],winner:null,deck:[],discard:[],log:[],played:[]};}
const info=p=>generalInfo(p.general),has=(p,id)=>info(p).skills.some(s=>s.id===id),red=c=>['♥','♦'].includes(c.suit),black=c=>['♠','♣'].includes(c.suit);
const player=(r,id)=>r.players.find(p=>p.id===id),living=r=>r.players.filter(p=>p.alive),equipment=p=>Object.values(p.equipment||{}).filter(Boolean);
const equip=(p,slot)=>p.equipment?.[slot]||(slot==='weapon'?p.weapon:null),weapon=p=>equip(p,'weapon')?.name;
const put=(r,...tasks)=>r.queue.unshift(...tasks.filter(Boolean));
const ask=(r,type,p,text,extra={})=>{r.pending={type,responder:p.id,text,...extra};};
export function join(r,name,general){if(general!==undefined&&!generals.some(g=>g.name===general))throw Error("请选择有效武将");if(r.status!=='lobby')throw Error('对局已开始，不能加入');const p={id:randomUUID(),token:randomUUID(),name:String(name||'玩家').trim().slice(0,14)||'玩家',general:general||generals[r.players.length%generals.length].name,hp:4,maxHp:4,gender:'男',alive:true,hand:[],equipment:{},judgments:[],used:{},kills:0,role:null};p.hp=p.maxHp=info(p).hp;r.players.push(p);r.host ||=p.id;record(r,`${p.name} 加入房间`);return p;}
export function distance(r,a,b){if(a.id===b.id)return 0;const alive=living(r),i=alive.findIndex(x=>x.id===a.id),j=alive.findIndex(x=>x.id===b.id);if(i<0||j<0)return Infinity;const raw=Math.min(Math.abs(i-j),alive.length-Math.abs(i-j));return Math.max(1,raw-(equip(a,'offHorse')?1:0)-(has(a,'mashu')?1:0)+(equip(b,'defHorse')?1:0));}
export const attackRange=p=>equip(p,'weapon')?.range||1;
export function snapshot(r,token){const self=r.players.find(p=>p.token===token);const pending=r.pending?{type:r.pending.type,responder:r.pending.responder,text:r.pending.text,required:r.pending.required,options:r.pending.options||[],minCards:r.pending.minCards||0,maxCards:r.pending.maxCards||0,minTargets:r.pending.minTargets||0,maxTargets:r.pending.maxTargets||0,canPass:r.pending.canPass!==false,targets:r.pending.targets||[],cards:self?.id===r.pending.responder?(r.pending.cards||[]):[],private:undefined}:null;return {code:r.code,host:r.host,turn:r.turn,round:r.round,status:r.status,phase:r.phase,mode:r.mode,pending,winner:r.winner,deck:r.deck.length,log:r.log,played:r.played,self:self?.id,role:self?.role,hand:self?.hand||[],players:r.players.map(p=>({id:p.id,connected:r.clients.has(p.token),name:p.name,general:p.general,faction:info(p).faction,gender:info(p).gender,hp:p.hp,maxHp:p.maxHp,alive:p.alive,count:p.hand.length,equipment:p.equipment||{},weapon:equip(p,'weapon')?.name||null,judgments:p.judgments||[],range:attackRange(p),distance:self?distance(r,self,p):null,role:r.status==='finished'||p.role==='主公'||!p.alive?p.role:undefined})),activeSkills:self?info(self).skills.filter(s=>s.kind==='active'):[],used:self?.used||{}};}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}}
function take(r){if(!r.deck.length&&r.discard.length){r.deck=r.discard.splice(0);shuffle(r.deck);record(r,'弃牌堆洗回牌堆');}return r.deck.pop();}
function draw(r,p,n){for(let i=0;i<n;i++){const c=take(r);if(c)p.hand.push(c);} }
function heal(r,p,n){const old=p.hp;p.hp=Math.min(p.maxHp,p.hp+n);record(r,`${p.name} 回复 ${p.hp-old} 点体力`);}
function allCards(p){return [...p.hand,...equipment(p)];}
function lost(r,p,c){const i=p.hand.findIndex(x=>x.id===c.id);if(i>=0){p.hand.splice(i,1);if(!p.hand.length&&has(p,'lianying'))r.lossQueue.push({type:'optional',skill:'lianying',actor:p.id});return;}
for(const [slot,x]of Object.entries(p.equipment||{}))if(x?.id===c.id){delete p.equipment[slot];if(slot==='weapon')p.weapon=null;if(has(p,'xiaoji'))r.lossQueue.push({type:'optional',skill:'xiaoji',actor:p.id});return;}
throw Error('这张牌已不在你的手牌或装备区');}
function spend(r,p,c,discard=true){if(c.virtual){for(const x of c.materials){lost(r,p,x);if(discard)r.discard.push(x);}}else{lost(r,p,c);if(discard)r.discard.push(c);}r.played=[{...c,materials:undefined,owner:p.name},...r.played].slice(0,3);}
function selectCards(p,d){const ids=d.cards||(d.card?[d.card]:[]);if(new Set(ids).size!==ids.length)throw Error('不能重复选择一张牌');return ids.map(id=>{const c=allCards(p).find(c=>c.id===id);if(!c)throw Error('所选牌不存在');return c;});}
function view(p,d){const cs=selectCards(p,d);if(!d.as){if(cs.length!==1)throw Error('请选择一张牌');if(!p.hand.some(x=>x.id===cs[0].id))throw Error('装备区的牌须通过技能转换使用');return cs[0];}
const name=d.as,c=cs[0];let ok=false;
if(name==='杀')ok=(cs.length===2&&weapon(p)==='丈八蛇矛'&&cs.every(x=>p.hand.includes(x)))||(cs.length===1&&((has(p,'wusheng')&&red(c))||(has(p,'longdan')&&c.name==='闪')));
if(name==='闪')ok=cs.length===1&&((has(p,'longdan')&&c.name==='杀')||(has(p,'qingguo')&&black(c)&&p.hand.includes(c)));
if(name==='桃')ok=cs.length===1&&has(p,'jijiu')&&red(c);
if(name==='过河拆桥')ok=cs.length===1&&has(p,'qixi')&&black(c);
if(name==='乐不思蜀')ok=cs.length===1&&has(p,'guose')&&c.suit==='♦';
if(!ok)throw Error('不满足卡牌转换条件');const suit=cs.every(x=>red(x))?'♥':cs.every(x=>black(x))?'♠':'无';return {...cardInfo(name),id:randomUUID(),suit,rank:c.rank,virtual:true,materials:cs};}
function validTarget(r,p,t,c){if(!t?.alive)throw Error('目标不存在或已阵亡');if(p.id===t.id&&c.name!=='闪电')throw Error('不能指定自己');if(has(t,'kongcheng')&&!t.hand.length&&['杀','决斗'].includes(c.name))throw Error('目标处于空城状态');if(has(t,'qianxun')&&['顺手牵羊','乐不思蜀'].includes(c.name))throw Error('谦逊：不能指定该角色');const effective={...p,equipment:{...p.equipment}};for(const x of c.materials||[])if(x.slot&&effective.equipment[x.slot]?.id===x.id){delete effective.equipment[x.slot];if(x.slot==='weapon')effective.weapon=null;}if(c.name==='杀'&&distance(r,effective,t)>attackRange(effective))throw Error('目标超出攻击范围');if(c.name==='顺手牵羊'&&!has(p,'qicai')&&distance(r,effective,t)>1)throw Error('顺手牵羊需要距离 1');if(['过河拆桥','顺手牵羊'].includes(c.name)&&!t.hand.length&&!equipment(t).length&&!t.judgments.length)throw Error('目标没有可操作的牌');if(c.delayed&&t.judgments.some(x=>x.name===c.name))throw Error('判定区已有同名锦囊');}
function finish(r){const alive=living(r);if(r.mode==='identity'){const lord=r.players.find(p=>p.role==='主公');if(!lord?.alive){const solo=alive.length===1&&alive[0].role==='内奸';r.winner=solo?'内奸':'反贼';}else if(!alive.some(p=>['反贼','内奸'].includes(p.role)))r.winner='主忠方';}else if(alive.length<=1)r.winner=alive[0]?.id||'平局';if(r.winner){r.status='finished';r.pending=null;r.queue=[];r.lossQueue=[];record(r,`对局结束，胜者：${player(r,r.winner)?.name||r.winner}`);}}
function death(r,p,source){p.alive=false;r.discard.push(...p.hand,...equipment(p),...p.judgments.map(c=>c.original||c));p.hand=[];p.equipment={};p.weapon=null;p.judgments=[];record(r,`${p.name} 阵亡${p.role?`（${p.role}）`:''}`);if(r.mode==='identity'&&source?.alive){if(p.role==='反贼')draw(r,source,3);if(source.role==='主公'&&p.role==='忠臣'){r.discard.push(...source.hand,...equipment(source));source.hand=[];source.equipment={};source.weapon=null;}}finish(r);if(r.status==='playing'&&r.turn===p.id){r.queue=[];next(r);}}
function next(r){const index=r.players.findIndex(p=>p.id===r.turn);for(let s=1;s<=r.players.length;s++){const i=(index+s)%r.players.length;if(r.players[i].alive){if(i<=index)r.round++;begin(r,r.players[i]);return;}}}
function begin(r,p){r.turn=p.id;r.phase='prepare';p.kills=0;p.used={};p.attacked=false;p.luoyi=false;p.skipPlay=false;record(r,`${p.name} 回合开始`);const prep=[];if(has(p,'guanxing'))prep.push({type:'optional',actor:p.id,skill:'guanxing'});if(has(p,'luoshen'))prep.push({type:'optional',actor:p.id,skill:'luoshen'});put(r,...prep,{type:'judgments',actor:p.id},{type:'drawPhase',actor:p.id},{type:'playPhase',actor:p.id});}
function endTurn(r,p){if(p.hand.length>Math.max(0,p.hp)){if(has(p,'keji')&&!p.attacked){ask(r,'keji',p,'是否发动克己，跳过弃牌阶段？',{options:[{id:'yes',label:'发动克己'}]});return;}r.phase='discard';record(r,`${p.name} 进入弃牌阶段`);}else completeTurn(r,p);}
function completeTurn(r,p){put(r,...(has(p,'biyue')?[{type:'optional',actor:p.id,skill:'biyue'}]:[]),{type:'next'});}
function judgment(r,p,purpose,extra={}){const c=take(r);if(!c)return;record(r,`${p.name} 判定：${c.suit}${c.rank} ${c.name}`);put(r,{type:'rejudge',actor:p.id,card:c,purpose,extra,index:0});}
function required(q){return q.required||(q.type==='slash'?'闪':q.type==='duel'?'杀':q.type==='rescue'?'桃':null);}
function counter(r,task,index=0,cancelled=false){const candidates=living(r);for(let i=index;i<candidates.length;i++){const p=candidates[i];if(p.hand.some(c=>c.name==='无懈可击')){ask(r,'counter',p,`${player(r,task.source)?.name||'角色'} 的${task.card.name}将对 ${player(r,task.target)?.name} 生效，是否无懈？`,{required:'无懈可击',task,index:i,cancelled});return;}}if(!cancelled)put(r,{...task,type:'effect'});else{record(r,`${task.card.name} 对 ${player(r,task.target)?.name} 的效果被抵消`);if(task.judging){if(task.card.name==='闪电')passLightning(r,player(r,task.target),task.card);else r.discard.push(task.card.original||task.card);}}}
function optionsForCards(t,judgments=true){return [...(t.hand.length?[{id:'hand',label:`随机一张手牌（${t.hand.length}）`}]:[]),...Object.entries(t.equipment||{}).map(([slot,c])=>({id:slot,label:c.name})),...(judgments?t.judgments.map(c=>({id:c.id,label:`判定区：${c.name}`})):[])];}
function transferChoice(r,actor,t,option,steal=true){let c;if(option==='hand'){if(!t.hand.length)throw Error('目标没有手牌');c=t.hand[randomInt(t.hand.length)];lost(r,t,c);}else if(t.equipment[option]){c=t.equipment[option];lost(r,t,c);}else{const i=t.judgments.findIndex(c=>c.id===option);if(i<0)throw Error('请选择目标的一张牌');c=t.judgments.splice(i,1)[0];c=c.original||c;}if(steal)actor.hand.push(c);else r.discard.push(c);record(r,`${actor.name} ${steal?'获得':'弃置'} ${t.name} 的${option==='hand'?'一张手牌':`「${c.name}」`}`);return c;}
function optional(r,p,skill,extra={}){if(!p?.alive)return;ask(r,'optional',p,`是否发动${info(p).skills.find(s=>s.id===skill)?.name||skill}？`,{options:[{id:'yes',label:'发动技能'}],skill,...extra});}
function damageTask(r,t){const p=player(r,t.target),source=player(r,t.source);if(!p?.alive)return;const amount=t.amount||1;p.hp-=amount;record(r,`${p.name} 受到 ${amount} 点${t.thunder?'雷电':''}伤害，体力 ${p.hp}/${p.maxHp}`);put(r,...(p.hp<=0?[{type:'rescue',target:p.id,source:source?.id,index:0}]:[]),{...t,type:'afterDamage',amount});}
function responseDone(r,q){const source=player(r,q.source),target=player(r,q.target);if(q.type==='slash'){
if(weapon(source)==='青龙偃月刀')ask(r,'chase',source,'青龙偃月刀：可追加一张杀，否则放弃追击。',{required:'杀',source:source.id,target:target.id,card:q.card});
else if(weapon(source)==='贯石斧')ask(r,'axe',source,'贯石斧：弃两张手牌或其他装备，强制命中？',{minCards:2,maxCards:2,source:source.id,target:target.id,card:q.card});
}else if(q.type==='duel'){put(r,{type:'attackResponse',kind:'duel',source:target.id,target:source.id,card:q.card,need:has(target,'wushuang')?2:1});}}
function resolveAttack(r,q,d){const p=player(r,q.target),source=player(r,q.source);
if(d.pass){put(r,{type:'damage',source:source.id,target:p.id,amount:1+(source.luoyi&&['slash','duel'].includes(q.type)?1:0),card:q.card,slash:q.type==='slash'});return;}
if(d.option==='armor'){if(!q.options?.some(o=>o.id==='armor'))throw Error('当前不能发动八卦阵');if(q.armorTried)throw Error('本次已发动八卦阵');judgment(r,p,'bagua',{response:{...q,armorTried:true}});return;}
if(d.option==='lord'){if(!((q.required==='闪'&&has(p,'hujia'))||(q.required==='杀'&&has(p,'jijiang')))||p.role!=='主公')throw Error('不能发动主公技');put(r,{type:'lordHelp',actor:p.id,response:q,index:0});return;}
const c=view(p,d);if(c.name!==q.required)throw Error(`需要打出${q.required}`);spend(r,p,c);if(r.turn===p.id&&c.name==='杀')p.attacked=true;record(r,`${p.name} 打出${c.name}`);
if((q.need||1)>1){r.pending={...q,need:q.need-1,text:`还需打出 ${q.need-1} 张${q.required}`};return;}responseDone(r,q);}
function drain(r){let steps=0;while(r.status==='playing'){if(r.lossQueue.length){const tasks=r.lossQueue.splice(0);if(r.pending){const waiting=r.pending;r.pending=null;put(r,{type:'restorePrompt',prompt:waiting});}put(r,...tasks);}if(r.pending||!r.queue.length)break;if(++steps>10000)throw Error('结算循环异常');const t=r.queue.shift(),p=player(r,t.actor||t.target),source=player(r,t.source);switch(t.type){
case 'restorePrompt':if(player(r,t.prompt.responder)?.alive)r.pending=t.prompt;break;
case 'next':next(r);break;
case 'optional':optional(r,p,t.skill,t.extra);break;
case 'judgments':if(p?.alive&&p.judgments.length){const cards=p.judgments.splice(0).reverse();put(r,...cards.map(c=>({type:'delayedJudge',actor:p.id,card:c})));}break;
case 'delayedJudge':if(p?.alive)counter(r,{type:'trick',source:p.id,target:p.id,card:t.card,judging:true});else r.discard.push(t.card);break;
case 'rejudge':{const actors=r.players.filter(x=>x.alive&&has(x,'guicai')&&x.hand.length);if(t.index<actors.length)ask(r,'guicai',actors[t.index],`可用手牌改判：${p.name} 当前判定 ${t.card.suit}${t.card.rank}`,{minCards:1,maxCards:1,judgment:t});else put(r,{...t,type:'judgeResult'});break;}
case 'judgeResult':{r.discard.push(t.card);const redResult=red(t.card);record(r,`判定生效：${t.card.suit}${t.card.rank}`);if(has(p,'tiandu'))put(r,{type:'optional',actor:p.id,skill:'tiandu',extra:{card:t.card}});
if(t.purpose==='乐不思蜀'){r.discard.push(t.extra.delayed.original||t.extra.delayed);if(t.card.suit!=='♥'){p.skipPlay=true;record(r,`${p.name} 跳过出牌阶段`);}}
if(t.purpose==='闪电'){const n=t.card.rank==='A'?1:Number(t.card.rank);if(t.card.suit==='♠'&&n>=2&&n<=9){r.discard.push(t.extra.delayed.original||t.extra.delayed);put(r,{type:'damage',target:p.id,amount:3,thunder:true});}else{const alive=living(r),i=alive.indexOf(p);let target;for(let n=1;n<=alive.length;n++){const x=alive[(i+n)%alive.length];if(!x.judgments.some(c=>c.name==='闪电')){target=x;break;}}if(target)target.judgments.push(t.extra.delayed);else r.discard.push(t.extra.delayed.original||t.extra.delayed);}}
if(t.purpose==='bagua'){const q=t.extra.response;if(redResult){record(r,`${p.name} 八卦阵视为打出闪`);if(q.need>1)put(r,{...q,type:'attackResponse',kind:q.type,need:q.need-1});else responseDone(r,q);}else r.pending={...q,options:(q.options||[]).filter(x=>x.id!=='armor')};}
if(t.purpose==='tieji')put(r,{...t.extra.attack,type:'attackResponse',forced:redResult,kind:'slash'});
if(t.purpose==='ganglie'&&t.card.suit!=='♥'&&player(r,t.extra.source)?.alive)ask(r,'ganglie',player(r,t.extra.source),`刚烈：弃两张手牌，否则受到 ${p.name} 的 1 点伤害`,{minCards:2,maxCards:2,source:p.id});
if(t.purpose==='luoshen'&&black(t.card)){const i=r.discard.findIndex(c=>c.id===t.card.id);if(i>=0)p.hand.push(r.discard.splice(i,1)[0]);put(r,{type:'optional',actor:p.id,skill:'luoshen'});}break;}
case 'drawPhase':if(p?.alive){r.phase='draw';if(has(p,'tuxi')||has(p,'luoyi')||has(p,'yingzi'))ask(r,'drawSkill',p,'选择摸牌方式',{options:[{id:'normal',label:'正常摸两张'},...info(p).skills.filter(s=>s.kind==='draw').map(s=>({id:s.id,label:s.name}))],targets:living(r).filter(x=>x.id!==p.id&&x.hand.length).map(x=>x.id),maxTargets:has(p,'tuxi')?2:0});else draw(r,p,2);}break;
case 'playPhase':if(p?.alive){r.phase='play';if(p.skipPlay)endTurn(r,p);}break;
case 'trick':counter(r,t);break;
case 'effect':effect(r,t);break;
case 'attackResponse':{const target=player(r,t.target);if(!target?.alive||!source?.alive)break;const kind=t.kind||'slash';if(t.forced){put(r,{type:'damage',target:target.id,source:source.id,amount:1+(source.luoyi?1:0),card:t.card,slash:true});break;}
const required=kind==='duel'||kind==='南蛮入侵'?'杀':'闪';const options=[];if(required==='闪'&&equip(target,'armor')?.name==='八卦阵'&&!t.ignoreArmor&&!t.armorTried)options.push({id:'armor',label:'发动八卦阵'});if(target.role==='主公'&&((required==='闪'&&has(target,'hujia'))||(required==='杀'&&has(target,'jijiang'))))options.push({id:'lord',label:required==='闪'?'护驾':'激将'});
ask(r,kind,target,`${source.name} 的${kind==='slash'?'杀':kind==='duel'?'决斗':kind}：需要 ${t.need||1} 张${required}，或放弃承受伤害`,{...t,type:kind,responder:target.id,required,options});break;}
case 'slashTarget':{if(!p?.alive||!source?.alive)break;const ignoreArmor=weapon(source)==='青釭剑';if(has(p,'kongcheng')&&!p.hand.length)break;if(!ignoreArmor&&equip(p,'armor')?.name==='仁王盾'&&black(t.card)){record(r,`${p.name} 的仁王盾抵消黑色杀`);break;}
const after={...t,type:'slashReady',ignoreArmor};if(has(p,'liuli')&&allCards(p).length)ask(r,'liuli',p,'流离：弃一张牌，将杀转移给攻击范围内的另一角色？',{minCards:1,maxCards:1,minTargets:1,maxTargets:1,targets:living(r).filter(x=>x.id!==p.id&&x.id!==source.id&&distance(r,p,x)<=attackRange(p)).map(x=>x.id),attack:after});else put(r,after);break;}
case 'slashReady':{const attack={type:'attackResponse',kind:'slash',source:t.source,target:t.target,card:t.card,ignoreArmor:t.ignoreArmor,need:has(source,'wushuang')?2:1};if(weapon(source)==='雌雄双股剑'&&info(source).gender!==info(p).gender)ask(r,'swords',p,'雌雄双股剑：弃一张手牌，否则攻击者摸一张',{minCards:1,maxCards:1,attack});else if(has(source,'tieji'))ask(r,'tieji',source,'是否发动铁骑判定？',{options:[{id:'yes',label:'发动铁骑'}],attack});else put(r,attack);break;}
case 'damage':if(t.slash&&weapon(source)==='寒冰剑'&&p?.alive&&(p.hand.length||equipment(p).length))ask(r,'ice',source,'寒冰剑：改为弃置目标两张牌，不造成伤害？',{options:[{id:'yes',label:'弃牌代替伤害'}],damage:t});else damageTask(r,t);break;
case 'damageDirect':damageTask(r,t);break;
case 'rescue':{if(!p?.alive||p.hp>0)break;const alive=living(r),index=alive.indexOf(p),order=Array.from({length:alive.length},(_,i)=>alive[(index+i)%alive.length]);const rescuer=order[t.index];if(!rescuer){death(r,p,source);break;}ask(r,'rescue',rescuer,`${p.name} 濒死（${p.hp} 点体力），可出桃救援或放弃`,{required:'桃',dying:p.id,source:source?.id,index:t.index});break;}
case 'afterDamage':if(p?.alive){const triggers=[];for(const id of ['jianxiong','fankui'])if(has(p,id))triggers.push({type:'optional',actor:p.id,skill:id,extra:{source:t.source,card:t.card}});for(let i=0;i<t.amount;i++){for(const id of ['ganglie','yiji'])if(has(p,id))triggers.push({type:'optional',actor:p.id,skill:id,extra:{source:t.source,card:t.card}});}if(t.slash&&source?.alive&&weapon(source)==='麒麟弓'&&(equip(p,'offHorse')||equip(p,'defHorse')))triggers.push({type:'bow',actor:source.id,target:p.id});put(r,...triggers);}break;
case 'bow':ask(r,'bow',player(r,t.actor),'麒麟弓：选择弃置目标的一张坐骑',{target:t.target,options:Object.entries(player(r,t.target).equipment).filter(([s])=>s==='offHorse'||s==='defHorse').map(([id,c])=>({id,label:c.name}))});break;
case 'lordHelp':{const lord=player(r,t.actor),others=living(r).filter(x=>x.id!==lord.id&&info(x).faction===info(lord).faction);if(t.index>=others.length){if(t.attack){record(r,'没有角色响应激将');break;}r.pending={...t.response,options:(t.response.options||[]).filter(x=>x.id!=='lord')};}else ask(r,'lordHelp',others[t.index],`是否为 ${lord.name} 打出${t.response.required}？`,{required:t.response.required,help:t});break;}
case 'draw':if(p?.alive)draw(r,p,t.n);break;
case 'giveYiji':if(p?.alive){const cards=p.hand.filter(c=>t.ids.includes(c.id));if(cards.length)ask(r,'giveYiji',p,'遗计：可选取本次所得牌，交给另一角色；放弃则保留',{minCards:1,maxCards:cards.length,cards,targets:living(r).filter(x=>x.id!==p.id).map(x=>x.id),minTargets:1,maxTargets:1,ids:t.ids});}break;
case 'iceChoice':{const options=optionsForCards(player(r,t.target),false);if(options.length)ask(r,'iceChoice',player(r,t.actor),'寒冰剑：选择弃置目标的一张牌',{target:t.target,options,canPass:false});break;}
case 'initGrain':for(let i=0;i<t.n;i++){const c=take(r);if(c)t.pool.push(c);}break;
case 'grainCleanup':r.discard.push(...t.pool.splice(0));break;
case 'grain':if(p?.alive&&t.pool.length)ask(r,'grain',p,'五谷丰登：选择获得一张牌',{options:t.pool.map(c=>({id:c.id,label:`${c.suit}${c.rank} ${c.name}`})),canPass:false,pool:t.pool});break;
}}}

function passLightning(r,p,c){const alive=living(r),i=alive.indexOf(p);for(let n=1;n<=alive.length;n++){const next=alive[(i+n)%alive.length];if(!next.judgments.some(x=>x.name==='闪电')){next.judgments.push(c);return;}}r.discard.push(c);}
function effect(r,t){const p=player(r,t.target),source=player(r,t.source),c=t.card;if(!p?.alive)return;if(t.judging){judgment(r,p,c.name,{delayed:c});return;}
switch(c.name){
case '无中生有':draw(r,p,2);break;
case '决斗':put(r,{type:'attackResponse',kind:'duel',source:source.id,target:p.id,card:c,need:has(source,'wushuang')?2:1});break;
case '南蛮入侵':case '万箭齐发':put(r,{type:'attackResponse',kind:c.name,source:source.id,target:p.id,card:c});break;
case '桃园结义':if(p.hp<p.maxHp)heal(r,p,1);break;
case '过河拆桥':case '顺手牵羊':{const options=optionsForCards(p);if(options.length)ask(r,'takeCard',source,`${c.name}：选择 ${p.name} 的一张牌`,{options,target:p.id,steal:c.name==='顺手牵羊',canPass:false});break;}
case '五谷丰登':put(r,{type:'grain',actor:p.id,pool:t.pool});break;
case '借刀杀人':ask(r,'borrow',p,`借刀杀人：对 ${player(r,t.victim)?.name} 使用杀，否则交出武器`,{required:'杀',victim:t.victim,source:source.id});break;
case '乐不思蜀':case '闪电':if(!p.judgments.some(x=>x.name===c.name)){for(const x of c.materials||[c]){const i=r.discard.findIndex(a=>a.id===x.id);if(i>=0)r.discard.splice(i,1);}p.judgments.push(c.virtual?{...c,id:c.materials[0].id,virtual:false,materials:undefined,original:c.materials[0]}:c);}break;
}}
function skill(r,p,d){const id=d.skill,targets=(d.targets||(d.target?[d.target]:[])).map(id=>player(r,id)),cs=selectCards(p,d),t=targets[0];
if(!has(p,id))throw Error('该武将没有此技能');if(info(p).skills.find(s=>s.id===id).kind!=='active'&&id!=='jijiang')throw Error('该技能需要对应时机发动');
if(['zhiheng','jieyin','qingnang','lijian','fanjian'].includes(id)&&p.used[id])throw Error('本阶段已发动过该技能');
const other=()=>{if(!t?.alive||t.id===p.id)throw Error('请选择其他存活角色');};
if(id==='rende'){other();if(!cs.length||cs.some(c=>!p.hand.includes(c)))throw Error('仁德需要选择手牌');for(const c of cs){lost(r,p,c);t.hand.push(c);}const before=p.used.rende||0;p.used.rende=before+cs.length;if(before<2&&p.used.rende>=2)heal(r,p,1);}
else if(id==='zhiheng'){if(!cs.length)throw Error('至少选择一张手牌或装备');for(const c of cs){lost(r,p,c);r.discard.push(c);}draw(r,p,cs.length);p.used[id]=true;}
else if(id==='kurou'){p.hp--;put(r,...(p.hp<=0?[{type:'rescue',target:p.id,index:0}]:[]),{type:'draw',actor:p.id,n:2});}
else if(id==='jieyin'){if(cs.length!==2||cs.some(c=>!p.hand.includes(c)))throw Error('结姻须弃两张手牌');other();if(info(t).gender!=='男'||t.hp>=t.maxHp)throw Error('请选择一名受伤男性角色');for(const c of cs){lost(r,p,c);r.discard.push(c);}heal(r,p,1);heal(r,t,1);p.used[id]=true;}
else if(id==='qingnang'){if(cs.length!==1||!p.hand.includes(cs[0]))throw Error('青囊须弃一张手牌');if(!t?.alive||t.hp>=t.maxHp)throw Error('请选择受伤角色');lost(r,p,cs[0]);r.discard.push(cs[0]);heal(r,t,1);p.used[id]=true;}
else if(id==='lijian'){if(cs.length!==1)throw Error('离间须弃一张牌');if(targets.length!==2||new Set(targets.map(x=>x?.id)).size!==2||targets.some(x=>!x?.alive||x.id===p.id||info(x).gender!=='男'||(has(x,'kongcheng')&&!x.hand.length)))throw Error('依次选择两名其他男性角色，不能指定空城角色');lost(r,p,cs[0]);r.discard.push(cs[0]);p.used[id]=true;put(r,{type:'attackResponse',kind:'duel',source:targets[0].id,target:targets[1].id,card:{...cardInfo('决斗'),id:randomUUID(),virtual:true,materials:[]},need:has(targets[0],'wushuang')?2:1});}
else if(id==='fanjian'){other();if(!p.hand.length)throw Error('没有手牌');p.used[id]=true;ask(r,'fanjian',t,'反间：猜测即将随机获得的牌的花色',{source:p.id,options:['♠','♥','♣','♦'].map(x=>({id:x,label:x})),canPass:false});}
else if(id==='jijiang'){other();if(p.role!=='主公')throw Error('激将只适用于主公');const c={...cardInfo('杀'),suit:'♠',virtual:true,materials:[],id:randomUUID()};validTarget(r,p,t,c);if(p.kills>=1&&weapon(p)!=='诸葛连弩'&&!has(p,'paoxiao'))throw Error('本回合出杀次数已用完');put(r,{type:'lordHelp',actor:p.id,response:{required:'杀',type:'activeSlash'},attack:{source:p.id,target:t.id,card:c},index:0});}
record(r,`${p.name} 发动${info(p).skills.find(s=>s.id===id).name}`);}
function respond(r,p,d,q){const cs=selectCards(p,d),targets=(d.targets||(d.target?[d.target]:[])).map(id=>player(r,id));const yes=!d.pass;const choice=d.option||q.options?.[0]?.id;
if(d.pass&&q.canPass===false)throw Error('必须完成该操作');
if(['slash','duel','南蛮入侵','万箭齐发'].includes(q.type)){resolveAttack(r,q,d);return;}
if(q.type==='counter'){if(d.pass){counter(r,q.task,q.index+1,q.cancelled);return;}const c=view(p,d);if(c.name!=='无懈可击')throw Error('请选择无懈可击');spend(r,p,c);record(r,`${p.name} 使用无懈可击`);if(has(p,'jizhi'))put(r,{type:'optional',actor:p.id,skill:'jizhi'});counter(r,q.task,0,!q.cancelled);return;}
if(q.type==='rescue'){const dying=player(r,q.dying);if(d.pass){put(r,{type:'rescue',target:dying.id,source:q.source,index:q.index+1});return;}const c=view(p,d);if(c.name!=='桃'||(c.virtual&&r.turn===p.id))throw Error('请出桃；急救只能在你的回合外发动');spend(r,p,c);heal(r,dying,1+(dying.role==='主公'&&has(dying,'jiuyuan')&&info(p).faction==='吴'&&p.id!==dying.id?1:0));if(dying.hp<=0)put(r,{type:'rescue',target:dying.id,source:q.source,index:q.index});return;}
if(q.type==='drawSkill'){if(!d.pass&&!q.options.some(o=>o.id===choice))throw Error('无效摸牌选项');if(d.pass||choice==='normal'){draw(r,p,2);return;}if(choice==='tuxi'){if(!targets.length||targets.length>2||new Set(targets.map(x=>x?.id)).size!==targets.length||targets.some(x=>!x?.alive||x.id===p.id||!x.hand.length))throw Error('选择一至两名有手牌的其他角色');for(const t of targets)transferChoice(r,p,t,'hand');}else if(choice==='luoyi'){p.luoyi=true;draw(r,p,1);}else if(choice==='yingzi')draw(r,p,3);else throw Error('无效摸牌方式');record(r,`${p.name} 发动${info(p).skills.find(s=>s.id===choice)?.name}`);return;}
if(q.type==='keji'){if(yes)completeTurn(r,p);else{r.phase='discard';}return;}
if(q.type==='optional'){if(!yes)return;const source=player(r,q.source);record(r,`${p.name} 发动${info(p).skills.find(s=>s.id===q.skill)?.name||q.skill}`);
switch(q.skill){
case 'lianying':case 'jizhi':case 'biyue':draw(r,p,1);break;
case 'xiaoji':draw(r,p,2);break;
case 'tiandu':{const i=r.discard.findIndex(c=>c.id===q.card.id);if(i>=0)p.hand.push(r.discard.splice(i,1)[0]);break;}
case 'jianxiong':for(const c of q.card?.materials||[q.card]){if(!c)continue;const i=r.discard.findIndex(x=>x.id===c.id);if(i>=0)p.hand.push(r.discard.splice(i,1)[0]);}break;
case 'fankui':if(source?.alive){const options=optionsForCards(source,false);if(options.length)ask(r,'takeCard',p,'反馈：选择伤害来源的一张牌',{target:source.id,options,steal:true,canPass:false});}break;
case 'ganglie':if(source?.alive)judgment(r,p,'ganglie',{source:source.id});break;
case 'yiji':{const before=new Set(p.hand.map(c=>c.id));draw(r,p,2);put(r,{type:'giveYiji',actor:p.id,ids:p.hand.filter(c=>!before.has(c.id)).map(c=>c.id)});break;}
case 'luoshen':judgment(r,p,'luoshen');break;
case 'guanxing':{const cards=[];for(let i=0;i<Math.min(5,living(r).length);i++){const c=take(r);if(c)cards.push(c);}if(cards.length)ask(r,'guanxing',p,'观星：调整牌序，可将选中的牌放到牌堆底；列表左侧为牌堆顶。',{cards,canPass:true});break;}}
return;}
if(q.type==='guanxing'){const ids=q.cards.map(c=>c.id),order=d.order||ids,bottom=d.bottom||[];if(new Set(order).size!==ids.length||order.length!==ids.length||order.some(id=>!ids.includes(id))||new Set(bottom).size!==bottom.length||bottom.some(id=>!ids.includes(id)))throw Error('牌序无效');const sorted=order.map(id=>q.cards.find(c=>c.id===id));const top=sorted.filter(c=>!bottom.includes(c.id)),low=sorted.filter(c=>bottom.includes(c.id));r.deck.push(...top.reverse());r.deck.unshift(...low.reverse());record(r,`${p.name} 观星完成，${low.length} 张置底`);return;}
if(q.type==='guicai'){if(!yes){put(r,{...q.judgment,index:q.judgment.index+1});return;}if(cs.length!==1||!p.hand.includes(cs[0]))throw Error('鬼才需要一张手牌');const c=cs[0];lost(r,p,c);r.discard.push(q.judgment.card);put(r,{...q.judgment,card:c,index:q.judgment.index+1});record(r,`${p.name} 鬼才改判：${c.suit}${c.rank}`);return;}
if(q.type==='takeCard'){if(!q.options.some(o=>o.id===choice))throw Error('请选择有效区域');transferChoice(r,p,player(r,q.target),choice,q.steal);return;}
if(q.type==='giveYiji'){if(!yes)return;if(cs.length<1||cs.some(c=>!q.ids.includes(c.id))||targets.length!==1||!targets[0]?.alive||targets[0].id===p.id)throw Error('请选择遗计所得牌及一名其他角色');for(const c of cs){lost(r,p,c);targets[0].hand.push(c);}put(r,{type:'giveYiji',actor:p.id,ids:q.ids.filter(id=>!cs.some(c=>c.id===id))});return;}
if(q.type==='ganglie'){if(yes){if(cs.length!==2||cs.some(c=>!p.hand.includes(c)))throw Error('需要弃两张手牌');for(const c of cs){lost(r,p,c);r.discard.push(c);}}else put(r,{type:'damage',target:p.id,source:q.source,amount:1});return;}
if(q.type==='tieji'){if(yes)judgment(r,p,'tieji',{attack:q.attack});else put(r,q.attack);return;}
if(q.type==='swords'){if(yes){if(cs.length!==1||!p.hand.includes(cs[0]))throw Error('弃置一张手牌，或放弃让对方摸牌');lost(r,p,cs[0]);r.discard.push(cs[0]);}else draw(r,player(r,q.attack.source),1);const source=player(r,q.attack.source);if(has(source,'tieji'))ask(r,'tieji',source,'是否发动铁骑？',{options:[{id:'yes',label:'发动铁骑'}],attack:q.attack});else put(r,q.attack);return;}
if(q.type==='liuli'){if(!yes){put(r,q.attack);return;}if(cs.length!==1||targets.length!==1||!q.targets.includes(targets[0]?.id))throw Error('选择一张弃牌与一名合法流离目标');const t=targets[0],c=cs[0];const old=p.equipment;if(c.slot&&old[c.slot]?.id===c.id){const copy={...p,equipment:{...old}};delete copy.equipment[c.slot];if(c.slot==='weapon')copy.weapon=null;if(distance(r,copy,t)>attackRange(copy))throw Error('弃置该装备后，目标超出攻击范围');}lost(r,p,c);r.discard.push(c);put(r,{...q.attack,target:t.id});return;}
if(q.type==='chase'){if(!yes)return;const c=view(p,d);if(c.name!=='杀')throw Error('需要追加一张杀');spend(r,p,c);p.attacked=true;put(r,{type:'slashTarget',source:p.id,target:q.target,card:c});return;}
if(q.type==='axe'){if(!yes)return;if(cs.length!==2||cs.some(c=>c.id===equip(p,'weapon')?.id))throw Error('须弃两张其他牌，不能弃贯石斧本身');for(const c of cs){lost(r,p,c);r.discard.push(c);}put(r,{type:'damage',target:q.target,source:p.id,amount:1+(p.luoyi?1:0),card:q.card,slash:true});return;}
if(q.type==='ice'){if(!yes){put(r,{...q.damage,type:'damageDirect'});return;}const t=player(r,q.damage.target);for(let i=0;i<2;i++){const options=optionsForCards(t,false);if(!options.length)break;put(r,{type:'iceChoice',actor:p.id,target:t.id});}return;}
if(q.type==='iceChoice'){transferChoice(r,p,player(r,q.target),choice,false);return;}
if(q.type==='bow'){if(!yes)return;const t=player(r,q.target);if(!['offHorse','defHorse'].includes(choice)||!t.equipment[choice])throw Error('请选择坐骑');transferChoice(r,p,t,choice,false);return;}
if(q.type==='borrow'){if(!yes){const source=player(r,q.source),w=equip(p,'weapon');if(w){lost(r,p,w);source.hand.push(w);}return;}const c=view(p,d),t=player(r,q.victim);if(c.name!=='杀')throw Error('需要杀');validTarget(r,p,t,c);spend(r,p,c);put(r,{type:'slashTarget',source:p.id,target:t.id,card:c});return;}
if(q.type==='fanjian'){if(!q.options.some(o=>o.id===choice))throw Error('请选择花色');const source=player(r,q.source);if(source?.hand.length){const c=source.hand[randomInt(source.hand.length)];lost(r,source,c);p.hand.push(c);record(r,`反间揭示：${c.suit}${c.rank} ${c.name}`);if(c.suit!==choice)put(r,{type:'damage',target:p.id,source:source.id,amount:1});}return;}
if(q.type==='grain'){const i=q.pool.findIndex(c=>c.id===choice);if(i<0)throw Error('请选择五谷丰登中的一张牌');p.hand.push(q.pool.splice(i,1)[0]);return;}
if(q.type==='lordHelp'){const h=q.help;if(!yes){put(r,{...h,index:h.index+1});return;}const c=view(p,d);if(c.name!==q.required)throw Error(`需要${q.required}`);spend(r,p,c);record(r,`${p.name} 为 ${player(r,h.actor).name} 提供${c.name}`);if(h.attack){const lord=player(r,h.actor);lord.kills++;lord.attacked=true;put(r,{...h.attack,type:'slashTarget',card:c});}else if((h.response.need||1)>1)r.pending={...h.response,need:h.response.need-1};else responseDone(r,h.response);return;}
throw Error('未识别的响应');}
export function act(r,p,action,d={}){
if(action==='general'){if(r.status!=='lobby')throw Error('只能在等待阶段选将');if(!generals.some(g=>g.name===d.general))throw Error('未知武将');p.general=d.general;p.hp=p.maxHp=info(p).hp;record(r,`${p.name} 选择 ${p.general}`);return;}
if(action==='mode'){if(r.status!=='lobby'||p.id!==r.host)throw Error('仅房主可在等待阶段修改模式');if(!['free','identity'].includes(d.mode))throw Error('未知模式');r.mode=d.mode;return;}
if(action==='reopen'){if(p.id!==r.host||r.status!=='finished')throw Error('仅房主可在结束后重新开桌');r.status='lobby';r.pending=null;r.queue=[];r.lossQueue=[];r.turn=null;r.winner=null;for(const x of r.players){x.hand=[];x.equipment={};x.weapon=null;x.judgments=[];x.hp=x.maxHp=info(x).hp;x.alive=true;x.role=null;}record(r,'房间重新开放');return;}
if(action==='start'){if(p.id!==r.host)throw Error('只有房主可以开始');if(r.status!=='lobby')throw Error('请先重新开桌');if(r.players.length<(r.mode==='identity'?4:2))throw Error(r.mode==='identity'?'身份局至少四人':'至少两人');const counts={'杀':30,'闪':15,'桃':8,'无中生有':4,'决斗':3,'过河拆桥':6,'顺手牵羊':5,'南蛮入侵':3,'万箭齐发':1,'桃园结义':1,'五谷丰登':2,'无懈可击':4,'借刀杀人':2,'乐不思蜀':3,'闪电':2};const weighted=[...Object.entries(counts).flatMap(([name,n])=>Array(n).fill(name)),...definitions.filter(c=>c.slot).map(c=>c.name),'诸葛连弩','八卦阵'];r.deck=Array.from({length:Math.max(108,r.players.length*16)},(_,i)=>makeCard(weighted[i%weighted.length]));shuffle(r.deck);r.discard=[];r.played=[];r.pending=null;r.queue=[];r.lossQueue=[];r.winner=null;r.round=1;r.status='playing';const roles=['主公',...Array(Math.max(1,Math.floor((r.players.length-1)/2))).fill('反贼'),'内奸'];while(roles.length<r.players.length)roles.push('忠臣');const tail=roles.splice(1);shuffle(tail);roles.push(...tail);for(const [i,x]of r.players.entries()){x.role=r.mode==='identity'?roles[i]:null;x.maxHp=info(x).hp+(x.role==='主公'&&r.players.length>=5?1:0);x.hp=x.maxHp;x.alive=true;x.hand=[];x.equipment={};x.weapon=null;x.judgments=[];x.used={};draw(r,x,4);}record(r,`对局开始：${r.mode==='identity'?'身份局':'自由混战'}`);begin(r,r.players[0]);drain(r);return;}
if(r.status!=='playing')throw Error('请先开始对局');if(!p.alive)throw Error('你已阵亡，当前为观战');
if(action==='respond'){const q=r.pending;if(!q||q.responder!==p.id)throw Error('现在不需要你响应');r.pending=null;try{respond(r,p,d,q);}catch(e){r.pending=q;throw e;}drain(r);return;}
if(r.pending)throw Error('请等待当前响应');if(r.turn!==p.id)throw Error('不是你的回合');
if(action==='end'){if(r.phase==='discard')throw Error('请先完成弃牌');endTurn(r,p);drain(r);return;}
if(action==='skill'){if(r.phase!=='play')throw Error('当前不是出牌阶段');skill(r,p,d);drain(r);return;}
if(action!=='play')throw Error('未知操作');
if(d.mode==='discard'){if(r.phase!=='discard')throw Error('当前不是弃牌阶段');const cs=selectCards(p,d);if(!cs.length||cs.some(c=>!p.hand.includes(c)))throw Error('请选择手牌弃置');if(cs.length>p.hand.length-Math.max(0,p.hp))throw Error('选择的弃牌超过所需数量');for(const c of cs){spend(r,p,c);record(r,`${p.name} 弃置${c.name}`);}if(p.hand.length<=Math.max(0,p.hp))completeTurn(r,p);drain(r);return;}
if(r.phase!=='play')throw Error('当前不是出牌阶段');const c=view(p,d),targets=(d.targets||(d.target?[d.target]:[])).map(id=>player(r,id));if(new Set(targets.map(x=>x?.id)).size!==targets.length)throw Error('不能重复选择目标');if(c.name==='闪'||c.name==='无懈可击')throw Error('此牌只能在响应窗口使用');if(c.name==='桃'&&(p.hp>=p.maxHp||(c.virtual&&has(p,'jijiu'))))throw Error('桃需受伤时使用，急救仅限回合外');
let victim;if(c.target==='borrow'){if(targets.length!==2)throw Error('先选择持有武器的角色，再选择其攻击目标');if(targets[0]?.id===p.id||!equip(targets[0],'weapon'))throw Error('第一个目标须为持有武器的其他角色');validTarget(r,targets[0],targets[1],cardInfo('杀'));victim=targets[1].id;}
else if(c.target==='other'){const maximum=c.name==='杀'&&weapon(p)==='方天画戟'&&c.materials?.length!==2&&p.hand.length===1?3:1;if(targets.length<1||targets.length>maximum)throw Error(`请选择 1${maximum>1?`～${maximum}`:''} 名目标`);for(const t of targets)validTarget(r,p,t,c);}
if(c.name==='杀'&&p.kills>=1&&weapon(p)!=='诸葛连弩'&&!has(p,'paoxiao'))throw Error('本回合杀的次数已用完');if(c.name==='闪电'&&p.judgments.some(x=>x.name==='闪电'))throw Error('判定区已有闪电');
spend(r,p,c,!c.slot);record(r,`${p.name} 使用${c.name}`);if(c.slot){if(p.equipment[c.slot]){const old=p.equipment[c.slot];lost(r,p,old);r.discard.push(old);}p.equipment[c.slot]=c;if(c.slot==='weapon')p.weapon=c;}
else if(c.name==='桃')heal(r,p,1);
else if(c.name==='杀'){p.kills++;p.attacked=true;put(r,...targets.map(t=>({type:'slashTarget',source:p.id,target:t.id,card:c})));}
else {if(c.type==='锦囊牌'&&has(p,'jizhi'))put(r,{type:'optional',actor:p.id,skill:'jizhi'});let ts=targets;
if(['南蛮入侵','万箭齐发'].includes(c.name))ts=ordered(r,p).filter(x=>x.id!==p.id);
if(['桃园结义','五谷丰登'].includes(c.name))ts=ordered(r,p);
if(['无中生有','闪电'].includes(c.name))ts=[p];let pool;if(c.name==='五谷丰登'){pool=[];r.queue.push({type:'initGrain',pool,n:ts.length});}
r.queue.push(...ts.slice(0,c.name==='借刀杀人'?1:undefined).map(t=>({type:'trick',source:p.id,target:t.id,card:c,pool,victim})));if(pool)r.queue.push({type:'grainCleanup',pool});}
drain(r);
}
function ordered(r,p){const alive=living(r),i=alive.indexOf(p);return [...alive.slice(i),...alive.slice(0,i)];}
export function admin(r,command,d={}){const p=player(r,d.player);if(command==='hp'){if(!p?.alive)throw Error('请选择存活角色');const hp=Number(d.value);if(!Number.isInteger(hp)||hp<1||hp>p.maxHp)throw Error(`体力范围 1～${p.maxHp}`);p.hp=hp;}
else if(command==='give'){if(!p?.alive||!cardInfo(d.card))throw Error('请选择角色与卡牌');const n=Number(d.count||1);if(!Number.isInteger(n)||n<1||n>50)throw Error('一次发牌数量为 1～50');for(let i=0;i<n;i++)p.hand.push(makeCard(d.card));}
else if(command==='skip'){if(r.status!=='playing')throw Error('没有进行中的对局');const old=r.turn;r.pending=null;r.queue=[];r.lossQueue=[];for(const x of living(r))if(x.hp<=0)death(r,x);if(r.status==='playing'&&r.turn===old)next(r);drain(r);}
else if(command==='finish'){r.pending=null;r.queue=[];r.lossQueue=[];r.status='finished';r.winner='房主终止';}
else if(command==='reset'){r.pending=null;r.queue=[];r.lossQueue=[];r.status='lobby';r.turn=null;r.winner=null;for(const x of r.players){x.hand=[];x.equipment={};x.weapon=null;x.judgments=[];x.hp=x.maxHp=info(x).hp;x.alive=true;x.role=null;}}
else if(command==='kick'){if(!p)throw Error('玩家不存在');if(r.status==='playing'){const old=r.turn;r.pending=null;r.queue=[];r.lossQueue=[];death(r,p);if(r.status==='playing'&&r.turn===old)next(r);drain(r);}r.clients.get(p.token)?.end();r.clients.delete(p.token);r.players=r.players.filter(x=>x.id!==p.id);if(r.host===p.id)r.host=r.players[0]?.id||null;}
else throw Error('未知管理操作');record(r,`[sudo] ${command}${p?` ${p.name}`:''}${d.value!==undefined?` → ${d.value}`:''}${d.card?` ${d.card} × ${d.count||1}`:''}`);}

export function leave(r,p){
  if(r.status==='playing'&&p.alive){
    const old=r.turn;r.pending=null;r.queue=[];r.lossQueue=[];
    death(r,p);if(r.status==='playing'&&r.turn===old)next(r);drain(r);
  }else if(r.status==='playing'&&r.pending?.responder===p.id){r.pending=null;drain(r);}
  r.clients.get(p.token)?.end();r.clients.delete(p.token);
  r.players=r.players.filter(x=>x.id!==p.id);
  if(r.host===p.id)r.host=r.players[0]?.id||null;
  record(r,`${p.name} 退出房间`);
}
