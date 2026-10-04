const $=id=>document.getElementById(id);
const SELF='new-tab-home';
const SETTINGS_KEY='homeSettingsV1';
const GROUPS_KEY='bookGroupsV1';
const SEARCH_LIMIT=40;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=x=>JSON.parse(JSON.stringify(x));
const dataOf=r=>r&&r.success?r.data:null;

const DEFAULT_SEARCH={
  mode:'advanced',
  order:'relevance',
  grouping:'none',
  proximityScope:'wordDistance',
  wordMatchMode:'all',
  wordMatchCount:2,
  distance:0,
  negativeQuery:'',
  baseBooksOnly:false,
  eras:[],
  options:{}
};
const DEFAULT_SETTINGS={
  plusTarget:'plugin',
  sectionOrder:['groups','recent','bookmarks','history','plugins'],
  visibleSections:{groups:true,plugins:true,recent:true,bookmarks:true,history:true},
  quickActions:{library:true,search:true,reading:true,history:true,bookmarks:true},
  listLimit:7,
  searchConfig:DEFAULT_SEARCH
};

let settings=clone(DEFAULT_SETTINGS);
let groups=[{id:'favorites',name:'מועדפים',books:[]}];
let searchOptions=null;
let searchTimer=0;
let searchSeq=0;
let currentResults=[];
let currentTotal=0;
let currentGroupCount=null;
let currentOffset=0;
let currentBookCounts=[];
let selectedScopeBook=null;
let allPlugins=[];
let lastBatchSize=0;

async function storageGet(key,fallback){
  try{
    const r=await Otzaria.call('storage.get',{key});
    return r&&r.success&&r.data!=null?r.data:fallback;
  }catch(_){return fallback}
}
async function storageSet(key,value){
  try{return await Otzaria.call('storage.set',{key,value})}catch(_){return null}
}

function normalizeSettings(raw){
  const s=Object.assign({},clone(DEFAULT_SETTINGS),raw||{});
  s.visibleSections=Object.assign({},DEFAULT_SETTINGS.visibleSections,(raw&&raw.visibleSections)||{});
  s.quickActions=Object.assign({},DEFAULT_SETTINGS.quickActions,(raw&&raw.quickActions)||{});
  s.searchConfig=Object.assign({},DEFAULT_SEARCH,(raw&&raw.searchConfig)||{});
  s.searchConfig.eras=Array.isArray(s.searchConfig.eras)?s.searchConfig.eras:[];
  s.searchConfig.options=s.searchConfig.options&&typeof s.searchConfig.options==='object'?s.searchConfig.options:{};
  const valid=DEFAULT_SETTINGS.sectionOrder;
  const incoming=Array.isArray(raw&&raw.sectionOrder)?raw.sectionOrder:[];
  s.sectionOrder=incoming.filter(x=>valid.includes(x)).concat(valid.filter(x=>!incoming.includes(x)));
  if(!['plugin','library','reading'].includes(s.plusTarget))s.plusTarget='plugin';
  if(![5,7,10,12,20].includes(Number(s.listLimit)))s.listLimit=7;
  return s;
}
function normalizeGroups(raw){
  const arr=Array.isArray(raw)?raw:[];
  const clean=arr.filter(g=>g&&typeof g.id==='string'&&typeof g.name==='string').map(g=>({
    id:g.id,
    name:(g.name.trim()||'קבוצה').slice(0,40),
    books:Array.isArray(g.books)?g.books.slice(0,100):[]
  }));
  if(!clean.some(g=>g.id==='favorites'))clean.unshift({id:'favorites',name:'מועדפים',books:[]});
  return clean;
}

function applyTheme(t){
  if(!t)return;
  const c=t.colorScheme||{},y=t.typography||{},r=document.documentElement.style;
  r.setProperty('--bg',c.surfaceContainerLowest||c.surface||'#f7f7fb');
  r.setProperty('--surface',c.surface||'#fff');
  r.setProperty('--surface2',c.surfaceContainerHighest||c.secondaryContainer||'#f3f2f8');
  r.setProperty('--surface3',c.surfaceContainerHigh||c.secondaryContainer||'#ebe9f3');
  r.setProperty('--text',c.onSurface||'#1d1b20');
  r.setProperty('--muted',c.outline||'#74717d');
  r.setProperty('--primary',c.primary||'#6750a4');
  r.setProperty('--onPrimary',c.onPrimary||'#fff');
  r.setProperty('--soft',c.secondaryContainer||'#ece5ff');
  r.setProperty('--outline',c.outlineVariant||c.outline||'#d8d4df');
  r.setProperty('--error',c.error||'#b3261e');
  if(y.uiFontFamily)r.setProperty('--ui',JSON.stringify(y.uiFontFamily)+',system-ui,sans-serif');
}

