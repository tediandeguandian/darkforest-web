// ============================================================
// 应用内更新（macOS）
//
// 以前点「新版本」只是把 dmg 地址丢给系统浏览器：用户还得自己等下完、
// 双击挂载、把「黑暗森林」拖进「应用程序」、再点一次「替换」。四步里
// 有三步跟玩牌无关。这里补上剩下的一步到底：
//
//   下载 dmg（curl，流式，带进度）→ hdiutil 挂载 → ditto 拷到同卷暂存区
//   → 原名换位（旧的先挪成 .old，失败回滚）→ 清 quarantine → 用户点重启
//
// 三件刻意为之的事：
//   · 不用 tauri-plugin-updater：它要 minisign 私钥签每个包，而我们本来就是
//     未签名分发（ad-hoc），再加一套签名体系只会让 CI 更脆。
//   · 不用管理员权限：/Applications 对 admin 组可写，绝大多数人直接成功；
//     真没权限就老实报错，让用户改用浏览器下载，别弹一个假的密码框。
//   · 不自动重启：用户可能正打着一局。装完把「立即重启」交给用户点。
// ============================================================

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub struct UpdateState(pub Mutex<Progress>);

impl Default for UpdateState {
    fn default() -> Self {
        UpdateState(Mutex::new(Progress::default()))
    }
}

pub struct Progress {
    pub phase: &'static str, // idle / downloading / downloaded / installing / installed / error
    pub got: u64,
    pub total: u64,
    pub msg: String,
    pub path: String,
}

impl Default for Progress {
    fn default() -> Self {
        Progress {
            phase: "idle",
            got: 0,
            total: 0,
            msg: String::new(),
            path: String::new(),
        }
    }
}

fn with_state<T>(app: &AppHandle, f: impl FnOnce(&mut Progress) -> T) -> T {
    let st = app.state::<UpdateState>();
    let mut p = st.0.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut p)
}

/* 当前 .app 的位置：exe 在 X.app/Contents/MacOS/xxx，往上三级就是包体。
   cargo run / 开发态（target/debug/xxx）拿不到 .app，返回 None —— 那种情况
   本来也没有可替换的东西，前端会退回浏览器下载。 */
fn app_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.parent()?.parent()?.parent()?;
    if bundle.extension().and_then(|e| e.to_str()) == Some("app") {
        return Some(bundle.to_path_buf());
    }
    // universal 包里 exe 也可能多一层 Contents/MacOS/，这里不做猜测，直接判定失败
    None
}

/* 父目录能不能写：建个探针文件比看权限位靠谱（ACL、只读卷都能识别） */
fn dir_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".df-write-probe-{}", std::process::id()));
    match fs::File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/* curl 落盘目录：Application Support 会被用户当资料备份，放 Caches 更合适 */
fn cache_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library/Caches")
            .join("com.shuwang.darkforest")
            .join("update"),
    )
}

/* 文件名只留安全字符：这个值来自线上清单，不该让它决定写到哪 */
fn clean_name(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if s.is_empty() {
        s.push_str("dark-forest.dmg");
    }
    if !s.ends_with(".dmg") {
        s.push_str(".dmg");
    }
    s
}

fn set_progress(app: &AppHandle, got: u64, total: u64) {
    with_state(app, |p| {
        p.got = got;
        if total > 0 {
            p.total = total;
        }
    });
}

fn set_stage(app: &AppHandle, phase: &'static str, msg: &str) {
    with_state(app, |p| {
        p.phase = phase;
        p.msg = msg.to_string();
    });
}

/* ---------- 命令 ---------- */

#[tauri::command]
pub fn df_update_caps() -> Value {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "other"
    };
    let bundle = app_bundle();
    let writable = bundle
        .as_ref()
        .and_then(|b| b.parent())
        .map(dir_writable)
        .unwrap_or(false);
    let inapp = platform == "macos" && bundle.is_some() && writable;

    let note = if inapp {
        ""
    } else if bundle.is_none() {
        "当前不是从 .app 启动的，无法自动替换，请用浏览器下载安装包"
    } else if !writable {
        // 最常见的一种：用户直接从 dmg 里双击运行，挂载卷是只读的
        "当前是从只读的安装镜像里运行的，先把「黑暗森林」拖进「应用程序」再回来更新"
    } else {
        "这个平台暂不支持应用内更新"
    };

    json!({
        "platform": platform,
        "mode": if inapp { "inapp" } else { "browser" },
        "app": bundle.map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "writable": writable,
        "note": note,
    })
}

