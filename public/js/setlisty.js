// ---------- Baza utworów (zakładka BAZA) ----------
const SONGS = [
 ["intro","Intro","g min",2,"-",""],
 ["twoj-zew","Twój Zew (uku)","g min",2,"4/4","86"],
 ["klos","Kłos","c min",6,"7/4","124"],
 ["ciemna","^Ciemna (KLIK)","c# min",6,"4/4","90"],
 ["biegnac","^Biegnąc (no DRUMS) (uku)","a min",4,"4/4","80"],
 ["dwa-serduszka","^Dwa Serduszka (uku)","g min",5,"5/4","162"],
 ["intro-rumiane","Intro Rumiane Słońce","a min",1,"-",""],
 ["rumiane","^Rumiane Słońce (uku)","a min / bb maj",3,"4/4","93"],
 ["woda","^Woda (uku)","e min",4,"5/4","170"],
 ["hen","^Hen (KLIK) (uku)","b min",4,"4/4","94"],
 ["szesc-prawd","Sześć Prawd (uku)","d maj",4,"-",""],
 ["nie-ma-wody","Nie Ma Wody Na Pustyni","e maj",4,"4/4","160"],
 ["nieboschron","Nieboschron","c min",4,"7/4","160"],
 ["dziewczyna","Dziewczyna Szamana","eb min",4,"",""],
 ["pod-jaworem","Pod Jaworem","g min",3,"4/4","120"],
 ["szczur","Szczur","e min",4,"-",""],
 ["jesiony","^Jesiony, Jeziora","a min",3,"4/4","120"],
 ["spokoj","Spokój (uku)","e min",6,"4/4","72"],
 ["ku-progu","Ku Progu (solo)","c min",3,"4/4","120"],
 ["tempo","Tempo","c min",3,"4/4","104 / 99 / 104"],
 ["przed-zmierzchem","Przed Zmierzchem","c min",4,"4/4",""],
 ["roza","^Róża","a min",5,"4/4","96 / 116 / 96 / 126"],
 ["gdybym","Gdybym Ci Ja Była","c min",3,"4/4","55"],
 ["wiatrem","Wiatrem Czesane (uku)","a min",4,"3/4","156"],
 ["epitafium","Epitafium (no DRUMS)","f# min",6,"4/4","170 / 142 / 170 / 142"],
 ["nasze-gry","Nasze Gry (no DRUMS)","bb min",3,"4/4","60"],
 ["zapiera","^Zapiera Mi Dech (uku)","g maj",4,"3/4","162"],
 ["janek","Janek Goniec","g min",4,"4/4","115"],
 ["serce","Serce","c maj",3,"4/4",""],
 ["skity","Skity i Gadanie","",0,"-",""],
].map(([id,raw,key,min,meter,tempo])=>{
  const caret = raw.startsWith("^");
  const tags = [...raw.matchAll(/\(([^)]+)\)/g)].map(m=>m[1]);
  const name = raw.replace(/^\^/,"").replace(/\s*\([^)]+\)/g,"").trim();
  return {id,raw,name,caret,tags,key,sec:min*60,meter:meter==="-"?"":meter,tempo};
});
const BY = Object.fromEntries(SONGS.map(s=>[s.id,s]));
// "Skity i Gadanie": 1 minute for every other song on the setlist
const PER_SONG = {skity:60};
function dur(id,set){
  if(PER_SONG[id]===undefined)return BY[id]?BY[id].sec:0;
  const others=set?set.items.filter(i=>i.t==="s"&&BY[i.id]&&PER_SONG[i.id]===undefined).length:0;
  return others*PER_SONG[id];
}