function identity(b){
  const p={};
  for(const k of ['bookUid','id','bookId','type','source'])if(b&&b[k]!=null)p[k]=b[k];
  return p;
}
function compactBook(b){
  return Object.assign(identity(b),{
    title:(b&&(b.title||b.book||b.bookTitle||b.bookId))||'ספר',
    ref:(b&&(b.ref||b.reference||b.currentRef))||'',
    index:b&&b.index!=null?b.index:0
  });
}
function bookKey(b){
  const idPart=b&&b.id!=null?b.id:'';
  return (b&&b.bookUid)||[(b&&b.source)||'',(b&&b.type)||'',idPart,(b&&(b.bookId||b.title))||''].join('|');
}
function isInAnyGroup(b){
  const k=bookKey(b);
  return groups.some(g=>g.books.some(x=>bookKey(x)===k));
}
async function openBook(b,q){
  const p=identity(b);
  if(b&&b.index!=null)p.index=b.index;
  if(q)p.searchQuery=q;
  p.navigateToPositionIfReused=true;
  return Otzaria.call('reader.openBook',p);
}

function makeRow(item,fallback){
  const el=document.createElement('button');
  el.className='row';
  const title=item.title||item.book||item.bookTitle||item.bookId||fallback||'ספר';
  const meta=item.ref||item.reference||item.currentRef||item.label||'';
  el.innerHTML='<b>'+esc(title)+'</b><span class="meta">'+esc(meta)+'</span>';
  el.onclick=()=>openBook(item);
  return el;
}
function renderList(id,items,empty){
  const box=$(id);
  box.innerHTML='';
  if(!items||!items.length){
    box.innerHTML='<div class="empty">'+esc(empty)+'</div>';
    return;
  }
  items.slice(0,settings.listLimit).forEach(x=>box.appendChild(makeRow(x)));
}
function renderGroups(){
  const box=$('groups');
  box.innerHTML='';
  let count=0;
  for(const g of groups){
    if(!g.books.length)continue;
    const wrap=document.createElement('div');
    wrap.className='groupBlock';
    wrap.innerHTML='<div class="groupBlockHead"><b>'+esc(g.name)+'</b><small>'+g.books.length+'</small></div>';
    const list=document.createElement('div');
    g.books.slice(0,settings.listLimit).forEach(b=>list.appendChild(makeRow(b)));
    wrap.appendChild(list);
    box.appendChild(wrap);
    count++;
  }
  if(!count)box.innerHTML='<div class="empty">חפש ספר ולחץ עליו בלחיצה ימנית כדי להוסיף אותו למועדפים או לקבוצה.</div>';
}
function applyLayout(){
  const host=$('sectionsHost');
  for(const key of settings.sectionOrder){
    const el=$('section-'+key);
    if(el)host.appendChild(el);
  }
  Object.entries(settings.visibleSections).forEach(([key,v])=>{
    const el=$('section-'+key);
    if(el)el.classList.toggle('hiddenSection',!v);
  });
  document.querySelectorAll('[data-quick]').forEach(b=>{
    b.hidden=!settings.quickActions[b.dataset.quick];
  });
}

