/* ══════════════════════════════════════════════════════════════
   FINANCE TRACKER — App Logic (Redesigned)
   ══════════════════════════════════════════════════════════════ */

const API_BASE = 'https://finance-tracker-z1ea.onrender.com/api';

// Chart instances
let barChart       = null;
let balanceLine    = null;
let sparklineChart = null;
let monthlyPie     = null;
let dailyBar       = null;

// Cache
let categoriesCache   = [];
let transactionsCache = [];
let currentMonth      = new Date(); // for monthly view

/* ── Auth helpers ─────────────────────────────────────────── */
function getToken()   { return localStorage.getItem('ft_token'); }
function setToken(t)  { localStorage.setItem('ft_token', t); }
function clearToken() { localStorage.removeItem('ft_token'); }
function authHeaders() {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401) { logout(); return null; }
  return res;
}
function logout() { clearToken(); location.reload(); }

/* ── Toast ────────────────────────────────────────────────── */
function showToast(msg, color = null) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.color = color || 'var(--text)';
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 4000);
}

/* ── Modal helpers ────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
function bindModalCloseButtons() {
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
  document.querySelectorAll('.modal').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); })
  );
}

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Set topbar date
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  if (getToken()) { showApp(); } else { showLogin(); }

  bindModalCloseButtons();
  bindSidebarNav();
  bindSidebarMobile();
  bindSyncButtons();
  bindUploadButton();
  setDefaultDate();

  document.getElementById('logout-btn').addEventListener('click', logout);

  // Add transaction
  document.getElementById('add-tx-btn').addEventListener('click', () => {
    populateCategorySelect('tx-category');
    openModal('modal-add-tx');
  });
  document.getElementById('add-tx-form').addEventListener('submit', handleAddTransaction);

  // Categories
  document.getElementById('new-cat-btn').addEventListener('click', () => openModal('modal-new-cat'));
  document.getElementById('new-cat-form').addEventListener('submit', handleNewCategory);

  // Filters
  document.getElementById('tx-search').addEventListener('input', renderTransactions);
  document.getElementById('tx-month-filter').addEventListener('change', renderTransactions);
  document.getElementById('tx-source-filter').addEventListener('change', renderTransactions);
  document.getElementById('tx-type-filter').addEventListener('change', renderTransactions);

  // Upload btn in tx section
  document.getElementById('upload-btn').addEventListener('click', () =>
    document.getElementById('statement-file').click()
  );

  // Monthly navigation
  currentMonth = new Date();
  currentMonth.setDate(1);
  document.getElementById('prev-month-btn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderMonthlySection();
  });
  document.getElementById('next-month-btn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderMonthlySection();
  });
});

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-form').addEventListener('submit', handleLogin);
}
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadAll();
}

/* ── Login ────────────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  const body = new URLSearchParams({
    username: document.getElementById('login-username').value,
    password: document.getElementById('login-password').value,
  });
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    errEl.textContent = 'Invalid username or password';
    errEl.classList.remove('hidden');
    return;
  }
  const data = await res.json();
  setToken(data.access_token);
  showApp();
}

/* ── Sidebar nav ──────────────────────────────────────────── */
const SECTIONS = ['overview', 'monthly', 'transactions', 'categories'];
const SECTION_TITLES = {
  overview: 'Dashboard',
  monthly:  'Monthly Overview',
  transactions: 'Transactions',
  categories:   'Categories',
};

function bindSidebarNav() {
  document.querySelectorAll('.nav-item[data-section]').forEach(el => {
    el.addEventListener('click', () => {
      switchSection(el.dataset.section);
      if (window.innerWidth <= 900) closeSidebar();
    });
  });
}

function switchSection(section) {
  // Nav active state
  document.querySelectorAll('.nav-item[data-section]').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });
  // Title
  document.getElementById('page-title').textContent = SECTION_TITLES[section] || 'Dashboard';
  // Show/hide sections
  SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.classList.toggle('hidden', s !== section);
  });
  // Render monthly if switching to it
  if (section === 'monthly') renderMonthlySection();
  if (section === 'transactions') renderTransactions();
}

