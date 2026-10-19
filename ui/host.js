(function(){
  'use strict';
  if(window.CJHost&&window.CJHost.edition)return;
  var etag='';
  // Reading receives a prepared edition. There is no source-page fetching API here.
  window.CJHost={
    edition:async function(revision){
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},8000);
      try{
        var url=(window.CJ_CONFIG&&CJ_CONFIG.editionUrl)||'/api/edition';
        var response=await fetch(url,{signal:controller.signal,headers:revision?{'If-None-Match':etag||'"'+revision+'"'}:{}});
        if(response.status===304)return{ok:true,unchanged:true};
        if(!response.ok)throw new Error('暂时无法更新');
        etag=response.headers.get('etag')||'';
        var length=Number(response.headers.get('content-length')||0);if(length>4*1024*1024)throw new Error('本期内容过大');
        return{ok:true,data:await response.json(),stale:response.headers.get('x-cj-offline')==='1'};
      }catch(e){return{ok:false,error:e.message};}finally{clearTimeout(timer);}
    },
    openExternal:function(url){if(!/^https:\/\//.test(url))return;if(window.CJNative&&CJNative.openExternal)CJNative.openExternal(url);else window.open(url,'_blank','noopener,noreferrer');}
  };
})();