const ICONS={
  home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></svg>',
  book:'<svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v16H7.5A3.5 3.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M8 6h8M8 10h7"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
  calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/><path d="M7 13h3M14 13h3M7 17h3"/></svg>',
  settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
  code:'<svg viewBox="0 0 24 24"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>',
  database:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  globe:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  message:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  document:'<svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>',
  audio:'<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
  link:'<svg viewBox="0 0 24 24"><path d="M9 15 7.5 16.5a4 4 0 0 1-5.5-5.8l3-3A4 4 0 0 1 11 8"/><path d="m15 9 1.5-1.5a4 4 0 0 1 5.5 5.8l-3 3A4 4 0 0 1 13 16"/><path d="M8 12h8"/></svg>',
  person:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4 3.4-6 8-6s7.3 2 8 6"/></svg>',
  app:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'
};
function pluginIconMarkup(name){
  const raw=(name||'').replace(/^.*:/,'').toLowerCase();
  if(!raw||raw==='puzzle_piece_24_regular')return '<img src="otzaria-icon.png" alt="">';
  let kind='app';
  if(/home/.test(raw))kind='home';
  else if(/book|library/.test(raw))kind='book';
  else if(/search|find/.test(raw))kind='search';
  else if(/calendar|date/.test(raw))kind='calendar';
  else if(/setting|wrench|toolbox/.test(raw))kind='settings';
  else if(/code|developer|terminal/.test(raw))kind='code';
  else if(/database|storage|server/.test(raw))kind='database';
  else if(/globe|earth|web/.test(raw))kind='globe';
  else if(/chat|comment|message|mail/.test(raw))kind='message';
  else if(/document|note|text|page/.test(raw))kind='document';
  else if(/bookmark|star|favorite/.test(raw))kind='star';
  else if(/clock|history|time/.test(raw))kind='clock';
  else if(/music|audio|speaker|headphone|mic/.test(raw))kind='audio';
  else if(/link|chain/.test(raw))kind='link';
  else if(/person|people|contact|profile/.test(raw))kind='person';
  return ICONS[kind];
}
function renderPlugins(){
  const box=$('plugins');
  box.innerHTML='';
  const q=(($('pluginFilter')&&$('pluginFilter').value)||'').trim().toLowerCase();
  const rows=allPlugins.filter(p=>{
    const name=String(p.name||'').toLowerCase();
    const id=String(p.pluginId||'').toLowerCase();
    return !q||name.includes(q)||id.includes(q);
  });
  const active=allPlugins.filter(p=>p.enabled).length;
  $('pluginCount').textContent=allPlugins.length+' מותקנים · '+active+' פעילים';
  if(!rows.length){
    box.innerHTML='<div class="empty">לא נמצאו תוספים מתאימים.</div>';
    return;
  }
  for(const p of rows){
    const b=document.createElement('button');
    b.className='pluginCard'+(p.enabled?'':' disabled');
    b.title=(p.name||p.pluginId)+' · '+(p.toolTabIconName||'ללא אייקון')+(p.version?' · '+p.version:'');
    let badge='';
    if(!p.enabled)badge='<span class="pluginBadge off">מושבת</span>';
    else if(p.showInTools===false)badge='<span class="pluginBadge">מוסתר</span>';
    else if(p.sourceType&&p.sourceType!=='packaged')badge='<span class="pluginBadge">פיתוח</span>';
    b.innerHTML=badge+'<div class="pluginIcon">'+pluginIconMarkup(p.toolTabIconName)+'</div><b>'+esc(p.name||p.pluginId)+'</b><small>'+esc(p.version||'')+'</small>';
    b.onclick=()=>{
      if(!p.enabled){
        toast('התוסף מושבת באוצריא');
        return;
      }
      if(p.pluginId===SELF)Otzaria.call('plugin.openSelf');
      else Otzaria.call('plugin.openOther',{pluginId:p.pluginId});
    };
    box.appendChild(b);
  }
}
async function loadPlugins(){
  try{
    const r=await Otzaria.call('plugin.listInstalled');
    allPlugins=dataOf(r)||[];
  }catch(_){allPlugins=[]}
  renderPlugins();
}
async function loadHome(){
  const calls=await Promise.allSettled([
    Otzaria.call('library.listRecentBooks'),
    Otzaria.call('bookmarks.list',{limit:30}),
    Otzaria.call('history.list',{limit:30}),
    Otzaria.call('plugin.listInstalled')
  ]);
  const val=i=>calls[i].status==='fulfilled'?dataOf(calls[i].value):null;
  renderList('recent',val(0)||[],'אין ספרים אחרונים');
  renderList('bookmarks',val(1)||[],'אין סימניות');
  renderList('history',val(2)||[],'אין היסטוריה');
  allPlugins=val(3)||[];
  renderPlugins();
  renderGroups();
  applyLayout();
}

function addToGroupMenu(book,anchor){
  const old=document.querySelector('.groupPicker');
  if(old)old.remove();
  const p=document.createElement('div');
  p.className='groupPicker';
  p.innerHTML='<div class="groupPickerTitle">הוסף לקבוצה</div>';
  for(const g of groups){
    const b=document.createElement('button');
    b.textContent=g.name;
    b.onclick=async e=>{
      e.stopPropagation();
      const k=bookKey(book);
      if(!g.books.some(x=>bookKey(x)===k))g.books.unshift(compactBook(book));
      await storageSet(GROUPS_KEY,groups);
      p.remove();
      renderGroups();
      toast('נוסף אל '+g.name);
    };
    p.appendChild(b);
  }
  const r=anchor.getBoundingClientRect();
  p.style.top=Math.min(innerHeight-230,r.bottom+6)+'px';
  p.style.left=Math.max(8,Math.min(innerWidth-200,r.left))+'px';
  document.body.appendChild(p);
  setTimeout(()=>document.addEventListener('click',()=>p.remove(),{once:true}),0);
}

