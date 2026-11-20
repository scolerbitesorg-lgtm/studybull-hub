// Bot experience (staged, animated messages) and owner panel. Only touches users who interacted with the bot or joined through the gate.
import {cfg,rd,wr,now,hash,tg,tgDoc,isM,isMember,ukey,userCode,linkDevice,pkey,invDevice,settings,saveSettings,touch,logEv,IDX,LOG,OWN,STATE} from './_gate.js';
const h=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const sleep=ms=>process.env.GATE_MEM?Promise.resolve():new Promise(r=>setTimeout(r,ms));
const say=(chat,text,extra)=>tg('sendMessage',{chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true,...extra});
const edit=async(chat,mid,text,extra)=>{if(!mid)return say(chat,text,extra);const j=await tg('editMessageText',{chat_id:chat,message_id:mid,text,parse_mode:'HTML',disable_web_page_preview:true,...extra});if(!j.ok&&!/not modified/i.test(j.description||''))return say(chat,text,extra);return j};
const typing=chat=>tg('sendChatAction',{chat_id:chat,action:'typing'}).catch(()=>{});
const kb=rows=>({reply_markup:{inline_keyboard:rows}});
const bar=(n,t=5)=>'▰'.repeat(n)+'▱'.repeat(t-n);
const DEFAULT_WELCOME='👋 <b>Welcome to StudyBull</b>\nJoin our channel to unlock Batches and course videos. It takes a few seconds.';
const siteBtn=(base,code)=>{const site=cfg().site||base;return site?[[{text:'🚀 Open StudyBull',url:`${site}/#unlock=${code}`}]]:[]};
const joinRows=()=>{const c=cfg();return [...(c.link?[[{text:'📢 Join channel',url:c.link}]]:[]),[{text:'🔄 I have joined, Verify',callback_data:'v'}]]};
async function isBanned(uid){const u=await rd(ukey(uid));return !!(u&&u.banned)}
// staged, edit-in-place verification
async function verifyFlow(chat,uid,base,from,mid){
  if(await isBanned(uid)){await edit(chat,mid,'🚫 <b>Access is blocked</b> for this account.');return}
  await typing(chat);
  const first=await edit(chat,mid,`🔍 <b>Checking your membership</b>\n${bar(1)}`);
  mid=mid||first?.result?.message_id;
  const [mm]=await Promise.all([isMember(uid),sleep(700)]);
  await edit(chat,mid,`🔍 <b>Checking your membership</b>\n${bar(3)}`);await sleep(500);
  if(!mm.ok){await edit(chat,mid,'⚠️ <b>Could not check right now.</b>\nTry again in a minute.',kb([[{text:'🔄 Try again',callback_data:'v'}]]));return}
  if(!mm.member){await edit(chat,mid,'😕 <b>You have not joined yet</b>\nJoin the channel first, then tap Verify.',kb(joinRows()));return}
  await edit(chat,mid,`🔐 <b>Creating your access</b>\n${bar(5)}`);
  const code=await userCode(uid,false,from);await touch(from,{s:true});await sleep(400);
  await edit(chat,mid,`✅ <b>Verified!</b>\n\nYour account is linked. Tap the button to open StudyBull and Batches unlock on that browser.\n\n🔑 Up to ${cfg().maxDevices} browsers at a time\n🚪 If you leave the channel, access locks again`,kb(siteBtn(base,code)))}
