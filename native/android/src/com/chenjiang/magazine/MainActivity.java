package com.chenjiang.magazine;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.util.*;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN="https://appassets.androidplatform.net";
    private final Handler main=new Handler(Looper.getMainLooper());
    private NativeHttp http;
    private WebView web;
    private long lastBack;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(249,246,238));
        getWindow().setNavigationBarColor(Color.rgb(249,246,238));
        fullscreen();
        http=new NativeHttp(new File(getFilesDir(),"prepared-content-v4"));
        web=new WebView(this);web.setBackgroundColor(Color.rgb(249,246,238));
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setBlockNetworkLoads(true);s.setMediaPlaybackRequiresUserGesture(true);s.setTextZoom(100);
        CookieManager.getInstance().setAcceptCookie(false);
        web.addJavascriptInterface(new ExternalBridge(),"CJNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return intercept(r.getUrl().toString());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,String u){return intercept(u);}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return navigation(r.getUrl().toString());}
            @Override public boolean shouldOverrideUrlLoading(WebView v,String u){return navigation(u);}
            @Override public void onReceivedSslError(WebView v,SslErrorHandler h,android.net.http.SslError e){h.cancel();}
        });
        setContentView(web);web.loadUrl(APP_ORIGIN+"/assets/index.html");configure(getIntent());
    }
    private void fullscreen(){getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE|android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|android.view.View.SYSTEM_UI_FLAG_FULLSCREEN|android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);}
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)fullscreen();}
    private boolean navigation(String u){if(u.startsWith(APP_ORIGIN+"/assets/"))return false;external(u);return true;}
    private String contentOrigin(){
        String saved=getPreferences(MODE_PRIVATE).getString("contentOrigin","");if(!saved.isEmpty())return saved;
        try(InputStream in=getAssets().open("content-source.json")){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[1024];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return validOrigin(new JSONObject(out.toString("UTF-8")).optString("origin",""));}catch(Exception e){return "";}
    }
    private String validOrigin(String value)throws Exception{
        URL u=new URL(value);String host=u.getHost().toLowerCase(Locale.ROOT);
        if(!"https".equals(u.getProtocol())||u.getUserInfo()!=null||u.getPort()!=-1||u.getQuery()!=null||u.getRef()!=null||!(u.getPath().isEmpty()||"/".equals(u.getPath()))||!host.matches("[a-z0-9-]+(?:\\.[a-z0-9-]+)+")||host.matches("[0-9.]+")||host.endsWith(".local"))throw new IOException("内容地址无效");
        return "https://"+host;
    }
    private WebResourceResponse intercept(String raw){
        if(!raw.startsWith(APP_ORIGIN+"/"))return unavailable();
        String p=Uri.parse(raw).getPath();if(p==null||p.contains("..")||p.contains("\\"))return unavailable();
        if(p.startsWith("/assets/")){
            String file=p.substring(8);String mime="application/octet-stream";
            if(file.endsWith(".html"))mime="text/html";else if(file.endsWith(".js"))mime="text/javascript";else if(file.endsWith(".css"))mime="text/css";else if(file.endsWith(".json"))mime="application/json";else if(file.endsWith(".jpg"))mime="image/jpeg";else if(file.endsWith(".png"))mime="image/png";else if(file.endsWith(".svg"))mime="image/svg+xml";
            try{return new WebResourceResponse(mime,"UTF-8",getAssets().open(file));}catch(Exception e){return unavailable();}
        }
        boolean image=p.matches("/media/[a-f0-9]{64}\\.jpg");
        if(image||"/api/edition".equals(p)||"/api/edition.json".equals(p)){
            String root=contentOrigin();if(root.isEmpty())return unavailable();
            NativeHttp.Result r=http.fetch(root+(image?p:"/api/edition.json"),image);
            if(r.ok){Map<String,String> headers=new HashMap<>();headers.put("Cache-Control",image?"max-age=2592000":"no-store");if(r.stale)headers.put("x-cj-offline","1");return new WebResourceResponse(image?r.mime:"application/json",image?null:"UTF-8",200,"OK",headers,new ByteArrayInputStream(r.bytes));}
        }
        return unavailable();
    }
    private static WebResourceResponse unavailable(){return new WebResourceResponse("text/plain","UTF-8",503,"Not Ready",Collections.<String,String>emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private final class ExternalBridge{@JavascriptInterface public void openExternal(String u){external(u);}}
    private void external(final String value){main.post(new Runnable(){public void run(){try{Uri u=Uri.parse(value);if("https".equalsIgnoreCase(u.getScheme())&&u.getHost()!=null)startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception e){Toast.makeText(MainActivity.this,"没有找到可用的浏览器",Toast.LENGTH_SHORT).show();}}});}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);configure(intent);}
    private void configure(Intent intent){
        Uri u=intent==null?null:intent.getData();if(u==null||!"chenjiang".equals(u.getScheme())||!"source".equals(u.getHost()))return;
        try{final String root=validOrigin(u.getQueryParameter("origin"));new AlertDialog.Builder(this).setTitle("设置杂志更新地址").setMessage("将从这个地址接收新一期图文：\n\n"+root).setNegativeButton("取消",null).setPositiveButton("保存",(dialog,which)->{getPreferences(MODE_PRIVATE).edit().putString("contentOrigin",root).apply();web.reload();}).show();}catch(Exception e){Toast.makeText(this,"更新地址无效",Toast.LENGTH_SHORT).show();}
    }
    @Override public void onBackPressed(){web.evaluateJavascript("(function(){return typeof CJBack==='function'&&CJBack()===true;})()",value->{if("true".equals(value))return;long now=android.os.SystemClock.elapsedRealtime();if(now-lastBack<2000){finish();return;}lastBack=now;Toast.makeText(this,"再按一次返回键退出杂志",Toast.LENGTH_SHORT).show();});}
    @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("CJNative");web.stopLoading();web.destroy();web=null;}super.onDestroy();}
}
