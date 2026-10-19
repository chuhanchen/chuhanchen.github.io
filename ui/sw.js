'use strict';
const CACHE='chenjiang-v4-editorial-3';
const SHELL=['/','/index.html','/style.css','/host.js','/config.js','/seed.js','/app.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);await cache.addAll(SHELL);
  const response=await fetch('/seed-assets.json'),assets=await response.json();let next=0;
  await Promise.all(Array.from({length:3},async()=>{while(next<assets.length)await cache.add(assets[next++]);}));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chenjiang-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname==='/api/health')return;
  if(url.pathname==='/api/edition'||url.pathname==='/api/edition.json'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{const response=await fetch(req);if(response.ok)await cache.put(url.pathname,response.clone());return response;}
      catch(e){const old=await cache.match(url.pathname);if(!old)throw e;const headers=new Headers(old.headers);headers.set('x-cj-offline','1');return new Response(await old.arrayBuffer(),{status:200,headers});}
    })());return;
  }
  if(url.pathname.startsWith('/media/')||url.pathname.startsWith('/assets/')){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);const old=await cache.match(req);if(old)return old;const response=await fetch(req);if(response.ok){await cache.put(req,response.clone());const keys=await cache.keys();const media=keys.filter(k=>new URL(k.url).pathname.startsWith('/media/'));if(media.length>300)await Promise.all(media.slice(0,media.length-300).map(k=>cache.delete(k)));}return response;})());return;
  }
  event.respondWith((async()=>{try{const response=await fetch(req);if(response.ok&&(SHELL.includes(url.pathname)||url.pathname==='/seed-assets.json')){const cache=await caches.open(CACHE);await cache.put(req,response.clone());}return response;}catch{return caches.match(req);}})());
});
