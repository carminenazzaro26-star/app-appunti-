// ================================================================
// app.js — App Appunti | Supabase JS SDK
// Le credenziali vengono iniettate da config.js (generato da CI)
// ================================================================

// sb viene inizializzato dentro DOMContentLoaded per evitare il
// Temporal Dead Zone error se config.js non è ancora stato caricato.
let sb;

// ================================================================
// STATO APPLICAZIONE
// ================================================================
const state = {
  user: null,
  categories: [],
  expandedCategories: new Set(),
  selectedCategoryId: null,
  notes: [],
  selectedNote: null,
  searchQuery: '',
};

// ================================================================
// UTILITY
// ================================================================

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let toastTimer;
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, duration);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
    doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
    zip: '🗜️', rar: '🗜️', mp4: '🎬', mp3: '🎵', txt: '📃',
  };
  return map[ext] || '📁';
}

function isImage(name) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name || '');
}

// ================================================================
// AUTH
// ================================================================

async function handleLogin() {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  const errEl = document.getElementById('login-error');
  const btnText = document.getElementById('login-btn-text');
  const spinner = document.getElementById('login-spinner');

  errEl.style.display = 'none';
  btnText.style.display = 'none';
  spinner.style.display = 'block';

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.user = data.user;
    enterDashboard();
  } catch (err) {
    errEl.textContent = err.message || 'Errore di accesso. Riprova.';
    errEl.style.display = 'block';
  } finally {
    btnText.style.display = 'inline';
    spinner.style.display = 'none';
  }
}

// ================================================================
// INIZIALIZZAZIONE — avviene dopo che tutti gli script sono caricati
// ================================================================
document.addEventListener('DOMContentLoaded', () => {

  // 1. Inizializza il client Supabase in modo sicuro
  try {
    if (!window.SUPABASE_URL || !window.SUPABASE_KEY ||
        window.SUPABASE_URL === '__SUPABASE_URL__') {
      throw new Error('config.js non trovato o non configurato.');
    }
    const { createClient } = window.supabase;
    sb = createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  } catch (err) {
    document.body.innerHTML = `
      <div style="height:100vh;display:flex;flex-direction:column;align-items:center;
                  justify-content:center;font-family:Inter,sans-serif;gap:12px;padding:24px;text-align:center">
        <div style="font-size:48px">⚙️</div>
        <h2 style="color:#0F172A">Configurazione mancante</h2>
        <p style="color:#64748B;max-width:400px">
          Il file <code>config.js</code> non è stato trovato o non è configurato.<br/>
          Per sviluppo locale: copia <code>config.template.js</code> in <code>config.js</code>
          e inserisci le tue credenziali Supabase.
        </p>
        <p style="color:#94A3B8;font-size:13px">Errore: ${err.message}</p>
      </div>`;
    return;
  }

  // 2. Event listeners tastiera
  document.getElementById('password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('email-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('password-input').focus();
  });

  // 3. Controlla sessione esistente
  checkSession();
});

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    state.user = session.user;
    enterDashboard();
  } else {
    showPage('page-login');
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  state.user = null;
  state.categories = [];
  state.notes = [];
  state.selectedCategoryId = null;
  state.selectedNote = null;
  showPage('page-login');
}

function enterDashboard() {
  // Mostra email utente
  const email = state.user.email || '';
  document.getElementById('user-email-display').textContent = email;
  document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
  showPage('page-dashboard');
  loadCategories();
}

// ================================================================
// CATEGORIES
// ================================================================

async function loadCategories() {
  const { data, error } = await sb
    .from('categories')
    .select('*')
    .order('name');
  if (error) { showToast('Errore caricamento categorie'); return; }
  state.categories = data || [];
  renderCategories();
}

function buildTree(cats, parentId = null) {
  return cats
    .filter(c => c.parent_id === parentId || (!c.parent_id && parentId === null))
    .map(c => ({ ...c, children: buildTree(cats, c.id) }));
}

function renderCategories() {
  const container = document.getElementById('categories-tree');
  const tree = buildTree(state.categories);
  if (tree.length === 0) {
    container.innerHTML = '<div class="empty-state-small">Nessuna categoria</div>';
    return;
  }
  container.innerHTML = '';
  tree.forEach(node => container.appendChild(buildCatEl(node, 0)));
}

