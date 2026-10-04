const $ = id => document.getElementById(id);
const SELF = 'new-tab-home';
const SETTINGS_KEY = 'homeSettingsV1';
const GROUPS_KEY = 'bookGroupsV1';
const DEFAULT_SETTINGS = {
  plusTarget: 'plugin',
  sectionOrder: ['groups','plugins','recent','bookmarks','history'],
  visibleSections: { groups:true, plugins:true, recent:true, bookmarks:true, history:true },
  quickActions: { library:true, search:true, reading:true, history:true, bookmarks:true },
  listLimit: 7
};
let timer=0, seq=0, active=-1, actions=[];
let settings=structuredClone(DEFAULT_SETTINGS);
let groups=[{id:'favorites',name:'מועדפים',books:[]}];
let searchBooks=[];

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dataOf=r=>r&&r.success?r.data:null;
const clone=x=>JSON.parse(JSON.stringify(x));

async function storageGet(key,fallback){
  try{const r=await Otzaria.call('storage.get',{key});return r?.success&&r.data!=null?r.data:fallback;}catch(_){return fallback;}
}
async function storageSet(key,value){
  try{return await Otzaria.call('storage.set',{key,value});}catch(_){return null;}
}

function normalizeSettings(raw){
  const s={...clone(DEFAULT_SETTINGS),...(raw||{})};
  s.visibleSections={...DEFAULT_SETTINGS.visibleSections,...(raw?.visibleSections||{})};
  s.quickActions={...DEFAULT_SETTINGS.quickActions,...(raw?.quickActions||{})};
  const valid=DEFAULT_SETTINGS.sectionOrder;
  s.sectionOrder=[...(raw?.sectionOrder||[]).filter(x=>valid.includes(x)),...valid.filter(x=>!(raw?.sectionOrder||[]).includes(x))];
  if(!['plugin','library','reading'].includes(s.plusTarget))s.plusTarget='plugin';
  s.listLimit=[5,7,10,12].includes(Number(s.listLimit))?Number(s.listLimit):7;
  return s;
}
function normalizeGroups(raw){
  const arr=Array.isArray(raw)?raw:[];
  const clean=arr.filter(g=>g&&typeof g.id==='string'&&typeof g.name==='string').map(g=>({id:g.id,name:g.name.trim().slice(0,40)||'קבוצה',books:Array.isArray(g.books)?g.books.slice(0,80):[]}));
  if(!clean.some(g=>g.id==='favorites'))clean.unshift({id:'favorites',name:'מועדפים',books:[]});
  return clean;
}

function applyTheme(t){
  if(!t)return;const c=t.colorScheme||{},y=t.typography||{},r=document.documentElement.style;
  r.setProperty('--bg',c.surface||'#fff');r.setProperty('--surface',c.surface||'#fff');r.setProperty('--surface2',c.surfaceContainerHighest||c.secondaryContainer||'#f5f5f5');r.setProperty('--top',c.surfaceContainerHigh||c.surfaceContainerHighest||c.surface||'#f5f5f5');r.setProperty('--text',c.onSurface||'#1d1b20');r.setProperty('--muted',c.outline||'#79747e');r.setProperty('--primary',c.primary||'#6750a4');r.setProperty('--onPrimary',c.onPrimary||'#fff');r.setProperty('--soft',c.secondaryContainer||c.surfaceContainerHighest||'#e8def8');r.setProperty('--outline',c.outline||'#cac4d0');r.setProperty('--error',c.error||'#b3261e');
  if(y.uiFontFamily)r.setProperty('--ui',JSON.stringify(y.uiFontFamily)+',system-ui,sans-serif');
}
function identity(b){const p={};for(const k of ['bookUid','id','bookId','type','source','index'])if(b?.[k]!=null)p[k]=b[k];return p;}
async function openBook(b){return Otzaria.call('reader.openBook',identity(b));}
function bookKey(b){return b?.bookUid||[b?.source||'',b?.type||'',b?.id??'',b?.bookId||b?.title||''].join('|');}
function compactBook(b){return {...identity(b),title:b?.title||b?.book||b?.bookTitle||b?.bookId||'ספר',ref:b?.ref||b?.reference||b?.currentRef||''};}
function isInAnyGroup(b){const k=bookKey(b);return groups.some(g=>g.books.some(x=>bookKey(x)===k));}

