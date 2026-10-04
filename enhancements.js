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
        '<div class="savedTabMeta">'+set.books.length+' ספרים</div><div class="savedTabBooks">'+preview+(set.books.length>4?'<div class="savedTabMore">ועוד '+(set.books.length-4)+'…</div>':'')+'</div>'+status;
      card.appendChild(overflow);
      card.onclick=()=>openTabSetPreviewV4(set);
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
        {label:'פתח / בחר ספרים',icon:'book',action:()=>openTabSetPreviewV4(set)},
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
    workspaces=Array.isArray(raw)?raw.filter(x=>x&&x.id&&x.name):[];
  }
  async function saveWorkspaces(){await fSet(WORKSPACE_KEY,workspaces);emit('workspaces:changed',clone(workspaces))}

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
    const name=await askName('שמירת סביבת עבודה','סביבת עבודה '+(workspaces.length+1));if(!name)return;
    const snapshot={
      id:'ws-'+Date.now().toString(36),
      name,
      createdAt:Date.now(),updatedAt:Date.now(),
      books:readerTabsV4(state),
      activeBook:state?{id:state.currentId,type:state.currentType,source:state.currentSource,bookId:state.currentBookId,title:state.currentBook,index:state.currentIndex,ref:state.currentRef}:null,
      query:$('q')?.value||'',
      searchConfig:clone(settings.searchConfig||DEFAULT_SEARCH),
      groupScope:featureSettings.groupScope||'',
      focusMode:!!featureSettings.focusMode
    };
    workspaces.unshift(snapshot);workspaces=workspaces.slice(0,30);
    await saveWorkspaces();renderWorkspaces();toast('סביבת העבודה נשמרה');
  }

  async function restoreWorkspace(ws){
    settings.searchConfig=clone(ws.searchConfig||DEFAULT_SEARCH);
    featureSettings.groupScope=ws.groupScope||'';
    featureSettings.focusMode=!!ws.focusMode;
    await saveFeatures();
    if($('q'))$('q').value=ws.query||'';
    applySearchSettingsToUi();renderDynamicSearchControls();applyFeatureAppearance();renderSavedSearchControls();
    if(ws.books?.length){
      await openTabSetV4({name:ws.name,books:ws.books,conflictDefault:'keep',lastOpenedAt:0,updatedAt:Date.now()},ws.books);
    }
    if(ws.activeBook){try{await openBook(ws.activeBook)}catch(_){}}
    if((ws.query||'').trim().length>=2)runSearch(false);
    toast('סביבת העבודה שוחזרה');
  }

  async function deleteWorkspace(ws){
    const idx=workspaces.findIndex(x=>x.id===ws.id);if(idx<0)return;
    const [removed]=workspaces.splice(idx,1);await saveWorkspaces();renderWorkspaces();toast('סביבת העבודה נמחקה');
    window.homePushUndo?.('סביבת העבודה נמחקה',async()=>{workspaces.splice(Math.min(idx,workspaces.length),0,removed);await saveWorkspaces();renderWorkspaces()});
  }

  function ensureWorkspaceSection(){
    if($('section-workspaces'))return;
    const saved=$('section-saved-tabs');if(!saved)return;
    const sec=document.createElement('section');sec.id='section-workspaces';sec.className='sectionPanel wide workspaceSectionV6';
    sec.innerHTML='<div class="sectionHead"><div><h2>סביבות עבודה</h2><span>שמור ספרים, חיפוש ומצב עבודה יחד</span></div><button id="saveWorkspaceV6" class="secondaryBtn" type="button">שמור סביבה נוכחית</button></div><div id="workspaceGridV6" class="workspaceGridV6"></div>';
    saved.insertAdjacentElement('afterend',sec);
    $('saveWorkspaceV6').onclick=saveWorkspace;
  }

  function renderWorkspaces(){
    ensureWorkspaceSection();const box=$('workspaceGridV6');if(!box)return;box.innerHTML='';
    if(!workspaces.length){
      const empty=Core.makeEmptyState({title:'אין סביבות עבודה שמורות',text:'שמור את הספרים, החיפוש והמצב הנוכחי כדי לחזור אליהם יחד.',action:'שמור את הסביבה הנוכחית',actionId:'emptyWorkspaceSaveV6'});
      box.appendChild(empty);empty.querySelector('#emptyWorkspaceSaveV6').onclick=saveWorkspace;return;
    }
    workspaces.forEach(ws=>{
      const card=document.createElement('article');card.className='workspaceCardV6';
      card.innerHTML='<div><b>'+esc(ws.name)+'</b><span>'+((ws.books||[]).length)+' ספרים'+(ws.query?' · חיפוש: '+esc(ws.query):'')+'</span></div><div class="workspaceActionsV6"><button class="primaryBtn">פתח</button><button class="cardOverflowBtn">⋯</button></div>';
      card.querySelector('.primaryBtn').onclick=()=>restoreWorkspace(ws);
      card.querySelector('.cardOverflowBtn').onclick=e=>{
        e.stopPropagation();
        if(typeof showHomeContextMenuV5==='function'){
          const r=e.currentTarget.getBoundingClientRect();
          showHomeContextMenuV5([
            {label:'שחזר סביבת עבודה',action:()=>restoreWorkspace(ws)},
            {label:'מחק',icon:'close',danger:true,action:()=>deleteWorkspace(ws)}
          ],r.left,r.bottom+4,ws.name);
        }
      };
      box.appendChild(card);
    });
  }

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
  renderGroups=function(){const r=baseRenderGroupsV6();setTimeout(addVisibleOverflowMenus,0);return r};
  const baseRenderPluginsV6=renderPlugins;
  renderPlugins=function(){const r=baseRenderPluginsV6();setTimeout(()=>{ensurePluginFilters();addVisibleOverflowMenus()},0);return r};

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
    workspaces=Array.isArray(raw.workspaces)?raw.workspaces:[];
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
    for(const id of ['recent','bookmarks','history']){
      const box=$(id);if(box&&!box.children.length){box.innerHTML='';box.appendChild(Core.makeSkeleton(3))}
    }
    const plugins=$('plugins');if(plugins&&!plugins.children.length){plugins.innerHTML='';plugins.appendChild(Core.makeSkeleton(4))}
  }
  function improveEmptyStates(){
    const configs={
      recent:['אין עדיין ספרים אחרונים','ספרים שתפתח באוצריא יופיעו כאן.','פתח ספרייה',()=>Otzaria.call('navigation.goTo',{target:'library'})],
      bookmarks:['אין סימניות להצגה','סימניות שתיצור יופיעו כאן.','פתח ספרייה',()=>Otzaria.call('navigation.goTo',{target:'library'})],
      history:['אין היסטוריה להצגה','לאחר פתיחת ספרים תופיע כאן הפעילות האחרונה.','פתח ספרייה',()=>Otzaria.call('navigation.goTo',{target:'library'})]
    };
    Object.entries(configs).forEach(([id,cfg])=>{
      const box=$(id);if(!box)return;
      if(box.querySelector('.empty')||/אין /.test(box.textContent.trim())){
        box.innerHTML='';const state=Core.makeEmptyState({title:cfg[0],text:cfg[1],action:cfg[2]});box.appendChild(state);state.querySelector('button')?.addEventListener('click',cfg[3]);
      }
    });
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
    finally{improveEmptyStates();renderWorkspaces();ensurePluginFilters();addVisibleOverflowMenus();emit('home:rendered')}
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

  // ---------- Settings & boot ----------
  function setupEnhancements(){
    ensureBackupControls();ensureLauncherSetting();ensurePluginFilters();ensureWorkspaceSection();renderWorkspaces();renderSavedTabSetsV4();addVisibleOverflowMenus();auditUi();applyFeatureAppearance();improveEmptyStates();
  }

  Otzaria.on('plugin.boot',async()=>{
    await loadWorkspaces();
    setTimeout(setupEnhancements,0);
  });
  Core.on('home:rendered',auditUi);
})();