const LABELS={
  mode:{exact:'מדויק',advanced:'מתקדם',fuzzy:'מקורב'},
  order:{relevance:'רלוונטיות',catalogue:'סדר הספרייה',generation:'סדר הדורות'},
  grouping:{none:'ללא איחוד',sameSection:'לפי סעיף',identicalText:'טקסט זהה'},
  proximity:{wordDistance:'מרחק מילים',sameParagraph:'אותה פסקה',sameSection:'אותו סעיף'},
  wordMatch:{all:'כל המילים',anyWord:'מילה כלשהי',mostWords:'רוב המילים',atLeast:'לפחות מספר מילים'}
};
function fillSelect(id,values,map){
  const el=$(id);
  el.innerHTML='';
  for(const v of values||[]){
    const o=document.createElement('option');
    o.value=v;
    o.textContent=(map&&map[v])||v;
    el.appendChild(o);
  }
}
async function loadSearchOptions(){
  const fallback={
    modes:['exact','advanced','fuzzy'],
    orders:['relevance','catalogue','generation'],
    proximityScopes:['wordDistance','sameParagraph','sameSection'],
    grouping:['none','sameSection','identicalText'],
    wordMatchModes:['all','anyWord','mostWords','atLeast'],
    wordOptions:{exact:[],advanced:[]},
    eras:[],
    fuzzyMaxDistance:2,
    defaultLimit:50
  };
  try{
    const r=await Otzaria.call('search.getOptions',{});
    searchOptions=dataOf(r)||fallback;
  }catch(_){searchOptions=fallback}
  fillSelect('searchMode',searchOptions.modes,LABELS.mode);
  fillSelect('searchOrder',searchOptions.orders,LABELS.order);
  fillSelect('searchGrouping',searchOptions.grouping,LABELS.grouping);
  fillSelect('searchProximity',searchOptions.proximityScopes,LABELS.proximity);
  fillSelect('searchWordMatch',searchOptions.wordMatchModes,LABELS.wordMatch);
  applySearchSettingsToUi();
  renderDynamicSearchControls();
}
function applySearchSettingsToUi(){
  const s=settings.searchConfig||DEFAULT_SEARCH;
  $('searchMode').value=s.mode;
  $('searchOrder').value=s.order;
  $('searchGrouping').value=s.grouping;
  $('searchProximity').value=s.proximityScope;
  $('searchWordMatch').value=s.wordMatchMode;
  $('searchWordCount').value=String(s.wordMatchCount||2);
  $('searchDistance').value=String(s.distance||0);
  $('negativeQuery').value=s.negativeQuery||'';
  $('baseBooksOnly').checked=!!s.baseBooksOnly;
}
function readSearchUi(){
  const mode=$('searchMode').value||'advanced';
  const s={
    mode,
    order:$('searchOrder').value||'relevance',
    grouping:$('searchGrouping').value||'none',
    proximityScope:$('searchProximity').value||'wordDistance',
    wordMatchMode:$('searchWordMatch').value||'all',
    wordMatchCount:Math.max(1,Number($('searchWordCount').value)||2),
    distance:Math.max(0,Number($('searchDistance').value)||0),
    negativeQuery:$('negativeQuery').value.trim(),
    baseBooksOnly:$('baseBooksOnly').checked,
    eras:Array.from(document.querySelectorAll('#eraChips .toggleChip.on')).map(x=>x.dataset.value),
    options:{}
  };
  document.querySelectorAll('#wordOptionChips .toggleChip.on').forEach(x=>{
    s.options[x.dataset.value]=true;
  });
  settings.searchConfig=s;
  return s;
}
function renderDynamicSearchControls(){
  const s=settings.searchConfig||DEFAULT_SEARCH;
  const mode=s.mode;
  $('negativeField').hidden=mode!=='advanced';
  $('proximityField').hidden=mode!=='advanced';
  $('wordMatchField').hidden=mode!=='advanced';
  $('wordCountField').hidden=!(mode==='advanced'&&s.wordMatchMode==='atLeast');
  if(mode==='fuzzy')$('searchDistance').max=String(searchOptions.fuzzyMaxDistance||2);
  else $('searchDistance').max='20';

  const eras=$('eraChips');
  eras.innerHTML='';
  for(const era of searchOptions.eras||[]){
    const b=document.createElement('button');
    b.type='button';
    b.className='toggleChip'+(s.eras&&s.eras.includes(era)?' on':'');
    b.dataset.value=era;
    b.textContent=era;
    b.onclick=()=>{
      b.classList.toggle('on');
      searchChanged(true);
    };
    eras.appendChild(b);
  }
  if(!(searchOptions.eras||[]).length)eras.innerHTML='<span class="hint">אין תקופות זמינות מהמארח.</span>';

  const wordBox=$('wordOptionChips');
  wordBox.innerHTML='';
  let supported=[];
  if(mode==='exact')supported=(searchOptions.wordOptions&&searchOptions.wordOptions.exact)||[];
  else if(mode==='advanced')supported=(searchOptions.wordOptions&&searchOptions.wordOptions.advanced)||[];
  $('wordOptionsBlock').hidden=mode==='fuzzy';
  for(const opt of supported){
    const on=!!(s.options&&s.options[opt]);
    const b=document.createElement('button');
    b.type='button';
    b.className='toggleChip'+(on?' on':'');
    b.dataset.value=opt;
    b.textContent=opt;
    b.onclick=()=>{
      b.classList.toggle('on');
      searchChanged(true);
    };
    wordBox.appendChild(b);
  }
  if(mode!=='fuzzy'&&!supported.length)wordBox.innerHTML='<span class="hint">אין אפשרויות מילים למצב הזה.</span>';
  renderSearchSummary();
}
function renderSearchSummary(){
  const s=settings.searchConfig||DEFAULT_SEARCH;
  const box=$('searchSummary');
  box.innerHTML='';
  const parts=[
    LABELS.mode[s.mode]||s.mode,
    LABELS.order[s.order]||s.order,
    LABELS.grouping[s.grouping]||s.grouping
  ];
  if(s.eras&&s.eras.length)parts.push(s.eras.join(', '));
  if(s.baseBooksOnly)parts.push('ספרי יסוד');
  if(selectedScopeBook)parts.push('בספר: '+(selectedScopeBook.title||selectedScopeBook.bookId||''));
  parts.forEach((x,i)=>{
    const c=document.createElement('span');
    c.className='summaryChip'+(i===0?' strong':'');
    c.textContent=x;
    box.appendChild(c);
  });
}
function searchChanged(run){
  readSearchUi();
  renderDynamicSearchControls();
  clearTimeout(searchTimer);
  if(run&&$('q').value.trim().length>=2){
    searchTimer=setTimeout(()=>runSearch(false),220);
  }
}

