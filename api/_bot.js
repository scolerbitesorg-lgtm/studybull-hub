// Bot experience (staged, animated messages) and owner panel. Only touches users who interacted with the bot or joined through the gate.
import {bindState,bidDev,dkey,cfg,rd,wr,now,hash,ckey,tg,tgDoc,isM,isMember,isMemberIn,channels,ukey,userCode,deviceLink,linkDevice,pkey,invDevice,settings,saveSettings,touch,logEv,IDX,LOG,OWN,STATE} from './_gate.js';
const h=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const sleep=ms=>process.env.GATE_MEM?Promise.resolve():new Promise(r=>setTimeout(r,ms));
const say=(chat,text,extra)=>tg('sendMessage',{chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true,...extra});
const del=(chat,id)=>id?tg('deleteMessage',{chat_id:chat,message_id:id}).catch(()=>{}):Promise.resolve();
// keep the chat clean: each new top-level bot message replaces the previous one
const lmk=chat=>`gate/lm-${chat}.json`;
async function sayFresh(chat,text,extra){const o=await rd(lmk(chat)).catch(()=>null);const [r]=await Promise.all([say(chat,text,extra),del(chat,o&&o.m)]);const nm=r&&r.result&&r.result.message_id;if(nm)await wr(lmk(chat),{m:nm}).catch(()=>{});return r}
const EFFECT='5046509860389126442';
async function finalFx(chat,mid,text,extra){let r=await tg('sendMessage',{chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true,message_effect_id:EFFECT,...extra}).catch(()=>({}));if(!r||!r.ok)r=await say(chat,text,extra);const nm=r&&r.result&&r.result.message_id;await Promise.all([del(chat,mid),nm?wr(lmk(chat),{m:nm}).catch(()=>{}):0]);return r}
const edit=async(chat,mid,text,extra)=>{if(!mid)return sayFresh(chat,text,extra);const j=await tg('editMessageText',{chat_id:chat,message_id:mid,text,parse_mode:'HTML',disable_web_page_preview:true,...extra});if(!j.ok&&!/not modified/i.test(j.description||''))return sayFresh(chat,text,extra);return j};
const typing=chat=>tg('sendChatAction',{chat_id:chat,action:'typing'}).catch(()=>{});
const kb=rows=>({reply_markup:{inline_keyboard:rows}});
const bar=(n,t=5)=>'▰'.repeat(n)+'▱'.repeat(t-n);
const DEFAULT_WELCOME='👋 <b>Welcome to StudyBull</b>\nJoin our channel to unlock Batches and course videos. It takes a few seconds.';
const siteBtn=(base,code,origin)=>{const site=origin||cfg().site||'https://studybull.qd.je';return site?[[{text:'🚀 Open StudyBull',url:`${site}/#unlock=${code}`}]]:[]};
const joinRows=chs=>{const c=cfg();const list=chs&&chs.length?chs:[{name:'',link:c.link}];return [...list.filter(x=>x.link).map(x=>[{text:'📢 Join '+(list.length>1&&x.name?x.name:'channel'),url:x.link}]),[{text:'🔄 I have joined, Verify',callback_data:'v'}]]};
const SPIN=['🕐','🕓','🕖','🕙'];
async function isBanned(uid){const u=await rd(ukey(uid));return !!(u&&u.banned)}
async function isRemoved(uid){const u=await rd(ukey(uid));return !!(u&&u.removed)}
const REMOVED_MSG=id=>`🔒 <b>Your web access was removed by the admin.</b>\n\nYour ID: <code>${id}</code>\nTap the button to ask for access again. The admin will review your request.`
const BANNED_MSG=id=>`🚫 <b>Access is blocked</b> for this account.\n\nYour ID: <code>${id}</code>\nYou can send a request. The admin will review it.`
const reqKb=(pending)=>kb([[pending?{text:'⏳ Request sent',callback_data:'rq'}:{text:'🔓 Get access again',callback_data:'rq'}]])
// staged, edit-in-place verification
async function verifyFlow(chat,uid,base,from,mid,head){
  const H=head?head+'\n\n':'';const ed=(m,t,x)=>edit(chat,m,H+t,x);
  {const u0=await rd(ukey(uid));const pend=!!(u0&&u0.req==='pending');
   if(u0&&u0.banned){await ed(mid,BANNED_MSG(uid),reqKb(pend));return}
   if(u0&&u0.removed){await ed(mid,REMOVED_MSG(uid),reqKb(pend));return}}
  // already verified: no progress animation, just a calm status with the access button
  {const u1=await rd(ukey(uid));
   if(u1&&u1.member===true&&u1.code){const m1=await isMember(uid);
     if(m1.ok&&m1.member){await userCode(uid,false,from);const lk=await deviceLink(uid);
       await edit(chat,mid,'✅ <b>You are verified</b>\n\nYour access is active. Open StudyBull with the button below. Your account is tied to one device, and the link works on the first browser that opens it, so do not share it.\n\n🚪 If you leave a required channel, access locks again',kb(siteBtn(base,lk)));return}
     if(m1.ok&&!m1.member){u1.member=false;u1.checkedAt=now();await wr(ukey(uid),u1)}}}
  await typing(chat);
  const first=await ed(mid,`🔍 <b>Checking your membership</b>\n${bar(1)} ${SPIN[0]}`);
  mid=mid||first?.result?.message_id;
  const [mm]=await Promise.all([isMember(uid),sleep(600)]);
  await ed(mid,`🔍 <b>Checking your membership</b>\n${bar(3)} ${SPIN[1]}`);await sleep(400);
  if(!mm.ok){await ed(mid,'⚠️ <b>Could not check right now.</b>\nTry again in a minute.',kb([[{text:'🔄 Try again',callback_data:'v'}]]));return}
  if(!mm.member){const n=(mm.missing||[]).length;await ed(mid,'😕 <b>You have not joined yet</b>\n'+(n>1?`Join the ${n} channels below, then tap Verify.`:'Join the channel first, then tap Verify.'),kb(joinRows(mm.missing)));return}
  await ed(mid,`🔐 <b>Creating your access</b>\n${bar(5)} ✨`);
  await userCode(uid,false,from);const code=await deviceLink(uid);await touch(from,{s:true});await sleep(300);
  await finalFx(chat,mid,H+`✅ <b>Verified!</b>\n\nTap the button to open StudyBull. This personal link works only on the first browser that opens it, so do not share it.\n\n🔑 Your account is tied to one device\n🚪 If you leave a required channel, access locks again`,kb(siteBtn(base,code)))}