/* ── Sidebar mobile toggle ────────────────────────────────── */
function openSidebar() {
  document.querySelector('.sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
  document.body.style.overflow = '';
}
function bindSidebarMobile() {
  document.getElementById('hamburger-btn').addEventListener('click', openSidebar);
  document.getElementById('sidebar-close-btn').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
}

/* ── Load all ─────────────────────────────────────────────── */
async function loadAll() {
  await Promise.all([fetchCategories(), fetchTransactions()]);
  renderDashboard();
}

/* ── Sync ─────────────────────────────────────────────────── */
function bindSyncButtons() {
  [document.getElementById('sync-btn'), document.getElementById('sidebar-sync-btn')]
    .forEach(btn => btn?.addEventListener('click', doSync));
}
async function doSync() {
  const btns = [document.getElementById('sync-btn'), document.getElementById('sidebar-sync-btn')];
  btns.forEach(b => { if (b) { b.disabled = true; } });
  document.getElementById('sync-status').textContent = '⏳ Syncing…';

  const res = await apiFetch('/sync', { method: 'POST' });
  btns.forEach(b => { if (b) b.disabled = false; });

  if (!res) return;
  const data = await res.json();
  const ok = res.ok;
  document.getElementById('sync-status').textContent = '';
  showToast(ok ? `✅ ${data.message}` : `❌ ${data.detail || 'Sync failed'}`,
            ok ? 'var(--green)' : 'var(--red)');
  if (ok) loadAll();
}

/* ── Upload statement ─────────────────────────────────────── */
function bindUploadButton() {
  document.getElementById('sidebar-upload-btn').addEventListener('click', () =>
    document.getElementById('statement-file').click()
  );
  document.getElementById('statement-file').addEventListener('change', async () => {
    const fileInput = document.getElementById('statement-file');
    if (!fileInput.files.length) return;
    const statusEl = document.getElementById('upload-status');
    statusEl.textContent = 'Uploading…';
    statusEl.style.color = 'var(--muted)';
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    const res = await fetch(`${API_BASE}/statement/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData,
    });
    const data = await res.json();
    statusEl.textContent = '';
    fileInput.value = '';
    showToast(
      res.ok ? `✅ ${data.message}` : `❌ ${data.detail || 'Upload failed'}`,
      res.ok ? 'var(--green)' : 'var(--red)'
    );
    if (res.ok) loadAll();
  });
}

/* ── Formatters ───────────────────────────────────────────── */
function fmtAmount(n) {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}
function fmtMonth(d) {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function merchantColor(name) {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#10b981','#06b6d4','#3b82f6','#d946ef'];
  let h = 0;
  for (const c of (name || '?')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}
function initials(name) {
  return (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/* ── Category colors ──────────────────────────────────────── */
const CAT_PALETTE = [
  '#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#3b82f6','#14b8a6','#f97316',
];
function catColor(name, idx) {
  if (idx !== undefined) return CAT_PALETTE[idx % CAT_PALETTE.length];
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return CAT_PALETTE[Math.abs(h) % CAT_PALETTE.length];
}
function catBadgeStyle(name) {
  const c = catColor(name);
  return `background:${c}22;color:${c};`;
}
function catCardColor(name) { return catColor(name); }

const CAT_COLORS_LEGACY = {
  'Food':'#f59e0b','Groceries':'#10b981','Transport':'#3b82f6','Shopping':'#ec4899',
  'Entertainment':'#8b5cf6','Bills':'#ef4444','Health':'#06b6d4','Personal Care':'#d946ef',
  'Uncategorized':'#6b7280',
};
function catBorder(name) { return CAT_COLORS_LEGACY[name] || catColor(name); }

/* ══════════════════════════════════════════════════════════════
   DASHBOARD / OVERVIEW
   ══════════════════════════════════════════════════════════════ */
function renderDashboard() {
  const txs = transactionsCache;
  const debits  = txs.filter(t => t.transaction_type !== 'credit');
  const credits = txs.filter(t => t.transaction_type === 'credit');
  const totalDebit  = debits.reduce((a, t) => a + t.amount, 0);
  const totalCredit = credits.reduce((a, t) => a + t.amount, 0);
  const net = totalCredit - totalDebit;

  // ── This month stats
  const now = new Date();
  const thisY = now.getFullYear(), thisM = now.getMonth();
  const lastM = thisM === 0 ? 11 : thisM - 1;
  const lastY = thisM === 0 ? thisY - 1 : thisY;

  function inMonth(tx, y, m) {
    const d = new Date(tx.date + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth() === m;
  }
  const thisMonthDebits = debits.filter(t => inMonth(t, thisY, thisM)).reduce((a, t) => a + t.amount, 0);
  const lastMonthDebits = debits.filter(t => inMonth(t, lastY, lastM)).reduce((a, t) => a + t.amount, 0);
  const expChange = lastMonthDebits > 0 ? ((thisMonthDebits - lastMonthDebits) / lastMonthDebits * 100) : 0;

  const thisMonthCredits = credits.filter(t => inMonth(t, thisY, thisM)).reduce((a, t) => a + t.amount, 0);
  const lastMonthCredits = credits.filter(t => inMonth(t, lastY, lastM)).reduce((a, t) => a + t.amount, 0);
  const incChange = lastMonthCredits > 0 ? ((thisMonthCredits - lastMonthCredits) / lastMonthCredits * 100) : 0;

  // ── KPI Grid
  const kpiData = [
    {
      label: 'Total Expenses',
      value: fmtAmount(totalDebit),
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      change: expChange,
      sub: `${debits.length} transactions`,
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.1)',
    },
    {
      label: 'Total Income',
      value: fmtAmount(totalCredit),
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      change: incChange,
      sub: `${credits.length} transactions`,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
    },
    {
      label: 'Net Balance',
      value: (net >= 0 ? '+' : '−') + fmtAmount(Math.abs(net)),
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${net >= 0 ? '#10b981' : '#ef4444'}" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      change: null,
      sub: net >= 0 ? 'Surplus' : 'Deficit',
      color: net >= 0 ? '#10b981' : '#ef4444',
      bg: net >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
    },
    {
      label: 'Transactions',
      value: txs.length,
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
      change: null,
      sub: debits.length > 0 ? `Avg ${fmtAmount(totalDebit / debits.length)} / tx` : '—',
      color: '#6366f1',
      bg: 'rgba(99,102,241,0.1)',
    },
  ];

  document.getElementById('kpi-grid').innerHTML = kpiData.map(k => `
    <div class="kpi-card" style="--kpi-color:${k.color};--kpi-bg:${k.bg}">
      <div class="kpi-header">
        <span class="kpi-label">${k.label}</span>
        <span class="kpi-icon">${k.icon}</span>
      </div>
      <div class="kpi-value">${k.value}</div>
      ${k.change !== null ? `
        <div class="kpi-change ${k.change >= 0 ? 'up' : 'down'}">
          ${k.change >= 0 ? '↑' : '↓'} ${Math.abs(k.change).toFixed(1)}% vs last month
        </div>` : ''}
      <div class="kpi-sub">${k.sub}</div>
    </div>
  `).join('');

  // ── Balance card
  document.getElementById('balance-amount').textContent = (net >= 0 ? '' : '−') + fmtAmount(Math.abs(net));
  document.getElementById('balance-change').textContent = net >= 0 ? '↑ Positive balance' : '↓ Negative balance';
  document.getElementById('balance-change').className = 'balance-change ' + (net >= 0 ? 'up' : 'down');
  document.getElementById('balance-income-meta').textContent = `Income: ${fmtAmount(totalCredit)}`;
  document.getElementById('balance-expense-meta').textContent = `Expenses: ${fmtAmount(totalDebit)}`;

  // ── Balance sparkline
  renderSparkline(txs);

  // ── Balance Development line chart
  renderBalanceLine(txs);

  // ── Expense bar chart
  renderExpenseBar();

  // ── Top merchants
  renderTopMerchants();
}

/* ── Sparkline ────────────────────────────────────────────── */
function renderSparkline(txs) {
  const ctx = document.getElementById('balance-sparkline').getContext('2d');
  if (sparklineChart) sparklineChart.destroy();

  // Last 7 months running net
  const months = [];
  const values = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = d.getMonth();
    const cr = txs.filter(t => t.transaction_type === 'credit' && new Date(t.date+'T00:00:00').getFullYear()===y && new Date(t.date+'T00:00:00').getMonth()===m)
                   .reduce((a,t)=>a+t.amount,0);
    const db = txs.filter(t => t.transaction_type !== 'credit' && new Date(t.date+'T00:00:00').getFullYear()===y && new Date(t.date+'T00:00:00').getMonth()===m)
                   .reduce((a,t)=>a+t.amount,0);
    months.push(d.toLocaleDateString('en-IN',{month:'short'}));
    values.push(cr - db);
  }

  sparklineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        data: values,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
}

/* ── Balance development line chart ─────────────────────── */
function renderBalanceLine(txs) {
  const ctx = document.getElementById('balance-line-chart').getContext('2d');
  if (balanceLine) balanceLine.destroy();

  const monthMap = {};
  txs.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!monthMap[key]) monthMap[key] = { cr: 0, db: 0 };
    if (t.transaction_type === 'credit') monthMap[key].cr += t.amount;
    else monthMap[key].db += t.amount;
  });

  const keys   = Object.keys(monthMap).sort();
  const labels = keys.map(k => {
    const [y,m] = k.split('-');
    return new Date(+y, +m-1, 1).toLocaleDateString('en-IN', {month:'short', year:'2-digit'});
  });
  const netVals = keys.map(k => monthMap[k].cr - monthMap[k].db);
  const dbVals  = keys.map(k => monthMap[k].db);

  // Highlights
  const maxIncome  = Math.max(...keys.map(k => monthMap[k].cr));
  const maxExpense = Math.max(...keys.map(k => monthMap[k].db));
  const devEl = document.getElementById('balance-dev-stats');
  if (devEl) {
    devEl.innerHTML = `
      <div class="balance-dev-chips">
        <div class="dev-chip"><span style="color:var(--text-3);font-size:.68rem">HIGHEST INCOME</span><strong style="color:var(--green)">${fmtAmount(maxIncome)}</strong></div>
        <div class="dev-chip"><span style="color:var(--text-3);font-size:.68rem">HIGHEST EXPENSE</span><strong style="color:var(--red)">${fmtAmount(maxExpense)}</strong></div>
      </div>`;
  }

  balanceLine = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Net',
          data: netVals,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#6366f1',
        },
        {
          label: 'Expenses',
          data: dbVals,
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4,3],
          fill: false,
          tension: 0.4,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9ca3b0', font: { size: 11, family: 'Inter' }, boxWidth: 12, boxHeight: 12, padding: 12 },
        },
        tooltip: {
          backgroundColor: '#1e2336',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#9ca3b0',
          callbacks: { label: c => `  ${c.dataset.label}: ${fmtAmount(c.parsed.y)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5d6578', font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5d6578', font: { size: 11 }, callback: v => '₹'+v.toLocaleString('en-IN') },
        },
      },
    },
  });
}

