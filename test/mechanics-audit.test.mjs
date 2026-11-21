import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,join,act,makeCard,snapshot} from '../game.mjs';
import {responseAs} from '../public/response-rules.js';
function setup(...generals){const r=createRoom('audit'),ps=generals.map((general,i)=>join(r,`p${i}`,general));r.status='playing';r.turn=ps[0].id;r.deck=Array.from({length:60},()=>makeCard('桃'));return [r,...ps];}
function give(p,...names){return p.hand=names.map(makeCard);}
function play(r,p,c,...targets){act(r,p,'play',{cards:[c.id],targets:targets.map(p=>p.id)});}
function answer(r,p,c,extra={}){act(r,p,'respond',{...(c?{cards:[c.id]}:{pass:true}),promptId:r.pending.id,...extra});}

test('Zhao Yun automatically uses slash as dodge against slash and arrows, and dodge as slash in duel',()=>{
  const [r,a,z]=setup('张飞','赵云');const [slash,arrows,duel]=give(a,'杀','万箭齐发','决斗'),[s1,s2,dodge]=give(z,'杀','杀','闪');
  play(r,a,slash,z);answer(r,z,s1);assert.equal(z.hp,4);
  play(r,a,arrows);answer(r,z,s2);assert.equal(z.hp,4);
  play(r,a,duel,z);answer(r,z,dodge);assert.equal(r.pending.responder,a.id);answer(r,a);assert.equal(a.hp,3);
});
test('automatic conversion still rejects an unrelated card without spending it or losing the prompt',()=>{
  const [r,a,z]=setup('张飞','赵云'),[slash]=give(a,'杀'),[peach]=give(z,'桃');play(r,a,slash,z);const id=r.pending.id;
  assert.throws(()=>answer(r,z,peach),/需要/);assert.equal(r.pending.id,id);assert.equal(z.hand[0].id,peach.id);assert.equal(z.hp,4);
});
test('Wushuang requires two separately converted Longdan dodges',()=>{
  const [r,a,z]=setup('吕布','赵云'),[slash]=give(a,'杀'),[s1,s2]=give(z,'杀','杀');play(r,a,slash,z);answer(r,z,s1);assert.equal(r.pending.need,1);answer(r,z,s2);assert.equal(r.pending,null);assert.equal(z.hp,4);
});
test('Bagua may judge once for each of the two Wushuang dodges',()=>{
  const [r,a,b]=setup('吕布','张飞'),[slash]=give(a,'杀');b.equipment.armor=makeCard('八卦阵');r.deck.push({...makeCard('桃'),suit:'♥'},{...makeCard('桃'),suit:'♦'});
  play(r,a,slash,b);answer(r,b,null,{pass:false,option:'armor'});assert.equal(r.pending.need,1);assert.ok(r.pending.options.some(x=>x.id==='armor'));answer(r,b,null,{pass:false,option:'armor'});assert.equal(r.pending,null);assert.equal(b.hp,4);
});
test('all nullification holders can respond; pass applies only to that player and stale requests cannot affect the next link',()=>{
  const [r,a,b,c]=setup('张飞','张飞','张飞'),[scroll]=give(a,'无中生有'),[w1]=give(b,'无懈可击'),[w2]=give(c,'无懈可击');play(r,a,scroll);const first=r.pending.id;
  assert.deepEqual(new Set(r.pending.responders),new Set([b.id,c.id]));answer(r,b);answer(r,c,w2);assert.equal(r.pending.cancelled,true);assert.notEqual(r.pending.id,first);
  assert.throws(()=>act(r,b,'respond',{pass:true,promptId:first}),/响应已更新/);answer(r,b,w1);assert.equal(r.pending,null);assert.equal(a.hand.length,2);
});
test('three nullifications cancel, two restore; each link has a new prompt ID and eligible players may act again',()=>{
  const [r,a,b]=setup('张飞','张飞'),[scroll]=give(a,'无中生有'),[w1,w2,w3]=give(b,'无懈可击','无懈可击','无懈可击');play(r,a,scroll);
  const ids=[];for(const w of [w1,w2,w3]){ids.push(r.pending.id);answer(r,b,w);}assert.equal(new Set(ids).size,3);assert.equal(r.pending,null);assert.equal(a.hand.length,0);assert.match(r.log[0].message,/抵消/);
});
test('nullification does not disclose other players’ eligibility or hidden cards',()=>{
  const [r,a,b,c]=setup('张飞','张飞','张飞'),[scroll]=give(a,'无中生有');give(b,'无懈可击');give(c,'无懈可击');play(r,a,scroll);
  assert.deepEqual(snapshot(r,a.token).pending.responders,[]);assert.deepEqual(snapshot(r,b.token).pending.responders,[b.id]);assert.equal(snapshot(r,a.token).pending.responder,null);assert.equal(snapshot(r,b.token).players.find(p=>p.id===c.id).hand,undefined);
});
test('Jizhi resolves before reopening the counter window, including a newly drawn nullification',()=>{
  const [r,a,b]=setup('张飞','黄月英'),[scroll]=give(a,'无中生有'),[w]=give(b,'无懈可击');r.deck.push(makeCard('无懈可击'));play(r,a,scroll);answer(r,b,w);assert.equal(r.pending.skill,'jizhi');answer(r,b,null,{pass:false});assert.equal(r.pending.type,'counter');assert.equal(r.pending.cancelled,true);answer(r,b);assert.equal(r.pending,null);assert.equal(a.hand.length,0);
});
test('area nullification cancels one target, not all remaining targets',()=>{
  const [r,a,b,c]=setup('张飞','张飞','张飞'),[arrows]=give(a,'万箭齐发'),[w]=give(b,'无懈可击');play(r,a,arrows);answer(r,b,w);assert.equal(r.pending.responder,c.id);answer(r,c);assert.equal(b.hp,4);assert.equal(c.hp,3);
});
test('delayed tricks are countered at judgment, not when placed',()=>{
  const [r,a,b]=setup('张飞','张飞'),[le]=give(a,'乐不思蜀'),[w]=give(b,'无懈可击');play(r,a,le,b);assert.equal(r.pending,null);assert.equal(b.judgments.length,1);act(r,a,'end');assert.equal(r.pending.type,'counter');answer(r,b,w);assert.equal(b.judgments.length,0);assert.equal(r.phase,'play');assert.equal(r.turn,b.id);assert.ok(r.discard.some(c=>c.id===le.id));
});
test('Liuli redirected slash checks the new target’s Renwang shield',()=>{
  const [r,a,d,b]=setup('张飞','大乔','张飞'),[slash]=give(a,'杀'),[cost]=give(d,'闪');slash.suit='♠';b.equipment.armor=makeCard('仁王盾');play(r,a,slash,d);answer(r,d,cost,{targets:[b.id]});assert.equal(r.pending,null);assert.equal(b.hp,4);
});
test('consuming crossbow through Wusheng cannot provide an extra slash',()=>{
  const [r,a,b]=setup('关羽','张飞'),[slash]=give(a,'杀');a.equipment.weapon={...makeCard('诸葛连弩'),suit:'♥'};play(r,a,slash,b);answer(r,b);const bow=a.equipment.weapon;
  assert.throws(()=>act(r,a,'play',{cards:[bow.id],as:'杀',targets:[b.id]}),/次数/);assert.equal(a.equipment.weapon.id,bow.id);
});
test('single-card conversions retain their actual suit',()=>{
  const [r,a,b]=setup('关羽','张飞'),[c]=give(a,'桃');c.suit='♦';act(r,a,'play',{cards:[c.id],as:'杀',targets:[b.id]});assert.equal(r.pending.card.suit,'♦');
});
test('shared response eligibility supports Longdan, Qingguo, Wusheng, Jijiu and Zhangba',()=>{
  const slash=makeCard('杀'),dodge=makeCard('闪'),red={...makeCard('桃'),suit:'♦'},black={...makeCard('桃'),suit:'♠'};
  assert.equal(responseAs('赵云','闪',[slash]),'闪');assert.equal(responseAs('赵云','杀',[dodge]),'杀');assert.equal(responseAs('甄姬','闪',[black]),'闪');assert.equal(responseAs('关羽','杀',[red]),'杀');assert.equal(responseAs('华佗','桃',[red],{},[red.id],true),'');
  const redSlash={...slash,suit:'♥'};assert.equal(responseAs('华佗','桃',[redSlash],{},[slash.id],true),null);assert.equal(responseAs('华佗','桃',[redSlash]),'桃');assert.equal(responseAs('张飞','杀',[red,black],{weapon:{name:'丈八蛇矛'}}),'杀');assert.equal(responseAs('张飞','闪',[slash]),null);
});
test('social actions work during a response without changing the hand, turn or pending; payloads and rate are bounded',()=>{
  const [r,a,b]=setup('张飞','赵云'),[slash]=give(a,'杀');play(r,a,slash,b);const pending=r.pending;
  act(r,b,'social',{phrase:0});assert.equal(r.pending,pending);assert.match(snapshot(r,a.token).social[0].text,/花都谢了/);assert.equal(r.turn,a.id);assert.throws(()=>act(r,b,'social',{phrase:0}),/歇/);
  b.lastSocial=0;act(r,b,'social',{prop:'tomato',target:a.id});assert.equal(r.social[1].emoji,'🍅');b.lastSocial=0;assert.throws(()=>act(r,b,'social',{prop:'script',target:a.id}));assert.throws(()=>act(r,b,'social',{prop:'coffee',target:b.id}));assert.throws(()=>act(r,b,'social',{phrase:99}));
});

