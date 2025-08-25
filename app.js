/* ------------------ Storage helpers (per user) ------------------ */
const STORAGE = {
  users: 'mto_users',
  session: 'mto_session',
  dataPrefix: 'mto_data_', // + userId
};

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function hash(s) { // simple obfuscation
  let h = 0; for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0; return String(h);
}

function loadUsers() {
  return JSON.parse(localStorage.getItem(STORAGE.users) || '[]');
}
function saveUsers(list) {
  localStorage.setItem(STORAGE.users, JSON.stringify(list));
}

function setSession(userId) {
  localStorage.setItem(STORAGE.session, userId);
}
function getSession() {
  return localStorage.getItem(STORAGE.session);
}
function clearSession() {
  localStorage.removeItem(STORAGE.session);
}

function dataKey(uid) { return STORAGE.dataPrefix + uid; }
function loadData(uid) {
  return JSON.parse(localStorage.getItem(dataKey(uid)) || '{}');
}
function saveData(uid, data) {
  localStorage.setItem(dataKey(uid), JSON.stringify(data));
}

/* ------------------ App state ------------------ */
let currentUser = null;
let state = {
  granularity: 'monthly', // daily, weekly, monthly, 3m, 6m, 9m, yearly
  periodStart: startOfMonth(new Date()),
  search: '',
  charts: {},
  editingRecordId: null,
};