function buildCatEl(node, depth) {
  const wrapper = document.createElement('div');
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = state.expandedCategories.has(node.id);
  const isSelected = node.id === state.selectedCategoryId;

  const row = document.createElement('div');
  row.className = 'cat-item' + (isSelected ? ' selected' : '');
  row.style.paddingLeft = (8 + depth * 16) + 'px';

  // Toggle arrow
  const toggle = document.createElement('span');
  toggle.className = 'cat-toggle' + (isExpanded ? ' open' : '');
  toggle.innerHTML = hasChildren ? '▶' : '';
  if (hasChildren) {
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      if (isExpanded) state.expandedCategories.delete(node.id);
      else state.expandedCategories.add(node.id);
      renderCategories();
    });
  }

  const icon = document.createElement('span');
  icon.className = 'cat-icon';
  icon.textContent = hasChildren ? '📂' : '📁';

  const name = document.createElement('span');
  name.className = 'cat-name';
  name.textContent = node.name;

  const del = document.createElement('button');
  del.className = 'cat-delete';
  del.title = 'Elimina';
  del.innerHTML = '🗑';
  del.addEventListener('click', e => { e.stopPropagation(); deleteCategory(node.id); });

  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(del);
  row.addEventListener('click', () => selectCategory(node.id));

  wrapper.appendChild(row);

  if (hasChildren && isExpanded) {
    const childWrap = document.createElement('div');
    childWrap.className = 'cat-children';
    node.children.forEach(child => childWrap.appendChild(buildCatEl(child, depth + 1)));
    wrapper.appendChild(childWrap);
  }

  return wrapper;
}

function selectCategory(id) {
  state.selectedCategoryId = id;
  state.selectedNote = null;
  state.searchQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  renderCategories();
  loadNotes();
  hidePreview();
}

function openAddCategoryDialog() {
  document.getElementById('new-cat-name').value = '';
  const hint = document.getElementById('modal-cat-hint');
  hint.textContent = state.selectedCategoryId
    ? 'Verrà creata come sottocategoria di quella selezionata'
    : 'Crea una categoria principale';
  openModal('modal-add-category');
  setTimeout(() => document.getElementById('new-cat-name').focus(), 100);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('modal-add-category').classList.contains('open')) {
    addCategory();
  }
});

async function addCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  if (!name) return;

  const payload = {
    name,
    user_id: state.user.id,
    parent_id: state.selectedCategoryId || null,
  };

  const { error } = await sb.from('categories').insert(payload);
  if (error) { showToast('Errore: ' + error.message); return; }

  closeModal('modal-add-category');
  showToast('Categoria creata ✓');
  await loadCategories();
}

async function deleteCategory(id) {
  if (!confirm('Eliminare questa categoria e tutti i suoi contenuti?')) return;
  const { error } = await sb.from('categories').delete().eq('id', id);
  if (error) { showToast('Errore eliminazione: ' + error.message); return; }
  if (state.selectedCategoryId === id) {
    state.selectedCategoryId = null;
    hidePreview();
  }
  showToast('Categoria eliminata');
  await loadCategories();
  await loadNotes();
}

// ================================================================
// NOTES
// ================================================================

