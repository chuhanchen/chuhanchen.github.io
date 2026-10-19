'use strict';
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { TextDecoder } = require('util');

const NEWS_DOMAINS = [
  'ifeng.com', 'toutiao.com', '360kuai.com', '360.cn', '360.com', 'so.com',
  'people.com.cn', 'chinanews.com.cn', 'chinanews.com', 'xinhuanet.com', 'news.cn',
  'cctv.com', 'cnr.cn', '163.com', 'sina.com.cn', 'sina.cn', 'sohu.com',
  'guancha.cn', 'qq.com', 'huanqiu.com', 'thepaper.cn', 'gmw.cn', 'qstheory.cn'
];
const IMAGE_DOMAINS = NEWS_DOMAINS.concat([
  '360tres.com',
  'ifengimg.com', 'ifengpic.com', 'ifengimg.com.cn', 'p0.itc.cn', 'p1.itc.cn',
  'p2.itc.cn', 'p3.itc.cn', 'p4.itc.cn', 'itc.cn', 'sohucs.com', 'sinaimg.cn',
  'gtimg.com', 'qpic.cn', 'byteimg.com', 'pstatp.com', 'toutiaoimg.com',
  '360kxs.com', 'qhimg.com', 'qhimgs.com', 'nimg.ws.126.net', '126.net'
]);
function allowedUrl(value, image = false) {
  let u;
  try { u = new URL(value); } catch (_) { throw new Error('网址无效'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password ||
      (u.port && !['80', '443'].includes(u.port))) throw new Error('网址类型不受支持');
  const domains = image ? IMAGE_DOMAINS : NEWS_DOMAINS;
  const host = u.hostname.toLowerCase();
  if (!domains.some(d => host === d || host.endsWith('.' + d))) throw new Error('暂不支持这个新闻来源');
  u.hash = '';
  return u;
}
function referer(u) {
  if (u.hostname.endsWith('ifengimg.com') || u.hostname.endsWith('ifeng.com')) return 'https://www.ifeng.com/';
  if (u.hostname.endsWith('itc.cn') || u.hostname.endsWith('sohucs.com')) return 'https://www.sohu.com/';
  if (u.hostname.endsWith('sinaimg.cn')) return 'https://www.sina.com.cn/';
  if (u.hostname.endsWith('gtimg.com') || u.hostname.endsWith('qpic.cn')) return 'https://news.qq.com/';
  return u.origin + '/';
}
function decodeText(data, contentType) {
  const ascii = data.subarray(0, 4096).toString('latin1');
  const declared = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '') ||
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(ascii);
  let charset = declared ? declared[1].toLowerCase() : 'utf-8';
  if (['gbk', 'gb2312', 'gb_2312-80'].includes(charset)) charset = 'gb18030';
  try { return new TextDecoder(charset).decode(data); }
  catch (_) { return new TextDecoder('utf-8').decode(data); }
}
function requestBytes(value, { image = false, maxBytes = image ? 12 * 1024 * 1024 : 10 * 1024 * 1024,
  timeout = 25000, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = allowedUrl(value, image); } catch (e) { reject(e); return; }
    const transport = u.protocol === 'https:' ? https : http;
    const req = transport.request(u, {
      method: 'GET', headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Accept': image ? 'image/avif,image/webp,image/*,*/*;q=0.8' : 'text/html,application/json,text/plain,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9', 'Accept-Encoding': 'gzip, deflate, br',
        'Referer': referer(u)
      }
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        if (redirects >= 5) { reject(new Error('网页跳转次数过多')); return; }
        requestBytes(new URL(response.headers.location, u).href,
          { image, maxBytes, timeout, redirects: redirects + 1 }).then(resolve, reject);
        return;
      }
      let stream = response;
      const encoding = String(response.headers['content-encoding'] || '').toLowerCase();
      if (encoding === 'gzip') stream = response.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = response.pipe(zlib.createInflate());
      else if (encoding === 'br') stream = response.pipe(zlib.createBrotliDecompress());
      const chunks = []; let length = 0;
      stream.on('data', chunk => {
        length += chunk.length;
        if (length > maxBytes) { req.destroy(new Error('网页内容过大')); stream.destroy(); return; }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      response.on('error', reject);
      stream.on('end', () => resolve({ url: u.href, status, data: Buffer.concat(chunks),
        contentType: String(response.headers['content-type'] || '') }));
    });
    const deadline = setTimeout(() => req.destroy(new Error('连接超时，请稍后重试')), timeout);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end();
  });
}
async function requestText(url) {
  try {
    const r = await requestBytes(url);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, url: r.url,
      text: decodeText(r.data, r.contentType), error: r.status >= 200 && r.status < 300 ? '' : '新闻来源暂时无法连接（' + r.status + '）' };
  } catch (e) {
    return { ok: false, status: 0, url, text: '', error: e.message || '网络连接失败' };
  }
}
module.exports = { allowedUrl, decodeText, requestBytes, requestText, NEWS_DOMAINS, IMAGE_DOMAINS };
