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
    schema:{backup:1,workspace:1}
  };
})();