function buildSearchParams(q,offset){
  const s=readSearchUi();
  const p={
    query:q,
    mode:s.mode,
    order:s.order,
    grouping:s.grouping,
    limit:SEARCH_LIMIT,
    offset:offset||0,
    includeBookCounts:true
  };
  if(s.baseBooksOnly)p.baseBooksOnly=true;
  if(s.eras.length)p.eras=s.eras;
  if(selectedScopeBook)p.books=[identity(selectedScopeBook)];

  if(s.mode==='advanced'){
    if(s.negativeQuery)p.negativeQuery=s.negativeQuery;
    p.proximityScope=s.proximityScope;
    p.wordMatchMode=s.wordMatchMode;
    if(s.wordMatchMode==='atLeast')p.wordMatchCount=s.wordMatchCount;
    if(s.proximityScope==='wordDistance'&&s.wordMatchMode==='all')p.distance=s.distance;
    if(Object.keys(s.options).length)p.options=s.options;
  }else if(s.mode==='exact'){
    if(Object.keys(s.options).length)p.options=s.options;
  }else if(s.mode==='fuzzy'){
    p.distance=Math.min((searchOptions&&searchOptions.fuzzyMaxDistance)||2,s.distance);
  }
  return p;
}
function builtInSearchSettings(){
  const s=readSearchUi();
  const out={mode:s.mode};
  if(s.mode==='advanced'){
    out.proximityScope=s.proximityScope;
    out.wordMatchMode=s.wordMatchMode;
    if(s.wordMatchMode==='atLeast')out.wordMatchCount=s.wordMatchCount;
    if(s.proximityScope==='wordDistance'&&s.wordMatchMode==='all')out.distance=s.distance;
    if(Object.keys(s.options).length)out.options=s.options;
  }else if(s.mode==='exact'){
    if(Object.keys(s.options).length)out.options=s.options;
  }else if(s.mode==='fuzzy'){
    out.distance=Math.min((searchOptions&&searchOptions.fuzzyMaxDistance)||2,s.distance);
  }
  return out;
}
async function openBuiltInSearch(){
  const q=$('q').value.trim();
  if(!q){
    $('q').focus();
    return;
  }
  const r=await Otzaria.call('reader.openSearchTab',{
    query:q,
    autoSearch:true,
    settings:builtInSearchSettings()
  });
  if(!r||!r.success)toast('לא ניתן לפתוח את החיפוש המובנה');
}