const LOCKED_MSG={locked:'📱 <b>This account is linked to another device</b>\nFor safety, one Telegram account works on one device only. If you changed or lost your device, ask the admin to move your access.',taken:'🔒 <b>This device is already used by another account</b>\nOne device works with one Telegram account only.'};
const dcKb=pending=>kb([[pending?{text:'⏳ Request sent',callback_data:'dc'}:{text:'📱 Request device change',callback_data:'dc'}]]);
async function lockedReply(chat,uid,why){const u=await rd(ukey(uid));return sayFresh(chat,LOCKED_MSG[why],why==='locked'?dcKb(!!(u&&u.devReq==='pending')):undefined)}
async function deviceChange(chat,from,mid){const uid=from.id;const u=await rd(ukey(uid));
  if(!u||!u.devices||!Object.keys(u.devices).length)return verifyFlow(chat,uid,'',from,mid);
  if(u.devReq==='pending')return edit(chat,mid,'⏳ <b>Your device change request is already with the admin.</b>\nYou will get a message when it is decided.');
  u.devReq='pending';u.devReqAt=now();await wr(ukey(uid),u);
  await edit(chat,mid,'✅ <b>Request sent.</b>\nThe admin will review it. You will get a message here when it is decided.');
  const o=await rd(OWN);if(o&&o.id){const nm=h([from.first_name,from.last_name].filter(Boolean).join(' ')||'User')+(from.username?' @'+h(from.username):'');
    await say(o.id,`📱 <b>Device change request</b>\n${nm}\nID: <code>${uid}</code>\nApproving signs them out of their current device so they can link a new one.`,kb([[{text:'✅ Approve',callback_data:'a:da:'+uid},{text:'❌ Reject',callback_data:'a:dr:'+uid}],[{text:'👤 Details',callback_data:'a:d:'+uid}]]))}}
const siteUrl=(base)=>cfg().site||'https://studybull.qd.je';
async function pinLink(chat,text){const r=await say(chat,text,kb([[{text:'🚀 Open StudyBull',url:siteUrl()}]]));const id=r&&r.result&&r.result.message_id;if(id)await tg('pinChatMessage',{chat_id:chat,message_id:id,disable_notification:true}).catch(()=>{});return id}
async function welcome(chat,from,base){const x=(await rd(IDX))||{u:{}};const had=x.u[from.id]&&x.u[from.id].pn;await touch(from,{s:true,pn:1});
  const st=await settings();
  if(!had)await pinLink(chat,'🔗 <b>StudyBull</b>\nYour link to the website:\n'+siteUrl());
  await verifyFlow(chat,from.id,base,from,undefined,st.welcome?h(st.welcome):DEFAULT_WELCOME)}
let _own=0;
const isOwner=async id=>{if(_own)return _own===id;const o=await rd(OWN);if(o&&o.id)_own=o.id;return !!(o&&o.id&&o.id===id)};
// ---- owner panel ----
async function userStatus(id){const u=await rd(ukey(id));if(!u)return {label:'no record',u:null};return {u,label:u.banned?'🚫 banned':u.removed?'🔒 removed':(u.member===false?'🚪 left':'✅ member')}}
async function panel(chat,mid){
  const [st,x0,chs]=await Promise.all([settings(),rd(IDX),channels()]);const x=x0||{u:{}};const ids=Object.keys(x.u);const started=ids.filter(i=>x.u[i].s).length;
  const text=`🛠 <b>StudyBull Admin</b>\n\nGate: ${st.paused?'🔴 <b>PAUSED</b> (everyone has access)':'🟢 <b>LIVE</b>'}\nShows: <b>${st.mode==='every'?'every time the site opens':'first time only'}</b>\nTelegram login on site: <b>${st.login?'ON':'OFF'}</b>\nDevice recognition (no bot for known phones): <b>${st.match===true?'ON':'OFF'}</b>\nRequired channels: <b>${chs.length}</b>\nUsers: <b>${ids.length}</b> · started bot: <b>${started}</b>`;
  await edit(chat,mid,text,kb([
    [{text:st.paused?'🟢 Turn gate LIVE':'🔴 Pause gate',callback_data:'a:t'}],
    [{text:st.mode==='every'?'🔁 Mode: EVERY visit (tap for first-time only)':'1️⃣ Mode: FIRST time only (tap for every visit)',callback_data:'a:gm'}],
    [{text:st.login?'🔑 Telegram login: ON (tap to turn off)':'🔑 Telegram login: OFF (tap to turn on)',callback_data:'a:gl'}],
    [{text:st.match===true?'📱 Device recognition: ON (tap to turn off)':'📱 Device recognition: OFF (tap to turn on)',callback_data:'a:dm'}],
    [{text:'📢 Channels ('+chs.length+')',callback_data:'a:ch'}],
    [{text:'📊 Stats',callback_data:'a:s'},{text:'👥 Users',callback_data:'a:u:0'}],
    [{text:'🔎 Search',callback_data:'a:f'},{text:'🚫 Banned',callback_data:'a:b:0'}],
    [{text:'🕘 Recent',callback_data:'a:r'},{text:'⬇️ Export CSV',callback_data:'a:x'}],
    [{text:'📣 Broadcast',callback_data:'a:bc'},{text:'✉️ Message user',callback_data:'a:mu'}],
    [{text:'👋 Welcome text',callback_data:'a:w'},{text:'🔄 Re-check members',callback_data:'a:rc'}]]))}