/* ── Expense Bar Chart ────────────────────────────────────── */
function renderExpenseBar() {
  const ctx = document.getElementById('bar-chart').getContext('2d');
  if (barChart) barChart.destroy();

  const catMap = {};
  transactionsCache.filter(t => t.transaction_type !== 'credit').forEach(t => {
    const cat = t.category || 'Uncategorized';
    catMap[cat] = (catMap[cat] || 0) + t.amount;
  });

  const sorted  = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const labels  = sorted.map(([c]) => c);
  const data    = sorted.map(([,v]) => v);
  const colors  = labels.map((l, i) => catColor(l, i));

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2336',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#9ca3b0',
          callbacks: { label: c => `  ${fmtAmount(c.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#5d6578', font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5d6578', font: { size: 11 }, callback: v => '₹'+v.toLocaleString('en-IN') },
        },
      },
    },
  });

  // Breakdown stat chips
  const statsEl = document.getElementById('breakdown-stats');
  if (statsEl) {
    statsEl.innerHTML = sorted.slice(0, 5).map(([cat, amt]) => `
      <div class="breakdown-chip">
        <span class="chip-val" style="color:${catColor(cat)}">${fmtAmount(amt)}</span>
        ${cat}
      </div>`).join('');
  }
}

/* ── Top Merchants ────────────────────────────────────────── */
function renderTopMerchants(container = 'top-merchants', txs = null) {
  const source = txs ?? transactionsCache;
  const debits = source.filter(t => t.transaction_type !== 'credit');
  const map = {};
  debits.forEach(t => { const m = t.merchant || 'Unknown'; map[m] = (map[m] || 0) + t.amount; });
  const top5 = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const max  = top5[0]?.[1] || 1;
  const el   = document.getElementById(container);
  if (!el) return;
  if (!top5.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div><p>No transactions yet.</p></div>';
    return;
  }
  el.innerHTML = top5.map(([name, amt]) => `
    <div class="merchant-row">
      <div class="m-avatar" style="background:${merchantColor(name)}">${initials(name)}</div>
      <div class="m-info">
        <div class="m-name">${name}</div>
        <div class="m-bar-wrap"><div class="m-bar" style="width:${(amt/max*100).toFixed(1)}%"></div></div>
      </div>
      <div class="m-amount">−${fmtAmount(amt)}</div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   MONTHLY SECTION
   ══════════════════════════════════════════════════════════════ */
function renderMonthlySection() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  document.getElementById('month-label').textContent = fmtMonth(currentMonth);

  const monthTxs = transactionsCache.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth() === m;
  });
  const debits  = monthTxs.filter(t => t.transaction_type !== 'credit');
  const credits = monthTxs.filter(t => t.transaction_type === 'credit');
  const totalDebit  = debits.reduce((a,t) => a+t.amount, 0);
  const totalCredit = credits.reduce((a,t) => a+t.amount, 0);
  const savings = totalCredit - totalDebit;

  // Monthly KPIs
  document.getElementById('monthly-kpi-grid').innerHTML = [
    { label:'Monthly Expenses', val: fmtAmount(totalDebit), color:'#ef4444', bg:'rgba(239,68,68,0.1)',
      icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`, sub:`${debits.length} debits` },
    { label:'Monthly Income',   val: fmtAmount(totalCredit), color:'#10b981', bg:'rgba(16,185,129,0.1)',
      icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`, sub:`${credits.length} credits` },
    { label:'Savings', val: (savings >= 0 ? '+' : '−') + fmtAmount(Math.abs(savings)),
      color: savings >= 0 ? '#6366f1' : '#f59e0b', bg: savings >= 0 ? 'rgba(99,102,241,0.1)' : 'rgba(245,158,11,0.1)',
      icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${savings>=0?'#6366f1':'#f59e0b'}" stroke-width="2" stroke-linecap="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/></svg>`, sub: savings >= 0 ? 'Surplus' : 'Overspent' },
    { label:'Avg Daily Spend', val: fmtAmount(totalDebit / 30),
      color:'#06b6d4', bg:'rgba(6,182,212,0.1)',
      icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`, sub: 'Per day estimate' },
  ].map(k => `
    <div class="kpi-card" style="--kpi-color:${k.color};--kpi-bg:${k.bg}">
      <div class="kpi-header"><span class="kpi-label">${k.label}</span><span class="kpi-icon">${k.icon}</span></div>
      <div class="kpi-value">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  // Monthly donut
  renderMonthlyDonut(monthTxs);

  // Daily bar
  renderDailyBar(monthTxs, y, m);

  // Category progress
  renderCategoryProgress(monthTxs);

  // Monthly transactions
  renderMonthlyTxList(monthTxs);
}

function renderMonthlyDonut(monthTxs) {
  const ctx = document.getElementById('monthly-pie-chart').getContext('2d');
  if (monthlyPie) monthlyPie.destroy();

  const catMap = {};
  monthTxs.filter(t => t.transaction_type !== 'credit').forEach(t => {
    catMap[t.category || 'Uncategorized'] = (catMap[t.category||'Uncategorized']||0) + t.amount;
  });
  const entries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);

  monthlyPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([c])=>c),
      datasets: [{
        data: entries.map(([,v])=>v),
        backgroundColor: entries.map(([c],i) => catColor(c,i) + 'cc'),
        borderColor: entries.map(([c],i) => catColor(c,i)),
        borderWidth: 1.5,
        hoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color:'#9ca3b0', font:{size:11, family:'Inter'}, boxWidth:10, boxHeight:10, padding:10 },
        },
        tooltip: {
          backgroundColor: '#1e2336', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
          titleColor:'#e8eaf0', bodyColor:'#9ca3b0',
          callbacks: { label: c => `  ${fmtAmount(c.parsed)}` },
        },
      },
    },
  });
}

function renderDailyBar(monthTxs, year, month) {
  const ctx = document.getElementById('daily-bar-chart').getContext('2d');
  if (dailyBar) dailyBar.destroy();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyData   = Array(daysInMonth).fill(0);
  monthTxs.filter(t => t.transaction_type !== 'credit').forEach(t => {
    const day = new Date(t.date + 'T00:00:00').getDate();
    dailyData[day - 1] += t.amount;
  });

  dailyBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({length: daysInMonth}, (_,i) => i+1),
      datasets: [{
        data: dailyData,
        backgroundColor: 'rgba(6,182,212,0.5)',
        borderColor: '#06b6d4',
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false},
        tooltip: {
          backgroundColor:'#1e2336', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
          callbacks: { label: c => `  ${fmtAmount(c.parsed.y)}` },
        },
      },
      scales: {
        x: { grid:{display:false}, ticks:{color:'#5d6578', font:{size:10}} },
        y: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#5d6578', font:{size:10}, callback: v=>'₹'+v.toLocaleString('en-IN')} },
      },
    },
  });
}

function renderCategoryProgress(monthTxs) {
  const catMap = {};
  monthTxs.filter(t => t.transaction_type !== 'credit').forEach(t => {
    catMap[t.category||'Uncategorized'] = (catMap[t.category||'Uncategorized']||0) + t.amount;
  });
  const total = Object.values(catMap).reduce((a,v)=>a+v, 0);
  const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);

  document.getElementById('savings-progress-list').innerHTML = sorted.length ? sorted.map(([cat, amt], i) => {
    const pct = total > 0 ? (amt/total*100).toFixed(1) : 0;
    const color = catColor(cat, i);
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span class="progress-label">${cat}</span>
          <span class="progress-pct">${fmtAmount(amt)} · ${pct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('') : '<div class="empty-state"><div class="empty-icon">📊</div><p>No expenses this month.</p></div>';
}

function renderMonthlyTxList(monthTxs) {
  const sorted = [...monthTxs].sort((a,b) => new Date(b.date) - new Date(a.date));
  document.getElementById('monthly-tx-count').textContent = sorted.length;
  document.getElementById('monthly-tx-body').innerHTML = sorted.length
    ? sorted.map(tx => buildTxRow(tx)).join('')
    : `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📭</div><p>No transactions this month.</p></div></td></tr>`;
}

/* ══════════════════════════════════════════════════════════════
   TRANSACTIONS SECTION
   ══════════════════════════════════════════════════════════════ */
async function fetchTransactions() {
  const res = await apiFetch('/transactions?limit=500');
  if (!res || !res.ok) return;
  transactionsCache = await res.json();
}

function renderTransactions() {
  const search      = (document.getElementById('tx-search')?.value || '').toLowerCase();
  const monthFilter = document.getElementById('tx-month-filter')?.value || 'all';
  const srcFilter   = document.getElementById('tx-source-filter')?.value || 'all';
  const typeFilter  = document.getElementById('tx-type-filter')?.value || 'all';

  const now = new Date();
  const ty  = now.getFullYear(), tm = now.getMonth();

  let filtered = transactionsCache.filter(tx => {
    if (search && !(tx.merchant||'').toLowerCase().includes(search)
               && !(tx.note||'').toLowerCase().includes(search)
               && !(tx.category||'').toLowerCase().includes(search)) return false;
    if (srcFilter !== 'all' && (tx.source||'email') !== srcFilter) return false;
    if (typeFilter !== 'all') {
      const isCredit = tx.transaction_type === 'credit';
      if (typeFilter === 'credit' && !isCredit) return false;
      if (typeFilter === 'debit'  && isCredit)  return false;
    }
    if (monthFilter !== 'all') {
      const d = new Date(tx.date + 'T00:00:00');
      const y = d.getFullYear(), m = d.getMonth();
      if (monthFilter === 'this_month' && !(y===ty && m===tm)) return false;
      if (monthFilter === 'last_month') {
        const lm = tm===0?11:tm-1, ly = tm===0?ty-1:ty;
        if (!(y===ly && m===lm)) return false;
      }
      if (monthFilter === 'last_3') {
        const cutoff = new Date(ty, tm-2, 1);
        if (d < cutoff) return false;
      }
    }
    return true;
  });

  const badge = document.getElementById('tx-count-badge');
  if (badge) badge.textContent = filtered.length;

  const tbody = document.getElementById('tx-body');
  tbody.innerHTML = filtered.length
    ? filtered.map(tx => buildTxRow(tx, true)).join('')
    : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📭</div>
        <p>${search||monthFilter!=='all'||srcFilter!=='all'
          ? 'No transactions match your filters.'
          : 'No transactions yet. Click <strong>Sync Gmail</strong> or <strong>+ Add Transaction</strong>.'}</p>
       </div></td></tr>`;
}