function stripHtml(s){
  return String(s||'').replace(/<[^>]+>/g,' ');
}
function regexEscape(s){
  return String(s).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
}
function highlightHtml(text,q){
  let out=esc(stripHtml(text));
  const words=String(q||'').trim().split(/\s+/).filter(w=>w.length>1).slice(0,7);
  for(const w of words){
    try{
      out=out.replace(new RegExp('('+regexEscape(w)+')','gi'),'<mark>$1</mark>');
    }catch(_){}
  }
  return out;
}
function renderSuggestions(items){
  const box=$('suggestions');
  box.innerHTML='';
  if(!items||!items.length){
    box.hidden=true;
    return;
  }
  for(const item of items){
    const b=document.createElement('button');
    b.className='suggestion';
    b.innerHTML='<span><b>'+esc(item.title||item.book||item.bookId||'ספר')+'</b><br><small>'+esc(item.categoryPath||item.ref||'')+'</small></span><span>↵</span>';
    b.onclick=()=>{
      box.hidden=true;
      openBook(item);
    };
    b.oncontextmenu=e=>{
      e.preventDefault();
      addToGroupMenu(item,b);
    };
    box.appendChild(b);
  }
  box.hidden=false;
}
function renderFacets(){
  const box=$('searchFacets');
  box.innerHTML='';
  const all=document.createElement('button');
  all.className='facet'+(!selectedScopeBook?' selected':'');
  all.textContent='כל הספרייה';
  all.onclick=()=>{
    selectedScopeBook=null;
    renderSearchSummary();
    runSearch(false);
  };
  box.appendChild(all);
  for(const b of (currentBookCounts||[]).slice(0,10)){
    const x=document.createElement('button');
    x.className='facet'+(selectedScopeBook&&bookKey(selectedScopeBook)===bookKey(b)?' selected':'');
    x.textContent=(b.title||b.bookId||'ספר')+' · '+(b.count||0);
    x.onclick=()=>{
      selectedScopeBook=b;
      renderSearchSummary();
      runSearch(false);
    };
    box.appendChild(x);
  }
}
function renderSearchResults(){
  const q=$('q').value.trim();
  const box=$('searchResults');
  box.innerHTML='';
  $('searchSection').hidden=false;
  const shown=currentResults.length;
  const total=currentGroupCount!=null?currentGroupCount:currentTotal;
  $('searchMeta').textContent=(total!=null?total:'')+' תוצאות'+(shown?' · מוצגות '+shown:'');
  $('searchEmpty').hidden=shown>0;
  if(!shown)$('searchEmpty').textContent='לא נמצאו תוצאות מתאימות. נסה לשנות את מצב החיפוש או את המסננים.';
  for(const item of currentResults){
    const card=document.createElement('button');
    card.className='searchResult';
    const title=item.book||item.bookTitle||item.bookId||'ספר';
    const ref=item.reference||item.ref||'';
    const cat=item.categoryPath||'';
    const merged=item.mergedCount&&item.mergedCount>1?' · '+item.mergedCount+' תוצאות מאוחדות':'';
    const status=item.textStatus&&item.textStatus!=='ok'?'אינדקס: '+item.textStatus:'';
    card.innerHTML=
      '<div class="resultTop"><span class="resultBook">'+esc(title)+'</span><span class="resultRef">'+esc(ref)+'</span></div>'+
      '<div class="resultText">'+highlightHtml(item.text||'',q)+'</div>'+
      '<div class="resultMeta"><span>'+esc(cat)+'</span><span>'+esc(status+merged)+'</span></div>';
    card.onclick=()=>openBook(item,q);
    card.oncontextmenu=e=>{
      e.preventDefault();
      addToGroupMenu(item,card);
    };
    card.title=isInAnyGroup(item)?
      'ספר זה כבר נמצא במועדפים/קבוצה · לחיצה ימנית לניהול':
      'לחיצה לפתיחה · לחיצה ימנית להוספה לקבוצה';
    box.appendChild(card);
  }
  renderFacets();
  const totalKnown=Number(total)||0;
  $('loadMore').hidden=shown===0||(totalKnown>0&&shown>=totalKnown)||lastBatchSize<SEARCH_LIMIT;
}
async function fetchSuggestions(q,mySeq){
  try{
    const r=await Otzaria.call('library.findBooks',{query:q,limit:8});
    if(mySeq!==searchSeq)return;
    renderSuggestions(dataOf(r)||[]);
  }catch(_){
    if(mySeq===searchSeq)$('suggestions').hidden=true;
  }
}
async function runSearch(append){
  const q=$('q').value.trim();
  if(q.length<2){
    currentResults=[];
    currentBookCounts=[];
    $('searchSection').hidden=true;
    $('suggestions').hidden=true;
    return;
  }
  const my=++searchSeq;
  if(!append){
    currentOffset=0;
    currentResults=[];
    currentBookCounts=[];
    currentTotal=0;
    currentGroupCount=null;
  }
  const offset=append?currentOffset:0;
  fetchSuggestions(q,my);
  $('searchSection').hidden=false;
  $('searchResults').innerHTML='<div class="searchEmpty">מחפש…</div>';
  $('searchEmpty').hidden=true;
  $('loadMore').hidden=true;
  try{
    const stream=Otzaria.call('search.query',buildSearchParams(q,offset));
    const batch=[];
    let total=null;
    let groupCount=null;
    let bookCounts=null;
    for await(const chunk of stream){
      if(my!==searchSeq)return;
      if(Array.isArray(chunk.results))batch.push(...chunk.results);
      if(chunk.total!=null)total=chunk.total;
      if(chunk.groupCount!=null)groupCount=chunk.groupCount;
      if(Array.isArray(chunk.bookCounts))bookCounts=chunk.bookCounts;
    }
    if(my!==searchSeq)return;
    lastBatchSize=batch.length;
    if(append)currentResults.push(...batch);
    else currentResults=batch;
    currentOffset=offset+SEARCH_LIMIT;
    if(total!=null)currentTotal=total;
    if(groupCount!=null)currentGroupCount=groupCount;
    if(bookCounts)currentBookCounts=bookCounts;
    renderSearchResults();
  }catch(_){
    if(my!==searchSeq)return;
    $('searchResults').innerHTML='';
    $('searchEmpty').hidden=false;
    $('searchEmpty').textContent='החיפוש נכשל. ייתכן ששילוב האפשרויות אינו נתמך בגרסה הנוכחית של אוצריא.';
  }
}

async function syncPlusRegistration(){
  // The + button exists only while at least one plugin is registered.
  // Keep this plugin registered for every configured target; the target
  // itself is resolved after plugin.page_opened fires.
  try{
    await Otzaria.call('plugin.setNewTabPage',{enabled:true});
  }catch(_){}
}
async function closeSelfTabIfPresent(){
  try{
    const state=dataOf(await Otzaria.call('reader.getCurrentState'));
    const idx=state&&state.openTabs?state.openTabs.findIndex(t=>t&&t.isSelf):-1;
    if(idx>=0)await Otzaria.call('reader.closeTab',{index:idx});
  }catch(_){}
}

