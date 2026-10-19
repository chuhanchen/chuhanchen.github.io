/* 辰江网络杂志：公开频道直链 + 正文容器解析。ES5，可在离线 WebView/IE11 中运行。
 * 不运行来源网页脚本，不使用热词搜索冒充文章，不把整个网页当正文。
 */
(function (root) {
  'use strict';
  var C = {};
  C.version = '3.0.0';
  function dailyPick(list, salt) {
    var d=new Date(),key=d.getFullYear()*400+(d.getMonth()+1)*31+d.getDate()+salt;
    return list[Math.abs(key)%list.length];
  }
  function searchUrl(word) { return 'https://news.so.com/ns?q='+encodeURIComponent(word); }
  C.sources = [
    {id:'ifeng-news',name:'凤凰资讯',channel:'news',url:'https://news.ifeng.com/'},
    {id:'guancha',name:'观察者网',channel:'news',url:'https://www.guancha.cn/'},
    {id:'toutiao-hot',name:'今日头条热榜',channel:'news',url:'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc'},
    {id:'chinanews-news',name:'中国新闻网',channel:'news',url:'https://www.chinanews.com.cn/scroll-news/news1.html',filter:'news'},
    {id:'ifeng-mil',name:'凤凰军事',channel:'military',url:'https://mil.ifeng.com/'},
    {id:'so360-military',name:'360新闻精选',channel:'military',url:searchUrl(dailyPick(['抗美援朝 战史','解放战争 野战军','二野 三野 华野','抗日战争 历史','共和国 国防 军史','长征 红军 战史'],11))},
    {id:'ifeng-history',name:'凤凰历史',channel:'history',url:'https://history.ifeng.com/'},
    {id:'so360-history',name:'360新闻精选',channel:'history',url:searchUrl(dailyPick(['民国 历史 人物','共和国 历史 往事','毛泽东 周恩来 历史','改革开放 历史','两弹一星 科学家','近代中国 历史'],23))},
    {id:'ifeng-ent',name:'凤凰娱乐',channel:'culture',url:'https://ent.ifeng.com/'},
    {id:'so360-culture',name:'360新闻精选',channel:'culture',url:searchUrl(dailyPick(['刀郎 演唱会','刘德华 周润发 近况','赵本山 陈道明 李雪健','经典电影 电视剧','春晚 相声 戏曲','乒乓球 足球 文体'],37))},
    {id:'chinanews-culture',name:'中新网文娱生活',channel:'culture',url:'https://www.chinanews.com.cn/scroll-news/news1.html',filter:'culture'}
  ];
  function trim(s) { return String(s || '').replace(/\s+/g,' ').replace(/^\s+|\s+$/g,''); }
  function txt(el) { return trim(el ? el.textContent || el.innerText || '' : ''); }
  function hash(s) { var h=2166136261,i; for(i=0;i<s.length;i++){h^=s.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return ('00000000'+(h>>>0).toString(16)).slice(-8); }
  function absolute(u,base) {
    u=trim(u).replace(/&amp;/g,'&');
    if(!u || /^(?:javascript|data|vbscript|file|blob):/i.test(u)) return '';
    if(/^\/\//.test(u)) return 'https:'+u;
    if(/^https?:\/\//i.test(u)) return u.replace(/^http:\/\//i,'https://');
    var m=String(base||'').match(/^(https?):\/\/([^/]+)/i);if(!m) return '';
    if(u.charAt(0)==='/') return 'https://'+m[2]+u;
    return String(base).replace(/[?#].*$/,'').replace(/[^/]*$/,'')+u;
  }
  function dom(html) {
    var d=document.implementation.createHTMLDocument('');
    /* Remove active and networking tags before detached DOM parsing. */
    html=String(html||'').replace(/<(script|style|iframe|object|embed|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(?:link|base)\b[^>]*>/gi,'');
    d.documentElement.innerHTML=html;
    return d;
  }
  function query(d,selectors) { var i,e;for(i=0;i<selectors.length;i++){try{e=d.querySelector(selectors[i]);if(e)return e;}catch(ignore){}}return null; }
  function attr(el,key) {return el&&el.getAttribute(key)||'';}
  function imageUrl(el,base) {
    if(!el)return '';
    var keys=['data-original','data-src','data-lazy-src','data-url','src'],i,u='';
    for(i=0;i<keys.length;i++){u=absolute(attr(el,keys[i]),base);if(u&&!/\.(?:gif|svg)(?:\?|$)/i.test(u)&&!/blank|spacer|loading|logo|icon|qrcode|qr_code/i.test(u))return u;}
    return '';
  }
  function trustedArticleUrl(u) {
    var m=String(u||'').match(/^https?:\/\/([^/:?#]+)/i),host=m?m[1].toLowerCase():'';
    var ok=['ifeng.com','guancha.cn','chinanews.com.cn','chinanews.com','people.com.cn','news.cn','xinhuanet.com','cctv.com','cnr.cn','mod.gov.cn','81.cn','sina.com.cn','sina.cn','163.com','sohu.com','qq.com','huanqiu.com','thepaper.cn','gmw.cn','qstheory.cn'];
    for(var i=0;i<ok.length;i++)if(host===ok[i]||host.slice(-(ok[i].length+1))==='.'+ok[i])return true;
    return false;
  }
  function articleUrl(u) {
    return /^https:\/\/(?:[a-z0-9-]+\.)?ifeng\.com\/c\/[a-zA-Z0-9]+(?:[?#].*)?$/.test(u) && !/\/v\.ifeng\.com\//.test(u) ||
      /^https:\/\/(?:www\.)?chinanews\.com(?:\.cn)?\/[^/]+\/\d{4}\/\d{2}-\d{2}\/\d+\.shtml(?:[?#].*)?$/.test(u) ||
      /^https:\/\/(?:www\.)?guancha\.cn\/[A-Za-z\u00C0-\uFFFF·_-]+\/\d{4}_\d{2}_\d{2}_\d+(?:_s)?\.shtml(?:[?#].*)?$/.test(u);
  }
  C.parseList=function(source,html,finalUrl) {
    if(typeof source==='string'){var sid=source;source=null;for(var si=0;si<C.sources.length;si++)if(C.sources[si].id===sid)source=C.sources[si];}
    source=source||{};
    if(source.id==='toutiao-hot'){
      var json,rows=[],ti;
      try{json=JSON.parse(String(html||''));}catch(ignore){return rows;}
      var data=json.data||[];
      for(ti=0;ti<data.length&&rows.length<18;ti++){
        var hot=data[ti],title=trim(hot.Title||hot.title),cover=absolute(hot.LabelUrl||(hot.Image&&hot.Image.url)||'',source.url);
        if(title.length<6||C.rejectTitle(title))continue;
        rows.push({id:hash('toutiao:'+title),title:title,url:'',cover:cover,source:'待核对原文',channel:C.classify(title,'news'),published:'',discovery:'今日头条热榜',resolveUrl:searchUrl(title),hot:+(hot.HotValue||0)});
      }
      return rows;
    }
    var base=finalUrl||source.url||'',d=dom(html),out=[],seen={},i,a,u,t,img,par,j,item;
    if(source.id&&source.id.indexOf('so360-')===0){
      var results=d.querySelectorAll('li.res-list[data-url],li[class*="res-list"][data-url]');
      for(i=0;i<results.length&&out.length<30;i++){
        var row=results[i];u=absolute(attr(row,'data-url'),base).replace(/[?#].*$/,'');
        if(!trustedArticleUrl(u))continue;
        a=query(row,['a[title]','h3 a','a[href]']);t=trim(attr(a,'title'))||txt(query(row,['h3','.g-title']));
        img=query(row,['img.g-img','img']);
        if(t.length<8||C.rejectTitle(t))continue;
        out.push({id:hash(u),title:t,url:u,cover:imageUrl(img,base),source:source.name,channel:source.channel,published:'',discovery:'360新闻精选'});
      }
      return out;
    }
    var aa=d.querySelectorAll('a[href]');
    for(i=0;i<aa.length;i++){
      a=aa[i];u=absolute(attr(a,'href'),base).replace(/[?#].*$/,'');if(!articleUrl(u))continue;
      if(source.id==='guancha')u=u.replace(/(_s)?\.shtml$/, '_s.shtml');
      if(source.filter==='news'&&!/\/(?:gn|gj|cj|sh)\//.test(u))continue;
      if(source.filter==='culture'&&!/\/(?:cul|yl|sh|ty)\//.test(u))continue;
      t=trim(attr(a,'title'))||txt(query(a,['h1','h2','h3','h4']))||txt(a);img=query(a,['img']);
      if(!t&&img)t=trim(attr(img,'alt'));
      if(t.length<8||t.length>150||/^(?:播放|直播|更多|打开|下载)/.test(t)||C.rejectTitle(t))continue;
      var cover=imageUrl(img,base);par=a.parentNode;
      for(j=0;j<3&&!cover&&par&&par!==d.body;j++,par=par.parentNode){
        var links=par.querySelectorAll('a[href]'),li;if(links.length>8)break;for(li=0;li<links.length&&!cover;li++){if(absolute(attr(links[li],'href'),base).replace(/[?#].*$/,'')===u)cover=imageUrl(query(links[li],['img']),base);}
      }
      if(seen[u]!==undefined){item=out[seen[u]];if(!item.cover&&cover)item.cover=cover;if(item.title.length<t.length)item.title=t;continue;}
      seen[u]=out.length;
      out.push({id:hash(u),title:t,url:u,cover:cover,source:source.name||'新闻来源',channel:C.classify(t,source.channel||'news'),published:'',discovery:source.name||''});
    }
    return out.slice(0,60);
  };
  function normTitle(s){return trim(s).toLowerCase().replace(/[\s\-—_，。！？、；：,.!?;:（）()【】\[\]《》<>“”‘’'"·|/\\~`@#$%^&*+=]+/g,'').replace(/(最新消息|现场|视频|独家|突发|回应|发声)/g,'');}
  function bigrams(s){var o={},i;if(s.length<2){o[s]=1;return o;}for(i=0;i<s.length-1;i++)o[s.slice(i,i+2)]=1;return o;}
  function titleSimilarity(a,b){
    a=normTitle(a);b=normTitle(b);if(!a||!b)return 0;if(a.indexOf(b)>=0||b.indexOf(a)>=0)return Math.min(a.length,b.length)/Math.max(a.length,b.length)+.35;
    var x=bigrams(a),y=bigrams(b),hit=0,total=0,k;for(k in x){total++;if(y[k])hit++;}for(k in y)if(!x[k])total++;return total?hit/total:0;
  }
  C.resolveDiscovery=function(item,html,finalUrl){
    var fake={id:'so360-resolve',name:'360新闻',channel:item.channel,url:finalUrl||item.resolveUrl};
    var list=C.parseList(fake,html,finalUrl||item.resolveUrl),best=null,bestScore=0,i,s;
    /* parseList's special branch keys on id prefix. */
    if(!list.length){fake.id='so360-resolve-x';list=C.parseList(fake,html,finalUrl||item.resolveUrl);}
    for(i=0;i<list.length;i++){s=titleSimilarity(item.title,list[i].title);if(s>bestScore){bestScore=s;best=list[i];}}
    if(!best||bestScore<.38)return null;
    best.channel=item.channel||best.channel;best.discovery=item.discovery||'今日头条热榜';best.hot=item.hot||0;best.matchedTitle=item.title;return best;
  };
  function metadata(d,name) {
    var e=query(d,['meta[property="'+name+'"]','meta[name="'+name+'"]']);return attr(e,'content');
  }
  function skipNode(n) {
    if(n.nodeType!==1)return false;
    var tag=n.tagName.toLowerCase(),cl=String(n.className||'')+' '+attr(n,'id');
    return /^(?:script|style|noscript|iframe|video|audio|input|button|form|nav|aside|footer|table)$/.test(tag)||/adInContent|adEditor|left_name|function_code_page|share|recommend|related|comment|copyRight|copyright|download|index_video|index_end|index_follow|channel|erweima|qrcode/i.test(cl);
  }
  function cleanText(s) {return trim(s).replace(/【编辑[：:][^】]*】/g,'').replace(/^\s*【?责任编辑[：:][^】]*】?$/,'');}
  function junk(s) {
    return !s||/^(?:更多精彩内容请进入|特别声明[：:]|免责声明[：:]|Notice: The content above|【?责任编辑[：:]|【?编辑[：:])/i.test(s) || /^(?:相关新闻|相关推荐|推荐阅读|分享至|返回首页|广告|举报)$/.test(s) || (s.length<55&&/^(?:打开|下载|扫码|长按|点击|关注).*(?:客户端|APP|App|公众号|二维码|阅读全文|更多新闻|凤凰新闻)/.test(s));
  }
  C.extract=function(html,url) {
    var d=dom(html),title=txt(query(d,['h1'])),host=(String(url).match(/^https?:\/\/([^/]+)/)||[])[1]||'',container=null,kind='';
    if(/(?:^|\.)ifeng\.com$/i.test(host)){
      container=query(d,['section[aria-label="正文"]','[class*="index_main_content_"]','[class*="main_content"]']);kind='ifeng';
    }else if(/(?:^|\.)guancha\.cn$/i.test(host)){
      container=query(d,['.all-txt','.left-main .content']);kind='guancha';
      if(!title)title=txt(query(d,['.left-main > h3','.left-main h3']));
    }else if(/(?:^|\.)chinanews\.com(?:\.cn)?$/i.test(host)){
      container=query(d,['.left_zw','.content_maincontent_content','.left_zw2']);kind='chinanews';
    }
    /* Semantic article fallback only; never use body/full-page density extraction. */
    if(!container){container=query(d,['article[itemprop="articleBody"]','[itemprop="articleBody"]','article','#artibody','#mp-editor','#endText','.post_body','.post_content','.article-content','.content-article','#ArticleContent','.rm_txt_con','.show_text','#detail']);kind='semantic';}
    if(!title)title=metadata(d,'og:title')||txt(query(d,['title'])).replace(/[_-](?:凤凰网|中新网).*$/,'');
    var blocks=[],images={},lastText='',textLength=0;
    function addText(s,type){s=cleanText(s);if(junk(s)||s===lastText)return;blocks.push({type:type||'p',text:s});textLength+=s.length;lastText=s;}
    function walk(n){
      if(n.nodeType!==1||skipNode(n))return;
      var tag=n.tagName.toLowerCase(),i,ch,s,src,hasBlock=false,buffer='';
      if(tag==='img'){
        src=imageUrl(n,url);if(src&&!images[src]){images[src]=1;blocks.push({type:'image',src:src,alt:trim(attr(n,'alt')).replace(/^图片$/,'')});}return;
      }
      if(/^(?:p|h2|h3|h4|figcaption|blockquote|li)$/.test(tag)){
        /* Flush inline text around image/block nodes in DOM order. */
        function flush(){if(buffer){addText(buffer,/^h/.test(tag)?'h2':(tag==='figcaption'||/picIntro|caption/i.test(String(n.className||''))?'caption':'p'));buffer='';}}
        function inline(el){
          if(el.nodeType===3){buffer+=el.nodeValue;return;}
          if(el.nodeType!==1||skipNode(el))return;
          var tg=el.tagName.toLowerCase(),k;
          if(tg==='img'){flush();walk(el);return;}
          if(tg==='br'){buffer+='\n';return;}
          if(/^(?:p|div|h2|h3|h4|figure|figcaption|blockquote|ul|ol)$/.test(tg)){flush();walk(el);return;}
          for(k=0;k<el.childNodes.length;k++)inline(el.childNodes[k]);
        }
        for(i=0;i<n.childNodes.length;i++)inline(n.childNodes[i]);flush();return;
      }
      for(i=0;i<n.childNodes.length;i++){ch=n.childNodes[i];if(ch.nodeType===1){hasBlock=true;walk(ch);}}
      if(!hasBlock&&/^(?:div|section)$/.test(tag)){s=txt(n);if(s.length>25)addText(s);}
    }
    if(container)walk(container);
    /* Tiny, very wide signature strips at the end are publisher footers, not story photographs. */
    while(blocks.length&&blocks[blocks.length-1].type==='image'){var dim=blocks[blocks.length-1].src.match(/_w(\d+)_h(\d+)/i);if(dim&&Number(dim[2])<180&&Number(dim[1])/Number(dim[2])>6)blocks.pop();else break;}
    var time=query(d,['time[datetime]']),published=attr(time,'datetime')||metadata(d,'article:published_time')||metadata(d,'pubdate')||metadata(d,'publishdate');
    if(!published){var tm=txt(query(d,['.content_left_time','.left-t','.time'])).match(/\d{4}[年-]\d{1,2}[月-]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);if(tm)published=tm[0];}
    var byline=txt(query(d,['[rel="medianame"]','[class*="sourceTitleText"]']))||metadata(d,'source')||(/ifeng\.com/.test(host)?'凤凰网':/chinanews/.test(host)?'中国新闻网':/guancha/.test(host)?'观察者网':host);
    var cover=absolute(metadata(d,'og:image'),url),firstImage='';for(var bi=0;bi<blocks.length;bi++)if(blocks[bi].type==='image'){firstImage=blocks[bi].src;break;}
    if(!cover)cover=firstImage;
    var valid=!!container&&textLength>=100&&blocks.length>=2&&title.length>=4;
    return {id:hash(url||title),title:title,byline:byline,source:byline,url:url,cover:cover,blocks:blocks,textLength:textLength,published:published,valid:valid,parser:kind,error:valid?'':'正文不足或来源未提供可提取文章'};
  };
  C.rejectTitle=function(title){
    title=String(title||'');
    return /(彩票|博彩|双色球|大乐透|股票代码|证券代码|产品服务发布会|新品发布会|招商加盟|优惠券|限时抢|直播带货|购车补贴|基金净值)/.test(title)||/(发布|推出).{0,12}(新产品|新品|品牌计划)/.test(title)||/(银行|保险|基金).{0,16}(产品|服务发布|营销活动)/.test(title);
  };
  C.classify=function(title,fallback){
    title=String(title||'');
    if(/(抗美援朝|抗日|解放战争|二野|三野|华野|野战军|长征|红军|八路军|新四军|战役|战史|军史|航母|导弹|战机|军演|国防|美军|俄军|胡塞|伊朗|台海)/.test(title))return'military';
    if(/(民国|共和国|近代史|党史|毛泽东|周恩来|邓小平|刘少奇|朱德|彭德怀|粟裕|林彪|陈毅|两弹一星|改革开放|历史往事)/.test(title))return'history';
    if(/(刀郎|刘德华|周润发|赵本山|陈道明|李雪健|成龙|演员|电影|电视剧|演唱会|歌手|春晚|相声|戏曲|票房|乒乓|足球|文娱|文化|非遗)/.test(title))return'culture';
    return fallback||'news';
  };
  C.score=function(item){
    var t=String(item.title||''),s=item.cover?14:0;
    if(item.discovery==='今日头条热榜')s+=20+Math.min(10,Math.log((item.hot||1)+1));
    if(item.discovery==='360新闻精选')s+=12;
    if(/观察者/.test(item.source||item.discovery||''))s+=10;
    if(/(马杜罗|法国|俄罗斯|乌克兰|美国|中美|国际|外交|总统|抗美援朝|抗日|解放战争|二野|三野|华野|野战军|民国|共和国|毛泽东|周恩来|邓小平|两弹一星|刀郎|刘德华|周润发|赵本山|陈道明|李雪健)/.test(t))s+=22;
    if(C.rejectTitle(t))s-=100;return s;
  };
  C.hash=hash;C.absoluteUrl=absolute;C.isArticleUrl=articleUrl;C.cleanText=cleanText;C.titleSimilarity=titleSimilarity;C.trustedArticleUrl=trustedArticleUrl;
  root.CJContent=C;
}(typeof window!=='undefined'?window:this));
