import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('HTTP room lifecycle, more than four players, SSE private state and local art',async()=>{
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3127'},stdio:['ignore','pipe','pipe']});
try{await once(child.stdout,'data');const post=async(action,body)=>{const r=await fetch(`http://localhost:3127/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
assert.equal((await post('create',{name:'无武将'})).status,400);assert.equal((await post('create',{name:'非法武将',general:'不存在'})).status,400);
const a=await post('create',{name:'甲',general:'张飞'});assert.equal(a.status,200);assert.equal(a.state.status,'lobby');const room=a.state.code;let b;
for(let i=0;i<7;i++)b=await post('join',{room,name:`朋友${i}`,general:"关羽"});assert.equal(b.state.players.length,8);assert.equal((await post('start',{room,token:b.token})).status,400);
assert.equal((await post('start',{room,token:a.state.self})).status,401);
const started=await post('start',{room,token:a.token});assert.equal(started.state.hand.length,6);assert.ok(started.state.players.every(p=>!('hand' in p)));assert.equal((await post('join',{room,name:'late',general:'张飞'})).status,400);
const controller=new AbortController();const events=await fetch(`http://localhost:3127/events?room=${room}&token=${b.token}`,{signal:controller.signal});const reader=events.body.getReader();const {value}=await reader.read();const state=JSON.parse(new TextDecoder().decode(value).split('data: ')[1].trim());assert.equal(state.self,b.state.self);assert.equal(state.hand.length,4);assert.notEqual(state.hand[0].id,started.state.hand[0].id);controller.abort();
for(const asset of ['/','/app.js','/display-mode.js','/style.css','/art/slash.svg','/art/dodge.svg','/art/peach.svg','/art/scroll.svg','/art/duel.svg','/art/crossbow.svg'])assert.equal((await fetch(`http://localhost:3127${asset}`)).status,200);
assert.equal((await fetch('http://localhost:3127/art/../../server.mjs')).status,404);assert.equal((await fetch('http://localhost:3127/_preview/mobile')).status,404);
assert.equal((await post('leave',{room,token:b.token})).left,true);assert.equal((await post('leave',{room,token:a.token})).left,true);const guest=await post('create',{name:'退出测试',general:'诸葛亮'});assert.equal(guest.state.players[0].general,'诸葛亮');assert.equal(guest.state.players[0].hp,3);assert.equal((await post('leave',{room:guest.state.code,token:guest.token})).left,true);assert.equal((await post('join',{room:guest.state.code,name:'已清空',general:'张飞'})).status,400);
}finally{child.kill();await once(child,'exit');}
});
