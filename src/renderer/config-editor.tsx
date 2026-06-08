/** @jsxImportSource preact */
import { h, render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';

// ============== 常量 ==============

const FIELD_NAME = { 1: '日期', 2: '品种', 3: '规格', 4: '批号', 5: '流向单位', 6: '数量' };

// ============== 通用组件 ==============

function Toast({ toast }) {
  if (!toast || !toast.show) return null;
  return (
    <div class={'toast ' + (toast.type === 'success' ? 'toast-success' : 'toast-error')}>
      {toast.message}
    </div>
  );
}

// ============== 规则卡片（只读） ==============

function PatternCard({ pattern, index }) {
  const headers = pattern.headers || {};
  const mapping = pattern.mapping || {};
  const headerCount = Object.keys(headers).length;
  const mappingCount = Object.keys(mapping).length;
  const sortedCols = Object.keys(headers).sort((a, b) => Number(a) - Number(b));

  return (
    <div class="pattern-card">
      <div class="pattern-card-header">
        <div>
          <div class="pattern-name">
            <span class="pattern-index">#{index + 1}</span>
            {pattern.name}
          </div>
          <div class="pattern-unit">商业单位：{pattern.businessUnit || '(未设置)'}</div>
        </div>
        <div class="pattern-meta">
          <span>表头字段 <strong>{headerCount}</strong></span>
          <span>映射字段 <strong>{mappingCount}</strong></span>
        </div>
      </div>
      <div class="mapping-preview">
        <strong>字段映射：</strong>
        {sortedCols.length === 0 ? (
          <div class="empty-state" style="padding: 14px;">该规则未配置字段映射</div>
        ) : (
          <div class="mapping-grid">
            {sortedCols.map((col) => {
              const tgt = mapping[col];
              return (
                <div key={col} class="mapping-grid-row">
                  <span class="mapping-label">{FIELD_NAME[tgt] || <em class="muted">(未映射)</em>}</span>
                  <span class="mapping-arrow">&rarr;</span>
                  <span class="mapping-source">{headers[col]}</span>
                  <span class="mapping-target">[列 {col}]</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== 主应用 ==============

function App() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [keyword, setKeyword] = useState('');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 等待 tauri-bridge 模块加载
      for (let i = 0; i < 5; i++) {
        if (window.electronAPI) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelled) return;
      try {
        const json = await window.electronAPI.getPatternsConfig();
        const cfg = JSON.parse(json);
        setPatterns(cfg.patterns || []);
      } catch (e) {
        showToast('加载配置失败: ' + (e.message || e), 'error');
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return patterns;
    return patterns.filter((p) =>
      (p.name || '').toLowerCase().includes(k) ||
      (p.businessUnit || '').toLowerCase().includes(k) ||
      Object.values(p.headers || {}).some((v) => String(v).toLowerCase().includes(k))
    );
  }, [patterns, keyword]);

  const stats = useMemo(() => {
    const units = new Set();
    let totalMappings = 0;
    for (const p of patterns) {
      if (p.businessUnit) units.add(p.businessUnit);
      totalMappings += Object.keys(p.mapping || {}).length;
    }
    return {
      patternCount: patterns.length,
      unitCount: units.size,
      totalMappings,
    };
  }, [patterns]);

  return (
    <div class="container">
      <Toast toast={toast} />
      <a href="index.html" class="back-link">&larr; 返回主页面</a>
      <header>
        <h1>配置文件查看器</h1>
      </header>

      <div class="readonly-banner">
        <span class="readonly-icon">&#128274;</span>
        <span>当前为<strong>只读</strong>模式</span>
      </div>

      {loading && <div class="loading">正在加载配置...</div>}

      {!loading && (
        <>
          <div class="stat-row">
            <div class="stat-card">
              <div class="stat-value">{stats.patternCount}</div>
              <div class="stat-label">格式规则</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.unitCount}</div>
              <div class="stat-label">商业单位</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.totalMappings}</div>
              <div class="stat-label">字段映射总数</div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span>
                格式规则列表 (显示 <strong>{filtered.length}</strong> / {patterns.length} 条)
              </span>
              <div class="search-box">
                <input
                  type="text"
                  class="form-input search-input"
                  placeholder="搜索规则名 / 商业单位 / 表头..."
                  value={keyword}
                  onInput={(e) => setKeyword(e.currentTarget.value)}
                />
                {keyword && (
                  <button class="search-clear" onClick={() => setKeyword('')} title="清空搜索">&times;</button>
                )}
              </div>
            </div>
            <div class="card-body">
              {patterns.length === 0 ? (
                <div class="empty-state">
                  <p>暂无格式规则</p>
                  <p class="muted" style="margin-top: 6px;">在主页面处理文件后，对未识别的文件使用"用户自新增"即可添加规则</p>
                </div>
              ) : filtered.length === 0 ? (
                <div class="empty-state">没有匹配 "<strong>{keyword}</strong>" 的规则</div>
              ) : (
                <div class="pattern-list">
                  {filtered.map((p, i) => (
                    <PatternCard key={p.name} pattern={p} index={patterns.indexOf(p)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

render(<App />, document.getElementById('app'));
