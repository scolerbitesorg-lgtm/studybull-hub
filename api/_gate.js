// Telegram channel join gate. Access follows the Telegram account (not the physical phone).
import crypto from 'node:crypto';
import {get,put} from '@vercel/blob';
const mem=new Map(); // used only when GATE_MEM=1 (local tests)
export const cfg=()=>({
  token:process.env.GATE_BOT_TOKEN||'',
  channel:process.env.GATE_CHANNEL_ID||'',          // @username or -100... id
  link:process.env.GATE_CHANNEL_LINK||'',           // https://t.me/xxxx shown to users
  bot:(process.env.GATE_BOT_USERNAME||'').replace(/^@/,''),
  secret:process.env.GATE_WEBHOOK_SECRET||'',
  api:process.env.GATE_TG_API||'https://api.telegram.org',
  recheck:Number(process.env.GATE_RECHECK_SECONDS)||300,
  maxDevices:Number(process.env.GATE_MAX_DEVICES)||3
});
export const enabled=()=>{const c=cfg();return Boolean(c.token&&c.channel&&c.bot&&c.secret)};
async function rd(k){if(process.env.GATE_MEM)return mem.has(k)?JSON.parse(mem.get(k)):null;const r=await get(k,{access:'private',useCache:false});if(!r)return null;try{return JSON.parse(await new Response(r.stream).text())}catch{return null}}
async function wr(k,v){if(process.env.GATE_MEM){mem.set(k,JSON.stringify(v));return}await put(k,JSON.stringify(v),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:0})}
const now=()=>Math.floor(Date.now()/1000);
const okId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{20,64}$/.test(s);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,40);
async function tg(method,body){const c=cfg();const r=await fetch(`${c.api}/bot${c.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});return r.json()}
export async function isMember(userId){const j=await tg('getChatMember',{chat_id:cfg().channel,user_id:userId});if(!j.ok)return {ok:false,err:j.description||'telegram error'};const s=j.result.status;return {ok:true,member:['creator','administrator','member'].includes(s)||(s==='restricted'&&j.result.is_member===true)}}
const ukey=tgid=>`gate/user-${tgid}.json`, dkey=d=>`gate/dev-${hash(d)}.json`, pkey=c=>`gate/pending-${c}.json`;
export async function start(dev){if(!okId(dev))throw Error('bad device');const code=crypto.randomBytes(9).toString('base64url');await wr(pkey(code),{dev,exp:now()+900});return {code,url:`https://t.me/${cfg().bot}?start=${code}`}}
// returns {ok,reason}
export async function check(dev){
  if(!okId(dev))return {ok:false,reason:'none'};
  const d=await rd(dkey(dev));if(!d)return {ok:false,reason:'none'};
  const u=await rd(ukey(d.tg));if(!u)return {ok:false,reason:'none'};
  if(!u.devices||!u.devices[hash(dev)])return {ok:false,reason:'device'};
  if(u.member===false)return {ok:false,reason:'left'};
  if(now()-(u.checkedAt||0)>cfg().recheck){
    const m=await isMember(d.tg);
    if(m.ok){u.member=m.member;u.checkedAt=now();await wr(ukey(d.tg),u);if(!m.member)return {ok:false,reason:'left'}}
    else return {ok:false,reason:'error'}; // fail closed
  }
  return {ok:true};
}
async function say(chat,text,extra){await tg('sendMessage',{chat_id:chat,text,disable_web_page_preview:true,...extra})}
export async function handleUpdate(up){
  const c=cfg();
  if(up.chat_member){ // instant revoke / restore when someone leaves or joins the channel
    const cm=up.chat_member,uid=cm.new_chat_member?.user?.id;if(!uid)return;
    const s=cm.new_chat_member.status,member=['creator','administrator','member'].includes(s)||(s==='restricted'&&cm.new_chat_member.is_member===true);
    const u=await rd(ukey(uid));if(u){u.member=member;u.checkedAt=now();await wr(ukey(uid),u)}return}
  const m=up.message;if(!m||m.chat?.type!=='private'||!m.from)return;
  const t=String(m.text||'');const code=(t.match(/^\/start\s+([A-Za-z0-9_-]{6,40})$/)||[])[1];
  if(!code){await say(m.chat.id,'Open StudyBull, tap "Verify" and come back here.');return}
  const p=await rd(pkey(code));
  if(!p||p.exp<now()){await say(m.chat.id,'This link expired. Go back to the StudyBull site and tap Verify again.');return}
  const mem2=await isMember(m.from.id);
  if(!mem2.ok){await say(m.chat.id,'Could not check right now. Try again in a minute.');return}
  if(!mem2.member){await say(m.chat.id,'First join our channel, then tap the Verify button on the site again.',c.link?{reply_markup:{inline_keyboard:[[{text:'Join channel',url:c.link}]]}}:{});return}
  const u=(await rd(ukey(m.from.id)))||{tg:m.from.id,devices:{}};
  u.member=true;u.checkedAt=now();u.devices=u.devices||{};u.devices[hash(p.dev)]=now();
  const ids=Object.keys(u.devices).sort((a,b)=>u.devices[b]-u.devices[a]);for(const old of ids.slice(c.maxDevices))delete u.devices[old]; // keep newest N, oldest is signed out
  await wr(ukey(m.from.id),u);await wr(dkey(p.dev),{tg:m.from.id,at:now()});await wr(pkey(code),{dev:p.dev,exp:0});
  await say(m.chat.id,'Verified. Go back to the StudyBull site, access is now unlocked.');
}
export async function setup(base){const c=cfg();return tg('setWebhook',{url:base+'/api/gate?action=hook',secret_token:c.secret,allowed_updates:['message','chat_member'],drop_pending_updates:true})}
