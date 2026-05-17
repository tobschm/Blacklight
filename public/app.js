// ---- State ----
let currentItem = null;
let saveDebounceTimer = null;
let availableCategories = []; // populated from /api/config, never includes 'None'

// ---- Category helpers ----
// First 5 named slots; 'None' is always white
const CATEGORY_COLORS = ['#c0392b', '#f1c40f', '#2980b9', '#27ae60', '#8e44ad'];

function categoryColor(category) {
  if (!category || category === 'None') return '#ffffff';
  const idx = availableCategories.indexOf(category);
  if (idx === -1) return '#ffffff';
  return CATEGORY_COLORS[idx] || '#ffffff';
}

function populateCategoryDropdown(selectedCategory) {
  const select = document.getElementById('detail-category');
  select.innerHTML = '';
  const all = ['None', ...availableCategories];
  all.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  // If saved category is no longer available, fall back to 'None'
  const validCategories = new Set(all);
  select.value = validCategories.has(selectedCategory) ? selectedCategory : 'None';
  updateCategorySelectStyle(select);
}

// ---- Views ----
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const detailView = document.getElementById('detail-view');

function showView(view) {
  loginView.hidden = true;
  dashboardView.hidden = true;
  detailView.hidden = true;
  view.hidden = false;
}

// ---- API helpers ----
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) {
    showView(loginView);
    return null;
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- Login ----
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');

// ---- DB selector ----
const dbDefaultRadio = document.getElementById('db-default');
const dbCustomRadio = document.getElementById('db-custom');
const dbCustomRow = document.getElementById('db-custom-row');
const dbPathInput = document.getElementById('db-path-input');
const dbBrowseBtn = document.getElementById('db-browse-btn');
const dbFileInput = document.getElementById('db-file-input');

const LS_DB_PATH_KEY = 'projectOrganizer.lastDbPath';

function restoreDbSelection() {
  const saved = localStorage.getItem(LS_DB_PATH_KEY);
  if (saved && saved !== '__default__') {
    dbCustomRadio.checked = true;
    dbCustomRow.hidden = false;
    dbPathInput.value = saved;
  } else {
    dbDefaultRadio.checked = true;
    dbCustomRow.hidden = true;
    dbPathInput.value = '';
  }
}

dbDefaultRadio.addEventListener('change', () => {
  dbCustomRow.hidden = true;
});

dbCustomRadio.addEventListener('change', () => {
  dbCustomRow.hidden = false;
  dbPathInput.focus();
});

dbBrowseBtn.addEventListener('click', () => {
  dbFileInput.click();
});

// File picker fills the path input with the selected filename.
// Users can also type/paste the full path manually.
dbFileInput.addEventListener('change', () => {
  const file = dbFileInput.files[0];
  if (file) {
    dbPathInput.value = file.name;
  }
});

restoreDbSelection();

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const useCustom = dbCustomRadio.checked;
  let dbPathToSend = null;

  if (useCustom) {
    const typed = dbPathInput.value.trim();
    if (!typed) {
      loginError.textContent = 'Please enter or select a .db file path.';
      loginError.hidden = false;
      return;
    }
    dbPathToSend = typed;
  }

  const body = { password: passwordInput.value };
  if (dbPathToSend) body.dbPath = dbPathToSend;

  const result = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (result.ok) {
    localStorage.setItem(LS_DB_PATH_KEY, dbPathToSend || '__default__');
    passwordInput.value = '';
    appReady = true;
    await loadDashboard();
  } else {
    const data = await result.json().catch(() => ({}));
    loginError.textContent = data.error === 'Incorrect password'
      ? 'Incorrect password. Please try again.'
      : (data.error || 'Login failed.');
    loginError.hidden = false;
    passwordInput.value = '';
    passwordInput.focus();
  }
});

// ---- Logout ----
document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  loginError.hidden = true;
  restoreDbSelection();
  showView(loginView);
  passwordInput.focus();
});

// ---- Dashboard ----
const boardNameEl = document.getElementById('board-name');
const boardNameDefault = boardNameEl.textContent;

async function loadDashboard() {
  const [items, cfg] = await Promise.all([
    api('GET', '/api/items'),
    api('GET', '/api/config'),
  ]);
  if (items === null) return;
  boardNameEl.textContent = (cfg && cfg.boardName) ? cfg.boardName : boardNameDefault;
  availableCategories = (cfg && Array.isArray(cfg.categories)) ? cfg.categories : [];
  renderBoard(items);
  showView(dashboardView);
}

function renderBoard(items) {
  const lanes = document.querySelectorAll('.lane-cards');
  lanes.forEach(lane => { lane.innerHTML = ''; });

  items.forEach(item => {
    const lane = document.querySelector(`.lane-cards[data-status="${item.status}"]`);
    if (lane) lane.appendChild(createCard(item));
  });
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = item.id;

  const validCategories = new Set(['None', ...availableCategories]);
  const category = validCategories.has(item.category) ? item.category : 'None';
  const color = categoryColor(category);
  card.style.borderColor = color;

  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = item.title;
  title.addEventListener('click', (e) => {
    e.stopPropagation();
    openDetail(item.id);
  });

  card.appendChild(title);

  if (category !== 'None') {
    const catLabel = document.createElement('span');
    catLabel.className = 'card-category';
    catLabel.textContent = category;
    catLabel.style.color = color;
    card.appendChild(catLabel);
  }

  // Drag events
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  return card;
}