async function handleNewTabOpen(){
  if(settings.plusTarget==='library'){
    await Otzaria.call('navigation.goTo',{target:'library'});
    await closeSelfTabIfPresent();
    return;
  }
  if(settings.plusTarget==='reading'){
    await Otzaria.call('navigation.goTo',{target:'reading'});
    await closeSelfTabIfPresent();
    return;
  }
  if(settings.plusTarget==='plugin'){
    $('q').value='';
    $('suggestions').hidden=true;
    $('searchSection').hidden=true;
    selectedScopeBook=null;
    await loadHome();
    $('q').focus();
  }
}

function renderSettings(){
  document.querySelectorAll('input[name="plusTarget"]').forEach(r=>{
    r.checked=r.value===settings.plusTarget;
  });
  $('listLimit').value=String(settings.listLimit);
  Object.keys(settings.visibleSections).forEach(key=>{
    const el=$('show-'+key);
    if(el)el.checked=!!settings.visibleSections[key];
  });
  Object.keys(settings.quickActions).forEach(key=>{
    const el=$('quick-'+key);
    if(el)el.checked=!!settings.quickActions[key];
  });
  const order=$('orderList');
  order.innerHTML='';
  const names={groups:'מועדפים וקבוצות',plugins:'תוספים',recent:'המשך לקרוא',bookmarks:'סימניות',history:'היסטוריה'};
  settings.sectionOrder.forEach((key,i)=>{
    const row=document.createElement('div');
    row.className='orderRow';
    row.innerHTML='<span>'+esc(names[key])+'</span><span><button data-dir="-1">↑</button><button data-dir="1">↓</button></span>';
    row.querySelectorAll('button').forEach(b=>{
      b.onclick=()=>{
        const n=i+Number(b.dataset.dir);
        if(n<0||n>=settings.sectionOrder.length)return;
        [settings.sectionOrder[i],settings.sectionOrder[n]]=[settings.sectionOrder[n],settings.sectionOrder[i]];
        renderSettings();
      };
    });
    order.appendChild(row);
  });
  renderGroupSettings();
}
function renderGroupSettings(){
  const box=$('groupSettings');
  box.innerHTML='';
  for(const g of groups){
    const row=document.createElement('div');
    row.className='manageGroup';
    row.innerHTML='<input value="'+esc(g.name)+'" maxlength="40"><span>'+g.books.length+' ספרים</span>'+(g.id==='favorites'?'':'<button class="danger">מחק</button>');
    row.querySelector('input').onchange=async e=>{
      g.name=e.target.value.trim()||'קבוצה';
      await storageSet(GROUPS_KEY,groups);
      renderGroups();
    };
    const del=row.querySelector('.danger');
    if(del)del.onclick=async()=>{
      groups=groups.filter(x=>x.id!==g.id);
      await storageSet(GROUPS_KEY,groups);
      renderGroupSettings();
      renderGroups();
    };
    box.appendChild(row);
  }
}
async function saveSettingsFromUi(){
  const chosen=document.querySelector('input[name="plusTarget"]:checked');
  settings.plusTarget=chosen?chosen.value:'plugin';
  settings.listLimit=Number($('listLimit').value)||7;
  Object.keys(settings.visibleSections).forEach(key=>{
    const el=$('show-'+key);
    settings.visibleSections[key]=!!(el&&el.checked);
  });
  Object.keys(settings.quickActions).forEach(key=>{
    const el=$('quick-'+key);
    settings.quickActions[key]=!!(el&&el.checked);
  });
  readSearchUi();
  await storageSet(SETTINGS_KEY,settings);
  await syncPlusRegistration();
  applyLayout();
  renderGroups();
  await loadHome();
  closeSettings();
  toast('ההגדרות נשמרו');
}
function openSettings(){
  renderSettings();
  $('settingsModal').hidden=false;
}
function closeSettings(){
  $('settingsModal').hidden=true;
}
function toast(msg){
  const t=$('toast');
  t.textContent=msg;
  t.hidden=false;
  clearTimeout(t._tm);
  t._tm=setTimeout(()=>t.hidden=true,2400);
}
function openFeedback(type){
  $('feedbackTitle').textContent=type==='bug'?'דיווח על תקלה':'הצעת רעיון';
  $('feedbackText').value='';
  $('feedbackModal').dataset.type=type;
  $('feedbackModal').hidden=false;
  $('feedbackText').focus();
}
async function sendFeedback(){
  const details=$('feedbackText').value.trim();
  if(!details){
    toast('יש לכתוב את פרטי הדיווח');
    return;
  }
  const type=$('feedbackModal').dataset.type||'other';
  $('sendFeedback').disabled=true;
  try{
    const r=await Otzaria.call('feedback.report',{
      details,
      reportType:type==='bug'?'bug':'other'
    });
    if(!r||!r.success)throw new Error();
    $('feedbackModal').hidden=true;
    toast(r.data==='queued'?'הדיווח נשמר לשליחה מאוחרת':r.data==='cancelled'?'השליחה בוטלה':'הדיווח נשלח, תודה!');
  }catch(_){
    toast('הדיווח לא נשלח');
  }finally{
    $('sendFeedback').disabled=false;
  }
}