/* ------------------ Date utilities ------------------ */
function ymd(d) { return d.toISOString().slice(0, 10); }
function parseISO(s) { const d = new Date(s); d.setHours(0, 0, 0, 0); return d; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // Monday start
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfYear(d) { return new Date(d.getFullYear(), 0, 1); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function labelForPeriod(gran, start) {
  const opts = { month: 'long', year: 'numeric' };
  if (gran === 'daily') return start.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  if (gran === 'weekly') {
    const end = addDays(start, 6);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }
  if (gran === 'monthly') return start.toLocaleDateString(undefined, opts);
  if (gran === '3m') return `${start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · 3 months`;
  if (gran === '6m') return `${start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · 6 months`;
  if (gran === '9m') return `${start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · 9 months`;
  if (gran === 'yearly') return `${start.getFullYear()}`;
  return '';
}
function periodRange(gran, start) {
  if (gran === 'daily') return [startOfDay(start), addDays(startOfDay(start), 1)];
  if (gran === 'weekly') return [startOfWeek(start), addDays(startOfWeek(start), 7)];
  if (gran === 'monthly') return [startOfMonth(start), addMonths(startOfMonth(start), 1)];
  if (gran === '3m') return [startOfMonth(start), addMonths(startOfMonth(start), 3)];
  if (gran === '6m') return [startOfMonth(start), addMonths(startOfMonth(start), 6)];
  if (gran === '9m') return [startOfMonth(start), addMonths(startOfMonth(start), 9)];
  if (gran === 'yearly') return [startOfYear(start), addMonths(startOfYear(start), 12)];
}
function shiftStart(gran, start, dir) {
  if (gran === 'daily') return addDays(start, dir);
  if (gran === 'weekly') return addDays(start, 7 * dir);
  if (gran === 'monthly') return addMonths(start, dir);
  if (gran === '3m') return addMonths(start, 3 * dir);
  if (gran === '6m') return addMonths(start, 6 * dir);
  if (gran === '9m') return addMonths(start, 9 * dir);
  if (gran === 'yearly') return addMonths(start, 12 * dir);
}

/* ------------------ Auth handlers ------------------ */
const authEl = document.getElementById('auth');
const appEl = document.getElementById('app');
const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

tabLogin.onclick = () => {
  tabLogin.classList.add('active'); tabSignup.classList.remove('active');
  loginForm.classList.remove('hidden'); signupForm.classList.add('hidden');
};
tabSignup.onclick = () => {
  tabSignup.classList.add('active'); tabLogin.classList.remove('active');
  signupForm.classList.remove('hidden'); loginForm.classList.add('hidden');
};

/* Login */
loginForm.onsubmit = (e) => {
  e.preventDefault();
  const emailInput = document.getElementById("loginEmail").value.trim().toLowerCase();
  const pwInput = document.getElementById("loginPassword");

  // DEMO ACCOUNT (jesu only, no password required)
  if (emailInput === "jesu") {
    const demoUser = { id: "_demo", name: "Demo User", email: "jesu" };
    setSession(demoUser.id);
    if (!localStorage.getItem(dataKey(demoUser.id))) {
      saveData(demoUser.id, { records: [], budgets: [], accounts: [], categories: [] });
    }
    startApp(demoUser);
    return;
  }

  // Real users must have password
  if (!emailInput.includes("@")) {
    alert("Please enter a valid email address.");
    return;
  }
  if (!pwInput.value) {
    alert("Password is required.");
    return;
  }

  const users = loadUsers();
  const u = users.find(u => u.email === emailInput && u.password === hash(pwInput.value));
  if (u) {
    setSession(u.id);
    startApp(u);
  } else {
    alert("Invalid login.");
  }
};

/* Signup */
function startApp(user) {
  currentUser = user;
  document.getElementById("auth").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  // set default active page
  document.querySelectorAll('.sidebar-item').forEach((el) => {
    if (el.dataset.page === 'records') el.classList.add('active');
    else el.classList.remove('active');
  });

  // set period
  state.granularity = 'monthly';
  state.periodStart = startOfMonth(new Date());
  updatePeriodLabel();

  // ---------------- Event Wires ----------------
  document.getElementById('periodBtn').onclick = () => {
    document.querySelector('.dropdown').classList.toggle('open');
  };
  document.getElementById('periodMenu').querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      state.granularity = btn.dataset.g;
      const now = new Date();
      if (state.granularity === 'daily') state.periodStart = startOfDay(now);
      else if (state.granularity === 'weekly') state.periodStart = startOfWeek(now);
      else if (state.granularity === 'monthly' || ['3m', '6m', '9m'].includes(state.granularity)) state.periodStart = startOfMonth(now);
      else if (state.granularity === 'yearly') state.periodStart = startOfYear(now);
      document.getElementById('periodBtn').textContent = labelForGran(state.granularity);
      document.querySelector('.dropdown').classList.remove('open');
      refreshAll();
    };
  });

  document.getElementById('prevPeriod').onclick = () => {
    state.periodStart = shiftStart(state.granularity, state.periodStart, -1);
    refreshAll();
  };
  document.getElementById('nextPeriod').onclick = () => {
    state.periodStart = shiftStart(state.granularity, state.periodStart, 1);
    refreshAll();
  };

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderRecords();
  });

  // Records
  document.getElementById('addRecordBtn').onclick = openAddRecord;
  document.getElementById('saveRecordBtn').onclick = saveRecord;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = importJSON;

  // Budgets
  document.getElementById('addBudgetBtn').onclick = addBudget;

  // Accounts
  document.getElementById('addAccountBtn').onclick = addAccount;

  // Categories
  document.getElementById('addCategoryBtn').onclick = addCategory;

  // Settings
  document.getElementById('lightBtn').onclick = () => setTheme('light');
  document.getElementById('darkBtn').onclick = () => setTheme('dark');
  document.getElementById('exportExcelBtn').onclick = exportExcel;
  document.getElementById('backupBtn').onclick = backupJSON;
  document.getElementById('restoreFile').onchange = restoreJSON;
  document.getElementById('deleteBtn').onclick = deleteAccountData;
  document.getElementById('resetBtn').onclick = resetSample;
  document.getElementById('likeBtn').onclick = () => alert('Thanks for the like!');
  document.getElementById('helpBtn').onclick = () => alert('FAQ: Add records, set budgets, export Excel, backup/restore.');
  document.getElementById('feedbackBtn').onclick = () => prompt('Share feedback:', '');

  // ---------------- First Paint ----------------
  populateSelects();
  refreshAll();
}
/* Signup */

document.getElementById('prevPeriod').onclick = () => { state.periodStart = shiftStart(state.granularity, state.periodStart, -1); refreshAll(); };
document.getElementById('nextPeriod').onclick = () => { state.periodStart = shiftStart(state.granularity, state.periodStart, 1); refreshAll(); };

document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); renderRecords(); });

