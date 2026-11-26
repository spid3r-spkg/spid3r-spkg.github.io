/**
 * app.js — Interactive UI controller for the Spid3r Network Tools workbench.
 */
(function () {
  'use strict';

  var NT = window.NetTools || {};
  var Categories = NT.Categories || [];
  var Tools = NT.Tools || [];
  var getTool = NT.getTool;
  var CMD = NT.OsCommands;
  var API = NT.ApiClient;

  var state = {
    activeToolId: Tools[0] ? Tools[0].id : 'ping',
    searchQuery: '',
    modeFilter: '',
    collapsedCats: {},
    activeOsTab: 'windows',
    viewMode: 'terminal',
    formValues: {},
    authorized: false,
    running: false,
    abortCtrl: null,
    lastResult: null,
    history: []
  };

  function el(id) { return document.getElementById(id); }

  function detectDefaultOs() {
    var ua = (navigator.userAgent || '').toLowerCase();
    if (ua.indexOf('win') !== -1) return 'windows';
    if (ua.indexOf('mac') !== -1) return 'macos';
    if (ua.indexOf('linux') !== -1) return 'linux';
    return 'windows';
  }
  state.activeOsTab = detectDefaultOs();

  // ---- Theme ----
  var themeBtn = el('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var root = document.documentElement;
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('spkg-reg-theme', next); } catch (e) {}
    });
  }

  // ---- Clipboard Helper ----
  function copyText(text, btn) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (!btn) return;
        var prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = prev; }, 1200);
      });
    }
  }

  // ---- Mobile Drawer ----
  var sidebarEl = el('sidebar');
  var drawerBackdrop = el('drawerBackdrop');
  function setDrawer(open) {
    sidebarEl.classList.toggle('open', !!open);
    drawerBackdrop.classList.toggle('open', !!open);
  }
  if (el('mobileMenuBtn')) el('mobileMenuBtn').addEventListener('click', function () { setDrawer(true); });
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', function () { setDrawer(false); });

  // ---- Sidebar Render ----
  function renderSidebar() {
    var container = el('sidebarCats');
    container.textContent = '';
    var q = state.searchQuery.trim().toLowerCase();
    var mf = state.modeFilter;

    var totalShown = 0;
    Categories.forEach(function (cat) {
      var catTools = Tools.filter(function (t) {
        if (t.category !== cat.id) return false;
        if (mf && t.mode !== mf) return false;
        if (!q) return true;
        return t.name.toLowerCase().indexOf(q) !== -1
          || t.shortDesc.toLowerCase().indexOf(q) !== -1
          || t.id.toLowerCase().indexOf(q) !== -1
          || cat.name.toLowerCase().indexOf(q) !== -1;
      });
      if (!catTools.length) return;
      totalShown += catTools.length;

      var group = document.createElement('div');
      group.className = 'cat-group' + (state.collapsedCats[cat.id] && !q ? ' collapsed' : '');

      var catBtn = document.createElement('button');
      catBtn.type = 'button';
      catBtn.className = 'cat-btn';
      var lbl = document.createElement('span');
      lbl.textContent = cat.icon + ' ' + cat.name + ' (' + catTools.length + ')';
      var chev = document.createElement('span');
      chev.textContent = group.classList.contains('collapsed') ? '+' : '−';
      catBtn.appendChild(lbl);
      catBtn.appendChild(chev);
      catBtn.addEventListener('click', function () {
        state.collapsedCats[cat.id] = !state.collapsedCats[cat.id];
        renderSidebar();
      });

      var list = document.createElement('div');
      list.className = 'cat-items';
      catTools.forEach(function (t) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tool-nav-btn' + (t.id === state.activeToolId ? ' active' : '');
        var nameSpan = document.createElement('span');
        nameSpan.textContent = t.name;
        var dot = document.createElement('span');
        dot.className = 'mode-dot ' + t.mode;
        dot.title = 'Execution mode: ' + t.mode;
        btn.appendChild(nameSpan);
        btn.appendChild(dot);
        btn.addEventListener('click', function () {
          selectTool(t.id);
          setDrawer(false);
        });
        list.appendChild(btn);
      });

      group.appendChild(catBtn);
      group.appendChild(list);
      container.appendChild(group);
    });

    if (!totalShown) {
      var empty = document.createElement('div');
      empty.className = 'cmd-note';
      empty.style.padding = '0.8rem 0.4rem';
      empty.textContent = 'No diagnostic tools match "' + state.searchQuery + '".';
      container.appendChild(empty);
    }
  }

  // ---- Form & Command Sync ----
  function initFormDefaults(tool) {
    var vals = {};
    (tool.fields || []).forEach(function (f) {
      vals[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
    });
    state.formValues = vals;
    state.authorized = !tool.requiresAuth;
  }

  function updateCommandBar() {
    var tool = getTool(state.activeToolId);
    var built = CMD.build(tool.id, state.formValues);
    var cmdText = built[state.activeOsTab] || built.linux || '';
    el('osCmdCode').textContent = cmdText;
    el('osCmdNote').textContent = built.notes || '';
  }

  function renderToolHeaderAndForm() {
    var tool = getTool(state.activeToolId);
    var cat = Categories.find(function (c) { return c.id === tool.category; }) || { name: tool.category };
    el('toolBreadcrumb').textContent = cat.name + ' · ' + Tools.length + ' Tools';
    el('toolTitle').textContent = tool.name;
    var badge = el('toolModeBadge');
    var modeLabels = {
      live: 'Live Browser / Public API',
      offline: 'Offline Deterministic Math',
      hybrid: 'Browser + Local Agent',
      local: 'Local Agent / OS CLI'
    };
    badge.textContent = modeLabels[tool.mode] || tool.mode;
    badge.className = 'badge ' + tool.mode;
    el('toolDesc').textContent = tool.description;

    // Examples
    var exRow = el('exampleRow');
    exRow.textContent = '';
    if (tool.examples && tool.examples.length) {
      var exLbl = document.createElement('span');
      exLbl.className = 'example-label';
      exLbl.textContent = 'Presets:';
      exRow.appendChild(exLbl);
      tool.examples.forEach(function (ex) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm';
        b.textContent = ex.label;
        b.title = ex.note || '';
        b.addEventListener('click', function () {
          initFormDefaults(tool);
          Object.assign(state.formValues, ex.values || {});
          renderFormFields();
          updateCommandBar();
        });
        exRow.appendChild(b);
      });
    }

    // Guide
    var guideList = el('guideList');
    guideList.textContent = '';
    (tool.flagsGuide || []).forEach(function (g) {
      var li = document.createElement('li');
      li.textContent = g;
      guideList.appendChild(li);
    });

    renderFormFields();
    updateCommandBar();
  }

  function renderFormFields() {
    var tool = getTool(state.activeToolId);
    var grid = el('fieldsGrid');
    grid.textContent = '';
    clearError();

    if (!tool.fields || !tool.fields.length) {
      var note = document.createElement('div');
      note.className = 'cmd-note';
      note.textContent = 'This utility requires no target parameters. Click Run Diagnostic below.';
      grid.appendChild(note);
    } else {
      tool.fields.forEach(function (f) {
        var grp = document.createElement('div');
        grp.className = 'field-group' + (f.type === 'textarea' ? ' full-span' : '');
        var lbl = document.createElement('label');
        var inputId = 'field_' + f.key;
        lbl.setAttribute('for', inputId);
        lbl.textContent = f.label;

        var ctrl;
        if (f.type === 'select') {
          ctrl = document.createElement('select');
          (f.options || []).forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (String(state.formValues[f.key]) === String(opt.value)) o.selected = true;
            ctrl.appendChild(o);
          });
          ctrl.addEventListener('change', function () {
            state.formValues[f.key] = ctrl.value;
            updateCommandBar();
          });
        } else if (f.type === 'checkbox') {
          var row = document.createElement('label');
          row.className = 'checkbox-row';
          ctrl = document.createElement('input');
          ctrl.type = 'checkbox';
          ctrl.checked = !!state.formValues[f.key];
          ctrl.addEventListener('change', function () {
            state.formValues[f.key] = ctrl.checked;
            updateCommandBar();
          });
          var txt = document.createElement('span');
          txt.textContent = f.label;
          row.appendChild(ctrl);
          row.appendChild(txt);
          grp.appendChild(row);
          grid.appendChild(grp);
          return;
        } else if (f.type === 'textarea') {
          ctrl = document.createElement('textarea');
          ctrl.value = state.formValues[f.key] || '';
          ctrl.placeholder = f.placeholder || '';
          ctrl.addEventListener('input', function () {
            state.formValues[f.key] = ctrl.value;
            updateCommandBar();
          });
        } else {
          ctrl = document.createElement('input');
          ctrl.type = f.type || 'text';
          ctrl.value = state.formValues[f.key] !== undefined ? state.formValues[f.key] : '';
          if (f.placeholder) ctrl.placeholder = f.placeholder;
          if (f.min !== undefined) ctrl.min = String(f.min);
          if (f.max !== undefined) ctrl.max = String(f.max);
          ctrl.addEventListener('input', function () {
            state.formValues[f.key] = ctrl.value;
            updateCommandBar();
          });
        }
        ctrl.id = inputId;
        grp.appendChild(lbl);
        grp.appendChild(ctrl);
        grid.appendChild(grp);
      });
    }

    var authBox = el('authBox');
    var authCheck = el('authConfirmCheck');
    if (tool.requiresAuth) {
      authBox.style.display = 'flex';
      authCheck.checked = !!state.authorized;
    } else {
      authBox.style.display = 'none';
    }
  }

  function showError(msg) {
    var b = el('errorBanner');
    b.textContent = msg;
    b.classList.add('show');
  }
  function clearError() {
    var b = el('errorBanner');
    b.textContent = '';
    b.classList.remove('show');
  }

  // ---- Result Rendering ----
  function renderResult(res) {
    state.lastResult = res;
    var kpiStrip = el('kpiStrip');
    kpiStrip.textContent = '';
    (res.kpis || []).forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'kpi-card';
      var k = document.createElement('div');
      k.className = 'kpi-k';
      k.textContent = item.k;
      var v = document.createElement('div');
      v.className = 'kpi-v';
      v.textContent = item.v;
      card.appendChild(k);
      card.appendChild(v);
      kpiStrip.appendChild(card);
    });

    el('termStatusBadge').textContent = res.statusBadge || (res.ok ? 'Complete' : 'Failed');
    el('termStatusBadge').className = 'badge ' + (res.ok ? 'live' : 'local');
    el('termModeTag').textContent = res.modeUsed || '';

    var body = el('terminalBody');
    body.textContent = '';
    (res.terminalLines || []).forEach(function (ln) {
      var span = document.createElement('span');
      span.className = 't-line t-' + (ln.kind || 'info');
      span.textContent = ln.text;
      body.appendChild(span);
    });

    var tableBtn = el('toggleTableBtn');
    var exportCsvBtn = el('exportCsvBtn');
    var tableWrap = el('tableWrap');
    var tbl = el('resTable');
    tbl.textContent = '';

    if (res.structuredTable && res.structuredTable.rows && res.structuredTable.rows.length) {
      tableBtn.style.display = 'inline-flex';
      exportCsvBtn.style.display = 'inline-flex';
      var thead = document.createElement('thead');
      var trH = document.createElement('tr');
      res.structuredTable.columns.forEach(function (c) {
        var th = document.createElement('th');
        th.textContent = c;
        trH.appendChild(th);
      });
      thead.appendChild(trH);
      tbl.appendChild(thead);

      var tbody = document.createElement('tbody');
      res.structuredTable.rows.forEach(function (r) {
        var tr = document.createElement('tr');
        r.forEach(function (cell) {
          var td = document.createElement('td');
          td.textContent = String(cell == null ? '' : cell);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
    } else {
      tableBtn.style.display = 'none';
      exportCsvBtn.style.display = 'none';
      state.viewMode = 'terminal';
    }
    syncViewMode();
  }

  function syncViewMode() {
    var body = el('terminalBody');
    var wrap = el('tableWrap');
    var btn = el('toggleTableBtn');
    if (state.viewMode === 'table') {
      body.classList.add('hidden');
      wrap.classList.add('active');
      btn.textContent = 'Terminal View';
    } else {
      body.classList.remove('hidden');
      wrap.classList.remove('active');
      btn.textContent = 'Table View';
    }
  }

  function addHistory(tool, values, res) {
    state.history.unshift({
      toolId: tool.id,
      toolName: tool.name,
      values: Object.assign({}, values),
      badge: res.statusBadge || '',
      at: new Date().toLocaleTimeString()
    });
    if (state.history.length > 10) state.history.pop();
    var row = el('historyRow');
    row.textContent = '';
    if (!state.history.length) return;
    var lbl = document.createElement('span');
    lbl.className = 'example-label';
    lbl.textContent = 'Recent runs:';
    row.appendChild(lbl);
    state.history.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm';
      b.textContent = item.toolName + ' (' + item.at + ')';
      b.title = item.badge;
      b.addEventListener('click', function () {
        selectTool(item.toolId, item.values);
      });
      row.appendChild(b);
    });
  }

  // ---- Execute ----
  function setRunning(on) {
    state.running = on;
    el('runBtn').disabled = on;
    el('refreshBtn').disabled = on;
    el('cancelBtn').style.display = on ? 'inline-flex' : 'none';
    el('runSpinner').style.display = on ? 'inline-block' : 'none';
  }

  function executeCurrent() {
    if (state.running) return;
    clearError();
    var tool = getTool(state.activeToolId);
    var payload = Object.assign({}, state.formValues, { __authorized: !!state.authorized });
    state.abortCtrl = new AbortController();
    setRunning(true);
    var t0 = performance.now();

    tool.execute(payload, {
      signal: state.abortCtrl.signal,
      agent: API.getAgentState()
    }).then(function (res) {
      var ms = Math.round(performance.now() - t0);
      res.elapsedTotalMs = ms;
      renderResult(res);
      addHistory(tool, state.formValues, res);
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      showError(msg);
      renderResult({
        ok: false,
        statusBadge: 'Validation / Execution Error',
        modeUsed: 'Error',
        terminalLines: [
          { text: '=== Error ===', kind: 'err' },
          { text: msg, kind: 'err' }
        ],
        rawExport: msg
      });
    }).finally(function () {
      setRunning(false);
      state.abortCtrl = null;
    });
  }

  function selectTool(toolId, presetValues) {
    var tool = getTool(toolId);
    state.activeToolId = tool.id;
    state.viewMode = 'terminal';
    initFormDefaults(tool);
    if (presetValues) Object.assign(state.formValues, presetValues);
    renderSidebar();
    renderToolHeaderAndForm();
    try { window.history.replaceState(null, '', '#tool/' + encodeURIComponent(tool.id)); } catch (e) {}
  }

  // ---- Export Helpers ----
  function downloadFile(filename, mime, content) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  el('copyResultBtn').addEventListener('click', function () {
    var txt = state.lastResult ? state.lastResult.rawExport : el('terminalBody').textContent;
    copyText(txt, el('copyResultBtn'));
  });
  el('exportTxtBtn').addEventListener('click', function () {
    if (!state.lastResult) return;
    downloadFile(state.activeToolId + '-result.txt', 'text/plain;charset=utf-8', state.lastResult.rawExport || '');
  });
  el('exportJsonBtn').addEventListener('click', function () {
    if (!state.lastResult) return;
    downloadFile(state.activeToolId + '-result.json', 'application/json;charset=utf-8', JSON.stringify({
      tool: state.activeToolId,
      params: state.formValues,
      result: state.lastResult
    }, null, 2));
  });
  el('exportCsvBtn').addEventListener('click', function () {
    if (!state.lastResult || !state.lastResult.structuredTable) return;
    var tbl = state.lastResult.structuredTable;
    function esc(c) {
      var s = String(c == null ? '' : c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var csv = [tbl.columns.map(esc).join(',')].concat(tbl.rows.map(function (r) {
      return r.map(esc).join(',');
    })).join('\n');
    downloadFile(state.activeToolId + '-table.csv', 'text/csv;charset=utf-8', csv);
  });
  el('clearOutputBtn').addEventListener('click', function () {
    state.lastResult = null;
    el('kpiStrip').textContent = '';
    el('termStatusBadge').textContent = 'Ready';
    el('termStatusBadge').className = 'badge';
    el('termModeTag').textContent = '';
    el('terminalBody').textContent = 'Output cleared. Configure parameters above and click Run Diagnostic.';
    el('resTable').textContent = '';
    el('toggleTableBtn').style.display = 'none';
    el('exportCsvBtn').style.display = 'none';
    state.viewMode = 'terminal';
    syncViewMode();
  });
  el('toggleTableBtn').addEventListener('click', function () {
    state.viewMode = state.viewMode === 'terminal' ? 'table' : 'terminal';
    syncViewMode();
  });

  // ---- Form Actions & OS Tabs ----
  el('toolForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    executeCurrent();
  });
  el('refreshBtn').addEventListener('click', executeCurrent);
  el('resetBtn').addEventListener('click', function () {
    var tool = getTool(state.activeToolId);
    initFormDefaults(tool);
    renderFormFields();
    updateCommandBar();
  });
  el('cancelBtn').addEventListener('click', function () {
    if (state.abortCtrl) state.abortCtrl.abort(new Error('Cancelled by user'));
  });
  el('authConfirmCheck').addEventListener('change', function () {
    state.authorized = el('authConfirmCheck').checked;
  });

  document.querySelectorAll('#osTabs .os-tab').forEach(function (tab) {
    if (tab.getAttribute('data-os') === state.activeOsTab) tab.classList.add('active');
    else tab.classList.remove('active');
    tab.addEventListener('click', function () {
      document.querySelectorAll('#osTabs .os-tab').forEach(function (x) { x.classList.remove('active'); });
      tab.classList.add('active');
      state.activeOsTab = tab.getAttribute('data-os') || 'windows';
      updateCommandBar();
    });
  });
  el('copyCmdBtn').addEventListener('click', function () {
    copyText(el('osCmdCode').textContent, el('copyCmdBtn'));
  });

  // ---- Search & Mode Filter ----
  el('toolSearch').addEventListener('input', function () {
    state.searchQuery = el('toolSearch').value || '';
    renderSidebar();
  });
  document.querySelectorAll('#modeFilterBar .mode-pill').forEach(function (p) {
    p.addEventListener('click', function () {
      document.querySelectorAll('#modeFilterBar .mode-pill').forEach(function (x) { x.classList.remove('active'); });
      p.classList.add('active');
      state.modeFilter = p.getAttribute('data-mode') || '';
      renderSidebar();
    });
  });

  // ---- Local Companion Agent Modal ----
  var agentModal = el('agentModal');
  function refreshAgentBadge() {
    var st = API.getAgentState();
    var pill = el('agentStatusBtn');
    var lbl = el('agentStatusText');
    if (st.connected) {
      pill.classList.add('connected');
      lbl.textContent = 'Agent: Connected (' + st.os + ')';
    } else {
      pill.classList.remove('connected');
      lbl.textContent = 'Agent: Browser Mode';
    }
  }

  el('agentStatusBtn').addEventListener('click', function () {
    var st = API.getAgentState();
    el('agentUrlInput').value = st.url || 'http://127.0.0.1:8787';
    el('agentTokenInput').value = st.token || '';
    el('agentMsg').textContent = st.connected
      ? ('Connected to Spid3r NetTools Agent v' + st.version + ' (' + st.os + ')')
      : 'Not connected. Running in secure Browser + Public API + Offline Math mode.';
    agentModal.classList.add('open');
  });
  el('closeAgentModalBtn').addEventListener('click', function () { agentModal.classList.remove('open'); });
  agentModal.addEventListener('click', function (ev) { if (ev.target === agentModal) agentModal.classList.remove('open'); });

  el('connectAgentBtn').addEventListener('click', function () {
    var url = el('agentUrlInput').value;
    var tok = el('agentTokenInput').value;
    el('agentMsg').textContent = 'Connecting to loopback agent...';
    API.connectAgent(url, tok).then(function (st) {
      refreshAgentBadge();
      el('agentMsg').textContent = 'Connected to Spid3r NetTools Agent v' + st.version + ' (' + st.os + '). OS tools are now live!';
    }).catch(function (e) {
      refreshAgentBadge();
      el('agentMsg').textContent = 'Connection failed: ' + e.message;
    });
  });

  el('disconnectAgentBtn').addEventListener('click', function () {
    API.disconnectAgent();
    el('agentTokenInput').value = '';
    refreshAgentBadge();
    el('agentMsg').textContent = 'Disconnected. Reverted to Browser Mode.';
  });

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && agentModal.classList.contains('open')) {
      agentModal.classList.remove('open');
      return;
    }
    if (ev.key === '/' && document.activeElement && !/^(INPUT|TEXTAREA|SELECT)$/i.test(document.activeElement.tagName)) {
      ev.preventDefault();
      el('toolSearch').focus();
    }
  });

  // ---- Boot ----
  var initialTool = 'subnet-calc';
  if (window.location.hash && window.location.hash.indexOf('#tool/') === 0) {
    initialTool = decodeURIComponent(window.location.hash.slice(6));
  }
  refreshAgentBadge();
  selectTool(initialTool);
})();
