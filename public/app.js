// ---- State ----
let currentItem = null;
let saveDebounceTimer = null;

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

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const result = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: passwordInput.value }),
  });
  if (result.ok) {
    passwordInput.value = '';
    appReady = true;
    await loadDashboard();
  } else {
    loginError.hidden = false;
    passwordInput.value = '';
    passwordInput.focus();
  }
});

// ---- Logout ----
document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  showView(loginView);
  passwordInput.focus();
});

// ---- Dashboard ----
async function loadDashboard() {
  const items = await api('GET', '/api/items');
  if (items === null) return;
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

  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = item.title;
  title.addEventListener('click', (e) => {
    e.stopPropagation();
    openDetail(item.id);
  });

  card.appendChild(title);

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
const detailDescription = document.getElementById('detail-description');

async function openDetail(id) {
  const item = await api('GET', `/api/items/${id}`);
  if (item) openDetailWithItem(item);
}

function openDetailWithItem(item) {
  currentItem = item;
  detailTitle.value = item.title;
  detailStatus.value = item.status;
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
  const res = await fetch('/api/items');
  if (appReady) return; // login completed while this was in flight
  appReady = true;
  if (res.status === 401) {
    showView(loginView);
    passwordInput.focus();
    return;
  }
  const data = await res.json();
  renderBoard(data);
  showView(dashboardView);
})();
