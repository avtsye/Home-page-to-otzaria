'use strict';
(function(){
  const listeners=new Map();
  const on=(name,fn)=>{
    if(typeof fn!=='function')return ()=>{};
    if(!listeners.has(name))listeners.set(name,new Set());
    listeners.get(name).add(fn);
    return ()=>listeners.get(name)?.delete(fn);
  };
  const emit=async(name,payload)=>{
    const fns=[...(listeners.get(name)||[])];
    for(const fn of fns){
      try{await fn(payload)}catch(err){console.error('[HomeCore event]',name,err)}
    }
  };
  const once=(name,fn)=>{
    const off=on(name,async payload=>{off();await fn(payload)});
    return off;
  };
  const safeClone=value=>{
    try{return structuredClone(value)}catch(_){
      try{return JSON.parse(JSON.stringify(value))}catch(__){return value}
    }
  };
  const downloadJson=(filename,data)=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  const debounce=(fn,delay=150)=>{
    let t=0;
    return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay)};
  };
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const makeEmptyState=({title='',text='',action='',actionId='',icon=''}={})=>{
    const wrap=document.createElement('div');wrap.className='homeEmptyState';
    wrap.innerHTML=(icon?'<div class="homeEmptyIcon">'+icon+'</div>':'')+
      '<b>'+escapeHtml(title)+'</b>'+
      (text?'<span>'+escapeHtml(text)+'</span>':'')+
      (action?'<button type="button" class="secondaryBtn"'+(actionId?' id="'+escapeHtml(actionId)+'"':'')+'>'+escapeHtml(action)+'</button>':'');
    return wrap;
  };
  const openModal=({id='',title='',subtitle='',className='',content=null,trigger=null,onClose=null}={})=>{
    if(id)document.getElementById(id)?.remove();
    const returnFocus=trigger||document.activeElement;
    const root=document.createElement('div');root.className='tabSetDialog';if(id)root.id=id;
    const card=document.createElement('div');card.className='tabSetDialogCard'+(className?' '+className:'');
    const head=document.createElement('div');head.className='tabSetDialogHeader';
    const titleWrap=document.createElement('div');titleWrap.innerHTML='<h2>'+escapeHtml(title)+'</h2>'+(subtitle?'<div class="hint">'+escapeHtml(subtitle)+'</div>':'');
    const closeBtn=document.createElement('button');closeBtn.type='button';closeBtn.className='nativeIconButton';closeBtn.setAttribute('aria-label','סגור');closeBtn.textContent='×';
    head.append(titleWrap,closeBtn);
    const body=document.createElement('div');body.className='homeModalBody';
    if(content instanceof Node)body.appendChild(content);else if(typeof content==='string')body.innerHTML=content;
    card.append(head,body);root.appendChild(card);document.body.appendChild(root);
    const close=()=>{root.remove();onClose?.();if(returnFocus&&returnFocus.isConnected&&typeof returnFocus.focus==='function')returnFocus.focus()};
    closeBtn.onclick=close;root.addEventListener('click',e=>{if(e.target===root)close()});
    const key=e=>{if(e.key==='Escape'&&root.isConnected){e.preventDefault();close();document.removeEventListener('keydown',key,true)}};
    document.addEventListener('keydown',key,true);
    return {root,card,head,body,close,closeBtn};
  };
  const makeCard=({title='',subtitle='',className='',content=null}={})=>{
    const card=document.createElement('section');card.className='sectionPanel'+(className?' '+className:'');
    const head=document.createElement('div');head.className='sectionHead';
    head.innerHTML='<div><h2>'+escapeHtml(title)+'</h2>'+(subtitle?'<span>'+escapeHtml(subtitle)+'</span>':'')+'</div>';
    card.appendChild(head);
    if(content instanceof Node)card.appendChild(content);else if(typeof content==='string'){const body=document.createElement('div');body.innerHTML=content;card.appendChild(body)}
    return card;
  };
  const makeSkeleton=(rows=3)=>{
    const box=document.createElement('div');box.className='homeSkeletonList';
    for(let i=0;i<rows;i++){
      const row=document.createElement('div');row.className='homeSkeletonRow';
      row.innerHTML='<span></span><span></span>';
      box.appendChild(row);
    }
    return box;
  };
  window.HomeCore={
    version:1,
    on,once,emit,safeClone,downloadJson,debounce,escapeHtml,makeEmptyState,makeSkeleton,
    ui:{openModal,makeCard},
    schema:{backup:1,workspace:1}
  };
})();