// ---------- helpers ----------
const $ = s=>document.querySelector(s);
const esc = s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const hms = s=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h+":"+String(m).padStart(2,"0")+":"+String(x).padStart(2,"0")};
const ms = s=>Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
const hm = s=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+" h "+m+" min":m+" min"};
const uid = ()=>Math.random().toString(36).slice(2,10);
const ICON = {
  grip:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
function tagHTML(tags){return tags.map(t=>`<span class="tag${/drums/i.test(t)?" nodrums":""}">${esc(t)}</span>`).join("")}
function nameHTML(s){return `${s.caret?'<span class="caret" title="oznaczenie ^">^</span>':""}<span>${esc(s.name)}</span>${tagHTML(s.tags)}`}

// ---------- state ----------
let sets = {};          // id -> {name,date,venue,items,updated}
let cur = null;
let loaded = false;      // false until the first GET /setlisty/api/sets resolves
let editor = null;      // e-mail of the signed-in editor, or null (read-only view)
let clientId = null;    // Google client id for the login button, null when login is not configured
let saveTimers = {};
function lsGet(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function status(t){$("#status").textContent=t}

function current(){return sets[cur]}
function songsIn(set){return set.items.filter(i=>i.t==="s"&&BY[i.id])}

async function api(method,url,body){
  const r=await fetch(url,{method,credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data.error||"HTTP "+r.status);e.status=r.status;throw e}
  return data;
}
function saveError(e){
  if(e.status===401){editor=null;applyMode();status("Sesja wygasła — zaloguj się ponownie")}
  else status(e.message||"Nie udało się zapisać");
}

function scheduleSave(id){
  if(!sets[id]||!editor)return;
  sets[id].updated=Date.now();
  status("Zapisywanie…");
  clearTimeout(saveTimers[id]);
  saveTimers[id]=setTimeout(async()=>{
    const s=sets[id]; if(!s){delete saveTimers[id];return}
    try{await api("PUT","/setlisty/api/sets/"+encodeURIComponent(id),{name:s.name,date:s.date||"",venue:s.venue||"",items:s.items});status("Zapisano")}
    catch(e){saveError(e)}
    finally{delete saveTimers[id]}
  },700);
  lsSet("chrust-cur",cur);
}

// ---------- render ----------
function renderPick(){
  const ids=Object.keys(sets).sort((a,b)=>(sets[b].date||"").localeCompare(sets[a].date||"")||(sets[a].name||"").localeCompare(sets[b].name||""));
  $("#pick").innerHTML=ids.length?ids.map(id=>`<option value="${esc(id)}"${id===cur?" selected":""}>${esc(sets[id].name||"Bez nazwy")}${sets[id].date?" · "+esc(sets[id].date):""}</option>`).join(""):'<option>Brak setlist</option>';
  $("#pick").disabled=!ids.length;
}
function sections(set){
  const out=[];let acc={label:"Set",sec:0,n:0};
  for(const it of set.items){
    if(it.t==="x"){out.push(acc);acc={label:it.label||"Przerwa",sec:0,n:0}}
    else if(BY[it.id]){acc.sec+=dur(it.id,set);acc.n++}
  }
  out.push(acc);return out;
}
function renderSummary(){
  const s=current();
  if(!s){$("#summary").innerHTML="";$("#dockInfo").textContent="";return}
  const songs=songsIn(s), tot=songs.reduce((a,x)=>a+dur(x.id,s),0);
  const secs=sections(s);
  $("#summary").innerHTML=`<div><span class="total-label">łącznie</span><span class="total">${hms(tot)}</span></div>
   <div class="secs"><span class="sec-pill">${songs.length} utw.</span>${secs.length>1?secs.map(x=>`<span class="sec-pill">${esc(x.label)}: ${ms(x.sec)}</span>`).join(""):""}</div>`;
  $("#dockInfo").innerHTML=`<b>${hm(tot)}</b> · ${songs.length} utworów`;
}
function renderSet(){
  if(typeof dragging!=="undefined"&&dragging){renderPending=true;return}
  const s=current(), ol=$("#set");
  if(!s){ol.innerHTML=`<li class="empty">${!loaded?"Wczytywanie setlist…":editor?"Nie ma jeszcze żadnej setlisty. Utwórz pierwszą przyciskiem „Więcej → Nowa setlista”.":"Nie ma jeszcze żadnej setlisty."}</li>`;return}
  if(!s.items.length){ol.innerHTML=`<li class="empty">Setlista jest pusta. Dodaj utwory z zakładki „Utwory”.</li>`;return}
  let n=0,t=0;const secs=sections(s);let si=0;
  ol.innerHTML=s.items.map((it,idx)=>{
    if(it.t==="x"){si++;return `<li class="row sep" data-i="${idx}"><span class="handle" aria-label="Przeciągnij">${ICON.grip}</span><span></span>
      <input value="${esc(it.label)}" data-label="${idx}" aria-label="Nazwa sekcji"${editor?"":" disabled"}><span class="sub">${ms(secs[si].sec)}</span>
      <button class="x" data-del="${idx}" aria-label="Usuń przerwę">${ICON.x}</button></li>`}
    const so=BY[it.id]; if(!so)return "";
    n++;const at=t,d=dur(it.id,s);t+=d;
    const det=[so.key&&`<span><b>${esc(so.key)}</b></span>`,so.meter&&`<span>${esc(so.meter)}</span>`,so.tempo&&`<span>♩ ${esc(so.tempo)}</span>`].filter(Boolean).join("");
    return `<li class="row" data-i="${idx}"><span class="handle" aria-label="Przeciągnij">${ICON.grip}</span><span class="nr">${n}</span>
      <div class="song"><div class="sname">${nameHTML(so)}</div><div class="det">${det}</div></div>
      <div class="time"><span class="d">${ms(d)}</span><span class="at">od ${ms(at)}</span></div>
      <button class="x" data-del="${idx}" aria-label="Usuń ${esc(so.name)} z setlisty">${ICON.x}</button></li>`;
  }).join("");
}
function renderLib(){
  const s=current();const used=new Set(s?songsIn(s).map(i=>i.id):[]);
  const q=$("#q").value.trim().toLowerCase(), only=$("#onlyFree").checked;
  const list=SONGS.filter(x=>(!q||x.raw.toLowerCase().includes(q))&&(!only||!used.has(x.id)));
  $("#lib").innerHTML=list.map(x=>`<li><button data-song="${x.id}" aria-pressed="${used.has(x.id)}" ${s?"":"disabled"}>
     <span class="mark">${used.has(x.id)?ICON.check:""}</span>
     <div class="song"><div class="sname">${nameHTML(x)}</div><div class="det">${x.key?`<span><b>${esc(x.key)}</b></span>`:""}${x.meter?`<span>${esc(x.meter)}</span>`:""}${x.tempo?`<span>♩ ${esc(x.tempo)}</span>`:""}${PER_SONG[x.id]!==undefined?`<span>1 min × liczba utworów</span>`:""}</div></div>
     <span class="time"><span class="d">${ms(PER_SONG[x.id]!==undefined?dur(x.id,s):x.sec)}</span></span></button></li>`).join("")||'<li class="empty">Brak pasujących utworów.</li>';
  $("#tLib").textContent=`Utwory (${used.size}/${SONGS.length})`;
  $("#tSet").textContent=`Setlista${s?" ("+used.size+")":""}`;
}
function renderMeta(){
  const s=current();
  for(const [id,k] of [["#fName","name"],["#fDate","date"],["#fVenue","venue"]]){
    const el=$(id);el.disabled=!s||!editor;if(document.activeElement!==el)el.value=s?(s[k]||""):"";
  }
  $("#pdfBtn").disabled=!s||!songsIn(s).length;
}
function renderAll(){if(dragging){renderPending=true;return}renderPick();renderMeta();renderSummary();renderSet();renderLib()}

// ---------- events ----------
$("#pick").addEventListener("change",e=>{cur=e.target.value;lsSet("chrust-cur",cur);renderAll()});
for(const [id,k] of [["#fName","name"],["#fDate","date"],["#fVenue","venue"]]){
  $(id).addEventListener("input",e=>{const s=current();if(!s)return;s[k]=e.target.value;scheduleSave(cur);renderPick();});
}
$("#set").addEventListener("click",e=>{
  const b=e.target.closest("[data-del]");if(!b)return;
  current().items.splice(+b.dataset.del,1);scheduleSave(cur);renderSummary();renderSet();renderLib();renderMeta();
});
$("#set").addEventListener("input",e=>{
  const i=e.target.dataset.label;if(i===undefined)return;
  current().items[+i].label=e.target.value;scheduleSave(cur);renderSummary();
});
$("#lib").addEventListener("click",e=>{
  const b=e.target.closest("[data-song]");if(!b)return;const s=current();if(!s)return;
  const id=b.dataset.song, i=s.items.findIndex(x=>x.t==="s"&&x.id===id);
  if(i>=0)s.items.splice(i,1);else s.items.push({t:"s",id});
  scheduleSave(cur);renderAll();
});
$("#q").addEventListener("input",renderLib);
$("#onlyFree").addEventListener("change",renderLib);
$("#addSep").addEventListener("click",()=>{const s=current();if(!s)return;s.items.push({t:"x",label:s.items.some(i=>i.t==="x")?"Przerwa":"Bis"});scheduleSave(cur);renderAll()});
function tab(which){
  const set=which==="set";$("#tSet").setAttribute("aria-selected",set);$("#tLib").setAttribute("aria-selected",!set);
  $("#pSet").hidden=!set;$("#pLib").hidden=set;
}
$("#tSet").onclick=()=>tab("set");$("#tLib").onclick=()=>tab("lib");

let dragging=false, renderPending=false;
const sortable=new Sortable($("#set"),{disabled:true,handle:".handle",draggable:".row",animation:160,forceFallback:true,fallbackTolerance:3,ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",
  onStart(){dragging=true},
  onEnd(){setTimeout(finishDrag,0)},
  onUnchoose(){setTimeout(finishDrag,0)}});
// Order is read from the rows on screen, so it stays right even if the library misses a drop event.
function finishDrag(){
  if(!dragging)return;
  dragging=false;renderPending=false;
  const s=current();
  if(s){
    const order=[...$("#set").children].filter(li=>li.dataset&&li.dataset.i!==undefined).map(li=>+li.dataset.i);
    const valid=order.length===s.items.length&&new Set(order).size===order.length&&order.every(i=>i>=0&&i<s.items.length);
    if(valid&&order.some((v,k)=>v!==k)){s.items=order.map(i=>s.items[i]);scheduleSave(cur)}
  }
  renderAll();
}
// Safety net: any release of the mouse or finger ends a drag the library did not close.
for(const ev of ["pointerup","mouseup","touchend","pointercancel","blur"]){
  window.addEventListener(ev,()=>setTimeout(()=>{if(dragging&&!document.querySelector("#set .sortable-chosen"))finishDrag()},60),true);
}

// menu
const pop=$("#menuPop");
$("#menuBtn").onclick=e=>{e.stopPropagation();pop.hidden=!pop.hidden;$("#menuBtn").setAttribute("aria-expanded",!pop.hidden)};
document.addEventListener("click",e=>{if(!pop.hidden&&!pop.contains(e.target)){pop.hidden=true;$("#menuBtn").setAttribute("aria-expanded","false")}});
function create(base){
  const id=uid();
  sets[id]=base?{...JSON.parse(JSON.stringify(base)),name:(base.name||"Setlista")+" (kopia)"}:{name:"Nowa setlista",date:"",venue:"",items:[]};
  cur=id;scheduleSave(id);renderAll();tab(base?"set":"lib");$("#fName").focus();$("#fName").select();
}
$("#mNew").onclick=()=>{pop.hidden=true;create(null)};
$("#mDup").onclick=()=>{pop.hidden=true;if(current())create(current())};
$("#mDel").onclick=()=>{
  pop.hidden=true;const s=current();if(!s)return;
  $("#confirmBox").innerHTML=`<div class="confirm"><span style="flex:1;min-width:180px">Usunąć setlistę „${esc(s.name)}”? Tego nie da się cofnąć.</span>
    <button class="btn ghost" id="cNo">Anuluj</button><button class="btn danger" id="cYes">Usuń</button></div>`;
  $("#cNo").onclick=()=>$("#confirmBox").innerHTML="";
  $("#cYes").onclick=async()=>{
    const id=cur;$("#confirmBox").innerHTML="";delete sets[id];clearTimeout(saveTimers[id]);delete saveTimers[id];
    cur=Object.keys(sets)[0]||null;
    try{await api("DELETE","/setlisty/api/sets/"+encodeURIComponent(id));status("Usunięto")}catch(e){saveError(e);await refresh()}
    renderAll();
  };
};

// ---------- PDF A5 ----------
const PW=1748, PH=2480; // A5 @300 dpi
const FD='"Barlow Condensed", "Arial Narrow", sans-serif', FB='"Barlow", Arial, sans-serif';
async function fontsReady(){
  try{await Promise.all(["800 40px","700 40px","600 40px","500 40px"].map(w=>document.fonts.load(w+' "Barlow Condensed"',"ĄŁŚŻŹĆŃÓĘąłśżźćńóę")).concat(["400 30px","600 30px"].map(w=>document.fonts.load(w+' "Barlow"',"ąłś"))))}catch(e){}
}
function fitText(ctx,txt,font,size,maxW,minSize){
  let s=size;ctx.font=font.replace("{s}",s);
  while(s>minSize&&ctx.measureText(txt).width>maxW){s-=1;ctx.font=font.replace("{s}",s)}
  return s;
}
function drawPage(set,opt){
  const c=document.createElement("canvas");c.width=PW;c.height=PH;const x=c.getContext("2d");
  x.fillStyle="#fff";x.fillRect(0,0,PW,PH);x.fillStyle="#111";x.textBaseline="alphabetic";
  const M=118, R=PW-M; let y=M+20;
  // header
  x.font=`700 34px ${FD}`;x.letterSpacing="10px";x.fillStyle="#555";x.fillText("CHRUST",M,y);x.letterSpacing="0px";
  const meta=[set.date?new Date(set.date+"T12:00").toLocaleDateString("pl-PL",{day:"numeric",month:"long",year:"numeric"}):"",set.venue].filter(Boolean).join(" · ");
  x.textAlign="right";x.font=`500 34px ${FB}`;x.fillText(meta,R,y);x.textAlign="left";
  y+=96;x.fillStyle="#111";fitText(x,(set.name||"Setlista").toUpperCase(),`800 {s}px ${FD}`,104,R-M,56);x.fillText((set.name||"Setlista").toUpperCase(),M,y);
  y+=34;x.fillRect(M,y,R-M,5);y+=22;

  const songs=set.items.filter(i=>i.t==="x"||BY[i.id]);
  const nS=songs.filter(i=>i.t==="s").length,nX=songs.length-nS;
  const footH=150, top=y, avail=PH-M-footH-top-40;
  const rowH=Math.min(150,avail/(nS+nX*0.9+0.5));
  // column layout (right side)
  const cols=[];
  if(opt.time)cols.push({k:"czas",w:120});
  if(opt.det){cols.unshift({k:"tempo",w:250},{k:"metrum",w:110},{k:"tonacja",w:200})}
  // header labels
  let cx=R;const pos={};for(let i=cols.length-1;i>=0;i--){pos[cols[i].k]=cx;cx-=cols[i].w+18}
  const nameMax=cx-(M+90);
  y=top+38;x.font=`600 24px ${FB}`;x.fillStyle="#777";x.letterSpacing="3px";x.textAlign="right";
  for(const c of cols)x.fillText(c.k.toUpperCase(),pos[c.k],y);x.letterSpacing="0px";x.textAlign="left";
  y+=12;
  let n=0;const secs=sections(set);let si=0;
  for(const it of songs){
    if(it.t==="x"){
      si++;const h=rowH*0.9, my=y+h/2+6;
      x.strokeStyle="#111";x.lineWidth=3;x.setLineDash([16,12]);x.beginPath();x.moveTo(M,my);x.lineTo(R,my);x.stroke();x.setLineDash([]);
      x.font=`800 ${Math.round(Math.min(48,h*0.45))}px ${FD}`;x.letterSpacing="6px";
      const lbl=(it.label||"Przerwa").toUpperCase(), w=x.measureText(lbl).width;
      x.fillStyle="#fff";x.fillRect(M+60,my-h*0.3,w+40,h*0.6);x.fillStyle="#111";x.fillText(lbl,M+80,my+h*0.16);x.letterSpacing="0px";
      if(opt.time){x.font=`600 ${Math.round(Math.min(32,h*0.32))}px ${FB}`;const t=ms(secs[si].sec);const tw=x.measureText(t).width;x.fillStyle="#fff";x.fillRect(R-tw-30,my-h*0.25,tw+30,h*0.5);x.fillStyle="#111";x.textAlign="right";x.fillText(t,R,my+h*0.12);x.textAlign="left"}
      y+=h;continue;
    }
    const so=BY[it.id];n++;
    const base=y+rowH*0.68, big=Math.round(Math.min(78,rowH*0.62));
    x.fillStyle="#111";
    if(n>1){x.fillStyle="#ddd";x.fillRect(M,y,R-M,2);x.fillStyle="#111"}
    x.font=`700 ${Math.round(big*0.62)}px ${FD}`;x.fillStyle="#888";x.textAlign="right";x.fillText(String(n),M+56,base);x.textAlign="left";x.fillStyle="#111";
    const title=(so.caret?"^":"")+so.name;
    const tagTxt=opt.tags&&so.tags.length?"  "+so.tags.join(" · ").toUpperCase():"";
    x.font=`600 ${Math.round(big*0.4)}px ${FB}`;const tagW=tagTxt?x.measureText(tagTxt).width:0;
    const fs=fitText(x,title,`700 {s}px ${FD}`,big,Math.max(120,nameMax-tagW),Math.round(big*0.6));
    x.font=`700 ${fs}px ${FD}`;x.fillText(title,M+90,base);
    if(tagTxt){const tw=x.measureText(title).width;x.font=`600 ${Math.round(big*0.36)}px ${FB}`;x.fillStyle="#666";x.letterSpacing="2px";x.fillText(tagTxt,M+90+tw,base);x.letterSpacing="0px";x.fillStyle="#111"}
    const ds=Math.round(Math.min(40,rowH*0.34));
    x.textAlign="right";
    for(const c of cols){
      let v="";if(c.k==="czas")v=ms(dur(it.id,set));if(c.k==="tonacja")v=so.key;if(c.k==="metrum")v=so.meter;if(c.k==="tempo")v=so.tempo;
      const f=c.k==="czas"?`700 {s}px ${FD}`:c.k==="tonacja"?`600 {s}px ${FB}`:`500 {s}px ${FB}`;
      fitText(x,v,f,c.k==="czas"?Math.round(ds*1.15):ds,c.w,16);x.fillText(v,pos[c.k],base);
    }
    x.textAlign="left";y+=rowH;
  }
  // footer
  const tot=songsIn(set).reduce((a,i)=>a+dur(i.id,set),0);
  const fy=PH-M-30;x.fillStyle="#111";x.fillRect(M,fy-110,R-M,5);
  x.font=`800 72px ${FD}`;x.fillText(hms(tot),M,fy);
  x.font=`500 32px ${FB}`;x.fillStyle="#555";
  const secTxt=secs.length>1?secs.map(s=>`${s.label}: ${ms(s.sec)}`).join("   "):"";
  x.textAlign="right";x.fillText(`${nS} utworów${secTxt?"   ·   "+secTxt:""}`,R,fy);x.textAlign="left";
  return c;
}
let lastCanvas=null;
async function refreshPreview(){
  const s=current();if(!s)return;await fontsReady();
  lastCanvas=drawPage(s,{det:$("#oDet").checked,time:$("#oTime").checked,tags:$("#oTags").checked});
  $("#prevImg").src=lastCanvas.toDataURL("image/png");
}
$("#pdfBtn").onclick=async()=>{$("#sheet").hidden=false;$("#pdfNote").className="note";$("#pdfNote").textContent="";await refreshPreview()};
$("#closeSheet").onclick=()=>$("#sheet").hidden=true;
$("#sheet").addEventListener("click",e=>{if(e.target.id==="sheet")$("#sheet").hidden=true});
for(const id of ["#oDet","#oTime","#oTags"])$(id).addEventListener("change",refreshPreview);
$("#dlPdf").onclick=async()=>{
  const s=current();if(!s||!lastCanvas)return;const note=$("#pdfNote");note.className="note";
  const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a5",orientation:"portrait",compress:true});
  doc.addImage(lastCanvas.toDataURL("image/png"),"PNG",0,0,148,210,undefined,"FAST");
  doc.setProperties({title:"Chrust – "+(s.name||"setlista")});
  const safe=("Chrust - "+(s.name||"setlista")+(s.date?" "+s.date:"")).replace(/[\\/:*?"<>|]+/g," ").trim();
  const url=URL.createObjectURL(doc.output("blob")), a=document.createElement("a");
  a.href=url;a.download=safe+".pdf";document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  note.textContent="Pobrano PDF.";
};

// ---------- login ----------
function applyMode(){
  document.body.classList.toggle("ro",!editor);
  sortable.option("disabled",!editor);
  $("#loginBtn").hidden=!!editor||!clientId;
  if(!editor)tab("set");
  renderAll();
}
let gsiLoading=null;
function loadGsi(){
  return gsiLoading||(gsiLoading=new Promise((ok,fail)=>{
    const sc=document.createElement("script");sc.src="https://accounts.google.com/gsi/client";sc.async=true;
    sc.onload=ok;sc.onerror=()=>{gsiLoading=null;fail(new Error("gsi"))};document.head.appendChild(sc);
  }));
}
$("#loginBtn").onclick=async()=>{
  $("#loginSheet").hidden=false;$("#loginErr").textContent="";
  try{await loadGsi()}catch(e){$("#loginErr").textContent="Nie udało się wczytać logowania Google.";return}
  google.accounts.id.initialize({client_id:clientId,auto_select:false,callback:async r=>{
    try{const d=await api("POST","/setlisty/login",{credential:r.credential});editor=d.editor;$("#loginSheet").hidden=true;await refresh();applyMode();status("Zalogowano: "+editor)}
    catch(e){$("#loginErr").textContent=e.message||"Nie udało się zalogować."}
  }});
  google.accounts.id.renderButton($("#gBtn"),{type:"standard",theme:"outline",size:"large",text:"signin_with",locale:"pl"});
};
$("#closeLogin").onclick=()=>$("#loginSheet").hidden=true;
$("#loginSheet").addEventListener("click",e=>{if(e.target.id==="loginSheet")$("#loginSheet").hidden=true});
$("#mLogout").onclick=async()=>{pop.hidden=true;try{await api("POST","/setlisty/logout")}catch(e){}editor=null;applyMode();status("Wylogowano")};

// ---------- boot ----------
// Other band members may edit at the same time, so re-fetch every 20 s and when the tab comes back.
// Sets with a save still pending keep the local copy.
async function refresh(){
  let data;
  try{data=await api("GET","/setlisty/api/sets")}catch(e){status("Brak połączenia z serwerem");return}
  editor=data.editor;clientId=data.clientId;
  const remote=data.sets||{};
  for(const id of Object.keys(remote))if(!saveTimers[id])sets[id]={...remote[id],items:(remote[id].items||[]).map(i=>({...i}))};
  for(const id of Object.keys(sets))if(!(id in remote)&&!saveTimers[id])delete sets[id];
  if(!loaded){loaded=true;const want=lsGet("chrust-cur");cur=want&&sets[want]?want:Object.keys(sets).sort((a,b)=>(sets[b].date||"").localeCompare(sets[a].date||""))[0]||null;status(editor?"Zalogowano: "+editor:"Tylko podgląd")}
  if(cur&&!sets[cur])cur=Object.keys(sets)[0]||null;
  renderAll();
}
renderAll();
refresh().then(applyMode);
setInterval(()=>{if(!document.hidden&&!dragging)refresh()},20000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&loaded)refresh()});
