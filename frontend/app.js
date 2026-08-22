/* ── Config ─────────────────────────────────────────────────────────────────── */
const API_BASE = 'http://localhost:8000/api';
let pieChart = null;
let categoriesCache = [];
let transactionsCache = [];

/* ── Auth helpers ────────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem('ft_token'); }
function setToken(t) { localStorage.setItem('ft_token', t); }
function clearToken() { localStorage.removeItem('ft_token'); }
function authHeaders() {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401) { logout(); return null; }
  return res;
}
function logout() { clearToken(); location.reload(); }

/* ── Modal helpers ───────────────────────────────────────────────────────────── */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function bindModalCloseButtons() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });
}

/* ── Boot ────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) { showApp(); } else { showLogin(); }
  bindModalCloseButtons();
  bindSidebarNav();
  bindSidebarMobile();
  bindSyncButtons();
  bindUploadButton();
  setDefaultDate();

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('add-tx-btn').addEventListener('click', () => {
    populateCategorySelect('tx-category');
    openModal('modal-add-tx');
  });
  document.getElementById('add-tx-form').addEventListener('submit', handleAddTransaction);
  document.getElementById('new-cat-btn').addEventListener('click', () => openModal('modal-new-cat'));
  document.getElementById('new-cat-form').addEventListener('submit', handleNewCategory);

  // Filters
  document.getElementById('tx-search').addEventListener('input', renderTransactions);
  document.getElementById('tx-month-filter').addEventListener('change', renderTransactions);
  document.getElementById('tx-source-filter').addEventListener('change', renderTransactions);

  // Upload button in card
  document.getElementById('upload-btn').addEventListener('click', () =>
    document.getElementById('statement-file').click()
  );
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

/* ── Login ───────────────────────────────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
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

/* ── Sidebar nav ─────────────────────────────────────────────────────────────── */
function bindSidebarNav() {
  document.querySelectorAll('.sidebar-nav li[data-section]').forEach(li => {
    li.querySelector('button').addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav li').forEach(l => l.classList.remove('active'));
      li.classList.add('active');
      const section = li.dataset.section;
      const titles = { overview: 'Overview', transactions: 'Transactions', categories: 'Categories' };
      document.getElementById('page-title').textContent = titles[section] || 'Overview';
      if (section === 'transactions') {
        document.getElementById('section-transactions').scrollIntoView({ behavior: 'smooth' });
      } else if (section === 'categories') {
        document.getElementById('section-categories').scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

/* ── Sidebar mobile toggle ────────────────────────────────────────────────────── */
function bindSidebarMobile() {
  const sidebar  = document.querySelector('.sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const openBtn  = document.getElementById('hamburger-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (openBtn)  openBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay)  overlay.addEventListener('click', closeSidebar);

  // Close sidebar on nav link click (mobile UX)
  document.querySelectorAll('.sidebar-nav li button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeSidebar();
    });
  });
}

/* ── Load all ────────────────────────────────────────────────────────────────── */
async function loadAll() {
  await fetchCategories();
  await fetchTransactions();
  fetchSummary();
}

/* ── Sync ────────────────────────────────────────────────────────────────────── */
function bindSyncButtons() {
  [document.getElementById('sync-btn'), document.getElementById('sidebar-sync-btn')]
    .forEach(btn => btn && btn.addEventListener('click', doSync));
}

async function doSync() {
  const statusEl = document.getElementById('sync-status');
  const btns = [document.getElementById('sync-btn'), document.getElementById('sidebar-sync-btn')];
  btns.forEach(b => { if (b) { b.disabled = true; b.textContent = '⏳ Syncing…'; } });
  statusEl.textContent = '';

  const res = await apiFetch('/sync', { method: 'POST' });
  btns.forEach(b => {
    if (!b) return;
    b.disabled = false;
    b.textContent = b.id === 'sidebar-sync-btn' ? '🔄 Sync Gmail' : '🔄 Sync Gmail';
  });
  if (!res) return;
  const data = await res.json();
  statusEl.textContent = res.ok ? data.message : (data.detail || 'Sync failed');
  statusEl.style.color = res.ok ? 'var(--credit)' : 'var(--debit)';
  if (res.ok) loadAll();
  setTimeout(() => { statusEl.textContent = ''; }, 6000);
}

/* ── Upload statement ────────────────────────────────────────────────────────── */
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
    statusEl.textContent = res.ok ? data.message : (data.detail || 'Upload failed');
    statusEl.style.color = res.ok ? 'var(--credit)' : 'var(--debit)';
    fileInput.value = '';
    if (res.ok) loadAll();
    setTimeout(() => { statusEl.textContent = ''; }, 6000);
  });
}