// Records events
document.getElementById('addRecordBtn').onclick = openAddRecord;
document.getElementById('saveRecordBtn').onclick = saveRecord;
document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = importJSON;

// Budgets
document.getElementById('addBudgetBtn').onclick = addBudget;

// Accounts
document.getElementById('addAccountBtn').onclick = addAccount;

// Categories
document.getElementById('addCategoryBtn').onclick = addCategory;

// Settings
document.getElementById('lightBtn').onclick = () => setTheme('light');
document.getElementById('darkBtn').onclick = () => setTheme('dark');
document.getElementById('exportExcelBtn').onclick = exportExcel;
document.getElementById('backupBtn').onclick = backupJSON;
document.getElementById('restoreFile').onchange = restoreJSON;
document.getElementById('deleteBtn').onclick = deleteAccountData;
document.getElementById('resetBtn').onclick = resetSample;
document.getElementById('likeBtn').onclick = () => alert('Thanks for the like!');
document.getElementById('helpBtn').onclick = () => alert('FAQ: Add records, set budgets, export Excel, backup/restore.');
document.getElementById('feedbackBtn').onclick = () => prompt('Share feedback:', '');

// first paint
populateSelects();
refreshAll();


/* ------------------ UI helpers ------------------ */
function labelForGran(g) {
  if (g === '3m') return '3 Months';
  if (g === '6m') return '6 Months';
  if (g === '9m') return '9 Months';
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function updatePeriodLabel() {
  document.getElementById('currentPeriodLabel').textContent = labelForPeriod(state.granularity, state.periodStart);
  document.getElementById('periodBtn').textContent = labelForGran(state.granularity);
}

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(x => x.classList.remove('active'));
  if (el) el.classList.add('active');
  if (id === 'analysis') renderAnalysis();
}


/* ------------------ Data access (per user) ------------------ */
function getData() {
  const d = loadData(currentUser.id);
  d.records ||= [];
  d.budgets ||= [];
  d.accounts ||= [];
  d.categories ||= [];
  return d;
}
function setData(d) { saveData(currentUser.id, d); }

/* ------------------ Records ------------------ */
function openAddRecord() {
  state.editingRecordId = null;
  document.getElementById('recordModalTitle').textContent = 'Add record';
  document.getElementById('recordDate').value = ymd(new Date());
  document.getElementById('recordType').value = 'expense';
  syncCategorySelect('expense');
  syncAccountSelect();
  document.getElementById('recordAmount').value = '';
  document.getElementById('recordNote').value = '';
  openModal();
}

document.getElementById('recordType').addEventListener('change', (e) => {
  syncCategorySelect(e.target.value);
});

function syncCategorySelect(type) {
  const { categories } = getData();
  const sel = document.getElementById('recordCategory');
  sel.innerHTML = '';
  categories.filter(c => c.type === type).forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    sel.appendChild(o);
  });
}

function syncAccountSelect() {
  const { accounts } = getData();
  const sel = document.getElementById('recordAccount');
  sel.innerHTML = '';
  accounts.forEach(a => {
    const o = document.createElement('option');
    o.value = a.id; o.textContent = a.name;
    sel.appendChild(o);
  });
}

function openModal() { document.getElementById('recordModal').classList.remove('hidden'); }
function closeModal() { document.getElementById('recordModal').classList.add('hidden'); }

function saveRecord() {
  const d = getData();
  const rec = {
    id: state.editingRecordId || uid(),
    date: document.getElementById('recordDate').value,
    type: document.getElementById('recordType').value,
    categoryId: document.getElementById('recordCategory').value,
    accountId: document.getElementById('recordAccount').value,
    amount: Number(document.getElementById('recordAmount').value || 0),
    note: document.getElementById('recordNote').value.trim(),
  };
  if (!rec.date) { alert('Date required'); return; }

  const idx = d.records.findIndex(r => r.id === rec.id);
  if (idx >= 0) d.records[idx] = rec; else d.records.push(rec);
  // sort ascending by date
  d.records.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));
  setData(d);
  closeModal();
  refreshAll();
}

function deleteRecord(id) {
  const d = getData();
  const idx = d.records.findIndex(r => r.id === id);
  if (idx >= 0) { d.records.splice(idx, 1); setData(d); refreshAll(); }
}