function makeRow(item,fallback='ספר'){
  const el=document.createElement('button');el.className='row';
  const title=item.title||item.book||item.bookTitle||item.bookId||fallback,meta=item.ref||item.reference||item.currentRef||item.label||'';
  el.innerHTML=`<b>${esc(title)}</b><span class="meta">${esc(meta)}</span>`;el.onclick=()=>openBook(item);return el;
}
function renderList(id,items,empty){const box=$(id);box.innerHTML='';if(!items?.length){box.innerHTML=`<div class="empty">${esc(empty)}</div>`;return;}items.slice(0,settings.listLimit).forEach(x=>box.appendChild(makeRow(x)));}
function renderPlugins(items){
  const box=$('plugins');box.innerHTML='';const visible=(items||[]).filter(p=>p.enabled&&p.pluginId&&p.pluginId!==SELF);$('pluginCount').textContent=visible.length?`${visible.length} מותקנים`:'';
  if(!visible.length){box.innerHTML='<div class="empty">אין תוספים זמינים לפתיחה</div>';return;}
  for(const p of visible.slice(0,18)){const b=document.createElement('button');b.className='pluginCard';b.title=`${p.name||p.pluginId}${p.version?' · '+p.version:''}`;const initial=(p.name||'ת').trim().charAt(0)||'ת';b.innerHTML=`<div class="pluginIcon">${esc(initial)}</div><b>${esc(p.name||p.pluginId)}</b><small>${esc(p.version||'')}</small>`;b.onclick=()=>Otzaria.call('plugin.openOther',{pluginId:p.pluginId});box.appendChild(b);}
}
function renderGroups(){
  const box=$('groups');box.innerHTML='';let count=0;
  for(const g of groups){if(!g.books.length)continue;const wrap=document.createElement('div');wrap.className='groupBlock';wrap.innerHTML=`<div class="groupBlockHead"><b>${esc(g.name)}</b><small>${g.books.length}</small></div>`;const list=document.createElement('div');list.className='groupBooks';g.books.slice(0,settings.listLimit).forEach(b=>list.appendChild(makeRow(b)));wrap.appendChild(list);box.appendChild(wrap);count++;}
  if(!count)box.innerHTML='<div class="empty">אפשר להוסיף ספרים למועדפים ולקבוצות מתוך תוצאות החיפוש</div>';
}
function applyLayout(){
  const host=$('sectionsHost');for(const key of settings.sectionOrder){const el=$(`section-${key}`);if(el)host.appendChild(el);}
  for(const [key,v] of Object.entries(settings.visibleSections)){$(`section-${key}`)?.classList.toggle('hiddenSection',!v);}
  document.querySelectorAll('[data-quick]').forEach(b=>b.hidden=!settings.quickActions[b.dataset.quick]);
}

async function loadHome(){
  const calls=await Promise.allSettled([Otzaria.call('library.listRecentBooks'),Otzaria.call('bookmarks.list',{limit:20}),Otzaria.call('history.list',{limit:20}),Otzaria.call('plugin.listInstalled')]);
  const val=i=>calls[i].status==='fulfilled'?dataOf(calls[i].value):null;
  renderList('recent',val(0)||[],'אין ספרים אחרונים');renderList('bookmarks',val(1)||[],'אין סימניות');renderList('history',val(2)||[],'אין היסטוריה');renderPlugins(val(3)||[]);renderGroups();applyLayout();
}