const back=[[{text:'⬅️ Panel',callback_data:'a:p'}]];
const when=t=>t?new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC':'-';
const line=(id,o,lab)=>`${lab||''} <code>${id}</code> ${h(o.n)} ${o.un?'@'+h(o.un):''}`;
async function userList(chat,mid,page,onlyBanned){
  const x=(await rd(IDX))||{u:{}};let rows=Object.entries(x.u).sort((a,b)=>b[1].seen-a[1].seen);
  if(onlyBanned){const us=await Promise.all(rows.map(r=>rd(ukey(r[0])).catch(()=>null)));rows=rows.filter((r,k)=>us[k]&&us[k].banned)}
  const per=8,pages=Math.max(1,Math.ceil(rows.length/per));page=Math.min(Math.max(0,page),pages-1);const sl=rows.slice(page*per,page*per+per);
  const pre=onlyBanned?'a:b:':'a:u:';
  const btn=sl.map(([id,o])=>[{text:`👤 ${(o.n||o.un||id).slice(0,24)}`,callback_data:'a:d:'+id}]);
  const nav=[];if(page>0)nav.push({text:'◀️',callback_data:pre+(page-1)});nav.push({text:`${page+1}/${pages}`,callback_data:'a:p'});if(page<pages-1)nav.push({text:'▶️',callback_data:pre+(page+1)});
  await edit(chat,mid,`${onlyBanned?'🚫 <b>Banned users</b>':'👥 <b>Users</b>'} (${rows.length})\nTap a user for details.`,kb([...btn,nav,...back]))}
async function detail(chat,mid,id){
  const x=(await rd(IDX))||{u:{}};const o=x.u[id]||{};const {u,label}=await userStatus(id);
  if(!u&&!x.u[id]){await edit(chat,mid,'No record for <code>'+h(id)+'</code>.',kb(back));return}
  const text=`👤 <b>${h(o.n||'Unknown')}</b> ${o.un?'@'+h(o.un):''}\nID: <code>${id}</code>\nStatus: ${label}\nFirst seen: ${when(o.at)}\nLast seen: ${when(o.seen)}\nStarted bot: ${o.s?'yes':'no'}\nBrowsers linked: ${u?Object.keys(u.devices||{}).length:0}\nLast membership check: ${u?when(u.checkedAt):'-'}`;
  await edit(chat,mid,text,kb([[{text:'🔒 Sign out browsers',callback_data:'a:rv:'+id},{text:u&&u.banned?'✅ Unban':'🚫 Ban',callback_data:(u&&u.banned?'a:ub:':'a:bn:')+id}],[{text:'🔑 New code',callback_data:'a:nc:'+id},{text:'✉️ Message',callback_data:'a:m:'+id}],[{text:'🗑 Remove access',callback_data:'a:rm:'+id}],[{text:'⬅️ Users',callback_data:'a:u:0'}]]))}
async function stats(chat,mid){
  const x=(await rd(IDX))||{u:{}};const ids=Object.keys(x.u);let mem=0,ban=0,left=0,dev=0;
  const [us,cnt0]=await Promise.all([Promise.all(ids.slice(0,300).map(id=>rd(ukey(id)).catch(()=>null))),tg('getChatMemberCount',{chat_id:cfg().channel}).catch(()=>({}))]);
  for(const u of us){if(!u)continue;if(u.banned)ban++;else if(u.member===false)left++;else if(u.member)mem++;dev+=Object.keys(u.devices||{}).length}
  const cnt=cnt0&&cnt0.ok?cnt0.result:'?';
  const days=[];for(let i=6;i>=0;i--){const d0=Math.floor(now()/86400)-i;days.push({d:new Date(d0*86400000).toISOString().slice(5,10),n:ids.filter(k=>Math.floor((x.u[k].at||0)/86400)===d0).length})}
  const mx=Math.max(1,...days.map(d=>d.n));
  const chart=days.map(d=>`${d.d} ${'█'.repeat(Math.round(d.n/mx*8))||'·'} ${d.n}`).join('\n');
  const l=((await rd(LOG))||{e:[]}).e;const j7=l.filter(e=>e.k==='join').length,lv=l.filter(e=>e.k==='leave').length;
  await edit(chat,mid,`📊 <b>Dashboard</b>\n\n📢 Channel members: <b>${cnt}</b>\n👥 Bot users: <b>${ids.length}</b>\n✅ Verified members: <b>${mem}</b>\n🚪 Left: <b>${left}</b>\n🚫 Banned: <b>${ban}</b>\n🔑 Browsers linked: <b>${dev}</b>\n📈 Recent joins/leaves logged: ${j7}/${lv}\n\n<b>New users, last 7 days</b>\n<pre>${chart}</pre>`,kb(back))}
async function recent(chat,mid){const l=((await rd(LOG))||{e:[]}).e.slice(-15).reverse();
  await edit(chat,mid,'🕘 <b>Recent activity</b>\n\n'+(l.length?l.map(e=>`${e.k==='join'?'➕':'➖'} ${when(e.t).slice(5,16)} <code>${e.id}</code> ${h(e.n)}`).join('\n'):'Nothing yet. Joins and leaves show here from now on.'),kb(back))}
