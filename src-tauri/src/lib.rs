use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// ========== 共享类型（与前端/Node侧车保持一致） ==========

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessingConfig {
    #[serde(rename = "workDir")]
    pub work_dir: String,
    #[serde(rename = "outputDir")]
    pub output_dir: String,
    #[serde(rename = "yearMonth")]
    pub year_month: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(rename = "currentFile")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_file: Option<String>,
    #[serde(rename = "fileIndex")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_index: Option<usize>,
    #[serde(rename = "totalFiles")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_files: Option<usize>,
    #[serde(rename = "rowsProcessed")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows_processed: Option<usize>,
    #[serde(rename = "totalRows")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_rows: Option<usize>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingResult {
    pub success: bool,
    #[serde(rename = "totalFiles")]
    pub total_files: usize,
    #[serde(rename = "processedFiles")]
    pub processed_files: usize,
    #[serde(rename = "totalRows")]
    pub total_rows: usize,
    #[serde(rename = "processedRows")]
    pub processed_rows: usize,
    #[serde(rename = "summaryFilePath")]
    pub summary_file_path: String,
    #[serde(rename = "targetFilePath")]
    pub target_file_path: String,
    #[serde(rename = "baseTablePath")]
    pub base_table_path: String,
    #[serde(rename = "baseDir")]
    pub base_dir: String,
    #[serde(rename = "unmatchedFiles")]
    pub unmatched_files: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CliInput {
    #[serde(rename = "workDir")]
    work_dir: String,
    #[serde(rename = "outputDir")]
    output_dir: String,
    #[serde(rename = "yearMonth")]
    year_month: String,
    #[serde(rename = "patternsPath")]
    patterns_path: String,
}

#[derive(Debug, Deserialize)]
struct CliProgress {
    #[serde(rename = "type")]
    msg_type: String,
    event: ProgressEvent,
}

#[derive(Debug, Deserialize)]
struct CliResult {
    #[serde(rename = "type")]
    msg_type: String,
    data: ProcessingResult,
}

#[derive(Debug, Serialize, Deserialize)]
struct DefaultDirs {
    #[serde(rename = "workDir")]
    work_dir: String,
    #[serde(rename = "outputDir")]
    output_dir: String,
}

// 应用状态：存储处理进程
struct AppState {
    child_process: Mutex<Option<std::process::Child>>,
}

// ========== Tauri 命令 ==========

#[tauri::command]
async fn select_directory(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = app
        .dialog()
        .file()
        .blocking_pick_folder();
    match result {
        Some(path) => {
            let path_str = path.into_path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            Ok(Some(path_str))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn get_default_directories() -> Result<DefaultDirs, String> {
    // 获取下载目录
    let download_dir = dirs_next()
        .or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .map(|p| PathBuf::from(p).join("Downloads"))
        })
        .unwrap_or_else(|| PathBuf::from("."));

    Ok(DefaultDirs {
        work_dir: download_dir.to_string_lossy().to_string(),
        output_dir: "H:\\0、工作\\0、每日纯销统计\\实时下载流向数据".to_string(),
    })
}

fn get_config_path() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();

    let candidates = vec![
        exe_dir.join("config").join("patterns.json"),
        PathBuf::from("config").join("patterns.json"),
    ];

    for p in &candidates {
        if p.exists() {
            return p.clone();
        }
    }
    candidates[0].clone()
}

#[tauri::command]
async fn open_config_file(_app: AppHandle) -> Result<(), String> {
    let config_path = get_config_path();
    // 使用系统默认程序打开文件
    open::that(config_path.to_string_lossy().to_string())
        .map_err(|e| format!("打开配置文件失败: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn open_directory(_app: AppHandle, dir_path: String) -> Result<(), String> {
    open::that(dir_path)
        .map_err(|e| format!("打开目录失败: {}", e))?;
    Ok(())
}

/// 读取指定 Excel 文件的表头行，返回表头字符串数组
#[tauri::command]
async fn read_excel_headers(file_path: String) -> Result<Vec<String>, String> {
    let node_exe = find_node_exe();
    let script = find_read_headers_js();

    log::info!("读取 Excel 表头: {}", file_path);

    let mut cmd = Command::new(&node_exe);
    cmd.arg(script.to_string_lossy().to_string())
        .arg(&file_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000);
    }

    let child = cmd.spawn()
        .map_err(|e| format!("启动读表头进程失败: {}", e))?;

    let output = child.wait_with_output()
        .map_err(|e| format!("等待读表头进程失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("读取表头失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let headers: Vec<String> = serde_json::from_str(&stdout)
        .map_err(|e| format!("解析表头 JSON 失败: {} — 原始输出: {}", e, stdout))?;

    Ok(headers)
}

#[derive(Debug, Deserialize)]
struct NewPatternInput {
    #[serde(rename = "businessUnit")]
    business_unit: String,
    headers: serde_json::Value,
    mapping: serde_json::Value,
}

/// 向 patterns.json 追加一条新的格式规则
#[tauri::command]
fn add_pattern(input: NewPatternInput) -> Result<String, String> {
    let config_path = get_config_path();

    // 1) 读取现有配置
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;

    let mut config: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;

    // 2) 生成新的 pattern name
    let patterns = config["patterns"].as_array()
        .ok_or("配置文件格式错误: patterns 不是数组")?;

    let mut max_num = 0u32;
    for p in patterns {
        if let Some(name) = p["name"].as_str() {
            if let Some(num_str) = name.strip_prefix("pattern") {
                if let Ok(n) = num_str.parse::<u32>() {
                    if n > max_num { max_num = n; }
                }
            }
        }
    }
    let new_name = format!("pattern{}", max_num + 1);

    // 3) 构建新 pattern
    let mut new_pattern = serde_json::json!({
        "name": new_name,
        "businessUnit": input.business_unit,
        "headers": input.headers,
        "mapping": input.mapping,
    });

    // 3.5) 清理未映射列，减少持久化文件大小
    sanitize_pattern(&mut new_pattern);

    // 4) 追加到 patterns 数组
    if let Some(arr) = config["patterns"].as_array_mut() {
        arr.push(new_pattern);
    } else {
        return Err("patterns 不是数组，无法追加".to_string());
    }

    // 5) 写回文件
    let formatted = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;

    std::fs::write(&config_path, formatted)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    log::info!("已添加新格式规则: {} ({})", new_name, input.business_unit);

    Ok(new_name)
}

fn find_node_exe() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();

    #[cfg(target_os = "windows")]
    let node_name = "node.exe";
    #[cfg(not(target_os = "windows"))]
    let node_name = "node";

    let candidates = vec![
        exe_dir.join("node-portable").join(node_name),
        PathBuf::from("node-portable").join(node_name),
    ];

    for p in &candidates {
        if p.exists() {
            return p.clone();
        }
    }

    PathBuf::from("node")
}

fn find_cli_js() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();

    let candidates = vec![
        exe_dir.join("dist").join("processing").join("cli.js"),
        PathBuf::from("dist").join("processing").join("cli.js"),
    ];

    for p in &candidates {
        if p.exists() {
            return p.clone();
        }
    }
    candidates[1].clone()
}

fn find_read_headers_js() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();

    let candidates = vec![
        exe_dir.join("dist").join("processing").join("read-headers.js"),
        PathBuf::from("dist").join("processing").join("read-headers.js"),
    ];

    for p in &candidates {
        if p.exists() {
            return p.clone();
        }
    }
    candidates[1].clone()
}

#[tauri::command]
async fn start_processing(
    app: AppHandle,
    state: State<'_, AppState>,
    config: ProcessingConfig,
) -> Result<ProcessingResult, String> {
    let node_exe = find_node_exe();
    let cli_js = find_cli_js();
    let patterns_path = get_config_path();

    log::info!("启动 Node.js 侧车: {} {}", node_exe.display(), cli_js.display());
    log::info!("patterns.json 路径: {}", patterns_path.display());

    let cli_input = CliInput {
        work_dir: config.work_dir,
        output_dir: config.output_dir,
        year_month: config.year_month,
        patterns_path: patterns_path.to_string_lossy().to_string(),
    };

    let input_json = serde_json::to_string(&cli_input)
        .map_err(|e| format!("序列化配置失败: {}", e))?;

    // 将配置写入临时文件，避免命令行参数转义问题
    let tmp_dir = std::path::Path::new(&cli_input.output_dir);
    let config_tmp_path = tmp_dir.join(format!(".cli_config_{}.json", std::process::id()));
    std::fs::write(&config_tmp_path, &input_json)
        .map_err(|e| format!("写入临时配置文件失败: {}", e))?;
    log::info!("临时配置文件: {}", config_tmp_path.display());

    let mut cmd = Command::new(&node_exe);
    cmd.arg(cli_js.to_string_lossy().to_string())
        .arg(config_tmp_path.to_string_lossy().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("启动处理进程失败: {}", e))?;

    // 在单独线程中读取 stderr，防止管道缓冲区满导致死锁
    let stderr = child.stderr.take();
    let stderr_handle = std::thread::spawn(move || {
        let mut err_output = String::new();
        if let Some(stderr) = stderr {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if !err_output.is_empty() {
                        err_output.push('\n');
                    }
                    err_output.push_str(&line);
                }
            }
        }
        err_output
    });

    // 读取 stdout，逐行解析进度事件
    let stdout = child
        .stdout
        .take()
        .ok_or("无法获取子进程 stdout")?;
    let reader = std::io::BufReader::new(stdout);

    let mut final_result: Option<ProcessingResult> = None;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("读取子进程输出失败: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }

        // 尝试解析为进度事件
        if let Ok(progress) = serde_json::from_str::<CliProgress>(&line) {
            if progress.msg_type == "progress" {
                let _ = app.emit("processing:progress", progress.event);
            }
        } else if let Ok(result) = serde_json::from_str::<CliResult>(&line) {
            if result.msg_type == "result" {
                final_result = Some(result.data);
            }
        }
    }

    // 等待子进程结束
    let status = child
        .wait()
        .map_err(|e| format!("等待处理进程结束失败: {}", e))?;

    // 获取 stderr 输出
    let stderr_output = stderr_handle
        .join()
        .unwrap_or_default();

    // 清理临时配置文件
    let _ = std::fs::remove_file(&config_tmp_path);

    if !stderr_output.is_empty() {
        log::info!("处理进程 stderr:\n{}", stderr_output);
    }
    if !status.success() {
        log::error!("处理进程异常退出, exit code: {:?}", status.code());
    }

    // 释放子进程锁
    {
        let mut proc = state.child_process.lock().unwrap();
        *proc = None;
    }

    match final_result {
        Some(result) => {
            // 处理完成后打开基表文件和目录
            if result.success {
                if !result.base_table_path.is_empty() {
                    if let Err(e) = open::that(&result.base_table_path) {
                        log::warn!("打开基表文件失败: {} - {}", result.base_table_path, e);
                    }
                }
                if !result.base_dir.is_empty() {
                    if let Err(e) = open::that(&result.base_dir) {
                        log::warn!("打开目录失败: {} - {}", result.base_dir, e);
                    }
                }
            }
            Ok(result)
        }
        None => {
            let mut err_msg = "未收到处理结果".to_string();
            if !stderr_output.is_empty() {
                err_msg.push_str("\nstderr:\n");
                err_msg.push_str(&stderr_output);
            }
            Err(err_msg)
        }
    }
}

