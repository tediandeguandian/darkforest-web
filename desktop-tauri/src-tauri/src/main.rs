// ============================================================
// 三体 · 黑暗森林 —— Tauri 桌面版外壳
//
// 游戏本体还是 web/ 与 shared/ 那套静态页面（构建时拷进 www/），
// 这里只负责开一个窗口，没有任何 JS 桥：
//   · 没有 window.Android → 不会出现「检查更新」「同一个 Wi-Fi」
//   · 联机走 web/js/net.js + window.DF_SERVER（构建时注入）
// ============================================================
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("运行黑暗森林时出错");
}
