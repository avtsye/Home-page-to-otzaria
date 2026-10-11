/* Search result readability and local home-list controls. */
(function(){
'use strict';
const KEY='home_search_readability_v1',HIDDEN='home_hidden_rows_v1';
const defaults={layout:'list',font:'1',lines:'5'};
function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))||fallback}catch(_){return fallback}}
function write(k,value){try{localStorage.setItem(k,JSON.stringify(value));return true}catch(_){return false}}
let prefs=Object.assign({},defaults,read(KEY,{}));
let hidden=read(HIDDEN,{history:[],bookmarks:[]});
function itemId(item){return String((typeof bookKey==='function'&&bookKey(item))||item.bookUid||item.bookId||item.id||item.title||item.book||JSON.stringify(item))}
function apply(){
  const box=document.getElementById('searchResults');
  if(box){box.classList.toggle('searchReadableList',prefs.layout!=='grid');box.style.setProperty('--readable-font',prefs.font+'rem');box.style.setProperty('--readable-lines',String(prefs.lines==='0'?999:Number(prefs.lines)||5));box.classList.toggle('searchShowAll',prefs.lines==='0')}
}
function sync(){
  for(const [id,key] of [['searchLayoutPref','layout'],['searchFontPref','font'],['searchLinesPref','lines']]){
    const el=document.getElementById(id);if(el)el.value=prefs[key];
  }
}
function install(){
  sync();apply();
  for(const [id,key] of [['searchLayoutPref','layout'],['searchFontPref','font'],['searchLinesPref','lines']]){
    const el=document.getElementById(id);
    if(el&&!el.dataset.readableBound){el.dataset.readableBound='1';el.addEventListener('change',()=>{prefs[key]=el.value;write(KEY,prefs);apply()})}
  }
  const restore=document.getElementById('restoreHiddenHomeItems');
  if(restore&&!restore.dataset.readableBound){restore.dataset.readableBound='1';restore.addEventListener('click',async()=>{hidden={history:[],bookmarks:[]};write(HIDDEN,hidden);if(typeof loadHome==='function')await loadHome();if(typeof toast==='function')toast('הפריטים המוסתרים הוחזרו')})}
}
const style=document.createElement('style');
style.textContent=`
/* Uses app design tokens, stays within the plugin's theme. */
#searchResults.searchReadableList{grid-template-columns:minmax(0,1fr)}
#searchResults .searchResult{font-size:var(--readable-font,1rem);line-height:1.7}
#searchResults .searchResult .resultText{font-size:1em;line-height:1.7;-webkit-line-clamp:var(--readable-lines,5)}
#searchResults .searchResult .resultBook{font-size:1em}
#searchResults .searchResult .resultRef{font-size:.85em;white-space:normal;text-align:start}
#searchResults .searchResult .resultMeta{font-size:.8em}
#searchResults.searchShowAll .searchResult .resultText{display:block;-webkit-line-clamp:unset;overflow:visible}
#searchResults.searchReadableList .searchResult{width:100%;padding:1em 1.15em}
@media(max-width:920px){#searchResults{grid-template-columns:minmax(0,1fr)}}
`;
document.head.appendChild(style);
// Keep the underlying history intact; hiding here never erases a global reading record.
if(typeof renderList==='function'){
  const originalRenderList=renderList;
  renderList=function(id,items,empty){
    const excluded=hidden[id];
    const filtered=Array.isArray(excluded)?(items||[]).filter(x=>!excluded.includes(itemId(x))):items;
    return originalRenderList(id,filtered,empty);
  };
}
if(typeof contextForBookV5==='function'){
  const originalContext=contextForBookV5;
  contextForBookV5=function(book,target){
    const items=originalContext(book,target);
    const source=target&&target.closest('#history,#bookmarks');
    if(source){
      const listId=source.id;
      items.push({separator:true});
      items.push({label:listId==='history'?'הסתר מהיסטוריה בדף הבית':'הסתר מסימניות בדף הבית',icon:'close',danger:true,action:()=>{
        if(!Array.isArray(hidden[listId]))hidden[listId]=[];
        const key=itemId(book);if(!hidden[listId].includes(key))hidden[listId].push(key);
        write(HIDDEN,hidden);
        if(typeof loadHome==='function')loadHome();
        if(typeof toast==='function')toast('הפריט הוסתר מדף הבית; אפשר לשחזר בהגדרות');
      }});
    }
    return items;
  };
}
const priorSettings=typeof renderSettings==='function'?renderSettings:null;
if(priorSettings){renderSettings=function(...args){const value=priorSettings.apply(this,args);sync();return value}}
if(typeof renderSearchResults==='function'){
  const originalSearch=renderSearchResults;
  renderSearchResults=function(...args){const value=originalSearch.apply(this,args);apply();return value};
}
document.addEventListener('DOMContentLoaded',install);
if(document.readyState!=='loading')install();
})();