function addToGroupMenu(book,anchor){
  const old=document.querySelector('.groupPicker');old?.remove();const p=document.createElement('div');p.className='groupPicker';
  p.innerHTML='<div class="groupPickerTitle">הוסף לקבוצה</div>';
  for(const g of groups){const b=document.createElement('button');b.textContent=g.name;b.onclick=async e=>{e.stopPropagation();const k=bookKey(book);if(!g.books.some(x=>bookKey(x)===k))g.books.unshift(compactBook(book));await storageSet(GROUPS_KEY,groups);p.remove();renderGroups();toast(`נוסף אל ${g.name}`);};p.appendChild(b);}
  const r=anchor.getBoundingClientRect();p.style.top=`${Math.min(innerHeight-220,r.bottom+6)}px`;p.style.left=`${Math.max(8,Math.min(innerWidth-190,r.left))}px`;document.body.appendChild(p);setTimeout(()=>document.addEventListener('click',()=>p.remove(),{once:true}),0);
}
function addGroupResults(title,items,kind){
  if(!items?.length)return;const d=$('dropdown'),h=document.createElement('div');h.className='groupTitle';h.textContent=title;d.appendChild(h);
  for(const item of items){const row=document.createElement('div');row.className='resultRow';const b=document.createElement('button');b.className='result';const main=kind==='content'?(item.book||item.bookTitle||item.bookId):(item.title||item.book||item.bookId||'ספר');const raw=kind==='content'?(item.reference||item.ref||'')+' · '+String(item.text||'').replace(/<[^>]+>/g,'').slice(0,130):(item.categoryPath||item.ref||'');b.innerHTML=`<div><strong>${esc(main)}</strong><div class="snippet">${esc(raw)}</div></div><span class="tag">${kind==='content'?'בתוכן':'ספר'}</span>`;b.onclick=()=>openBook(item);row.appendChild(b);
    if(kind==='book'){const fav=document.createElement('button');fav.className='favBtn';fav.title='הוסף למועדפים או לקבוצה';fav.textContent=isInAnyGroup(item)?'★':'☆';fav.onclick=e=>{e.stopPropagation();addToGroupMenu(item,fav);};row.appendChild(fav);}d.appendChild(row);actions.push(()=>openBook(item));
  }
}
function paintActive(){document.querySelectorAll('.result').forEach((e,i)=>e.classList.toggle('active',i===active));document.querySelectorAll('.result')[active]?.scrollIntoView({block:'nearest'});}
async function liveSearch(q){
  const mine=++seq;if(q.length<2){$('dropdown').hidden=true;actions=[];$('status').textContent='';return;}$('status').textContent='מחפש…';
  const booksP=Otzaria.call('library.findBooks',{query:q,limit:8});let content=[];try{const stream=Otzaria.call('search.query',{query:q,mode:'exact',limit:14,order:'relevance'});for await(const chunk of stream){content.push(...(chunk.results||[]));if(content.length>=14)break;}}catch(_){}
  const books=await booksP;if(mine!==seq)return;searchBooks=dataOf(books)||[];const d=$('dropdown');d.innerHTML='';actions=[];addGroupResults('ספרים',searchBooks,'book');addGroupResults('תוצאות מתוך הספרים',content.slice(0,14),'content');if(!actions.length)d.innerHTML='<div class="empty">לא נמצאו תוצאות</div>';d.hidden=false;active=-1;$('status').textContent='';
}
async function openFullSearch(){const q=$('q').value.trim();if(!q){$('q').focus();return;}const r=await Otzaria.call('reader.openSearchTab',{query:q,autoSearch:true});if(!r?.success)$('status').textContent='לא ניתן לפתוח את החיפוש המלא';}

async function syncPlusRegistration(){await Otzaria.call('plugin.setNewTabPage',{enabled:settings.plusTarget!=='library'});}
async function handleNewTabOpen(){
  if(settings.plusTarget==='reading'){
    await Otzaria.call('navigation.goTo',{target:'reading'});
    try{const s=dataOf(await Otzaria.call('reader.getCurrentState'));const idx=s?.openTabs?.findIndex(t=>t?.isSelf);if(idx>=0)await Otzaria.call('reader.closeTab',{index:idx});}catch(_){}
    return;
  }
  if(settings.plusTarget==='plugin'){$('q').value='';$('dropdown').hidden=true;$('status').textContent='';await loadHome();$('q').focus();}
}

function renderSettings(){
  document.querySelectorAll('input[name="plusTarget"]').forEach(r=>r.checked=r.value===settings.plusTarget);
  $('listLimit').value=String(settings.listLimit);
  for(const key of Object.keys(settings.visibleSections)){const el=$(`show-${key}`);if(el)el.checked=!!settings.visibleSections[key];}
  for(const key of Object.keys(settings.quickActions)){const el=$(`quick-${key}`);if(el)el.checked=!!settings.quickActions[key];}
  const order=$('orderList');order.innerHTML='';const names={groups:'מועדפים וקבוצות',plugins:'תוספים',recent:'המשך לקרוא',bookmarks:'סימניות',history:'היסטוריה'};
  settings.sectionOrder.forEach((key,i)=>{const row=document.createElement('div');row.className='orderRow';row.innerHTML=`<span>${esc(names[key])}</span><span><button data-dir="-1">↑</button><button data-dir="1">↓</button></span>`;row.querySelectorAll('button').forEach(b=>b.onclick=()=>{const n=i+Number(b.dataset.dir);if(n<0||n>=settings.sectionOrder.length)return;[settings.sectionOrder[i],settings.sectionOrder[n]]=[settings.sectionOrder[n],settings.sectionOrder[i]];renderSettings();});order.appendChild(row);});
  renderGroupSettings();
}
function renderGroupSettings(){
  const box=$('groupSettings');box.innerHTML='';for(const g of groups){const row=document.createElement('div');row.className='manageGroup';row.innerHTML=`<input value="${esc(g.name)}" maxlength="40"><span>${g.books.length} ספרים</span>${g.id==='favorites'?'':'<button class="danger">מחק</button>'}`;const input=row.querySelector('input');input.onchange=async()=>{g.name=input.value.trim()||'קבוצה';await storageSet(GROUPS_KEY,groups);renderGroups();};const del=row.querySelector('.danger');if(del)del.onclick=async()=>{groups=groups.filter(x=>x.id!==g.id);await storageSet(GROUPS_KEY,groups);renderGroupSettings();renderGroups();};box.appendChild(row);}
}
async function saveSettingsFromUi(){
  settings.plusTarget=document.querySelector('input[name="plusTarget"]:checked')?.value||'plugin';settings.listLimit=Number($('listLimit').value)||7;
  for(const key of Object.keys(settings.visibleSections))settings.visibleSections[key]=!!$(`show-${key}`)?.checked;
  for(const key of Object.keys(settings.quickActions))settings.quickActions[key]=!!$(`quick-${key}`)?.checked;
  await storageSet(SETTINGS_KEY,settings);await syncPlusRegistration();applyLayout();renderGroups();await loadHome();closeSettings();toast('ההגדרות נשמרו');
}
function openSettings(){renderSettings();$('settingsModal').hidden=false;}
function closeSettings(){$('settingsModal').hidden=true;}
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(t._tm);t._tm=setTimeout(()=>t.hidden=true,2200);}

