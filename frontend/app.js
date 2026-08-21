const API_BASE = 'http://localhost:8000/api';
let pieChart = null;
let categoriesCache = [];

// ── Auth helpers ─────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem('ft_token'); }
function setToken(t) { localStorage.setItem('ft_token', t); }
function clearToken() { localStorage.removeItem('ft_token'); }

function authHeaders() {
    return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options.headers || {}) },
    });
    if (res.status === 401) { logout(); return null; }
    return res;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (getToken()) {
        showApp();
    } else {
        showLogin();
    }
    bindModalCloseButtons();
    bindUploadButton();
    setDefaultDate();
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
    // Auto-refresh every 30 seconds so push-added transactions appear
    setInterval(loadAll, 30_000);
}

function logout() {
    clearToken();
    location.reload();
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    // OAuth2PasswordRequestForm requires form-encoded body
    const body = new URLSearchParams({ username, password });
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

document.getElementById('logout-btn').addEventListener('click', logout);

// ── Load all data ─────────────────────────────────────────────────────────────

async function loadAll() {
    await fetchCategories();
    fetchTransactions();
    fetchSummary();
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function fetchSummary() {
    const res = await apiFetch('/summary');
    if (!res || !res.ok) return;
    const summary = await res.json();

    // Stats row
    const totalDebit  = summary.filter(s => true).reduce((a, s) => a + s.total_amount, 0);
    const txCount     = summary.reduce((a, s) => a + s.transaction_count, 0);
    const statsRow = document.getElementById('stats-row');
    statsRow.innerHTML = `
        <div class="stat-card">
            <div class="label">Total Spend</div>
            <div class="value debit">₹${totalDebit.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="label">Transactions</div>
            <div class="value">${txCount}</div>
        </div>
        <div class="stat-card">
            <div class="label">Categories</div>
            <div class="value">${summary.length}</div>
        </div>
    `;

    // Pie chart
    renderPieChart(summary);
}

function renderPieChart(summary) {
    const labels = summary.map(s => s.category);
    const data   = summary.map(s => s.total_amount);
    const palette = [
        '#4f46e5','#7c3aed','#db2777','#dc2626','#ea580c',
        '#ca8a04','#16a34a','#0891b2','#0284c7','#6b7280',
    ];

    const ctx = document.getElementById('pie-chart').getContext('2d');
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: palette, borderWidth: 2, borderColor: '#fff' }],
        },
        options: {
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
            },
            cutout: '60%',
        },
    });
}

// ── Transactions ──────────────────────────────────────────────────────────────

async function fetchTransactions() {
    const res = await apiFetch('/transactions?limit=200');
    if (!res || !res.ok) return;
    const transactions = await res.json();

    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px">No transactions yet.</td></tr>';
        return;
    }

    transactions.forEach(tx => {
        const amountClass = tx.transaction_type === 'credit' ? 'credit' : 'debit';
        const amountSign  = tx.transaction_type === 'credit' ? '+' : '-';
        const sourceCls   = `source-${tx.source || 'email'}`;
        const sourceLabel = (tx.source || 'email').charAt(0).toUpperCase() + (tx.source || 'email').slice(1);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${tx.date}</td>
            <td>${tx.merchant || '—'}${tx.note ? `<br><small style="color:#9ca3af">${tx.note}</small>` : ''}</td>
            <td><span class="cat-pill">${tx.category}</span></td>
            <td><span class="source-badge ${sourceCls}">${sourceLabel}</span></td>
            <td class="amount ${amountClass}">${amountSign} ₹${tx.amount.toFixed(2)}</td>
            <td>
                <button class="icon-btn" title="Change category" onclick="openRecategorize(${tx.id}, '${tx.category}')">✏️</button>
                <button class="icon-btn" title="Delete" onclick="deleteTransaction(${tx.id}, this)">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteTransaction(id, btn) {
    if (!confirm('Delete this transaction?')) return;
    const res = await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        btn.closest('tr').remove();
        fetchSummary();
    }
}

// ── Add Manual Transaction ────────────────────────────────────────────────────

document.getElementById('add-tx-btn').addEventListener('click', () => {
    populateCategorySelect('tx-category');
    openModal('add-tx-modal');
});

document.getElementById('add-tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        merchant:         document.getElementById('tx-merchant').value,
        amount:           parseFloat(document.getElementById('tx-amount').value),
        transaction_type: document.getElementById('tx-type').value,
        date:             document.getElementById('tx-date').value,
        category:         document.getElementById('tx-category').value,
        note:             document.getElementById('tx-note').value || null,
    };
    const res = await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(payload) });
    if (res && res.ok) {
        closeModal('add-tx-modal');
        document.getElementById('add-tx-form').reset();
        setDefaultDate();
        loadAll();
    }
});

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('tx-date');
    if (el) el.value = today;
}

// ── Recategorize ──────────────────────────────────────────────────────────────

