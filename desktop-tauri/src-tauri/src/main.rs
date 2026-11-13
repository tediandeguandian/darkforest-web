// ============================================================
// 三体 · 黑暗森林 —— Tauri 桌面版外壳
//
// 游戏本体还是 web/ 与 shared/ 那套静态页面（构建时拷进 www/），
// 这里只负责开一个窗口，没有任何 JS 桥：
//   · 没有 window.Android → 不会出现安卓那种「同一个 Wi-Fi」入口
//   · 联机走 web/js/net.js + window.DF_SERVER（构建时注入）
//   · 版本号 window.DF_VERSION 也由 prep 脚本注入，入口页据此检查更新
//
// 唯一的原生能力是 opener 插件：发现新版本时把 dmg / exe 的下载地址
// 交给系统浏览器。不用它会很别扭——webview 里 window.open 被直接拦掉，
// location.href 又会把正在玩的页面导航走。
// ============================================================
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("运行黑暗森林时出错");
}