fn dirs_next() -> Option<PathBuf> {
    // 简单的 Windows 下载目录获取
    std::env::var("USERPROFILE")
        .ok()
        .map(|p| PathBuf::from(p).join("Downloads"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            child_process: Mutex::new(None),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_directory,
            get_default_directories,
            open_config_file,
            open_directory,
            read_excel_headers,
            add_pattern,
            start_processing,
            get_patterns_config,
            update_pattern,
            delete_pattern,
            export_patterns_file,
            import_patterns_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
// ========== 配置文件 Web UI 管理命令 ==========

/// 清理 pattern 数据：移除未映射（headers 中存在但 mapping 中不存在或 target 非法）的列，
/// 减少持久化文件大小。前后端都会做这个过滤，前后端都做以确保数据洁净。
fn sanitize_pattern(pattern: &mut serde_json::Value) {
    // 第一步：用不可变借用，收集需要清理的列号
    let to_remove: Vec<String> = match (
        pattern.get("headers").and_then(|v| v.as_object()),
        pattern.get("mapping").and_then(|v| v.as_object()),
    ) {
        (Some(h), Some(m)) => h
            .keys()
            .filter(|k| match m.get(*k).and_then(|v| v.as_i64()) {
                Some(v) => !(1..=6).contains(&v),
                None => true,
            })
            .cloned()
            .collect(),
        _ => return,
    };
    // 第二步：分两次可变借用真正删除
    if let Some(h) = pattern.get_mut("headers").and_then(|v| v.as_object_mut()) {
        for k in &to_remove { h.remove(k); }
    }
    if let Some(m) = pattern.get_mut("mapping").and_then(|v| v.as_object_mut()) {
        for k in &to_remove { m.remove(k); }
    }
}

/// 读取完整的 patterns.json 配置
#[tauri::command]
fn get_patterns_config() -> Result<String, String> {
    let config_path = get_config_path();
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    Ok(raw)
}

/// 更新指定名称的 pattern
#[tauri::command]
fn update_pattern(name: String, pattern_data: serde_json::Value) -> Result<bool, String> {
    let config_path = get_config_path();
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    let mut config: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;
    let patterns = config["patterns"].as_array_mut()
        .ok_or("配置文件格式错误: patterns 不是数组")?;
    let mut found = false;
    for pat in patterns.iter_mut() {
        if pat["name"].as_str() == Some(&name) {
            if let Some(bu) = pattern_data.get("businessUnit") {
                pat["businessUnit"] = bu.clone();
            }
            if let Some(hdrs) = pattern_data.get("headers") {
                pat["headers"] = hdrs.clone();
            }
            if let Some(mapping) = pattern_data.get("mapping") {
                pat["mapping"] = mapping.clone();
            }
            // 清理未映射列
            sanitize_pattern(pat);
            found = true;
            break;
        }
    }
    if !found {
        return Err(format!("未找到名为 {} 的格式规则", name));
    }
    let formatted = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, formatted)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    log::info!("已更新格式规则: {}", name);
    Ok(true)
}

/// 删除指定名称的 pattern
#[tauri::command]
fn delete_pattern(name: String) -> Result<bool, String> {
    let config_path = get_config_path();
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    let mut config: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;
    let patterns = config["patterns"].as_array_mut()
        .ok_or("配置文件格式错误: patterns 不是数组")?;
    let original_len = patterns.len();
    patterns.retain(|pat| pat["name"].as_str() != Some(&name));
    if patterns.len() == original_len {
        return Err(format!("未找到名为 {} 的格式规则", name));
    }
    let formatted = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, formatted)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    log::info!("已删除格式规则: {}", name);
    Ok(true)
}

/// 导出 patterns.json 到用户选择的文件
#[tauri::command]
async fn export_patterns_file(app: AppHandle, json: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use std::io::Write;
    let path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name("patterns.json")
        .blocking_save_file();
    match path {
        Some(p) => {
            let path_buf = p.into_path().map_err(|e| format!("解析路径失败: {}", e))?;
            let mut file = std::fs::File::create(&path_buf)
                .map_err(|e| format!("创建文件失败: {}", e))?;
            file.write_all(json.as_bytes())
                .map_err(|e| format!("写入文件失败: {}", e))?;
            log::info!("已导出配置到: {}", path_buf.display());
            Ok(Some(path_buf.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// 从用户选择的 JSON 文件读取配置内容
#[tauri::command]
async fn import_patterns_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    match path {
        Some(p) => {
            let path_buf = p.into_path().map_err(|e| format!("解析路径失败: {}", e))?;
            let content = std::fs::read_to_string(&path_buf)
                .map_err(|e| format!("读取文件失败: {}", e))?;
            log::info!("已读取导入文件: {} ({} 字节)", path_buf.display(), content.len());
            Ok(Some(content))
        }
        None => Ok(None),
    }
}

