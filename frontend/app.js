const API_BASE = 'https://finance-tracker-z1ea.onrender.com/api';

document.addEventListener('DOMContentLoaded', () => {
    fetchTransactions();
    fetchSummary();

    const syncBtn = document.getElementById('sync-btn');
    syncBtn.addEventListener('click', handleSync);

    const statementInput = document.getElementById('statement-upload');
    statementInput.addEventListener('change', handleStatementUpload);
});

async function handleStatementUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusSpan = document.getElementById('upload-status');
    statusSpan.textContent = 'Processing statement...';
    statusSpan.style.color = '#4b5563';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/statement/upload`, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Upload failed');
        }

        statusSpan.textContent = data.message;
        statusSpan.style.color = '#16a34a';

        fetchTransactions();
        fetchSummary();

        setTimeout(() => {
            statusSpan.textContent = '';
        }, 5000);
    } catch (error) {
        statusSpan.textContent = 'Upload failed. Check console.';
        statusSpan.style.color = '#dc2626';
        console.error('Statement upload error:', error);
    } finally {
        event.target.value = '';
    }
}

async function handleSync() {
    const statusSpan = document.getElementById('sync-status');
    statusSpan.textContent = 'Syncing emails...';
    statusSpan.style.color = '#4b5563';
    
    try {
        const response = await fetch(`${API_BASE}/sync`, { method: 'POST' });
        const data = await response.json();
        
        statusSpan.textContent = data.message || 'Sync complete!';
        statusSpan.style.color = '#16a34a';
        
        // Refresh data
        fetchTransactions();
        fetchSummary();
        
        setTimeout(() => {
            statusSpan.textContent = '';
        }, 3000);
    } catch (error) {
        statusSpan.textContent = 'Sync failed. Check console.';
        statusSpan.style.color = '#dc2626';
        console.error('Sync error:', error);
    }
}

async function fetchTransactions() {
    try {
        const response = await fetch(`${API_BASE}/transactions`);
        const transactions = await response.json();
        
        const tbody = document.getElementById('transactions-body');
        tbody.innerHTML = '';
        
        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No transactions found.</td></tr>';
            return;
        }
        
        transactions.forEach(tx => {
            const tr = document.createElement('tr');
            
            const amountClass = tx.transaction_type.toLowerCase() === 'credit' ? 'credit' : 'debit';
            const amountSign = tx.transaction_type.toLowerCase() === 'credit' ? '+' : '-';
            
            tr.innerHTML = `
                <td>${tx.date}</td>
                <td>${tx.merchant}</td>
                <td><span class="category-badge">${tx.category}</span></td>
                <td>${tx.transaction_type}</td>
                <td class="${amountClass}">${amountSign} Rs. ${tx.amount.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Failed to fetch transactions:', error);
    }
}

async function fetchSummary() {
    try {
        const response = await fetch(`${API_BASE}/summary`);
        const summary = await response.json();
        
        const container = document.getElementById('summary-container');
        container.innerHTML = '';
        
        if (summary.length === 0) {
            container.innerHTML = '<p>No data yet.</p>';
            return;
        }
        
        summary.forEach(item => {
            const div = document.createElement('div');
            div.className = 'summary-item';
            div.innerHTML = `
                <span class="cat-name">${item.category} <small>(${item.transaction_count})</small></span>
                <span class="cat-amount">Rs. ${item.total_amount.toFixed(2)}</span>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Failed to fetch summary:', error);
    }
}
