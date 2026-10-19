package com.chenjiang.magazine;

import java.io.*;
import java.net.*;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;
import javax.net.ssl.HttpsURLConnection;

/** Public HTTPS documents only. Uses the system certificate verifier and never relaxes TLS. */
public final class NativeHttp {
    private static final String UA = "Mozilla/5.0 (Linux; Android 13; vivo X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    private static final long MAX_CACHE = 64L * 1024 * 1024;
    private final File cacheDir;

    public static final class Result {
        public boolean ok, cached, stale;
        public int status;
        public String url = "", mime = "application/octet-stream", charset = "UTF-8", error = "";
        public byte[] bytes = new byte[0];
        public String text() { try { return new String(bytes, charset); } catch (Exception e) { return new String(bytes, Charset.forName("UTF-8")); } }
    }

    public NativeHttp(File directory) { cacheDir = directory; cacheDir.mkdirs(); }

    static URL publicHttps(String raw) throws IOException {
        if (raw == null || raw.length() > 4096) throw new IOException("链接格式不正确");
        if (raw.startsWith("//")) raw = "https:" + raw;
        if (raw.regionMatches(true, 0, "http://", 0, 7)) raw = "https://" + raw.substring(7);
        URL url = new URL(raw);
        if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getUserInfo() != null || (url.getPort() != -1 && url.getPort() != 443)) throw new IOException("仅支持公开 HTTPS 网页");
        String host = url.getHost().toLowerCase(Locale.ROOT);
        if (host.equals("localhost") || host.endsWith(".local") || host.endsWith(".localhost") || host.indexOf('.') < 0) throw new IOException("不支持本机或局域网地址");
        if (host.matches("[0-9.]+")) validateAddresses(url);
        return url;
    }

    private static void validateAddresses(URL url) throws IOException {
        String host = url.getHost();
        for (InetAddress address : InetAddress.getAllByName(host)) {
            byte[] b = address.getAddress();
            if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress()
                || (b.length == 16 && (b[0] & 0xfe) == 0xfc)
                || (b.length == 4 && ((b[0] & 255) == 0 || ((b[0] & 255) == 100 && ((b[1] & 255) >= 64 && (b[1] & 255) <= 127))))) throw new IOException("不支持本机或局域网地址");
        }
    }

    public Result fetch(String rawUrl, boolean image) {
        Result prior = null;
        File cache = null;
        try {
            URL url = publicHttps(rawUrl);
            cache = new File(cacheDir, digest(url.toString() + (image ? "|image" : "|text")));
            prior = readCache(cache);
            long age = System.currentTimeMillis() - cache.lastModified();
            if (prior != null && age >= 0 && age < (image ? 30L * 86400000 : 60000)) return prior;
            Result result = download(url, image);
            if (result.ok) { writeCache(cache, result); return result; }
            if (prior != null) { prior.stale = true; return prior; }
            return result;
        } catch (Exception error) {
            if (prior != null) { prior.stale = true; return prior; }
            Result failed = new Result(); failed.url = rawUrl == null ? "" : rawUrl;
            if (error instanceof java.net.SocketTimeoutException) failed.error = "连接超时，请稍后重试";
            else if (error instanceof java.net.UnknownHostException) failed.error = "暂时无法连接内容网站，请检查网络";
            else if (error instanceof javax.net.ssl.SSLException) failed.error = "内容网站的安全连接暂不可用";
            else failed.error = error.getMessage() == null ? "网络请求暂未成功" : error.getMessage();
            return failed;
        }
    }

    private Result download(URL firstUrl, boolean image) throws IOException {
        URL url = firstUrl;
        long deadline = System.nanoTime() + 8000000000L;
        for (int hop = 0; hop < 7; hop++) {
            if (System.nanoTime() > deadline) throw new SocketTimeoutException();
            validateAddresses(url);
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4000); connection.setReadTimeout(4000);
            connection.setRequestProperty("User-Agent", UA);
            connection.setRequestProperty("Accept", image ? "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5" : "text/html,application/json,text/plain;q=0.9,*/*;q=0.5");
            connection.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9");
            connection.setRequestProperty("Accept-Encoding", "gzip, deflate");
            connection.setRequestProperty("Referer", url.getProtocol() + "://" + url.getAuthority() + "/");
            try {
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("网页跳转地址为空");
                    url = publicHttps(new URL(url, location).toString());
                    continue;
                }
                Result result = new Result(); result.status = status; result.url = url.toString();
                if (status < 200 || status >= 300) { result.error = "内容网站暂时返回 " + status; return result; }
                String type = connection.getContentType();
                if (type == null) type = image ? "image/jpeg" : "text/html";
                result.mime = type.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
                if (image && !result.mime.startsWith("image/")) { result.error = "图片暂不可用"; return result; }
                InputStream stream = connection.getInputStream();
                String encoding = connection.getContentEncoding();
                if (encoding != null && encoding.toLowerCase(Locale.ROOT).contains("gzip")) stream = new GZIPInputStream(stream);
                else if (encoding != null && encoding.toLowerCase(Locale.ROOT).contains("deflate")) stream = new InflaterInputStream(stream);
                int limit = image ? 8 * 1024 * 1024 : 5 * 1024 * 1024;
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] block = new byte[16384]; int read;
                try {
                    while ((read = stream.read(block)) != -1) {
                        if (output.size() + read > limit) throw new IOException("内容文件过大");
                        if (System.nanoTime() > deadline) throw new SocketTimeoutException();
                        output.write(block, 0, read);
                    }
                } finally { stream.close(); }
                result.bytes = output.toByteArray();
                result.charset = detectCharset(type, result.bytes);
                result.ok = true; return result;
            } finally { connection.disconnect(); }
        }
        throw new IOException("网页跳转次数过多");
    }

    static String detectCharset(String contentType, byte[] bytes) {
        String charset = "";
        Matcher header = Pattern.compile("charset\\s*=\\s*[\"']?([a-zA-Z0-9_-]+)", Pattern.CASE_INSENSITIVE).matcher(contentType == null ? "" : contentType);
        if (header.find()) charset = header.group(1);
        if (charset.length() == 0) {
            String prefix = new String(bytes, 0, Math.min(bytes.length, 12000), Charset.forName("ISO-8859-1"));
            Matcher meta = Pattern.compile("<meta[^>]+charset\\s*=\\s*[\"']?\\s*([a-zA-Z0-9_-]+)", Pattern.CASE_INSENSITIVE).matcher(prefix);
            if (meta.find()) charset = meta.group(1);
        }
        if (charset.equalsIgnoreCase("gb2312") || charset.equalsIgnoreCase("gbk")) charset = "GB18030";
        if (bytes.length >= 2 && bytes[0] == (byte)0xff && bytes[1] == (byte)0xfe) charset = "UTF-16LE";
        else if (bytes.length >= 2 && bytes[0] == (byte)0xfe && bytes[1] == (byte)0xff) charset = "UTF-16BE";
        else if (bytes.length >= 3 && bytes[0] == (byte)0xef && bytes[1] == (byte)0xbb && bytes[2] == (byte)0xbf) charset = "UTF-8";
        try { if (charset.length() > 0 && Charset.isSupported(charset)) return charset; } catch (Exception ignored) { }
        return "UTF-8";
    }

    private static String digest(String input) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes("UTF-8"));
        StringBuilder out = new StringBuilder(); for (byte b : digest) out.append(String.format(Locale.ROOT, "%02x", b & 255)); return out.toString();
    }

    private Result readCache(File path) {
        if (!path.isFile() || System.currentTimeMillis() - path.lastModified() > 45L * 86400000) return null;
        try (DataInputStream input = new DataInputStream(new BufferedInputStream(new FileInputStream(path)))) {
            if (input.readInt() != 3) return null;
            Result result = new Result(); result.url = input.readUTF(); result.mime = input.readUTF(); result.charset = input.readUTF(); result.status = input.readInt();
            int length = input.readInt(); if (length < 0 || length > 8 * 1024 * 1024) return null;
            result.bytes = new byte[length]; input.readFully(result.bytes); result.ok = true; result.cached = true; return result;
        } catch (Exception ignored) { return null; }
    }

    private void writeCache(File path, Result result) {
        File temporary = null;
        try {
            temporary = File.createTempFile("request-", ".tmp", cacheDir);
            try (DataOutputStream output = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(temporary)))) {
                output.writeInt(3); output.writeUTF(result.url); output.writeUTF(result.mime); output.writeUTF(result.charset); output.writeInt(result.status); output.writeInt(result.bytes.length); output.write(result.bytes);
            }
            if (!temporary.renameTo(path)) temporary.delete();
            trimCache();
        } catch (Exception ignored) { if (temporary != null) temporary.delete(); }
    }

    private synchronized void trimCache() {
        File[] files = cacheDir.listFiles(); if (files == null) return;
        long total = 0; for (File file : files) total += file.length();
        if (total <= MAX_CACHE) return;
        Arrays.sort(files, new Comparator<File>() { public int compare(File a, File b) { return Long.compare(a.lastModified(), b.lastModified()); } });
        for (File file : files) { long length = file.length(); if (file.delete()) total -= length; if (total < MAX_CACHE * 3 / 4) break; }
    }
    public synchronized void clear() { File[] files = cacheDir.listFiles(); if (files != null) for (File file : files) file.delete(); }
}