/* ── Merchant helpers ────────────────────────────────────────────────────────── */
function merchantColor(name) {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#10b981','#06b6d4'];
  let hash = 0;
  for (const c of (name || '?')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}
function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function fmtAmount(n) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Category colors ─────────────────────────────────────────────────────────── */
const CAT_COLORS = {
  'Food':          ['#fef3c7','#92400e'],
  'Groceries':     ['#dcfce7','#166534'],
  'Transport':     ['#dbeafe','#1e40af'],
  'Shopping':      ['#fce7f3','#9d174d'],
  'Entertainment': ['#f3e8ff','#6b21a8'],
  'Bills':         ['#fee2e2','#991b1b'],
  'Health':        ['#d1fae5','#065f46'],
  'Personal Care': ['#fdf4ff','#86198f'],
  'Uncategorized': ['#f1f5f9','#64748b'],
};
const CAT_BORDER = {
  'Food':'#f59e0b','Groceries':'#10b981','Transport':'#3b82f6','Shopping':'#ec4899',
  'Entertainment':'#8b5cf6','Bills':'#ef4444','Health':'#06b6d4','Personal Care':'#d946ef','Uncategorized':'#94a3b8',
};
function catColors(name) { return CAT_COLORS[name] || ['#eef2ff','#3730a3']; }
function catBorder(name) { return CAT_BORDER[name] || '#6366f1'; }

/* ── Summary / Stats ─────────────────────────────────────────────────────────── */
async function fetchSummary() {
  const res = await apiFetch('/summary');
  if (!res || !res.ok) return;
  const summary = await res.json();

  const totalDebit  = transactionsCache.filter(t => t.transaction_type !== 'credit').reduce((a, t) => a + t.amount, 0);
  const totalCredit = transactionsCache.filter(t => t.transaction_type === 'credit').reduce((a, t) => a + t.amount, 0);
  const net = totalCredit - totalDebit;
  const txCount = transactionsCache.length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-card-icon" style="background:#fef2f2">💸</div>
      <div class="stat-label">Total Expenses</div>
      <div class="stat-value debit">${fmtAmount(totalDebit)}</div>
      <div class="stat-sub">${transactionsCache.filter(t=>t.transaction_type!=='credit').length} debits</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon" style="background:#ecfdf5">💰</div>
      <div class="stat-label">Total Income</div>
      <div class="stat-value credit">${fmtAmount(totalCredit)}</div>
      <div class="stat-sub">${transactionsCache.filter(t=>t.transaction_type==='credit').length} credits</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon" style="background:${net>=0?'#ecfdf5':'#fef2f2'}">${net>=0?'📈':'📉'}</div>
      <div class="stat-label">Net Balance</div>
      <div class="stat-value ${net>=0?'credit':'debit'}">${net>=0?'+':''}${fmtAmount(Math.abs(net))}</div>
      <div class="stat-sub">${net>=0?'Surplus':'Deficit'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon" style="background:#eef2ff">📋</div>
      <div class="stat-label">Transactions</div>
      <div class="stat-value neutral">${txCount}</div>
      <div class="stat-sub">${txCount ? fmtAmount(totalDebit/txCount)+' avg' : '—'}</div>
    </div>
  `;

  renderPieChart(summary);
  renderTopMerchants();
}

function renderPieChart(summary) {
  const filtered = summary.filter(s => s.total_amount > 0);
  const ctx = document.getElementById('pie-chart').getContext('2d');
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: filtered.map(s => s.category),
      datasets: [{
        data: filtered.map(s => s.total_amount),
        backgroundColor: filtered.map(s => catColors(s.category)[0]),
        borderColor: filtered.map(s => catColors(s.category)[1]),
        borderWidth: 2,
        hoverBorderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10, boxHeight: 10,
            borderRadius: 99, padding: 10,
            font: { size: 11, family: 'Inter' },
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => `  ${fmtAmount(ctx.parsed)}`,
          },
        },
      },
      cutout: '65%',
    },
  });
}

function renderTopMerchants() {
  const debits = transactionsCache.filter(t => t.transaction_type !== 'credit');
  const map = {};
  debits.forEach(t => {
    const m = t.merchant || 'Unknown';
    map[m] = (map[m] || 0) + t.amount;
  });
  const top5 = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top5[0]?.[1] || 1;
  const el = document.getElementById('top-merchants');
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
      <div class="m-amount">${fmtAmount(amt)}</div>
    </div>
  `).join('');
}

/* ── Transactions ────────────────────────────────────────────────────────────── */
async function fetchTransactions() {
  const res = await apiFetch('/transactions?limit=200');
  if (!res || !res.ok) return;
  transactionsCache = await res.json();
  renderTransactions();
}

function renderTransactions() {
  const search = (document.getElementById('tx-search')?.value || '').toLowerCase();
  const monthFilter = document.getElementById('tx-month-filter')?.value || 'all';
  const sourceFilter = document.getElementById('tx-source-filter')?.value || 'all';

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  let filtered = transactionsCache.filter(tx => {
    // Search
    if (search && !(tx.merchant || '').toLowerCase().includes(search) &&
        !(tx.note || '').toLowerCase().includes(search) &&
        !(tx.category || '').toLowerCase().includes(search)) return false;
    // Source
    if (sourceFilter !== 'all' && (tx.source || 'email') !== sourceFilter) return false;
    // Month
    if (monthFilter !== 'all') {
      const d = new Date(tx.date + 'T00:00:00');
      const y = d.getFullYear(), m = d.getMonth();
      if (monthFilter === 'this_month' && !(y === thisYear && m === thisMonth)) return false;
      if (monthFilter === 'last_month') {
        const lm = thisMonth === 0 ? 11 : thisMonth - 1;
        const ly = thisMonth === 0 ? thisYear - 1 : thisYear;
        if (!(y === ly && m === lm)) return false;
      }
      if (monthFilter === 'last_3') {
        const cutoff = new Date(thisYear, thisMonth - 2, 1);
        if (d < cutoff) return false;
      }
    }
    return true;
  });

  const badge = document.getElementById('tx-count-badge');
  if (badge) badge.textContent = filtered.length;

  const tbody = document.getElementById('tx-body');
  if (!filtered.length) {
    tbody.innerHTML = `
      <tr><td colspan="5">
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>${search || monthFilter !== 'all' || sourceFilter !== 'all'
            ? 'No transactions match your filters.'
            : 'No transactions yet. Click <strong>Sync Gmail</strong> or <strong>+ Add Transaction</strong>.'}</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(tx => {
    const isDebit = tx.transaction_type !== 'credit';
    const [bgC, txC] = catColors(tx.category);
    const src = tx.source || 'email';
    const merchant = tx.merchant || 'Unknown';
    return `
      <tr>
        <td>
          <div class="tx-merchant-cell">
            <div class="tx-avatar" style="background:${merchantColor(merchant)}">${initials(merchant)}</div>
            <div>
              <div class="tx-name">${merchant}</div>
              <div class="tx-date">${fmtDate(tx.date)}${tx.note ? ` · <span class="tx-note">${tx.note}</span>` : ''}</div>
            </div>
          </div>
        </td>
        <td>
          <button class="cat-badge" style="background:${bgC};color:${txC}"
            onclick="openRecategorize(${tx.id}, '${tx.category.replace(/'/g,"\\'")}')">
            ${tx.category}
          </button>
        </td>
        <td><span class="src-badge src-${src}">${src.charAt(0).toUpperCase()+src.slice(1)}</span></td>
        <td class="amount ${isDebit?'debit':'credit'}">${isDebit?'−':'+'}${fmtAmount(tx.amount)}</td>
        <td>
          <button class="btn-icon" title="Delete" onclick="deleteTransaction(${tx.id}, this)">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

async function deleteTransaction(id, btn) {
  if (!confirm('Delete this transaction?')) return;
  const res = await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    transactionsCache = transactionsCache.filter(t => t.id !== id);
    renderTransactions();
    fetchSummary();
  }
}

/* ── Add Transaction ─────────────────────────────────────────────────────────── */
async function handleAddTransaction(e) {
  e.preventDefault();
  const payload = {
    merchant: document.getElementById('tx-merchant').value,
    amount: parseFloat(document.getElementById('tx-amount').value),
    transaction_type: document.getElementById('tx-type').value,
    date: document.getElementById('tx-date').value,
    category: document.getElementById('tx-category').value,
    note: document.getElementById('tx-note').value || null,
  };
  const res = await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(payload) });
  if (res && res.ok) {
    closeModal('modal-add-tx');
    document.getElementById('add-tx-form').reset();
    setDefaultDate();
    loadAll();
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

/* ── Recategorize ────────────────────────────────────────────────────────────── */
function openRecategorize(txId, currentCat) {
  const options = categoriesCache.map(c =>
    `<option value="${c.name}" ${c.name === currentCat ? 'selected' : ''}>${c.name}</option>`
  ).join('');
  document.getElementById('recat-body').innerHTML = `
    <div class="field" style="margin-bottom:16px"><label>New Category</label>
      <select id="recat-select">${options}</select>
    </div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal('modal-recat')">Cancel</button>
      <button class="btn-primary" onclick="submitRecat(${txId})">Apply</button>
    </div>`;
  openModal('modal-recat');
}

async function submitRecat(txId) {
  const cat = document.getElementById('recat-select').value;
  const res = await apiFetch(`/transactions/${txId}/category`, {
    method: 'PATCH',
    body: JSON.stringify({ category: cat }),
  });
  if (res && res.ok) {
    const tx = transactionsCache.find(t => t.id === txId);
    if (tx) tx.category = cat;
    closeModal('modal-recat');
    renderTransactions();
    fetchSummary();
  }
}

/* ── Categories ──────────────────────────────────────────────────────────────── */
async function fetchCategories() {
  const res = await apiFetch('/categories');
  if (!res || !res.ok) return;
  categoriesCache = await res.json();
  renderCategoriesGrid();
}

function renderCategoriesGrid() {
  const grid = document.getElementById('categories-grid');
  grid.innerHTML = categoriesCache.map(cat => `
    <div class="cat-card" style="--cat-color:${catBorder(cat.name)}" onclick="openCategoryModal(${cat.id}, '${cat.name.replace(/'/g,"\\'")}')">
      <div class="cat-card-name">${cat.name}</div>
      <div class="cat-card-meta">
        <span class="cat-card-count">${cat.rules.length} keyword${cat.rules.length !== 1 ? 's' : ''}</span>
        ${cat.name !== 'Uncategorized'
          ? `<button class="cat-delete-btn" onclick="event.stopPropagation();deleteCategory(${cat.id},'${cat.name.replace(/'/g,"\\'")}')">✕</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

async function handleNewCategory(e) {
  e.preventDefault();
  const name = document.getElementById('new-cat-name').value.trim();
  const res = await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name }) });
  if (res && res.ok) {
    closeModal('modal-new-cat');
    document.getElementById('new-cat-name').value = '';
    await fetchCategories();
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Delete category "${name}"? All its rules will be removed.`)) return;
  const res = await apiFetch(`/categories/${id}`, { method: 'DELETE' });
  if (res && res.ok) fetchCategories();
}

/* ── Category Rules Modal ────────────────────────────────────────────────────── */
function openCategoryModal(catId, catName) {
  document.getElementById('cat-modal-title').textContent = `"${catName}" — Keywords`;
  const cat = categoriesCache.find(c => c.id === catId);
  renderCategoryModalBody(cat);
  openModal('modal-cat');
}

function renderCategoryModalBody(cat) {
  const chips = cat.rules.length
    ? cat.rules.map(r => `
        <span class="rule-chip">
          ${r.keyword}
          <button class="rule-chip-del" onclick="deleteRule(${r.id}, ${cat.id})">✕</button>
        </span>`).join('')
    : '<p style="color:var(--muted);font-size:.85rem;padding:8px 0">No keywords yet. Add one below.</p>';

  document.getElementById('cat-modal-body').innerHTML = `
    <div class="rules-info">
      Any transaction whose merchant name contains a keyword below will be auto-assigned to
      <strong>${cat.name}</strong>.
    </div>
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
  const btn = document.getElementById('apply-btn');
  const status = document.getElementById('apply-status');
  if (!btn) return;
  btn.disabled = true; btn.textContent = '⏳ Applying…';
  const res = await apiFetch('/recategorize', { method: 'POST' });
  btn.disabled = false; btn.textContent = '⚡ Apply to All Transactions';
  if (!res) return;
  const data = await res.json();
  if (status) {
    status.textContent = data.message || 'Done!';
    status.style.color = res.ok ? 'var(--credit)' : 'var(--debit)';
    setTimeout(() => { if (status) status.textContent = ''; }, 4000);
  }
  if (res.ok) { await fetchTransactions(); fetchSummary(); }
}
