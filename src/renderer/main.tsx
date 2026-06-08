/** @jsxImportSource preact */
import { h, render } from 'preact';
import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';

// ============== 工具函数 ==============

function pad2(n) { return String(n).padStart(2, '0'); }

function formatTime(d) {
  return d.getFullYear() + '年' + pad2(d.getMonth() + 1) + '月' + pad2(d.getDate()) + '日 '
    + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function getTimeShort(d) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

const FIELD_TARGETS = [
  { value: 1, label: '日期' },
  { value: 2, label: '品种' },
  { value: 3, label: '规格' },
  { value: 4, label: '批号' },
  { value: 5, label: '流向单位' },
  { value: 6, label: '数量' },
];

// ============== YearMonthPicker ==============

function YearMonthPicker({ disabled, onReady }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let defaultYear = currentYear;
  let defaultMonth = currentMonth;
  if (currentDay > 20) {
    if (currentMonth === 12) { defaultYear = currentYear + 1; defaultMonth = 1; }
    else { defaultMonth = currentMonth + 1; }
  }

  const years = useMemo(() => {
    const arr = [];
    for (let y = 2024; y <= currentYear + 1; y++) arr.push(y);
    return arr;
  }, [currentYear]);

  const months = useMemo(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], []);

  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [nowTime, setNowTime] = useState(formatTime(new Date()));

  useEffect(() => {
    const t = setInterval(() => setNowTime(formatTime(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (onReady) {
      onReady({
        getYear: () => selectedYear,
        getMonth: () => selectedMonth,
        getYearMonth: () => selectedYear + '年' + selectedMonth + '月',
      });
    }
  }, [selectedYear, selectedMonth, onReady]);

  return (
    <div class="input-group">
      <div class="label-row">
        <label>选择年月</label>
        <span class="sys-time">{nowTime}</span>
      </div>
      <div class="input-row year-month-row">
        <select
          class="year-select"
          disabled={disabled}
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.currentTarget.value))}
        >
          {years.map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
        <span class="year-month-sep">年</span>
        <select
          class="month-select"
          disabled={disabled}
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.currentTarget.value))}
        >
          {months.map((m) => <option key={m} value={m}>{m}月</option>)}
        </select>
        <span class="year-month-sep">月</span>
      </div>
    </div>
  );
}

// ============== DirectoryPicker ==============

function DirectoryPicker({ label, disabled, value, placeholder, onChange }) {
  const browse = async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.selectDirectory();
    if (dir) onChange(dir);
  };
  return (
    <div class="input-group">
      <label>{label}</label>
      <div class="input-row">
        <input
          type="text"
          value={value || ''}
          placeholder={placeholder}
          readonly
          disabled={disabled}
        />
        <button class="btn-browse" disabled={disabled} onClick={browse}>浏览...</button>
      </div>
    </div>
  );
}

// ============== ActionPanel ==============

function ActionPanel({ isProcessing, progress, theme, onStart, onViewConfig, onExportConfig, onImportConfig, onToggleTheme }) {
  return (
    <section class="action-panel">
      <button class="btn-process" disabled={isProcessing} onClick={onStart}>开始处理</button>
      <button class="btn-edit-config" disabled={isProcessing} onClick={onExportConfig}>导出配置</button>
      <button class="btn-edit-config" disabled={isProcessing} onClick={onImportConfig}>导入配置</button>
      <button class="btn-edit-config" disabled={isProcessing} onClick={onViewConfig}>查看配置</button>
      <button class="btn-theme-toggle" disabled={isProcessing} onClick={onToggleTheme} title={'当前：' + (theme === 'dark' ? '深色' : '浅色') + '主题，点击切换'}>
        <span class="theme-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
        <span class="theme-label">{theme === 'dark' ? '浅色' : '深色'}</span>
      </button>
      {progress.visible && (
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" style={{ width: progress.percent + '%' }}></div>
          </div>
          <span class="progress-text">{progress.text}</span>
        </div>
      )}
    </section>
  );
}

// ============== LogPanel ==============

