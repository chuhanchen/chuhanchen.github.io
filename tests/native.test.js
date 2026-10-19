'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validOrigin,edition,image}=require('../native/windows/src/content');
test('尚无更新地址时直接提供本地阅读，不等待原站请求',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cj-native-'));
  fs.writeFileSync(path.join(dir,'content-source.json'),JSON.stringify({origin:''}));
  try{const start=Date.now();const r=await edition(dir,'');assert.equal(r.ok,false);assert.ok(Date.now()-start<100);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('更新地址限定 HTTPS 根地址，不能接收凭证、本机 IP 或脚本',()=>{
  assert.equal(validOrigin('https://reader.github.io/'),'https://reader.github.io');
  for(const bad of ['http://reader.github.io/','https://127.0.0.1/','https://user:secret@reader.github.io/','javascript:alert(1)','https://reader.github.io/other/'])assert.throws(()=>validOrigin(bad));
});
test('图片离线缓存命中时不进行 DNS 或联网，路径不能越过图片目录',async()=>{
  const crypto=require('node:crypto');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cj-images-'));
  try{
    fs.writeFileSync(path.join(dir,'content-source.json'),JSON.stringify({origin:'https://reader.github.io/'}));
    fs.mkdirSync(path.join(dir,'prepared-images'));
    const p='/media/'+'a'.repeat(64)+'.jpg';
    const key=crypto.createHash('sha256').update('https://reader.github.io'+p).digest('hex');
    fs.writeFileSync(path.join(dir,'prepared-images',key+'.jpg'),'cached-fixture');
    assert.equal((await image(dir,p)).bytes.toString(),'cached-fixture');
    await assert.rejects(()=>image(dir,'/media/../../secret'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