#[tauri::command]
pub fn df_update_state(app: AppHandle) -> Value {
    with_state(&app, |p| {
        json!({
            "phase": p.phase,
            "got": p.got,
            "total": p.total,
            "msg": p.msg,
            "path": p.path,
        })
    })
}

#[tauri::command]
pub fn df_update_start(app: AppHandle, url: String, name: String, total: u64) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("下载地址不合法".into());
    }
    if !cfg!(target_os = "macos") {
        return Err("这个平台暂不支持应用内更新".into());
    }
    let dir = cache_dir().ok_or("找不到缓存目录")?;
    fs::create_dir_all(&dir).map_err(|e| format!("建不了缓存目录：{e}"))?;
    let out = dir.join(clean_name(&name));
    let _ = fs::remove_file(&out);

    // 同一时间只跑一个下载：连点两下不该并行拉两份
    let started = with_state(&app, |p| {
        if p.phase == "downloading" || p.phase == "installing" {
            return false;
        }
        *p = Progress {
            phase: "downloading",
            got: 0,
            total,
            msg: String::new(),
            path: out.to_string_lossy().to_string(),
        };
        true
    });
    if !started {
        return Err("已经在下载了".into());
    }

    let handle = app.clone();
    std::thread::spawn(move || match curl_download(&url, &out, total, &handle) {
        Ok(bytes) => with_state(&handle, |p| {
            p.phase = "downloaded";
            p.got = bytes;
            p.msg.clear();
        }),
        Err(e) => with_state(&handle, |p| {
            p.phase = "error";
            p.msg = e;
        }),
    });
    Ok(())
}

/* curl 负责传输，我们只管隔一会儿看一眼落盘大小。
   macOS 自带 /usr/bin/curl，不用为了流式下载引一整套 TLS 依赖（编译也快）。 */
fn curl_download(url: &str, out: &Path, total: u64, app: &AppHandle) -> Result<u64, String> {
    let mut child = Command::new("/usr/bin/curl")
        .args([
            "-fL",
            "--retry", "2",
            "--retry-delay", "1",
            "--connect-timeout", "20",
            "--silent",
            "--show-error",
            "-o",
        ])
        .arg(out)
        .arg(url)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动下载失败：{e}"))?;

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let mut err = String::new();
                    if let Some(mut s) = child.stderr.take() {
                        use std::io::Read;
                        let _ = s.read_to_string(&mut err);
                    }
                    let err = err.trim().to_string();
                    return Err(if err.is_empty() {
                        format!("下载失败（curl 退出码 {}）", status.code().unwrap_or(-1))
                    } else {
                        err
                    });
                }
                break;
            }
            Ok(None) => {}
            Err(e) => return Err(format!("下载中断：{e}")),
        }
        let got = fs::metadata(out).map(|m| m.len()).unwrap_or(0);
        set_progress(app, got, total);
        std::thread::sleep(Duration::from_millis(120));
    }

    let bytes = fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    if bytes == 0 {
        return Err("下载到的文件是空的".into());
    }
    // 清单里写了体积就核对一下：被截断的 dmg 挂载会失败，不如早点报错
    if total > 0 && bytes + 1024 < total {
        let _ = fs::remove_file(out);
        return Err(format!(
            "下载不完整（{} / {} 字节）",
            bytes, total
        ));
    }
    Ok(bytes)
}

#[tauri::command]
pub fn df_update_install(app: AppHandle) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("这个平台暂不支持应用内更新".into());
    }
    let (dmg, bundle) = with_state(&app, |p| {
        if p.phase != "downloaded" {
            return Err("还没下载完".to_string());
        }
        Ok((PathBuf::from(p.path.clone()), app_bundle()))
    })?;
    let bundle = bundle.ok_or("找不到当前应用的位置")?;

    set_stage(&app, "installing", "正在挂载安装包…");
    match install_macos(&dmg, &bundle, &app) {
        Ok(()) => {
            set_stage(&app, "installed", "");
            Ok(())
        }
        Err(e) => {
            set_stage(&app, "error", &e);
            Err(e)
        }
    }
}

