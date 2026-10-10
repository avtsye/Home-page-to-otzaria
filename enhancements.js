'use strict';
(function(){
  const Core=window.HomeCore;
  if(!Core){console.error('HomeCore missing');return}

  const WORKSPACE_KEY='homeWorkspacesV1';
  const BACKUP_FORMAT='otzaria-home-full-backup';
  let workspaces=[];
  let pluginAdvancedFilter='all';

  const clone=Core.safeClone;
  const emit=(name,payload)=>Core.emit(name,payload);
  const safeText=v=>String(v??'');

  // ---------- Event-backed persistence ----------
  const baseSaveTabs=saveSavedTabSetsV4;
  saveSavedTabSetsV4=async function(){
    const result=await baseSaveTabs();
    emit('tabs:changed',clone(savedTabSets));
    return result;
  };

  const baseSaveFeatures=saveFeatures;
  saveFeatures=async function(){
    const result=await baseSaveFeatures();
    emit('features:changed',clone(featureSettings));
    return result;
  };

  const baseSaveSettingsFromUi=saveSettingsFromUi;
  saveSettingsFromUi=async function(){
    const result=await baseSaveSettingsFromUi();
    emit('settings:changed',clone(settings));
    return result;
  };

  // ---------- Saved-tab metadata + workspace-hub behavior ----------
  const baseNormalizeTabSet=normalizeTabSetV4;
  normalizeTabSetV4=function(raw){
    const base=baseNormalizeTabSet(raw);
    if(!base)return base;
    base.favorite=!!raw.favorite;
    base.description=safeText(raw.description).trim().slice(0,180);
    base.color=/^#[0-9a-f]{6}$/i.test(raw.color||'')?raw.color:'';
    base.icon=safeText(raw.icon||'book').trim().slice(0,32)||'book';
    base.order=Number.isFinite(Number(raw.order))?Number(raw.order):9999;
    base.lastOpenSummary=raw.lastOpenSummary&&typeof raw.lastOpenSummary==='object'?raw.lastOpenSummary:null;
    base.workspaceState=raw.workspaceState&&typeof raw.workspaceState==='object'?clone(raw.workspaceState):null;
    base.legacyWorkspaceId=safeText(raw.legacyWorkspaceId||'');
    return base;
  };

  function setOrderDefaults(){
    let changed=false;
    savedTabSets.forEach((set,i)=>{
      if(!Number.isFinite(Number(set.order))||Number(set.order)===9999){set.order=i;changed=true}
    });
    return changed;
  }

  function sortedTabSets(){
    setOrderDefaults();
    return [...savedTabSets].sort((a,b)=>
      (b.favorite?1:0)-(a.favorite?1:0) ||
      (Number(a.order)||0)-(Number(b.order)||0) ||
      (b.updatedAt||0)-(a.updatedAt||0)
    );
  }

  async function toggleTabSetFavorite(set){
    set.favorite=!set.favorite;
    set.updatedAt=Date.now();
    await saveSavedTabSetsV4();renderSavedTabSetsV4();
    toast(set.favorite?'הכרטיס נוסף למועדפים':'הכרטיס הוסר מהמועדפים');
  }

  async function duplicateTabSet(set){
    const copy=normalizeTabSetV4({
      ...clone(set),
      id:makeFeatureIdV4('tabs'),
      name:uniqueTabSetNameV4(set.name+' — עותק'),
      favorite:false,
      order:savedTabSets.length,
      createdAt:Date.now(),
      updatedAt:Date.now(),
      lastOpenedAt:0
    });
    savedTabSets.push(copy);
    await saveSavedTabSetsV4();renderSavedTabSetsV4();
    toast('נוצר עותק של הכרטיס');
  }

  async function openMissingFromSet(set){
    let current=[];
    try{current=readerTabsV4(dataOf(await Otzaria.call('reader.getCurrentState')))}catch(_){}
    const missing=set.books.filter(book=>!findMatchingOpenTabV4(current,book));
    if(!missing.length){toast('כל ספרי הכרטיס כבר פתוחים');return}
    await openTabSetV4(set,missing);
  }

  function mergeTabSetDialog(set){
    const candidates=savedTabSets.filter(x=>x.id!==set.id);
    if(!candidates.length){toast('אין כרטיס נוסף למיזוג');return}
    const dialog=document.createElement('div');dialog.className='tabSetDialog';dialog.id='mergeTabSetDialogV6';
    dialog.innerHTML='<div class="tabSetDialogCard"><div class="tabSetDialogHeader"><div><h2>מיזוג כרטיסים</h2><div class="hint">הספרים יתווספו לכרטיס “'+esc(set.name)+'” ללא כפילויות.</div></div></div>'+
      '<label>כרטיס למיזוג</label><select id="mergeTabSetSelectV6">'+candidates.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select>'+
      '<div class="tabSetDialogActions"><button class="secondaryBtn" id="mergeCancelV6">ביטול</button><button class="primaryBtn" id="mergeConfirmV6">מזג</button></div></div>';
    document.body.appendChild(dialog);
    const close=()=>dialog.remove();
    dialog.querySelector('#mergeCancelV6').onclick=close;
    dialog.onclick=e=>{if(e.target===dialog)close()};
    dialog.querySelector('#mergeConfirmV6').onclick=async()=>{
      const other=savedTabSets.find(x=>x.id===dialog.querySelector('#mergeTabSetSelectV6').value);
      if(!other)return close();
      const keys=new Set(set.books.map(tabKeyV4));let added=0;
      other.books.forEach(book=>{const k=tabKeyV4(book);if(k&&!keys.has(k)){keys.add(k);set.books.push(clone(book));added++}});
      set.updatedAt=Date.now();await saveSavedTabSetsV4();renderSavedTabSetsV4();close();
      toast(added?'נוספו '+added+' ספרים':'לא היו ספרים חדשים למיזוג');
    };
  }

  const baseEditor=openTabSetEditorV4;
  openTabSetEditorV4=function(args){
    baseEditor(args);
    const dialog=$('tabSetDialogV4');if(!dialog)return;
    const set=args&&args.set;
    const name=dialog.querySelector('#tabSetNameV4');
    const meta=document.createElement('div');meta.className='tabSetMetaEditorV6';
    meta.innerHTML='<label>תיאור קצר<input id="tabSetDescriptionV6" maxlength="180" placeholder="לא חובה"></label>'+
      '<label>אייקון<select id="tabSetIconV6"><option value="book">ספר</option><option value="bookmark">סימנייה</option><option value="star">כוכב</option><option value="pin">סיכה</option><option value="apps">אוסף</option></select></label>'+
      '<label>צבע<input id="tabSetColorV6" type="color" value="#6750a4"></label>';
    name.insertAdjacentElement('afterend',meta);
    const desc=dialog.querySelector('#tabSetDescriptionV6');
    const icon=dialog.querySelector('#tabSetIconV6');
    const color=dialog.querySelector('#tabSetColorV6');
    desc.value=set?.description||'';
    icon.value=set?.icon||'book';
    color.value=set?.color||'#6750a4';
    const save=dialog.querySelector('#tabSetSaveV4');
    save.addEventListener('click',()=>{
      const values={description:desc.value.trim().slice(0,180),icon:icon.value,color:color.value};
      if(set)Object.assign(set,values);
      else{
        const expectedName=name.value.trim();
        setTimeout(async()=>{
          const created=[...savedTabSets].reverse().find(x=>x.name===expectedName&&Date.now()-(x.createdAt||0)<5000);
          if(created){Object.assign(created,values,{order:savedTabSets.length-1});await saveSavedTabSetsV4();renderSavedTabSetsV4()}
        },30);
      }
    },true);
  };

  renderSavedTabSetsV4=function(){
    ensureSavedTabsSectionV4();
    const grid=$('savedTabGrid');grid.innerHTML='';
    if(!savedTabSets.length){
      const empty=Core.makeEmptyState({
        title:'אין עדיין כרטיסי ספרים',
        text:'אפשר ליצור כרטיס ידני או לשמור את לשוניות הספרים הפתוחות.',
        action:'צור כרטיס ראשון',
        actionId:'emptyCreateTabSetV6'
      });
      grid.appendChild(empty);
      empty.querySelector('#emptyCreateTabSetV6').onclick=createEmptyTabSetV4;
      return;
    }
    sortedTabSets().forEach(set=>{
      const card=document.createElement('article');
      card.className='savedTabCard savedTabCardV6'+(set.favorite?' favorite':'');
      card.tabIndex=0;card.setAttribute('role','button');card.__homeTabSet=set;card.draggable=true;card.dataset.setId=set.id;
      if(set.color)card.style.setProperty('--set-accent',set.color);
      const overflow=document.createElement('button');overflow.type='button';overflow.className='cardOverflowBtn';
      overflow.setAttribute('aria-label','פעולות נוספות');overflow.textContent='⋯';
      overflow.onclick=e=>{e.stopPropagation();openTabSetActionsV4(set,overflow)};
      const preview=set.books.slice(0,4).map(b=>'<div class="savedTabBook">'+esc(b.title||b.bookId||'ספר')+(b.ref?' · '+esc(b.ref):'')+'</div>').join('');
      const summary=set.lastOpenSummary;
      const status=summary?'<div class="savedTabLastStatus">'+esc(summary.text||'')+'</div>':'';
      card.innerHTML='<div class="savedTabCardTitle"><span class="savedTabCardIcon">'+uiIconV4(set.icon||'book')+'</span><h3>'+esc(set.name)+'</h3>'+(set.favorite?'<span class="savedTabFavoriteMark">★</span>':'')+'</div>'+
        (set.description?'<div class="savedTabDescription">'+esc(set.description)+'</div>':'')+
        '<div class="savedTabMeta">'+set.books.length+' ספרים'+(set.workspaceState?' · כולל מצב עבודה':'')+'</div><div class="savedTabBooks">'+preview+(set.books.length>4?'<div class="savedTabMore">ועוד '+(set.books.length-4)+'…</div>':'')+'</div>'+status;
      card.appendChild(overflow);
      card.onclick=()=>set.workspaceState?restoreWorkspace(set):openTabSetPreviewV4(set);
      card.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();openTabSetActionsV4(set,{clientX:e.clientX,clientY:e.clientY})};
      card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTabSetPreviewV4(set)}};
      card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/x-home-tabset',set.id);card.classList.add('dragging')});
      card.addEventListener('dragend',()=>card.classList.remove('dragging'));
      card.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('text/x-home-tabset')){e.preventDefault();card.classList.add('dragOver')}});
      card.addEventListener('dragleave',()=>card.classList.remove('dragOver'));
      card.addEventListener('drop',async e=>{
        card.classList.remove('dragOver');e.preventDefault();
        const fromId=e.dataTransfer.getData('text/x-home-tabset');if(!fromId||fromId===set.id)return;
        const ordered=sortedTabSets();const from=ordered.findIndex(x=>x.id===fromId),to=ordered.findIndex(x=>x.id===set.id);
        if(from<0||to<0)return;
        const [item]=ordered.splice(from,1);ordered.splice(to,0,item);
        ordered.forEach((x,i)=>x.order=i);
        await saveSavedTabSetsV4();renderSavedTabSetsV4();toast('סדר הכרטיסים עודכן');
      });
      grid.appendChild(card);
    });
  };

  const baseActions=openTabSetActionsV4;
  openTabSetActionsV4=function(set,anchor){
    // Use the unified M3 context menu when available.
    if(typeof showHomeContextMenuV5==='function'){
      const items=[
        {label:set.workspaceState?'פתח ושחזר':'פתח / בחר ספרים',icon:'book',action:()=>set.workspaceState?restoreWorkspace(set):openTabSetPreviewV4(set)},
        {label:'פתח רק ספרים שאינם פתוחים',icon:'apps',action:()=>openMissingFromSet(set)},
        {label:set.favorite?'הסר ממועדפים':'הוסף למועדפים',icon:'star',checked:!!set.favorite,action:()=>toggleTabSetFavorite(set)},
        {label:'שכפל כרטיס',action:()=>duplicateTabSet(set)},
        {label:'מזג כרטיס אחר לתוכו',action:()=>mergeTabSetDialog(set)},
        {separator:true},
        {label:'עדכן מיקומים',icon:'refresh',action:()=>updateTabSetPositionsV4(set)},
        {label:'ייצא כרטיס',action:()=>exportSingleTabSetV4(set)},
        {label:'ערוך כרטיס',icon:'settings',action:()=>openTabSetEditorV4({mode:'edit',set})},
        {label:'מחק כרטיס',icon:'close',danger:true,action:()=>deleteTabSetV4(set)}
      ];
      let x=innerWidth/2,y=innerHeight/2;
      if(anchor?.getBoundingClientRect){const r=anchor.getBoundingClientRect();x=r.left;y=r.bottom+4}
      else if(Number.isFinite(anchor?.clientX)){x=anchor.clientX;y=anchor.clientY}
      return showHomeContextMenuV5(items,x,y,set.name);
    }
    return baseActions(set,anchor);
  };

  const baseOpenTabSet=openTabSetV4;
  openTabSetV4=async function(set,selectedBooks=null){
    const target=Array.isArray(selectedBooks)&&selectedBooks.length?selectedBooks:set?.books||[];
    let before=[];
    try{before=readerTabsV4(dataOf(await Otzaria.call('reader.getCurrentState')))}catch(_){}
    await baseOpenTabSet(set,selectedBooks);
    let after=[];
    try{after=readerTabsV4(dataOf(await Otzaria.call('reader.getCurrentState')))}catch(_){}
    if(set){
      const matched=target.filter(book=>findMatchingOpenTabV4(after,book)).length;
      const newly=Math.max(0,after.length-before.length);
      set.lastOpenSummary={at:Date.now(),matched,newly,total:target.length,text:'נפתחו/זוהו '+matched+' מתוך '+target.length+' · חדשים '+newly};
      await saveSavedTabSetsV4();renderSavedTabSetsV4();
    }
  };

  // ---------- Full workspace snapshots ----------
  async function loadWorkspaces(){
    const raw=await fGet(WORKSPACE_KEY,[]);
    const legacy=Array.isArray(raw)?raw.filter(x=>x&&x.id&&x.name):[];
    let changed=false;
    for(const ws of legacy){
      if(savedTabSets.some(x=>x.legacyWorkspaceId===ws.id))continue;
      const item=normalizeTabSetV4({
        id:makeFeatureIdV4('tabs'),
        name:ws.name,
        books:Array.isArray(ws.books)?ws.books:[],
        conflictDefault:'keep',
        createdAt:ws.createdAt||Date.now(),
        updatedAt:ws.updatedAt||Date.now(),
        order:savedTabSets.length,
        legacyWorkspaceId:ws.id,
        workspaceState:{
          activeBook:ws.activeBook||null,
          query:ws.query||'',
          searchConfig:ws.searchConfig||DEFAULT_SEARCH,
          groupScope:ws.groupScope||'',
          focusMode:!!ws.focusMode
        }
      });
      if(item){savedTabSets.push(item);changed=true}
    }
    workspaces=[];
    if(changed)await saveSavedTabSetsV4();
    if(legacy.length)await fSet(WORKSPACE_KEY,[]);
  }
  async function saveWorkspaces(){await fSet(WORKSPACE_KEY,[]);emit('workspaces:changed',[])}

  async function askName(title,defaultName){
    return new Promise(resolve=>{
      const d=document.createElement('div');d.className='tabSetDialog';
      d.innerHTML='<div class="tabSetDialogCard smallDialogV6"><h2>'+esc(title)+'</h2><input id="workspaceNameInputV6" maxlength="80" value="'+esc(defaultName)+'"><div class="tabSetDialogActions"><button class="secondaryBtn" id="workspaceCancelV6">ביטול</button><button class="primaryBtn" id="workspaceOkV6">שמור</button></div></div>';
      document.body.appendChild(d);const input=d.querySelector('input');input.focus();input.select();
      const done=v=>{d.remove();resolve(v)};
      d.querySelector('#workspaceCancelV6').onclick=()=>done(null);
      d.querySelector('#workspaceOkV6').onclick=()=>done(input.value.trim()||null);
      d.onclick=e=>{if(e.target===d)done(null)};
    });
  }

  async function saveWorkspace(){
    let state=null;try{state=dataOf(await Otzaria.call('reader.getCurrentState'))}catch(_){}
    const name=await askName('שמירת מצב עבודה','שמירה '+(savedTabSets.length+1));if(!name)return;
    const item=normalizeTabSetV4({
      id:makeFeatureIdV4('tabs'),
      name,
      books:readerTabsV4(state),
      conflictDefault:'keep',
      createdAt:Date.now(),updatedAt:Date.now(),
      order:savedTabSets.length,
      workspaceState:{
        activeBook:state?{id:state.currentId,type:state.currentType,source:state.currentSource,bookId:state.currentBookId,title:state.currentBook,index:state.currentIndex,ref:state.currentRef}:null,
        query:$('q')?.value||'',
        searchConfig:clone(settings.searchConfig||DEFAULT_SEARCH),
        groupScope:featureSettings.groupScope||'',
        focusMode:!!featureSettings.focusMode
      }
    });
    savedTabSets.push(item);
    await saveSavedTabSetsV4();renderSavedTabSetsV4();toast('מצב העבודה נשמר');
  }

  async function restoreWorkspace(set){
    const ws=set.workspaceState||{};
    settings.searchConfig=clone(ws.searchConfig||DEFAULT_SEARCH);
    featureSettings.groupScope=ws.groupScope||'';
    featureSettings.focusMode=!!ws.focusMode;
    await saveFeatures();
    if($('q'))$('q').value=ws.query||'';
    applySearchSettingsToUi();renderDynamicSearchControls();applyFeatureAppearance();renderSavedSearchControls();
    if(set.books?.length)await openTabSetV4(set,set.books);
    if(ws.activeBook){try{await openBook(ws.activeBook)}catch(_){}}
    if((ws.query||'').trim().length>=2)runSearch(false);
    toast('המצב השמור שוחזר');
  }

  async function deleteWorkspace(ws){
    const idx=workspaces.findIndex(x=>x.id===ws.id);if(idx<0)return;
    const [removed]=workspaces.splice(idx,1);await saveWorkspaces();renderWorkspaces();toast('סביבת העבודה נמחקה');
    
  }

  function ensureWorkspaceSection(){
    const old=$('section-workspaces');if(old)old.remove();
    const toolbar=document.querySelector('#section-saved-tabs .savedTabToolbar');if(!toolbar||$('saveWorkspaceV6'))return;
    const b=document.createElement('button');b.id='saveWorkspaceV6';b.className='secondaryBtn';b.type='button';b.textContent='שמור מצב נוכחי';
    const capture=$('captureTabsBtn');if(capture)capture.insertAdjacentElement('afterend',b);else toolbar.appendChild(b);
    b.onclick=saveWorkspace;
  }

  function renderWorkspaces(){ensureWorkspaceSection();renderSavedTabSetsV4()}

  // ---------- Unified saved books: tab sets + favorites/groups ----------
  function ensureUnifiedSavedBooksV7(){
    const saved=$('section-saved-tabs'),groupsSection=$('section-groups'),groupsBox=$('groups');
    if(!saved||!groupsBox)return;
    const head=saved.querySelector('.sectionHead h2');if(head)head.textContent='ספרים שמורים';
    const sub=saved.querySelector('.sectionHead span');if(sub)sub.textContent='כרטיסי ספרים, מועדפים וקבוצות במקום אחד';
    let host=$('savedGroupsHostV7');
    if(!host){
      host=document.createElement('div');host.id='savedGroupsHostV7';host.className='savedGroupsHostV7';
      host.innerHTML='<div class="savedSubsectionHeadV7"><b>מועדפים וקבוצות</b><span>ספרים שאורגנו לקבוצות אישיות</span></div>';
      saved.appendChild(host);
    }
    if(groupsBox.parentElement!==host)host.appendChild(groupsBox);
    if(groupsSection){groupsSection.classList.add('unifiedSourceHiddenV7');groupsSection.hidden=true}
    saved.classList.toggle('hiddenSection',settings.visibleSections&&settings.visibleSections.groups===false);
  }
  const baseApplyLayoutUnifiedV7=applyLayout;
  applyLayout=function(){
    baseApplyLayoutUnifiedV7();
    ensureUnifiedSavedBooksV7();
  };

  // ---------- Unified local search ----------
  const baseRenderSuggestions=renderSuggestions;
  renderSuggestions=function(bookItems,contentItems,q){
    baseRenderSuggestions(bookItems,contentItems,q);
    const box=$('suggestions');if(!box)return;
    const term=safeText(q).trim().toLowerCase();if(term.length<2)return;
    const local=[];
    groups.filter(g=>safeText(g.name).toLowerCase().includes(term)).slice(0,4).forEach(g=>local.push({kind:'קבוצה',title:g.name,action:()=>{featureSettings.groupScope=g.id;saveFeatures();renderSavedSearchControls();$('q').focus();toast('החיפוש הוגבל לקבוצה '+g.name)}}));
    savedTabSets.filter(x=>safeText(x.name+' '+(x.description||'')).toLowerCase().includes(term)).slice(0,4).forEach(set=>local.push({kind:'כרטיס',title:set.name,action:()=>openTabSetPreviewV4(set)}));
    allPlugins.filter(p=>safeText(p.name+' '+p.pluginId).toLowerCase().includes(term)).slice(0,4).forEach(p=>local.push({kind:'תוסף',title:p.name||p.pluginId,action:()=>p.enabled&&Otzaria.call('plugin.openOther',{pluginId:p.pluginId})}));
    (featureSettings.savedSearches||[]).filter(x=>safeText(x.name+' '+x.query).toLowerCase().includes(term)).slice(0,3).forEach((item,i)=>local.push({kind:'חיפוש שמור',title:item.name,action:()=>{const idx=featureSettings.savedSearches.indexOf(item);$('savedSearchSelect').value=String(idx);applySavedSearchProfile()}}));
    if(!local.length)return;
    box.hidden=false;
    const heading=document.createElement('div');heading.className='suggestionsGroupTitle';heading.textContent='בדף הבית';box.appendChild(heading);
    local.slice(0,10).forEach(item=>{
      const b=document.createElement('button');b.className='suggestion unifiedSuggestionV6';
      b.innerHTML='<span><b>'+esc(item.title)+'</b></span><span class="suggestionTag">'+esc(item.kind)+'</span>';
      b.onclick=()=>{box.hidden=true;item.action()};box.appendChild(b);
    });
  };

  // ---------- Plugin filters ----------
  function pluginMatchesAdvancedFilter(p){
    if(pluginAdvancedFilter==='enabled')return !!p.enabled;
    if(pluginAdvancedFilter==='disabled')return !p.enabled;
    if(pluginAdvancedFilter==='tools')return p.showInTools!==false&&!!p.toolTabIconName;
    if(pluginAdvancedFilter==='development')return p.sourceType&&p.sourceType!=='packaged';
    return true;
  }
  const baseRenderPluginsV4=renderPluginsV4;
  renderPluginsV4=function(favOnly){
    const original=allPlugins;
    allPlugins=original.filter(pluginMatchesAdvancedFilter);
    try{return baseRenderPluginsV4(favOnly)}finally{allPlugins=original}
  };

  function ensurePluginFilters(){
    const tools=$('pluginToolsV4');if(!tools||$('pluginStatusFilterV6'))return;
    const select=document.createElement('select');select.id='pluginStatusFilterV6';select.innerHTML='<option value="all">כל המצבים</option><option value="enabled">פעילים</option><option value="disabled">מושבתים</option><option value="tools">מופיעים בכלים</option><option value="development">פיתוח</option>';
    select.value=pluginAdvancedFilter;select.onchange=e=>{pluginAdvancedFilter=e.target.value;renderPluginsV4(false)};
    tools.prepend(select);
  }

  // ---------- Visible overflow menus / discoverability ----------
  function addVisibleOverflowMenus(){
    document.querySelectorAll('.pluginCard').forEach(card=>{
      if(card.querySelector('.pluginOverflowV6')||!card.__homePlugin)return;
      const p=card.__homePlugin;const b=document.createElement('button');b.className='pluginOverflowV6 cardOverflowBtn';b.type='button';b.textContent='⋯';b.setAttribute('aria-label','פעולות תוסף');
      b.onclick=e=>{e.stopPropagation();const r=b.getBoundingClientRect();showHomeContextMenuV5?.(contextForPluginV5(p),r.left,r.bottom+4,p.name||p.pluginId)};
      card.appendChild(b);
    });
    document.querySelectorAll('.groupBlock').forEach(block=>{
      if(block.querySelector('.groupOverflowV6')||!block.__homeGroup)return;
      const b=document.createElement('button');b.className='groupOverflowV6 cardOverflowBtn';b.type='button';b.textContent='⋯';b.setAttribute('aria-label','פעולות קבוצה');
      b.onclick=e=>{e.stopPropagation();const r=b.getBoundingClientRect();showHomeContextMenuV5?.(contextForGroupV5(block.__homeGroup),r.left,r.bottom+4,block.__homeGroup.name)};
      block.querySelector('.groupBlockHead')?.appendChild(b);
    });
  }
  Core.on('tabs:changed',()=>setTimeout(addVisibleOverflowMenus,0));
  const baseRenderGroupsV6=renderGroups;
  renderGroups=function(){
    const r=baseRenderGroupsV6();
    emit('groups:rendered',clone(groups));
    return r;
  };
  const baseRenderPluginsV6=renderPlugins;
  renderPlugins=function(){
    const r=baseRenderPluginsV6();
    emit('plugins:rendered',clone(allPlugins));
    return r;
  };
  Core.on('groups:rendered',()=>setTimeout(()=>{addVisibleOverflowMenus();improveGroupEmptyState()},0));
  Core.on('plugins:rendered',()=>setTimeout(()=>{ensurePluginFilters();addVisibleOverflowMenus()},0));

  function improveGroupEmptyState(){
    const box=$('groups');if(!box)return;
    const totalBooks=groups.reduce((n,g)=>n+(Array.isArray(g.books)?g.books.length:0),0);
    const customGroups=groups.filter(g=>g.id!=='favorites').length;
    if(totalBooks||customGroups)return;
    box.innerHTML='';
    const state=Core.makeEmptyState({
      title:'אין עדיין קבוצות או מועדפים',
      text:'צור קבוצה ראשונה או הוסף ספר למועדפים כדי להגיע אליו במהירות.',
      action:'צור קבוצה',
      actionId:'emptyCreateGroupV6'
    });
    box.appendChild(state);
    state.querySelector('#emptyCreateGroupV6').onclick=()=>{
      openSettings();setSettingsTab('general');
      setTimeout(()=>$('newGroupName')?.focus(),80);
    };
  }

  // ---------- Full backup / restore ----------
  async function makeFullBackup(){
    return {
      format:BACKUP_FORMAT,version:Core.schema.backup,exportedAt:new Date().toISOString(),
      settings:clone(settings),groups:clone(groups),features:clone(featureSettings),
      savedTabSets:clone(savedTabSets),workspaces:clone(workspaces)
    };
  }
  async function exportFullBackup(){Core.downloadJson('otzaria-home-backup-'+new Date().toISOString().slice(0,10)+'.json',await makeFullBackup())}
  async function importFullBackup(file){
    const raw=JSON.parse(await file.text());
    if(raw?.format!==BACKUP_FORMAT)throw new Error('קובץ גיבוי לא מתאים');
    settings=normalizeSettings(raw.settings||{});
    groups=normalizeGroups(raw.groups||[]);
    featureSettings=mergeFeatureSettings(raw.features||{});
    savedTabSets=(raw.savedTabSets||[]).map(normalizeTabSetV4).filter(Boolean);
    const importedWorkspaces=Array.isArray(raw.workspaces)?raw.workspaces:[];
    for(const ws of importedWorkspaces){
      if(!ws||!ws.name)continue;
      const item=normalizeTabSetV4({id:makeFeatureIdV4('tabs'),name:ws.name,books:ws.books||[],conflictDefault:'keep',createdAt:ws.createdAt||Date.now(),updatedAt:ws.updatedAt||Date.now(),order:savedTabSets.length,workspaceState:{activeBook:ws.activeBook||null,query:ws.query||'',searchConfig:ws.searchConfig||DEFAULT_SEARCH,groupScope:ws.groupScope||'',focusMode:!!ws.focusMode}});
      if(item)savedTabSets.push(item);
    }
    workspaces=[];
    await Promise.all([
      storageSet(SETTINGS_KEY,settings),storageSet(GROUPS_KEY,groups),saveFeatures(),saveSavedTabSetsV4(),saveWorkspaces()
    ]);
    await syncPlusRegistration();applyTheme?.();applyFeatureAppearance();applyLayout();renderGroups();renderSavedTabSetsV4();renderWorkspaces();renderSavedSearchControls();await loadPluginsReliableV4();
    toast('הגיבוי שוחזר בהצלחה');
  }
  function ensureBackupControls(){
    if($('fullBackupBlockV6'))return;
    const general=$('settingsTab-general');if(!general)return;
    const block=document.createElement('section');block.id='fullBackupBlockV6';block.className='settingBlock';
    block.innerHTML='<h3>גיבוי ושחזור</h3><div class="backupActionsV6"><button id="exportFullBackupV6" class="secondaryBtn" type="button">ייצא גיבוי מלא</button><button id="importFullBackupV6" class="secondaryBtn" type="button">שחזר מגיבוי</button><input id="importFullBackupFileV6" type="file" accept="application/json,.json" hidden></div><p class="hint">הגיבוי כולל הגדרות, קבוצות, מועדפים, כרטיסיות, חיפושים שמורים, הצמדות וסביבות עבודה.</p>';
    general.appendChild(block);
    $('exportFullBackupV6').onclick=exportFullBackup;
    $('importFullBackupV6').onclick=()=>$('importFullBackupFileV6').click();
    $('importFullBackupFileV6').onchange=async e=>{
      const file=e.target.files?.[0];e.target.value='';if(!file)return;
      try{await importFullBackup(file)}catch(err){console.error(err);toast('שחזור הגיבוי נכשל')}
    };
  }

  const baseLoadPluginsReliableV6=loadPluginsReliableV4;
  loadPluginsReliableV4=async function(){
    const result=await baseLoadPluginsReliableV6();
    emit('plugins:changed',clone(allPlugins));
    return result;
  };
  Core.on('plugins:changed',()=>{ensurePluginFilters();addVisibleOverflowMenus()});

  // ---------- True launcher / compact mode ----------
  function ensureLauncherSetting(){
    if($('launcherModeSettingV6'))return;
    const modes=$('focusModeSetting')?.closest('.checkGrid');if(!modes)return;
    const label=document.createElement('label');label.className='option';label.innerHTML='<input id="launcherModeSettingV6" type="checkbox"> מצב Launcher — חיפוש ופעולות בממשק צפוף';
    modes.appendChild(label);
    $('launcherModeSettingV6').checked=!!featureSettings.launcherMode;
    $('launcherModeSettingV6').onchange=async e=>{featureSettings.launcherMode=!!e.target.checked;await saveFeatures();applyFeatureAppearance()};
  }
  const baseApplyAppearance=applyFeatureAppearance;
  applyFeatureAppearance=function(){
    baseApplyAppearance();
    document.body.classList.toggle('launcher-mode',!!featureSettings.launcherMode);
  };

  // ---------- Skeletons and actionable empty states ----------
  function showLoadingSkeletons(){
    for(const id of ['bookmarks','history']){
      const box=$(id);if(box&&!box.children.length){box.innerHTML='';box.appendChild(Core.makeSkeleton(3))}
    }
    const plugins=$('plugins');if(plugins&&!plugins.children.length){plugins.innerHTML='';plugins.appendChild(Core.makeSkeleton(4))}
  }
  function improveEmptyStates(){
    const configs={
      bookmarks:['אין סימניות להצגה','סימניות שתיצור יופיעו כאן.','פתח ספרייה',()=>Otzaria.call('navigation.goTo',{target:'library'})],
      history:['אין היסטוריה להצגה','לאחר פתיחת ספרים תופיע כאן הפעילות האחרונה.','פתח ספרייה',()=>Otzaria.call('navigation.goTo',{target:'library'})]
    };
    Object.entries(configs).forEach(([id,cfg])=>{
      const box=$(id);if(!box)return;
      if(box.querySelector('.empty')||/אין /.test(box.textContent.trim())){
        box.innerHTML='';const state=Core.makeEmptyState({title:cfg[0],text:cfg[1],action:cfg[2]});box.appendChild(state);state.querySelector('button')?.addEventListener('click',cfg[3]);
      }
    });
    improveGroupEmptyState();
    const plugins=$('plugins');
    if(plugins&&(plugins.querySelector('.empty')||/אין תוספים|לא ניתן לטעון/.test(plugins.textContent))){
      const failed=/לא ניתן/.test(plugins.textContent);
      plugins.innerHTML='';const state=Core.makeEmptyState({title:failed?'לא ניתן לטעון תוספים':'לא נמצאו תוספים',text:failed?'אפשר לנסות לטעון מחדש.':'כאשר יותקנו תוספים הם יופיעו כאן.',action:'רענן',actionId:'retryPluginsV6'});
      plugins.appendChild(state);state.querySelector('#retryPluginsV6').onclick=loadPluginsReliableV4;
    }
  }

  const baseLoadHomeV6=loadHome;
  loadHome=async function(){
    showLoadingSkeletons();
    try{return await baseLoadHomeV6()}
    finally{improveEmptyStates();renderWorkspaces();ensureUnifiedSavedBooksV7();ensurePluginFilters();addVisibleOverflowMenus();emit('home:rendered')}
  };

  const baseRunSearchV6=runSearch;
  runSearch=async function(append){
    const result=await baseRunSearchV6(append);
    if(!append&&$('q')?.value.trim().length>=2&&!currentResults.length){
      const empty=$('searchEmpty');
      if(empty){
        empty.hidden=false;empty.innerHTML='';
        const state=Core.makeEmptyState({
          title:'לא נמצאו תוצאות',
          text:'אפשר לשנות את אפשרויות החיפוש או לפתוח את אותו חיפוש במנוע המובנה של אוצריא.',
          action:'פתח בחיפוש המובנה',
          actionId:'emptyBuiltInSearchV6'
        });
        empty.appendChild(state);
        state.querySelector('#emptyBuiltInSearchV6').onclick=openBuiltInSearch;
      }
    }
    emit('search:completed',{query:$('q')?.value||'',count:currentResults.length,append:!!append});
    return result;
  };

  // ---------- UX audit helpers ----------
  function auditUi(){
    document.querySelectorAll('button:not([aria-label])').forEach(b=>{
      const text=b.textContent.trim();if(!text&&b.title)b.setAttribute('aria-label',b.title);
    });
    document.querySelectorAll('.sectionPanel').forEach(sec=>{
      const h=sec.querySelector('.sectionHead h2');if(h&&!sec.getAttribute('aria-label'))sec.setAttribute('aria-label',h.textContent.trim());
    });
    document.querySelectorAll('select').forEach(s=>{if(!s.getAttribute('aria-label')&&!s.closest('label')){const row=s.closest('.settingRow,.field');const label=row?.querySelector('label,span');if(label)s.setAttribute('aria-label',label.textContent.trim())}});
  }

  // ---------- UX v8: edit mode, capped home lists, unified modals ----------
  let homeEditModeV8=false;
  let lastModalTriggerV8=null;

  function setHomeEditModeV8(on){
    homeEditModeV8=!!on;
    document.body.classList.toggle('homeEditModeV8',homeEditModeV8);
    document.querySelectorAll('#sectionsHost .sectionPanel').forEach(sec=>sec.draggable=homeEditModeV8);
    const b=$('editHomeV8');if(b){b.classList.toggle('active',homeEditModeV8);b.setAttribute('aria-pressed',homeEditModeV8?'true':'false');b.querySelector('span')&&(b.querySelector('span').textContent=homeEditModeV8?'סיום עריכה':'ערוך דף')}
    toast(homeEditModeV8?'מצב עריכת דף הבית פעיל':'עריכת דף הבית הסתיימה');
  }
  function ensureEditHomeButtonV8(){
    if($('editHomeV8'))return;
    const top=document.querySelector('.topActions');if(!top)return;
    const b=document.createElement('button');b.id='editHomeV8';b.className='iconTextBtn';b.type='button';b.setAttribute('aria-pressed','false');b.innerHTML=uiIconV4('settings')+'<span>ערוך דף</span>';
    b.onclick=()=>setHomeEditModeV8(!homeEditModeV8);top.prepend(b);
  }

  function openSimpleListModalV8(title,items,onOpen){
    const content=document.createElement('div');
    content.innerHTML='<div class="uxModalSearchWrapV8"><input class="uxModalSearchV8" type="search" placeholder="סינון…"></div><div class="uxModalListV8"></div>';
    const modal=Core.ui.openModal({id:'simpleListModalV8',title,subtitle:items.length+' פריטים',className:'uxListDialogV8',content});
    const host=content.querySelector('.uxModalListV8'),input=content.querySelector('.uxModalSearchV8');
    const render=()=>{
      const q=input.value.trim().toLowerCase();host.innerHTML='';
      items.filter(x=>!q||String(x.title||'').toLowerCase().includes(q)||String(x.meta||'').toLowerCase().includes(q)).forEach(item=>{
        const b=document.createElement('button');b.type='button';b.className='uxListRowV8';
        b.innerHTML='<span><b>'+esc(item.title||'פריט')+'</b>'+(item.meta?'<small>'+esc(item.meta)+'</small>':'')+'</span><span aria-hidden="true">←</span>';
        b.onclick=()=>{modal.close();onOpen(item)};host.appendChild(b);
      });
    };
    input.oninput=render;render();input.focus();
  }

  function capRenderedListV8(id,title,limit=6){
    const box=$(id);if(!box)return;
    const rows=[...box.querySelectorAll('.row')];box.querySelector('.showAllHomeListV8')?.remove();
    rows.forEach((row,i)=>row.classList.toggle('uxHomeOverflowV8',i>=limit));
    if(rows.length<=limit)return;
    const btn=document.createElement('button');btn.type='button';btn.className='secondaryBtn showAllHomeListV8';btn.textContent='הצג הכל ('+rows.length+')';
    btn.onclick=()=>{
      const items=rows.map(row=>({title:row.querySelector('b')?.textContent||'פריט',meta:row.querySelector('.meta')?.textContent||'',book:row.__homeBook||null}));
      openSimpleListModalV8(title,items,item=>item.book?openBook(item.book):null);
    };
    box.appendChild(btn);
  }

  function capSavedBooksV8(){
    const cards=[...document.querySelectorAll('#savedTabGrid .savedTabCard')];
    document.querySelector('#section-saved-tabs .showAllSavedV8')?.remove();
    cards.forEach((card,i)=>card.classList.toggle('uxHomeOverflowV8',i>=5));
    const groupBlocks=[...document.querySelectorAll('#savedGroupsHostV7 .groupBlock')];
    groupBlocks.forEach((card,i)=>card.classList.toggle('uxHomeOverflowV8',i>=5));
    const total=cards.length+groupBlocks.length;if(total<=5)return;
    const b=document.createElement('button');b.className='secondaryBtn showAllSavedV8';b.type='button';b.textContent='הצג את כל הספרים השמורים ('+total+')';
    b.onclick=()=>{
      const items=[];
      savedTabSets.forEach(set=>items.push({title:set.name,meta:(set.books||[]).length+' ספרים',set}));
      groups.filter(g=>(g.books||[]).length).forEach(g=>items.push({title:g.name,meta:(g.books||[]).length+' ספרים',group:g}));
      openSimpleListModalV8('כל הספרים השמורים',items,item=>item.set?openTabSetPreviewV4(item.set):(()=>{featureSettings.groupScope=item.group.id;saveFeatures();$('q')?.focus()})());
    };
    $('section-saved-tabs')?.appendChild(b);
  }

  function compactSavedActionsV8(){
    const toolbar=document.querySelector('#section-saved-tabs .savedTabToolbar');if(!toolbar||toolbar.dataset.uxV8==='1')return;
    toolbar.dataset.uxV8='1';
    const primary=$('newTabSetBtn');if(primary){primary.innerHTML=uiIconV4('bookmark')+'<span>חדש</span>'}
    ['captureTabsBtn','saveWorkspaceV6','exportTabSetsBtn','importTabSetsBtn'].forEach(id=>{const el=$(id);if(el)el.classList.add('savedSecondaryActionV8')});
    let more=$('savedMoreV8');
    if(!more){more=document.createElement('button');more.id='savedMoreV8';more.type='button';more.className='secondaryBtn';more.textContent='⋯';toolbar.appendChild(more)}
    more.onclick=e=>{
      const r=e.currentTarget.getBoundingClientRect();
      showHomeContextMenuV5([
        {label:'שמור לשוניות פתוחות',icon:'bookmark',action:()=>captureCurrentTabsV4()},
        {label:'שמור מצב נוכחי',icon:'apps',action:()=>saveWorkspace()},
        contextSeparatorV5(),
        {label:'ייבא',action:()=>$('importTabSetsFile')?.click()},
        {label:'ייצא',action:()=>exportTabSetsV4()}
      ],r.left,r.bottom+4,'ספרים שמורים');
    };
  }

  function openFeedbackModalV9(){
    const content=document.createElement('div');
    content.innerHTML='<div class="feedbackTypeV9"><label><input type="radio" name="feedbackTypeV9" value="bug" checked> דיווח על תקלה</label><label><input type="radio" name="feedbackTypeV9" value="other"> רעיון או משוב אחר</label></div><div class="feedbackFieldsV9"><label>קטגוריה<select id="feedbackCategoryV9"><option value="כללי">כללי</option><option value="חיפוש">חיפוש</option><option value="תצוגה">תצוגה</option><option value="כפתור +">כפתור +</option><option value="תוספים">תוספים</option><option value="ביצועים">ביצועים</option></select></label><label>תוכן ההודעה<textarea id="feedbackTextV9" maxlength="5000" placeholder="כתוב כאן את פרטי התקלה, הרעיון או ההצעה…"></textarea></label><div class="hint">לפני השליחה אוצריא עשויה להציג חלון אישור.</div><div id="feedbackStatusV9" class="feedbackStatusV9"></div><div class="tabSetDialogActions"><button class="secondaryBtn feedbackCancelV9" type="button">ביטול</button><button id="feedbackSendV9" class="primaryBtn" type="button">שלח משוב</button></div></div>';
    const modal=Core.ui.openModal({id:'feedbackDialogV9',title:'משוב למפתח',subtitle:'דווח על תקלה או שלח רעיון דרך מנגנון המשוב של אוצריא.',className:'feedbackModalV9',content});
    content.querySelector('.feedbackCancelV9').onclick=modal.close;
    const send=$('feedbackSendV9'),status=$('feedbackStatusV9'),textBox=$('feedbackTextV9');
    send.onclick=async()=>{
      const details=textBox.value.trim();if(!details){status.textContent='יש לכתוב את תוכן המשוב.';textBox.focus();return}
      const selected=content.querySelector('input[name="feedbackTypeV9"]:checked');
      const reportType=selected&&selected.value==='bug'?'bug':'other';
      const category=$('feedbackCategoryV9').value;
      send.disabled=true;status.textContent='מכין את הדיווח…';
      try{
        const payload='קטגוריה: '+category+'\n\n'+details;
        const r=await Otzaria.call('feedback.report',{details:payload,reportType});
        if(!r||r.success===false)throw new Error((r&&r.error)||'feedback failed');
        if(r.data==='cancelled'){status.textContent='השליחה בוטלה.';return}
        if(r.data==='queued'){status.textContent='הדיווח נשמר באוצריא וישלח כשיתאפשר.';textBox.value='';return}
        status.textContent='הדיווח נשלח בהצלחה.';textBox.value='';
      }catch(err){
        status.textContent='הדיווח לא נשלח. נסה שוב.';
        fLog('error','Feedback send failed',err);
      }finally{send.disabled=false}
    };
    setTimeout(()=>textBox.focus(),0);
  }

  function ensureFeedbackLauncherV9(){
    const pane=$('settingsTab-feedback');if(!pane||$('openFeedbackV9'))return;
    const old=pane.querySelector('.feedbackSettings');if(old)old.hidden=true;
    const card=document.createElement('section');card.className='settingBlock feedbackLaunchCardV9';
    card.innerHTML='<div><h3>משוב למפתח</h3><p class="hint">פתח טופס משוב ייעודי שאינו תלוי בפריסת חלון ההגדרות.</p></div><button id="openFeedbackV9" class="primaryBtn" type="button">פתח טופס משוב</button>';
    const head=pane.querySelector('.settingsPaneHead');if(head)head.insertAdjacentElement('afterend',card);else pane.prepend(card);
    $('openFeedbackV9').onclick=openFeedbackModalV9;
  }

  function openAboutModalV9(){
    const content=document.createElement('div');content.className='aboutModalV9';
    content.innerHTML='<div class="aboutModalBrandV9"><img src="plugin-icon.jpg" alt=""><div><b>בית אוצריא שלי</b><span>גרסה 4.2.7</span></div></div><p>דף בית מתקדם לאוצריא עם חיפוש, ספרים שמורים, היסטוריה, סימניות ותוספים.</p><div class="shortcutList"><span><kbd>Ctrl</kbd> + <kbd>K</kbd><b>מיקוד בחיפוש</b></span><span><kbd>Ctrl</kbd> + <kbd>,</kbd><b>פתיחת הגדרות</b></span><span><kbd>Esc</kbd><b>סגירת חלון</b></span><span><kbd>Alt</kbd> + <kbd>F</kbd><b>Focus Mode</b></span></div>';
    Core.ui.openModal({id:'aboutDialogV9',title:'אודות וקיצורים',className:'aboutDialogV9',content});
  }
  function ensureAboutLauncherV9(){
    const pane=$('settingsTab-feedback');if(!pane||$('openAboutV9'))return;
    const card=document.createElement('section');card.className='settingBlock feedbackLaunchCardV9';
    card.innerHTML='<div><h3>אודות וקיצורים</h3><p class="hint">גרסה, מידע וקיצורי מקלדת שימושיים.</p></div><button id="openAboutV9" class="secondaryBtn" type="button">פתח אודות</button>';
    pane.appendChild(card);$('openAboutV9').onclick=openAboutModalV9;
  }

  function simplifySettingsV8(){
    const tabs=[...document.querySelectorAll('.settingsTab')];
    const feedback=tabs.find(x=>x.dataset.settingsTab==='feedback');
    const about=tabs.find(x=>x.dataset.settingsTab==='about');
    if(feedback){feedback.querySelector('b')&&(feedback.querySelector('b').textContent='מתקדם');feedback.querySelector('small')&&(feedback.querySelector('small').textContent='גיבוי, משוב ומידע')}
    if(about)about.hidden=true;
    const fp=$('settingsTab-feedback'),ap=$('settingsTab-about');
    ensureFeedbackLauncherV9();
    ensureAboutLauncherV9();
    if(ap)ap.hidden=true;
    fp?.querySelector('[data-moved-about-v8]')?.remove();
    ensureResetButtonsV8();
  }
  function ensureResetButtonsV8(){
    const appearance=$('settingsTab-appearance');if(appearance&&!$('resetLayoutV8')){
      const block=document.createElement('section');block.className='settingBlock';block.innerHTML='<h3>איפוס תצוגה</h3><div class="resetActionsV8"><button id="resetLayoutV8" class="secondaryBtn" type="button">אפס פריסת דף הבית</button><button id="resetPluginViewV8" class="secondaryBtn" type="button">אפס תצוגת תוספים</button></div>';appearance.appendChild(block);
      $('resetLayoutV8').onclick=async()=>{settings.sectionOrder=['plugins','groups','bookmarks','history'];featureSettings.columns='3';featureSettings.density='comfortable';await storageSet(SETTINGS_KEY,settings);await saveFeatures();applyFeatureAppearance();applyLayout();toast('פריסת דף הבית אופסה')};
      $('resetPluginViewV8').onclick=async()=>{featureSettings.pluginView='grid';featureSettings.pluginSort='host';await saveFeatures();setupPluginControls();renderPlugins();toast('תצוגת התוספים אופסה')};
    }
  }

  function installModalBehaviorV8(){
    if(document.body.dataset.modalUxV8==='1')return;document.body.dataset.modalUxV8='1';
    document.addEventListener('keydown',e=>{
      if(e.key!=='Escape')return;
      const d=[...document.querySelectorAll('.tabSetDialog')].filter(x=>x.isConnected).at(-1);
      if(d){e.preventDefault();d.remove();if(lastModalTriggerV8?.isConnected)lastModalTriggerV8.focus();lastModalTriggerV8=null}
    },true);
  }

  async function maybeOnboardV8(){
    const seen=await fGet('uxOnboardingV8',false);if(seen)return;
    const d=document.createElement('div');d.className='tabSetDialog';d.id='uxOnboardingV8';
    d.innerHTML='<div class="tabSetDialogCard onboardingV8"><div class="tabSetDialogHeader"><div><h2>הגדרת דף הבית</h2><div class="hint">שלושה דברים קצרים לפני שמתחילים</div></div></div><label>צפיפות<select id="onboardDensityV8"><option value="comfortable">נוחה</option><option value="compact">קומפקטית</option></select></label><label>מספר עמודות<select id="onboardColsV8"><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></label><label class="checkline"><input id="onboardDashboardV8" type="checkbox"> הצג לוח נתונים קטן</label><div class="tabSetDialogActions"><button id="onboardDoneV8" class="primaryBtn" type="button">סיום</button></div></div>';
    document.body.appendChild(d);
    $('onboardDoneV8').onclick=async()=>{featureSettings.density=$('onboardDensityV8').value;featureSettings.columns=$('onboardColsV8').value;featureSettings.showDashboard=$('onboardDashboardV8').checked;await saveFeatures();await fSet('uxOnboardingV8',true);applyFeatureAppearance();d.remove()};
  }

  function applyUxV8(){
    ensureEditHomeButtonV8();installModalBehaviorV8();simplifySettingsV8();compactSavedActionsV8();
    capRenderedListV8('history','נפתחו לאחרונה',6);capRenderedListV8('bookmarks','סימניות',6);capSavedBooksV8();
  }

  // ---------- Settings & boot ----------
  function setupEnhancements(){
    ensureBackupControls();ensureLauncherSetting();ensurePluginFilters();ensureWorkspaceSection();renderWorkspaces();renderSavedTabSetsV4();ensureUnifiedSavedBooksV7();addVisibleOverflowMenus();auditUi();applyFeatureAppearance();improveEmptyStates();applyUxV8();
  }

  Otzaria.on('plugin.boot',async()=>{
    await loadWorkspaces();
    setTimeout(()=>{setupEnhancements();maybeOnboardV8()},0);
  });
  Core.on('home:rendered',()=>{auditUi();setTimeout(applyUxV8,0)});
})();