function LogPanel({ entries, onClear }) {
  const logAreaRef = useRef(null);
  useEffect(() => {
    if (logAreaRef.current) logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
  }, [entries.length]);
  return (
    <section class="log-panel">
      <div class="log-header">
        <span>处理日志</span>
        <button class="btn-clear" onClick={onClear}>清空</button>
      </div>
      <div class="log-area" ref={logAreaRef}>
        {entries.map((e, idx) => (
          <div key={idx} class={'log-entry log-' + e.type}>
            [{e.time}] {e.message}
          </div>
        ))}
      </div>
    </section>
  );
}

// ============== UserAddForm ==============

function UserAddForm({ files, initialFile, workDir, onSubmit, onCancel }) {
  const [selectedFile, setSelectedFile] = useState(initialFile || (files.length > 0 ? files[0] : ''));
  const [businessUnit, setBusinessUnit] = useState('');
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [readError, setReadError] = useState('');
  const [mapDate, setMapDate] = useState('');
  const [mapProduct, setMapProduct] = useState('');
  const [mapSpec, setMapSpec] = useState('');
  const [mapBatch, setMapBatch] = useState('');
  const [mapUnit, setMapUnit] = useState('');
  const [mapQuantity, setMapQuantity] = useState('');
  const [dateShort, setDateShort] = useState(false);

  const resetMaps = () => {
    setMapDate(''); setMapProduct(''); setMapSpec('');
    setMapBatch(''); setMapUnit(''); setMapQuantity('');
    setDateShort(false); setReadError('');
  };

  const loadHeaders = useCallback(async (file) => {
    resetMaps();
    setExcelHeaders([]);
    if (!file) { setReadError('未指定文件'); return; }
    if (!window.electronAPI) { setReadError('API 未就绪，请稍后重试'); return; }
    const fullPath = workDir
      ? (workDir.replace(/[/\\]$/, '') + '\\' + file)
      : file;
    setLoadingHeaders(true);
    try {
      const hdrs = await window.electronAPI.readExcelHeaders(fullPath);
      const list = Array.isArray(hdrs) ? hdrs : [];
      setExcelHeaders(list);
      if (list.length === 0) setReadError('未读取到表头数据，请检查文件路径: ' + fullPath);
    } catch (e) {
      setExcelHeaders([]);
      setReadError('读取表头失败: ' + (e.message || e));
    } finally {
      setLoadingHeaders(false);
    }
  }, [workDir]);

  useEffect(() => {
    if (selectedFile) loadHeaders(selectedFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (e) => {
    const f = e.currentTarget.value;
    setSelectedFile(f);
    loadHeaders(f);
  };

  const canSubmit = !!businessUnit && !!selectedFile;

  const buildFormData = () => {
    const hdrs = {};
    const srcMapping = {};
    const refs = [
      [mapDate, 1], [mapProduct, 2], [mapSpec, 3],
      [mapBatch, 4], [mapUnit, 5], [mapQuantity, 6],
    ];
    // 只写入已被用户映射的列（既在 mapping 也在 header），未映射的列不持久化
    for (const [v, target] of refs) {
      if (v !== '' && v !== null && v !== undefined) {
        const col = String(Number(v));
        srcMapping[col] = target;
        const idx = Number(v) - 1;
        if (excelHeaders[idx] != null) hdrs[col] = excelHeaders[idx];
      }
    }
    return {
      businessUnit: businessUnit,
      headers: hdrs,
      mapping: srcMapping,
      dateFormat: { short: dateShort, long: false },
    };
  };

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="modal-dialog">
        <div class="modal-header">
          <h2>新增格式规则</h2>
          <button class="modal-close" onClick={onCancel}>&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>选择未识别文件</label>
            <select class="form-select" value={selectedFile} onChange={handleFileChange}>
              <option value="">-- 请选择 --</option>
              {files.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div class="form-group">
            <label>商业单位名称</label>
            <input
              type="text"
              class="form-input"
              value={businessUnit}
              onInput={(e) => setBusinessUnit(e.currentTarget.value)}
              placeholder="请输入商业单位全称..."
            />
            {loadingHeaders && <span class="form-hint">正在读取表头...</span>}
          </div>
          {readError && (
            <div class="form-group">
              <div class="read-error">{readError}</div>
            </div>
          )}
          {excelHeaders.length > 0 && (
            <div class="form-group">
              <label>原表内表头名称（选择每个标准字段对应的 Excel 列）</label>
              <div class="mapping-table">
                <div class="mapping-row mapping-row-header">
                  <span class="mapping-label">标准字段</span>
                  <span class="mapping-select-col">原表内表头名称</span>
                  <span class="mapping-format-col">格式要求</span>
                </div>
                <MappingRow label="日期" options={excelHeaders} value={mapDate} onChange={setMapDate} format={
                  <label class="checkbox-label">
                    <input type="checkbox" checked={dateShort} onChange={(e) => setDateShort(e.currentTarget.checked)} />
                    短日期
                  </label>
                } />
                <MappingRow label="品种" options={excelHeaders} value={mapProduct} onChange={setMapProduct} format="常规" />
                <MappingRow label="规格" options={excelHeaders} value={mapSpec} onChange={setMapSpec} format="常规" />
                <MappingRow label="批号" options={excelHeaders} value={mapBatch} onChange={setMapBatch} format="常规" />
                <MappingRow label="流向单位" options={excelHeaders} value={mapUnit} onChange={setMapUnit} format="常规" />
                <MappingRow label="数量" options={excelHeaders} value={mapQuantity} onChange={setMapQuantity} format="数字" />
              </div>
            </div>
          )}
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" onClick={onCancel}>取消</button>
          <button class="btn-submit" disabled={!canSubmit} onClick={() => onSubmit(buildFormData())}>提交</button>
        </div>
      </div>
    </div>
  );
}

function MappingRow({ label, options, value, onChange, format }) {
  return (
    <div class="mapping-row">
      <span class="mapping-label">{label}</span>
      <select
        class="form-select mapping-select"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        <option value="">--- 不映射 ---</option>
        {options.map((h, i) => <option key={i} value={i + 1}>{h}</option>)}
      </select>
      <span class="mapping-format">{format}</span>
    </div>
  );
}

// ============== App ==============

// 校验导入的配置 JSON 结构是否符合 patterns.json 规范
function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
  if (!Array.isArray(cfg.patterns)) return false;
  for (const p of cfg.patterns) {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.name !== 'string' || !p.name.trim()) return false;
    if (typeof p.businessUnit !== 'string') return false;
    if (!p.headers || typeof p.headers !== 'object' || Array.isArray(p.headers)) return false;
    if (!p.mapping || typeof p.mapping !== 'object' || Array.isArray(p.mapping)) return false;
  }
  return true;
}

// 导入失败弹窗
function ImportErrorModal({ onClose }) {
  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-dialog" style="width: 380px; max-width: 94vw;">
        <div class="modal-header">
          <h2>导入失败</h2>
          <button class="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div class="modal-body" style="text-align: center; padding: 28px 24px;">
          <div class="import-error-icon">&#9888;</div>
          <p class="import-error-text">配置文件校验未通过</p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

// 主题：深色（默认）/ 浅色
const THEME_KEY = 'retailsalesshort.theme';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (_) { /* localStorage 不可用时忽略 */ }
  return 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [workDir, setWorkDir] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [unmatchedFiles, setUnmatchedFiles] = useState([]);
  const [logEntries, setLogEntries] = useState([]);
  const [progress, setProgress] = useState({ visible: false, percent: 0, text: '0%' });
  const [showUserAddForm, setShowUserAddForm] = useState(false);
  const [selectedUserFile, setSelectedUserFile] = useState('');
  const [importErrorVisible, setImportErrorVisible] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  // 初始应用主题
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
      return next;
    });
  };

  const ymRef = useRef(null);

  const addLog = (message, type = 'info') => {
    setLogEntries((arr) => [...arr, { message, type, time: getTimeShort(new Date()) }]);
  };

  useEffect(() => {
    addLog('就绪，请选择年月和工作目录后点击"开始处理"。', 'info');
  }, []);

  const clearLog = () => {
    setLogEntries([]);
    setTimeout(() => addLog('日志已清空', 'info'), 0);
  };

  const updateProgress = (pct, text) => {
    setProgress({ visible: true, percent: pct, text: text || (pct + '%') });
  };
  const hideProgress = () => setProgress({ visible: false, percent: 0, text: '0%' });

  const handleViewConfig = () => {
    if (isProcessing) return;
    window.location.href = 'config-editor.html';
  };

  const handleExportConfig = async () => {
    if (isProcessing) return;
    if (!window.electronAPI) return;
    addLog('正在导出配置...', 'info');
    try {
      const json = await window.electronAPI.getPatternsConfig();
      const saved = await window.electronAPI.exportPatterns(json);
      if (saved) {
        addLog('已导出配置到: ' + saved, 'success');
      } else {
        addLog('已取消导出', 'info');
      }
    } catch (e) {
      addLog('导出失败: ' + (e.message || e), 'error');
    }
  };

  const handleImportConfig = async () => {
    if (isProcessing) return;
    if (!window.electronAPI) return;
    try {
      const json = await window.electronAPI.importPatterns();
      if (!json) { addLog('已取消导入', 'info'); return; }
      let cfg;
      try { cfg = JSON.parse(json); } catch { setImportErrorVisible(true); return; }
      if (!validateConfig(cfg)) { setImportErrorVisible(true); return; }
      // 校验通过：清空旧规则，逐条追加
      addLog('正在导入配置（' + cfg.patterns.length + ' 条规则）...', 'info');
      try {
        const current = JSON.parse(await window.electronAPI.getPatternsConfig());
        for (const p of (current.patterns || [])) {
          await window.electronAPI.deletePattern(p.name);
        }
        for (const p of cfg.patterns) {
          await window.electronAPI.addPattern({
            businessUnit: p.businessUnit,
            headers: p.headers,
            mapping: p.mapping,
          });
        }
        addLog('导入成功，共 ' + cfg.patterns.length + ' 条规则', 'success');
      } catch (e) {
        addLog('应用导入的配置失败: ' + (e.message || e), 'error');
        setImportErrorVisible(true);
      }
    } catch (e) {
      addLog('导入失败: ' + (e.message || e), 'error');
      setImportErrorVisible(true);
    }
  };

  const handleUserAdd = (filename) => {
    if (!unmatchedFiles.length) {
      addLog('没有未匹配的文件，无法自新增格式', 'error');
      return;
    }
    setSelectedUserFile(filename);
    setShowUserAddForm(true);
  };

  const handleFormSubmit = async (formData) => {
    if (!window.electronAPI) { addLog('API 未就绪', 'error'); return; }
    addLog('正在新增格式规则...', 'info');
    try {
      const newName = await window.electronAPI.addPattern(formData);
      addLog('已成功添加格式规则: ' + newName + ' (' + formData.businessUnit + ')', 'success');
      addLog('请重新点击"开始处理"以使用新规则', 'info');
      setShowUserAddForm(false);
      setUnmatchedFiles((arr) => arr.filter((f) => f !== selectedUserFile));
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e.message || String(e));
      addLog('新增格式规则失败: ' + msg, 'error');
    }
  };

  const handleStartProcess = async () => {
    if (!window.electronAPI) { addLog('API 未就绪，请稍后重试', 'error'); return; }
    const ym = ymRef.current;
    if (!ym) return;
    const year = ym.getYear();
    const month = ym.getMonth();
    const yearMonth = ym.getYearMonth();
    if (!year || !month) { addLog('请选择年份和月份', 'error'); return; }
    if (!workDir) { addLog('请选择工作目录', 'error'); return; }
    if (!outputDir) { addLog('请选择输出目录', 'error'); return; }

    setUnmatchedFiles([]);
    setIsProcessing(true);
    updateProgress(0, '准备...');
    addLog('========== 开始处理 ==========', 'info');
    addLog('选择年月: ' + yearMonth, 'info');
    addLog('工作目录: ' + workDir, 'info');
    addLog('输出目录: ' + outputDir, 'info');

    window.electronAPI.onProgress((event) => {
      switch (event.type) {
        case 'scanning':
        case 'processing':
          if (event.totalRows && event.totalRows > 0 && event.rowsProcessed !== undefined) {
            updateProgress(Math.round((event.rowsProcessed / event.totalRows) * 100));
          }
          addLog(event.message, 'info');
          break;
        case 'writing':
          addLog(event.message, 'success');
          break;
        case 'cleaning':
          addLog(event.message, 'info');
          break;
        case 'error':
          addLog(event.message, 'error');
          break;
        case 'complete':
          addLog(event.message, 'success');
          addLog('========== 处理完成 ==========', 'success');
          break;
      }
    });

    try {
      const result = await window.electronAPI.startProcessing({
        workDir, outputDir, yearMonth,
      });
      window.electronAPI.removeProgressListener();

      if (result.unmatchedFiles && result.unmatchedFiles.length > 0) {
        setUnmatchedFiles(result.unmatchedFiles);
        addLog(
          '发现 ' + result.unmatchedFiles.length + ' 个未识别的文件格式，请点击"修改配置"按钮添加对应格式规则',
          'error'
        );
      }
      if (result.success) {
        addLog(
          '总计: ' + result.processedFiles + '/' + result.totalFiles + ' 个文件, ' + result.processedRows + ' 行数据',
          'success'
        );
        if (result.summaryFilePath) addLog('汇总文件: ' + result.summaryFilePath, 'success');
        updateProgress(100, '完成');
        setTimeout(hideProgress, 3000);
      } else {
        if (result.unmatchedFiles && result.unmatchedFiles.length > 0) {
          addLog('处理完成，但有未识别的文件格式', 'error');
        }
        if (result.errors && result.errors.length > 0) {
          addLog('处理过程中出现错误，详见上方日志', 'error');
        }
      }
      if (result.errors && result.errors.length > 0) {
        addLog('错误详情:', 'error');
        result.errors.forEach((e) => addLog('  - ' + e, 'error'));
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err.message || String(err));
      addLog('处理异常: ' + msg, 'error');
      hideProgress();
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tryInit = async () => {
        if (!window.electronAPI) {
          await new Promise((r) => setTimeout(r, 100));
          if (cancelled) return false;
          if (!window.electronAPI) return false;
        }
        try {
          const defaults = await window.electronAPI.getDefaultDirectories();
          if (cancelled) return true;
          setWorkDir(defaults.workDir || '');
          setOutputDir(defaults.outputDir || '');
        } catch (_) { /* ignore */ }
        return true;
      };
      let ok = false;
      for (let i = 0; i < 5 && !ok; i++) ok = await tryInit();
    })();
    return () => { cancelled = true; };
  }, []);

  const hasUnmatched = unmatchedFiles.length > 0;

  return (
    <div class="container">
      <header>
        <h1>流向整理工具</h1>
        <p class="subtitle">每日网上下载出库汇总</p>
      </header>

      <section class="config-panel">
        <YearMonthPicker disabled={isProcessing} onReady={(api) => { ymRef.current = api; }} />
        <DirectoryPicker
          label="工作目录（Excel文件所在目录）"
          disabled={isProcessing}
          value={workDir}
          placeholder="选择包含 .xls/.xlsx 文件的目录..."
          onChange={setWorkDir}
        />
        <DirectoryPicker
          label="输出目录（汇总文件保存位置）"
          disabled={isProcessing}
          value={outputDir}
          placeholder="选择汇总文件输出目录..."
          onChange={setOutputDir}
        />
      </section>

      <ActionPanel
        isProcessing={isProcessing}
        progress={progress}
        theme={theme}
        onStart={handleStartProcess}
        onViewConfig={handleViewConfig}
        onExportConfig={handleExportConfig}
        onImportConfig={handleImportConfig}
        onToggleTheme={toggleTheme}
      />

      {hasUnmatched && (
        <section class="unmatched-panel">
          <div class="unmatched-header">
            <span class="unmatched-icon">&#9888;</span>
            <span>以下文件格式未识别，请为每个文件点击"用户自新增"添加格式规则</span>
          </div>
          <div class="unmatched-list">
            {unmatchedFiles.map((f) => (
              <div key={f} class="unmatched-item-row">
                <span class="unmatched-item">{f}</span>
                <button class="btn-user-add" onClick={() => handleUserAdd(f)}>用户自新增</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {showUserAddForm && (
        <UserAddForm
          files={unmatchedFiles}
          initialFile={selectedUserFile}
          workDir={workDir}
          onSubmit={handleFormSubmit}
          onCancel={() => setShowUserAddForm(false)}
        />
      )}

      <LogPanel entries={logEntries} onClear={clearLog} />

      {importErrorVisible && (
        <ImportErrorModal onClose={() => setImportErrorVisible(false)} />
      )}
    </div>
  );
}

render(<App />, document.getElementById('app'));