fn install_macos(dmg: &Path, bundle: &Path, app: &AppHandle) -> Result<(), String> {
    let parent = bundle
        .parent()
        .ok_or("应用所在目录不可用")?;
    let name = bundle
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or("读不到应用名")?;

    // 挂载点用独立目录：dmg 里可能只有一个 .app，也可能带「应用程序」快捷方式
    // -mountpoint 指向一个不存在的路径时 hdiutil 会自己建，别提前 mkdir
    let mount = std::env::temp_dir().join(format!("df-dmg-{}", std::process::id()));
    let _ = fs::remove_dir_all(&mount);

    let attach = Command::new("/usr/bin/hdiutil")
        .args(["attach", "-nobrowse", "-noverify", "-readonly", "-mountpoint"])
        .arg(&mount)
        .arg(dmg)
        .output()
        .map_err(|e| {
            let _ = fs::remove_dir_all(&mount);
            format!("挂载安装包失败：{e}")
        })?;
    if !attach.status.success() {
        let err = String::from_utf8_lossy(&attach.stderr).trim().to_string();
        let _ = fs::remove_dir_all(&mount);
        return Err(if err.is_empty() {
            "安装包挂载失败，文件可能已损坏".into()
        } else {
            format!("安装包挂载失败：{err}")
        });
    }

    let new_app = fs::read_dir(&mount).ok().and_then(|it| {
        it.filter_map(|e| e.ok())
            .map(|e| e.path())
            .find(|p| p.extension().and_then(|x| x.to_str()) == Some("app"))
    });
    let new_app = match new_app {
        Some(p) => p,
        None => {
            detach(&mount);
            return Err("安装包里没找到应用".into());
        }
    };

    // 先整体拷到目标同卷的暂存区：跨卷 rename 会失败，而正在运行的 .app
    // 直接往里覆盖写更容易踩到 inode 被占用，整目录换位最干净
    set_stage(app, "installing", "正在拷贝新版本…");
    let staging = parent.join(format!(".df-update-{}", std::process::id()));
    let _ = fs::remove_dir_all(&staging);
    if let Err(e) = fs::create_dir_all(&staging) {
        detach(&mount);
        return Err(format!("建不了暂存目录：{e}"));
    }
    let staged_app = staging.join(&name);
    let copied = Command::new("/usr/bin/ditto")
        .arg(&new_app)
        .arg(&staged_app)
        .output();
    detach(&mount);

    match copied {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            let err = String::from_utf8_lossy(&o.stderr).trim().to_string();
            let _ = fs::remove_dir_all(&staging);
            return Err(if err.is_empty() {
                "拷贝新版本失败（可能磁盘空间不足）".into()
            } else {
                format!("拷贝新版本失败：{err}")
            });
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!("拷贝新版本失败：{e}"));
        }
    }

    set_stage(app, "installing", "正在替换旧版本…");
    let backup = parent.join(format!(".{name}.old"));
    let _ = fs::remove_dir_all(&backup);
    if let Err(e) = fs::rename(bundle, &backup) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "没有权限替换「{name}」：{e}。可以改用浏览器下载安装包，拖进「应用程序」替换。"
        ));
    }
    if let Err(e) = fs::rename(&staged_app, bundle) {
        // 换不进去就把旧的挪回来，别让用户连游戏都没了
        let _ = fs::rename(&backup, bundle);
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("替换失败：{e}"));
    }
    let _ = fs::remove_dir_all(&backup);
    let _ = fs::remove_dir_all(&staging);

    // 我们下的是「无 quarantine 属性」的文件，正常情况下不会被拦；
    // 这一步只是兜底：从别处拷来的旧包被一起带进新目录时不至于二次拦截
    let _ = Command::new("/usr/bin/xattr")
        .args(["-dr", "com.apple.quarantine"])
        .arg(bundle)
        .output();
    Ok(())
}

fn detach(mount: &Path) {
    let _ = Command::new("/usr/bin/hdiutil")
        .args(["detach", "-quiet", "-force"])
        .arg(mount)
        .output();
    let _ = fs::remove_dir_all(mount);
}

#[tauri::command]
pub fn df_update_relaunch(app: AppHandle) -> Result<(), String> {
    let bundle = app_bundle().ok_or("找不到当前应用的位置")?;
    // -n：强制起一个新实例。旧实例随后自己退出，避免两个窗口抢同一份配置
    Command::new("/usr/bin/open")
        .arg("-n")
        .arg(&bundle)
        .spawn()
        .map_err(|e| format!("重启失败：{e}"))?;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        handle.exit(0);
    });
    Ok(())
}