async function loadNotes() {
  const container = document.getElementById('notes-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></div></div>';

  let query = sb.from('notes').select('*').order('created_at', { ascending: false });

  if (state.searchQuery) {
    query = query.ilike('title', `%${state.searchQuery}%`);
    document.getElementById('notes-list-title').textContent = `Risultati: "${state.searchQuery}"`;
  } else if (state.selectedCategoryId) {
    query = query.eq('category_id', state.selectedCategoryId);
    const cat = state.categories.find(c => c.id === state.selectedCategoryId);
    document.getElementById('notes-list-title').textContent = cat ? cat.name : 'Appunti';
  } else {
    container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="6" width="32" height="36" rx="4" stroke="#CBD5E1" stroke-width="2"/><path d="M16 16h16M16 22h12M16 28h8" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/></svg><p>Seleziona una categoria o cerca un appunto</p></div>';
    document.getElementById('notes-count').textContent = '';
    document.getElementById('notes-list-title').textContent = 'Appunti';
    return;
  }

  const { data, error } = await query;
  if (error) { showToast('Errore caricamento note'); return; }
  state.notes = data || [];
  renderNotes();
}

function renderNotes() {
  const container = document.getElementById('notes-container');
  document.getElementById('notes-count').textContent = state.notes.length > 0 ? state.notes.length : '';

  if (state.notes.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="6" width="32" height="36" rx="4" stroke="#CBD5E1" stroke-width="2"/><path d="M16 16h16M16 22h12" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/></svg><p>Nessun appunto trovato</p></div>';
    return;
  }

  container.innerHTML = '';
  state.notes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card' + (state.selectedNote?.id === note.id ? ' selected' : '');
    card.innerHTML = `
      <div class="note-title">${escapeHtml(note.title)}</div>
      <div class="note-badge">${getFileIcon(note.title)} <span>${getExtLabel(note.title)}</span></div>
    `;
    card.addEventListener('click', () => selectNote(note));
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getExtLabel(name) {
  const ext = (name || '').split('.').pop().toUpperCase();
  return ext.length <= 5 ? ext : 'FILE';
}

function selectNote(note) {
  state.selectedNote = note;
  renderNotes(); // aggiorna selezione
  showPreview(note);
}

function showPreview(note) {
  document.getElementById('preview-empty').style.display = 'none';
  const content = document.getElementById('preview-content');
  content.style.display = 'flex';

  document.getElementById('preview-icon').textContent = getFileIcon(note.title);
  document.getElementById('preview-title').textContent = note.title;
  document.getElementById('preview-meta').textContent = note.created_at
    ? 'Caricato il ' + new Date(note.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const imgWrap = document.getElementById('preview-image-wrapper');
  const pdfWrap = document.getElementById('preview-pdf-wrapper');
  imgWrap.style.display = 'none';
  pdfWrap.style.display = 'none';

  if (note.content) {
    const publicUrl = sb.storage.from('appunti').getPublicUrl(note.content).data.publicUrl;
    if (isImage(note.title)) {
      document.getElementById('preview-image').src = publicUrl;
      imgWrap.style.display = 'flex';
    } else if (/\.pdf$/i.test(note.title)) {
      pdfWrap.style.display = 'flex';
    }
  }
}

function hidePreview() {
  state.selectedNote = null;
  document.getElementById('preview-empty').style.display = 'flex';
  document.getElementById('preview-content').style.display = 'none';
}

async function deleteCurrentNote() {
  if (!state.selectedNote) return;
  if (!confirm(`Eliminare "${state.selectedNote.title}"?`)) return;

  const { error } = await sb.from('notes').delete().eq('id', state.selectedNote.id);
  if (error) { showToast('Errore eliminazione: ' + error.message); return; }

  showToast('Appunto eliminato');
  hidePreview();
  await loadNotes();
}

function downloadCurrentFile() {
  if (!state.selectedNote?.content) return;
  const { data } = sb.storage.from('appunti').getPublicUrl(state.selectedNote.content, { download: true });
  window.open(data.publicUrl, '_blank');
}

// ================================================================
// SEARCH
// ================================================================

let searchDebounce;
function handleSearch() {
  const val = document.getElementById('search-input').value.trim();
  document.getElementById('search-clear').style.display = val ? 'block' : 'none';
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.searchQuery = val;
    state.selectedCategoryId = null;
    renderCategories();
    loadNotes();
    hidePreview();
  }, 300);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  state.searchQuery = '';
  loadNotes();
}

// ================================================================
// FILE UPLOAD
// ================================================================

function triggerUpload() {
  if (!state.selectedCategoryId) {
    showToast('⚠️ Seleziona prima una categoria');
    return;
  }
  document.getElementById('file-input').click();
}

async function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  showToast('⏳ Caricamento in corso...');

  const storagePath = `${state.user.id}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await sb.storage
    .from('appunti')
    .upload(storagePath, file, { cacheControl: '3600', upsert: true });

  if (uploadError) {
    showToast('❌ Errore upload: ' + uploadError.message);
    event.target.value = '';
    return;
  }

  const { error: insertError } = await sb.from('notes').insert({
    title: file.name,
    content: storagePath,
    category_id: state.selectedCategoryId,
    user_id: state.user.id,
  });

  if (insertError) {
    showToast('❌ Errore salvataggio nota: ' + insertError.message);
    event.target.value = '';
    return;
  }

  showToast('✅ File caricato con successo!');
  event.target.value = '';
  await loadNotes();
}

// ================================================================
// SIDEBAR TOGGLE
// ================================================================

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}