async function exportCsv(chat){
  const x=(await rd(IDX))||{u:{}};const rows=[['telegram_id','name','username','first_seen_utc','last_seen_utc','started_bot','status','browsers']];
  for(const id of Object.keys(x.u).slice(0,1000)){const o=x.u[id];const u=await rd(ukey(id));const s=!u?'none':u.banned?'banned':u.member===false?'left':'member';
    rows.push([id,o.n||'',o.un||'',when(o.at),when(o.seen),o.s?'yes':'no',s,u?Object.keys(u.devices||{}).length:0])}
  const csv=rows.map(r=>r.map(v=>{v=String(v).replace(/^[=+\-@]/,"'$&");return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')).join('\n');
  await tgDoc(chat,'studybull-users.csv',csv,`Users: ${rows.length-1}`)}
async function chScreen(chat,mid){const chs=await channels();
  const text=`📢 <b>Required channels</b> (${chs.length})\nUsers must join all of them to open Batches.\n\n`+chs.map((c,i)=>`${i+1}. <b>${h(c.name)}</b>${c.primary?' (main)':''}`).join('\n')+'\n\nTo add one: make this bot an <b>admin</b> of that channel (with "Invite users"), tap Add, then send its @username or forward any post from it.';
  const rm=chs.filter(c=>!c.primary).map((c,i)=>[{text:'🗑 Remove '+c.name.slice(0,22),callback_data:'a:chd:'+i}]);
  return edit(chat,mid,text,kb([...rm,[{text:'➕ Add channel',callback_data:'a:cha'}],...back]))}
async function addChannel(chat,m){
  const t=String(m.text||'').trim();const fw=(m.forward_origin&&m.forward_origin.chat)||m.forward_from_chat;
  const ref=fw?fw.id:/^-?\d+$/.test(t)?Number(t):'@'+t.replace(/^https?:\/\/t\.me\//,'').replace(/^@/,'');
  const c=await tg('getChat',{chat_id:ref}).catch(()=>({}));
  if(!c.ok||!c.result||c.result.type==='private'){await sayFresh(chat,'⚠️ I could not find that channel. Send its @username, or forward a post from it. (/cancel to stop)');return false}
  const id=c.result.id,botId=Number(cfg().token.split(':')[0]);
  const me=await tg('getChatMember',{chat_id:id,user_id:botId}).catch(()=>({}));
  if(!me.ok||!['administrator','creator'].includes(me.result.status)){await sayFresh(chat,'⚠️ I am not an admin in <b>'+h(c.result.title||'that channel')+'</b>. Add me as admin (with "Invite users"), then send it again. (/cancel to stop)');return false}
  const st=await settings();st.channels=st.channels||[];
  if(String(id)===String(cfg().channel)||st.channels.some(x=>String(x.id)===String(id))){await setState();await sayFresh(chat,'ℹ️ That channel is already required.',kb(back));return true}
  if(st.channels.length>=5){await setState();await sayFresh(chat,'⚠️ Maximum 5 extra channels.',kb(back));return true}
  let link=c.result.username?'https://t.me/'+c.result.username:'';
  if(!link){const l=await tg('createChatInviteLink',{chat_id:id,name:'StudyBull gate'}).catch(()=>({}));link=l.ok?l.result.invite_link:''}
  if(!link){await sayFresh(chat,'⚠️ I could not make an invite link. Give me the "Invite users" admin right in that channel and send it again.');return false}
  st.channels.push({id,name:String(c.result.title||'Channel').slice(0,40),link});await saveSettings(st);await setState();
  await sayFresh(chat,'✅ Added <b>'+h(c.result.title)+'</b>. Users now need to join it too. Existing users get locked within 5 minutes until they join it (the site and bot show the Join button).',kb([[{text:'📢 Channels',callback_data:'a:ch'}],...back]));return true}
async function setState(v){await wr(STATE,v||{})}
async function sendTo(id,text){const j=await tg('sendMessage',{chat_id:Number(id),text,disable_web_page_preview:true});return j.ok}
async function ownerText(chat,m){
  const st=(await rd(STATE))||{};const t=String(m.text||'');if(!st.mode)return false;if(st.pm)await del(chat,st.pm);
  if(t==='/cancel'){await setState();await sayFresh(chat,'Cancelled.',kb(back));return true}
  if(st.mode==='find'){await setState();const x=(await rd(IDX))||{u:{}};const q=t.replace(/^@/,'').toLowerCase();
    const hit=Object.entries(x.u).filter(([id,o])=>id===q||(o.un||'').toLowerCase().includes(q)||(o.n||'').toLowerCase().includes(q)).slice(0,8);
    await sayFresh(chat,hit.length?`🔎 <b>${hit.length} result(s)</b>`:'🔎 No match.',kb([...hit.map(([id,o])=>[{text:`👤 ${(o.n||o.un||id).slice(0,24)}`,callback_data:'a:d:'+id}]),...back]));return true}
  if(st.mode==='msgid'){const id=t.replace(/\D/g,'');if(!id){await sayFresh(chat,'Send a numeric Telegram id, or /cancel.');return true}await setState({mode:'msg',id,pm:st.pm});await sayFresh(chat,`✍️ Type the message for <code>${id}</code> (or /cancel).`);return true}
  if(st.mode==='msg'){await setState();const ok=await sendTo(st.id,t);await sayFresh(chat,ok?'✅ Sent.':'⚠️ Could not send (the user may not have started the bot).',kb(back));return true}
  if(st.mode==='bc'){await setState({mode:'bcok',text:t});const x=(await rd(IDX))||{u:{}};const n=Object.values(x.u).filter(o=>o.s).length;
    await sayFresh(chat,`📣 <b>Preview</b>\n\n${h(t)}\n\nSend to <b>${n}</b> users who started the bot?`,kb([[{text:`✅ Send to ${n}`,callback_data:'a:bs'},{text:'✖️ Cancel',callback_data:'a:bx'}]]));return true}
  if(st.mode==='addch'){return addChannel(chat,m)}
  if(st.mode==='welcome'){await setState();const s=await settings();s.welcome=t.slice(0,800);await saveSettings(s);await sayFresh(chat,'✅ Welcome text saved. Preview:\n\n'+h(s.welcome),kb(back));return true}
  return false}
async function adminCb(chat,mid,data,from){
  const p=data.split(':');const k=p[1];
  if(k==='p'){await setState();return panel(chat,mid)}
  if(k==='t'){const s=await settings();s.paused=!s.paused;await saveSettings(s);return panel(chat,mid)}
  if(k==='gm'){const s2=await settings();s2.mode=s2.mode==='every'?'once':'every';await saveSettings(s2);return panel(chat,mid)}
  if(k==='dm'){const s2=await settings();s2.match=s2.match!==true;await saveSettings(s2);return panel(chat,mid)}
  if(k==='gl'){const s2=await settings();s2.login=!s2.login;await saveSettings(s2);return panel(chat,mid)}
  if(k==='ch')return chScreen(chat,mid);
  if(k==='cha'){await setState({pm:mid,mode:'addch'});return edit(chat,mid,'➕ <b>Add a channel</b>\n1. Open the channel > Administrators > add this bot as admin with "Invite users".\n2. Send me the channel @username, or forward any post from it.\n\n(/cancel to stop)')}
  if(k==='chd'){const ex=((await settings()).channels||[])[Number(p[2])];if(!ex)return chScreen(chat,mid);return edit(chat,mid,`🗑 Stop requiring <b>${h(ex.name)}</b>? Users will no longer need to join it.`,kb([[{text:'✅ Yes, remove',callback_data:'a:chy:'+p[2]}],[{text:'✖️ Cancel',callback_data:'a:ch'}]]))}
  if(k==='chy'){const s3=await settings();const ex=(s3.channels||[])[Number(p[2])];if(ex){s3.channels.splice(Number(p[2]),1);await saveSettings(s3)}return chScreen(chat,mid)}
  if(k==='s')return stats(chat,mid);
  if(k==='u')return userList(chat,mid,Number(p[2])||0,false);
  if(k==='b')return userList(chat,mid,Number(p[2])||0,true);
  if(k==='d')return detail(chat,mid,p[2]);
  if(k==='r')return recent(chat,mid);
  if(k==='x'){await exportCsv(chat);return}
  if(k==='f'){await setState({pm:mid,mode:'find'});return edit(chat,mid,'🔎 Send a name, @username or Telegram id to search. (/cancel to stop)')}
  if(k==='bc'){await setState({pm:mid,mode:'bc'});return edit(chat,mid,'📣 Type the broadcast message. It goes to users who started the bot. (/cancel to stop)')}
  if(k==='bx'){await setState();return panel(chat,mid)}
  if(k==='bs'){const st=(await rd(STATE))||{};if(st.mode!=='bcok')return panel(chat,mid);await setState();const x=(await rd(IDX))||{u:{}};let n=0,f=0;
    await edit(chat,mid,'📣 Sending...');for(const [id,o] of Object.entries(x.u)){if(!o.s)continue;const u=await rd(ukey(id));if(u&&u.banned)continue;(await sendTo(id,st.text))?n++:f++}
    return edit(chat,mid,`📣 Done. Sent <b>${n}</b>, failed <b>${f}</b>.`,kb(back))}
  if(k==='mu'){await setState({pm:mid,mode:'msgid'});return edit(chat,mid,'✉️ Send the Telegram id of the user. (/cancel to stop)')}
  if(k==='m'){await setState({pm:mid,mode:'msg',id:p[2]});return edit(chat,mid,`✍️ Type the message for <code>${h(p[2])}</code> (or /cancel).`)}
  if(k==='w'){await setState({pm:mid,mode:'welcome'});const s=await settings();return edit(chat,mid,'👋 <b>Welcome text</b>\nCurrent:\n\n'+(s.welcome?h(s.welcome):'(default)')+'\n\nSend the new text now. (/cancel to stop)',kb([[{text:'↩️ Reset to default',callback_data:'a:wr'}]]))}
  if(k==='wr'){const s=await settings();delete s.welcome;await saveSettings(s);await setState();return panel(chat,mid)}
  if(k==='rc'){await edit(chat,mid,'🔄 Re-checking members...');const x=(await rd(IDX))||{u:{}};let n=0,l=0;
    const ids=Object.keys(x.u).slice(0,100);for(let k=0;k<ids.length;k+=10)await Promise.all(ids.slice(k,k+10).map(async id=>{const u=await rd(ukey(id));if(!u)return;const m=await isMember(Number(id));if(m.ok){u.member=m.member;u.checkedAt=now();await wr(ukey(id),u);n++;if(!m.member)l++}}));
    return edit(chat,mid,`🔄 Checked <b>${n}</b> users, <b>${l}</b> not in the channel.`,kb(back))}
  const id=p[2];const u=id&&await rd(ukey(id));
  if(k==='rv'||k==='bn'||k==='ub'){if(!u)return edit(chat,mid,'No record.',kb(back));if(k==='ub'){u.banned=false;u.removed=false}else{u.devices={};if(k==='bn')u.banned=true}await wr(ukey(id),u);return detail(chat,mid,id)}
  if(k==='rm')return edit(chat,mid,`🗑 <b>Remove access?</b>\n<code>${h(id)}</code> will be signed out of every browser and blocked from the website. They stay in the channel. They can send a request from the bot, and you approve or reject it.`,kb([[{text:'✅ Yes, remove',callback_data:'a:rmy:'+id}],[{text:'✖️ Cancel',callback_data:'a:d:'+id}]]))
  if(k==='rmy'){if(!u)return edit(chat,mid,'No record.',kb(back));
    if(u.code)await wr(ckey(hash(u.code)),{tg:Number(id),off:true});delete u.code;u.devices={};u.removed=true;u.removedAt=now();delete u.req;await wr(ukey(id),u);
    await logEv('leave',Number(id),'web access removed by admin').catch(()=>{});
    await say(id,'🔒 <b>Your web access was removed by the admin.</b>\nTap below to ask for access again.',reqKb(false)).catch(()=>{});
    return edit(chat,mid,`🗑 <b>Access removed</b> for <code>${h(id)}</code>.\nAll browsers are signed out. They are still in the channel and can ask for access again from the bot.`,kb([[{text:'⬅️ Users',callback_data:'a:u:0'}]]))}
  if(k==='ra'||k==='rj'){if(!u)return edit(chat,mid,'No record.',kb(back));
    if(u.req!=='pending')return edit(chat,mid,'ℹ️ This request was already handled.',kb(back));
    if(k==='ra'){u.removed=false;u.banned=false;u.req='approved';await wr(ukey(id),u);
      await say(id,'✅ <b>Approved!</b>\nThe admin approved your request. Tap Verify to get web access again.',kb([[{text:'✅ Verify',callback_data:'v'}]])).catch(()=>{});
      return edit(chat,mid,`✅ Approved <code>${h(id)}</code>. They were told to tap Verify.`,kb(back))}
    u.req='rejected';await wr(ukey(id),u);await say(id,'❌ <b>Your request was not approved.</b>',undefined).catch(()=>{});
    return edit(chat,mid,`❌ Rejected <code>${h(id)}</code>.`,kb(back))}
  if(k==='da'||k==='dr'){if(!u)return edit(chat,mid,'No record.',kb(back));
    if(u.devReq!=='pending')return edit(chat,mid,'ℹ️ This request was already handled.',kb(back));
    if(k==='da'){u.devices={};u.devReq='approved';await wr(ukey(id),u);
      await say(id,'✅ <b>Device change approved.</b>\nOpen StudyBull on your new device and tap Verify.',kb([[{text:'✅ Verify',callback_data:'v'}]])).catch(()=>{});
      return edit(chat,mid,`✅ Approved <code>${h(id)}</code>. The old device is signed out.`,kb(back))}
    u.devReq='rejected';await wr(ukey(id),u);await say(id,'❌ <b>Your device change request was not approved.</b>').catch(()=>{});
    return edit(chat,mid,`❌ Rejected <code>${h(id)}</code>.`,kb(back))}
  if(k==='nc'){if(!u)return edit(chat,mid,'No record.',kb(back));await userCode(id,true);return detail(chat,mid,id)}
}
async function requestAccess(chat,from,mid){
  const uid=from.id;const u=await rd(ukey(uid));
  if(!u||(!u.banned&&!u.removed)){return verifyFlow(chat,uid,'',from,mid)}
  if(u.req==='pending'){return edit(chat,mid,'⏳ <b>Your request is already with the admin.</b>\nYou will get a message when it is decided.\n\nYour ID: <code>'+uid+'</code>')}
  u.req='pending';u.reqAt=now();await wr(ukey(uid),u);
  await edit(chat,mid,'✅ <b>Request sent.</b>\nThe admin will review it. You will get a message here when it is decided.\n\nYour ID: <code>'+uid+'</code>');
  const o=await rd(OWN);if(o&&o.id){const nm=h([from.first_name,from.last_name].filter(Boolean).join(' ')||'User')+(from.username?' @'+h(from.username):'');
    await say(o.id,`📥 <b>Access request</b>\n${nm}\nID: <code>${uid}</code>\nStatus: ${u.banned?'🚫 banned':'🔒 access removed'}`,kb([[{text:'✅ Approve',callback_data:'a:ra:'+uid},{text:'❌ Reject',callback_data:'a:rj:'+uid}],[{text:'👤 Details',callback_data:'a:d:'+uid}]]))}
}
const USER_CMDS=[['start','Start or verify'],['access','Get access to the website'],['site','Open StudyBull'],['help','Show all commands']];
const OWNER_CMDS=[['admin','Open the admin panel'],['stats','Dashboard'],['users','User list'],['find','Search a user'],['recent','Recent joins and leaves'],['channels','Required channels'],['pause','Pause the gate'],['resume','Turn the gate live'],...USER_CMDS.slice(1)];
const cmd=a=>a.map(([command,description])=>({command,description}));
export async function setMenu(ownerId){
  await tg('setMyCommands',{commands:cmd(USER_CMDS)}).catch(()=>{});
  if(ownerId)await tg('setMyCommands',{commands:cmd(OWNER_CMDS),scope:{type:'chat',chat_id:ownerId}}).catch(()=>{});
  await tg('setChatMenuButton',{menu_button:{type:'commands'}}).catch(()=>{})}
async function ensureMenu(){const st=await settings();if(st.menuV===1)return;st.menuV=1;await saveSettings(st);const o=await rd(OWN);await setMenu(o&&o.id)}
const HELP_USER='📖 <b>Commands</b>\n/start - start or verify\n/access - get access to the website\n/site - open StudyBull\n/help - this list';
const HELP_OWNER='📖 <b>Admin commands</b>\n/admin - open the panel\n/stats - dashboard\n/users - user list\n/find - search a user\n/recent - recent joins and leaves\n/channels - required channels\n/pause - pause the gate\n/resume - turn the gate live\n\n<b>User commands</b>\n/access - get access\n/site - open StudyBull';
export async function handleUpdate(up,base){
  if(up.callback_query){const q=up.callback_query;const ack=tg('answerCallbackQuery',{callback_query_id:q.id}).catch(()=>{});
    const chat=q.message?.chat?.id,mid=q.message?.message_id;if(!chat){await ack;return}
    await Promise.all([ack,cbRoute(q,chat,mid,base)]);return}
  if(up.chat_member)return memberEvent(up.chat_member,base);
  const m=up.message;if(!m||m.chat?.type!=='private'||!m.from)return;
  await Promise.all([del(m.chat.id,m.message_id),onMessage(m,base)])}
async function cbRoute(q,chat,mid,base){
    if(q.data==='dc'){await touch(q.from,{s:true});return deviceChange(chat,q.from,mid)}
    if(q.data==='rq'){await touch(q.from,{s:true});return requestAccess(chat,q.from,mid)}
    if(q.data==='v'){await touch(q.from,{s:true});return verifyFlow(chat,q.from.id,base,q.from,mid)}
    if(q.data&&q.data.startsWith('a:')&&await isOwner(q.from.id))return adminCb(chat,mid,q.data,q.from)}
async function memberEvent(cm,base){
  const usr=cm.new_chat_member?.user,uid=usr?.id;if(!uid)return;const member=isM(cm.new_chat_member);
  const was=cm.old_chat_member?isM(cm.old_chat_member):false;
  const chs=await channels();const primary=!cm.chat||String(cm.chat.id)===String(cfg().channel);
  if(!primary&&!chs.some(c=>String(c.id)===String(cm.chat.id)))return;
  if(member!==was)await logEv(member?'join':'leave',uid,usr.first_name).catch(()=>{});
  // u.member means: member of every required channel
  let all=member,missing=[];if(chs.length>1){const mm=await isMember(uid);if(mm.ok){all=mm.member;missing=mm.missing||[]}else all=false}
  let u=await rd(ukey(uid));if(u){u.member=all;u.checkedAt=now();await wr(ukey(uid),u)}
  const link=cm.invite_link?.invite_link;
  if(primary&&member&&!was&&link){const inv=await invDevice(link),dev=inv&&inv.dev;
    if(dev&&!(u&&(u.banned||u.removed))){
      const x=(await rd(IDX))||{u:{}};const started=x.u[uid]&&x.u[uid].s;
      if(!all){if(started&&missing.length)await say(uid,`✅ Joined. Please also join: <b>${missing.map(c=>h(c.name)).join(', ')}</b>, then tap Verify.`,kb(joinRows(missing)));return}
      {const bs=await bindState(uid,dev);if(bs){if(started)await say(uid,LOCKED_MSG[bs],bs==='locked'?dcKb(false):undefined);return}}
      await touch(usr,{src:'invite'});await userCode(uid,false,usr);await linkDevice(uid,dev);const code=await deviceLink(uid,dev);
      if(started){await say(uid,'✅ <b>Verified automatically!</b>\nThanks for joining. Your StudyBull Batches are unlocked on the browser you came from.',kb(siteBtn(base,code,inv.origin)))}}}
}
async function bindBid(chat,m,base,id){
  const uid=m.from.id,rk=`gate/rl-${uid}.json`;const r=(await rd(rk))||{n:0,t:now()};if(now()-r.t>3600){r.n=0;r.t=now()}
  if(r.n>=10)return sayFresh(chat,'⏳ Too many tries. Please wait a while and try again.');
  r.n++;await wr(rk,r);
  const dev=await bidDev(id);
  if(!dev)return sayFresh(chat,'❓ <b>That browser ID was not found.</b>\nOpen StudyBull and copy the ID again.');
  const u1=await rd(ukey(uid));if(u1&&(u1.banned||u1.removed))return verifyFlow(chat,uid,base,m.from);
  const d=await rd(dkey(dev));
  if(d&&d.tg!==uid){const ou=await rd(ukey(d.tg));if(ou&&ou.devices&&ou.devices[hash(dev)]&&!ou.banned&&!ou.removed&&ou.member!==false)return sayFresh(chat,'🔒 <b>That browser is already active</b> on another account. It cannot be moved.')}
  await typing(chat);
  const mm=await isMember(uid);
  if(!mm.ok)return sayFresh(chat,'⚠️ <b>Could not check right now.</b>\nTry again in a minute.',kb([[{text:'🔄 Try again',callback_data:'v'}]]));
  if(!mm.member)return sayFresh(chat,'😕 <b>You have not joined yet</b>\nJoin the channel first, then send the ID again.',kb(joinRows(mm.missing)));
  {const bs=await bindState(uid,dev);if(bs)return lockedReply(chat,uid,bs)}
  await touch(m.from,{s:true});await userCode(uid,false,m.from);await linkDevice(uid,dev);
  return finalFx(chat,undefined,'✅ <b>Browser linked!</b>\nGo back to the StudyBull site, it unlocks by itself. You can close this chat.\n\n🚪 If you leave a required channel, access locks again')}
async function onMessage(m,base){
  const chat=m.chat.id,t=String(m.text||'');
  const cl=t.match(/^\/claim\s+([a-f0-9]{12})$/);
  if(cl){const o=await rd(OWN);if(!(o&&o.id)){const c0=await rd('gate/claim.json');if(c0&&c0.exp>now()&&c0.h===hash(cl[1])){await wr(OWN,{id:m.from.id,at:now()});await wr('gate/claim.json',{h:'',exp:0});await touch(m.from,{s:true});_own=m.from.id;await say(chat,'👑 <b>You are the owner now.</b>\nOpening your panel...');await setMenu(m.from.id);return panel(chat)}}return}
  const own=await isOwner(m.from.id);
  if(!own)await touch(m.from,{s:true});
  await ensureMenu();
  if(/^\/help\b/.test(t))return sayFresh(chat,own?HELP_OWNER:HELP_USER);
  if(/^\/site\b/.test(t))return sayFresh(chat,'🔗 <b>StudyBull</b>\n'+siteUrl(),kb([[{text:'🚀 Open StudyBull',url:siteUrl()}]]));
  const bm=t.match(/^\/?(?:(?:start|get access|access)\s+)?(rs-[a-z0-9]{6})\s*$/i);if(bm)return bindBid(chat,m,base,bm[1].toLowerCase());
  if(own){
    if(/^\/verify\b/.test(t))return welcome(chat,m.from,base);
    if(/^\/(admin|panel|start)\b/.test(t)&&!/^\/start\s+\S/.test(t)){const st0=await settings();if(!st0.ownerPin){st0.ownerPin=1;await saveSettings(st0);await pinLink(chat,'👑 <b>StudyBull admin</b>\nSend /admin to open your panel.\nWebsite: '+siteUrl())}await Promise.all([setState(),panel(chat)]);return}
    if(/^\/(stats|users|recent|find|status|pause|resume|channels)\b/.test(t)){const c=t.split(/\s+/)[0];
      if(c==='/stats')return stats(chat);if(c==='/users')return userList(chat,null,0,false);if(c==='/recent')return recent(chat);
      if(c==='/pause'||c==='/resume'){const s=await settings();s.paused=c==='/pause';await saveSettings(s);return panel(chat)}
      if(c==='/status')return panel(chat);if(c==='/channels')return chScreen(chat);
      if(c==='/find'){await setState({mode:'find'});const q=t.split(/\s+/).slice(1).join(' ');if(q){m.text=q;if(await ownerText(chat,m))return}return sayFresh(chat,'🔎 Send a name, @username or Telegram id.')}}
    if(!t.startsWith('/')&&await ownerText(chat,m))return;
    if(t==='/cancel'&&await ownerText(chat,m))return}
  if(/^\/?(get access|access)\s*$/i.test(t))return verifyFlow(chat,m.from.id,base,m.from);
  if(t.length<60&&/(not\s*work|nahi\s*chal|nhi\s*chal|nahin\s*chal|kaam\s*nahi|new\s*link|naya\s*link|link\s*(expired|error|issue|problem))/i.test(t)){
    const rk=`gate/rl-${m.from.id}.json`;const r=(await rd(rk))||{n:0,t:now()};if(now()-r.t>3600){r.n=0;r.t=now()}
    if(r.n>=10)return sayFresh(chat,'⏳ Too many tries. Please wait a while and try again.');r.n++;await wr(rk,r);
    const mm=await isMember(m.from.id),u2=await rd(ukey(m.from.id));
    if(u2&&(u2.banned||u2.removed))return verifyFlow(chat,m.from.id,base,m.from);
    if(mm.ok&&mm.member){await userCode(m.from.id,false,m.from);const nl=await deviceLink(m.from.id);return sayFresh(chat,'🔗 <b>Here is a new link.</b>\nOpen it on the browser you want to unlock. It works only on the first browser that opens it, so do not share it.',kb(siteBtn(base,nl)))}
    return welcome(chat,m.from,base)}
  if(/^\/reset\b/.test(t)){const mm=await isMember(m.from.id);if(mm.ok&&mm.member&&!(await isBanned(m.from.id))){await userCode(m.from.id,true,m.from);const nc=await deviceLink(m.from.id);return sayFresh(chat,'🔑 <b>New link made.</b> The old link no longer works. Browsers already unlocked stay unlocked.',kb(siteBtn(base,nc)))}return welcome(chat,m.from,base)}
  const code=(t.match(/^\/start\s+([A-Za-z0-9_-]{6,40})$/)||[])[1];
  if(!code){return welcome(chat,m.from,base)}
  const p=await rd(pkey(code));
  if(!p||p.exp<now()){return welcome(chat,m.from,base)}
  {const u1=await rd(ukey(m.from.id));if(u1&&(u1.banned||u1.removed))return verifyFlow(chat,m.from.id,base,m.from)}
  {const bs0=await bindState(m.from.id,p.dev);if(bs0)return lockedReply(chat,m.from.id,bs0)}
  {const u2=await rd(ukey(m.from.id));
   if(u2&&u2.member===true&&u2.code){const m2=await isMember(m.from.id);
     if(m2.ok&&m2.member){await linkDevice(m.from.id,p.dev);await wr(pkey(code),{dev:p.dev,exp:0});await touch(m.from,{s:true});const uc2=await deviceLink(m.from.id,p.dev);
       return sayFresh(chat,'✅ <b>Browser linked</b>\nGo back to the StudyBull site, it unlocks by itself. You can close this chat.',kb(siteBtn(base,uc2,p.origin)))}
     if(m2.ok&&!m2.member){u2.member=false;u2.checkedAt=now();await wr(ukey(m.from.id),u2)}}}
  await typing(chat);
  const first=await sayFresh(chat,`🔍 <b>Checking your membership</b>\n${bar(1)} ${SPIN[0]}`);const mid=first?.result?.message_id;
  const [mm]=await Promise.all([isMember(m.from.id),sleep(600)]);
  if(!mm.ok){await edit(chat,mid,'⚠️ <b>Could not check right now.</b>\nTry again in a minute.',kb([[{text:'🔄 Try again',callback_data:'v'}]]));return}
  if(!mm.member){await edit(chat,mid,'😕 <b>You have not joined yet</b>\nJoin the channel first, then tap Verify.',kb(joinRows(mm.missing)));return}
  await edit(chat,mid,`🔐 <b>Linking your browser</b>\n${bar(4)} ✨`);
  await linkDevice(m.from.id,p.dev);await wr(pkey(code),{dev:p.dev,exp:0});await userCode(m.from.id,false,m.from);const uc=await deviceLink(m.from.id,p.dev);await sleep(400);
  await finalFx(chat,mid,'✅ <b>Verified!</b>\nGo back to the StudyBull site, it unlocks by itself. You can close this chat.',kb(siteBtn(base,uc,p.origin)))}
