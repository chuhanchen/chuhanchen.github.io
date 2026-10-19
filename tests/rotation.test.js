'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {pick}=require('../ui/rotation');
test('换批优先未展示和未读，文章充足时避开上一批，轮读后仍可继续',()=>{
  const articles=Array.from({length:12},(_,i)=>({id:'a'+i}));
  const first=pick(articles,6,{read:['a0','a1']});
  assert.equal(first.length,6);assert.ok(first.every(a=>!['a0','a1'].includes(a.id)));
  const ids=first.map(a=>a.id),second=pick(articles,6,{previous:ids,shown:ids});
  assert.ok(second.every(a=>!ids.includes(a.id)));
  const tiny=pick(articles.slice(0,1),6,{previous:['a0'],shown:['a0'],read:['a0']});
  assert.deepEqual(tiny,[articles[0]]);
});
test('离线或网络尚未返回时立即换文章，连续点击只保留一个更新请求',async()=>{
  const root=path.resolve(__dirname,'../ui');
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://reader.example/',runScripts:'outside-only'});
  const w=dom.window;let calls=0;
  w.scrollTo=()=>{};w.performance.mark=()=>{};
  w.CJHost={edition:()=>{calls++;return new Promise(()=>{});}};
  w.CJ_SEED=['news','military','history','culture'].flatMap(channel=>Array.from({length:6},(_,i)=>({id:channel+i,title:channel+'人物往事'+i,url:'https://example.com/'+channel+i,channel,selectionVersion:2,complete:true,blocks:[{type:'p',text:'完整正文内容。'.repeat(30)},{type:'p',text:'另一段完整正文。'.repeat(30)}]})));
  try{
    for(const file of ['rotation.js','app.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
    await new Promise(r=>setTimeout(r,0));
    const visible=()=>Array.from(w.document.querySelectorAll('[data-article]')).map(el=>el.dataset.article);
    const first=visible();assert.equal(first.length,12);
    w.document.getElementById('refresh').click();
    const second=visible();assert.equal(second.length,12);assert.ok(second.every(id=>!first.includes(id)));
    w.document.getElementById('refresh').click();assert.equal(calls,1);
    w.document.querySelector('[data-channel="culture"]').click();
    const culture=visible();assert.equal(culture.length,3);
    w.document.querySelector('[data-show-all]').click();assert.equal(visible().length,6);
    w.document.getElementById('refresh').click();assert.equal(visible().length,3);
  }finally{w.close();}
});