/* filtering and rendering */
function recordsInCurrentPeriod() {
  const d = getData();
  const [start, end] = periodRange(state.granularity, state.periodStart);
  return d.records.filter(r => {
    const t = parseISO(r.date);
    if (t < start || t >= end) return false;
    if (!state.search) return true;
    const { categories, accounts } = d;
    const cat = categories.find(c => c.id === r.categoryId);
    const acc = accounts.find(a => a.id === r.accountId);
    const hay = [
      r.note || '',
      cat ? cat.name : '',
      acc ? acc.name : '',
    ].join(' ').toLowerCase();
    return hay.includes(state.search);
  });
}

function renderRecords() {
  updatePeriodLabel();
  const list = document.getElementById('records-list');
  list.innerHTML = '';
  const d = getData();
  const byDay = new Map();
  recordsInCurrentPeriod().forEach(r => {
    const day = new Date(r.date);
    const header = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', weekday: 'long' });
    if (!byDay.has(header)) byDay.set(header, []);
    byDay.get(header).push(r);
  });

  if (byDay.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.textContent = 'No records in this period.';
    list.appendChild(empty);
    return;
  }

  const { categories, accounts } = d;
  const formatAmt = n => '₱' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  Array.from(byDay.entries()).sort((a, b) => new Date(b[0]) - new Date(a[0])).forEach(([dateLabel, items]) => {
    const grp = document.createElement('div');
    grp.className = 'record-group';
    const h = document.createElement('h4');
    h.textContent = dateLabel;
    grp.appendChild(h);

    items.forEach(r => {
      const cat = categories.find(c => c.id === r.categoryId);
      const acc = accounts.find(a => a.id === r.accountId);

      const row = document.createElement('div');
      row.className = 'record-item';

      const left = document.createElement('div');
      left.className = 'record-left';
      const badgeCat = document.createElement('span');
      badgeCat.className = 'badge';
      badgeCat.style.background = cat ? cat.color + '22' : '#eef2ff';
      badgeCat.style.color = '#334155';
      badgeCat.innerHTML = `<i class="fa ${cat ? cat.icon : 'fa-tag'}" style="color:${cat ? cat.color : '#888'}"></i> ${cat ? cat.name : 'Category'}`;

      const badgeAcc = document.createElement('span');
      badgeAcc.className = 'badge';
      badgeAcc.innerHTML = `<i class="fa ${acc ? acc.icon : 'fa-wallet'}" style="color:${acc ? acc.color : '#888'}"></i> ${acc ? acc.name : 'Account'}`;

      const note = document.createElement('span');
      note.style.color = 'var(--muted)';
      note.textContent = r.note || '';

      left.appendChild(badgeCat);
      left.appendChild(badgeAcc);
      if (r.note) left.appendChild(note);

      const right = document.createElement('div');
      right.className = 'record-right';
      right.style.color = r.type === 'expense' ? '#e74c3c' : '#16a34a';
      right.textContent = (r.type === 'expense' ? '-' : '+') + formatAmt(r.amount);

      const actions = document.createElement('div');
      actions.className = 'row';
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '<i class="fa fa-pen"></i>';
      editBtn.onclick = () => editRecord(r.id);
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.innerHTML = '<i class="fa fa-trash"></i>';
      delBtn.onclick = () => deleteRecord(r.id);

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(right);
      row.appendChild(actions);

      grp.appendChild(row);
    });

    list.appendChild(grp);
  });
}

function editRecord(id) {
  const d = getData();
  const r = d.records.find(x => x.id === id);
  if (!r) return;
  state.editingRecordId = r.id;
  document.getElementById('recordModalTitle').textContent = 'Edit record';
  document.getElementById('recordDate').value = r.date;
  document.getElementById('recordType').value = r.type;
  syncCategorySelect(r.type);
  document.getElementById('recordCategory').value = r.categoryId;
  syncAccountSelect();
  document.getElementById('recordAccount').value = r.accountId;
  document.getElementById('recordAmount').value = r.amount;
  document.getElementById('recordNote').value = r.note || '';
  openModal();
}

