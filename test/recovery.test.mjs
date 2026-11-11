import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApplication} from '../application.mjs';

test('browser cookie recovers the original live seat without revealing another browser’s seats',async()=>{
  const app=createApplication();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const call=async(action,data={},cookie='')=>{const response=await fetch(base+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});return {response,body:await response.json()};};
  try{
    const a=await call('create',{name:'a',general:'张飞',room:'recover'}),cookie=a.response.headers.get('set-cookie').split(';')[0];
    assert.match(a.response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Max-Age=2592000/);
    const b=await call('join',{name:'b',general:'赵云',room:'recover'});
    await call('start',{room:'recover',token:a.body.token});
    const room=app.rooms.get('RECOVER'),p=room.players[0],hand=p.hand.map(c=>c.id),turn=room.turn;
    assert.equal((await call('recover')).body.seats.length,0);
    const seats=(await call('recover',{},cookie)).body.seats;
    assert.equal(seats.length,1);assert.equal(seats[0].id,p.id);assert.equal(seats[0].token,undefined);
    assert.equal((await call('recover',seats[0],b.response.headers.get('set-cookie').split(';')[0])).response.status,401);
    assert.equal((await call('recover',seats[0],'sgs_player=forged')).response.status,401);
    const recovered=await call('recover',seats[0],cookie);
    assert.equal(recovered.body.token,a.body.token);assert.equal(recovered.body.state.self,p.id);
    assert.deepEqual(recovered.body.state.hand.map(c=>c.id),hand);assert.equal(room.turn,turn);assert.equal(room.players.length,2);
    assert.equal(recovered.body.state.players[0].browserKey,undefined);
    const secure=await fetch(base+'/api/create',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https'},body:JSON.stringify({name:'secure',general:'关羽',room:'secure'})});assert.match(secure.headers.get('set-cookie'),/; Secure/);await secure.arrayBuffer();
    const abort=new AbortController(),events=await fetch(base+`/events?room=recover&token=${a.body.token}`,{signal:abort.signal});
    const first=JSON.parse(new TextDecoder().decode((await events.body.getReader().read()).value).split('data: ')[1].trim());assert.equal(first.players[0].connected,true);
    abort.abort();for(let i=0;i<100&&room.clients.has(p.token);i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(room.players.length,2);assert.equal(room.clients.has(p.token),false);
    assert.equal((await call('recover',seats[0],cookie)).response.status,200);
    assert.equal((await call('recover',seats[0],cookie)).body.state.players[0].connected,false);
    await call('leave',{room:'recover',token:a.body.token},cookie);
    assert.equal((await call('recover',{},cookie)).body.seats.length,0);assert.equal((await call('recover',seats[0],cookie)).response.status,401);
    app.rooms.clear();assert.equal((await call('recover',{},b.response.headers.get('set-cookie').split(';')[0])).body.seats.length,0);
    assert.equal((await fetch(base+'/api/recover',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://evil.example'},body:'{}'})).status,403);
  }finally{await app.stop();}
});
