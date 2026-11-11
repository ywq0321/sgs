import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomInt} from 'node:crypto';
import {generals} from './public/catalog.js';
import {createRoom,join,snapshot,act,record,leave,admin} from './game.mjs';
import {createAdminAuth} from './admin-auth.mjs';
import {normalizeRoomCode} from './room-code.mjs';

function json(res,status,body,headers={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store',...headers});res.end(JSON.stringify(body));
}
async function readJson(req){
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Object.assign(Error('请使用 JSON 请求'),{status:415});
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>10000)throw Object.assign(Error('请求过大'),{status:413});}
  try{return JSON.parse(body||'{}');}catch{throw Error('请求内容无效');}
}
function cookieToken(req){for(const pair of String(req.headers.cookie||'').split(';')){const [name,...value]=pair.trim().split('=');if(name==='sgs_admin')return value.join('=');}return '';}
function sameOrigin(req){
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  if(!req.headers.origin)return true;
  try{const origin=new URL(req.headers.origin);const hosts=[req.headers.host,...[process.env.URL,process.env.DEPLOY_PRIME_URL].filter(Boolean).map(value=>new URL(value).host)];return hosts.includes(origin.host)&&['https:','http:'].includes(origin.protocol);}catch{return false;}
}
function sessionCookie(req,value,maxAge=8*60*60){
  const secure=!!req.socket.encrypted||req.headers['x-forwarded-proto']==='https'||process.env.NETLIFY==='true';
  return `sgs_admin=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
}
export function createApplication({adminPassword=process.env.ADMIN_PASSWORD||'',clock,publicDirectory=new URL('./public/',import.meta.url)}={}){
  const rooms=new Map(),auth=createAdminAuth({password:adminPassword,...(clock?{now:clock}:{})});
  function broadcast(room){for(const [token,res]of room.clients)res.write(`data: ${JSON.stringify(snapshot(room,token))}\n\n`);}
  function closeRoom(room){record(room,'[admin] 管理员关闭了房间');for(const res of room.clients.values()){res.write('event: room-closed\ndata: {}\n\n');res.end();}room.clients.clear();rooms.delete(room.code);}
  const roomSummary=room=>({code:room.code,status:room.status,mode:room.mode,round:room.round,turn:room.turn,host:room.host,log:room.log.slice(0,30),players:room.players.map(p=>({id:p.id,name:p.name,general:p.general,hp:p.hp,maxHp:p.maxHp,alive:p.alive,count:p.hand.length,equipment:Object.values(p.equipment||{}).map(c=>c.name)}))});
  async function adminRequest(req,res,url){
    if(req.method!=='GET'&&req.method!=='POST'){json(res,405,{error:'不支持的操作'});return;}
    if(req.method==='POST'&&!sameOrigin(req)){json(res,403,{error:'不允许跨站管理请求'});return;}
    const token=cookieToken(req);
    if(url.pathname==='/api/admin/login'&&req.method==='POST'){
      const data=await readJson(req);
      // Use the transport address rather than a client-controlled forwarding header.
      const address=String(req.socket.remoteAddress||'unknown').slice(0,100);
      const result=auth.login(data.password,address);
      if(result.status!==200){json(res,result.status,{error:result.error},result.status===429?{'Retry-After':'600'}:{});return;}
      json(res,200,{authenticated:true,csrf:result.csrf},{'Set-Cookie':sessionCookie(req,result.token)});return;
    }
    const session=auth.session(token);
    if(!session){json(res,401,{error:'请先登录管理页面'});return;}
    if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf){json(res,403,{error:'登录已失效，请刷新页面后重试'});return;}
    if(url.pathname==='/api/admin/session'&&req.method==='GET'){json(res,200,{authenticated:true,csrf:session.csrf});return;}
    if(url.pathname==='/api/admin/logout'&&req.method==='POST'){auth.logout(token);json(res,200,{ok:true},{'Set-Cookie':sessionCookie(req,'',0)});return;}
    if(url.pathname==='/api/admin/rooms'&&req.method==='GET'){json(res,200,{rooms:[...rooms.values()].map(roomSummary)});return;}
    if(url.pathname==='/api/admin/action'&&req.method==='POST'){
      const data=await readJson(req),room=rooms.get(normalizeRoomCode(data.room));if(!room){json(res,404,{error:'房间已关闭，请刷新列表'});return;}
      if(data.command==='close')closeRoom(room);
      else if(['hp','give','skip','finish','reset','kick'].includes(data.command)){admin(room,data.command,{player:data.player,value:data.value,card:data.card,count:data.count});broadcast(room);if(!room.players.length)closeRoom(room);}
      else{json(res,400,{error:'不支持的管理操作'});return;}
      json(res,200,{ok:true});return;
    }
    json(res,404,{error:'找不到管理接口'});
  }
  const server=http.createServer(async(req,res)=>{
    try{
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/admin')){res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");}
      if(url.pathname.startsWith('/api/admin/')){await adminRequest(req,res,url);return;}
      if(url.pathname==='/events'){
        let key;try{key=normalizeRoomCode(url.searchParams.get('room'));}catch{json(res,404,{error:'找不到房间'});return;}
        const room=rooms.get(key),token=url.searchParams.get('token');
        if(!room?.players.some(p=>p.token===token)){json(res,404,{error:'房间已结束，请重新加入'});return;}
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Netlify-CDN-Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.flushHeaders();room.clients.get(token)?.end();room.clients.set(token,res);
        res.write(`data: ${JSON.stringify(snapshot(room,token))}\n\n`);
        const timer=setInterval(()=>res.write(': ping\n\n'),20000);
        res.on('close',()=>{clearInterval(timer);if(room.clients.get(token)===res)room.clients.delete(token);});return;
      }
      if(url.pathname==='/api/room-session'&&req.method==='GET'){
        let room;try{room=rooms.get(normalizeRoomCode(url.searchParams.get('room')));}catch{}
        const active=room?.players.some(p=>p.token===url.searchParams.get('token'));
        json(res,active?200:404,{active:!!active});return;
      }
      if(url.pathname.startsWith('/api/')){
        if(req.method!=='POST'){json(res,405,{error:'不支持的操作'});return;}
        if(!sameOrigin(req)){json(res,403,{error:'不允许跨站请求'});return;}
        const data=await readJson(req),action=url.pathname.slice(5);let room,p;
        if(['create','join'].includes(action)&&!generals.some(g=>g.name===data.general))throw Error('请先选择武将');
        if(action==='create'){
          let code;if(typeof data.room==='string'&&data.room.trim())code=normalizeRoomCode(data.room);
          else if(data.room!==undefined&&typeof data.room!=='string')throw Error('口令码格式不正确');
          else do{code=randomInt(100000,1000000).toString();}while(rooms.has(code));
          if(rooms.has(code)){json(res,409,{error:'口令码已被使用，请换一个'});return;}
          room=createRoom(code);p=join(room,data.name,data.general);rooms.set(code,room);
        }else{
          room=rooms.get(normalizeRoomCode(data.room));
          if(!room)throw Object.assign(Error(action==='join'?'找不到这个口令码对应的房间':'房间已结束，请重新加入'),{status:action==='join'?400:410});
          if(action==='join')p=join(room,data.name,data.general);
          else{
            p=room.players.find(p=>p.token===data.token);if(!p)throw Object.assign(Error('请重新加入房间'),{status:401});
            if(action==='leave'){leave(room,p);broadcast(room);if(!room.players.length)rooms.delete(room.code);json(res,200,{left:true});return;}
            act(room,p,action,data);
          }
        }
        broadcast(room);json(res,200,{token:p.token,state:snapshot(room,p.token)});return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
      const files={'/':'index.html','/app.js':'app.js','/display-mode.js':'display-mode.js','/style.css':'style.css','/catalog.js':'catalog.js','/admin':'admin.html','/admin/':'admin.html','/admin.html':'admin.html','/admin.js':'admin.js','/admin.css':'admin.css'};
      let file=files[url.pathname];if(/^\/art\/[a-z-]+\.svg$/.test(url.pathname))file=url.pathname.slice(1);
      if(!file){res.writeHead(404);res.end('Not found');return;}
      let buffer;try{buffer=await readFile(new URL(file,publicDirectory));}catch(error){if(error.code==='ENOENT'){res.writeHead(404);res.end('Not found');return;}throw error;}
      res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':file.startsWith('admin')?'no-store':'no-cache'});res.end(req.method==='HEAD'?undefined:buffer);
    }catch(error){if(!res.headersSent)json(res,error.status||400,{error:error.message});else res.end();}
  });
  async function stop(){for(const room of rooms.values())for(const client of room.clients.values())client.end();const stopped=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await stopped;}
  return {server,rooms,broadcast,closeRoom,stop};
}
