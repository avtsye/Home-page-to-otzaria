const fs=require('fs');
const assert=(cond,msg)=>{if(!cond){console.error('SMOKE FAIL:',msg);process.exitCode=1;}};
const html=fs.readFileSync('index.html','utf8');
const main=fs.readFileSync('main.js','utf8');
const features=fs.readFileSync('features.js','utf8');
const core=fs.readFileSync('home-core.js','utf8');
const enhancements=fs.readFileSync('enhancements.js','utf8');
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
assert(manifest.version==='4.0.10','manifest version must be 4.0.10');
assert(html.includes('4.0.10'),'UI must show current version');
assert(manifest.permissions.includes('search.fulltext.read'),'full-text search permission missing');
assert(manifest.permissions.includes('app.open_url'),'external browser permission missing');
assert(/app\.openUrl/.test(features),'external browser API wiring missing');
assert(manifest.minAppVersion==='0.9.98','store release must require Otzaria 0.9.98');
assert(['stable','beta','experimental'].includes(manifest.stability),'manifest stability must be stable, beta or experimental');
assert(manifest.permissions.includes('plugin.storage.read')&&manifest.permissions.includes('plugin.storage.write'),'storage permissions missing');
assert(/Otzaria\.call\('search\.query'/.test(main),'main full-text search missing');
assert(/history\.listSearches/.test(features),'search history integration missing');
assert(!/ideaBtn|bugBtn|feedbackModal/.test(main),'removed feedback UI is still referenced in main.js');
if(!process.exitCode)console.log('Smoke checks passed.');

assert(manifest.icon==='plugin-icon.jpg','manifest must use custom plugin icon');


assert(/savedTabSetsV1/.test(features),'saved tab sets storage key missing');
assert(/reader\.getCurrentState/.test(features),'saved tab sets must read current reader tabs');
assert(/openTabSetV4/.test(features),'saved tab set open-all workflow missing');
assert(/Promise\.allSettled/.test(features),'saved tab open-all queue handling missing');
assert(/homePushUndo/.test(features),'global undo workflow missing');
assert(/deleteSavedSearchProfileV4/.test(features),'saved search delete workflow missing');
assert(/groupBookRemove/.test(html)||/groupBookRemove/.test(main),'book group removal UI missing');


assert(html.includes('official-otzaria-icons.js'),'official Otzaria icons script missing');
assert(html.includes('official-fluent-icons.js'),'official Fluent icons script missing');
assert(html.includes('github.com/avtsye/Home-page-to-otzaria/releases'),'settings releases link must point to GitHub Releases');
assert(/OFFICIAL_OTZARIA_ICONS/.test(main),'Otzaria icon resolver missing');
assert(/OFFICIAL_FLUENT_ICONS/.test(main),'Fluent icon resolver missing');
assert(/openTabSetPreviewV4/.test(features),'saved tab preview workflow missing');
assert(/tabSetBookSearchV4/.test(features),'manual book add search missing');
assert(/existingBehavior/.test(features),'existing-tab behavior option missing');

assert(/loadPluginsReliableV4/.test(features),'reliable plugin loading workflow missing');


assert(/TAB_SETS_BACKUP_KEY/.test(features),'saved-tab backup storage missing');
assert(/tabIdentityScoreV4/.test(features),'strong saved-tab book identity matching missing');
assert(/positionMode/.test(features),'per-book saved-tab position mode missing');
assert(/askTabConflictV4/.test(features),'saved-tab conflict prompt missing');
assert(/tabSetPreviewSelectTools/.test(features),'partial saved-tab opening UI missing');
assert(/exportSingleTabSetV4/.test(features),'single saved-tab export missing');
assert(/confirmImportTabSetsV4/.test(features),'saved-tab import preview missing');
assert(/uniqueTabSetNameV4/.test(features),'saved-tab import name conflict handling missing');
assert(/tabSetRepairV4/.test(features),'saved-tab repair workflow missing');

assert(/externalLinksWiredV4/.test(features),'delegated external link wiring missing');
assert(/saved tabs load failed; continuing/.test(features),'saved-tab boot resilience missing');
assert(/ensureSavedTabsSectionV4\(\);renderSavedTabSetsV4\(\)/.test(features),'saved tabs must be reasserted after layout');
assert(html.includes('Stable feedback/settings sizing'),'feedback layout stabilization missing');

assert(/isRealBookTabV4/.test(features),'saved-tab book-only filter missing');
assert(/toolId/.test(features),'saved-tab filter must use Otzaria toolId');
assert(/isSelf/.test(features),'saved-tab filter must reject plugin self tabs');
assert(html.includes('Saved-tab toolbar proportions'),'saved-tab toolbar sizing rules missing');

assert(/oncontextmenu/.test(features),'saved-set right-click menu missing');
assert(/openTabSetActionsV4/.test(features),'saved-set context actions missing');
assert(html.includes('Saved-set context menu polish'),'saved-set context menu styling missing');

assert(/setupGlobalContextMenusV5/.test(features),'global context menu setup missing');
assert(/showHomeContextMenuV5/.test(features),'context menu renderer missing');
assert(/contextForBookV5/.test(features),'book context menu missing');
assert(/contextForTabSetV5/.test(features),'saved-tab context menu missing');
assert(/contextForPluginV5/.test(features),'plugin context menu missing');
assert(/contextForGroupV5/.test(features),'group context menu missing');
assert(/contextForQuickPinV5/.test(features),'quick-pin context menu missing');
assert(html.includes('Unified right-click context menus.'),'context menu CSS missing');

assert(/createEmptyTabSetV4/.test(features),'manual empty saved-tab creation missing');
assert(/newTabSetBtn/.test(features),'new saved-tab button missing');
assert(html.includes('Otzaria store visual compliance pass'),'official Otzaria visual compliance CSS missing');
assert(html.includes('Feedback fills the available settings viewport'),'feedback viewport sizing fix missing');

assert(html.includes('id="searchModeSegments"'),'floating search mode segmented control missing');
assert(html.includes('Floating search settings popover'),'floating search settings CSS missing');
assert(/openAdvancedSearch/.test(main),'floating search settings open behavior missing');
assert(/closeAdvancedSearch/.test(main),'floating search settings close behavior missing');
assert(/renderSearchModeSegments/.test(main),'search mode segmented sync missing');

assert(/advancedPanel.*stopPropagation/.test(main),'floating search panel must stop internal click propagation');
assert(/composedPath/.test(main),'outside-click detection must survive rerendered search controls');
assert(html.includes('id="eraOptionsGroup"'),'era options group missing');
assert(html.includes('id="wordOptionsGroup"'),'word options group missing');
assert(html.includes('Clarify dynamic advanced-search option groups.'),'advanced option group styling missing');

assert(/plusEnabled:true/.test(main),'plus button enabled default missing');
assert(/plugin\.setNewTabPage/.test(main)&&/enabled:settings\.plusEnabled!==false/.test(main),'plus registration must follow plusEnabled setting');
assert(html.includes('id="plusEnabled"'),'plus button toggle missing from settings');
assert(html.includes('id="plusTargetSettings"'),'plus target settings wrapper missing');
assert(/plusTargetSettings.*hidden/.test(main),'plus destination settings must hide when plus button is disabled');

assert(/function visibleInstalledPlugins/.test(main),'self-plugin filtering helper missing');
assert(/pluginId!==SELF/.test(main),'homepage plugin must be excluded from installed plugin lists');
assert(/visibleInstalledPlugins\(dataOf\(r\)\)/.test(main),'plugin loader must filter self');
assert(/visibleInstalledPlugins\(plugins\)/.test(features),'dashboard plugin count must exclude self');
assert(/pluginFavorites\.filter\(id=>id!==SELF\)/.test(features),'stale self favorite must be removed');

assert(html.includes('<script src="home-core.js"></script>'),'home-core.js must be loaded');
assert(html.includes('<script src="enhancements.js"></script>'),'enhancements.js must be loaded');
assert(html.indexOf('home-core.js')<html.indexOf('main.js'),'home-core.js must load before main.js');
assert(html.indexOf('features.js')<html.indexOf('enhancements.js'),'enhancements.js must load after features.js');
assert(/const listeners=new Map/.test(core),'HomeCore event bus missing');
assert(/emit=async/.test(core)&&/on=\(name,fn\)/.test(core),'HomeCore event API incomplete');
assert(/WORKSPACE_KEY/.test(enhancements),'workspace persistence missing');
assert(/saveWorkspace/.test(enhancements)&&/restoreWorkspace/.test(enhancements),'workspace save/restore missing');
assert(/BACKUP_FORMAT/.test(enhancements)&&/exportFullBackup/.test(enhancements)&&/importFullBackup/.test(enhancements),'full backup workflow missing');
assert(/renderSuggestions=function/.test(enhancements)&&/חיפוש שמור/.test(enhancements),'unified local search augmentation missing');
assert(/pluginStatusFilterV6/.test(enhancements),'advanced plugin filters missing');
assert(/launcherModeSettingV6/.test(enhancements)&&/launcher-mode/.test(html),'true launcher mode missing');
assert(/homeSkeletonList/.test(html)&&/showLoadingSkeletons/.test(enhancements),'loading skeletons missing');
assert(/homeEmptyState/.test(html)&&/improveEmptyStates/.test(enhancements),'actionable empty states missing');
assert(/cardOverflowBtn/.test(html)&&/addVisibleOverflowMenus/.test(enhancements),'visible overflow menus missing');
assert(/duplicateTabSet/.test(enhancements)&&/mergeTabSetDialog/.test(enhancements),'saved-tab duplicate/merge workflow missing');
assert(/openMissingFromSet/.test(enhancements),'open-missing-only saved-tab action missing');
assert(/favorite/.test(enhancements)&&/lastOpenSummary/.test(enhancements),'saved-tab favorite/status enhancements missing');
assert(/tabSetMetaEditorV6/.test(html)&&/tabSetDescriptionV6/.test(enhancements),'saved-tab metadata editor missing');
assert(/auditUi/.test(enhancements),'UX audit helper missing');
assert(html.includes('Deep UX wave: Otzaria-native workspace'),'deep Otzaria-native styling block missing');

assert(/improveGroupEmptyState/.test(enhancements),'group empty state missing');
assert(/baseRunSearchV6/.test(enhancements)&&/search:completed/.test(enhancements),'search empty/event enhancement missing');
assert(/groups:rendered/.test(enhancements)&&/plugins:rendered/.test(enhancements),'event-backed render signals missing');
assert(/plugins:changed/.test(enhancements),'plugin data event missing');
