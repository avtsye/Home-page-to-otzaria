const fs=require('fs');
const assert=(cond,msg)=>{if(!cond){console.error('SMOKE FAIL:',msg);process.exitCode=1;}};
const html=fs.readFileSync('index.html','utf8');
const main=fs.readFileSync('main.js','utf8');
const features=fs.readFileSync('features.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));

const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
for(const [file,src] of [['main.js',main]]){
  const refs=[...src.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
  for(const id of new Set(refs))assert(ids.has(id),file+' references missing #'+id);
}
assert(main.indexOf('const clone=')<main.indexOf('let settings=clone('),'clone must be defined before settings initialization');
assert(html.includes('<script src="main.js"></script>'),'main.js must be loaded');
assert(html.includes('<script src="features.js"></script>'),'features.js must be loaded');
assert(html.indexOf('main.js')<html.indexOf('features.js'),'features.js must load after main.js');
assert(manifest.version==='4.0.1','manifest version must be 4.0.1');
assert(html.includes('4.0.0'),'UI must show current version');
assert(manifest.permissions.includes('search.fulltext.read'),'full-text search permission missing');
assert(manifest.minAppVersion==='0.9.98','store release must require Otzaria 0.9.98');
assert(manifest.permissions.includes('plugin.storage.read')&&manifest.permissions.includes('plugin.storage.write'),'storage permissions missing');
assert(/Otzaria\.call\('search\.query'/.test(main),'main full-text search missing');
assert(/history\.listSearches/.test(features),'search history integration missing');
assert(/runDiagnostics/.test(features),'diagnostics missing');
assert(!/ideaBtn|bugBtn|feedbackModal/.test(main),'removed feedback UI is still referenced in main.js');
if(!process.exitCode)console.log('Smoke checks passed.');
