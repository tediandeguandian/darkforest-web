// ============================================================
// 三体 · 黑暗森林 —— Tauri 桌面版外壳
//
// 游戏本体还是 web/ 与 shared/ 那套静态页面（构建时拷进 www/），
// 这里只负责开一个窗口，外加两件"网页做不了"的事：
//   · updater.rs —— macOS 应用内更新：下载 dmg → 挂载 → 换掉 .app → 重启
//   · opener 插件 —— 兜底 / Windows：把下载地址交给系统浏览器
// 其余一切（联机、存档、AI）都在 JS 里，两端共用同一套代码。
//
// 版本号 window.DF_VERSION 由 prep 脚本注入，入口页据此检查更新。
// ============================================================
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod updater;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(updater::UpdateState::default())
        .invoke_handler(tauri::generate_handler![
            updater::df_update_caps,
            updater::df_update_state,
            updater::df_update_start,
            updater::df_update_install,
            updater::df_update_relaunch,
        ])
        .run(tauri::generate_context!())
        .expect("运行黑暗森林时出错");
}
