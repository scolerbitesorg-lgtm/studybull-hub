import {cfg,enabled,start,check,handleUpdate,setup,redeem,claimCode,grant,loginDevice,settings} from './_gate.js';
const ORIGINS=new Set(['https://studybull-hub.vercel.app','https://studybull-hub-git-staging-scolerbitesorg-lgtms-projects.vercel.app','https://studybull.qd.je','https://www.studybull.qd.je']);
const send=(res,s,d)=>{res.statusCode=s;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(d))};
const sidOf=req=>String(req.headers['x-gate-session']||'');
export const bearer=req=>{const h=String(req.headers.authorization||'');return h.startsWith('Bearer ')?h.slice(7):''};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const o=req.headers.origin;if(o&&ORIGINS.has(o)){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin')}
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Gate-Session, X-Gate-Fp');
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  const action=String(req.query?.action||'');
  try{
    if(action==='hook'&&req.method==='POST'){ // Telegram webhook, authenticated by secret header
      if(!enabled()||req.headers['x-telegram-bot-api-secret-token']!==cfg().secret)return send(res,403,{error:'forbidden'});
      const up=typeof req.body==='string'?JSON.parse(req.body):req.body;await handleUpdate(up||{},'https://'+req.headers.host);return send(res,200,{ok:true})}
    if(action==='setup'&&req.method==='POST'){ // owner runs once: sets the Telegram webhook
      if(!enabled()||(bearer(req)!==cfg().secret&&bearer(req)!==cfg().token))return send(res,403,{error:'forbidden'});
      return send(res,200,await setup('https://'+req.headers.host))}
    if(action==='claimcode'&&req.method==='POST'){if(!enabled()||bearer(req)!==cfg().token)return send(res,403,{error:'forbidden'});return send(res,200,await claimCode())}
    if(action==='info'){const st=enabled()?await settings():{};return send(res,200,{enabled:enabled(),link:cfg().link,name:process.env.GATE_CHANNEL_NAME||'StudyBull',mode:st.mode==='every'?'every':'once',login:Boolean(st.login),botId:st.login?cfg().token.split(':')[0]:''})}
    if(!enabled())return send(res,200,{enabled:false,ok:true});
    if(action==='status')return send(res,200,{enabled:true,...await check(bearer(req),sidOf(req))});
    if(action==='redeem'&&req.method==='POST'){
      if(!o||!ORIGINS.has(o))return send(res,403,{error:'Use the StudyBull website.'});
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});return send(res,200,await redeem(bearer(req),b.code,undefined,sidOf(req),String(req.headers['x-gate-fp']||'')))}
    if(action==='grant'&&req.method==='POST'){
      if(!o||!ORIGINS.has(o))return send(res,403,{error:'Use the StudyBull website.'});
      return send(res,200,await grant(bearer(req),sidOf(req)))}
    if(action==='tglogin'&&req.method==='POST'){
      if(!o||!ORIGINS.has(o))return send(res,403,{error:'Use the StudyBull website.'});
      if(!(await settings()).login)return send(res,200,{ok:false,reason:'off'});
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});return send(res,200,await loginDevice(bearer(req),sidOf(req),b.user))}
    if(action==='start'&&req.method==='POST'){
      if(!o||!ORIGINS.has(o))return send(res,403,{error:'Use the StudyBull website.'});
      return send(res,200,await start(bearer(req),o))}
    return send(res,404,{error:'unknown'});
  }catch(e){console.error('gate',e.message);return send(res,503,{error:'Gate unavailable. Try again.'})}
                                                                                               }
