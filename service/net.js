'use strict';
const { createHash } = require('node:crypto');
const DOMAINS = ['ifeng.com','ifengimg.com','ifengpic.com','guancha.cn','guanchaimg.cn',
  'chinanews.com.cn','chinanews.com','cnsphoto.com','sohu.com','itc.cn','sohucs.com',
  '360.com','360kuai.com','360.cn','qhimg.com','qhimgs.com','360kxs.com','look.360.cn','dhrest.com',
  'toutiao.com','toutiaoimg.com','byteimg.com','pstatp.com','people.com.cn','news.cn',
  'xinhuanet.com','cctv.com','cnr.cn','sina.com.cn','sina.cn','sinaimg.cn','163.com',
  '126.net','qq.com','gtimg.com','qpic.cn','huanqiu.com','thepaper.cn','gmw.cn','81.cn','mod.gov.cn'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
function allowed(value) {
  const u = new URL(value);
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password ||
      (u.port && !['80','443'].includes(u.port)) ||
      !DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.'+d))) throw new Error('来源地址不受支持');
  u.protocol = 'https:'; u.hash = ''; return u;
}
async function request(value, {image=false, timeout=8000, signal}={}) {
  let u=allowed(value);
  const deadline=AbortSignal.timeout(timeout);
  const combined=signal ? AbortSignal.any([deadline,signal]) : deadline;
  for(let redirects=0;redirects<5;redirects++) {
    const r=await fetch(u, {redirect:'manual',signal:combined,headers:{
      'user-agent':UA,'accept-language':'zh-CN,zh;q=0.9',
      accept:image?'image/*':'text/html,application/json;q=0.9,*/*;q=0.5',referer:u.origin+'/'
    }});
    if([301,302,303,307,308].includes(r.status)) {
      await r.body?.cancel(); u=allowed(new URL(r.headers.get('location'),u)); continue;
    }
    if(!r.ok){await r.body?.cancel();throw new Error('HTTP '+r.status);}
    const chunks=[];let size=0,limit=image?8*1024*1024:3*1024*1024;
    for await(const chunk of r.body){size+=chunk.length;if(size>limit)throw new Error('来源文件过大');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks),mime=r.headers.get('content-type')||'';
    if(image && !/^image\/(?:jpeg|png|webp|gif|avif)/i.test(mime))throw new Error('不是可用图片');
    const head=bytes.subarray(0,3000).toString('latin1');
    let charset=(/charset\s*=\s*["']?([\w-]+)/i.exec(mime+' '+head)||[])[1]||'utf-8';
    if(/gbk|gb2312/i.test(charset))charset='gb18030';
    return {url:u.href,bytes,mime,text:image?'':new TextDecoder(charset).decode(bytes)};
  }
  throw new Error('跳转次数过多');
}
async function pool(items,concurrency,fn){let next=0;const out=new Array(items.length);await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}}));return out;}
const hash=s=>createHash('sha256').update(s).digest('hex');
module.exports={allowed,request,pool,hash};