function resetSearchOptions(){
  settings.searchConfig=clone(DEFAULT_SEARCH);
  selectedScopeBook=null;
  applySearchSettingsToUi();
  renderDynamicSearchControls();
  searchChanged(true);
}
function wire(){
  const must=id=>{
    const el=$(id);
    if(!el)throw new Error('Missing UI element: '+id);
    return el;
  };
  must('q').addEventListener('input',()=>{
    clearTimeout(searchTimer);
    const q=$('q').value.trim();
    if(q.length<2){
      $('suggestions').hidden=true;
      $('searchSection').hidden=true;
      return;
    }
    const my=++searchSeq;
    fetchSuggestions(q,my);
    searchTimer=setTimeout(()=>runSearch(false),320);
  });
  must('q').addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      $('suggestions').hidden=true;
      runSearch(false);
    }else if(e.key==='Escape'){
      $('suggestions').hidden=true;
    }
  });
  $('clear').onclick=()=>{
    $('q').value='';
    $('suggestions').hidden=true;
    $('searchSection').hidden=true;
    selectedScopeBook=null;
    renderSearchSummary();
    $('q').focus();
  };
  $('searchGo').onclick=()=>runSearch(false);
  $('advancedToggle').onclick=()=>{
    $('advancedPanel').hidden=!$('advancedPanel').hidden;
    $('advancedToggle').classList.toggle('active',!$('advancedPanel').hidden);
  };
  $('resetSearchOptions').onclick=resetSearchOptions;

  for(const id of ['searchMode','searchOrder','searchGrouping','searchProximity','searchWordMatch','searchDistance','searchWordCount','negativeQuery','baseBooksOnly']){
    const el=$(id);
    if(!el)continue;
    el.addEventListener(id==='negativeQuery'?'input':'change',()=>searchChanged(true));
  }

  $('goLibrary').onclick=()=>Otzaria.call('navigation.goTo',{target:'library'});
  $('goReading').onclick=()=>Otzaria.call('navigation.goTo',{target:'reading'});
  $('goBuiltInSearch').onclick=openBuiltInSearch;
  $('openBuiltInSearch').onclick=openBuiltInSearch;
  $('goHistory').onclick=()=>{
    const el=$('section-history');
    if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
  };
  $('goBookmarks').onclick=()=>{
    const el=$('section-bookmarks');
    if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
  };
  $('closeSearchResults').onclick=()=>{
    $('searchSection').hidden=true;
  };
  $('loadMore').onclick=()=>runSearch(true);

  must('pluginFilter').addEventListener('input',renderPlugins);
  $('refreshPlugins').onclick=loadPlugins;

  $('settingsBtn').onclick=openSettings;
  $('closeSettings').onclick=closeSettings;
  $('cancelSettings').onclick=closeSettings;
  $('saveSettings').onclick=saveSettingsFromUi;
  $('addGroup').onclick=async()=>{
    const name=$('newGroupName').value.trim();
    if(!name)return;
    groups.push({id:'g'+Date.now(),name:name.slice(0,40),books:[]});
    $('newGroupName').value='';
    await storageSet(GROUPS_KEY,groups);
    renderGroupSettings();
    renderGroups();
  };

  $('bugBtn').onclick=()=>openFeedback('bug');
  $('ideaBtn').onclick=()=>openFeedback('idea');
  $('closeFeedback').onclick=()=>{$('feedbackModal').hidden=true};
  $('cancelFeedback').onclick=()=>{$('feedbackModal').hidden=true};
  $('sendFeedback').onclick=sendFeedback;

  document.addEventListener('click',e=>{
    if(!e.target.closest('.searchWrap'))$('suggestions').hidden=true;
  });
}

function startUi(){
  try{
    wire();
    document.documentElement.dataset.uiReady='true';
  }catch(err){
    console.error('Homepage UI wiring failed',err);
    const t=$('toast');
    if(t){
      t.textContent='שגיאה באתחול הממשק: '+(err&&err.message?err.message:String(err));
      t.hidden=false;
    }
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startUi,{once:true});
else startUi();

Otzaria.on('plugin.boot',async p=>{
  try{
    settings=normalizeSettings(await storageGet(SETTINGS_KEY,DEFAULT_SETTINGS));
  groups=normalizeGroups(await storageGet(GROUPS_KEY,groups));
  applyTheme(p&&p.theme);
  await syncPlusRegistration();
  if(p&&p.app&&p.app.runMode==='background'){
    await Otzaria.call('plugin.backgroundDone');
    return;
  }
    await loadSearchOptions();
    await loadHome();
    $('q').focus();
  }catch(err){
    console.error('Homepage boot failed',err);
    toast('שגיאה בטעינת דף הבית: '+(err&&err.message?err.message:String(err)));
  }
});
Otzaria.on('theme.changed',p=>applyTheme((p&&p.theme)||p));
Otzaria.on('plugin.page_opened',async p=>{
  if(p&&p.source==='newTabButton')await handleNewTabOpen();
});
