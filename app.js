// ================================================================
// app.js — App Appunti | Supabase JS SDK
// Le credenziali vengono iniettate da config.js (generato da CI)
// ================================================================

// sb viene inizializzato dentro DOMContentLoaded per evitare il
// Temporal Dead Zone error se config.js non è ancora stato caricato.
let sb;

// ================================================================
// SESSION TIMEOUT PER INATTIVITÀ
// ================================================================
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minuti
const WARNING_BEFORE_MS     = 60 * 1000;       // avvisa 60 sec prima

let inactivityTimer    = null;
let warningTimer       = null;
let countdownInterval  = null;

function resetInactivityTimer() {
  // Nascondi il banner di avviso
  const banner = document.getElementById('session-warning');
  if (banner) banner.style.display = 'none';
  clearInterval(countdownInterval);

  // Cancella i timer precedenti
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);

  // Non avviare il timer se l'utente non è loggato
  if (!state.user) return;

  // Timer avviso: scatta a (TIMEOUT - 60s)
  warningTimer = setTimeout(() => {
    if (!state.user) return;
    let secondsLeft = Math.round(WARNING_BEFORE_MS / 1000);
    document.getElementById('session-countdown').textContent = secondsLeft;
    banner.style.display = 'block';

    countdownInterval = setInterval(() => {
      secondsLeft--;
      const el = document.getElementById('session-countdown');
      if (el) el.textContent = secondsLeft;
      if (secondsLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
  }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

  // Timer logout: scatta a TIMEOUT
  inactivityTimer = setTimeout(() => {
    if (!state.user) return;
    showToast('⏰ Disconnesso per inattività', 4000);
    handleLogout();
  }, INACTIVITY_TIMEOUT_MS);
}

function startInactivityTimer() {
  // Ascolta qualsiasi interazione utente
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  events.forEach(ev =>
    document.addEventListener(ev, resetInactivityTimer, { passive: true })
  );
  resetInactivityTimer();
}

function stopInactivityTimer() {
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);
  clearInterval(countdownInterval);
  const banner = document.getElementById('session-warning');
  if (banner) banner.style.display = 'none';
  // Rimuovi i listener
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  events.forEach(ev =>
    document.removeEventListener(ev, resetInactivityTimer)
  );
}
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
  selectedColor: '#4C51F7',  // colore default per nuova categoria
  googleToken: null,
  googleTokenExpiry: 0,
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

  // 3. Ascolta i cambi di sessione (login/logout automatico)
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      state.user = session.user;
      enterDashboard();
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      showPage('page-login');
    }
  });

  // 4. Controlla sessione esistente (auto-login se già loggato)
  checkSession();

  // 5. Inizializza Google Auth
  initGoogleAuth();
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
  stopInactivityTimer(); // ferma il timer prima di sloggarsi
  await sb.auth.signOut();
  state.user = null;
  state.categories = [];
  state.notes = [];
  state.selectedCategoryId = null;
  state.selectedNote = null;
  showPage('page-login');
}

function enterDashboard() {
  const email = state.user.email || '';
  document.getElementById('user-email-display').textContent = email;
  document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
  showPage('page-dashboard');
  loadCategories();
  startInactivityTimer(); // avvia il timer inattività
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
  const color = node.color || '#4C51F7';

  const row = document.createElement('div');
  row.className = 'cat-item' + (isSelected ? ' selected' : '');
  row.style.paddingLeft = (8 + depth * 16) + 'px';
  // Sfondo colorato per tutta la casella (più intenso se selezionata)
  row.style.background = isSelected ? color + '40' : color + '22';
  row.style.borderLeft = `3px solid ${color}`;

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

  // Icona colorata
  const icon = document.createElement('span');
  icon.className = 'cat-icon';
  icon.style.cssText = `
    display:inline-flex;align-items:center;justify-content:center;
    width:22px;height:22px;border-radius:6px;
    background:${color}22;font-size:13px;flex-shrink:0;
  `;
  icon.textContent = hasChildren ? '📂' : '📁';

  const name = document.createElement('span');
  name.className = 'cat-name';
  name.textContent = node.name;
  if (isSelected) name.style.color = color;

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
  // Reset colore al default
  state.selectedColor = '#4C51F7';
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  const defaultSwatch = document.querySelector('.color-swatch[data-color="#4C51F7"]');
  if (defaultSwatch) defaultSwatch.classList.add('selected');

  const hint = document.getElementById('modal-cat-hint');
  hint.textContent = state.selectedCategoryId
    ? 'Verrà creata come sottocategoria di quella selezionata'
    : 'Crea una categoria principale';
  openModal('modal-add-category');
  setTimeout(() => document.getElementById('new-cat-name').focus(), 100);
}

