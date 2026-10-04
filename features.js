/* Home Page to Otzaria 4.0 feature layer */
const FEATURE_KEY='homeFeaturesV4';
const FEATURE_VERSION='4.0.6';
const CACHE_TTL=30000;
const memCache=new Map();
const debugLog=[];
let featureSettings={
  density:'comfortable',background:'aurora',cardSize:'normal',focusMode:false,
  pluginSort:'host',pluginView:'grid',pluginFavorites:[],savedSearches:[],quickPins:[],
  groupScope:'',lastSettingsTab:'general',lastSeenVersion:'',showDashboard:true,
  advancedOpen:false,pluginLastUsed:{},cardSize:'normal',columns:'2',accent:'host',radius:'rounded',feedbackCategory:'general'
};
let currentBookScopeV4=null;
let searchHistory=[];
let appInfo=null;
let pluginObserver=null;
let pluginsLoaded=false;

function fLog(type,message,data){
  debugLog.unshift({time:new Date().toISOString(),type,message,data:data==null?null:String(data)});
  if(debugLog.length>100)debugLog.length=100;
}
window.addEventListener('error',e=>fLog('error',e.message,e.filename+':'+e.lineno));
window.addEventListener('unhandledrejection',e=>fLog('promise','Unhandled promise rejection',e.reason));

async function fGet(key,fallback){
  try{
    const r=await Otzaria.call('storage.get',{key});
    return r&&r.success&&r.data!=null?r.data:fallback;
  }catch(e){fLog('warn','storage.get failed',e);return fallback}
}
async function fSet(key,value){
  try{return await Otzaria.call('storage.set',{key,value})}
  catch(e){fLog('warn','storage.set failed',e);return null}
}
function cached(key,loader,ttl=CACHE_TTL){
  const hit=memCache.get(key);
  if(hit&&Date.now()-hit.time<ttl)return Promise.resolve(hit.value);
  return Promise.resolve().then(loader).then(value=>{memCache.set(key,{time:Date.now(),value});return value});
}
function invalidate(prefix){
  for(const key of [...memCache.keys()])if(key.startsWith(prefix))memCache.delete(key);
}
function mergeFeatureSettings(raw){
  const f=Object.assign({},featureSettings,raw||{});
  for(const k of ['pluginFavorites','savedSearches','quickPins'])if(!Array.isArray(f[k]))f[k]=[];
  return f;
}
async function saveFeatures(){await fSet(FEATURE_KEY,featureSettings)}