function buildTxRow(tx, showDate = true) {
  const isDebit = tx.transaction_type !== 'credit';
  const src  = tx.source || 'email';
  const merch = tx.merchant || 'Unknown';
  return `
    <tr>
      <td>
        <div class="tx-merchant-cell">
          <div class="tx-avatar" style="background:${merchantColor(merch)}">${initials(merch)}</div>
          <div>
            <div class="tx-name">${merch}</div>
            <div class="tx-date">${fmtDate(tx.date)}${tx.note?` · <span class="tx-note">${tx.note}</span>`:''}</div>
          </div>
        </div>
      </td>
      <td>
        <button class="cat-badge" style="${catBadgeStyle(tx.category)}"
          onclick="openRecategorize(${tx.id}, '${(tx.category||'').replace(/'/g,"\\'")}')">
          ${tx.category || 'Uncategorized'}
        </button>
      </td>
      <td><span class="src-badge src-${src}">${src.charAt(0).toUpperCase()+src.slice(1)}</span></td>
      ${showDate ? '' : ''}
      <td class="amount ${isDebit?'debit':'credit'}">${isDebit?'−':'+'}${fmtAmount(tx.amount)}</td>
      <td>
        <button class="btn-icon" title="Delete" onclick="deleteTransaction(${tx.id}, this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </td>
    </tr>`;
}