/* import/export JSON */
function importJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const incoming = JSON.parse(fr.result);
      const d = getData();
      const map = new Map(d.records.map(r => [r.id, r]));
      (incoming.records || []).forEach(r => { if (!map.has(r.id)) d.records.push(r); });
      d.records.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));
      setData(d); refreshAll();
      alert('Imported');
    } catch (err) { alert('Invalid JSON'); }
  };
  fr.readAsText(file);
  e.target.value = '';
}

/* ------------------ Budgets ------------------ */
function addBudget() {
  const d = getData();
  const catId = document.getElementById('budgetCategory').value;
  const amt = Number(document.getElementById('budgetAmount').value || 0);
  if (!catId || !amt) { alert('Select category and amount'); return; }
  const exist = d.budgets.find(b => b.categoryId === catId);
  if (exist) exist.amount = amt; else d.budgets.push({ id: uid(), categoryId: catId, amount: amt });
  setData(d);
  renderBudgets();
}

function renderBudgets() {
  const wrap = document.getElementById('budgets-list');
  wrap.innerHTML = '';
  const d = getData();
  const { categories } = d;
  // spent in current period per category
  const [start, end] = periodRange(state.granularity, state.periodStart);
  const spent = {};
  d.records.filter(r => r.type === 'expense' && parseISO(r.date) >= start && parseISO(r.date) < end)
    .forEach(r => { spent[r.categoryId] = (spent[r.categoryId] || 0) + r.amount; });

  d.budgets.forEach(b => {
    const cat = categories.find(c => c.id === b.categoryId);
    const used = spent[b.categoryId] || 0;
    const pct = Math.min(100, Math.round(100 * used / b.amount));
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div class="row" style="gap:8px;">
          <span class="badge" style="background:${cat.color}22"><i class="fa ${cat.icon}" style="color:${cat.color}"></i>${cat.name}</span>
          <span style="color:var(--muted)">Limit ₱${b.amount.toLocaleString()}</span>
        </div>
        <div><strong>₱${(used).toLocaleString()}</strong></div>
      </div>
      <div style="background:#e5e7eb;height:10px;border-radius:999px;overflow:hidden;margin-top:8px;">
        <div style="width:${pct}%;height:100%;background:${cat.color};"></div>
      </div>
      <div class="row" style="margin-top:8px;gap:6px;">
        <button onclick="removeBudget('${b.id}')" class="danger"><i class="fa fa-trash"></i> Delete</button>
      </div>
    `;
    wrap.appendChild(card);
  });

  // fill selector
  const sel = document.getElementById('budgetCategory');
  sel.innerHTML = '';
  categories.filter(c => c.type === 'expense').forEach(c => {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o);
  });
}

function removeBudget(id) {
  const d = getData();
  const idx = d.budgets.findIndex(b => b.id === id);
  if (idx >= 0) { d.budgets.splice(idx, 1); setData(d); renderBudgets(); }
}

/* ------------------ Accounts ------------------ */
function addAccount() {
  const name = document.getElementById('accountName').value.trim();
  const color = document.getElementById('accountColor').value;
  const icon = document.getElementById('accountIcon').value;
  if (!name) { alert('Enter account name'); return; }
  const d = getData();
  d.accounts.push({ id: uid(), name, color, icon, balance: 0 });
  setData(d);
  populateSelects();
  renderAccounts();
  document.getElementById('accountName').value = '';
}

function renderAccounts() {
  const list = document.getElementById('accounts-list');
  list.innerHTML = '';
  const d = getData();
  d.accounts.forEach(a => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div class="row" style="gap:8px;">
          <span class="badge"><i class="fa ${a.icon}" style="color:${a.color}"></i>${a.name}</span>
        </div>
        <div><strong>₱${(a.balance || 0).toLocaleString()}</strong></div>
      </div>
      <div class="row" style="margin-top:8px;gap:6px;">
        <button onclick="removeAccount('${a.id}')" class="danger"><i class="fa fa-trash"></i> Delete</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function removeAccount(id) {
  const d = getData();
  if (d.records.some(r => r.accountId === id)) { alert('Remove linked records first'); return; }
  const idx = d.accounts.findIndex(a => a.id === id);
  if (idx >= 0) { d.accounts.splice(idx, 1); setData(d); populateSelects(); renderAccounts(); }
}

/* ------------------ Categories ------------------ */
function addCategory() {
  const name = document.getElementById('categoryName').value.trim();
  const type = document.getElementById('categoryType').value;
  const color = document.getElementById('categoryColor').value;
  const icon = document.getElementById('categoryIcon').value;
  if (!name) { alert('Enter category name'); return; }
  const d = getData();
  d.categories.push({ id: uid(), type, name, color, icon });
  setData(d);
  populateSelects();
  renderCategories();
  document.getElementById('categoryName').value = '';
}

function renderCategories() {
  const exp = document.getElementById('expense-categories');
  const inc = document.getElementById('income-categories');
  exp.innerHTML = ''; inc.innerHTML = '';
  const d = getData();
  d.categories.forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = c.color + '22';
    chip.innerHTML = `<i class="fa ${c.icon}" style="color:${c.color}"></i>${c.name}
      <button class="danger" style="padding:2px 6px;margin-left:6px" onclick="removeCategory('${c.id}')"><i class="fa fa-xmark"></i></button>`;
    (c.type === 'expense' ? exp : inc).appendChild(chip);
  });
}
function removeCategory(id) {
  const d = getData();
  if (d.records.some(r => r.categoryId === id)) { alert('Remove linked records first'); return; }
  const idx = d.categories.findIndex(c => c.id === id);
  if (idx >= 0) { d.categories.splice(idx, 1); setData(d); populateSelects(); renderCategories(); }
}

/* ------------------ Select population ------------------ */
function populateSelects() {
  // record modal categories/accounts
  const { categories, accounts } = getData();
  // record modal driven by type change, also ensure defaults
  syncCategorySelect('expense');
  syncAccountSelect();

  // budgets select
  const sel = document.getElementById('budgetCategory');
  sel.innerHTML = '';
  categories.filter(c => c.type === 'expense').forEach(c => {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o);
  });
}

/* ------------------ Analysis ------------------ */
function renderAnalysis() {
  // destroy old
  Object.values(state.charts).forEach(ch => ch && ch.destroy && ch.destroy());
  state.charts = {};

  const d = getData();
  const [start, end] = periodRange(state.granularity, state.periodStart);
  const inPeriod = d.records.filter(r => {
    const t = parseISO(r.date);
    return t >= start && t < end;
  });

  const sumBy = (rows, key) => rows.reduce((a, r) => (a[key(r)] = (a[key(r)] || 0) + r.amount, a), {});
  const catName = id => (d.categories.find(c => c.id === id) || { name: 'Other' }).name;
  const accName = id => (d.accounts.find(a => a.id === id) || { name: 'Account' }).name;

  // expenses overview
  const expenses = inPeriod.filter(r => r.type === 'expense');
  const expByCat = sumBy(expenses, r => catName(r.categoryId));
  state.charts.expensesChart = new Chart(document.getElementById('expensesChart'), {
    type: 'pie',
    data: { labels: Object.keys(expByCat), datasets: [{ data: Object.values(expByCat) }] },
  });
  const legend = document.getElementById('expensesLegend');
  legend.innerHTML = Object.entries(expByCat).map(([k, v]) => `<div class="row" style="justify-content:space-between;"><span>${k}</span><strong>₱${v.toLocaleString()}</strong></div>`).join('');

  // income overview
  const incomes = inPeriod.filter(r => r.type === 'income');
  const incByCat = sumBy(incomes, r => catName(r.categoryId));
  state.charts.incomeChart = new Chart(document.getElementById('incomeChart'), {
    type: 'pie',
    data: { labels: Object.keys(incByCat), datasets: [{ data: Object.values(incByCat) }] },
  });

  // flows
  function seriesByDay(rows) {
    const map = {};
    rows.forEach(r => {
      const k = ymd(parseISO(r.date));
      map[k] = (map[k] || 0) + r.amount;
    });
    const keys = Object.keys(map).sort();
    return { labels: keys, values: keys.map(k => map[k]) };
  }
  const expS = seriesByDay(expenses);
  const incS = seriesByDay(incomes);

  state.charts.expenseFlowChart = new Chart(document.getElementById('expenseFlowChart'), {
    type: 'line', data: { labels: expS.labels, datasets: [{ label: 'Expenses', data: expS.values }] },
    options: { scales: { y: { beginAtZero: true } } }
  });
  state.charts.incomeFlowChart = new Chart(document.getElementById('incomeFlowChart'), {
    type: 'line', data: { labels: incS.labels, datasets: [{ label: 'Income', data: incS.values }] },
    options: { scales: { y: { beginAtZero: true } } }
  });

  // account analysis
  const byAcc = sumBy(inPeriod, r => accName(r.accountId));
  state.charts.accountChart = new Chart(document.getElementById('accountChart'), {
    type: 'bar', data: { labels: Object.keys(byAcc), datasets: [{ label: 'Total', data: Object.values(byAcc) }] },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

/* ------------------ Settings ------------------ */
function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
}

function exportExcel() {
  const d = getData();
  const rows = d.records
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id))
    .map(r => {
      const cat = d.categories.find(c => c.id === r.categoryId);
      const acc = d.accounts.find(a => a.id === r.accountId);
      return {
        Date: r.date,
        Type: r.type,
        Category: cat ? cat.name : '',
        Account: acc ? acc.name : '',
        Amount: r.amount,
        Note: r.note || '',
      };
    });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Records');
  XLSX.writeFile(wb, 'money-tracker-records.xlsx');
}

function backupJSON() {
  const d = getData();
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'money-tracker-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function restoreJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!d || typeof d !== 'object') throw new Error();
      setData(d);
      populateSelects();
      refreshAll();
      alert('Restored');
    } catch { alert('Invalid file'); }
  };
  fr.readAsText(file);
  e.target.value = '';
}

function deleteAccountData() {
  if (!confirm('Delete all data for this account?')) return;
  saveData(currentUser.id, { records: [], budgets: [], accounts: [], categories: [] });
  populateSelects();
  refreshAll();
}

function resetSample() {
  const sample = {
    records: [
      { id: uid(), date: ymd(addDays(new Date(), -1)), type: 'expense', categoryId: '_food', accountId: '_cash', amount: 150, note: 'Lunch' },
      { id: uid(), date: ymd(addDays(new Date(), -1)), type: 'income', categoryId: '_allow', accountId: '_cash', amount: 500, note: 'Allowance' },
      { id: uid(), date: ymd(new Date()), type: 'expense', categoryId: '_trans', accountId: '_cash', amount: 60, note: 'Jeep' },
    ],
    budgets: [],
    accounts: [{ id: '_cash', name: 'Cash', color: '#2ecc71', icon: 'fa-money-bill', balance: 0 }],
    categories: [
      { id: '_food', type: 'expense', name: 'Food', color: '#e67e22', icon: 'fa-burger' },
      { id: '_trans', type: 'expense', name: 'Transport', color: '#3498db', icon: 'fa-bus' },
      { id: '_allow', type: 'income', name: 'Allowance', color: '#2ecc71', icon: 'fa-sack-dollar' },
    ],
  };
  setData(sample);
  populateSelects();
  refreshAll();
}

/* ------------------ Refresh ------------------ */
function refreshAll() {
  updatePeriodLabel();
  renderRecords();
  renderBudgets();
  renderAccounts();
  renderCategories();
  if (document.getElementById('analysis').classList.contains('active')) renderAnalysis();
}

function logout() {
  clearSession();
  currentUser = null;

  // hide app, show auth again
  document.getElementById("app").classList.add("hidden");
  document.getElementById("auth").classList.remove("hidden");

  // reset login form inputs
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";

  // reset to login tab
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
}
// --- Home button: always go to Records page ---
const _home = document.getElementById('homeBtn');
if (_home) {
  _home.addEventListener('click', () => {
    const recordsTab = document.querySelector('.sidebar-item[data-page="records"]');
    if (!recordsTab) return;

    // show Records page (reuses showPage logic)
    showPage('records', recordsTab);

    // ensure active state reflected on sidebar
    document.querySelectorAll('.sidebar-item').forEach(it => it.classList.remove('active'));
    recordsTab.classList.add('active');

    // ensure app is visible + refresh content
    document.getElementById('auth')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');
    if (typeof refreshAll === 'function') refreshAll();
  });
}