function styleFeatureLayer(){
  const st=document.createElement('style');
  st.id='featureStylesV4';
  st.textContent=`
  :focus-visible{outline:3px solid color-mix(in srgb,var(--primary) 46%,transparent)!important;outline-offset:2px}
  body.density-compact .sectionPanel{padding:10px;border-radius:15px}body.density-compact .row{padding:7px}body.density-compact .pluginCard{min-height:86px;padding:9px}
  body.focus-mode .sectionsHost,body.focus-mode .quick,body.focus-mode .homeDashboard,body.focus-mode .quickPins{display:none!important}
  body.bg-flat{background:var(--bg)!important}body.bg-soft{background:linear-gradient(135deg,var(--bg),color-mix(in srgb,var(--soft) 28%,var(--bg)))!important}body[data-theme="dark"] .heroCard,body[data-theme="dark"] .sectionPanel{box-shadow:0 16px 48px rgba(0,0,0,.28)}body.card-large .sectionPanel{padding:22px}body.card-large .pluginCard{min-height:132px}
  .homeDashboard{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.statCard{border:1px solid var(--outline);background:color-mix(in srgb,var(--surface) 90%,transparent);border-radius:16px;padding:12px;text-align:center}.statCard b{display:block;font-size:20px}.statCard span{font-size:10px;color:var(--muted)}
  .historyChips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:8px}.historyChip{border:1px solid var(--outline);background:var(--surface);border-radius:999px;padding:5px 9px;font-size:10px;cursor:pointer}.historyChip:hover{background:var(--soft)}
  .sectionPanel[draggable="true"]{cursor:grab}.sectionPanel.dragging{opacity:.48}.sectionPanel.dragOver{outline:2px dashed var(--primary);outline-offset:3px}
  .sectionTools{display:flex;gap:4px;margin-inline-start:auto}.sectionTools button{border:0;background:transparent;border-radius:8px;padding:5px 7px;cursor:pointer;color:var(--muted)}.sectionTools button:hover{background:var(--soft);color:var(--text)}
  .pluginControls{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.pluginControls select,.pluginControls button{border:1px solid var(--outline);background:var(--surface);border-radius:10px;padding:7px 9px}
  .pluginGrid.listView{display:grid;grid-template-columns:1fr}.pluginGrid.listView .pluginCard{min-height:58px;display:grid;grid-template-columns:42px minmax(0,1fr) auto;text-align:right;align-items:center;gap:10px}.pluginGrid.listView .pluginIcon{margin:0;width:38px;height:38px}.pluginGrid.listView .pluginCard b{grid-column:2}.pluginGrid.listView .pluginCard small{grid-column:3;grid-row:1}
  .pluginFav{position:absolute;top:7px;right:8px;border:0!important;background:transparent!important;font-size:16px;padding:3px!important;z-index:2}.pluginFav.on{color:#d39100}
  .savedSearchBar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:10px}.savedSearchBar select,.savedSearchBar button{border:1px solid var(--outline);background:var(--surface);border-radius:10px;padding:7px 9px}
  .diagnosticGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.diagItem{border:1px solid var(--outline);border-radius:11px;padding:9px}.diagItem b{font-size:11px}.diagItem div{font-size:10px;color:var(--muted);margin-top:3px}.diag-ok{color:var(--success)}.diag-bad{color:var(--error)}
  .aboutBox{text-align:center}.aboutBox img{width:70px;height:70px;border-radius:18px}.aboutBox h3{margin:8px 0 4px}.aboutBox p{font-size:11px;color:var(--muted)}
  .quickPins{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-top:8px}.quickPins button{border:1px solid var(--outline);background:var(--surface);border-radius:11px;padding:7px 10px;cursor:pointer}
  .changelogBox{position:fixed;inset:auto 18px 18px 18px;max-width:520px;margin:auto;background:var(--surface);border:1px solid var(--outline);border-radius:18px;padding:16px;box-shadow:var(--shadow);z-index:150}.changelogBox h3{margin:0 0 8px}.changelogBox ul{margin:0;padding-inline-start:18px;font-size:11px;line-height:1.7}.changelogBox button{margin-top:10px}
  .skeleton{height:34px;border-radius:9px;background:linear-gradient(90deg,var(--surface2),var(--surface3),var(--surface2));background-size:200% 100%;animation:sk 1.2s infinite}@keyframes sk{to{background-position:-200% 0}}
  .updatedStamp{font-size:9px;color:var(--muted);margin-top:7px;text-align:left}
  @media(max-width:700px){.homeDashboard{grid-template-columns:1fr 1fr}.diagnosticGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}
let hostPrimaryV4='';
const coreApplyThemeV4=applyTheme;
applyTheme=function(t){coreApplyThemeV4(t);hostPrimaryV4=getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()||'#6750a4';document.body.dataset.theme=(t&&t.mode)||'light';applyFeatureAppearance()};
function applyFeatureAppearance(){
  document.body.classList.toggle('density-compact',featureSettings.density==='compact');
  document.body.classList.toggle('focus-mode',!!featureSettings.focusMode);
  document.body.classList.toggle('bg-flat',featureSettings.background==='flat');
  document.body.classList.toggle('bg-soft',featureSettings.background==='soft');
  document.body.classList.toggle('card-large',featureSettings.cardSize==='large');
  document.body.classList.toggle('columns-1',featureSettings.columns==='1');
  document.body.classList.toggle('columns-3',featureSettings.columns==='3');
  document.body.classList.toggle('radius-soft',featureSettings.radius==='soft');
  document.body.classList.toggle('radius-square',featureSettings.radius==='square');
  const accents={purple:'#6750a4',blue:'#3567c8',green:'#2f7d6d',rose:'#a64f70'};
  document.documentElement.style.setProperty('--primary',featureSettings.accent==='host'?(hostPrimaryV4||'#6750a4'):(accents[featureSettings.accent]||'#6750a4'));
}
function addDashboard(){
  if($('homeDashboard'))return;
  const box=document.createElement('section');box.id='homeDashboard';box.className='homeDashboard';
  box.innerHTML='<div class="statCard"><b id="statRecent">—</b><span>ספרים אחרונים</span></div><div class="statCard"><b id="statBookmarks">—</b><span>סימניות</span></div><div class="statCard"><b id="statSearches">—</b><span>חיפושים אחרונים</span></div><div class="statCard"><b id="statPlugins">—</b><span>תוספים פעילים</span></div>';
  $('searchSection').insertAdjacentElement('afterend',box);
  box.hidden=!featureSettings.showDashboard;
}
async function refreshDashboard(){
  const [recent,marks,searches,plugins]=await Promise.all([
    cached('recent-count',()=>Otzaria.call('library.listRecentBooks').then(dataOf).catch(()=>[])),
    cached('bookmarks-count',()=>Otzaria.call('bookmarks.list',{limit:50}).then(dataOf).catch(()=>[])),
    cached('search-history',()=>Otzaria.call('history.listSearches',{limit:20}).then(dataOf).catch(()=>[])),
    cached('plugins',()=>Otzaria.call('plugin.listInstalled').then(dataOf).catch(()=>[]))
  ]);
  if($('statRecent'))$('statRecent').textContent=(recent||[]).length;
  if($('statBookmarks'))$('statBookmarks').textContent=(marks||[]).length;
  if($('statSearches'))$('statSearches').textContent=(searches||[]).length;
  if($('statPlugins'))$('statPlugins').textContent=(plugins||[]).filter(x=>x.enabled).length;
}
async function loadSearchHistoryV4(){
  try{searchHistory=await cached('search-history',()=>Otzaria.call('history.listSearches',{limit:12}).then(dataOf))||[]}
  catch(e){searchHistory=[];fLog('warn','history.listSearches unavailable',e)}
  renderSearchHistoryV4();
}
function renderSearchHistoryV4(){
  let host=$('historyChips');
  if(!host){host=document.createElement('div');host.id='historyChips';host.className='historyChips';$('searchSummary').insertAdjacentElement('afterend',host)}
  host.innerHTML='';
  searchHistory.slice(0,7).forEach(item=>{
    const b=document.createElement('button');b.className='historyChip';b.textContent=item.query||'';b.title='חיפוש אחרון';
    b.onclick=()=>{$('q').value=item.query||'';runSearch(false)};host.appendChild(b);
  });
}
function addSavedSearchControls(){
  if($('savedSearchBar'))return;
  const bar=document.createElement('div');bar.id='savedSearchBar';bar.className='savedSearchBar';
  bar.innerHTML='<select id="savedSearchSelect" aria-label="חיפושים שמורים"><option value="">חיפוש שמור…</option></select><button id="saveSearchProfile" type="button">שמור חיפוש</button><select id="searchGroupScope" aria-label="חיפוש בקבוצה"><option value="">כל הספרייה</option></select>';
  $('advancedPanel').appendChild(bar);
  $('saveSearchProfile').onclick=saveCurrentSearchProfile;$('savedSearchSelect').onchange=applySavedSearchProfile;
  $('searchGroupScope').onchange=e=>{featureSettings.groupScope=e.target.value;saveFeatures();if($('q').value.trim())runSearch(false)};
  renderSavedSearchControls();
}
function renderSavedSearchControls(){
  const sel=$('savedSearchSelect');if(sel){sel.innerHTML='<option value="">חיפוש שמור…</option>';featureSettings.savedSearches.forEach((x,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=x.name;sel.appendChild(o)})}
  const gs=$('searchGroupScope');if(gs){gs.innerHTML='<option value="">כל הספרייה</option><option value="__current">הספר הפעיל</option>';groups.forEach(g=>{const o=document.createElement('option');o.value=g.id;o.textContent='קבוצה: '+g.name;gs.appendChild(o)});gs.value=featureSettings.groupScope||''}
}
async function saveCurrentSearchProfile(){
  const q=$('q').value.trim();const name=q||'חיפוש '+(featureSettings.savedSearches.length+1);
  featureSettings.savedSearches.unshift({name,query:q,config:clone(settings.searchConfig||DEFAULT_SEARCH)});
  featureSettings.savedSearches=featureSettings.savedSearches.slice(0,12);await saveFeatures();renderSavedSearchControls();toast('החיפוש נשמר');
}
function applySavedSearchProfile(){
  const idx=Number($('savedSearchSelect').value);if(!Number.isInteger(idx)||idx<0)return;
  const item=featureSettings.savedSearches[idx];if(!item)return;
  settings.searchConfig=clone(item.config||DEFAULT_SEARCH);$('q').value=item.query||'';applySearchSettingsToUi();renderDynamicSearchControls();if($('q').value.trim())runSearch(false);
}
const coreBuildSearchParams=buildSearchParams;
buildSearchParams=function(q,offset){
  const p=coreBuildSearchParams(q,offset);const gid=featureSettings.groupScope;
  if(gid==='__current'&&currentBookScopeV4)p.books=[identity(currentBookScopeV4)];
  else if(gid){const g=groups.find(x=>x.id===gid);if(g&&g.books.length)p.books=g.books.map(identity)}
  return p;
};

const coreNormalizeGroupsV4=normalizeGroups;
normalizeGroups=function(raw){
  const base=coreNormalizeGroupsV4(raw);
  const source=Array.isArray(raw)?raw:[];
  base.forEach((g,i)=>{
    const old=source.find(x=>x&&x.id===g.id)||{};
    g.color=old.color||['#6750a4','#2f7d6d','#a45a52','#4b6ea9','#8b5aa4'][i%5];
    g.icon=old.icon||'★';
    g.parentId=old.parentId||'';
    g.order=Number.isFinite(old.order)?old.order:i;
  });
  return base;
};
const coreRenderGroupsV4=renderGroups;
renderGroups=function(){
  coreRenderGroupsV4();
  const active=groups.filter(g=>g.books.length).sort((a,b)=>(a.order||0)-(b.order||0));
  [...$('groups').querySelectorAll('.groupBlock')].forEach((block,i)=>{
    const g=active[i];if(!g)return;
    block.style.borderInlineStart='4px solid '+g.color;
    block.style.marginInlineStart=g.parentId?'22px':'0';
    if(g.parentId){const parent=groups.find(x=>x.id===g.parentId);if(parent)block.title='תת־קבוצה של '+parent.name}
    const head=block.querySelector('.groupBlockHead');
    if(head&&!head.querySelector('.groupIcon')){const ic=document.createElement('span');ic.className='groupIcon';ic.textContent=g.icon+' ';head.prepend(ic)}
    block.ondragover=e=>e.preventDefault();
    block.ondrop=async e=>{
      e.preventDefault();
      const payload=e.dataTransfer&&e.dataTransfer.getData('application/x-home-book');
      if(!payload)return;
      try{
        const book=JSON.parse(payload);
        groups.forEach(x=>x.books=x.books.filter(b=>bookKey(b)!==bookKey(book)));
        g.books.unshift(book);
        await storageSet(GROUPS_KEY,groups);renderGroups();toast('הספר הועבר אל '+g.name);
      }catch(_){}
    };
    [...block.querySelectorAll('.row')].forEach((row,ri)=>{
      const book=g.books[ri];if(!book)return;
      row.draggable=true;
      row.ondragstart=e=>{e.dataTransfer&&e.dataTransfer.setData('application/x-home-book',JSON.stringify(book))};
    });
    if(head&&!head.querySelector('.pinGroupV4')){const pin=document.createElement('button');pin.className='pinGroupV4';pin.textContent='📌';pin.title='הצמד קבוצה לפעולות מהירות';pin.style.cssText='border:0;background:transparent;cursor:pointer';pin.onclick=async e=>{e.stopPropagation();if(!featureSettings.quickPins.some(x=>x.type==='group'&&x.groupId===g.id))featureSettings.quickPins.push({type:'group',groupId:g.id,title:g.name});await saveFeatures();renderQuickPins();toast('הקבוצה הוצמדה')};head.appendChild(pin)}
    head&&head.addEventListener('dblclick',()=>{featureSettings.groupScope=g.id;saveFeatures();if($('searchGroupScope'))$('searchGroupScope').value=g.id;$('q').focus();toast('החיפוש הוגבל לקבוצה '+g.name)});
  });
};
const coreRenderGroupSettingsV4=renderGroupSettings;
renderGroupSettings=function(){
  coreRenderGroupSettingsV4();
  [...$('groupSettings').querySelectorAll('.manageGroup')].forEach((row,i)=>{
    const g=groups[i];if(!g)return;
    const color=document.createElement('input');color.type='color';color.value=g.color||'#6750a4';color.title='צבע קבוצה';color.onchange=async e=>{g.color=e.target.value;await storageSet(GROUPS_KEY,groups);renderGroups()};
    const icon=document.createElement('select');icon.title='אייקון קבוצה';['★','📚','🔖','📌','●'].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;icon.appendChild(o)});icon.value=g.icon||'★';icon.onchange=async e=>{g.icon=e.target.value;await storageSet(GROUPS_KEY,groups);renderGroups()};
    const parent=document.createElement('select');parent.title='תת־קבוצה';const rootOpt=document.createElement('option');rootOpt.value='';rootOpt.textContent='קבוצה ראשית';parent.appendChild(rootOpt);groups.filter(x=>x.id!==g.id).forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent='תחת '+x.name;parent.appendChild(o)});parent.value=g.parentId||'';parent.onchange=async e=>{g.parentId=e.target.value;await storageSet(GROUPS_KEY,groups);renderGroups()};
    const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='העבר למעלה';up.onclick=async()=>{const idx=groups.indexOf(g);if(idx>0){[groups[idx-1],groups[idx]]=[groups[idx],groups[idx-1]];groups.forEach((x,j)=>x.order=j);await storageSet(GROUPS_KEY,groups);renderGroupSettings();renderGroups()}};
    const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='העבר למטה';down.onclick=async()=>{const idx=groups.indexOf(g);if(idx>=0&&idx<groups.length-1){[groups[idx],groups[idx+1]]=[groups[idx+1],groups[idx]];groups.forEach((x,j)=>x.order=j);await storageSet(GROUPS_KEY,groups);renderGroupSettings();renderGroups()}};
    row.append(color,icon,parent,up,down);
  });
};
function makeSectionsDraggable(){
  document.querySelectorAll('.sectionPanel').forEach(section=>{
    section.draggable=true;
    section.addEventListener('dragstart',()=>section.classList.add('dragging'));
    section.addEventListener('dragend',async()=>{section.classList.remove('dragging');document.querySelectorAll('.sectionPanel').forEach(x=>x.classList.remove('dragOver'));settings.sectionOrder=[...$('sectionsHost').querySelectorAll('.sectionPanel')].map(x=>x.id.replace('section-',''));await storageSet(SETTINGS_KEY,settings)});
    section.addEventListener('dragover',e=>{e.preventDefault();section.classList.add('dragOver')});
    section.addEventListener('dragleave',()=>section.classList.remove('dragOver'));
    section.addEventListener('drop',e=>{e.preventDefault();const moving=document.querySelector('.sectionPanel.dragging');if(!moving||moving===section)return;const rect=section.getBoundingClientRect();$('sectionsHost').insertBefore(moving,e.clientY<rect.top+rect.height/2?section:section.nextSibling)});
  });
}
function addSectionTools(){
  document.querySelectorAll('.sectionPanel').forEach(section=>{
    const head=section.querySelector('.sectionHead');if(!head||head.querySelector('.sectionTools'))return;
    const tools=document.createElement('div');tools.className='sectionTools';
    const refresh=document.createElement('button');refresh.textContent='↻';refresh.title='רענן כרטיס';refresh.onclick=e=>{e.stopPropagation();refreshSection(section.id)};
    const pin=document.createElement('button');pin.textContent='📌';pin.title='הצמד כרטיס לראש הדף';pin.onclick=async e=>{e.stopPropagation();const key=section.id.replace('section-','');settings.sectionOrder=[key,...settings.sectionOrder.filter(x=>x!==key)];$('sectionsHost').prepend(section);await storageSet(SETTINGS_KEY,settings);toast('הכרטיס הוצמד לראש הדף')};
    const hide=document.createElement('button');hide.textContent='×';hide.title='הסתר כרטיס';hide.onclick=async e=>{e.stopPropagation();const key=section.id.replace('section-','');settings.visibleSections[key]=false;section.classList.add('hiddenSection');await storageSet(SETTINGS_KEY,settings)};
    tools.append(refresh,pin,hide);head.appendChild(tools);
  });
}
async function refreshSection(id){
  invalidate('');const body=id==='section-plugins'?$('plugins'):document.querySelector('#'+id+' .list, #'+id+' #groups');
  if(body)body.innerHTML='<div class="skeleton"></div><div class="skeleton"></div>';
  if(id==='section-plugins')await loadPlugins();else await loadHome();markUpdated(id);
}
function markUpdated(id){
  const sec=$(id);if(!sec)return;let s=sec.querySelector('.updatedStamp');if(!s){s=document.createElement('div');s.className='updatedStamp';sec.appendChild(s)}
  s.textContent='עודכן עכשיו';setTimeout(()=>{if(s.isConnected)s.textContent='עודכן לפני פחות מדקה'},4000);
}
function setupPluginControls(){
  if($('pluginControls'))return;
  const box=document.createElement('div');box.id='pluginControls';box.className='pluginControls';
  box.innerHTML='<select id="pluginSort"><option value="host">סדר אוצריא</option><option value="name">שם</option><option value="favorite">מועדפים קודם</option><option value="enabled">פעילים קודם</option><option value="recent">שימוש אחרון</option></select><select id="pluginView"><option value="grid">כרטיסים</option><option value="list">רשימה</option></select><button id="pluginFavOnly" type="button">★ מועדפים</button>';
  $('section-plugins').querySelector('.pluginToolbar').insertAdjacentElement('beforebegin',box);
  $('pluginSort').value=featureSettings.pluginSort;$('pluginView').value=featureSettings.pluginView;
  $('pluginSort').onchange=async e=>{featureSettings.pluginSort=e.target.value;await saveFeatures();renderPlugins()};
  $('pluginView').onchange=async e=>{featureSettings.pluginView=e.target.value;await saveFeatures();renderPlugins()};
  let favOnly=false;$('pluginFavOnly').onclick=()=>{favOnly=!favOnly;renderPluginsV4(favOnly)};
}
const coreRenderPlugins=renderPlugins;
renderPlugins=function(){renderPluginsV4(false)};
function renderPluginsV4(favOnly){
  const original=allPlugins.slice();const favs=new Set(featureSettings.pluginFavorites);
  if(featureSettings.pluginSort==='name')allPlugins.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he'));
  else if(featureSettings.pluginSort==='favorite')allPlugins.sort((a,b)=>(favs.has(b.pluginId)?1:0)-(favs.has(a.pluginId)?1:0));
  else if(featureSettings.pluginSort==='enabled')allPlugins.sort((a,b)=>(b.enabled?1:0)-(a.enabled?1:0));
  else if(featureSettings.pluginSort==='recent')allPlugins.sort((a,b)=>(featureSettings.pluginLastUsed[b.pluginId]||0)-(featureSettings.pluginLastUsed[a.pluginId]||0));
  if(favOnly)allPlugins=allPlugins.filter(p=>favs.has(p.pluginId));
  coreRenderPlugins();$('plugins').classList.toggle('listView',featureSettings.pluginView==='list');
  const cards=[...$('plugins').querySelectorAll('.pluginCard')];const q=(($('pluginFilter')&&$('pluginFilter').value)||'').trim().toLowerCase();
  const visible=allPlugins.filter(p=>!q||String(p.name||'').toLowerCase().includes(q)||String(p.pluginId||'').toLowerCase().includes(q));
  cards.forEach((card,i)=>{
    const p=visible[i];if(!p)return;const originalClick=card.onclick;card.onclick=async e=>{featureSettings.pluginLastUsed[p.pluginId]=Date.now();await saveFeatures();if(originalClick)originalClick.call(card,e)};const star=document.createElement('button');star.className='pluginFav'+(favs.has(p.pluginId)?' on':'');star.textContent=favs.has(p.pluginId)?'★':'☆';star.title='מועדף';
    star.onclick=async e=>{e.stopPropagation();const idx=featureSettings.pluginFavorites.indexOf(p.pluginId);if(idx>=0)featureSettings.pluginFavorites.splice(idx,1);else featureSettings.pluginFavorites.push(p.pluginId);await saveFeatures();renderPluginsV4(favOnly);renderQuickPins()};card.appendChild(star);
  });
  allPlugins=original;
}
function lazyLoadPlugins(){
  const sec=$('section-plugins');if(!sec)return;
  if(!('IntersectionObserver'in window)){loadPlugins();pluginsLoaded=true;return}
  pluginObserver=new IntersectionObserver(async entries=>{if(entries.some(x=>x.isIntersecting)&&!pluginsLoaded){pluginsLoaded=true;await loadPlugins();pluginObserver.disconnect()}},{rootMargin:'250px'});
  pluginObserver.observe(sec);
}
const coreLoadHome=loadHome;
loadHome=async function(){
  const calls=await Promise.allSettled([
    cached('recent',()=>Otzaria.call('library.listRecentBooks').then(dataOf)),
    cached('bookmarks',()=>Otzaria.call('bookmarks.list',{limit:30}).then(dataOf)),
    cached('history',()=>Otzaria.call('history.list',{limit:30}).then(dataOf))
  ]);
  const val=i=>calls[i].status==='fulfilled'?calls[i].value:null;
  renderList('recent',val(0)||[],'אין ספרים אחרונים');renderList('bookmarks',val(1)||[],'אין סימניות');renderList('history',val(2)||[],'אין היסטוריה');
  renderGroups();applyLayout();refreshDashboard();if(pluginsLoaded)await loadPlugins();
};

async function smartOpenPinnedBook(book){
  try{
    const state=dataOf(await Otzaria.call('reader.getCurrentState'));const key=bookKey(book);
    const idx=state&&state.openTabs?state.openTabs.findIndex(t=>bookKey(t)===key):-1;if(idx>=0){await Otzaria.call('reader.activateTab',{index:idx});return}
  }catch(e){fLog('warn','activate existing tab failed',e)}
  await openBook(book);
}
function renderQuickPins(){
  let box=$('quickPins');if(!box){box=document.createElement('div');box.id='quickPins';box.className='quickPins';document.querySelector('.quick').insertAdjacentElement('afterend',box)}
  box.innerHTML='';
  featureSettings.quickPins.forEach((pin,i)=>{const b=document.createElement('button');b.textContent='📌 '+pin.title;b.onclick=()=>{if(pin.type==='group'){featureSettings.groupScope=pin.groupId;saveFeatures();if($('searchGroupScope'))$('searchGroupScope').value=pin.groupId;$('q').focus();toast('החיפוש הוגבל לקבוצה '+pin.title)}else smartOpenPinnedBook(pin.book)};b.oncontextmenu=async e=>{e.preventDefault();featureSettings.quickPins.splice(i,1);await saveFeatures();renderQuickPins()};box.appendChild(b)});
  allPlugins.filter(p=>featureSettings.pluginFavorites.includes(p.pluginId)).slice(0,5).forEach(p=>{const b=document.createElement('button');b.textContent='★ '+(p.name||p.pluginId);b.onclick=()=>Otzaria.call('plugin.openOther',{pluginId:p.pluginId});box.appendChild(b)});
}
async function pinCurrentBook(){
  try{
    const state=dataOf(await Otzaria.call('reader.getCurrentState'));if(!state||!state.currentBookId){toast('אין ספר פעיל להצמדה');return}
    const book={id:state.currentId,type:state.currentType,source:state.currentSource,bookId:state.currentBookId,title:state.currentBook,index:state.currentIndex,ref:state.currentRef};
    if(!featureSettings.quickPins.some(x=>bookKey(x.book)===bookKey(book)))featureSettings.quickPins.push({type:'book',title:state.currentBook||state.currentBookId,book});
    await saveFeatures();renderQuickPins();toast('הספר הוצמד לדף הבית');
  }catch(e){toast('לא ניתן להצמיד את הספר הנוכחי')}
}
function injectSettingsTabsV4(){
  const required=['densitySelect','backgroundSelect','cardSizeSelect','columnsSelect','accentSelect','radiusSelect','focusModeSetting','dashboardSetting','pinCurrentBook','runDiagnostics','copyDiagnostics'];
  if(required.some(id=>!$(id))){
    fLog('error','Settings markup is incomplete',required.filter(id=>!$(id)).join(', '));
    return;
  }

  $('densitySelect').value=featureSettings.density;
  $('backgroundSelect').value=featureSettings.background;
  $('cardSizeSelect').value=featureSettings.cardSize||'normal';
  $('columnsSelect').value=featureSettings.columns||'2';
  $('accentSelect').value=featureSettings.accent||'host';
  $('radiusSelect').value=featureSettings.radius||'rounded';
  $('focusModeSetting').checked=featureSettings.focusMode;
  $('dashboardSetting').checked=featureSettings.showDashboard;

  $('densitySelect').onchange=async e=>{featureSettings.density=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('backgroundSelect').onchange=async e=>{featureSettings.background=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('cardSizeSelect').onchange=async e=>{featureSettings.cardSize=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('columnsSelect').onchange=async e=>{featureSettings.columns=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('accentSelect').onchange=async e=>{featureSettings.accent=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('radiusSelect').onchange=async e=>{featureSettings.radius=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('focusModeSetting').onchange=async e=>{featureSettings.focusMode=e.target.checked;await saveFeatures();applyFeatureAppearance()};
  $('dashboardSetting').onchange=async e=>{featureSettings.showDashboard=e.target.checked;await saveFeatures();if($('homeDashboard'))$('homeDashboard').hidden=!e.target.checked};
  $('pinCurrentBook').onclick=pinCurrentBook;
  $('runDiagnostics').onclick=runDiagnostics;
  $('copyDiagnostics').onclick=copyDiagnostics;

  document.querySelectorAll('.settingsTab').forEach(b=>{
    b.onclick=()=>setSettingsTab(b.dataset.settingsTab);
  });
}
async function probe(name,fn){
  try{const r=await fn();return{name,ok:!!(r&&r.success!==false),detail:r&&r.success===false?(r.error||'נכשל'):'זמין'}}
  catch(e){return{name,ok:false,detail:e&&e.message?e.message:String(e)}}
}
async function runDiagnostics(){
  const grid=$('diagnosticGrid');if(!grid)return[];grid.innerHTML='<div class="skeleton"></div><div class="skeleton"></div>';
  try{appInfo=dataOf(await Otzaria.call('app.getInfo'))}catch(_){}
  const rows=await Promise.all([
    probe('מידע אפליקציה',()=>Otzaria.call('app.getInfo')),
    probe('חיפוש תוכן',async()=>{const it=Otzaria.call('search.query',{query:'בדיקה',limit:1});for await(const c of it){return{success:true,data:c}}return{success:true}}),
    probe('אפשרויות חיפוש',()=>Otzaria.call('search.getOptions',{})),
    probe('סימניות',()=>Otzaria.call('bookmarks.list',{limit:1})),
    probe('היסטוריה',()=>Otzaria.call('history.list',{limit:1})),
    probe('תוספים',()=>Otzaria.call('plugin.listInstalled')),
    probe('מצב קורא',()=>Otzaria.call('reader.getCurrentState'))
  ]);
  grid.innerHTML='';rows.forEach(r=>{const d=document.createElement('div');d.className='diagItem';d.innerHTML='<b>'+esc(r.name)+' <span class="'+(r.ok?'diag-ok':'diag-bad')+'">'+(r.ok?'✓':'✕')+'</span></b><div>'+esc(r.detail)+'</div>';grid.appendChild(d)});
  $('debugOutput').textContent=debugLog.map(x=>x.time+' ['+x.type+'] '+x.message+(x.data?' — '+x.data:'')).join('\n')||'אין אירועי debug.';
  return rows;
}
async function diagnosticText(){
  const rows=await runDiagnostics()||[];
  return ['Home Page to Otzaria '+FEATURE_VERSION,'Otzaria: '+(appInfo?appInfo.version+' / '+appInfo.platform:'לא זמין'),...rows.map(r=>r.name+': '+(r.ok?'OK':'FAIL')+' '+r.detail),'UI ready: '+(document.documentElement.dataset.uiReady||'false'),'Plugins loaded: '+allPlugins.length,'Recent debug:',...debugLog.slice(0,12).map(x=>x.time+' '+x.type+' '+x.message)].join('\n');
}
async function copyDiagnostics(){
  const text=await diagnosticText();
  try{await navigator.clipboard.writeText(text);toast('דוח האבחון הועתק')}
  catch(_){$('debugOutput').textContent=text;toast('הדוח מוצג בתיבת Debug')}
}
const coreSendFeedback=sendFeedback;
sendFeedback=async function(){
  const text=$('feedbackText').value.trim();if(!text)return coreSendFeedback();
  const category=featureSettings.feedbackCategory||'general';
  let technical='';try{technical=await diagnosticText()}catch(_){}
  $('feedbackText').value='['+category+'] '+text+'\n\n--- מידע טכני אוטומטי ---\n'+technical;await coreSendFeedback();
};
function rememberUiState(){
  const adv=$('advancedToggle');
  if(adv)adv.addEventListener('click',async()=>{featureSettings.advancedOpen=!$('advancedPanel').hidden;await saveFeatures()});
  document.querySelectorAll('.settingsTab').forEach(b=>b.addEventListener('click',async()=>{featureSettings.lastSettingsTab=b.dataset.settingsTab;await saveFeatures()}));
  if(featureSettings.advancedOpen){$('advancedPanel').hidden=false;$('advancedToggle').classList.add('active')}
}
function enhanceFeedbackCategories(){
  const select=$('feedbackCategory');
  if(!select)return;
  select.value=featureSettings.feedbackCategory||'general';
  select.onchange=async e=>{featureSettings.feedbackCategory=e.target.value;await saveFeatures()};
}
async function openExternalBrowserUrl(url){
  if(!/^https?:\/\//i.test(url||'')){
    toast('כתובת חיצונית לא תקינה');
    return;
  }
  try{
    const r=await Otzaria.call('app.openUrl',{url});
    if(!r||r.success===false)throw new Error(r&&r.error&&r.error.message||'openUrl failed');
  }catch(err){
    fLog('error','External URL open failed',err);
    toast('לא ניתן לפתוח את הקישור בדפדפן');
  }
}
function wireExternalLinks(){
  document.querySelectorAll('[data-external-url]').forEach(btn=>{
    btn.onclick=()=>openExternalBrowserUrl(btn.dataset.externalUrl);
  });
}
function setupKeyboard(){
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();closeSettings();$('q').focus();$('q').select()}
    else if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();openSettings()}
    else if(e.altKey&&e.key.toLowerCase()==='f'){e.preventDefault();featureSettings.focusMode=!featureSettings.focusMode;saveFeatures();applyFeatureAppearance();toast(featureSettings.focusMode?'מצב Focus הופעל':'מצב Focus בוטל')}
    else if(e.key==='Escape'){if(!$('settingsModal').hidden)closeSettings();$('suggestions').hidden=true}
  });
}
async function detectDebugPackage(){
  try{
    const r=await fetch('debug.flag',{cache:'no-store'});
    if(!r.ok)return false;
    const v=(await r.text()).trim();
    if(v!=='debug')return false;
    document.body.dataset.debugPackage='true';
    setTimeout(async()=>{openSettings();setSettingsTab('diagnostics');await runDiagnostics();toast('גרסת Debug פעילה')},120);
    return true;
  }catch(_){return false}
}
function showChangelog(){
  if(featureSettings.lastSeenVersion===FEATURE_VERSION)return;
  const box=document.createElement('div');box.className='changelogBox';
  box.innerHTML='<h3>מה חדש ב־'+FEATURE_VERSION+'</h3><ul><li>Drag & Drop לכרטיסי דף הבית</li><li>היסטוריית חיפוש וחיפושים שמורים</li><li>מועדפי תוספים ותצוגה קומפקטית</li><li>מצב Focus וקיצורי מקלדת</li><li>אבחון, Debug ומשוב עם מידע טכני</li><li>טעינה עצלה ו־cache בזיכרון</li></ul><button class="primaryBtn">הבנתי</button>';
  box.querySelector('button').onclick=async()=>{featureSettings.lastSeenVersion=FEATURE_VERSION;await saveFeatures();box.remove()};document.body.appendChild(box);
}
function enhanceAccessibility(){
  document.querySelectorAll('button:not([aria-label])').forEach(b=>{if(!b.title&&b.textContent.trim())b.setAttribute('aria-label',b.textContent.trim().slice(0,60))});
  $('q').setAttribute('aria-keyshortcuts','Control+K');
}
async function compatibilityCleanup(){
  if(typeof IntersectionObserver==='undefined')fLog('info','IntersectionObserver unavailable','using eager fallback');
  try{
    const r=await Otzaria.call('search.getOptions',{});
    if(!r||r.success===false){$('advancedToggle').hidden=true;fLog('warn','Advanced search unavailable')}
  }catch(e){$('advancedToggle').hidden=true;fLog('warn','Advanced search unavailable',e)}
}
function setupFeatureUi(){
  styleFeatureLayer();applyFeatureAppearance();addDashboard();addSavedSearchControls();makeSectionsDraggable();addSectionTools();setupPluginControls();injectSettingsTabsV4();enhanceFeedbackCategories();wireExternalLinks();renderQuickPins();setupKeyboard();enhanceAccessibility();compatibilityCleanup();rememberUiState();
}

const coreRenderListV4=renderList;
renderList=function(id,items,empty){
  coreRenderListV4(id,items,empty);
  if(id==='recent'){
    [...$('recent').querySelectorAll('.row .meta')].forEach(meta=>{if(meta.textContent)meta.textContent='המשך · '+meta.textContent;else meta.textContent='המשך לקריאה'});
  }
};

Otzaria.on('plugin.boot',async()=>{
  try{
    featureSettings=mergeFeatureSettings(await fGet(FEATURE_KEY,featureSettings));
    try{const st=dataOf(await Otzaria.call('reader.getCurrentState'));if(st&&st.currentBookId)currentBookScopeV4={id:st.currentId,type:st.currentType,source:st.currentSource,bookId:st.currentBookId,title:st.currentBook,index:st.currentIndex,ref:st.currentRef}}catch(_){}
    setupFeatureUi();await loadSearchHistoryV4();renderSavedSearchControls();lazyLoadPlugins();await refreshDashboard();await detectDebugPackage();showChangelog();setTimeout(()=>{if(!$('settingsModal').hidden)setSettingsTab(featureSettings.lastSettingsTab||'general')},0);fLog('info','Feature layer booted',FEATURE_VERSION);
  }catch(e){fLog('error','Feature layer boot failed',e);console.error('Feature layer boot failed',e)}
});
Otzaria.on('theme.changed',()=>applyFeatureAppearance());
