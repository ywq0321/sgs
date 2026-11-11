import readline from 'node:readline';
import os from 'node:os';
import {definitions} from './public/catalog.js';
import {normalizeRoomCode} from './room-code.mjs';
import {admin} from './game.mjs';
export function handleHostCommand(context,line){
const {rooms,broadcast}=context;const [command,...args]=line.trim().split(/\s+/);const room=rooms.get(context.selected);
if(['quit','q','0','exit'].includes(command))return {quit:true,text:'正在关闭服务…'};
if(command==='help'||command==='menu'||command==='?')return {text:hostMenu(context)};
if(command==='rooms'||command==='1')return {text:[...rooms.values()].map(r=>`${r.code} | ${r.status} | ${r.players.length} 人 | ${r.mode}`).join('\n')||'暂无房间。先在网页创建房间。'};
if(command==='use'||command==='2'){const key=normalizeRoomCode(args[0]);if(!rooms.has(key))throw Error('找不到口令码对应的房间');context.selected=key;return {text:players(rooms.get(context.selected))};}
if(command==='players')return {text:room?players(room):'先输入 use 口令码'};
if(command==='sudo'||command==='3'){context.sudo=!context.sudo;return {text:hostMenu(context)};}
if(command==='back'){context.sudo=false;return {text:hostMenu(context)};}
if(command==='cards')return {text:definitions.map((c,i)=>`${i+1}. ${c.name}`).join('\n')};
if(!context.sudo)throw Error('管理操作请先输入 sudo，进入作弊菜单');if(!room)throw Error('请先输入 use 口令码');
const seat=Number(args[0]),p=room.players[seat-1];
if(command==='hp')admin(room,'hp',{player:p?.id,value:args[1]});
else if(command==='give'){const c=definitions[Number(args[1])-1]||definitions.find(c=>c.name===args[1]);admin(room,'give',{player:p?.id,card:c?.name,count:args[2]||1});}
else if(command==='kick')admin(room,'kick',{player:p?.id});
else if(['skip','finish','reset'].includes(command))admin(room,command);
else throw Error('未知命令。输入 help 查看菜单');broadcast(room);return {text:'操作已执行，并记入战局日志。\n'+players(room)};
}
function players(r){return `房间 ${r.code}（${r.status}）\n`+r.players.map((p,i)=>`${i+1}. ${p.name} | ${p.general} | ${p.hp}/${p.maxHp} HP | 手牌 ${p.hand.length} | ${p.alive?'存活':'阵亡'}${p.id===r.turn?' | 当前回合':''}`).join('\n');}
export function hostMenu(c){return c.sudo?`\n[SUDO 作弊菜单] 当前房间：${c.selected||'未选择'}\nuse 口令码       选择房间\nplayers          查看座位编号\ncards            查看可发卡牌编号\nhp 座位 血量     修改体力（1～体力上限）\ngive 座位 牌编号 数量   发牌（数量默认 1）\nskip             清除响应并跳至下一回合\nfinish           强制结束本局\nreset            重置为等待状态\nkick 座位        踢出玩家\nback             返回主菜单\nquit / 0         关闭服务器\n`:`\n[三国杀 · 房主终端]\n1 / rooms        查看所有房间\n2 口令码 / use 口令码   选择房间\nplayers          查看玩家与体力\n3 / sudo         打开作弊菜单\nhelp             显示菜单\n0 / quit         关闭服务器\n`;
}
export function startHostTui({rooms,broadcast,shutdown,port}){
const context={rooms,broadcast,selected:null,sudo:false};
const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>`http://${x.address}:${port}`);
console.log(`\n三国杀服务器\n本机：http://localhost:${port}\n网络地址：${addresses.join('  ')||'未发现，请检查虚拟网络'}\n${hostMenu(context)}`);
const rl=readline.createInterface({input:process.stdin,output:process.stdout,prompt:'host> '});rl.prompt();
rl.on('line',line=>{try{const result=handleHostCommand(context,line);console.log(result.text);if(result.quit){rl.close();shutdown();return;}}catch(e){console.log(`操作失败：${e.message}`);}rl.setPrompt(context.sudo?'sudo> ':'host> ');rl.prompt();});
rl.on('SIGINT',()=>{rl.close();shutdown();});return rl;
}
