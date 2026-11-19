import crypto from 'node:crypto';
import {get,put,BlobPreconditionFailedError} from '@vercel/blob';

const PATH='studybull-courses-v1.json';
const ORIGINS=new Set(['https://studybull-hub.vercel.app','https://studybull.qd.je','https://www.studybull.qd.je','https://admin.studybull.qd.je']);
const OWNER_ORIGINS=new Set(['https://studybull-hub.vercel.app','https://admin.studybull.qd.je']);
const COOKIE='sb_owner_v1';
const attempts=new Map();
const publicAttempts=new Map();

function rate(map,key,limit,windowMs){const now=Date.now();for(const [k,v] of map)if(v.until<now)map.delete(k);let a=map.get(key);if(!a){if(map.size>3000)map.clear();a={count:0,until:now+windowMs};map.set(key,a)}return ++a.count>limit}
function clientIp(req){return String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim()}
function limited(req){return rate(attempts,clientIp(req),10,900000)}
function publicLimited(req,limit=60){return rate(publicAttempts,clientIp(req),limit,900000)}

const hash=s=>crypto.createHash('sha256').update(s).digest();
const equal=(a,b)=>crypto.timingSafeEqual(hash(String(a)),hash(String(b)));
const sign=s=>crypto.createHmac('sha256',process.env.STUDYBULL_OWNER_PASSWORD).update(s).digest('base64url');
function session(req){const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));if(!cookie)return false;const token=cookie.slice(COOKIE.length+1),[exp,nonce,sig]=token.split('.');return /^\d+$/.test(exp)&&Number(exp)>Date.now()&&Number(exp)<Date.now()+43201000&&nonce?.length===24&&sig&&equal(sig,sign(exp+'.'+nonce))}
function cookie(res,value,age){res.setHeader('Set-Cookie',`${COOKIE}=${value}; Path=/api/courses; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`)}
function send(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
let readCache=null,readUntil=0;
function defaults(){return {folders:[],banners:[],donationMessage:'',settings:{},users:[],notes:[],taxonomy:{categories:[],subjects:[],chapters:[]},pyqs:[],mocks:[],liveClasses:[],notifications:[],popups:[],appUpdate:{},feedback:[],activityLogs:[],loginHistory:[],updatedAt:null}}
async function read(fresh=false){if(!fresh&&readCache&&Date.now()<readUntil)return readCache;const r=await get(PATH,{access:'private',useCache:false});if(!r)return {...defaults(),revision:null};const text=await new Response(r.stream).text();readCache={...defaults(),...JSON.parse(text),revision:String(r.blob.etag).replace(/^W\//,'')};readUntil=Date.now()+5000;return readCache}


const VPATH='studybull-visitors-v1.json';
async function readVisitors(){const r=await get(VPATH,{access:'private',useCache:false});if(!r)return {counter:0,visitors:{},revision:null};const d=JSON.parse(await new Response(r.stream).text());return {counter:Number(d.counter)||0,visitors:d.visitors&&typeof d.visitors==='object'&&!Array.isArray(d.visitors)?d.visitors:{},revision:String(r.blob.etag).replace(/^W\//,'')}}
async function saveVisitors(state,current){const {revision:_r,...stored}=state;const result=await put(VPATH,JSON.stringify(stored),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:Boolean(current.revision),...(current.revision?{ifMatch:current.revision}:{}),cacheControlMaxAge:0});return {...state,revision:String(result.etag).replace(/^W\//,'')}}
async function mutateVisitors(fn){let current=await readVisitors();for(let a=0;;a++){const state={counter:current.counter,visitors:current.visitors};fn(state);try{return await saveVisitors(state,current)}catch(e){if(a>=2||!(e instanceof BlobPreconditionFailedError||String(e.message).includes('already exists')))throw e;current=await readVisitors()}}}
function trimVisitors(s){const ids=Object.keys(s.visitors);if(ids.length<=5000)return;ids.sort((a,b)=>String(s.visitors[a].lastSeen||'').localeCompare(String(s.visitors[b].lastSeen||'')));for(const id of ids.slice(0,ids.length-4500))delete s.visitors[id]}
const EVENT_TYPES=new Set(['visit','view','test-start','test-done','note','link']);
function cleanTrackEvents(list){if(!Array.isArray(list))return [];return list.slice(0,20).map(e=>({at:cleanDate(e?.at)||new Date().toISOString(),type:EVENT_TYPES.has(e?.type)?e.type:'view',detail:optionalText(e?.detail,140)}))}
function applyTrackEvents(v,events,sec,now){if(!Array.isArray(v.events))v.events=[];if(!v.pages||typeof v.pages!=='object')v.pages={};let visits=0;for(const e of events){if(e.type==='visit')visits++;else if(e.type==='view'){const p=e.detail.slice(0,120)||'home';if(v.pages[p]===undefined&&Object.keys(v.pages).length>=60)continue;v.pages[p]=(v.pages[p]||0)+1}v.events.push(e)}v.events=v.events.slice(-60);v.visits=Math.min(100000,(Number(v.visits)||0)+visits);v.totalSec=Math.min(10000000,(Number(v.totalSec)||0)+sec);v.lastSeen=now}
function registerVisitor(s,{vid,source,device,ref,now}){const existing=s.visitors[vid];if(existing)return existing.code;s.counter=(Number(s.counter)||0)+1;const code=source+'-'+device+String(s.counter).padStart(6,'0');const refOk=/^[a-z]{2}-[xyz]\d{6}$/.test(ref)&&ref!==code&&Object.values(s.visitors).some(x=>x.code===ref)?ref:'';s.visitors[vid]={code,source,device,ref:refOk,createdAt:now,lastSeen:now,visits:1,totalSec:0,pages:{},events:[{at:now,type:'visit',detail:'First visit'}]};trimVisitors(s);return code}

const idOk=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(s);
function text(v,name,min,max){v=String(v??'').trim();if(v.length<min||v.length>max)throw Error(`${name} must be ${min}-${max} characters.`);return v}
function optionalText(v,max){return String(v??'').trim().slice(0,max)}
function bool(v,def=true){return v===undefined?def:v===true}
function uniqueIds(list,what){const ids=new Set();for(const x of list){if(!idOk(x.id)||ids.has(x.id))throw Error(`Invalid or duplicate ${what} ID.`);ids.add(x.id)}}
function cleanUrl(value,{required=true,httpsOnly=false,name='Link'}={}){const raw=String(value??'').trim();if(!raw){if(required)throw Error(`${name} is required.`);return ''}if(raw.length>2000)throw Error(`${name} is too long.`);const u=new URL(raw);if(u.username||u.password||!['https:','http:'].includes(u.protocol)||httpsOnly&&u.protocol!=='https:')throw Error(`Only valid ${httpsOnly?'https':'http/https'} links are allowed.`);return u.href}
function cleanDate(v,required=false){const s=String(v??'').trim();if(!s){if(required)throw Error('Date/time is required.');return ''}const t=Date.parse(s);if(!Number.isFinite(t))throw Error('Invalid date/time.');return new Date(t).toISOString()}

function clean(data){if(!data||!Array.isArray(data.folders)||data.folders.length>100)throw Error('Up to 100 folders are allowed.');const ids=new Set();const folders=data.folders.map(f=>{if(!f||typeof f!=='object')throw Error('Invalid folder.');if(!idOk(f.id)||ids.has(f.id))throw Error('Invalid or duplicate folder ID.');ids.add(f.id);if(!Array.isArray(f.links)||f.links.length>200)throw Error('Up to 200 links per folder are allowed.');const linkIds=new Set();return {id:f.id,title:text(f.title,'Folder title',1,100),description:optionalText(f.description,300),links:f.links.map(l=>{if(!l||typeof l!=='object'||!idOk(l.id)||linkIds.has(l.id))throw Error('Invalid or duplicate link ID.');linkIds.add(l.id);return {id:l.id,title:text(l.title,'Link title',1,160),url:cleanUrl(l.url,{name:'Link URL'})}})}});if(Buffer.byteLength(JSON.stringify(folders))>500000)throw Error('Course list is too large.');return folders}
function cleanBanners(list){if(!Array.isArray(list)||list.length>4)throw Error('Up to 4 banners are allowed.');uniqueIds(list,'banner');return list.map(b=>{if(!b||typeof b!=='object')throw Error('Invalid banner.');const image=String(b.image||'');if(image.length>260000||!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(image))throw Error('Invalid banner image. Upload a JPG, PNG or WebP image.');return {id:b.id,image,title:optionalText(b.title,160)||'StudyBull banner',link:cleanUrl(b.link,{required:false,httpsOnly:true,name:'Banner link'})}})}
function cleanSettings(s){if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Invalid site settings.');const out={};for(const [k,max] of Object.entries({homeTitle:80,batchesLabel:80,materialLabel:80,materialIntro:300,announcement:600,maintenanceMessage:300,emergencyMessage:300}))out[k]=optionalText(s[k],max);out.showBanners=s.showBanners!==false;out.maintenanceMode=s.maintenanceMode===true;out.emergencyLock=s.emergencyLock===true;return out}
function cleanUsers(list){if(!Array.isArray(list)||list.length>500)throw Error('Up to 500 user records are allowed.');uniqueIds(list,'user');return list.map(u=>({id:u.id,name:text(u.name,'User name',1,100),email:optionalText(u.email,200),phone:optionalText(u.phone,30),role:['student','moderator','admin'].includes(u.role)?u.role:'student',status:['active','blocked','banned'].includes(u.status)?u.status:'active',note:optionalText(u.note,300),createdAt:cleanDate(u.createdAt)||new Date().toISOString()}))}
function cleanTaxonomy(t){if(!t||typeof t!=='object'||Array.isArray(t))throw Error('Invalid taxonomy.');const cleanList=(v,name)=>Array.isArray(v)?v.slice(0,200).map(x=>text(x,name,1,100)):[];return {categories:cleanList(t.categories,'Category'),subjects:cleanList(t.subjects,'Subject'),chapters:cleanList(t.chapters,'Chapter')}}
function cleanNotes(list){if(!Array.isArray(list)||list.length>500)throw Error('Up to 500 notes are allowed.');uniqueIds(list,'note');return list.map(n=>({id:n.id,title:text(n.title,'Note title',1,160),type:n.type==='pdf'?'pdf':'note',url:cleanUrl(n.url,{httpsOnly:true,name:'Note URL'}),category:optionalText(n.category,100),subject:optionalText(n.subject,100),chapter:optionalText(n.chapter,100),description:optionalText(n.description,300),visible:bool(n.visible),createdAt:cleanDate(n.createdAt)||new Date().toISOString()}))}
function cleanPyqs(list){if(!Array.isArray(list)||list.length>500)throw Error('Up to 500 PYQ records are allowed.');uniqueIds(list,'PYQ');return list.map(p=>({id:p.id,title:text(p.title,'PYQ title',1,160),exam:optionalText(p.exam,100),year:optionalText(p.year,20),subject:optionalText(p.subject,100),url:cleanUrl(p.url,{httpsOnly:true,name:'PYQ URL'}),visible:bool(p.visible),createdAt:cleanDate(p.createdAt)||new Date().toISOString()}))}
function cleanQuestions(list){if(!Array.isArray(list)||list.length>100)throw Error('Up to 100 questions per test are allowed.');uniqueIds(list,'question');return list.map((q,qi)=>{if(!q||typeof q!=='object')throw Error('Invalid question.');if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6)throw Error('Each question needs 2-6 options.');const options=q.options.map((o,i)=>text(o,`Option ${i+1}`,1,240));const answer=Number(q.answer);if(!Number.isInteger(answer)||answer<0||answer>=options.length)throw Error(`Choose a correct option for question ${qi+1}.`);return {id:q.id,question:text(q.question,'Question',1,1000),options,answer,explanation:optionalText(q.explanation,600)}})}
function cleanMocks(list){if(!Array.isArray(list)||list.length>50)throw Error('Up to 50 custom tests are allowed.');uniqueIds(list,'test');return list.map(m=>({id:m.id,title:text(m.title,'Test title',1,160),description:optionalText(m.description,300),subject:optionalText(m.subject,100),durationMinutes:Math.min(300,Math.max(1,Number(m.durationMinutes)||30)),active:bool(m.active),questions:cleanQuestions(m.questions||[]),createdAt:cleanDate(m.createdAt)||new Date().toISOString()}))}
function cleanLiveClasses(list){if(!Array.isArray(list)||list.length>100)throw Error('Up to 100 live classes are allowed.');uniqueIds(list,'class');return list.map(c=>({id:c.id,title:text(c.title,'Class title',1,160),subject:optionalText(c.subject,100),teacher:optionalText(c.teacher,100),startsAt:cleanDate(c.startsAt,true),link:cleanUrl(c.link,{httpsOnly:true,name:'Class link'}),status:['scheduled','live','ended'].includes(c.status)?c.status:'scheduled',visible:bool(c.visible)}))}
function cleanNotifications(list){if(!Array.isArray(list)||list.length>100)throw Error('Up to 100 notifications are allowed.');uniqueIds(list,'notification');return list.map(n=>({id:n.id,title:text(n.title,'Notification title',1,120),message:text(n.message,'Notification message',1,600),startsAt:cleanDate(n.startsAt),endsAt:cleanDate(n.endsAt),active:bool(n.active),createdAt:cleanDate(n.createdAt)||new Date().toISOString()}))}
function cleanPopups(list){if(!Array.isArray(list)||list.length>20)throw Error('Up to 20 popups are allowed.');uniqueIds(list,'popup');return list.map(p=>({id:p.id,title:text(p.title,'Popup title',1,120),message:text(p.message,'Popup message',1,600),link:cleanUrl(p.link,{required:false,httpsOnly:true,name:'Popup link'}),startsAt:cleanDate(p.startsAt),endsAt:cleanDate(p.endsAt),active:bool(p.active),createdAt:cleanDate(p.createdAt)||new Date().toISOString()}))}
function cleanAppUpdate(u){if(!u||typeof u!=='object'||Array.isArray(u))return {};return {active:u.active===true,version:optionalText(u.version,40),message:optionalText(u.message,300),link:cleanUrl(u.link,{required:false,httpsOnly:true,name:'Update link'})}}
function cleanFeedback(list){if(!Array.isArray(list)||list.length>300)throw Error('Up to 300 feedback records are allowed.');uniqueIds(list,'feedback');return list.map(f=>({id:f.id,name:optionalText(f.name,100),message:text(f.message,'Feedback message',1,1000),status:['new','read','resolved'].includes(f.status)?f.status:'new',createdAt:cleanDate(f.createdAt)||new Date().toISOString()}))}
function cleanLogs(list,name){if(!Array.isArray(list)||list.length>150)throw Error(`Up to 150 ${name} records are allowed.`);return list.map(x=>({id:idOk(x?.id)?x.id:crypto.randomUUID(),at:cleanDate(x?.at)||new Date().toISOString(),action:optionalText(x?.action,80),detail:optionalText(x?.detail,300)}))}
function cleanState(body,current){
 const folders=clean(body);
 const state={
  folders,
  banners:cleanBanners(body.banners===undefined?(current.banners||[]):body.banners),
  donationMessage:optionalText(body.donationMessage===undefined?(current.donationMessage||''):body.donationMessage,600),
  settings:cleanSettings(body.settings===undefined?(current.settings||{}):body.settings),
  users:cleanUsers(body.users===undefined?(current.users||[]):body.users),
  notes:cleanNotes(body.notes===undefined?(current.notes||[]):body.notes),
  taxonomy:cleanTaxonomy(body.taxonomy===undefined?(current.taxonomy||{}):body.taxonomy),
  pyqs:cleanPyqs(body.pyqs===undefined?(current.pyqs||[]):body.pyqs),
  mocks:cleanMocks(body.mocks===undefined?(current.mocks||[]):body.mocks),
  liveClasses:cleanLiveClasses(body.liveClasses===undefined?(current.liveClasses||[]):body.liveClasses),
  notifications:cleanNotifications(body.notifications===undefined?(current.notifications||[]):body.notifications),
  popups:cleanPopups(body.popups===undefined?(current.popups||[]):body.popups),
  appUpdate:cleanAppUpdate(body.appUpdate===undefined?(current.appUpdate||{}):body.appUpdate),
  feedback:cleanFeedback(body.feedback===undefined?(current.feedback||[]):body.feedback),
  activityLogs:cleanLogs(body.activityLogs===undefined?(current.activityLogs||[]):body.activityLogs,'activity'),
  loginHistory:cleanLogs(body.loginHistory===undefined?(current.loginHistory||[]):body.loginHistory,'login history'),
  updatedAt:new Date().toISOString()
 };
 if(Buffer.byteLength(JSON.stringify(state))>1700000)throw Error('Published data is too large. Remove old records or large test banks.');
 return state;
}
function activeByDate(x){const now=Date.now();return x.active!==false&&(!x.startsAt||Date.parse(x.startsAt)<=now)&&(!x.endsAt||Date.parse(x.endsAt)>=now)}
function publicData(d){return {folders:d.folders||[],banners:d.banners||[],donationMessage:d.donationMessage||'',settings:d.settings||{},notes:(d.notes||[]).filter(n=>n.visible!==false),pyqs:(d.pyqs||[]).filter(p=>p.visible!==false),mocks:(d.mocks||[]).filter(m=>m.active!==false&&m.questions?.length).map(m=>({id:m.id,title:m.title,description:m.description,subject:m.subject,durationMinutes:m.durationMinutes,questionCount:m.questions.length})),liveClasses:(d.liveClasses||[]).filter(c=>c.visible!==false),notifications:(d.notifications||[]).filter(activeByDate),popups:(d.popups||[]).filter(activeByDate),appUpdate:d.appUpdate||{},revision:d.revision,updatedAt:d.updatedAt||null}}
function adminData(d){return {...defaults(),...d}}
function addLog(list,action,detail){return [{id:crypto.randomUUID(),at:new Date().toISOString(),action,detail},...(list||[])].slice(0,150)}
async function saveState(state,current){const {revision:_revision,...stored}=state;const result=await put(PATH,JSON.stringify(stored),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:Boolean(current.revision),...(current.revision?{ifMatch:current.revision}:{}),cacheControlMaxAge:0});readCache=null;readUntil=0;return {...state,revision:String(result.etag).replace(/^W\//,'')}}
function publicTest(test){return {id:test.id,title:test.title,description:test.description,subject:test.subject,durationMinutes:test.durationMinutes,questions:test.questions.map(q=>({id:q.id,question:q.question,options:q.options}))}}

export default async function handler(req,res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');const origin=req.headers.origin;if(origin&&ORIGINS.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, If-None-Match');res.statusCode=204;return res.end()}const config=process.env.STUDYBULL_OWNER_PASSWORD;if(!config||config.length<20||!process.env.BLOB_STORE_ID&&!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'Course publishing is not configured yet.'});const action=String(req.query?.action||'');
try{
 if(req.method==='GET'){
  if(action==='session')return send(res,200,{authenticated:Boolean(session(req)),sessionHours:12});
  if(action==='admin'){if(!session(req))return send(res,401,{error:'Owner login required.'});return send(res,200,adminData(await read()))}
  if(action==='visitors'){if(!session(req))return send(res,401,{error:'Owner login required.'});const d=await readVisitors();const list=Object.values(d.visitors).map(v=>({code:v.code,source:v.source,device:v.device,ref:v.ref||'',createdAt:v.createdAt,lastSeen:v.lastSeen,visits:v.visits||0,totalSec:v.totalSec||0,pages:Object.keys(v.pages||{}).length}));list.sort((a,b)=>String(b.lastSeen).localeCompare(String(a.lastSeen)));return send(res,200,{counter:d.counter,total:list.length,visitors:list})}
  if(action==='visitor'){if(!session(req))return send(res,401,{error:'Owner login required.'});const d=await readVisitors();const code=String(req.query?.id||'');const v=Object.values(d.visitors).find(x=>x.code===code);if(!v)return send(res,404,{error:'Visitor not found.'});return send(res,200,v)}
  if(action==='test'){const d=await read(),test=(d.mocks||[]).find(m=>m.id===String(req.query?.id||'')&&m.active!==false);if(!test)return send(res,404,{error:'Test not found.'});return send(res,200,publicTest(test))}
  const data=await read();if(data.revision&&req.query?.known===data.revision)return send(res,200,{unchanged:true,revision:data.revision});return send(res,200,publicData(data))
 }
 if(!origin||!ORIGINS.has(origin))return send(res,403,{error:'Use the StudyBull website.'});if(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'&&!['https://studybull.qd.je','https://www.studybull.qd.je'].includes(origin))return send(res,403,{error:'Same-origin requests only.'});const ct=String(req.headers['content-type']||'');if(!ct.startsWith('application/json')&&!(action==='track'&&ct.startsWith('text/plain')))return send(res,415,{error:'JSON required.'});const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(Buffer.byteLength(JSON.stringify(body||{}))>1800000)return send(res,413,{error:'Request too large.'});
 if(req.method==='POST'&&action==='submit-test'){
  if(publicLimited(req,40)){res.setHeader('Retry-After','900');return send(res,429,{error:'Too many attempts. Try again later.'})}
  const d=await read(),test=(d.mocks||[]).find(m=>m.id===String(body?.id||'')&&m.active!==false);if(!test)return send(res,404,{error:'Test not found.'});const answers=Array.isArray(body?.answers)?body.answers:[];const review=test.questions.map((q,i)=>{const chosen=Number(answers[i]);return {id:q.id,chosen:Number.isInteger(chosen)?chosen:null,answer:q.answer,correct:chosen===q.answer,explanation:q.explanation||''}});const score=review.filter(q=>q.correct).length;return send(res,200,{score,total:test.questions.length,review})
 }
 if(req.method==='POST'&&action==='feedback'){
  if(publicLimited(req,10)){res.setHeader('Retry-After','900');return send(res,429,{error:'Too many messages. Try again later.'})}
  const current=await read(true);const state=adminData(current);state.feedback=[{id:crypto.randomUUID(),name:optionalText(body?.name,100),message:text(body?.message,'Feedback message',1,1000),status:'new',createdAt:new Date().toISOString()},...(current.feedback||[])].slice(0,300);state.activityLogs=current.activityLogs||[];state.loginHistory=current.loginHistory||[];state.updatedAt=new Date().toISOString();const saved=await saveState(state,current);return send(res,200,{ok:true,revision:saved.revision})
 }
 if(req.method==='POST'&&action==='track'){
  if(publicLimited(req,120)){res.setHeader('Retry-After','900');return send(res,429,{error:'Too many events. Try again later.'})}
  const vid=String(body?.vid||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(vid))return send(res,400,{error:'Invalid visitor.'});
  const now=new Date().toISOString();
  if(body?.register===true){
   const source=['tg','wa','sh','gg','wb'].includes(body?.source)?body.source:'wb';
   const device=['x','y','z'].includes(body?.device)?body.device:'y';
   const ref=optionalText(body?.ref,40);
   let code='';await mutateVisitors(s=>{code=registerVisitor(s,{vid,source,device,ref,now})});
   return send(res,200,{code})
  }
  const events=cleanTrackEvents(body?.events);const sec=Math.min(600,Math.max(0,Math.round(Number(body?.sec)||0)));
  if(!events.length&&!sec)return send(res,200,{ok:true});
  let known=false;await mutateVisitors(s=>{const v=s.visitors[vid];if(!v)return;known=true;applyTrackEvents(v,events,sec,now);trimVisitors(s)});
  return send(res,200,{ok:true,known})
 }
 if(!OWNER_ORIGINS.has(origin))return send(res,403,{error:'Use the StudyBull owner panel.'});if(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')return send(res,403,{error:'Same-origin requests only.'});
  if(req.method==='POST'&&action==='visitor-delete'){
  if(!session(req))return send(res,401,{error:'Owner login required.'});
  const code=text(body?.code,'Visitor code',1,40);let removed=false;
  await mutateVisitors(s=>{for(const [id,v] of Object.entries(s.visitors))if(v.code===code){delete s.visitors[id];removed=true}});
  return send(res,200,{ok:true,removed})
 }
 if(req.method==='POST'&&action==='login'){if(limited(req)){res.setHeader('Retry-After','900');return send(res,429,{error:'Too many login attempts. Try again in 15 minutes.'})}await new Promise(r=>setTimeout(r,700));if(!body||typeof body.password!=='string'||body.password.length>256||!equal(body.password,config))return send(res,401,{error:'Incorrect owner password.'});const payload=String(Date.now()+43200000)+'.'+crypto.randomBytes(18).toString('base64url');cookie(res,payload+'.'+sign(payload),43200);
  try{const current=await read(true),state=adminData(current);state.loginHistory=addLog(current.loginHistory,'owner-login','Owner panel login');state.activityLogs=current.activityLogs||[];state.updatedAt=new Date().toISOString();await saveState(state,current)}catch(e){console.error('Login history save skipped',e.name)}
  return send(res,200,{ok:true})}
 if(!session(req))return send(res,401,{error:'Owner login required.'});if(req.method==='POST'&&action==='logout'){cookie(res,'',0);return send(res,200,{ok:true})}
 if(req.method==='PUT'){
  const current=await read(true);if((body.revision||null)!==current.revision)return send(res,409,{error:'Admin data changed in another session. Reload before saving.'});
  const state=cleanState(body,current);state.activityLogs=addLog(state.activityLogs,'publish',`Published ${state.folders.length} folders, ${state.users.length} users, ${state.notes.length} notes, ${state.mocks.length} tests`);
  const saved=await saveState(state,current);return send(res,200,adminData(saved))
 }
 return send(res,405,{error:'Method not allowed.'})
}catch(e){if(e instanceof BlobPreconditionFailedError||String(e.message).includes('already exists'))return send(res,409,{error:'Admin data changed. Reload before saving.'});if(e instanceof SyntaxError||e instanceof TypeError||/allowed|Invalid|must be|valid http|required|too large|Choose|needs/.test(e.message))return send(res,400,{error:e.message});console.error('StudyBull service error',e.name);return send(res,503,{error:'StudyBull service unavailable. Nothing was changed; try again later.'})}}

export {clean,cleanBanners,cleanSettings,cleanState,publicData};