test('Tiandu obtains a Bagua judgment before the slash continues',()=>{
  const [r,a,b]=setup('张飞','郭嘉'),[slash]=give(a,'杀');b.equipment.armor=makeCard('八卦阵');const judgment={...makeCard('桃'),suit:'♥'};r.deck.push(judgment);play(r,a,slash,b);answer(r,b,null,{pass:false,option:'armor'});
  assert.equal(r.pending.skill,'tiandu');answer(r,b,null,{pass:false});assert.ok(b.hand.some(c=>c.id===judgment.id));assert.equal(b.hp,3);assert.equal(r.pending,null);
});
test('an area trick continues resolving after Ganglie kills its source; the next turn starts after resolution',()=>{
  const [r,a,b,c]=setup('张飞','夏侯惇','张飞'),[nan]=give(a,'南蛮入侵');a.hp=1;r.deck.push({...makeCard('桃'),suit:'♣'});play(r,a,nan);answer(r,b);assert.equal(r.pending.skill,'ganglie');answer(r,b,null,{pass:false});assert.equal(r.pending.type,'ganglie');answer(r,a);
  let steps=0;while(r.pending&&steps++<20)answer(r,r.players.find(p=>p.id===r.pending.responder));
  assert.equal(r.pending,null);assert.equal(a.alive,false);assert.equal(c.hp,3);assert.equal(r.turn,b.id);assert.equal(r.status,'playing');
});
