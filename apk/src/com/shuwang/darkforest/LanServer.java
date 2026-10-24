package com.shuwang.darkforest;

import android.content.Context;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 极简 HTTP 服务：给同一 Wi-Fi 下的其他人提供网页 + 消息中继。
 *
 * 设计要点：
 *  - 不做 WebSocket（实现和调试成本高），用短轮询，800ms 一次，局域网延迟可忽略。
 *  - 服务端不跑规则：它只是"信箱"。主机那台手机的页面持有唯一的权威对局，
 *    其他人的动作经 /api/push 投给主机，主机算完把状态 /api/push 广播回去。
 *    这样规则引擎只有一份（shared/*.js），不会出现两套逻辑对不上。
 */
public class LanServer {

    private static final String TAG = "LanServer";

    private final Context ctx;
    private final int port;
    private ServerSocket server;
    private ExecutorService pool;
    private volatile boolean running = false;
    private Thread acceptThread;

    /** pid → 收件箱（每条是一整段 JSON 字符串） */
    private final Map<String, List<String>> inbox = new ConcurrentHashMap<>();
    private final AtomicInteger pidSeq = new AtomicInteger(0);

    public LanServer(Context ctx, int port) {
        this.ctx = ctx.getApplicationContext();
        this.port = port;
    }

    /* ---------------- 生命周期 ---------------- */

    public String start() {
        try {
            server = new ServerSocket(port);
            running = true;
            pool = Executors.newFixedThreadPool(8);
            acceptThread = new Thread(() -> {
                while (running) {
                    try {
                        Socket s = server.accept();
                        pool.submit(() -> handle(s));
                    } catch (IOException e) {
                        if (running) { /* accept 被打断，退出 */ }
                        break;
                    }
                }
            }, "lan-accept");
            acceptThread.setDaemon(true);
            acceptThread.start();
            return null;
        } catch (IOException e) {
            closeAll();
            return "端口 " + port + " 被占用：" + e.getMessage();
        }
    }

    public void stop() {
        running = false;
        closeAll();
    }

    private void closeAll() {
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        server = null;
        if (pool != null) { pool.shutdownNow(); pool = null; }
    }

    /* ---------------- 对外信息 ---------------- */

    public String infoJson() {
        List<String> ips = localIps();
        StringBuilder sb = new StringBuilder();
        sb.append("{\"ok\":true,\"port\":").append(port).append(",\"ips\":[");
        for (int i = 0; i < ips.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(ips.get(i)).append('"');
        }
        sb.append("],\"urls\":[");
        for (int i = 0; i < ips.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append("\"http://").append(ips.get(i)).append(':').append(port).append('"');
        }
        sb.append("]}");
        return sb.toString();
    }