function openFeedback(type){$('feedbackTitle').textContent=type==='bug'?'דיווח על תקלה':'הצעת רעיון';$('feedbackText').value='';$('feedbackModal').dataset.type=type;$('feedbackModal').hidden=false;$('feedbackText').focus();}
async function sendFeedback(){
  const details=$('feedbackText').value.trim();if(!details){toast('יש לכתוב את פרטי הדיווח');return;}
  const type=$('feedbackModal').dataset.type||'other';$('sendFeedback').disabled=true;
  try{const r=await Otzaria.call('feedback.report',{details,reportType:type==='bug'?'bug':'other'});if(!r?.success)throw new Error();const result=r.data;$('feedbackModal').hidden=true;toast(result==='queued'?'הדיווח נשמר לשליחה מאוחרת':result==='cancelled'?'השליחה בוטלה':'הדיווח נשלח, תודה!');}catch(_){toast('הדיווח לא נשלח');}finally{$('sendFeedback').disabled=false;}
}

function wire(){
  $('q').addEventListener('input',e=>{clearTimeout(timer);const q=e.target.value.trim();timer=setTimeout(()=>liveSearch(q),180)});$('q').addEventListener('keydown',e=>{if(e.key==='Enter'&&$('dropdown').hidden){e.preventDefault();openFullSearch();return;}if($('dropdown').hidden)return;if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(actions.length-1,active+1);paintActive();}else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,active-1);paintActive();}else if(e.key==='Enter'){e.preventDefault();if(active>=0)actions[active]?.();else openFullSearch();}else if(e.key==='Escape')$('dropdown').hidden=true;});
  $('clear').onclick=()=>{$('q').value='';$('dropdown').hidden=true;$('status').textContent='';$('q').focus();};$('searchAll').onclick=openFullSearch;
  $('goLibrary').onclick=()=>Otzaria.call('navigation.goTo',{target:'library'});$('goReading').onclick=()=>Otzaria.call('navigation.goTo',{target:'reading'});$('goSearch').onclick=()=>{const q=$('q').value.trim();if(q)openFullSearch();else $('q').focus();};$('goHistory').onclick=()=>{$('section-history')?.scrollIntoView({behavior:'smooth',block:'center'});};$('goBookmarks').onclick=()=>{$('section-bookmarks')?.scrollIntoView({behavior:'smooth',block:'center'});};
  $('settingsBtn').onclick=openSettings;$('closeSettings').onclick=closeSettings;$('cancelSettings').onclick=closeSettings;$('saveSettings').onclick=saveSettingsFromUi;$('addGroup').onclick=async()=>{const name=$('newGroupName').value.trim();if(!name)return;groups.push({id:'g'+Date.now(),name:name.slice(0,40),books:[]});$('newGroupName').value='';await storageSet(GROUPS_KEY,groups);renderGroupSettings();renderGroups();};
  $('bugBtn').onclick=()=>openFeedback('bug');$('ideaBtn').onclick=()=>openFeedback('idea');$('closeFeedback').onclick=()=>{$('feedbackModal').hidden=true};$('cancelFeedback').onclick=()=>{$('feedbackModal').hidden=true};$('sendFeedback').onclick=sendFeedback;
  document.addEventListener('click',e=>{if(!e.target.closest('.searchWrap'))$('dropdown').hidden=true;});
}

wire();
Otzaria.on('plugin.boot',async p=>{
  settings=normalizeSettings(await storageGet(SETTINGS_KEY,DEFAULT_SETTINGS));groups=normalizeGroups(await storageGet(GROUPS_KEY,groups));await syncPlusRegistration();
  if(p?.app?.runMode==='background'){await Otzaria.call('plugin.backgroundDone');return;}
  applyTheme(p?.theme);await loadHome();$('q').focus();
});
Otzaria.on('theme.changed',p=>applyTheme(p?.theme||p));
Otzaria.on('plugin.page_opened',async p=>{if(p?.source==='newTabButton')await handleNewTabOpen();});