function openRecategorize(txId, currentCat) {
    const body = document.getElementById('recat-body');
    const options = categoriesCache.map(c =>
        `<option value="${c.name}" ${c.name === currentCat ? 'selected' : ''}>${c.name}</option>`
    ).join('');
    body.innerHTML = `
        <label style="display:flex;flex-direction:column;gap:8px;font-size:.88rem;color:#6b7280;font-weight:500">
            New Category
            <select id="recat-select" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:.95rem">
                ${options}
            </select>
        </label>
        <div class="modal-footer" style="margin-top:16px">
            <button class="ghost-btn" onclick="closeModal('recat-modal')">Cancel</button>
            <button class="primary-btn" onclick="saveRecat(${txId})">Save</button>
        </div>
    `;
    openModal('recat-modal');
}

async function saveRecat(txId) {
    const category = document.getElementById('recat-select').value;
    const res = await apiFetch(`/transactions/${txId}/category`, {
        method: 'PATCH',
        body: JSON.stringify({ category }),
    });
    if (res && res.ok) { closeModal('recat-modal'); loadAll(); }
}

// ── Categories ────────────────────────────────────────────────────────────────

async function fetchCategories() {
    const res = await apiFetch('/categories');
    if (!res || !res.ok) return;
    categoriesCache = await res.json();
    renderCategoriesList();
}

function renderCategoriesList() {
    const container = document.getElementById('categories-list');
    container.innerHTML = '';
    categoriesCache.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-item';
        div.innerHTML = `
            <span class="cat-pill">${cat.name}</span>
            <div class="cat-item-actions">
                <button class="small-btn" onclick="openCategoryModal(${cat.id}, '${cat.name}')">Rules (${cat.rules.length})</button>
                ${cat.name !== 'Uncategorized'
                    ? `<button class="danger-btn" onclick="deleteCategory(${cat.id}, '${cat.name}')">✕</button>`
                    : ''}
            </div>
        `;
        container.appendChild(div);
    });
}

function populateCategorySelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = categoriesCache.map(c =>
        `<option value="${c.name}">${c.name}</option>`
    ).join('');
}

// New category
document.getElementById('new-cat-btn').addEventListener('click', () => openModal('new-cat-modal'));
document.getElementById('new-cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-cat-name').value.trim();
    const res = await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name }) });
    if (res && res.ok) {
        closeModal('new-cat-modal');
        document.getElementById('new-cat-name').value = '';
        await fetchCategories();
    }
});

async function deleteCategory(id, name) {
    if (!confirm(`Delete category "${name}"? All its rules will be removed.`)) return;
    const res = await apiFetch(`/categories/${id}`, { method: 'DELETE' });
    if (res && res.ok) fetchCategories();
}

// Category detail modal (rules)
function openCategoryModal(catId, catName) {
    const cat = categoriesCache.find(c => c.id === catId);
    document.getElementById('cat-modal-title').textContent = `"${catName}" — Keyword Rules`;
    renderCategoryModalBody(cat);
    openModal('cat-modal');
}

function renderCategoryModalBody(cat) {
    const body = document.getElementById('cat-modal-body');
    const ruleRows = cat.rules.length
        ? cat.rules.map(r => `
            <div class="rule-item">
                <span>${r.keyword}</span>
                <button class="danger-btn" onclick="deleteRule(${r.id}, ${cat.id})">✕</button>
            </div>`).join('')
        : '<p style="color:#9ca3af;font-size:.88rem">No rules yet.</p>';

    body.innerHTML = `
        <div style="margin-bottom:8px;font-size:.83rem;color:#6b7280">
            Transactions whose merchant contains any keyword below are auto-categorized as <strong>${cat.name}</strong>.
        </div>
        <div id="rules-list-${cat.id}">${ruleRows}</div>
        <div class="add-rule-row">
            <input type="text" id="new-rule-kw-${cat.id}" placeholder="e.g. swiggy">
            <button class="primary-btn" onclick="addRule(${cat.id})">Add</button>
        </div>
    `;
}

async function addRule(catId) {
    const input = document.getElementById(`new-rule-kw-${catId}`);
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) return;
    const res = await apiFetch(`/categories/${catId}/rules`, {
        method: 'POST',
        body: JSON.stringify({ keyword }),
    });
    if (res && res.ok) {
        input.value = '';
        await fetchCategories();
        const cat = categoriesCache.find(c => c.id === catId);
        renderCategoryModalBody(cat);
    }
}

async function deleteRule(ruleId, catId) {
    const res = await apiFetch(`/rules/${ruleId}`, { method: 'DELETE' });
    if (res && res.ok) {
        await fetchCategories();
        const cat = categoriesCache.find(c => c.id === catId);
        if (cat) renderCategoryModalBody(cat);
    }
}

// ── Statement upload ──────────────────────────────────────────────────────────

function bindUploadButton() {
    const btn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('statement-file');
    const status = document.getElementById('upload-status');

    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        if (!fileInput.files.length) return;
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        status.textContent = 'Uploading…';
        status.style.color = '#6b7280';

        const res = await fetch(`${API_BASE}/statement/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData,
        });

        const data = res.ok ? await res.json() : await res.json();
        if (!res.ok) {
            status.textContent = data.detail || 'Upload failed';
            status.style.color = '#dc2626';
        } else {
            status.textContent = data.message;
            status.style.color = '#16a34a';
            loadAll();
        }
        fileInput.value = '';
        setTimeout(() => { status.textContent = ''; }, 5000);
    });
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function bindModalCloseButtons() {
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
}