async function welcome(chat,from,base){await touch(from,{s:true});const st=await settings();await say(chat,st.welcome?h(st.welcome):DEFAULT_WELCOME);await verifyFlow(chat,from.id,base,from)}
const isOwner=async id=>{const o=await rd(OWN);return !!(o&&o.id&&o.id===id)};
// ---- owner panel ----
async function userStatus(id){const u=await rd(ukey(id));if(!u)return {label:'no record',u:null};return {u,label:u.banned?'🚫 banned':(u.member===false?'🚪 left':'✅ member')}}
async function panel(chat,mid){
  const st=await settings(),x=(await rd(IDX))||{u:{}};const ids=Object.keys(x.u);const started=ids.filter(i=>x.u[i].s).length;
  const text=`🛠 <b>StudyBull Admin</b>\n\nGate: ${st.paused?'🔴 <b>PAUSED</b> (everyone has access)':'🟢 <b>LIVE</b>'}\nUsers: <b>${ids.length}</b> · started bot: <b>${started}</b>`;
  await edit(chat,mid,text,kb([
    [{text:st.paused?'🟢 Turn gate LIVE':'🔴 Pause gate',callback_data:'a:t'}],
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
  if(onlyBanned){const keep=[];for(const r of rows){const u=await rd(ukey(r[0]));if(u&&u.banned)keep.push(r)}rows=keep}
  const per=8,pages=Math.max(1,Math.ceil(rows.length/per));page=Math.min(Math.max(0,page),pages-1);const sl=rows.slice(page*per,page*per+per);
  const pre=onlyBanned?'a:b:':'a:u:';
  const btn=sl.map(([id,o])=>[{text:`👤 ${(o.n||o.un||id).slice(0,24)}`,callback_data:'a:d:'+id}]);
  const nav=[];if(page>0)nav.push({text:'◀️',callback_data:pre+(page-1)});nav.push({text:`${page+1}/${pages}`,callback_data:'a:p'});if(page<pages-1)nav.push({text:'▶️',callback_data:pre+(page+1)});
  await edit(chat,mid,`${onlyBanned?'🚫 <b>Banned users</b>':'👥 <b>Users</b>'} (${rows.length})\nTap a user for details.`,kb([...btn,nav,...back]))}
async function detail(chat,mid,id){
  const x=(await rd(IDX))||{u:{}};const o=x.u[id]||{};const {u,label}=await userStatus(id);
  if(!u&&!x.u[id]){await edit(chat,mid,'No record for <code>'+h(id)+'</code>.',kb(back));return}
  const text=`👤 <b>${h(o.n||'Unknown')}</b> ${o.un?'@'+h(o.un):''}\nID: <code>${id}</code>\nStatus: ${label}\nFirst seen: ${when(o.at)}\nLast seen: ${when(o.seen)}\nStarted bot: ${o.s?'yes':'no'}\nBrowsers linked: ${u?Object.keys(u.devices||{}).length:0}\nLast membership check: ${u?when(u.checkedAt):'-'}`;
  await edit(chat,mid,text,kb([[{text:'🔒 Sign out browsers',callback_data:'a:rv:'+id},{text:u&&u.banned?'✅ Unban':'🚫 Ban',callback_data:(u&&u.banned?'a:ub:':'a:bn:')+id}],[{text:'🔑 New code',callback_data:'a:nc:'+id},{text:'✉️ Message',callback_data:'a:m:'+id}],[{text:'⬅️ Users',callback_data:'a:u:0'}]]))}
async function stats(chat,mid){
  const x=(await rd(IDX))||{u:{}};const ids=Object.keys(x.u);let mem=0,ban=0,left=0,dev=0;
  for(const id of ids.slice(0,300)){const u=await rd(ukey(id));if(!u)continue;if(u.banned)ban++;else if(u.member===false)left++;else if(u.member)mem++;dev+=Object.keys(u.devices||{}).length}
  let cnt='?';try{const j=await tg('getChatMemberCount',{chat_id:cfg().channel});if(j.ok)cnt=j.result}catch{}
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
async function setState(v){await wr(STATE,v||{})}
async function sendTo(id,text){const j=await tg('sendMessage',{chat_id:Number(id),text,disable_web_page_preview:true});return j.ok}
async function ownerText(chat,m){
  const st=(await rd(STATE))||{};const t=String(m.text||'');if(!st.mode)return false;
  if(t==='/cancel'){await setState();await say(chat,'Cancelled.',kb(back));return true}
  if(st.mode==='find'){await setState();const x=(await rd(IDX))||{u:{}};const q=t.replace(/^@/,'').toLowerCase();
    const hit=Object.entries(x.u).filter(([id,o])=>id===q||(o.un||'').toLowerCase().includes(q)||(o.n||'').toLowerCase().includes(q)).slice(0,8);
    await say(chat,hit.length?`🔎 <b>${hit.length} result(s)</b>`:'🔎 No match.',kb([...hit.map(([id,o])=>[{text:`👤 ${(o.n||o.un||id).slice(0,24)}`,callback_data:'a:d:'+id}]),...back]));return true}
  if(st.mode==='msgid'){const id=t.replace(/\D/g,'');if(!id){await say(chat,'Send a numeric Telegram id, or /cancel.');return true}await setState({mode:'msg',id});await say(chat,`✍️ Type the message for <code>${id}</code> (or /cancel).`);return true}
  if(st.mode==='msg'){await setState();const ok=await sendTo(st.id,t);await say(chat,ok?'✅ Sent.':'⚠️ Could not send (the user may not have started the bot).',kb(back));return true}
  if(st.mode==='bc'){await setState({mode:'bcok',text:t});const x=(await rd(IDX))||{u:{}};const n=Object.values(x.u).filter(o=>o.s).length;
    await say(chat,`📣 <b>Preview</b>\n\n${h(t)}\n\nSend to <b>${n}</b> users who started the bot?`,kb([[{text:`✅ Send to ${n}`,callback_data:'a:bs'},{text:'✖️ Cancel',callback_data:'a:bx'}]]));return true}
  if(st.mode==='welcome'){await setState();const s=await settings();s.welcome=t.slice(0,800);await saveSettings(s);await say(chat,'✅ Welcome text saved. Preview:\n\n'+h(s.welcome),kb(back));return true}
  return false}
async function adminCb(chat,mid,data,from){
  const p=data.split(':');const k=p[1];
  if(k==='p'){await setState();return panel(chat,mid)}
  if(k==='t'){const s=await settings();s.paused=!s.paused;await saveSettings(s);return panel(chat,mid)}
  if(k==='s')return stats(chat,mid);
  if(k==='u')return userList(chat,mid,Number(p[2])||0,false);
  if(k==='b')return userList(chat,mid,Number(p[2])||0,true);
  if(k==='d')return detail(chat,mid,p[2]);
  if(k==='r')return recent(chat,mid);
  if(k==='x'){await exportCsv(chat);return}
  if(k==='f'){await setState({mode:'find'});return edit(chat,mid,'🔎 Send a name, @username or Telegram id to search. (/cancel to stop)')}
  if(k==='bc'){await setState({mode:'bc'});return edit(chat,mid,'📣 Type the broadcast message. It goes to users who started the bot. (/cancel to stop)')}
  if(k==='bx'){await setState();return panel(chat,mid)}
  if(k==='bs'){const st=(await rd(STATE))||{};if(st.mode!=='bcok')return panel(chat,mid);await setState();const x=(await rd(IDX))||{u:{}};let n=0,f=0;
    await edit(chat,mid,'📣 Sending...');for(const [id,o] of Object.entries(x.u)){if(!o.s)continue;const u=await rd(ukey(id));if(u&&u.banned)continue;(await sendTo(id,st.text))?n++:f++}
    return edit(chat,mid,`📣 Done. Sent <b>${n}</b>, failed <b>${f}</b>.`,kb(back))}
  if(k==='mu'){await setState({mode:'msgid'});return edit(chat,mid,'✉️ Send the Telegram id of the user. (/cancel to stop)')}
  if(k==='m'){await setState({mode:'msg',id:p[2]});return edit(chat,mid,`✍️ Type the message for <code>${h(p[2])}</code> (or /cancel).`)}
  if(k==='w'){await setState({mode:'welcome'});const s=await settings();return edit(chat,mid,'👋 <b>Welcome text</b>\nCurrent:\n\n'+(s.welcome?h(s.welcome):'(default)')+'\n\nSend the new text now. (/cancel to stop)',kb([[{text:'↩️ Reset to default',callback_data:'a:wr'}]]))}
  if(k==='wr'){const s=await settings();delete s.welcome;await saveSettings(s);await setState();return panel(chat,mid)}
  if(k==='rc'){await edit(chat,mid,'🔄 Re-checking members...');const x=(await rd(IDX))||{u:{}};let n=0,l=0;
    for(const id of Object.keys(x.u).slice(0,100)){const u=await rd(ukey(id));if(!u)continue;const m=await isMember(Number(id));if(m.ok){u.member=m.member;u.checkedAt=now();await wr(ukey(id),u);n++;if(!m.member)l++}}
    return edit(chat,mid,`🔄 Checked <b>${n}</b> users, <b>${l}</b> not in the channel.`,kb(back))}
  const id=p[2];const u=id&&await rd(ukey(id));
  if(k==='rv'||k==='bn'||k==='ub'){if(!u)return edit(chat,mid,'No record.',kb(back));if(k==='ub')u.banned=false;else{u.devices={};if(k==='bn')u.banned=true}await wr(ukey(id),u);return detail(chat,mid,id)}
  if(k==='nc'){if(!u)return edit(chat,mid,'No record.',kb(back));await userCode(id,true);return detail(chat,mid,id)}
}
export async function handleUpdate(up,base){
  if(up.callback_query){const q=up.callback_query;await tg('answerCallbackQuery',{callback_query_id:q.id}).catch(()=>{});
    const chat=q.message?.chat?.id,mid=q.message?.message_id;if(!chat)return;
    if(q.data==='v'){await touch(q.from,{s:true});return verifyFlow(chat,q.from.id,base,q.from,mid)}
    if(q.data&&q.data.startsWith('a:')&&await isOwner(q.from.id))return adminCb(chat,mid,q.data,q.from);return}
  if(up.chat_member){
    const cm=up.chat_member,usr=cm.new_chat_member?.user,uid=usr?.id;if(!uid)return;const member=isM(cm.new_chat_member);
    const was=cm.old_chat_member?isM(cm.old_chat_member):false;
    if(member!==was)await logEv(member?'join':'leave',uid,usr.first_name).catch(()=>{});
    let u=await rd(ukey(uid));if(u){u.member=member;u.checkedAt=now();await wr(ukey(uid),u)}
    const link=cm.invite_link?.invite_link;
    if(member&&!was&&link){const dev=await invDevice(link);
      if(dev&&!(u&&u.banned)){await touch(usr,{src:'invite'});const code=await userCode(uid,false,usr);await linkDevice(uid,dev);
        const x=(await rd(IDX))||{u:{}};if(x.u[uid]&&x.u[uid].s){await say(uid,'✅ <b>Verified automatically!</b>\nThanks for joining. Your StudyBull Batches are unlocked on the browser you came from.',kb(siteBtn(base,code)))}}}
    return}
  const m=up.message;if(!m||m.chat?.type!=='private'||!m.from)return;
  const chat=m.chat.id,t=String(m.text||'');
  const cl=t.match(/^\/claim\s+([a-f0-9]{12})$/);
  if(cl){const o=await rd(OWN);if(!(o&&o.id)){const c0=await rd('gate/claim.json');if(c0&&c0.exp>now()&&c0.h===hash(cl[1])){await wr(OWN,{id:m.from.id,at:now()});await wr('gate/claim.json',{h:'',exp:0});await touch(m.from,{s:true});await say(chat,'👑 <b>You are the owner now.</b>\nOpening your panel...');return panel(chat)}}return}
  await touch(m.from,{s:true});
  if(await isOwner(m.from.id)){
    if(/^\/verify\b/.test(t))return welcome(chat,m.from,base);
    if(/^\/(admin|panel|start)\b/.test(t)&&!/^\/start\s+\S/.test(t)){await setState();return panel(chat)}
    if(/^\/(stats|users|recent|find|status|pause|resume|help)\b/.test(t)){const c=t.split(/\s+/)[0];
      if(c==='/stats')return stats(chat);if(c==='/users')return userList(chat,null,0,false);if(c==='/recent')return recent(chat);
      if(c==='/pause'||c==='/resume'){const s=await settings();s.paused=c==='/pause';await saveSettings(s);return panel(chat)}
      if(c==='/status'||c==='/help')return panel(chat);
      if(c==='/find'){await setState({mode:'find'});const q=t.split(/\s+/).slice(1).join(' ');if(q){m.text=q;if(await ownerText(chat,m))return}return say(chat,'🔎 Send a name, @username or Telegram id.')}}
    if(!t.startsWith('/')&&await ownerText(chat,m))return;
    if(t==='/cancel'&&await ownerText(chat,m))return}
  if(/^\/reset\b/.test(t)){const mm=await isMember(m.from.id);if(mm.ok&&mm.member&&!(await isBanned(m.from.id))){const nc=await userCode(m.from.id,true,m.from);return say(chat,'🔑 <b>New link made.</b> The old link no longer works. Browsers already unlocked stay unlocked.',kb(siteBtn(base,nc)))}return welcome(chat,m.from,base)}
  const code=(t.match(/^\/start\s+([A-Za-z0-9_-]{6,40})$/)||[])[1];
  if(!code){return welcome(chat,m.from,base)}
  const p=await rd(pkey(code));
  if(!p||p.exp<now()){return welcome(chat,m.from,base)}
  if(await isBanned(m.from.id)){await say(chat,'🚫 <b>Access is blocked</b> for this account.');return}
  await typing(chat);
  const first=await say(chat,`🔍 <b>Checking your membership</b>\n${bar(1)}`);const mid=first?.result?.message_id;
  const [mm]=await Promise.all([isMember(m.from.id),sleep(700)]);
  if(!mm.ok){await edit(chat,mid,'⚠️ <b>Could not check right now.</b>\nTry again in a minute.',kb([[{text:'🔄 Try again',callback_data:'v'}]]));return}
  if(!mm.member){await edit(chat,mid,'😕 <b>You have not joined yet</b>\nJoin the channel first, then tap Verify.',kb(joinRows()));return}
  await edit(chat,mid,`🔐 <b>Linking your browser</b>\n${bar(4)}`);
  await linkDevice(m.from.id,p.dev);await wr(pkey(code),{dev:p.dev,exp:0});const uc=await userCode(m.from.id,false,m.from);await sleep(400);
  await edit(chat,mid,'✅ <b>Verified!</b>\nGo back to the StudyBull site, it unlocks by itself. You can close this chat.',kb(siteBtn(base,uc)))}