async function deleteTransaction(id, btn) {
  if (!confirm('Delete this transaction?')) return;
  const res = await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    transactionsCache = transactionsCache.filter(t => t.id !== id);
    renderTransactions();
    renderDashboard();
    showToast('Transaction deleted', 'var(--text-2)');
  }
}

/* ── Add Transaction ─────────────────────────────────────── */
async function handleAddTransaction(e) {
  e.preventDefault();
  const payload = {
    merchant: document.getElementById('tx-merchant').value,
    amount:   parseFloat(document.getElementById('tx-amount').value),
    transaction_type: document.getElementById('tx-type').value,
    date:     document.getElementById('tx-date').value,
    category: document.getElementById('tx-category').value,
    note:     document.getElementById('tx-note').value || null,
  };
  const res = await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(payload) });
  if (res && res.ok) {
    closeModal('modal-add-tx');
    document.getElementById('add-tx-form').reset();
    setDefaultDate();
    await fetchTransactions();
    renderDashboard();
    renderTransactions();
    showToast('✅ Transaction added!', 'var(--green)');
  }
}

function setDefaultDate() {
  const el = document.getElementById('tx-date');
  if (el) el.value = new Date().toISOString().split('T')[0];
}
function populateCategorySelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = categoriesCache.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

/* ── Recategorize ────────────────────────────────────────── */
function openRecategorize(txId, currentCat) {
  const opts = categoriesCache.map(c =>
    `<option value="${c.name}" ${c.name===currentCat?'selected':''}>${c.name}</option>`
  ).join('');
  document.getElementById('recat-body').innerHTML = `
    <div class="modal-form">
      <div class="field"><label>New Category</label><select id="recat-select">${opts}</select></div>
      <div class="modal-footer">
        <button class="btn-ghost" onclick="closeModal('modal-recat')">Cancel</button>
        <button class="btn-primary" onclick="submitRecat(${txId})">Apply</button>
      </div>
    </div>`;
  openModal('modal-recat');
}
async function submitRecat(txId) {
  const cat = document.getElementById('recat-select').value;
  const res = await apiFetch(`/transactions/${txId}/category`, {
    method: 'PATCH', body: JSON.stringify({ category: cat }),
  });
  if (res && res.ok) {
    const tx = transactionsCache.find(t => t.id === txId);
    if (tx) tx.category = cat;
    closeModal('modal-recat');
    renderTransactions();
    renderMonthlySection();
    renderDashboard();
  }
}

