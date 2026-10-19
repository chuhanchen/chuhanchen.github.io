'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {extract,diversify,score,parseList,SOURCES}=require('../service/sources');
const {evaluate,eligibleCandidate}=require('../service/editorial');
const {createCipheriv}=require('node:crypto');
const paragraph='这是有独立信息的正文段落，讨论近代中国历史的材料、人物与事件，并保留原作者的叙述。'.repeat(3);
test('正文保留含编辑的正常段落及穿插配图，排除容器外推荐',()=>{
  const html='<h1>近代历史的材料与人物</h1><article><p>'+paragraph+'</p><img src="https://img.guancha.cn/photo.jpg"><p>这份史料后来由编辑整理发表。'+paragraph+'</p><p>'+paragraph+'第三段</p></article><aside><p>相关推荐：广告购买</p></aside>';
  const a=extract(html,'https://www.guancha.cn/history/2026_10_19_1.shtml');
  assert.equal(a.valid,true);assert.deepEqual(a.blocks.map(b=>b.type),['p','image','p','p']);
  assert.ok(a.blocks[2].text.includes('编辑整理'));assert.ok(!JSON.stringify(a).includes('广告购买'));
});
test('搜狐无法解析的图片使整篇不上架，避免交付缺图正文',()=>{
  const a=extract('<h1>历史材料考证与分析</h1><article id="mp-editor"><p>'+paragraph+'</p><img data-src="EmSa7bvKq1EE4aebFHMv9xnHAAXkp7olCN6zoX7CqP+JFreV=="><p>'+paragraph+'二</p><p>'+paragraph+'三</p></article>','https://www.sohu.com/a/123_456');
  assert.equal(a.valid,false);assert.equal(a.unsupportedImages,1);
});
test('搜狐公开阅读器配图解码后保留位置、原作者和原日期',()=>{
  const encode=url=>{const cipher=createCipheriv('aes-128-ecb',Buffer.from('www.sohu.com6666'),null);return Buffer.concat([cipher.update(url),cipher.final()]).toString('base64');};
  const a=extract('<meta name="mediaid" content="独立作者"><h1>一位演员的往事</h1><span id="news-time">2023-04-13 23:34</span><article id="mp-editor"><p>'+paragraph+'</p><img data-src="'+encode('//q0.itc.cn/first.jpg')+'"><p>'+paragraph+'二</p><img data-src="'+encode('https://p1.itc.cn/second.jpg')+'"><p>'+paragraph+'三</p></article>','https://www.sohu.com/a/123_456');
  assert.equal(a.valid,true);assert.equal(a.source,'独立作者');assert.equal(a.published,'2023-04-13 23:34');
  assert.deepEqual(a.blocks.map(b=>b.type),['p','image','p','image','p']);assert.equal(a.blocks[1].src,'https://q0.itc.cn/first.jpg');assert.equal(a.unsupportedImages,0);
});
test('文娱选人物故事和作品解读，不能让文旅通稿补位',()=>{
  for(const title of ['“世界瓷都”福建德化力推陶瓷历史经典产业高质量发展','网球名将莱巴金娜再续宁波前缘：畅游东钱湖 赏宋韵文化','人这一辈子，一定要去一趟良渚！','2026天府书展：一纸文学，串联古今中外']){
    assert.equal(evaluate({title,channel:'culture',textLength:2000}).eligible,false,title);
    assert.equal(eligibleCandidate({title,channel:'culture'}),false,title);
  }
  for(const title of ['一位歌手的隐退往事','《西游记》选角花絮，邂逅何晴，错过刘晓庆，捧红李玲玉','费玉清：告别初恋后终生未娶','独家观察：十岁的平遥还能为中国电影填充哪些可能？答案在路上'])assert.equal(evaluate({title,channel:'culture',textLength:2000}).eligible,true,title);
  assert.equal(evaluate({title:'金鸡奖提名名单公布',channel:'culture',textLength:2000}).eligible,false);
  const analysis={title:'局势变化背后，谁在改变战略？',channel:'news',textLength:2000};
  assert.ok(score(analysis)>score({title:'某地今日发生一起事件',channel:'news',textLength:2000}));
});
test('360公开正文数据只解码JSON，不执行来源脚本',()=>{
  const state={result:{Detail:{title:'隐蔽战线上的历史人物',content:'<p>'+paragraph+'</p><img src="https://p0.img.360kuai.com/photo.jpg"><p>'+paragraph+'二</p><p>'+paragraph+'三</p>',s:'t',src:'历史作者',pub_time:1783841202000}}};
  const base=Buffer.from(JSON.stringify(state)).toString('base64');
  const encoded=base.slice(0,1000).split('').map((c,i)=>String.fromCharCode(c.charCodeAt(0)+i%2)).join('')+base.slice(1000);
  const a=extract('<script>window.__INITIAL_DATA__=\''+encoded+'\';throw new Error("不能执行我");</script>','https://www.360kuai.com/9fda3257e3465d83d');
  assert.equal(a.valid,true);assert.equal(a.title,state.result.Detail.title);assert.equal(a.source,'历史作者');assert.equal(a.blocks[1].type,'image');
});
test('头条热榜作为热点信号，保留话题出处，不能成为无正文卡片',()=>{
  const out=parseList(SOURCES[0],JSON.stringify({data:[{Title:'一条需要原文核对的新闻',Url:'https://www.toutiao.com/trending/123/',HotValue:'100'}]}));
  assert.equal(out.length,1);assert.equal(out[0].discovery,'今日头条热榜');assert.equal(out[0].blocks,undefined);
});
test('推荐覆盖四栏且抑制单个平台占满，不写死示例国家人物的加分',()=>{
  const articles=[];for(const platform of ['ifeng','guancha','chinanews','360'])for(const channel of ['news','military','history','culture'])for(let i=0;i<(platform==='ifeng'?8:2);i++)articles.push({id:platform+channel+i,platform,channel,title:'独立文章标题'+i,cover:'/media/photo.jpg'});
  const out=diversify(articles,100),counts=out.reduce((m,a)=>(m[a.platform]=(m[a.platform]||0)+1,m),{});
  assert.equal(new Set(out.map(a=>a.channel)).size,4);assert.equal(new Set(out.map(a=>a.id)).size,out.length);
  assert.ok(counts.ifeng/out.length<=.45);assert.equal(score({title:'马杜罗与法国',channel:'news'}),score({title:'其他地区的消息',channel:'news'}));
});
test('整期普通新闻至多两成，文娱单一作者不能填满栏目',()=>{
  const items=Array.from({length:30},(_,i)=>({id:'brief'+i,platform:'ifeng',channel:'news',genre:'新闻动态',title:'事件进展'+i}));
  for(let i=0;i<12;i++)items.push({id:'story'+i,platform:'sohu',channel:'culture',title:'歌手的隐退往事'+i,textLength:2000,byline:i<8?'作者甲':'作者'+i,genre:'人物与往事'});
  const out=diversify(items,100);
  assert.ok(out.filter(a=>a.genre==='新闻动态').length/out.length<=.2);
  assert.ok(out.filter(a=>a.byline==='作者甲').length<=3);
});
test('作者主页只读标题，不把简介拼进标题；百年中国排除古代轶闻',()=>{
  const source=SOURCES.find(a=>a.id==='sohu-people');
  const list=parseList(source,'<a href="//www.sohu.com/a/12345678_12345"><div class="item-text-content-title">一位演员的成名往事</div><div class="item-text-content-description">这里是文章简介</div></a>');
  assert.equal(list[0].title,'一位演员的成名往事');
  assert.equal(evaluate({title:'汉武帝时期，太子刘据起兵造反，为什么没有成功？',channel:'history',textLength:2000}).eligible,false);
});
