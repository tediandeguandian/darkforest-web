package com.shuwang.darkforest;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 三体 · 黑暗森林 —— 离线版外壳
 *
 * 整个游戏（规则引擎、可见性过滤、四档人机）都在 assets/www 里，用 WebView 本地跑，
 * 不需要网络。局域网模式由 LanServer 在同一进程里开一个 HTTP 服务，
 * 同一 Wi-Fi 下的其他人用浏览器访问即可加入。
 */
public class MainActivity extends Activity {

    private WebView web;
    private LanServer lan;
    private boolean downloading = false;   // 防重入：连点更新只跑一次
    private static final String APP_NAME = "黑暗森林";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // 主机页是 file:// 打开的，要允许它访问本机 127.0.0.1 上的局域网服务
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.setBackgroundColor(0xFF16102A);
        web.setWebViewClient(new WebViewClient());

        // WebView 默认不实现 window.confirm —— 页面里"退出对局"要靠它确认，
        // 不接管就会出现"点了没反应"。这里用原生对话框把 alert/confirm 接住。
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("确定", (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("确定", (d, w) -> result.confirm())
                        .setNegativeButton("取消", (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "Android");

        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    /** 暴露给页面的原生能力：开/关局域网、拿本机地址 */
    class Bridge {
        @JavascriptInterface
        public String lanStart() {
            if (lan != null) return lan.infoJson();
            lan = new LanServer(MainActivity.this, 8080);
            String err = lan.start();
            if (err != null) { lan = null; return "{\"ok\":false,\"error\":\"" + err + "\"}"; }
            return lan.infoJson();
        }

        @JavascriptInterface
        public String lanInfo() {
            return lan == null ? "{\"ok\":false}" : lan.infoJson();
        }

        @JavascriptInterface
        public void lanStop() {
            if (lan != null) { lan.stop(); lan = null; }
        }

        /** 兜底：本机没有原生下载能力时，退回系统浏览器打开链接 */
        @JavascriptInterface
        public void openUrl(String url) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) {
                // 没有浏览器就什么都不做，页面上还有提示文案
            }
        }

        /**
         * 应用内下载更新包，下完直接唤起系统安装器。
         *
         * 为什么不能靠 WebView 自己下：WebView 默认没有下载实现（不接管 onDownloadStart 时
         * 点击链接毫无反应），而且就算下到文件也装不了——安装是系统的 PackageInstaller 干的活，
         * 必须给一个 content:// Uri + 临时读权限。所以下载和安装都交给原生。
         *
         * 返回给页面的只是「已开始」：进度和结果走 Toast，失败也不阻塞界面。
         */
        @JavascriptInterface
        public String downloadApk(String url) {
            if (downloading) return "{\"ok\":false,\"error\":\"正在下载中\"}";
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://")))
                return "{\"ok\":false,\"error\":\"地址无效\"}";
            downloading = true;
            toast("开始下载更新…");
            new Thread(new Runnable() {
                @Override
                public void run() {
                    final String err = fetchTo(url, ApkProvider.fileIn(MainActivity.this));
                    downloading = false;
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (err != null) toast("下载失败：" + err);
                            else installApk();
                        }
                    });
                }
            }).start();
            return "{\"ok\":true}";
        }

        /** 已经下好过一次的话，直接重装（用户拒绝授权后回来再点，不用重下） */
        @JavascriptInterface
        public String installDownloaded() {
            File f = ApkProvider.fileIn(MainActivity.this);
            if (!f.exists()) return "{\"ok\":false,\"error\":\"还没有下载好的安装包\"}";
            installApk();
            return "{\"ok\":true}";
        }

        @JavascriptInterface
        public String appInfo() {
            return "{\"name\":\"dark-forest\",\"offline\":true}";
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    /** 下载到私有目录：先写 .part，校验完整后再改名，避免半个包装上去解析失败 */
    private String fetchTo(String url, File out) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            c.connect();
            int code = c.getResponseCode();
            if (code != 200) return "HTTP " + code;

            File tmp = new File(out.getAbsolutePath() + ".part");
            long total = 0;
            InputStream in = c.getInputStream();
            FileOutputStream fo = new FileOutputStream(tmp);
            try {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    fo.write(buf, 0, n);
                    total += n;
                }
                fo.flush();
            } finally {
                try { fo.close(); } catch (Exception ignore) { }
                try { in.close(); } catch (Exception ignore) { }
            }
            if (total < 32 * 1024) return "文件不完整（" + total + " 字节）";   // APK 几百 KB，太小肯定是错误页
            if (out.exists() && !out.delete()) return "无法覆盖旧安装包";
            if (!tmp.renameTo(out)) return "无法保存安装包";
            return null;
        } catch (Exception e) {
            String m = e.getMessage();
            return (m == null || m.isEmpty()) ? e.getClass().getSimpleName() : m;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** 唤起系统安装器。Android 8 以后还要单独允许「安装未知应用」，没允许就先带用户去开 */
    private void installApk() {
        File f = ApkProvider.fileIn(this);
        if (!f.exists() || f.length() < 32 * 1024) {
            toast("安装包不见了，请重新下载");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            toast("请允许「" + APP_NAME + "」安装应用，然后回来再点一次");
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception e) {
                toast("请在系统设置里允许安装未知来源应用");
            }
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(ApkProvider.uriFor(), "application/vnd.android.package-archive");
        // 只把这一个 Uri 的读权限临时授给安装器；provider 自己是 exported=false
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
            toast("正在安装…");
        } catch (Exception e) {
            toast("没找到可用的安装程序");
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (lan != null) { lan.stop(); lan = null; }
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
