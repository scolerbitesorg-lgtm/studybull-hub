// Telegram channel join gate core. Access follows the Telegram account (not the physical phone).
import crypto from 'node:crypto';
import {get,put} from '@vercel/blob';
const mem=new Map(); // used only when GATE_MEM=1 (local tests)
export const cfg=()=>({
  token:process.env.GATE_BOT_TOKEN||'',
  channel:process.env.GATE_CHANNEL_ID||'',
  link:process.env.GATE_CHANNEL_LINK||'',
  bot:(process.env.GATE_BOT_USERNAME||'').replace(/^@/,''),
  secret:process.env.GATE_WEBHOOK_SECRET||'',
  api:process.env.GATE_TG_API||'https://api.telegram.org',
  recheck:Number(process.env.GATE_RECHECK_SECONDS)||300,
  maxDevices:Number(process.env.GATE_MAX_DEVICES)||3,
  site:(process.env.GATE_SITE_URL||'').replace(/\/$/,'')
});
export const enabled=()=>{const c=cfg();return Boolean(c.token&&c.channel&&c.bot&&c.secret)};
export async function rd(k){if(process.env.GATE_MEM)return mem.has(k)?JSON.parse(mem.get(k)):null;const r=await get(k,{access:'private',useCache:false});if(!r)return null;try{return JSON.parse(await new Response(r.stream).text())}catch{return null}}
export async function wr(k,v){if(process.env.GATE_MEM){mem.set(k,JSON.stringify(v));return}await put(k,JSON.stringify(v),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:0})}
export const now=()=>Math.floor(Date.now()/1000);
export const okId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{20,64}$/.test(s);
export const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,40);
export async function tg(method,body){const c=cfg();const r=await fetch(`${c.api}/bot${c.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});return r.json()}
export async function tgDoc(chat,filename,text,caption){const c=cfg();const fd=new FormData();fd.append('chat_id',String(chat));if(caption)fd.append('caption',caption);fd.append('document',new Blob([text],{type:'text/csv'}),filename);const r=await fetch(`${c.api}/bot${c.token}/sendDocument`,{method:'POST',body:fd,signal:AbortSignal.timeout(15000)});return r.json()}
export const isM=st=>['creator','administrator','member'].includes(st.status)||(st.status==='restricted'&&st.is_member===true);
export async function isMemberIn(userId,chat){const j=await tg('getChatMember',{chat_id:chat,user_id:userId});if(!j.ok)return {ok:false,err:j.description||'telegram error'};return {ok:true,member:isM(j.result)}}
// the gate requires every channel: the main one (env) plus any added by the admin
export async function channels(){const st=await settings();return [{id:cfg().channel,name:process.env.GATE_CHANNEL_NAME||'Channel',link:cfg().link,primary:true},...(st.channels||[])]}
export async function isMember(userId){const chs=await channels();const rs=await Promise.all(chs.map(c=>isMemberIn(userId,c.id)));
  const bad=rs.find(r=>!r.ok);if(bad)return {ok:false,err:bad.err};const missing=chs.filter((c,k)=>!rs[k].member);return {ok:true,member:missing.length===0,missing}}
export const ukey=tgid=>`gate/user-${tgid}.json`, dkey=d=>`gate/dev-${hash(d)}.json`, pkey=c=>`gate/pending-${c}.json`, ckey=h=>`gate/code-${h}.json`;
export const SET='gate/settings.json',IDX='gate/index.json',LOG='gate/log.json',OWN='gate/owner.json',STATE='gate/state.json';
let _st=null,_stT=0; // short cache: the admin panel and every gate check read settings
export const settings=async()=>{if(_st&&Date.now()-_stT<4000)return _st;const v=(await rd(SET))||{};_st=v;_stT=Date.now();return v};
export const saveSettings=async v=>{await wr(SET,v);_st=v;_stT=Date.now()};
export async function logEv(k,id,n){const l=(await rd(LOG))||{e:[]};l.e.push({t:now(),k,id,n:n||''});l.e=l.e.slice(-200);await wr(LOG,l)}
// index of users who interacted with the bot or joined through the gate
export async function touch(from,extra){if(!from||!from.id)return;const x=(await rd(IDX))||{u:{}};const o=x.u[from.id]||{at:now()};
  x.u[from.id]={...o,n:[from.first_name,from.last_name].filter(Boolean).join(' ').slice(0,40)||o.n||'',un:from.username||o.un||'',seen:now(),...(extra||{})};await wr(IDX,x)}
// one-time access link: binds to the first browser that opens it (or to a browser given up front), 24h
const alk=c=>`gate/al-${hash(c)}.json`;
export async function deviceLink(tg,dev){const c=String(tg)+'.'+crypto.randomBytes(24).toString('base64url'); // link = user id + long random token, bound to one device
  await wr(alk(c),{tg,dev:okId(dev)?hash(dev):null,exp:now()+86400});return c}
export async function userCode(tgid,rotate,from){
  if(from)await touch(from);
  let u=(await rd(ukey(tgid)))||{tg:tgid,devices:{}};
  if(!u.code||rotate){if(u.code)await wr(ckey(hash(u.code)),{tg:tgid,off:true});u.code=crypto.randomBytes(18).toString('base64url');await wr(ckey(hash(u.code)),{tg:tgid})}
  u.member=true;u.checkedAt=now();await wr(ukey(tgid),u);return u.code}
export async function linkDevice(tgid,dev,maxD){
  const u=(await rd(ukey(tgid)))||{tg:tgid,devices:{}};u.member=true;u.checkedAt=now();u.devices=u.devices||{};u.devices[hash(dev)]=now();
  const ids=Object.keys(u.devices).sort((a,b)=>u.devices[b]-u.devices[a]);for(const old of ids.slice(maxD||cfg().maxDevices))delete u.devices[old];
  await wr(ukey(tgid),u);await wr(dkey(dev),{tg:tgid,at:now()});return u}
async function inviteFor(dev,origin){
  const k=`gate/pj-${hash(dev)}.json`;const p=await rd(k);if(p&&p.exp>now()+900&&p.origin===(origin||''))return p.link;
  const j=await tg('createChatInviteLink',{chat_id:cfg().channel,name:('d'+hash(dev)).slice(0,16),expire_date:now()+86400,member_limit:1});
  if(!j.ok)return '';const link=j.result.invite_link;await wr(k,{link,origin:origin||'',exp:now()+86400});await wr(`gate/inv-${hash(link)}.json`,{dev,origin:origin||'',exp:now()+86400});return link}
export const invDevice=async link=>{const v=await rd(`gate/inv-${hash(link)}.json`);return v&&v.exp>now()?v:null};
export async function start(dev,origin){if(!okId(dev))throw Error('bad device');const code=crypto.randomBytes(9).toString('base64url');await wr(pkey(code),{dev,origin:origin||'',exp:now()+900});
  let join='';try{join=await inviteFor(dev,origin)}catch{}
  return {code,url:`https://t.me/${cfg().bot}?start=${code}`,join}}
export async function check(dev,sid,noSess,sig){
  if(!okId(dev))return {ok:false,reason:'none'};
  const d=await rd(dkey(dev));if(!d)return {ok:false,reason:'none'};
  const u=await rd(ukey(d.tg));if(!u)return {ok:false,reason:'none'};
  if(!u.devices||!u.devices[hash(dev)])return {ok:false,reason:'device'};
  if(u.banned)return {ok:false,reason:'banned'};
  if(u.removed)return {ok:false,reason:'removed'};
  if(u.member===false)return {ok:false,reason:'left'};
  if((await settings()).paused)return {ok:true};
  if(now()-(u.checkedAt||0)>cfg().recheck){
    const m=await isMember(d.tg);
    if(m.ok){u.member=m.member;u.checkedAt=now();await wr(ukey(d.tg),u);if(!m.member)return {ok:false,reason:'left'}}
    else return {ok:false,reason:'error'}; // fail closed
  }
  if(!noSess&&(await settings()).mode==='every'&&!(await hasGrant(dev,sid)))return {ok:false,reason:'session'};
  if(sig&&(await settings()).match===true)await noteSig(d,dev,sig).catch(()=>{}); // collect only while an admin has recognition ON
  return {ok:true};
}
// Device recognition: a browser that linked once leaves a signature (device fingerprint + network prefix).
// Another browser on the same phone and network with the same signature can be recognised without the bot.
const sigk=sig=>`gate/sig-${hash('sig|'+sig)}.json`;
async function noteSig(d,dev,sig){if(d.sg===sig&&now()-(d.sgAt||0)<259200)return;
  const k=sigk(sig);const e=(await rd(k))||{t:[]};const t=[d.tg,...(e.t||[]).filter(x=>x!==d.tg)].slice(0,5);
  await Promise.all([wr(k,{t,at:now()}),wr(dkey(dev),{...d,sg:sig,sgAt:now()})])}
export async function recognize(dev,sid,sig,maxD){
  if(!okId(dev)||!sig)return {ok:false,reason:'none'};
  if((await settings()).match!==true)return {ok:false,reason:'off'};
  const e=await rd(sigk(sig));if(!e||!e.t||!e.t.length||now()-(e.at||0)>2592000)return {ok:false,reason:'norecognize'};
  const good=[];
  for(const tgid of e.t){const u=await rd(ukey(tgid));if(!u||u.banned||u.removed)continue;const m=await isMember(tgid);if(m.ok&&m.member)good.push(tgid)}
  if(good.length!==1)return {ok:false,reason:good.length?'ambiguous':'norecognize'};
  await linkDevice(good[0],dev,maxD);
  if(okId(sid))await wr(gkey(dev,sid),{exp:now()+43200});
  const d=await rd(dkey(dev));if(d)await wr(dkey(dev),{...d,sg:sig,sgAt:now()});
  return {ok:true}}
const gkey=(dev,sid)=>`gate/sess-${hash(dev+':'+sid)}.json`;
async function hasGrant(dev,sid){if(!okId(sid))return false;const g=await rd(gkey(dev,sid));return !!(g&&g.exp>now())}
// "every visit" mode: one grant per page load (session id), lasts 12h so other open tabs keep working
export async function grant(dev,sid){const c=await check(dev,sid,true);if(!c.ok)return c;if(!okId(sid))return {ok:false,reason:'none'};await wr(gkey(dev,sid),{exp:now()+43200});return {ok:true}}
// Telegram Login widget data (signed with the bot token)
export function verifyLogin(u){
  if(!u||typeof u!=='object'||!u.hash||!u.id||!u.auth_date)return null;
  const keys=Object.keys(u).filter(k=>k!=='hash'&&u[k]!=null&&typeof u[k]!=='object').sort();
  const str=keys.map(k=>k+'='+u[k]).join('\n');
  const secret=crypto.createHash('sha256').update(cfg().token).digest();
  const mac=crypto.createHmac('sha256',secret).update(str).digest('hex');
  const a=Buffer.from(mac),b=Buffer.from(String(u.hash));
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  if(now()-Number(u.auth_date)>86400)return null;
  return {id:Number(u.id),first_name:u.first_name,last_name:u.last_name,username:u.username}}
export async function loginDevice(dev,sid,user){
  const v=verifyLogin(user);if(!v)return {ok:false,reason:'badlogin'};
  if(!okId(dev))return {ok:false,reason:'none'};
  const u0=await rd(ukey(v.id));if(u0&&u0.banned)return {ok:false,reason:'banned'};
  const m=await isMember(v.id);if(!m.ok)return {ok:false,reason:'error'};if(!m.member)return {ok:false,reason:'notmember'};
  if(u0&&u0.removed)return {ok:false,reason:'removed'};
  await touch(v);await userCode(v.id,false);await linkDevice(v.id,dev);
  if(okId(sid))await wr(gkey(dev,sid),{exp:now()+43200});
  return {ok:true}}
export async function redeem(dev,code,maxD,sid,fp){
  if(!okId(dev)||typeof code!=='string'||!/^[A-Za-z0-9_.-]{20,80}$/.test(code))return {ok:false,reason:'none'};
  let c=await rd(alk(code)),one=false;
  if(c){one=true;if(!code.startsWith(String(c.tg)+'.'))return {ok:false,reason:'badcode'};if(c.exp<=now())return {ok:false,reason:'expired'};if(!/^[a-z0-9]{8,40}$/.test(fp||''))return {ok:false,reason:'otherdevice'};if(c.fp&&c.fp!==hash(fp))return {ok:false,reason:'otherdevice'}}
  else c=await rd(ckey(hash(code)));
  if(!c||c.off)return {ok:false,reason:'badcode'};
  const bu=await rd(ukey(c.tg));if(bu&&bu.banned)return {ok:false,reason:'banned'};if(bu&&bu.removed)return {ok:false,reason:'removed'};
  const m=await isMember(c.tg);if(!m.ok)return {ok:false,reason:'error'};if(!m.member)return {ok:false,reason:'left'};
  await linkDevice(c.tg,dev,maxD);if(one&&!c.fp)await wr(alk(code),{...c,fp:hash(fp),usedAt:now()});if(okId(sid))await wr(gkey(dev,sid),{exp:now()+43200});return {ok:true}}
export async function claimCode(){const o=await rd(OWN);if(o&&o.id)return {error:'owner already set'};const code=crypto.randomBytes(6).toString('hex');await wr('gate/claim.json',{h:hash(code),exp:now()+86400});return {code}}
export async function setup(base){const c=cfg();return tg('setWebhook',{url:base+'/api/gate?action=hook',secret_token:c.secret,allowed_updates:['message','chat_member','callback_query'],drop_pending_updates:true})}
export {handleUpdate,setMenu} from './_bot.js';

// Short permanent browser ID (rs-xxxxxx). Maps to one browser id; used to link that browser to the sender's Telegram account.
const BA='abcdefghjkmnpqrstuvwxyz23456789',bk=id=>`gate/bid-${id}.json`;
const mkbid=(dev,salt)=>{const h=crypto.createHash('sha256').update('bid|'+salt+'|'+dev).digest();let s='';for(let i=0;i<6;i++)s+=BA[h[i]%31];return 'rs-'+s};
export async function ensureBid(dev){if(!okId(dev))return '';for(let s=0;s<6;s++){const id=mkbid(dev,s),e=await rd(bk(id));if(!e){await wr(bk(id),{dev,at:now()});return id}if(e.dev===dev)return id}return ''}
export async function bidDev(id){const e=await rd(bk(String(id||'').toLowerCase()));return (e&&e.dev)||''}
