'use strict';
// Select the kind of reading before considering recency, platform or extractability.
// These are genres, not a list of celebrities the reader is allowed to see.
const PROMO=/文旅|推介会|推介活动|招商|启动仪式|开幕式|启幕|盛大开幕|高质量发展|赋能|新质生产力|共探|共话|力推.{0,12}产业|生日快乐|人这一辈子.{0,8}一定要去|畅游.{0,12}赏|书展|典籍对外开放|博物馆.{0,15}(亮相|点亮|开展)|复烧点火/;
const PEOPLE=/演员|歌手|导演|编剧|影帝|影后|歌唱家|相声|京剧|明星|名人|艺人|婚姻|结婚|未婚|未娶|初恋|前妻|前夫|丧偶|离婚|再婚|红颜知己|梨园|影坛|乐坛|成名|爆红|退隐|封麦/;
const NARRATIVE=/往事|回忆|追忆|人生|一生|当年|那些年|幕后|花絮|经历|身世|传奇|旧事|选角|拍摄|走红|成名|隐退|告别|专访|口述|自述|访谈|故事|年轻时|为什么|为何|之谜|背后|底气|嫁|娶|婚|初恋|父母|儿女|亲情/;
const CRITICISM=/影评|乐评|剧评|解读|评论|独家观察|专访|访谈|如何.{0,16}(拍|演)|作品|经典|电影.{0,16}(可能|意义|困境)|音乐.{0,16}(创作|审美)/;
const ANALYSIS=/解读|分析|评论|观察|总编辑时间|这就是中国|意味着什么|为什么|为何|背后|如何|不是.{0,16}是|谁想|还有.{0,6}路|当.{0,14}变成|战略|困局|逻辑|对垒|谍影|不.{0,12}这么简单/;
function evaluate(a){
  const title=String(a.title||'');
  const body=(a.blocks||[]).filter(b=>b.type==='p').map(b=>b.text||'').join('\n');
  const length=Number(a.textLength)||body.length;
  if(PROMO.test(title))return {eligible:false,reason:'活动宣传、产业推介或文旅推广'};
  if(a.channel==='culture'){
    const narrative=NARRATIVE.test(title)&&(PEOPLE.test(title+' '+body.slice(0,1200))||/幕后|花絮|选角|专访|口述|自述/.test(title));
    const criticism=CRITICISM.test(title);
    const authorStory=a.authorFeed&&PEOPLE.test(body.slice(0,1800))&&NARRATIVE.test(body.slice(0,1800));
    if(length<600||!(narrative||criticism||authorStory))return {eligible:false,reason:'文娱需要人物叙事、影视幕后或作品解读，不以活动快讯补位'};
    const retrospective=narrative&&!/举报|处罚|差评|扛大旗|其心可诛/.test(title);
    return {eligible:true,genre:criticism&&!retrospective?'作品解读':'人物与往事',priority:retrospective?34:criticism?26:12};
  }
  if(a.channel==='history'){
    const modern=/民国|近代|党史|建党|抗战|抗日|抗美援朝|解放战争|国民党|共产党|新中国|共和国|改革开放|五四|毛泽东|毛主席|邓小平|刘少奇|周恩来|辛亥|大屠杀|访华|18\d{2}年|19\d{2}年/.test(title+' '+body.slice(0,1600));
    if(!modern||length<600)return {eligible:false,reason:'百年中国选近现代历史叙事，不以古代轶闻或展览消息补位'};
    return {eligible:true,genre:'历史故事',priority:28};
  }
  if(a.channel==='military'&&/抗美援朝|解放战争|抗日|抗战|野战军|三野|二野|华野|战史|老兵|战争回忆/.test(title+' '+body.slice(0,500))&&length>=600)return {eligible:true,genre:'战史回忆',priority:36};
  const analysis=length>=700&&(ANALYSIS.test(title)||((body.match(/因此|这意味着|原因在于|换言之|从这个角度|笔者认为|在我看来|值得注意的是/g)||[]).length>=3));
  return {eligible:true,genre:analysis?'分析评论':'新闻动态',priority:analysis?32:-16};
}
function annotate(a){const e=evaluate(a);return {...a,editorial:e,genre:e.genre,selectionVersion:2};}
function eligibleCandidate(a){
  if(PROMO.test(a.title||''))return false;
  // The article body supplies the final judgement. Listing gates only obvious announcements.
  return a.channel!=='culture'||!/提名名单|宣布定档|官宣定档|票房突破|获奖名单|启动.{0,8}活动|签约仪式/.test(a.title||'');
}
module.exports={evaluate,annotate,eligibleCandidate};
