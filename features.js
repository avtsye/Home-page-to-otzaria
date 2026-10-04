/* Home Page to Otzaria 4.0 feature layer */
const FEATURE_KEY='homeFeaturesV4';
const FEATURE_VERSION='4.0.8';
const CACHE_TTL=30000;
const TAB_SETS_KEY='savedTabSetsV1';
const TAB_SETS_BACKUP_KEY='savedTabSetsBackupV1';
const TAB_SETS_SCHEMA=2;
const UNDO_WINDOW_MS=10000;
const memCache=new Map();
const debugLog=[];
const UI_ICONS_V4={
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  book:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v16H7.5A3.5 3.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/></svg>',
  bookmark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  pin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 4 6 6-3 2-3 6-2-2-6 3 3-6-2-2z"/><path d="m5 19-2 2"/></svg>',
  dot:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v5h5"/><path d="M5.5 9.5A8 8 0 1 1 4.8 15"/></svg>',
  close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  up:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>',
  down:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>'
};
function uiIconV4(name){
  if(UI_ICONS_V4[name])return UI_ICONS_V4[name];
  const aliases={settings:'settings_24_regular',home:'home_24_regular',apps:'apps_24_regular'};
  const key=aliases[name];
  return (key&&window.OFFICIAL_FLUENT_ICONS&&window.OFFICIAL_FLUENT_ICONS[key])||UI_ICONS_V4.star;
}
function iconTextV4(name,label){return uiIconV4(name)+'<span>'+esc(label)+'</span>'}
function setIconButtonV4(button,name,label){
  button.classList.add('nativeIconButton');
  button.innerHTML=uiIconV4(name);
  button.title=label;
  button.setAttribute('aria-label',label);
  return button;
}
let featureSettings={
  density:'comfortable',background:'flat',cardSize:'normal',focusMode:false,
  pluginSort:'host',pluginView:'grid',pluginFavorites:[],savedSearches:[],quickPins:[],
  groupScope:'',lastSettingsTab:'general',lastSeenVersion:'',showDashboard:true,
  advancedOpen:false,pluginLastUsed:{},cardSize:'normal',columns:'2',accent:'host',radius:'rounded',feedbackCategory:'general'
};
let currentBookScopeV4=null;
let searchHistory=[];
let appInfo=null;
let pluginObserver=null;
let pluginsLoaded=false;
let savedTabSets=[];
let undoEntry=null;
let undoTimer=0;

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
  f.background='flat';
  f.accent='host';
  f.radius='rounded';
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
  body.bg-flat,body.bg-soft{background:var(--color-surface-container-lowest,var(--bg))!important}body[data-theme="dark"] .heroCard,body[data-theme="dark"] .sectionPanel{box-shadow:none!important}body.card-large .sectionPanel{padding:20px}body.card-large .pluginCard{min-height:124px}
  .homeDashboard{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.statCard{border:1px solid var(--color-outline-variant,var(--outline));background:var(--color-surface,var(--surface));border-radius:12px;padding:10px;text-align:center}.statCard b{display:block;font-size:20px;font-weight:600}.statCard span{font-size:10px;color:var(--color-on-surface-variant,var(--muted))}
  .historyChips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:8px}.historyChip{border:1px solid var(--outline);background:var(--surface);border-radius:999px;padding:5px 9px;font-size:10px;cursor:pointer}.historyChip:hover{background:var(--soft)}
  .sectionPanel[draggable="true"]{cursor:grab}.sectionPanel.dragging{opacity:.48}.sectionPanel.dragOver{outline:2px dashed var(--primary);outline-offset:3px}
  .sectionTools{display:flex;gap:4px;margin-inline-start:auto}.sectionTools button{border:0;background:transparent;border-radius:8px;padding:5px 7px;cursor:pointer;color:var(--muted)}.sectionTools button:hover{background:var(--soft);color:var(--text)}
  .pluginControls{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.pluginControls select,.pluginControls button{border:1px solid var(--outline);background:var(--surface);border-radius:10px;padding:7px 9px}
  .pluginGrid.listView{display:grid;grid-template-columns:1fr}.pluginGrid.listView .pluginCard{min-height:58px;display:grid;grid-template-columns:42px minmax(0,1fr) auto;text-align:right;align-items:center;gap:10px}.pluginGrid.listView .pluginIcon{margin:0;width:38px;height:38px}.pluginGrid.listView .pluginCard b{grid-column:2}.pluginGrid.listView .pluginCard small{grid-column:3;grid-row:1}
  .pluginFav{position:absolute;top:7px;right:8px;border:0!important;background:transparent!important;font-size:16px;padding:3px!important;z-index:2;color:var(--color-on-surface-variant,var(--muted))}.pluginFav.on{color:var(--color-tertiary,var(--primary))}
  .savedSearchBar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:10px}.savedSearchBar select,.savedSearchBar button{border:1px solid var(--outline);background:var(--surface);border-radius:10px;padding:7px 9px}
  .aboutBox{text-align:center}.aboutBox img{width:70px;height:70px;border-radius:18px}.aboutBox h3{margin:8px 0 4px}.aboutBox p{font-size:11px;color:var(--muted)}
  .quickPins{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-top:8px}.quickPins button{border:1px solid var(--outline);background:var(--surface);border-radius:11px;padding:7px 10px;cursor:pointer}.quickPinWrap{display:inline-flex;align-items:center}.quickPinWrap>.nativeIconButton{margin-inline-start:-6px;border:1px solid var(--outline)!important;background:var(--surface)!important}
  .changelogBox{position:fixed;inset:auto 18px 18px 18px;max-width:520px;margin:auto;background:var(--color-surface-container-highest,var(--surface));border:1px solid var(--color-outline-variant,var(--outline));border-radius:16px;padding:16px;box-shadow:0 6px 18px color-mix(in srgb,var(--color-shadow,#000) 16%,transparent);z-index:150}.changelogBox h3{margin:0 0 8px}.changelogBox ul{margin:0;padding-inline-start:18px;font-size:11px;line-height:1.7}.changelogBox button{margin-top:10px}
  .skeleton{height:34px;border-radius:8px;background:var(--color-surface-container-high,var(--surface3));opacity:.72}
  .updatedStamp{font-size:9px;color:var(--muted);margin-top:7px;text-align:left}
  .undoBar{position:fixed;inset-inline:16px;bottom:16px;z-index:180;max-width:520px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--color-inverse-surface,var(--text));color:var(--color-on-inverse-surface,var(--bg));border-radius:12px;padding:10px 12px;box-shadow:0 8px 24px color-mix(in srgb,var(--color-shadow,#000) 20%,transparent)}.undoBar button{border:0;background:var(--color-inverse-primary,var(--primary));color:var(--color-inverse-surface,var(--text));border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer}
  .savedTabToolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.savedTabToolbar button{display:inline-flex;align-items:center;gap:6px}
  .savedTabGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.savedTabCard{position:relative;border:1px solid var(--color-outline-variant,var(--outline));background:var(--color-surface,var(--surface));border-radius:12px;padding:14px;cursor:pointer;text-align:right;min-width:0}.savedTabCard:hover{background:var(--color-surface-container-low,var(--surface2));border-color:var(--color-primary,var(--primary))}.savedTabCard h3{margin:0 0 5px;font-size:14px}.savedTabMeta{font-size:10px;color:var(--color-on-surface-variant,var(--muted));margin-bottom:10px}.savedTabBooks{display:grid;gap:4px}.savedTabBook{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.savedTabMore{font-size:10px;color:var(--color-on-surface-variant,var(--muted))}.savedTabActions{display:flex;gap:4px;position:absolute;top:8px;inset-inline-end:8px}.savedTabActions button{width:30px;height:30px}
  .savedTabsEmpty{padding:24px;text-align:center;color:var(--color-on-surface-variant,var(--muted))}
  .tabSetDialog{position:fixed;inset:0;z-index:170;background:color-mix(in srgb,var(--color-scrim,#000) 30%,transparent);display:grid;place-items:center;padding:16px}.tabSetDialogCard{width:min(520px,100%);max-height:80vh;overflow:auto;background:var(--color-surface-container-high,var(--surface3));border-radius:18px;padding:16px;box-shadow:0 8px 24px color-mix(in srgb,var(--color-shadow,#000) 18%,transparent)}.tabSetDialogCard h2{margin:0 0 10px;font-size:18px}.tabSetDialogCard input{width:100%;margin-bottom:10px}.tabSetPreview{display:grid;gap:5px;max-height:300px;overflow:auto;margin:10px 0}.tabSetPreviewRow{padding:8px 10px;background:var(--color-surface,var(--surface));border-radius:8px;font-size:11px}.tabSetDialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  .tabSetDialogHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.tabSetDialogHeader h2{margin:0}.tabSetEditorSetting{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin:10px 0}.tabSetEditorSetting select{border:1px solid var(--color-outline,var(--outline));background:var(--color-surface,var(--surface));border-radius:8px;padding:8px 10px}.tabSetEditorTools{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.tabSetLibraryAdd{position:relative;margin:10px 0}.tabSetLibraryAdd>input{width:100%}.tabSetBookSearchResults{display:grid;gap:4px;margin-top:5px;max-height:180px;overflow:auto}.tabSetBookSearchResult{display:flex;justify-content:space-between;gap:10px;text-align:start;border:1px solid var(--color-outline-variant,var(--outline));background:var(--color-surface,var(--surface));border-radius:8px;padding:8px 10px;cursor:pointer}.tabSetBookSearchResult:hover{background:var(--color-surface-container-low,var(--surface2))}.tabSetBookSearchResult span{color:var(--color-on-surface-variant,var(--muted));font-size:10px}.tabSetPreviewRow.editable,.tabSetPreviewRow.previewOnly{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px}.tabSetPreviewText{display:grid;gap:2px;min-width:0}.tabSetPreviewText b,.tabSetPreviewText span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tabSetPreviewText span{color:var(--color-on-surface-variant,var(--muted));font-size:10px}.tabSetBookControls{display:flex;align-items:center;gap:6px}.tabSetPositionMode{max-width:125px;border:1px solid var(--color-outline,var(--outline));background:var(--color-surface,var(--surface));border-radius:8px;padding:6px 8px}.tabSetPreviewActions{display:flex;gap:3px}.tabSetPreviewActions button:disabled{opacity:.35;cursor:default}.tabSetOpenState{font-size:10px;padding:4px 7px;border-radius:999px}.tabSetOpenState.open{background:var(--color-secondary-container,var(--soft));color:var(--color-on-secondary-container,var(--text))}.tabSetOpenState.missing{background:var(--color-surface-container-high,var(--surface3));color:var(--color-on-surface-variant,var(--muted))}.tabSetPreviewSelectTools{display:flex;gap:7px;justify-content:flex-end;margin:8px 0}.tabSetPreviewRow.selectable{grid-template-columns:auto minmax(0,1fr) auto}.tabSetPreviewRow.selectable>input{accent-color:var(--color-primary)}
  .groupBookRow{display:grid;grid-template-columns:minmax(0,1fr) 32px;align-items:center}.groupBookOpen{min-width:0}.groupBookRemove{border:0;background:transparent;color:var(--color-on-surface-variant,var(--muted));width:30px;height:30px;border-radius:999px;cursor:pointer}.groupBookRemove:hover{background:var(--color-error-container);color:var(--color-error)}
  .groupPickerAction.selected{color:var(--color-primary,var(--primary));background:var(--color-primary-container,var(--soft))}
  @media(max-width:700px){.homeDashboard{grid-template-columns:1fr 1fr}.diagnosticGrid{grid-template-columns:1fr}.savedTabGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}
let hostPrimaryV4='';
const coreApplyThemeV4=applyTheme;
applyTheme=function(t){coreApplyThemeV4(t);hostPrimaryV4=getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()||'#6750a4';document.body.dataset.theme=(t&&t.mode)||'light';applyFeatureAppearance()};
function applyFeatureAppearance(){
  document.body.classList.toggle('density-compact',featureSettings.density==='compact');
  document.body.classList.toggle('focus-mode',!!featureSettings.focusMode);
  document.body.classList.toggle('card-large',featureSettings.cardSize==='large');
  document.body.classList.toggle('columns-1',featureSettings.columns==='1');
  document.body.classList.toggle('columns-3',featureSettings.columns==='3');

  // Appearance follows the Otzaria host theme. Legacy visual overrides are intentionally ignored.
  document.body.classList.remove('bg-soft','radius-soft','radius-square');
  document.body.classList.add('bg-flat');
  const host=hostPrimaryV4||getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()||'#6750a4';
  document.documentElement.style.setProperty('--primary',host);
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
  bar.innerHTML='<select id="savedSearchSelect" aria-label="חיפושים שמורים"><option value="">חיפוש שמור…</option></select><button id="saveSearchProfile" type="button">שמור חיפוש</button><button id="deleteSearchProfile" type="button">מחק חיפוש</button><select id="searchGroupScope" aria-label="חיפוש בקבוצה"><option value="">כל הספרייה</option></select>';
  $('advancedPanel').appendChild(bar);
  $('saveSearchProfile').onclick=saveCurrentSearchProfile;$('savedSearchSelect').onchange=applySavedSearchProfile;$('deleteSearchProfile').onclick=deleteSavedSearchProfileV4;
  $('searchGroupScope').onchange=e=>{featureSettings.groupScope=e.target.value;saveFeatures();if($('q').value.trim())runSearch(false)};
  renderSavedSearchControls();
}
function renderSavedSearchControls(){
  const sel=$('savedSearchSelect');if(sel){sel.innerHTML='<option value="">חיפוש שמור…</option>';featureSettings.savedSearches.forEach((x,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=x.name;sel.appendChild(o)})}
  const gs=$('searchGroupScope');if(gs){gs.innerHTML='<option value="">כל הספרייה</option><option value="__current">הספר הפעיל</option>';groups.forEach(g=>{const o=document.createElement('option');o.value=g.id;o.textContent='קבוצה: '+g.name;gs.appendChild(o)});gs.value=featureSettings.groupScope||''}
}
async function saveCurrentSearchProfile(){
  const q=$('q').value.trim();const name=q||'חיפוש '+(featureSettings.savedSearches.length+1);
  const before=[...featureSettings.savedSearches];
  featureSettings.savedSearches.unshift({name,query:q,config:clone(settings.searchConfig||DEFAULT_SEARCH)});
  featureSettings.savedSearches=featureSettings.savedSearches.slice(0,12);await saveFeatures();renderSavedSearchControls();toast('החיפוש נשמר');
  window.homePushUndo('החיפוש נשמר',async()=>{featureSettings.savedSearches=before;await saveFeatures();renderSavedSearchControls()});
}
async function deleteSavedSearchProfileV4(){
  const sel=$('savedSearchSelect');const idx=Number(sel&&sel.value);
  if(!Number.isInteger(idx)||idx<0||idx>=featureSettings.savedSearches.length){toast('בחר חיפוש שמור למחיקה');return}
  const removed=featureSettings.savedSearches.splice(idx,1)[0];await saveFeatures();renderSavedSearchControls();toast('החיפוש השמור נמחק');
  window.homePushUndo('החיפוש השמור נמחק',async()=>{featureSettings.savedSearches.splice(Math.min(idx,featureSettings.savedSearches.length),0,removed);await saveFeatures();renderSavedSearchControls()});
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
    g.color=old.color||'';
    const legacyIcons={'★':'star','📚':'book','🔖':'bookmark','📌':'pin','●':'dot'};
    g.icon=legacyIcons[old.icon]||old.icon||['star','book','bookmark','pin','dot'][i%5];
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
    block.style.borderInlineStart='4px solid '+(g.color||['var(--color-primary)','var(--color-secondary)','var(--color-tertiary)'][i%3]);
    block.style.marginInlineStart=g.parentId?'22px':'0';
    if(g.parentId){const parent=groups.find(x=>x.id===g.parentId);if(parent)block.title='תת־קבוצה של '+parent.name}
    const head=block.querySelector('.groupBlockHead');
    if(head&&!head.querySelector('.groupIcon')){const ic=document.createElement('span');ic.className='groupIcon nativeInlineIcon';ic.innerHTML=uiIconV4(g.icon);head.prepend(ic)}
    block.ondragover=e=>e.preventDefault();
    block.ondrop=async e=>{
      e.preventDefault();
      const payload=e.dataTransfer&&e.dataTransfer.getData('application/x-home-book');
      if(!payload)return;
      try{
        const book=JSON.parse(payload);const before=clone(groups);
        groups.forEach(x=>x.books=x.books.filter(b=>bookKey(b)!==bookKey(book)));
        g.books.unshift(book);
        await storageSet(GROUPS_KEY,groups);renderGroups();toast('הספר הועבר אל '+g.name);
        window.homePushUndo('הספר הועבר אל '+g.name,async()=>{groups=normalizeGroups(before);await storageSet(GROUPS_KEY,groups);renderGroups()});
      }catch(_){}
    };
    [...block.querySelectorAll('.row')].forEach((row,ri)=>{
      const book=g.books[ri];if(!book)return;
      row.draggable=true;
      row.ondragstart=e=>{e.dataTransfer&&e.dataTransfer.setData('application/x-home-book',JSON.stringify(book))};
    });
    if(head&&!head.querySelector('.pinGroupV4')){const pin=document.createElement('button');pin.className='pinGroupV4';setIconButtonV4(pin,'pin','הצמד קבוצה לפעולות מהירות');pin.onclick=async e=>{e.stopPropagation();if(featureSettings.quickPins.some(x=>x.type==='group'&&x.groupId===g.id)){toast('הקבוצה כבר מוצמדת');return}const item={type:'group',groupId:g.id,title:g.name};featureSettings.quickPins.push(item);await saveFeatures();renderQuickPins();toast('הקבוצה הוצמדה');window.homePushUndo('הקבוצה הוצמדה',async()=>{featureSettings.quickPins=featureSettings.quickPins.filter(x=>x!==item);await saveFeatures();renderQuickPins()})};head.appendChild(pin)}
    head&&head.addEventListener('dblclick',()=>{featureSettings.groupScope=g.id;saveFeatures();if($('searchGroupScope'))$('searchGroupScope').value=g.id;$('q').focus();toast('החיפוש הוגבל לקבוצה '+g.name)});
  });
};
const coreRenderGroupSettingsV4=renderGroupSettings;
renderGroupSettings=function(){
  coreRenderGroupSettingsV4();
  [...$('groupSettings').querySelectorAll('.manageGroup')].forEach((row,i)=>{
    const g=groups[i];if(!g)return;
    const color=document.createElement('input');color.type='color';color.value=g.color||getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()||'#6750a4';color.title='צבע קבוצה';color.onchange=async e=>{g.color=e.target.value;await storageSet(GROUPS_KEY,groups);renderGroups()};
    const icon=document.createElement('select');icon.title='אייקון קבוצה';[['star','כוכב'],['book','ספר'],['bookmark','סימנייה'],['pin','סיכה'],['dot','נקודה']].forEach(([v,label])=>{const o=document.createElement('option');o.value=v;o.textContent=label;icon.appendChild(o)});icon.value=g.icon||'star';icon.onchange=async e=>{g.icon=e.target.value;await storageSet(GROUPS_KEY,groups);renderGroups()};
    const parent=document.createElement('select');parent.title='תת־קבוצה';const rootOpt=document.createElement('option');rootOpt.value='';rootOpt.textContent='קבוצה ראשית';parent.appendChild(rootOpt);groups.filter(x=>x.id!==g.id).forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent='תחת '+x.name;parent.appendChild(o)});parent.value=g.parentId||'';parent.onchange=async e=>{g.parentId=e.target.value;await storageSet(GROUPS_KEY,groups);renderGroups()};
    const up=document.createElement('button');up.type='button';setIconButtonV4(up,'up','העבר למעלה');up.onclick=async()=>{const idx=groups.indexOf(g);if(idx>0){[groups[idx-1],groups[idx]]=[groups[idx],groups[idx-1]];groups.forEach((x,j)=>x.order=j);await storageSet(GROUPS_KEY,groups);renderGroupSettings();renderGroups()}};
    const down=document.createElement('button');down.type='button';setIconButtonV4(down,'down','העבר למטה');down.onclick=async()=>{const idx=groups.indexOf(g);if(idx>=0&&idx<groups.length-1){[groups[idx],groups[idx+1]]=[groups[idx+1],groups[idx]];groups.forEach((x,j)=>x.order=j);await storageSet(GROUPS_KEY,groups);renderGroupSettings();renderGroups()}};
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
    const refresh=document.createElement('button');setIconButtonV4(refresh,'refresh','רענן כרטיס');refresh.onclick=e=>{e.stopPropagation();refreshSection(section.id)};
    const pin=document.createElement('button');setIconButtonV4(pin,'pin','הצמד כרטיס לראש הדף');pin.onclick=async e=>{e.stopPropagation();const key=section.id.replace('section-','');settings.sectionOrder=[key,...settings.sectionOrder.filter(x=>x!==key)];$('sectionsHost').prepend(section);await storageSet(SETTINGS_KEY,settings);toast('הכרטיס הוצמד לראש הדף')};
    const hide=document.createElement('button');setIconButtonV4(hide,'close','הסתר כרטיס');hide.onclick=async e=>{e.stopPropagation();const key=section.id.replace('section-','');settings.visibleSections[key]=false;section.classList.add('hiddenSection');await storageSet(SETTINGS_KEY,settings)};
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
  box.innerHTML='<select id="pluginSort"><option value="host">סדר אוצריא</option><option value="name">שם</option><option value="favorite">מועדפים קודם</option><option value="enabled">פעילים קודם</option><option value="recent">שימוש אחרון</option></select><select id="pluginView"><option value="grid">כרטיסים</option><option value="list">רשימה</option></select><button id="pluginFavOnly" type="button"></button>';
  $('section-plugins').querySelector('.pluginToolbar').insertAdjacentElement('beforebegin',box);
  $('pluginSort').value=featureSettings.pluginSort;$('pluginView').value=featureSettings.pluginView;const favOnlyBtn=$('pluginFavOnly');favOnlyBtn.innerHTML=iconTextV4('star','מועדפים');
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
    const p=visible[i];if(!p)return;const originalClick=card.onclick;card.onclick=async e=>{featureSettings.pluginLastUsed[p.pluginId]=Date.now();await saveFeatures();if(originalClick)originalClick.call(card,e)};const star=document.createElement('button');star.className='pluginFav'+(favs.has(p.pluginId)?' on':'');setIconButtonV4(star,'star','מועדף');star.setAttribute('aria-pressed',favs.has(p.pluginId)?'true':'false');
    star.onclick=async e=>{e.stopPropagation();const before=[...featureSettings.pluginFavorites];const idx=featureSettings.pluginFavorites.indexOf(p.pluginId);if(idx>=0)featureSettings.pluginFavorites.splice(idx,1);else featureSettings.pluginFavorites.push(p.pluginId);await saveFeatures();renderPluginsV4(favOnly);renderQuickPins();const msg=idx>=0?'הוסר ממועדפי התוספים':'נוסף למועדפי התוספים';window.homePushUndo(msg,async()=>{featureSettings.pluginFavorites=before;await saveFeatures();renderPluginsV4(favOnly);renderQuickPins()})};card.appendChild(star);
  });
  allPlugins=original;
}
async function loadPluginsReliableV4(){
  pluginsLoaded=true;
  try{
    await loadPlugins();
    fLog('info','Installed plugins loaded',allPlugins.length);
  }catch(e){
    pluginsLoaded=false;
    fLog('error','Installed plugins load failed',e);
    const box=$('plugins');
    if(box)box.innerHTML='<div class="empty">לא ניתן לטעון כרגע את רשימת התוספים.</div>';
  }
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
  renderGroups();applyLayout();
  try{ensureSavedTabsSectionV4();renderSavedTabSetsV4()}catch(e){fLog('error','saved tabs render after layout failed',e)}
  refreshDashboard();await loadPluginsReliableV4();
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
  featureSettings.quickPins.forEach((pin,i)=>{const wrap=document.createElement('span');wrap.className='quickPinWrap';const b=document.createElement('button');b.className='iconTextBtn';b.innerHTML=iconTextV4('pin',pin.title);b.onclick=()=>{if(pin.type==='group'){featureSettings.groupScope=pin.groupId;saveFeatures();if($('searchGroupScope'))$('searchGroupScope').value=pin.groupId;$('q').focus();toast('החיפוש הוגבל לקבוצה '+pin.title)}else smartOpenPinnedBook(pin.book)};const remove=document.createElement('button');setIconButtonV4(remove,'close','הסר הצמדה');remove.onclick=async e=>{e.stopPropagation();const removed=featureSettings.quickPins.splice(i,1)[0];await saveFeatures();renderQuickPins();window.homePushUndo('ההצמדה הוסרה',async()=>{featureSettings.quickPins.splice(Math.min(i,featureSettings.quickPins.length),0,removed);await saveFeatures();renderQuickPins()})};wrap.append(b,remove);box.appendChild(wrap)});
  allPlugins.filter(p=>featureSettings.pluginFavorites.includes(p.pluginId)).slice(0,5).forEach(p=>{const b=document.createElement('button');b.className='iconTextBtn';b.innerHTML=iconTextV4('star',p.name||p.pluginId);b.onclick=()=>Otzaria.call('plugin.openOther',{pluginId:p.pluginId});box.appendChild(b)});
}
async function pinCurrentBook(){
  try{
    const state=dataOf(await Otzaria.call('reader.getCurrentState'));if(!state||!state.currentBookId){toast('אין ספר פעיל להצמדה');return}
    const book={id:state.currentId,type:state.currentType,source:state.currentSource,bookId:state.currentBookId,title:state.currentBook,index:state.currentIndex,ref:state.currentRef};
    if(featureSettings.quickPins.some(x=>x.book&&bookKey(x.book)===bookKey(book))){toast('הספר כבר מוצמד לדף הבית');return}
    const pin={type:'book',title:state.currentBook||state.currentBookId,book};featureSettings.quickPins.push(pin);
    await saveFeatures();renderQuickPins();toast('הספר הוצמד לדף הבית');window.homePushUndo('הספר הוצמד לדף הבית',async()=>{featureSettings.quickPins=featureSettings.quickPins.filter(x=>x!==pin);await saveFeatures();renderQuickPins()});
  }catch(e){toast('לא ניתן להצמיד את הספר הנוכחי')}
}
function injectSettingsTabsV4(){
  const required=['densitySelect','cardSizeSelect','columnsSelect','focusModeSetting','dashboardSetting','pinCurrentBook'];
  if(required.some(id=>!$(id))){
    fLog('error','Settings markup is incomplete',required.filter(id=>!$(id)).join(', '));
    return;
  }

  $('densitySelect').value=featureSettings.density;
  $('cardSizeSelect').value=featureSettings.cardSize||'normal';
  $('columnsSelect').value=featureSettings.columns||'2';
  $('focusModeSetting').checked=featureSettings.focusMode;
  $('dashboardSetting').checked=featureSettings.showDashboard;

  $('densitySelect').onchange=async e=>{featureSettings.density=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('cardSizeSelect').onchange=async e=>{featureSettings.cardSize=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('columnsSelect').onchange=async e=>{featureSettings.columns=e.target.value;await saveFeatures();applyFeatureAppearance()};
  $('focusModeSetting').onchange=async e=>{featureSettings.focusMode=e.target.checked;await saveFeatures();applyFeatureAppearance()};
  $('dashboardSetting').onchange=async e=>{featureSettings.showDashboard=e.target.checked;await saveFeatures();if($('homeDashboard'))$('homeDashboard').hidden=!e.target.checked};
  $('pinCurrentBook').onclick=pinCurrentBook;

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
    return false;
  }
  try{
    const r=await Otzaria.call('app.openUrl',{url});
    if(r&&r.success===false)throw new Error(r.error&&r.error.message||'openUrl failed');
    return true;
  }catch(err){
    fLog('error','External URL open failed',err);
    toast('לא ניתן לפתוח את הקישור בדפדפן המערכת');
    return false;
  }
}
let externalLinksWiredV4=false;
function wireExternalLinks(){
  if(externalLinksWiredV4)return;
  externalLinksWiredV4=true;
  document.addEventListener('click',e=>{
    const btn=e.target&&e.target.closest?e.target.closest('[data-external-url]'):null;
    if(!btn)return;
    e.preventDefault();
    e.stopPropagation();
    openExternalBrowserUrl(btn.dataset.externalUrl);
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
    setTimeout(()=>{openSettings();setSettingsTab('feedback');toast('גרסת Debug פעילה')},120);
    return true;
  }catch(_){return false}
}
function showChangelog(){
  if(featureSettings.lastSeenVersion===FEATURE_VERSION)return;
  const box=document.createElement('div');box.className='changelogBox';
  box.innerHTML='<h3>מה חדש ב־'+FEATURE_VERSION+'</h3><ul><li>Drag & Drop לכרטיסי דף הבית</li><li>היסטוריית חיפוש וחיפושים שמורים</li><li>מועדפי תוספים ותצוגה קומפקטית</li><li>מצב Focus וקיצורי מקלדת</li><li>משוב מובנה וכלי Debug פנימיים</li><li>טעינה עצלה ו־cache בזיכרון</li></ul><button class="primaryBtn">הבנתי</button>';
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

function cloneSafeV4(value){return JSON.parse(JSON.stringify(value))}
function makeFeatureIdV4(prefix='x'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}

function ensureUndoBarV4(){
  let bar=$('homeUndoBar');
  if(bar)return bar;
  bar=document.createElement('div');bar.id='homeUndoBar';bar.className='undoBar';bar.hidden=true;
  bar.innerHTML='<span id="homeUndoMessage"></span><button id="homeUndoButton" type="button">ביטול</button>';
  $('homeUndoButton').onclick=async()=>{
    const entry=undoEntry;if(!entry)return;
    clearTimeout(undoTimer);undoEntry=null;bar.hidden=true;
    try{await entry.undo();toast('הפעולה בוטלה')}catch(e){fLog('error','Undo failed',e);toast('לא ניתן לבטל את הפעולה')}
  };
  document.body.appendChild(bar);
  return bar;
}
window.homePushUndo=function(message,undo){
  const bar=ensureUndoBarV4();
  undoEntry={message,undo,expiresAt:Date.now()+UNDO_WINDOW_MS};
  $('homeUndoMessage').textContent=message;
  bar.hidden=false;
  clearTimeout(undoTimer);
  undoTimer=setTimeout(()=>{undoEntry=null;bar.hidden=true},UNDO_WINDOW_MS);
};

function rawTabCandidatesV4(raw){
  const r=raw&&typeof raw==='object'?raw:{};
  const book=r.book&&typeof r.book==='object'?r.book:{};
  const loc=r.location&&typeof r.location==='object'?r.location:{};
  return {r,book,loc};
}
function firstValueV4(values){
  return values.find(v=>v!==undefined&&v!==null&&v!=='');
}
function isRealBookTabV4(raw){
  if(!raw||typeof raw!=='object')return false;
  const r=raw,book=r.book&&typeof r.book==='object'?r.book:{};
  // Otzaria ReaderState: toolId is non-null for built-in tools and plugin tabs.
  if(r.toolId!=null&&String(r.toolId).trim()!=='')return false;
  if(r.isSelf===true)return false;
  const bookUid=String(firstValueV4([book.bookUid,book.uid,r.bookUid,r.currentBookUid,r.uid])||'').trim();
  const id=firstValueV4([book.id,book.bookDbId,book.databaseId,r.currentId,r.bookDbId,r.databaseId,r.id]);
  const type=firstValueV4([book.type,book.bookType,book.format,r.currentType,r.type,r.bookType,r.format]);
  const source=firstValueV4([book.source,r.currentSource,r.source]);
  // Official API marks non-book tabs with id/type/source null.
  return id!=null||!!bookUid||type!=null||source!=null;
}
function normalizeOpenTabV4(raw){
  if(!isRealBookTabV4(raw))return null;
  const {r,book,loc}=rawTabCandidatesV4(raw);
  const id=firstValueV4([book.id,book.bookDbId,book.databaseId,r.currentId,r.bookDbId,r.databaseId,r.id]);
  const bookUid=String(firstValueV4([book.bookUid,book.uid,r.bookUid,r.currentBookUid,r.uid])||'').trim();
  const title=firstValueV4([book.title,book.name,book.fileName,r.currentBook,r.title,r.name,r.book,r.bookId])||'ספר';
  const bookId=firstValueV4([book.bookId,book.title,book.name,r.currentBookId,r.bookId,r.book,r.title])||title;
  const type=firstValueV4([book.type,book.bookType,book.format,r.currentType,r.type,r.bookType,r.format])||'text';
  const source=firstValueV4([book.source,r.currentSource,r.source])||'library';
  const path=String(firstValueV4([book.path,book.sourcePath,book.filePath,r.path,r.sourcePath,r.filePath,''])||'');
  const indexRaw=firstValueV4([r.currentIndex,r.index,r.pageIndex,r.pageNumber,loc.currentIndex,loc.index,loc.pageIndex,loc.pageNumber,0]);
  const ref=String(firstValueV4([r.currentRef,r.ref,r.reference,loc.currentRef,loc.ref,loc.reference,''])||'');
  const external=(book.external&&typeof book.external==='object')?cloneSafeV4(book.external):((r.external&&typeof r.external==='object')?cloneSafeV4(r.external):null);
  const index=Number.isFinite(Number(indexRaw))?Number(indexRaw):0;
  const positionMode=['fixed','last'].includes(raw&&raw.positionMode)?raw.positionMode:'fixed';
  if(id==null&&!bookUid&&!bookId&&!path)return null;
  return {bookUid,id,bookId,type,source,title:String(title),path,index,ref,...(external?{external}:{}),positionMode};
}
function readerTabsV4(state){
  const s=state&&typeof state==='object'?state:{};
  const tabs=Array.isArray(s.openTabs)?s.openTabs:Array.isArray(s.tabs)?s.tabs:Array.isArray(s.readerTabs)?s.readerTabs:[];
  return tabs.filter(isRealBookTabV4).map(normalizeOpenTabV4).filter(Boolean);
}
function normalizedTextV4(v){return String(v||'').trim().toLocaleLowerCase('he').replace(/\s+/g,' ')}
function tabIdentityScoreV4(tab,book){
  const tu=String(tab&&tab.bookUid||'').trim(),bu=String(book&&book.bookUid||'').trim();
  if(tu&&bu)return tu===bu?400:-1;
  const tid=tab&&tab.id!=null?String(tab.id):'',bid=book&&book.id!=null?String(book.id):'';
  const tt=normalizedTextV4(tab&&tab.type),bt=normalizedTextV4(book&&book.type);
  if(tt&&bt&&tt!==bt)return -1;
  const ts=normalizedTextV4(tab&&tab.source),bs=normalizedTextV4(book&&book.source);
  if(ts&&bs&&ts!==bs)return -1;
  const tp=normalizedTextV4(tab&&tab.path),bp=normalizedTextV4(book&&book.path);
  if(tid&&bid&&tid===bid)return tp&&bp&&tp===bp?330:300;
  if(tp&&bp&&tp===bp)return 260;
  const names=[tab&&tab.bookId,tab&&tab.title].map(normalizedTextV4).filter(Boolean);
  const wanted=new Set([book&&book.bookId,book&&book.title].map(normalizedTextV4).filter(Boolean));
  if(names.some(n=>wanted.has(n)))return 180;
  return -1;
}
function findMatchingOpenTabV4(openTabs,book){
  let best=null,bestScore=-1;
  for(const tab of openTabs||[]){const score=tabIdentityScoreV4(tab,book);if(score>bestScore){best=tab;bestScore=score}}
  return bestScore>=0?best:null;
}

function tabKeyV4(book){return bookKey(book)}
function normalizeTabSetV4(raw){
  if(!raw||typeof raw!=='object')return null;
  const books=Array.isArray(raw.books)?raw.books.map(normalizeOpenTabV4).filter(Boolean):[];
  const oldBehavior=raw.existingBehavior;
  const conflictDefault=['ask','keep','restore'].includes(raw.conflictDefault)?raw.conflictDefault:
    oldBehavior==='restore'?'restore':oldBehavior==='keep'?'keep':'ask';
  return {
    id:String(raw.id||makeFeatureIdV4('tabs')),
    name:String(raw.name||'כרטיסיות שמורות').trim().slice(0,80)||'כרטיסיות שמורות',
    books:books.slice(0,100),
    conflictDefault,
    createdAt:Number(raw.createdAt)||Date.now(),
    updatedAt:Number(raw.updatedAt)||Date.now(),
    lastOpenedAt:Number(raw.lastOpenedAt)||0
  };
}
function tabStorageEnvelopeV4(items=savedTabSets){
  return {schemaVersion:TAB_SETS_SCHEMA,updatedAt:new Date().toISOString(),sets:cloneSafeV4(items)};
}
function parseTabStorageV4(raw){
  if(Array.isArray(raw))return {schemaVersion:1,updatedAt:0,sets:raw};
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.sets))return null;
  return {schemaVersion:Number(raw.schemaVersion)||1,updatedAt:Number(Date.parse(raw.updatedAt||''))||0,sets:raw.sets};
}
async function loadSavedTabSetsV4(){
  try{
    const [primaryRaw,backupRaw]=await Promise.all([fGet(TAB_SETS_KEY,null),fGet(TAB_SETS_BACKUP_KEY,null)]);
    const candidates=[parseTabStorageV4(primaryRaw),parseTabStorageV4(backupRaw)].filter(Boolean);
    candidates.sort((a,b)=>b.updatedAt-a.updatedAt);
    const selected=candidates[0]||{sets:[]};
    savedTabSets=selected.sets.map(normalizeTabSetV4).filter(Boolean);
    if(candidates.length<2||candidates.some(c=>JSON.stringify(c.sets)!==JSON.stringify(selected.sets))){
      try{await saveSavedTabSetsV4()}catch(e){fLog('warn','saved tabs backup repair skipped',e)}
    }
  }catch(e){
    savedTabSets=[];
    fLog('error','saved tabs load failed; continuing without saved data',e);
  }
}
async function saveSavedTabSetsV4(){
  const envelope=tabStorageEnvelopeV4();
  const [a,b]=await Promise.all([fSet(TAB_SETS_KEY,envelope),fSet(TAB_SETS_BACKUP_KEY,envelope)]);
  if(!a&&!b)throw new Error('saved tabs storage failed');
  return !!(a||b);
}
function uniqueTabSetNameV4(name,collection=savedTabSets){
  const base=String(name||'כרטיסיות').trim()||'כרטיסיות';
  const used=new Set(collection.map(x=>normalizedTextV4(x.name)));
  if(!used.has(normalizedTextV4(base)))return base;
  let n=2,candidate='';
  do{candidate=base+' ('+n+++')'}while(used.has(normalizedTextV4(candidate)));
  return candidate;
}

function ensureSavedTabsSectionV4(){
  let sec=$('section-saved-tabs');
  if(sec)return sec;
  sec=document.createElement('section');sec.id='section-saved-tabs';sec.className='sectionPanel wide savedTabsSection';
  sec.innerHTML='<div class="sectionHead"><h2>כרטיסיות שמורות</h2><span>פתיחת קבוצת ספרים בלחיצה אחת</span></div><div class="savedTabToolbar"><button id="captureTabsBtn" class="primaryBtn" type="button">'+iconTextV4('bookmark','שמור את הלשוניות הפתוחות')+'</button><button id="exportTabSetsBtn" class="secondaryBtn" type="button">ייצוא</button><button id="importTabSetsBtn" class="secondaryBtn" type="button">ייבוא</button><input id="importTabSetsFile" type="file" accept="application/json,.json" hidden></div><div id="savedTabGrid" class="savedTabGrid"></div>';
  const host=$('sectionsHost');
  host.insertBefore(sec,host.firstChild);
  $('captureTabsBtn').onclick=captureCurrentTabsV4;
  $('exportTabSetsBtn').onclick=exportTabSetsV4;
  $('importTabSetsBtn').onclick=()=>$('importTabSetsFile').click();
  $('importTabSetsFile').onchange=importTabSetsV4;
  return sec;
}
function renderSavedTabSetsV4(){
  ensureSavedTabsSectionV4();
  const grid=$('savedTabGrid');grid.innerHTML='';
  if(!savedTabSets.length){
    grid.innerHTML='<div class="savedTabsEmpty">עדיין אין כרטיסיות שמורות. פתח כמה ספרים ולחץ על “שמור את הלשוניות הפתוחות”.</div>';
    return;
  }
  const ordered=[...savedTabSets].sort((a,b)=>(b.lastOpenedAt||0)-(a.lastOpenedAt||0)||(b.updatedAt||0)-(a.updatedAt||0));
  ordered.forEach(set=>{
    const card=document.createElement('article');card.className='savedTabCard';card.tabIndex=0;card.setAttribute('role','button');
    const actions=document.createElement('div');actions.className='savedTabActions';
    const edit=document.createElement('button');setIconButtonV4(edit,'settings','ערוך כרטיס');
    edit.onclick=e=>{e.stopPropagation();openTabSetActionsV4(set,edit)};
    actions.appendChild(edit);
    const preview=set.books.slice(0,4).map(b=>'<div class="savedTabBook">'+esc(b.title||b.bookId||'ספר')+(b.ref?' · '+esc(b.ref):'')+'</div>').join('');
    card.innerHTML='<h3>'+esc(set.name)+'</h3><div class="savedTabMeta">'+set.books.length+' ספרים</div><div class="savedTabBooks">'+preview+(set.books.length>4?'<div class="savedTabMore">ועוד '+(set.books.length-4)+'…</div>':'')+'</div>';
    card.appendChild(actions);
    card.onclick=()=>openTabSetPreviewV4(set);
    card.oncontextmenu=e=>{
      e.preventDefault();
      e.stopPropagation();
      openTabSetActionsV4(set,{clientX:e.clientX,clientY:e.clientY});
    };
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTabSetPreviewV4(set)}};
    grid.appendChild(card);
  });
}
async function captureCurrentTabsV4(){
  let state;
  try{state=dataOf(await Otzaria.call('reader.getCurrentState'))}catch(e){fLog('error','read open tabs failed',e)}
  const rawTabs=state&&Array.isArray(state.openTabs)?state.openTabs:[];
  const books=readerTabsV4(state);
  const ignored=Math.max(0,rawTabs.length-books.length);
  if(!books.length){toast('אין כעת לשוניות ספרים פתוחות לשמירה');return}
  if(ignored)toast(ignored+' לשוניות שאינן ספרים לא יישמרו');
  openTabSetEditorV4({mode:'create',books});
}
function openTabSetEditorV4({mode,set,books}){
  const old=$('tabSetDialogV4');if(old)old.remove();
  const dialog=document.createElement('div');dialog.id='tabSetDialogV4';dialog.className='tabSetDialog';
  const source=set||{name:'',books:books||[],conflictDefault:'ask'};
  const draftBooks=cloneSafeV4(source.books||[]);
  const suggested=source.name||('כרטיסיות '+(savedTabSets.length+1));

  dialog.innerHTML='<div class="tabSetDialogCard tabSetEditorCard">'+
    '<div class="tabSetDialogHeader"><div><h2>'+(mode==='create'?'שמירת הכרטיסיות הפתוחות':'עריכת כרטיס')+'</h2><div class="hint">אפשר לשנות סדר, להסיר ולהוסיף ספרים לפני השמירה.</div></div><button id="tabSetCloseV4" class="nativeIconButton" type="button" aria-label="סגור">'+uiIconV4('close')+'</button></div>'+
    '<label>שם הכרטיס</label><input id="tabSetNameV4" maxlength="80" value="'+esc(suggested)+'">'+
    '<div class="tabSetEditorSetting"><span>ספר שכבר פתוח</span><select id="tabSetConflictDefaultV4"><option value="ask">שאל בכל פתיחה</option><option value="keep">השאר במיקום הנוכחי</option><option value="restore">שחזר למיקום השמור</option></select></div>'+
    '<div class="tabSetEditorTools"><button id="tabSetAddOpenV4" class="secondaryBtn" type="button">הוסף מהלשוניות הפתוחות</button><button id="tabSetRepairV4" class="secondaryBtn" type="button">בדוק ותקן ספרים</button></div>'+
    '<div class="tabSetLibraryAdd"><input id="tabSetBookSearchV4" type="text" placeholder="חפש ספר להוספה…"><div id="tabSetBookSearchResultsV4" class="tabSetBookSearchResults"></div></div>'+
    '<div id="tabSetPreviewV4" class="tabSetPreview"></div>'+
    '<div class="tabSetDialogActions"><button id="tabSetCancelV4" class="secondaryBtn" type="button">ביטול</button><button id="tabSetSaveV4" class="primaryBtn" type="button">שמור</button></div></div>';

  document.body.appendChild(dialog);
  const behavior=dialog.querySelector('#tabSetConflictDefaultV4');
  behavior.value=source.conflictDefault||'ask';

  const close=()=>dialog.remove();
  dialog.querySelector('#tabSetCloseV4').onclick=close;
  dialog.querySelector('#tabSetCancelV4').onclick=close;
  dialog.onclick=e=>{if(e.target===dialog)close()};

  const renderDraft=()=>{
    const box=dialog.querySelector('#tabSetPreviewV4');box.innerHTML='';
    if(!draftBooks.length){box.innerHTML='<div class="savedTabsEmpty">אין ספרים בכרטיס.</div>';return}
    draftBooks.forEach((book,i)=>{
      const row=document.createElement('div');row.className='tabSetPreviewRow editable';
      const text=document.createElement('div');text.className='tabSetPreviewText';
      text.innerHTML='<b>'+esc(book.title||book.bookId||'ספר')+'</b><span>'+esc(book.ref||'')+'</span>';
      const controls=document.createElement('div');controls.className='tabSetBookControls';
      const mode=document.createElement('select');mode.className='tabSetPositionMode';mode.title='מיקום פתיחה';
      mode.innerHTML='<option value="fixed">מיקום שמור</option><option value="last">המיקום האחרון</option>';
      mode.value=book.positionMode||'fixed';
      mode.onchange=()=>{book.positionMode=mode.value==='last'?'last':'fixed'};
      controls.appendChild(mode);
      const actions=document.createElement('div');actions.className='tabSetPreviewActions';
      const up=document.createElement('button');setIconButtonV4(up,'up','העבר למעלה');up.disabled=i===0;
      up.onclick=()=>{if(i<=0)return;[draftBooks[i-1],draftBooks[i]]=[draftBooks[i],draftBooks[i-1]];renderDraft()};
      const down=document.createElement('button');setIconButtonV4(down,'down','העבר למטה');down.disabled=i===draftBooks.length-1;
      down.onclick=()=>{if(i>=draftBooks.length-1)return;[draftBooks[i+1],draftBooks[i]]=[draftBooks[i],draftBooks[i+1]];renderDraft()};
      const remove=document.createElement('button');setIconButtonV4(remove,'close','הסר מהכרטיס');remove.onclick=()=>{draftBooks.splice(i,1);renderDraft()};
      actions.append(up,down,remove);controls.appendChild(actions);row.append(text,controls);box.appendChild(row);
    });
  };
  const addBooks=(items)=>{
    const keys=new Set(draftBooks.map(tabKeyV4));let added=0;
    for(const raw of items||[]){const b=normalizeOpenTabV4(raw)||compactBook(raw);const k=tabKeyV4(b);if(!k||keys.has(k))continue;keys.add(k);draftBooks.push(b);added++}
    renderDraft();return added;
  };
  renderDraft();

  dialog.querySelector('#tabSetAddOpenV4').onclick=async()=>{
    let state=null;try{state=dataOf(await Otzaria.call('reader.getCurrentState'))}catch(_){}
    const rawTabs=state&&Array.isArray(state.openTabs)?state.openTabs:[];
    const bookTabs=readerTabsV4(state);
    const ignored=Math.max(0,rawTabs.length-bookTabs.length);
    const added=addBooks(bookTabs);
    if(added)toast('נוספו '+added+' ספרים'+(ignored?' · '+ignored+' לשוניות כלים/תוספים דולגו':''));
    else toast(ignored?'לא נמצאו ספרים חדשים; לשוניות כלים/תוספים אינן נשמרות':'לא נמצאו ספרים חדשים להוספה');
  };

  dialog.querySelector('#tabSetRepairV4').onclick=async()=>{
    const button=dialog.querySelector('#tabSetRepairV4');button.disabled=true;
    let repaired=0,missing=0;
    for(let i=0;i<draftBooks.length;i++){
      const book=draftBooks[i];
      try{
        const q=String(book.title||book.bookId||'').trim();
        if(!q){missing++;continue}
        const r=await Otzaria.call('library.findBooks',{query:q,limit:12});
        const rows=dataOf(r)||[];
        let best=null,bestScore=-1;
        for(const candidate of rows){
          const score=tabIdentityScoreV4(normalizeOpenTabV4(candidate)||candidate,book);
          if(score>bestScore){best=candidate;bestScore=score}
        }
        if(!best&&rows.length===1)best=rows[0];
        if(best){
          const normalized=normalizeOpenTabV4({...best,index:book.index,ref:book.ref,positionMode:book.positionMode})||book;
          draftBooks[i]={...book,...normalized,index:book.index,ref:book.ref,positionMode:book.positionMode||'fixed'};
          repaired++;
        }else missing++;
      }catch(_){missing++}
    }
    renderDraft();button.disabled=false;
    toast(repaired+' ספרים אומתו/תוקנו'+(missing?' · '+missing+' לא זוהו':''));
  };

  const searchInput=dialog.querySelector('#tabSetBookSearchV4');
  const resultsBox=dialog.querySelector('#tabSetBookSearchResultsV4');
  let timer=0,seq=0;
  const runLibrarySearch=()=>{
    clearTimeout(timer);const q=searchInput.value.trim();const my=++seq;
    if(q.length<2){resultsBox.innerHTML='';return}
    timer=setTimeout(async()=>{
      try{
        const r=await Otzaria.call('library.findBooks',{query:q,limit:8});if(my!==seq)return;
        const rows=dataOf(r)||[];resultsBox.innerHTML='';
        rows.forEach(book=>{
          const b=document.createElement('button');b.type='button';b.className='tabSetBookSearchResult';
          b.innerHTML='<b>'+esc(book.title||book.book||book.bookId||'ספר')+'</b><span>'+esc(book.categoryPath||book.ref||'')+'</span>';
          b.onclick=()=>{const added=addBooks([book]);if(added){searchInput.value='';resultsBox.innerHTML=''}else toast('הספר כבר נמצא בכרטיס')};
          resultsBox.appendChild(b);
        });
        if(!rows.length)resultsBox.innerHTML='<div class="hint">לא נמצאו ספרים.</div>';
      }catch(e){resultsBox.innerHTML='<div class="hint">לא ניתן לחפש כרגע.</div>'}
    },220);
  };
  searchInput.addEventListener('input',runLibrarySearch);

  const input=dialog.querySelector('#tabSetNameV4');input.focus();input.select();
  dialog.querySelector('#tabSetSaveV4').onclick=async()=>{
    const name=input.value.trim();if(!name){input.focus();return}
    if(!draftBooks.length){toast('יש להוסיף לפחות ספר אחד לכרטיס');return}
    const conflictDefault=['keep','restore'].includes(behavior.value)?behavior.value:'ask';
    if(mode==='create'){
      const item={id:makeFeatureIdV4('tabs'),name,books:cloneSafeV4(draftBooks),conflictDefault,createdAt:Date.now(),updatedAt:Date.now(),lastOpenedAt:0};
      savedTabSets.push(item);await saveSavedTabSetsV4();renderSavedTabSetsV4();close();toast('הכרטיס נשמר');
      window.homePushUndo('הכרטיס “'+name+'” נוסף',async()=>{savedTabSets=savedTabSets.filter(x=>x.id!==item.id);await saveSavedTabSetsV4();renderSavedTabSetsV4()});
    }else{
      const before=cloneSafeV4(set);set.name=name;set.books=cloneSafeV4(draftBooks);set.conflictDefault=conflictDefault;set.updatedAt=Date.now();
      await saveSavedTabSetsV4();renderSavedTabSetsV4();close();toast('הכרטיס עודכן');
      window.homePushUndo('הכרטיס עודכן',async()=>{Object.assign(set,before);await saveSavedTabSetsV4();renderSavedTabSetsV4()});
    }
  };
}
function buildOpenParamsV4(book,navigateToPositionIfReused=true,indexOverride=null){
  const p={};
  for(const k of ['bookUid','id','bookId','type','source','external'])if(book&&book[k]!=null&&book[k]!=='')p[k]=book[k];
  const idx=indexOverride!=null?Number(indexOverride):Number(book&&book.index);
  if(Number.isFinite(idx))p.index=idx;
  p.navigateToPositionIfReused=!!navigateToPositionIfReused;
  return p;
}
function historyLocationForBookV4(history,book){
  let best=null,bestScore=-1;
  for(const raw of history||[]){
    const item=normalizeOpenTabV4(raw);
    if(!item)continue;
    const score=tabIdentityScoreV4(item,book);
    if(score>bestScore){best=item;bestScore=score}
  }
  return bestScore>=0?best:null;
}
async function askTabConflictV4(set,count){
  return new Promise(resolve=>{
    const old=$('tabSetConflictDialogV4');if(old)old.remove();
    const dialog=document.createElement('div');dialog.id='tabSetConflictDialogV4';dialog.className='tabSetDialog';
    dialog.innerHTML='<div class="tabSetDialogCard"><div class="tabSetDialogHeader"><div><h2>ספרים שכבר פתוחים</h2><div class="hint">'+count+' ספרים מהכרטיס “'+esc(set.name)+'” כבר פתוחים.</div></div></div><p>מה לעשות עם הספרים שכבר פתוחים?</p><div class="tabSetDialogActions"><button id="tabConflictCancelV4" class="secondaryBtn" type="button">ביטול</button><button id="tabConflictKeepV4" class="secondaryBtn" type="button">השאר במיקום הנוכחי</button><button id="tabConflictRestoreV4" class="primaryBtn" type="button">שחזר למיקום השמור</button></div></div>';
    document.body.appendChild(dialog);
    const done=value=>{dialog.remove();resolve(value)};
    dialog.querySelector('#tabConflictCancelV4').onclick=()=>done(null);
    dialog.querySelector('#tabConflictKeepV4').onclick=()=>done('keep');
    dialog.querySelector('#tabConflictRestoreV4').onclick=()=>done('restore');
    dialog.onclick=e=>{if(e.target===dialog)done(null)};
  });
}
async function openTabSetV4(set,selectedBooks=null){
  const books=Array.isArray(selectedBooks)&&selectedBooks.length?selectedBooks:set&&set.books||[];
  if(!set||!books.length){toast('לא נבחרו ספרים לפתיחה');return}

  let current=[],stateReliable=true;
  try{current=readerTabsV4(dataOf(await Otzaria.call('reader.getCurrentState')))}
  catch(e){stateReliable=false;fLog('warn','reader state unavailable while opening saved tabs',e)}

  const conflicts=books.map(book=>({book,openTab:findMatchingOpenTabV4(current,book)})).filter(x=>x.openTab);
  let policy=set.conflictDefault||'ask';
  if(conflicts.length&&policy==='ask'){
    policy=await askTabConflictV4(set,conflicts.length);
    if(!policy){toast('הפתיחה בוטלה');return}
  }
  if(!stateReliable&&policy==='keep')policy='restore';

  let history=[];
  if(books.some(b=>b.positionMode==='last')){
    try{history=dataOf(await Otzaria.call('history.list',{limit:200}))||[]}catch(e){fLog('warn','reading history unavailable',e)}
  }

  const queue=[];
  for(const book of books){
    const openTab=findMatchingOpenTabV4(current,book);
    if(openTab&&policy==='keep')continue;
    const last=book.positionMode==='last'?historyLocationForBookV4(history,book):null;
    const index=last?last.index:book.index;
    queue.push({book,promise:Otzaria.call('reader.openBook',buildOpenParamsV4(book,policy==='restore',index))});
  }

  // Queue a final focus request for the first book, as in Otzaria's open-or-focus behavior.
  const primary=books[0];
  const primaryOpen=findMatchingOpenTabV4(current,primary);
  if(primary){
    const last=primary.positionMode==='last'?historyLocationForBookV4(history,primary):null;
    const focusIndex=policy==='restore'?(last?last.index:primary.index):primaryOpen.index;
    queue.push({book:primary,focusOnly:true,promise:Otzaria.call('reader.openBook',buildOpenParamsV4(primary,policy==='restore',focusIndex))});
  }else if(queue.length>1){
    const first=queue.shift();
    queue.push(first);
  }

  if(!queue.length){
    const idx=current.findIndex(tab=>tabIdentityScoreV4(tab,primary)>=0);
    if(idx>=0){try{await Otzaria.call('reader.activateTab',{index:idx})}catch(_){}}
    set.lastOpenedAt=Date.now();await saveSavedTabSetsV4();renderSavedTabSetsV4();toast('כל הספרים שנבחרו כבר פתוחים');return;
  }

  const results=await Promise.allSettled(queue.map(x=>x.promise));
  const normal=queue.filter(x=>!x.focusOnly);
  let ok=0;
  results.forEach((r,i)=>{if(!queue[i].focusOnly&&r.status==='fulfilled'&&(!r.value||r.value.success!==false))ok++});
  const kept=books.length-normal.length;
  set.lastOpenedAt=Date.now();await saveSavedTabSetsV4();renderSavedTabSetsV4();
  const handled=ok+Math.max(0,kept);
  toast(handled>=books.length?'הכרטיס נפתח':'טופלו '+handled+' מתוך '+books.length+' ספרים');
}

async function openTabSetPreviewV4(set){
  const old=$('tabSetPreviewDialogV4');if(old)old.remove();
  let current=[];try{current=readerTabsV4(dataOf(await Otzaria.call('reader.getCurrentState')))}catch(_){}
  const dialog=document.createElement('div');dialog.id='tabSetPreviewDialogV4';dialog.className='tabSetDialog';
  const policyLabel=set.conflictDefault==='restore'?'שחזור מיקום':set.conflictDefault==='keep'?'שמירת המיקום הנוכחי':'שאלה בעת התנגשות';
  dialog.innerHTML='<div class="tabSetDialogCard"><div class="tabSetDialogHeader"><div><h2>'+esc(set.name)+'</h2><div class="hint">'+set.books.length+' ספרים · '+policyLabel+'</div></div><button id="tabSetPreviewCloseV4" class="nativeIconButton" type="button" aria-label="סגור">'+uiIconV4('close')+'</button></div><div class="tabSetPreviewSelectTools"><button id="tabSetSelectAllV4" class="secondaryBtn" type="button">בחר הכול</button><button id="tabSetClearAllV4" class="secondaryBtn" type="button">נקה</button></div><div id="tabSetOpenChoicesV4" class="tabSetPreview"></div><div class="tabSetDialogActions"><button id="tabSetPreviewEditV4" class="secondaryBtn" type="button">ערוך</button><button id="tabSetPreviewOpenV4" class="primaryBtn" type="button">פתח נבחרים</button></div></div>';
  document.body.appendChild(dialog);
  const list=dialog.querySelector('#tabSetOpenChoicesV4');
  set.books.forEach((book,i)=>{
    const opened=!!findMatchingOpenTabV4(current,book);
    const row=document.createElement('label');row.className='tabSetPreviewRow previewOnly selectable';
    const check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.index=String(i);
    const text=document.createElement('div');text.className='tabSetPreviewText';
    text.innerHTML='<b>'+esc(book.title||book.bookId||'ספר')+'</b><span>'+esc(book.ref||'')+(book.positionMode==='last'?' · מיקום אחרון':'')+'</span>';
    const state=document.createElement('span');state.className='tabSetOpenState '+(opened?'open':'missing');state.textContent=opened?'פתוח':'ייפתח';
    row.append(check,text,state);list.appendChild(row);
  });
  const close=()=>dialog.remove();
  dialog.querySelector('#tabSetPreviewCloseV4').onclick=close;
  dialog.onclick=e=>{if(e.target===dialog)close()};
  dialog.querySelector('#tabSetSelectAllV4').onclick=()=>list.querySelectorAll('input').forEach(x=>x.checked=true);
  dialog.querySelector('#tabSetClearAllV4').onclick=()=>list.querySelectorAll('input').forEach(x=>x.checked=false);
  dialog.querySelector('#tabSetPreviewEditV4').onclick=()=>{close();openTabSetEditorV4({mode:'edit',set})};
  dialog.querySelector('#tabSetPreviewOpenV4').onclick=()=>{
    const selected=[...list.querySelectorAll('input:checked')].map(x=>set.books[Number(x.dataset.index)]).filter(Boolean);
    if(!selected.length){toast('לא נבחרו ספרים לפתיחה');return}
    close();openTabSetV4(set,selected);
  };
}
function downloadTabSetsV4(sets,filename){
  const payload={format:'otzaria-home-saved-tabs',version:TAB_SETS_SCHEMA,exportedAt:new Date().toISOString(),sets};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportSingleTabSetV4(set){
  downloadTabSetsV4([set],'otzaria-home-'+String(set.name||'saved-tabs').replace(/[\\/:*?"<>|]+/g,'-')+'.json');
}
function openTabSetActionsV4(set,anchorOrPoint){
  const old=document.querySelector('.tabSetActionMenu');if(old)old.remove();
  const menu=document.createElement('div');menu.className='groupPicker tabSetActionMenu';
  menu.setAttribute('role','menu');
  const actions=[
    ['פתח / בחר ספרים',()=>openTabSetPreviewV4(set)],
    ['עדכן מיקומים מהלשוניות הפתוחות',()=>updateTabSetPositionsV4(set)],
    ['ייצא כרטיס',()=>exportSingleTabSetV4(set)],
    ['ערוך כרטיס',()=>openTabSetEditorV4({mode:'edit',set})],
    ['מחק',()=>deleteTabSetV4(set),'danger']
  ];
  actions.forEach(([label,fn,kind])=>{
    const b=document.createElement('button');
    b.type='button';
    b.setAttribute('role','menuitem');
    b.textContent=label;
    if(kind)b.classList.add('dangerAction');
    b.onclick=e=>{e.stopPropagation();menu.remove();fn()};
    menu.appendChild(b);
  });

  let x=8,y=8;
  if(anchorOrPoint&&Number.isFinite(anchorOrPoint.clientX)&&Number.isFinite(anchorOrPoint.clientY)){
    x=anchorOrPoint.clientX;y=anchorOrPoint.clientY;
  }else if(anchorOrPoint&&anchorOrPoint.getBoundingClientRect){
    const r=anchorOrPoint.getBoundingClientRect();x=r.left;y=r.bottom+6;
  }
  document.body.appendChild(menu);
  const mr=menu.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(innerWidth-mr.width-8,x))+'px';
  menu.style.top=Math.max(8,Math.min(innerHeight-mr.height-8,y))+'px';

  const close=()=>menu.remove();
  const onKey=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',onKey)}};
  document.addEventListener('keydown',onKey);
  setTimeout(()=>document.addEventListener('click',close,{once:true}),0);
}
async function updateTabSetPositionsV4(set){
  let current=[];try{current=readerTabsV4(dataOf(await Otzaria.call('reader.getCurrentState')))}catch(_){}
  if(!current.length){toast('אין לשוניות פתוחות לעדכון');return}
  const before=cloneSafeV4(set);let updated=0;
  set.books=set.books.map(book=>{
    const live=findMatchingOpenTabV4(current,book);
    if(!live)return book;
    updated++;
    return {...book,bookUid:live.bookUid||book.bookUid,id:live.id??book.id,path:live.path||book.path,index:live.index,ref:live.ref||book.ref};
  });
  if(!updated){toast('לא נמצאו ספרים תואמים בין הכרטיס ללשוניות הפתוחות');return}
  set.updatedAt=Date.now();await saveSavedTabSetsV4();renderSavedTabSetsV4();toast('עודכנו '+updated+' מיקומים');
  window.homePushUndo('מיקומי הכרטיס עודכנו',async()=>{Object.assign(set,before);await saveSavedTabSetsV4();renderSavedTabSetsV4()});
}
async function deleteTabSetV4(set){
  const index=savedTabSets.findIndex(x=>x.id===set.id);if(index<0)return;
  const removed=cloneSafeV4(savedTabSets[index]);savedTabSets.splice(index,1);await saveSavedTabSetsV4();renderSavedTabSetsV4();toast('הכרטיס נמחק');
  window.homePushUndo('הכרטיס “'+removed.name+'” נמחק',async()=>{savedTabSets.splice(Math.min(index,savedTabSets.length),0,removed);await saveSavedTabSetsV4();renderSavedTabSetsV4()});
}
function exportTabSetsV4(){
  if(!savedTabSets.length){toast('אין כרטיסיות שמורות לייצוא');return}
  downloadTabSetsV4(savedTabSets,'otzaria-home-saved-tabs.json');
}
async function confirmImportTabSetsV4(incoming){
  return new Promise(resolve=>{
    const dialog=document.createElement('div');dialog.className='tabSetDialog';dialog.id='tabSetImportPreviewV4';
    dialog.innerHTML='<div class="tabSetDialogCard"><div class="tabSetDialogHeader"><div><h2>בדיקת קובץ הייבוא</h2><div class="hint">נמצאו '+incoming.length+' כרטיסים תקינים.</div></div></div><div class="tabSetPreview">'+incoming.slice(0,30).map(x=>'<div class="tabSetPreviewRow"><div class="tabSetPreviewText"><b>'+esc(x.name)+'</b><span>'+x.books.length+' ספרים</span></div></div>').join('')+(incoming.length>30?'<div class="hint">ועוד '+(incoming.length-30)+'…</div>':'')+'</div><div class="tabSetDialogActions"><button id="tabImportCancelV4" class="secondaryBtn" type="button">ביטול</button><button id="tabImportConfirmV4" class="primaryBtn" type="button">ייבא</button></div></div>';
    document.body.appendChild(dialog);
    const done=v=>{dialog.remove();resolve(v)};
    dialog.querySelector('#tabImportCancelV4').onclick=()=>done(false);
    dialog.querySelector('#tabImportConfirmV4').onclick=()=>done(true);
    dialog.onclick=e=>{if(e.target===dialog)done(false)};
  });
}
async function importTabSetsV4(event){
  const file=event.target.files&&event.target.files[0];event.target.value='';if(!file)return;
  if(file.size>5*1024*1024){toast('קובץ הייבוא גדול מדי');return}
  try{
    const json=JSON.parse(await file.text());
    if(!json||json.format!=='otzaria-home-saved-tabs'||!Array.isArray(json.sets))throw new Error('format');
    if(Number(json.version||1)>TAB_SETS_SCHEMA)throw new Error('future');
    const incoming=json.sets.map(normalizeTabSetV4).filter(Boolean).slice(0,500);
    if(!incoming.length){toast('לא נמצאו כרטיסים תקינים בקובץ');return}
    if(!await confirmImportTabSetsV4(incoming)){toast('הייבוא בוטל');return}
    const before=cloneSafeV4(savedTabSets);
    const existingIds=new Set(savedTabSets.map(x=>x.id));
    for(const item of incoming){
      if(existingIds.has(item.id))item.id=makeFeatureIdV4('tabs');
      item.name=uniqueTabSetNameV4(item.name,savedTabSets);
      savedTabSets.push(item);existingIds.add(item.id);
    }
    await saveSavedTabSetsV4();renderSavedTabSetsV4();toast('יובאו '+incoming.length+' כרטיסים');
    window.homePushUndo('יובאו '+incoming.length+' כרטיסים',async()=>{savedTabSets=before;await saveSavedTabSetsV4();renderSavedTabSetsV4()});
  }catch(e){toast(e&&e.message==='future'?'קובץ זה נוצר בגרסה חדשה יותר של התוסף':'קובץ הייבוא אינו תקין')}
}

function setupFeatureUi(){
  const steps=[
    ['styles',()=>styleFeatureLayer()],
    ['appearance',()=>applyFeatureAppearance()],
    ['undo',()=>ensureUndoBarV4()],
    ['saved-tabs-section',()=>{ensureSavedTabsSectionV4();renderSavedTabSetsV4()}],
    ['dashboard',()=>addDashboard()],
    ['saved-searches',()=>addSavedSearchControls()],
    ['drag-drop',()=>makeSectionsDraggable()],
    ['section-tools',()=>addSectionTools()],
    ['plugin-controls',()=>setupPluginControls()],
    ['settings',()=>injectSettingsTabsV4()],
    ['feedback',()=>enhanceFeedbackCategories()],
    ['external-links',()=>wireExternalLinks()],
    ['quick-pins',()=>renderQuickPins()],
    ['keyboard',()=>setupKeyboard()],
    ['accessibility',()=>enhanceAccessibility()],
    ['compatibility',()=>compatibilityCleanup()],
    ['ui-state',()=>rememberUiState()]
  ];
  for(const [name,step] of steps){
    try{step()}catch(e){fLog('error','Feature setup failed: '+name,e);console.error('Feature setup failed:',name,e)}
  }
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
    wireExternalLinks();
    try{await loadSavedTabSetsV4()}catch(e){fLog('error','saved tabs boot load failed',e)}
    try{const st=dataOf(await Otzaria.call('reader.getCurrentState'));if(st&&st.currentBookId)currentBookScopeV4={id:st.currentId,type:st.currentType,source:st.currentSource,bookId:st.currentBookId,title:st.currentBook,index:st.currentIndex,ref:st.currentRef}}catch(_){}
    setupFeatureUi();await loadSearchHistoryV4();renderSavedSearchControls();await loadPluginsReliableV4();await refreshDashboard();await detectDebugPackage();showChangelog();setTimeout(()=>{if(!$('settingsModal').hidden)setSettingsTab(featureSettings.lastSettingsTab||'general')},0);fLog('info','Feature layer booted',FEATURE_VERSION);
  }catch(e){fLog('error','Feature layer boot failed',e);console.error('Feature layer boot failed',e)}
});
Otzaria.on('theme.changed',()=>applyFeatureAppearance());