    private List<String> localIps() {
        List<String> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        out.add(a.getHostAddress());
                    }
                }
            }
        } catch (Exception ignored) {}
        Collections.sort(out);
        return out;
    }

    /* ---------------- 请求处理 ---------------- */

    private void handle(Socket sock) {
        try {
            sock.setSoTimeout(12000);
            InputStream in = sock.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));

            String requestLine = reader.readLine();
            if (requestLine == null) { sock.close(); return; }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) { sock.close(); return; }
            String method = parts[0];
            String target = parts[1];

            int contentLength = 0;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                int idx = line.indexOf(':');
                if (idx > 0 && line.substring(0, idx).trim().equalsIgnoreCase("Content-Length")) {
                    try { contentLength = Integer.parseInt(line.substring(idx + 1).trim()); } catch (Exception ignored) {}
                }
            }

            String body = "";
            if (contentLength > 0) {
                char[] buf = new char[contentLength];
                int read = 0;
                while (read < contentLength) {
                    int r = reader.read(buf, read, contentLength - read);
                    if (r < 0) break;
                    read += r;
                }
                body = new String(buf, 0, read);
            }

            String path = target;
            String query = "";
            int q = target.indexOf('?');
            if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }
            path = URLDecoder.decode(path, "UTF-8");

            if (path.startsWith("/api/")) {
                handleApi(sock, method, path.substring(5), query, body);
            } else {
                serveAsset(sock, path);
            }
        } catch (Exception e) {
            try { sock.close(); } catch (IOException ignored) {}
        }
    }

    private void handleApi(Socket sock, String method, String api, String query, String body) throws IOException {
        Map<String, String> qs = parseQuery(query);

        if (api.equals("ip")) {
            writeJson(sock, infoJson());
            return;
        }

        if (api.equals("join")) {
            String pid = "p" + pidSeq.incrementAndGet();
            inbox.put(pid, Collections.synchronizedList(new ArrayList<>()));
            writeJson(sock, "{\"ok\":true,\"pid\":\"" + pid + "\"}");
            return;
        }

        if (api.equals("push")) {
            String from = qs.get("pid");
            if (from == null) from = "p0";
            String to = qs.get("to");          // 定向投递（主机给每个玩家发各自裁剪过的视图）
            broadcast(from, to, body);
            writeJson(sock, "{\"ok\":true}");
            return;
        }

        if (api.equals("pull")) {
            String pid = qs.get("pid");
            if (pid == null) { writeJson(sock, "{\"ok\":false,\"msgs\":[]}"); return; }
            List<String> box = inbox.get(pid);
            if (box == null) { box = Collections.synchronizedList(new ArrayList<>()); inbox.put(pid, box); }
            List<String> out;
            synchronized (box) {
                out = new ArrayList<>(box);
                box.clear();
            }
            StringBuilder sb = new StringBuilder("{\"ok\":true,\"msgs\":[");
            for (int i = 0; i < out.size(); i++) {
                if (i > 0) sb.append(',');
                sb.append(out.get(i));
            }
            sb.append("]}");
            writeJson(sock, sb.toString());
            return;
        }

        if (api.equals("leave")) {
            String pid = qs.get("pid");
            if (pid != null) inbox.remove(pid);
            writeJson(sock, "{\"ok\":true}");
            return;
        }

        writeJson(sock, "{\"ok\":false,\"error\":\"unknown api\"}");
    }

    private void broadcast(String from, String to, String payload) {
        String msg = "{\"from\":\"" + from + "\",\"data\":" + (payload == null || payload.isEmpty() ? "null" : payload) + "}";
        for (Map.Entry<String, List<String>> e : inbox.entrySet()) {
            String pid = e.getKey();
            if (pid.equals(from)) continue;                     // 不回给自己
            if (to != null && !to.isEmpty() && !to.equals(pid)) continue;  // 定向
            List<String> box = e.getValue();
            synchronized (box) {
                box.add(msg);
                if (box.size() > 200) box.remove(0);
            }
        }
    }

    private Map<String, String> parseQuery(String q) {
        Map<String, String> m = new java.util.HashMap<>();
        if (q == null || q.isEmpty()) return m;
        for (String kv : q.split("&")) {
            int i = kv.indexOf('=');
            if (i < 0) m.put(kv, "");
            else {
                try {
                    m.put(kv.substring(0, i), URLDecoder.decode(kv.substring(i + 1), "UTF-8"));
                } catch (Exception ignored) {}
            }
        }
        return m;
    }

    /* ---------------- 静态资源 ---------------- */

    private void serveAsset(Socket sock, String path) throws IOException {
        if (path.equals("/") || path.isEmpty()) path = "/lan.html";
        // 防目录穿越
        if (path.contains("..")) { writeText(sock, 403, "forbidden", "text/plain"); return; }

        String asset = "www" + path;
        byte[] data;
        try (InputStream is = ctx.getAssets().open(asset)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            data = bos.toByteArray();
        } catch (IOException e) {
            // 找不到就回落到单页入口，方便直接刷新
            if (!path.contains(".")) {
                try (InputStream is = ctx.getAssets().open("www/lan.html")) {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                    data = bos.toByteArray();
                } catch (IOException e2) {
                    writeText(sock, 404, "not found", "text/plain");
                    return;
                }
            } else {
                writeText(sock, 404, "not found", "text/plain");
                return;
            }
        }

        String mime = "application/octet-stream";
        if (path.endsWith(".html")) mime = "text/html; charset=utf-8";
        else if (path.endsWith(".css")) mime = "text/css; charset=utf-8";
        else if (path.endsWith(".js")) mime = "application/javascript; charset=utf-8";
        else if (path.endsWith(".json")) mime = "application/json; charset=utf-8";
        else if (path.endsWith(".png")) mime = "image/png";
        else if (path.endsWith(".jpg")) mime = "image/jpeg";
        else if (path.endsWith(".svg")) mime = "image/svg+xml";

        OutputStream os = sock.getOutputStream();
        String head = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: " + mime + "\r\n"
                + "Content-Length: " + data.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        os.write(head.getBytes(StandardCharsets.UTF_8));
        os.write(data);
        os.flush();
        sock.close();
    }

    private void writeJson(Socket sock, String json) throws IOException {
        writeText(sock, 200, json, "application/json; charset=utf-8");
    }

    private void writeText(Socket sock, int code, String text, String mime) throws IOException {
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        OutputStream os = sock.getOutputStream();
        String head = "HTTP/1.1 " + code + " " + (code == 200 ? "OK" : "ERR") + "\r\n"
                + "Content-Type: " + mime + "\r\n"
                + "Content-Length: " + data.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        os.write(head.getBytes(StandardCharsets.UTF_8));
        os.write(data);
        os.flush();
        sock.close();
    }
}