/* ── Categories ──────────────────────────────────────────── */
async function fetchCategories() {
  const res = await apiFetch('/categories');
  if (!res || !res.ok) return;
  categoriesCache = await res.json();
  renderCategoriesGrid();
}
function renderCategoriesGrid() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  grid.innerHTML = categoriesCache.map(cat => `
    <div class="cat-card" style="--cat-color:${catBorder(cat.name)}" onclick="openCategoryModal(${cat.id}, '${cat.name.replace(/'/g,"\\'")}')">
      <div class="cat-card-name">${cat.name}</div>
      <div class="cat-card-meta">
        <span class="cat-card-count">${cat.rules.length} keyword${cat.rules.length!==1?'s':''}</span>
        ${cat.name !== 'Uncategorized'
          ? `<button class="cat-delete-btn" onclick="event.stopPropagation();deleteCategory(${cat.id},'${cat.name.replace(/'/g,"\\'")}')">✕</button>`
          : ''}
      </div>
    </div>`).join('');
}
async function handleNewCategory(e) {
  e.preventDefault();
  const name = document.getElementById('new-cat-name').value.trim();
  const res = await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name }) });
  if (res && res.ok) {
    closeModal('modal-new-cat');
    document.getElementById('new-cat-name').value = '';
    await fetchCategories();
    showToast(`✅ Category "${name}" created!`, 'var(--green)');
  }
}
async function deleteCategory(id, name) {
  if (!confirm(`Delete category "${name}"? All its rules will be removed.`)) return;
  const res = await apiFetch(`/categories/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    await fetchCategories();
    showToast(`Deleted category "${name}"`, 'var(--text-2)');
  }
}

