import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
export function createAdminAuth({password='',now=()=>Date.now(),sessionMs=8*60*60*1000}={}){
  const configured=typeof password==='string'&&password.length>=12&&password.length<=256;
  const expected=digest(configured?password:'disabled');
  const sessions=new Map(),attempts=new Map();
  function prune(){const time=now();for(const [key,value] of sessions)if(value.expires<=time)sessions.delete(key);for(const [key,value] of attempts)if(value.until<=time)attempts.delete(key);}
  function login(candidate,address='unknown'){
    prune();if(!configured)return {status:503,error:'管理入口未启用，请配置至少 12 位的管理密码。'};
    const bucket=attempts.get(address);if(bucket?.count>=10)return {status:429,error:'尝试次数过多，请 10 分钟后再试。'};
    if(typeof candidate!=='string'||candidate.length>256||!timingSafeEqual(digest(candidate),expected)){
      if(!bucket){if(attempts.size>=1000)attempts.delete(attempts.keys().next().value);attempts.set(address,{count:1,until:now()+10*60*1000});}else bucket.count++;
      return {status:401,error:'管理密码不正确。'};
    }
    attempts.delete(address);if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
    const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
    sessions.set(digest(token).toString('hex'),{csrf,expires:now()+sessionMs});return {status:200,token,csrf};
  }
  function session(token){prune();return typeof token==='string'&&token.length<=128?sessions.get(digest(token).toString('hex')):undefined;}
  function logout(token){if(typeof token==='string')sessions.delete(digest(token).toString('hex'));}
  return {login,session,logout,configured};
}