// ---- Drag-and-drop on lanes ----
document.querySelectorAll('.lane-cards').forEach(lane => {
  lane.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lane.classList.add('drag-over');
  });

  lane.addEventListener('dragleave', (e) => {
    if (!lane.contains(e.relatedTarget)) {
      lane.classList.remove('drag-over');
    }
  });

  lane.addEventListener('drop', async (e) => {
    e.preventDefault();
    lane.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    const newStatus = lane.dataset.status;

    // Move card in DOM immediately for responsiveness
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) lane.appendChild(card);

    // Persist
    await api('PUT', `/api/items/${id}`, { status: newStatus });
  });
});

// ---- New item button ----
document.getElementById('new-item-btn').addEventListener('click', async () => {
  const item = await api('POST', '/api/items', { title: 'Untitled' });
  if (item) openDetailWithItem(item);
});

// ---- Detail view ----
const detailTitle = document.getElementById('detail-title');
const detailStatus = document.getElementById('detail-status');
const detailCategory = document.getElementById('detail-category');
const detailDescription = document.getElementById('detail-description');

function updateCategorySelectStyle(select) {
  const color = categoryColor(select.value);
  select.style.borderLeftColor = color;
}

async function openDetail(id) {
  const item = await api('GET', `/api/items/${id}`);
  if (item) openDetailWithItem(item);
}

function openDetailWithItem(item) {
  currentItem = item;
  detailTitle.value = item.title;
  detailStatus.value = item.status;
  populateCategoryDropdown(item.category || 'None');
  detailDescription.innerHTML = item.description || '';
  showView(detailView);
}

// Back button
document.getElementById('back-btn').addEventListener('click', async () => {
  await flushSave();
  await loadDashboard();
});

// Auto-save title on blur
detailTitle.addEventListener('blur', () => {
  if (!currentItem) return;
  saveField({ title: detailTitle.value });
});

// Auto-save status on change (immediate)
detailStatus.addEventListener('change', () => {
  if (!currentItem) return;
  currentItem.status = detailStatus.value;
  saveField({ status: detailStatus.value });
});

// Auto-save category on change (immediate)
detailCategory.addEventListener('change', () => {
  if (!currentItem) return;
  currentItem.category = detailCategory.value;
  updateCategorySelectStyle(detailCategory);
  saveField({ category: detailCategory.value });
});

// Auto-save description (debounced)
detailDescription.addEventListener('input', () => {
  if (!currentItem) return;
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveField({ description: detailDescription.innerHTML });
  }, 600);
});

async function saveField(fields) {
  if (!currentItem) return;
  const updated = await api('PUT', `/api/items/${currentItem.id}`, fields);
  if (updated) {
    Object.assign(currentItem, updated);
    // Keep card title in DOM in sync if back on dashboard later
    const card = document.querySelector(`.card[data-id="${currentItem.id}"] .card-title`);
    if (card && fields.title !== undefined) card.textContent = fields.title;
  }
}

async function flushSave() {
  clearTimeout(saveDebounceTimer);
  if (!currentItem) return;
  await saveField({
    title: detailTitle.value,
    description: detailDescription.innerHTML,
    status: detailStatus.value,
    category: detailCategory.value,
  });
}

// ---- Delete ----
document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!currentItem) return;
  const confirmed = confirm(`Delete "${currentItem.title}"? This cannot be undone.`);
  if (!confirmed) return;
  await api('DELETE', `/api/items/${currentItem.id}`);
  currentItem = null;
  await loadDashboard();
});

// ---- Rich text toolbar ----
document.querySelectorAll('.toolbar-btn').forEach(btn => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep focus in editor
    const cmd = btn.dataset.cmd;
    document.execCommand(cmd, false, null);
    detailDescription.focus();
    updateToolbarState();
  });
});

function updateToolbarState() {
  document.querySelectorAll('.toolbar-btn').forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (cmd === 'insertUnorderedList') {
      btn.classList.toggle('active', document.queryCommandState('insertUnorderedList'));
    } else {
      btn.classList.toggle('active', document.queryCommandState(cmd));
    }
  });
}

detailDescription.addEventListener('keyup', updateToolbarState);
detailDescription.addEventListener('mouseup', updateToolbarState);

// ---- Bootstrap ----
let appReady = false;
(async () => {
  const [itemsRes, cfgRes] = await Promise.all([
    fetch('/api/items'),
    fetch('/api/config'),
  ]);
  if (appReady) return; // login completed while this was in flight
  appReady = true;
  if (itemsRes.status === 401) {
    showView(loginView);
    passwordInput.focus();
    return;
  }
  const [data, cfg] = await Promise.all([itemsRes.json(), cfgRes.json().catch(() => ({}))]);
  availableCategories = (cfg && Array.isArray(cfg.categories)) ? cfg.categories : [];
  renderBoard(data);
  showView(dashboardView);
})();