/* ── Category Rules Modal ────────────────────────────────── */
function openCategoryModal(catId, catName) {
  document.getElementById('cat-modal-title').textContent = `"${catName}" — Keywords`;
  const cat = categoriesCache.find(c => c.id === catId);
  renderCategoryModalBody(cat);
  openModal('modal-cat');
}
function renderCategoryModalBody(cat) {
  const chips = cat.rules.length
    ? cat.rules.map(r => `
        <span class="rule-chip">${r.keyword}
          <button class="rule-chip-del" onclick="deleteRule(${r.id}, ${cat.id})">✕</button>
        </span>`).join('')
    : '<p style="color:var(--text-3);font-size:.83rem;padding:4px 0">No keywords yet. Add one below.</p>';

  document.getElementById('cat-modal-body').innerHTML = `
    <div class="rules-info">Transactions whose merchant name contains a keyword will be auto-assigned to <strong>${cat.name}</strong>.</div>
    <div class="rules-chips" id="rules-chips-${cat.id}">${chips}</div>
    <div class="add-rule-row">
      <input id="new-rule-input-${cat.id}" type="text" placeholder="e.g. swiggy, petrol, salon">
      <button class="btn-primary" onclick="addRule(${cat.id})">Add</button>
    </div>
    <div class="apply-row">
      <button class="btn-ghost" onclick="applyRulesToAll()" id="apply-btn">⚡ Apply to All Transactions</button>
      <span class="apply-status" id="apply-status"></span>
    </div>`;
}
async function addRule(catId) {
  const input = document.getElementById(`new-rule-input-${catId}`);
  const keyword = input.value.trim().toLowerCase();
  if (!keyword) return;
  const res = await apiFetch(`/categories/${catId}/rules`, {
    method: 'POST', body: JSON.stringify({ keyword }),
  });
  if (res && res.ok) {
    input.value = '';
    await fetchCategories();
    const cat = categoriesCache.find(c => c.id === catId);
    renderCategoryModalBody(cat);
    applyRulesToAll();
  }
}
async function deleteRule(ruleId, catId) {
  const res = await apiFetch(`/rules/${ruleId}`, { method: 'DELETE' });
  if (res && res.ok) {
    await fetchCategories();
    const cat = categoriesCache.find(c => c.id === catId);
    if (cat) renderCategoryModalBody(cat);
    applyRulesToAll();
  }
}
async function applyRulesToAll() {
  const btn    = document.getElementById('apply-btn');
  const status = document.getElementById('apply-status');
  if (!btn) return;
  btn.disabled = true; btn.textContent = '⏳ Applying…';
  const res = await apiFetch('/recategorize', { method: 'POST' });
  btn.disabled = false; btn.textContent = '⚡ Apply to All Transactions';
  if (!res) return;
  const data = await res.json();
  if (status) {
    status.textContent = data.message || 'Done!';
    status.style.color = res.ok ? 'var(--green)' : 'var(--red)';
    setTimeout(() => { if (status) status.textContent = ''; }, 4000);
  }
  if (res.ok) { await fetchTransactions(); renderDashboard(); renderTransactions(); }
}