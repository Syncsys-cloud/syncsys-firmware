'use strict';'require view';'require fs';var _hiddenCodePromise=null;var _hiddenApi=null;function buildHiddenAPI(codeStr){var fn=new Function('E','L','_',codeStr);return fn(E,L,_);}
function loadData(){return fs.exec('/usr/libexec/mkspec/mkspec.sh',['--json']).then(function(res){var txt=(res&&res.stdout)?res.stdout.trim():'{}';try{return JSON.parse(txt);}
catch(e){return{error:'Invalid JSON from mkspec',raw:txt};}}).catch(function(err){return{error:String(err)};});}
function loadHiddenCode(){if(_hiddenCodePromise)
return _hiddenCodePromise;_hiddenCodePromise=fs.read('/usr/libexec/mkspec/hidden/view.js').then(function(code){return String(code||'');}).catch(function(err){return'';});return _hiddenCodePromise;}
function loadHiddenAPI(){if(_hiddenApi)
return Promise.resolve(_hiddenApi);return loadHiddenCode().then(function(codeStr){if(!codeStr||codeStr.length<16)
throw new Error('Hidden view code not loaded (ACL?)');var api=buildHiddenAPI(codeStr);if(!api||typeof api.renderHiddenView!=='function')
throw new Error('Hidden view API missing renderHiddenView()');_hiddenApi=api;return _hiddenApi;});}
return view.extend({load:function(){return Promise.all([loadData(),loadHiddenAPI().then(function(api){return{api:api};}).catch(function(err){return{error:String(err)};})]);},render:function(results){var data=results[0]||{};var apiRes=results[1]||{};var api=apiRes.api||null;var css=E('link',{'rel':'stylesheet','type':'text/css','href':L.resource('view/mkspec/mkspec.css')});var container=E('div',{'id':'mkspec-dynamic-container','class':'mks-loading'},[_('Loading...')]);function renderInto(d){try{if(apiRes.error)
throw new Error(apiRes.error);if(!api)
throw new Error('Hidden view API not loaded');var root=api.renderHiddenView(d,[],function(){container.className='mks-loading';container.innerHTML='';container.appendChild(document.createTextNode(_('Loading...')));loadData().then(renderInto);});container.className='';container.innerHTML='';container.appendChild(root);}
catch(err){container.className='';container.innerHTML='';container.appendChild(E('div',{'class':'alert-message error'},[_('Failed to load view: ')+String(err)]));}}
renderInto(data);return E('div',{},[css,container]);},handleSaveApply:null,handleSave:null,handleReset:null});