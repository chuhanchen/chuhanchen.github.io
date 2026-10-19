(function () {
  'use strict';
  if (!window.CJNative) return;
  var counter = 0;
  var pending = {};
  window.CJNativeResult = function (id, result) {
    var item = pending[id];
    if (!item) return;
    delete pending[id];
    clearTimeout(item.timer);
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch (e) { result = {ok:false,error:'网络响应格式异常'}; }
    }
    item.resolve(result);
  };
  window.CJHost = {
    platform: 'android',
    version: '3.0',
    request: function (url, kind) {
      return new Promise(function (resolve) {
        var id = 'r' + (++counter);
        pending[id] = {
          resolve: resolve,
          timer: setTimeout(function () {
            if (!pending[id]) return;
            delete pending[id];
            resolve({ok:false,url:url,status:0,error:'网络较慢，请稍后重试'});
          }, 55000)
        };
        try { window.CJNative.request(id, String(url), kind || 'text'); }
        catch (e) {
          clearTimeout(pending[id].timer);
          delete pending[id];
          resolve({ok:false,url:url,status:0,error:'网络连接未就绪'});
        }
      });
    },
    openExternal: function (url) { window.CJNative.openExternal(String(url)); },
    clearNetworkCache: function () { window.CJNative.clearNetworkCache(); }
  };
}());