// Selezione colore nella palette
function selectColor(color, btn) {
  state.selectedColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  btn.classList.add('selected');
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
    color: state.selectedColor || '#4C51F7',
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

  console.log('Caricamento note per categoria:', state.selectedCategoryId, 'Query ricerca:', state.searchQuery);

  try {
    let baseQuery = sb.from('notes').select('*');

    if (state.searchQuery) {
      baseQuery = baseQuery.ilike('title', `%${state.searchQuery}%`);
      document.getElementById('notes-list-title').textContent = `Risultati: "${state.searchQuery}"`;
    } else if (state.selectedCategoryId) {
      baseQuery = baseQuery.eq('category_id', state.selectedCategoryId);
      const cat = state.categories.find(c => c.id === state.selectedCategoryId);
      document.getElementById('notes-list-title').textContent = cat ? cat.name : 'Appunti';
    } else {
      container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="6" width="32" height="36" rx="4" stroke="#CBD5E1" stroke-width="2"/><path d="M16 16h16M16 22h12M16 28h8" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/></svg><p>Seleziona una categoria o cerca un appunto</p></div>';
      document.getElementById('notes-count').textContent = '';
      document.getElementById('notes-list-title').textContent = 'Appunti';
      return;
    }

    // Prova ad ordinare per created_at
    let result = await baseQuery.order('created_at', { ascending: false, nullsFirst: false });
    
    if (result.error && result.error.message.includes('created_at')) {
      console.warn('Colonna created_at mancante, ripiego su id');
      // Ripetiamo la logica dei filtri su una nuova query pulita per sicurezza
      let fallbackQuery = sb.from('notes').select('*');
      if (state.searchQuery) {
        fallbackQuery = fallbackQuery.ilike('title', `%${state.searchQuery}%`);
      } else if (state.selectedCategoryId) {
        fallbackQuery = fallbackQuery.eq('category_id', state.selectedCategoryId);
      }
      result = await fallbackQuery.order('id', { ascending: false });
    }

    if (result.error) throw result.error;

    state.notes = result.data || [];
    console.log('Note caricate:', state.notes.length);
    renderNotes();
    
  } catch (err) {
    console.error('Errore critico loadNotes:', err);
    showToast('❌ Errore caricamento note: ' + err.message);
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Errore: ${err.message}</p></div>`;
  }
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
    if (note.content.startsWith('http')) {
      // Link Google Drive
      document.getElementById('preview-image-wrapper').style.display = 'none';
      document.getElementById('preview-pdf-wrapper').style.display = 'flex';
      document.getElementById('preview-pdf-wrapper').innerHTML = `
        <div class="pdf-placeholder">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M10 4h20l10 10v30H10V4z" fill="#E2E8F0"/><path d="M30 4v10h10" fill="#CBD5E1"/><text x="14" y="32" font-family="Arial" font-size="8" fill="#64748B">G-DRIVE</text></svg>
          <p>Documento su Google Drive</p>
          <a href="${note.content}" target="_blank" class="btn-secondary" style="margin-top:10px">Apri in Google Drive</a>
        </div>
      `;
    } else {
      const publicUrl = sb.storage.from('appunti').getPublicUrl(note.content).data.publicUrl;
      if (isImage(note.title)) {
        document.getElementById('preview-image').src = publicUrl;
        imgWrap.style.display = 'flex';
      } else if (/\.pdf$/i.test(note.title)) {
        pdfWrap.style.display = 'flex';
        pdfWrap.innerHTML = `
          <div class="pdf-placeholder">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="4" width="32" height="40" rx="4" fill="#FEF2F2"/><path d="M16 20h16M16 26h12M16 32h8" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/><path d="M28 4v10h12" stroke="#FCA5A5" stroke-width="1.5"/></svg>
            <p>File PDF</p>
          </div>
        `;
      }
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
  
  if (state.selectedNote.content.startsWith('http')) {
    // Link Google Drive o esterno
    window.open(state.selectedNote.content, '_blank');
  } else {
    // Path Supabase Storage
    const { data } = sb.storage.from('appunti').getPublicUrl(state.selectedNote.content, { download: true });
    window.open(data.publicUrl, '_blank');
  }
}

// ================================================================
// GOOGLE DRIVE INTEGRATION
// ================================================================

let tokenClient;

function initGoogleAuth() {
  if (typeof google === 'undefined') {
    console.error('Google Identity Services script non caricato');
    return;
  }
  
  if (!window.GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID === '__GOOGLE_CLIENT_ID__') {
    console.warn('Google Client ID non configurato. L\'upload su Drive non funzionerà.');
    return;
  }
  
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: window.GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (response) => {
      if (response.error !== undefined) {
        console.error('Errore Google Auth:', response);
        showToast('❌ Errore autenticazione Google: ' + response.error);
        return;
      }
      state.googleToken = response.access_token;
      state.googleTokenExpiry = Date.now() + (response.expires_in * 1000);
      console.log('Google Token acquisito con successo');
    },
  });
}

async function getGoogleToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Sistema di autenticazione Google non inizializzato. Controlla il Client ID nelle impostazioni GitHub.'));
      return;
    }

    if (state.googleToken && Date.now() < state.googleTokenExpiry - 60000) {
      resolve(state.googleToken);
      return;
    }

    tokenClient.callback = (response) => {
      if (response.error !== undefined) {
        reject(response);
      }
      state.googleToken = response.access_token;
      state.googleTokenExpiry = Date.now() + (response.expires_in * 1000);
      resolve(state.googleToken);
    };

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function getOrCreateFolder(token) {
  const folderName = 'Appunti_Files';
  
  // Cerca la cartella
  const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const searchData = await searchResp.json();
  
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  // Crea la cartella se non esiste
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  const folderData = await createResp.json();
  return folderData.id;
}

async function uploadToDrive(file) {
  const token = await getGoogleToken();
  const folderId = await getOrCreateFolder(token);
  
  const metadata = {
    name: file.name,
    parents: [folderId]
  };
  
  const boundary = 'foo_bar_baz';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      const contentType = file.type || 'application/octet-stream';
      const base64Data = btoa(new Uint8Array(reader.result).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        close_delim;

      try {
        const uploadResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/related; boundary=' + boundary
          },
          body: multipartRequestBody
        });
        
        if (!uploadResp.ok) {
          const errorData = await uploadResp.json();
          throw new Error('Errore Google Drive: ' + (errorData.error?.message || uploadResp.statusText));
        }

        const fileData = await uploadResp.json();
        
        // 2. Rendi il file leggibile a chiunque abbia il link
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
        
        resolve(fileData.webViewLink);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
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

  showToast('⏳ Preparazione caricamento...');

  try {
    const driveLink = await uploadToDrive(file);
    
    showToast('⏳ Salvataggio nel database...');

    const { error: insertError } = await sb.from('notes').insert({
      title: file.name,
      content: driveLink,
      category_id: state.selectedCategoryId,
      user_id: state.user.id,
    });

    if (insertError) throw insertError;

    showToast('✅ File caricato su Google Drive! ✓');
    event.target.value = '';
    await loadNotes();
  } catch (err) {
    console.error('Errore upload Drive:', err);
    showToast('❌ Errore caricamento: ' + (err.message || 'Controlla i permessi Google'));
    event.target.value = '';
  }
}

// ================================================================
// SIDEBAR TOGGLE
// ================================================================

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}
