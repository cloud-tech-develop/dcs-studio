// ─────────────────────────────────────────────────────────────
// SEEDANCE STUDIO · Frontend logic
// ─────────────────────────────────────────────────────────────

const state = {
  presets: null,
  selection: {
    lens: null,
    camera: null,
    cameraMotion: null,
    colorGrading: null,
    genre: null,
    aspectRatio: { id: '16:9', label: '16:9 Cinema', value: '16:9' },
    resolution: { id: '480p', label: '480p', value: '480p' },
    duration: 5,
    soundOn: true,
    userPrompt: '',
    model: 'dreamina-seedance-2-0-fast-260128',
  },
  reel: [],
};

// ─── Bootstrap ─────────────────────────────────────────────
async function init() {
  await checkHealth();
  await loadPresets();
  renderAllChips();
  bindControls();
  updateCompiledPreview();
}

async function checkHealth() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const r = await fetch('/api/health').then((r) => r.json());
    dot.classList.remove('connected', 'disconnected');
    if (r.activeKey) {
      dot.classList.add('connected');
      text.textContent = 'ready';
    } else {
      dot.classList.add('disconnected');
      text.textContent = 'add api key →';
    }
  } catch {
    dot.classList.remove('connected');
    dot.classList.add('disconnected');
    text.textContent = 'server offline';
  }
}

async function loadPresets() {
  const r = await fetch('/api/presets').then((r) => r.json());
  state.presets = r;
}

// ─── Chip rendering ────────────────────────────────────────
function renderChips(containerId, items, key, useValue = false) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  items.forEach((item) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = item.label;
    chip.dataset.id = item.id;
    chip.addEventListener('click', () => {
      // toggle selection
      const current = state.selection[key];
      if (current && current.id === item.id) {
        state.selection[key] = null;
      } else {
        state.selection[key] = useValue
          ? { id: item.id, label: item.label, value: item.value }
          : { id: item.id, label: item.label, prompt: item.prompt };
      }
      refreshChipStates(containerId, key);
      updateCompiledPreview();
    });
    el.appendChild(chip);
  });
  refreshChipStates(containerId, key);
}

function refreshChipStates(containerId, key) {
  const el = document.getElementById(containerId);
  const selId = state.selection[key]?.id;
  el.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.id === selId);
  });
}

function renderAllChips() {
  renderChips('lensChips', state.presets.lens, 'lens');
  renderChips('cameraChips', state.presets.camera, 'camera');
  renderChips('motionChips', state.presets.cameraMotion, 'cameraMotion');
  renderChips('gradeChips', state.presets.colorGrading, 'colorGrading');
  renderChips('genreChips', state.presets.genre, 'genre');
  renderChips('ratioChips', state.presets.aspectRatio, 'aspectRatio', true);
  renderChips('resChips', state.presets.resolution, 'resolution', true);
}

// ─── Other controls ────────────────────────────────────────
function bindControls() {
  // Duration slider
  const slider = document.getElementById('durationSlider');
  const label = document.getElementById('durationLabel');
  slider.addEventListener('input', (e) => {
    state.selection.duration = Number(e.target.value);
    label.textContent = `${e.target.value}s`;
    updateCompiledPreview();
  });

  // Sound toggle
  const soundToggle = document.getElementById('soundToggle');
  soundToggle.addEventListener('click', () => {
    const current = soundToggle.dataset.on === 'true';
    soundToggle.dataset.on = String(!current);
    state.selection.soundOn = !current;
    updateCompiledPreview();
  });

  // Model toggle (Fast / Pro)
  const modelToggle = document.getElementById('modelToggle');
  modelToggle.addEventListener('click', () => {
    const opts = modelToggle.querySelectorAll('.toggle-opt');
    const currentlyFast = modelToggle.dataset.model === 'fast';
    modelToggle.dataset.model = currentlyFast ? 'pro' : 'fast';
    opts.forEach((o, i) => {
      o.classList.toggle(
        'toggle-opt-active',
        (i === 0 && !currentlyFast) || (i === 1 && currentlyFast)
      );
    });
    state.selection.model = currentlyFast
      ? 'dreamina-seedance-2-0-260128'
      : 'dreamina-seedance-2-0-fast-260128';
    updateCompiledPreview();
  });

  // Textarea
  const userPrompt = document.getElementById('userPrompt');
  userPrompt.addEventListener('input', (e) => {
    state.selection.userPrompt = e.target.value;
    document.getElementById('charCount').textContent = `${e.target.value.length} chars`;
    updateCompiledPreview();
  });

  // Generate button
  document.getElementById('generateBtn').addEventListener('click', handleGenerate);
}

// ─── Compiled prompt preview ───────────────────────────────
async function updateCompiledPreview() {
  try {
    const r = await fetch('/api/compile-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.selection),
    }).then((r) => r.json());
    document.getElementById('compiledPrompt').textContent =
      r.prompt || '—';
  } catch {
    // Fallback: compile locally
    document.getElementById('compiledPrompt').textContent =
      localCompile(state.selection);
  }
}

function localCompile(s) {
  const parts = [];
  if (s.userPrompt?.trim()) parts.push(s.userPrompt.trim());
  if (s.camera?.prompt) parts.push(s.camera.prompt);
  if (s.lens?.prompt) parts.push(s.lens.prompt);
  if (s.cameraMotion?.prompt) parts.push(s.cameraMotion.prompt);
  if (s.colorGrading?.prompt) parts.push(s.colorGrading.prompt);
  if (s.genre?.prompt) parts.push(s.genre.prompt);
  if (s.soundOn === false) parts.push('no audio, silent clip');
  return parts.filter(Boolean).join('. ') + (parts.length ? '.' : '');
}

// Track last generation timestamp for cooldown
let _lastGenerateAt = 0;
let _generationInProgress = false;
const GENERATE_COOLDOWN_MS = 3000;

// ─── Generation flow ───────────────────────────────────────
async function handleGenerate() {
  const btn = document.getElementById('generateBtn');
  const log = document.getElementById('statusLog');

  // Hard lock: prevent double-click and concurrent jobs
  if (_generationInProgress) {
    addLog('A generation is already running. Wait for it to finish.', 'error');
    return;
  }

  // Cooldown between generations (avoid accidental cost spikes)
  const sinceLast = Date.now() - _lastGenerateAt;
  if (sinceLast < GENERATE_COOLDOWN_MS) {
    const wait = Math.ceil((GENERATE_COOLDOWN_MS - sinceLast) / 1000);
    addLog(`Cooldown active. Wait ${wait}s before launching a new job.`, 'error');
    return;
  }

  if (!state.selection.userPrompt.trim()) {
    addLog('Write a scene description first.', 'error');
    return;
  }

  // Cost confirmation for high-cost configs (Pro tier with high res / long duration)
  // Each successful generation consumes credits — confirm intent.
  const isPro = state.selection.model && !state.selection.model.includes('fast');
  const res = state.selection.resolution?.value || '480p';
  const dur = state.selection.duration || 5;
  const isHighCost = isPro && (res === '1080p' || dur >= 10);

  if (isHighCost) {
    const ok = confirm(
      `⚠️  HIGH-COST GENERATION\n\n` +
      `Engine: PRO\nResolution: ${res}\nDuration: ${dur}s\n\n` +
      `This consumes more credits than Fast tier. Continue?`
    );
    if (!ok) {
      addLog('Generation cancelled.', 'error');
      return;
    }
  }

  _generationInProgress = true;
  _lastGenerateAt = Date.now();
  btn.disabled = true;
  btn.classList.add('loading');
  log.innerHTML = '';
  addLog('Submitting job to ModelArk…');

  const releaseLock = () => {
    _generationInProgress = false;
    btn.disabled = false;
    btn.classList.remove('loading');
  };

  try {
    const submit = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.selection),
    }).then((r) => r.json());

    if (submit.error) {
      addLog(submit.error, 'error');
      releaseLock();
      return;
    }

    addLog(`Task submitted: ${submit.taskId}`, 'success');
    addLog(`Model: ${submit.model}`);
    addLog('⚠ This job is being billed. Please wait — do not retry.');

    // Poll every 5s for up to 10 min
    const started = Date.now();
    let lastStatus = '';
    const poll = async () => {
      if (Date.now() - started > 10 * 60 * 1000) {
        addLog('Timeout after 10 minutes. Job may still complete on BytePlus side.', 'error');
        releaseLock();
        return;
      }

      const status = await fetch(
        `/api/status/${submit.taskId}?model=${submit.model}`
      ).then((r) => r.json());

      if (status.error && status.status !== 'succeeded_no_url') {
        addLog(status.error, 'error');
        releaseLock();
        return;
      }

      const elapsed = Math.round((Date.now() - started) / 1000);

      // Only log when status changes — keeps log clean
      if (status.status !== lastStatus) {
        addLog(`[${elapsed}s] status: ${status.status}`);
        lastStatus = status.status;
      }

      // SUCCESS: clip downloaded
      if (status.status === 'succeeded' && (status.localUrl || status.videoUrl)) {
        addLog('✓ clip ready', 'success');
        loadClip(status.localUrl || status.videoUrl, submit.prompt, submit.taskId, submit.model);
        releaseLock();
        return;
      }

      // PARTIAL SUCCESS: job done but URL missing — show diagnostic
      if (status.status === 'succeeded_no_url') {
        addLog('Job succeeded but no video URL detected.', 'error');
        addLog('Check the server console for the raw response shape.', 'error');
        if (status.raw) {
          console.log('[seedance] Raw response from BytePlus:', status.raw);
        }
        releaseLock();
        return;
      }

      if (['not_found', 'expired', 'failed', 'cancelled'].includes(status.status)) {
        addLog(`Job ${status.status}`, 'error');
        releaseLock();
        return;
      }

      setTimeout(poll, 5000);
    };
    setTimeout(poll, 3000);
  } catch (err) {
    addLog(err.message, 'error');
    releaseLock();
  }
}

function addLog(msg, kind = '') {
  const log = document.getElementById('statusLog');
  const line = document.createElement('div');
  line.className = `log-line ${kind ? 'log-' + kind : ''}`;
  line.textContent = `> ${msg}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function loadClip(url, prompt, taskId, model) {
  const frame = document.getElementById('viewerFrame');
  frame.innerHTML = '';
  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  video.autoplay = true;
  video.loop = true;
  frame.appendChild(video);

  // Add to reel — clear the empty placeholder on first add
  const reel = document.getElementById('reel');
  if (state.reel.length === 0) {
    const empty = reel.querySelector('.reel-empty');
    if (empty) empty.remove();
  }
  const reelEntry = { url, prompt, timestamp: new Date().toISOString(), taskId, model };
  state.reel.unshift(reelEntry);

  const item = document.createElement('div');
  item.className = 'reel-item';
  item.innerHTML = `
    <div class="reel-thumb">▶</div>
    <div class="reel-meta">
      <strong>${new Date().toLocaleTimeString()}</strong>
      <span>${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}</span>
    </div>
  `;
  item.addEventListener('click', () => loadClip(url, prompt, taskId, model));
  reel.appendChild(item);

  // Show the rating widget for this clip (if the function is loaded)
  if (typeof showRatingWidget === 'function') {
    showRatingWidget({
      taskId: taskId || `local-${Date.now()}`,
      prompt: prompt,
      model: model || (state.selection?.model),
      url: url,
      localUrl: url.startsWith('/outputs/') ? url : null,
      videoUrl: url.startsWith('http') ? url : null,
      generatedAt: new Date().toISOString(),
      rating: 0,
      ratingNotes: '',
    });
  }
}

// ─── Go ─────────────────────────────────────────────────────
init();

// ═══════════════════════════════════════════════════════════════
// API KEYS MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function refreshKeys() {
  try {
    const data = await fetch('/api/keys').then((r) => r.json());
    renderKeys(data);
  } catch (e) {
    console.error('Failed to load keys:', e);
  }
}

function renderKeys(data) {
  const list = document.getElementById('keysList');
  const trigger = document.getElementById('keysTrigger');
  const activeName = document.getElementById('activeKeyName');

  // Header trigger update
  const activeKey = data.keys.find((k) => k.id === data.active);
  if (activeKey) {
    trigger.classList.remove('no-key');
    activeName.textContent = activeKey.name;
  } else {
    trigger.classList.add('no-key');
    activeName.textContent = 'no key';
  }

  // List render
  if (!data.keys.length) {
    list.innerHTML = '<div class="keys-empty">No keys yet — add one below to start.</div>';
    return;
  }

  list.innerHTML = '';
  data.keys.forEach((key) => {
    const endpointLabel = data.endpoints?.[key.endpoint]?.label || key.endpoint || '?';
    const endpointShort =
      key.endpoint === 'byteplus_ap' ? 'BytePlus' :
      key.endpoint === 'volcengine_cn' ? 'Volcengine CN' : key.endpoint;

    const item = document.createElement('div');
    item.className = 'key-item' + (key.id === data.active ? ' active' : '');
    item.dataset.id = key.id;
    item.innerHTML = `
      <div class="key-radio" data-action="activate"></div>
      <div class="key-info">
        <div class="key-info-name" contenteditable="true" data-action="rename" spellcheck="false">${escapeHtml(key.name)}</div>
        <div class="key-info-preview">${key.preview} <span class="key-endpoint-tag" title="${escapeHtml(endpointLabel)}">· ${endpointShort}</span></div>
      </div>
      <div class="key-actions">
        <button class="key-action-btn" data-action="delete">DEL</button>
      </div>
    `;
    list.appendChild(item);
  });

  // Wire interactions
  list.querySelectorAll('.key-item').forEach((item) => {
    const id = item.dataset.id;

    item.querySelector('.key-radio').addEventListener('click', async () => {
      await fetch(`/api/keys/${id}/activate`, { method: 'POST' });
      refreshKeys();
      checkHealth();
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this API key?')) return;
      await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      refreshKeys();
      checkHealth();
    });

    const nameEl = item.querySelector('[data-action="rename"]');
    nameEl.addEventListener('blur', async () => {
      const newName = nameEl.textContent.trim();
      if (newName) {
        await fetch(`/api/keys/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
      }
    });
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function bindKeysModal() {
  const modal = document.getElementById('keysModal');
  const trigger = document.getElementById('keysTrigger');
  const closeBtn = document.getElementById('keysModalClose');
  const addBtn = document.getElementById('keyAddBtn');
  const nameInput = document.getElementById('keyNameInput');
  const valueInput = document.getElementById('keyValueInput');
  const endpointSelect = document.getElementById('keyEndpointSelect');

  const open = () => modal.classList.add('open');
  const close = () => modal.classList.remove('open');

  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  addBtn.addEventListener('click', async () => {
    const value = valueInput.value.trim();
    if (!value) {
      valueInput.focus();
      return;
    }
    const name = nameInput.value.trim();
    const endpoint = endpointSelect?.value || '';
    const akInput = document.getElementById('keyAkInput');
    const skInput = document.getElementById('keySkInput');
    const ak = akInput?.value.trim() || '';
    const sk = skInput?.value.trim() || '';

    if ((ak && !sk) || (sk && !ak)) {
      alert('AK and SK must be both provided together (or both empty).');
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = 'ADDING…';
    try {
      const body = { name, value };
      if (endpoint) body.endpoint = endpoint;
      if (ak && sk) {
        body.ak = ak;
        body.sk = sk;
      }
      await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      nameInput.value = '';
      valueInput.value = '';
      if (akInput) akInput.value = '';
      if (skInput) skInput.value = '';
      if (endpointSelect) endpointSelect.value = '';
      refreshKeys();
      checkHealth();
    } catch (e) {
      alert('Failed to add key: ' + e.message);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = '+ ADD KEY';
    }
  });

  // Enter en cualquier input dispara add
  [nameInput, valueInput].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn.click();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// ASSETS · uploads, frame slots, multi-ref grid
// ═══════════════════════════════════════════════════════════════

// Extend the state with asset slots
state.selection.firstFrame = null;  // { name, type, dataUrl }
state.selection.lastFrame = null;
state.selection.refImages = [];     // array of { name, dataUrl }
state.selection.refVideos = [];
state.selection.refAudios = [];

// Limits aligned with Seedance 2.0 capacities (9 images / 3 videos / 3 audios)
// We reserve the 2 slots (first/last) so multi-ref images can hold up to 7 more
const LIMITS = {
  refImages: 7,
  refVideos: 3,
  refAudios: 3,
};

// Reasonable file size caps for base64 inlining
const SIZE_CAPS = {
  image: 8 * 1024 * 1024,    // 8 MB
  video: 25 * 1024 * 1024,   // 25 MB
  audio: 8 * 1024 * 1024,    // 8 MB
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Read failed'));
    r.readAsDataURL(file);
  });
}

function categorize(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

function checkSize(file) {
  const cat = categorize(file);
  if (!cat) return 'Unsupported file type';
  if (file.size > SIZE_CAPS[cat]) {
    const cap = SIZE_CAPS[cat] / (1024 * 1024);
    return `${cat} too large — max ${cap}MB. Larger files would inflate the request to BytePlus.`;
  }
  return null;
}

// ─── Frame slots (First / Last) ──────────────────────────────
function bindFrameSlots() {
  ['firstFrame', 'lastFrame'].forEach((slotKey) => {
    const slot = document.querySelector(`.frame-slot[data-slot="${slotKey}"]`);
    const input = slot.querySelector('input[type="file"]');
    const removeBtn = slot.querySelector('.frame-slot-remove');

    slot.addEventListener('click', (e) => {
      if (e.target === removeBtn) return;
      input.click();
    });

    // Drag & drop
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.style.borderColor = 'var(--neural-green)';
    });
    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = '';
    });
    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      slot.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file) await loadFrameSlot(slotKey, file);
    });

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) await loadFrameSlot(slotKey, file);
      e.target.value = '';
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selection[slotKey] = null;
      renderFrameSlot(slotKey);
      updateAssetCounter();
      updateCompiledPreview();
    });
  });
}

async function loadFrameSlot(slotKey, file) {
  if (!file.type.startsWith('image/')) {
    alert('First/Last frame slots only accept images.');
    return;
  }
  const sizeErr = checkSize(file);
  if (sizeErr) {
    alert(sizeErr);
    return;
  }
  const dataUrl = await fileToDataUrl(file);
  state.selection[slotKey] = { name: file.name, type: file.type, dataUrl };
  renderFrameSlot(slotKey);
  updateAssetCounter();
  updateCompiledPreview();
}

function renderFrameSlot(slotKey) {
  const slot = document.querySelector(`.frame-slot[data-slot="${slotKey}"]`);
  const data = state.selection[slotKey];
  const tag = slot.querySelector('.frame-slot-tag');
  const empty = slot.querySelector('.frame-slot-empty');
  const oldImg = slot.querySelector('img');
  const oldTrustedBadge = slot.querySelector('.slot-trusted-badge');
  if (oldImg) oldImg.remove();
  if (oldTrustedBadge) oldTrustedBadge.remove();

  if (data) {
    slot.classList.add('has-image');
    empty.style.display = 'none';

    // For asset:// URIs we can't directly <img src=...>; show a styled placeholder
    if (data.dataUrl?.startsWith('asset://')) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = `
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; gap: 0.3rem;
        background: linear-gradient(135deg, rgba(232,184,50,0.15), rgba(232,184,50,0.04));
        color: var(--amber-trusted);
        font-family: ui-monospace, monospace; font-size: 0.65rem;
      `;
      placeholder.innerHTML = `
        <div style="font-size: 1.4rem;">⬢</div>
        <div style="text-align:center;">${data.dataUrl.replace('asset://', '').slice(0, 18)}…</div>
      `;
      slot.insertBefore(placeholder, tag);
    } else {
      const img = document.createElement('img');
      img.src = data.dataUrl;
      slot.insertBefore(img, tag);
    }

    if (data.private) {
      const badge = document.createElement('div');
      badge.className = 'slot-private-badge';
      badge.textContent = 'PRIVATE ✓';
      badge.title = 'BytePlus private trusted asset — bypasses face filter';
      slot.appendChild(badge);
    } else if (data.trusted) {
      const badge = document.createElement('div');
      badge.className = 'slot-trusted-badge';
      badge.textContent = 'TRUSTED ✓';
      badge.title = 'Generated with Seedream — bypasses face filter';
      slot.appendChild(badge);
    }
  } else {
    slot.classList.remove('has-image');
    empty.style.display = '';
  }
}

// ─── Multi-ref grid ──────────────────────────────────────────
function bindMultiRef() {
  const addBtn = document.getElementById('multirefAddBtn');
  const fileInput = document.getElementById('multirefInput');
  const grid = document.getElementById('multirefGrid');

  addBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      await addMultiRef(file);
    }
    e.target.value = '';
  });

  // Drag & drop on the grid
  grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    grid.style.outline = '1px solid var(--neural-green)';
  });
  grid.addEventListener('dragleave', () => {
    grid.style.outline = '';
  });
  grid.addEventListener('drop', async (e) => {
    e.preventDefault();
    grid.style.outline = '';
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await addMultiRef(file);
    }
  });
}

async function addMultiRef(file) {
  const cat = categorize(file);
  if (!cat) {
    alert(`Unsupported: ${file.name}`);
    return;
  }
  const sizeErr = checkSize(file);
  if (sizeErr) {
    alert(`${file.name}: ${sizeErr}`);
    return;
  }
  const bucket =
    cat === 'image' ? 'refImages' :
    cat === 'video' ? 'refVideos' : 'refAudios';

  if (state.selection[bucket].length >= LIMITS[bucket]) {
    alert(`Max ${LIMITS[bucket]} ${cat}(s) allowed.`);
    return;
  }

  const dataUrl = await fileToDataUrl(file);
  state.selection[bucket].push({
    name: file.name,
    type: file.type,
    dataUrl,
    category: cat,
  });
  renderMultiRef();
  updateAssetCounter();
  updateCompiledPreview();
}

function renderMultiRef() {
  const grid = document.getElementById('multirefGrid');
  // Keep the add button reference
  const addBtn = document.getElementById('multirefAddBtn');
  grid.innerHTML = '';

  // Indices in tag follow Seedance convention:
  // First Frame is "Image 1" if present, Last Frame is "Image 2" if present,
  // then multi-ref images start counting from there.
  let imgOffset = 0;
  if (state.selection.firstFrame) imgOffset++;
  if (state.selection.lastFrame) imgOffset++;

  // Render images
  state.selection.refImages.forEach((item, idx) => {
    const tagNum = imgOffset + idx + 1;
    grid.appendChild(buildRefItem(item, 'image', `Image ${tagNum}`, () => {
      state.selection.refImages.splice(idx, 1);
      renderMultiRef();
      updateAssetCounter();
      updateCompiledPreview();
    }));
  });

  // Render videos
  state.selection.refVideos.forEach((item, idx) => {
    grid.appendChild(buildRefItem(item, 'video', `Video ${idx + 1}`, () => {
      state.selection.refVideos.splice(idx, 1);
      renderMultiRef();
      updateAssetCounter();
      updateCompiledPreview();
    }));
  });

  // Render audios
  state.selection.refAudios.forEach((item, idx) => {
    grid.appendChild(buildRefItem(item, 'audio', `Audio ${idx + 1}`, () => {
      state.selection.refAudios.splice(idx, 1);
      renderMultiRef();
      updateAssetCounter();
      updateCompiledPreview();
    }));
  });

  grid.appendChild(addBtn);
}

function buildRefItem(item, kind, tagText, onRemove) {
  const wrap = document.createElement('div');
  wrap.className = 'multiref-item' + (kind === 'audio' ? ' audio' : '');

  if (kind === 'image') {
    const img = document.createElement('img');
    img.src = item.dataUrl;
    img.title = item.name;
    wrap.appendChild(img);
  } else if (kind === 'video') {
    const v = document.createElement('video');
    v.src = item.dataUrl;
    v.muted = true;
    v.title = item.name;
    wrap.appendChild(v);
  } else {
    wrap.textContent = '🎵';
    wrap.title = item.name;
  }

  const remove = document.createElement('button');
  remove.className = 'multiref-remove';
  remove.textContent = '✕';
  remove.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
  wrap.appendChild(remove);

  const tag = document.createElement('div');
  tag.className = 'multiref-tag';
  tag.textContent = tagText;
  tag.title = `Click to insert "${tagText}" in your prompt`;
  tag.addEventListener('click', () => insertIntoPrompt(tagText));
  wrap.appendChild(tag);

  return wrap;
}

function insertIntoPrompt(text) {
  const ta = document.getElementById('userPrompt');
  const start = ta.selectionStart || 0;
  const end = ta.selectionEnd || 0;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  // Add a leading space if needed
  const sep = before && !before.endsWith(' ') ? ' ' : '';
  const newVal = before + sep + text + after;
  ta.value = newVal;
  state.selection.userPrompt = newVal;
  ta.focus();
  const newPos = (before + sep + text).length;
  ta.setSelectionRange(newPos, newPos);
  document.getElementById('charCount').textContent = `${newVal.length} chars`;
  updateCompiledPreview();
}

function updateAssetCounter() {
  const total =
    (state.selection.firstFrame ? 1 : 0) +
    (state.selection.lastFrame ? 1 : 0) +
    state.selection.refImages.length +
    state.selection.refVideos.length +
    state.selection.refAudios.length;
  const counter = document.getElementById('assetsCounter');
  if (counter) counter.textContent = `${total} asset${total === 1 ? '' : 's'}`;
}

// ═══════════════════════════════════════════════════════════════
// Bootstrap additional features
// ═══════════════════════════════════════════════════════════════
(function bootstrapExtensions() {
  // Wait until original init finishes by deferring to next tick
  setTimeout(() => {
    bindKeysModal();
    refreshKeys();
    bindFrameSlots();
    bindMultiRef();
    renderFrameSlot('firstFrame');
    renderFrameSlot('lastFrame');
    renderMultiRef();
    updateAssetCounter();
  }, 100);
})();

// ═══════════════════════════════════════════════════════════════
// CHARACTER STUDIO · Seedream integration
// ═══════════════════════════════════════════════════════════════

// In-memory list of trusted assets generated this session
let _trustedAssets = [];
let _seedreamGenerating = false;
let _lastSeedreamAt = 0;
const SEEDREAM_COOLDOWN_MS = 2000;

function bindCharacterStudio() {
  const studio = document.querySelector('.character-studio');
  const header = document.querySelector('.char-header');
  const body = document.getElementById('charBody');
  const toggle = document.getElementById('charToggleBtn');
  const promptEl = document.getElementById('charPrompt');
  const modelSelect = document.getElementById('charModelSelect');
  const sizeSelect = document.getElementById('charSizeSelect');
  const seedInput = document.getElementById('charSeedInput');
  const genBtn = document.getElementById('charGenerateBtn');
  const status = document.getElementById('charStatus');

  // Collapse / expand
  const setOpen = (open) => {
    studio.dataset.open = String(open);
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  setOpen(false);

  header.addEventListener('click', (e) => {
    if (e.target.closest('input, select, textarea, button:not(#charToggleBtn)')) return;
    setOpen(body.hidden);
  });

  // Generate handler
  genBtn.addEventListener('click', async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      status.textContent = '> Write a prompt first.';
      status.classList.add('error');
      return;
    }
    if (_seedreamGenerating) {
      status.textContent = '> Already generating. Wait for it to finish.';
      status.classList.add('error');
      return;
    }
    const since = Date.now() - _lastSeedreamAt;
    if (since < SEEDREAM_COOLDOWN_MS) {
      status.textContent = `> Cooldown. Wait ${Math.ceil((SEEDREAM_COOLDOWN_MS - since) / 1000)}s.`;
      status.classList.add('error');
      return;
    }

    _seedreamGenerating = true;
    _lastSeedreamAt = Date.now();
    genBtn.disabled = true;
    genBtn.querySelector('span').textContent = 'GENERATING…';
    status.classList.remove('error');
    status.textContent = '> Sending to Seedream… (~5–15s, costs ~$0.03/img)';

    try {
      const body = {
        prompt,
        model: modelSelect.value,
        size: sizeSelect.value,
      };
      const seedVal = seedInput.value.trim();
      if (seedVal !== '') body.seed = Number(seedVal);

      const r = await fetch('/api/seedream/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json());

      if (r.error) {
        status.textContent = `> ${r.error}`;
        status.classList.add('error');
        return;
      }

      status.textContent = `> ✓ Image ready. Trusted for 30 days. Seed: ${r.seed ?? 'random'}`;
      _trustedAssets.unshift(r);
      renderTrustedAssets();
    } catch (err) {
      status.textContent = `> ${err.message}`;
      status.classList.add('error');
    } finally {
      _seedreamGenerating = false;
      genBtn.disabled = false;
      genBtn.querySelector('span').textContent = '+ GENERATE IMAGE';
    }
  });

  // Load any existing assets from server (in case of multiple browser tabs)
  refreshTrustedAssets();
}

async function refreshTrustedAssets() {
  try {
    const r = await fetch('/api/seedream/assets').then((r) => r.json());
    _trustedAssets = r.assets || [];
    renderTrustedAssets();
  } catch {}
}

function renderTrustedAssets() {
  const grid = document.getElementById('charResultsGrid');
  const counter = document.getElementById('charAssetsCount');
  if (!grid) return;

  counter.textContent = String(_trustedAssets.length);

  if (!_trustedAssets.length) {
    grid.innerHTML = '<div class="char-results-empty">No images generated yet. Generate one to start.</div>';
    return;
  }

  grid.innerHTML = '';
  _trustedAssets.forEach((asset) => {
    const daysLeft = Math.max(
      0,
      Math.ceil((asset.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
    );
    const item = document.createElement('div');
    item.className = 'char-result-item';
    item.title = asset.prompt;
    item.innerHTML = `
      <img src="${asset.url}" alt="${escapeHtml(asset.prompt.slice(0, 40))}" />
      <div class="char-result-trusted">TRUSTED ✓</div>
      <div class="char-result-days">${daysLeft}d left</div>
      <div class="char-result-actions">
        <button data-action="first">→ FIRST FRAME</button>
        <button data-action="last">→ LAST FRAME</button>
        <button data-action="multi" class="secondary">→ MULTI-REF</button>
      </div>
    `;

    item.querySelector('[data-action="first"]').addEventListener('click', (e) => {
      e.stopPropagation();
      assignTrustedToSlot(asset, 'firstFrame');
    });
    item.querySelector('[data-action="last"]').addEventListener('click', (e) => {
      e.stopPropagation();
      assignTrustedToSlot(asset, 'lastFrame');
    });
    item.querySelector('[data-action="multi"]').addEventListener('click', (e) => {
      e.stopPropagation();
      assignTrustedToMultiref(asset);
    });

    grid.appendChild(item);
  });
}

// Assign a trusted Seedream URL to a frame slot.
// Unlike local uploads (which embed base64), trusted assets ride as
// public URLs — Seedance will pull them directly. Faster & smaller payload.
function assignTrustedToSlot(asset, slotKey) {
  state.selection[slotKey] = {
    name: `seedream_${asset.id}`,
    type: 'image/jpeg',
    dataUrl: asset.url,  // public URL, not base64 — works because the URL is on BytePlus TOS
    trusted: true,
  };
  renderFrameSlot(slotKey);
  updateAssetCounter();
  updateCompiledPreview();
}

function assignTrustedToMultiref(asset) {
  if (state.selection.refImages.length >= LIMITS.refImages) {
    alert(`Max ${LIMITS.refImages} multi-ref images.`);
    return;
  }
  state.selection.refImages.push({
    name: `seedream_${asset.id}`,
    type: 'image/jpeg',
    dataUrl: asset.url,
    category: 'image',
    trusted: true,
  });
  renderMultiRef();
  updateAssetCounter();
  updateCompiledPreview();
}

// Bootstrap on load (after the existing init flow)
setTimeout(bindCharacterStudio, 200);

// ═══════════════════════════════════════════════════════════════
// SESSION MANAGEMENT  ·  user + scene context
// ═══════════════════════════════════════════════════════════════
//
// Persistence model:
//   - User name persists across sessions (localStorage)
//   - Scene info also persists but the modal still opens at launch so
//     you confirm/change it explicitly each time
//   - Rated clips live in localStorage keyed by scene fingerprint;
//     they survive page refreshes until explicitly exported or cleared
//
// LocalStorage keys:
//   dcs.user.name          → string
//   dcs.session.current    → { project, scene, beat, notes, startedAt }
//   dcs.scenelog.<key>     → array of clip records (key = project+scene+beat hash)
// ───────────────────────────────────────────────────────────────

const LS_USER = 'dcs.user.name';
const LS_SESSION = 'dcs.session.current';
const LS_SCENELOG_PREFIX = 'dcs.scenelog.';

const session = {
  user: null,
  project: null,
  scene: null,
  beat: null,
  notes: null,
  startedAt: null,
};

function sceneKey() {
  if (!session.project || !session.scene) return null;
  // Sanitize: lowercase, alphanumeric + separators
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${norm(session.project)}__${norm(session.scene)}__${norm(session.beat) || 'nobeat'}`;
}

function loadSessionFromStorage() {
  try {
    const userName = localStorage.getItem(LS_USER);
    if (userName) session.user = userName;

    const sess = localStorage.getItem(LS_SESSION);
    if (sess) {
      const parsed = JSON.parse(sess);
      Object.assign(session, parsed);
    }
  } catch (e) {
    console.warn('Could not load session from storage', e);
  }
}

function saveSessionToStorage() {
  if (session.user) localStorage.setItem(LS_USER, session.user);
  localStorage.setItem(LS_SESSION, JSON.stringify({
    project: session.project,
    scene: session.scene,
    beat: session.beat,
    notes: session.notes,
    startedAt: session.startedAt,
  }));
}

// ─── Header chips render ────────────────────────────────────
function renderSessionChips() {
  const userChip = document.getElementById('userChip');
  const userLabel = document.getElementById('userChipLabel');
  const sceneChip = document.getElementById('sceneChip');
  const sceneLabel = document.getElementById('sceneChipLabel');

  if (session.user) {
    userChip.classList.remove('empty');
    userLabel.textContent = session.user;
  } else {
    userChip.classList.add('empty');
    userLabel.textContent = 'no user';
  }

  if (session.project && session.scene) {
    sceneChip.classList.remove('empty');
    const beatStr = session.beat ? ` · B${session.beat}` : '';
    sceneLabel.textContent = `${session.project} · ${session.scene}${beatStr}`;
  } else {
    sceneChip.classList.add('empty');
    sceneLabel.textContent = 'no scene';
  }

  refreshExportChip();
}

function refreshExportChip() {
  const btn = document.getElementById('exportChip');
  const badge = document.getElementById('exportCount');
  const log = getSceneLog();
  const count = log.filter((c) => c.rating >= 3).length;
  badge.textContent = String(count);
  btn.disabled = count === 0;
  btn.title = count === 0
    ? 'No rated clips yet (≥3 stars required)'
    : `Download ${count} clip(s) as ZIP`;
}

// ─── Session modal ──────────────────────────────────────────
function openSessionModal({ closable = false } = {}) {
  const modal = document.getElementById('sessionModal');
  const closeBtn = document.getElementById('sessionModalClose');
  const nameInput = document.getElementById('sessionNameInput');
  const projectInput = document.getElementById('sessionProjectInput');
  const sceneInput = document.getElementById('sessionSceneInput');
  const beatInput = document.getElementById('sessionBeatInput');
  const notesInput = document.getElementById('sessionNotesInput');

  // Pre-fill from current session
  nameInput.value = session.user || '';
  projectInput.value = session.project || '';
  sceneInput.value = session.scene || '';
  beatInput.value = session.beat || '';
  notesInput.value = session.notes || '';

  closeBtn.hidden = !closable;
  modal.classList.add('open');

  // Focus the first empty field
  setTimeout(() => {
    if (!nameInput.value) nameInput.focus();
    else if (!projectInput.value) projectInput.focus();
    else sceneInput.focus();
  }, 100);
}

function closeSessionModal() {
  document.getElementById('sessionModal').classList.remove('open');
}

function bindSessionModal() {
  const confirmBtn = document.getElementById('sessionConfirmBtn');
  const closeBtn = document.getElementById('sessionModalClose');
  const userChip = document.getElementById('userChip');
  const sceneChip = document.getElementById('sceneChip');

  confirmBtn.addEventListener('click', () => {
    const name = document.getElementById('sessionNameInput').value.trim();
    const project = document.getElementById('sessionProjectInput').value.trim();
    const scene = document.getElementById('sessionSceneInput').value.trim();
    const beat = document.getElementById('sessionBeatInput').value.trim();
    const notes = document.getElementById('sessionNotesInput').value.trim();

    if (!name || !project || !scene) {
      alert('Name, Project, and Scene are required.');
      return;
    }

    session.user = name;
    session.project = project;
    session.scene = scene;
    session.beat = beat || null;
    session.notes = notes || null;
    if (!session.startedAt) session.startedAt = new Date().toISOString();

    saveSessionToStorage();
    renderSessionChips();
    closeSessionModal();
  });

  closeBtn.addEventListener('click', closeSessionModal);

  // Re-open modal from header chips
  userChip.addEventListener('click', () => openSessionModal({ closable: true }));
  sceneChip.addEventListener('click', () => openSessionModal({ closable: true }));

  // Enter key on any field submits
  ['sessionNameInput', 'sessionProjectInput', 'sessionSceneInput', 'sessionBeatInput'].forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
    });
  });

  // Escape closes modal only if it's closable
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('sessionModal');
      const closeBtn = document.getElementById('sessionModalClose');
      if (modal.classList.contains('open') && !closeBtn.hidden) {
        closeSessionModal();
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// SCENE LOG  ·  per-scene clip records in localStorage
// ═══════════════════════════════════════════════════════════════

function getSceneLog() {
  const key = sceneKey();
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(LS_SCENELOG_PREFIX + key) || '[]');
  } catch {
    return [];
  }
}

function saveSceneLog(log) {
  const key = sceneKey();
  if (!key) return;
  localStorage.setItem(LS_SCENELOG_PREFIX + key, JSON.stringify(log));
  refreshExportChip();
}

function appendOrUpdateClipInLog(clipRecord) {
  const log = getSceneLog();
  const idx = log.findIndex((c) => c.taskId === clipRecord.taskId);
  if (idx >= 0) {
    log[idx] = { ...log[idx], ...clipRecord };
  } else {
    log.push(clipRecord);
  }
  saveSceneLog(log);
}

// ═══════════════════════════════════════════════════════════════
// RATING WIDGET  ·  star ratings + notes per loaded clip
// ═══════════════════════════════════════════════════════════════

// Track the currently-loaded clip for rating purposes
let _currentClip = null;  // { taskId, prompt, model, url, localUrl, generatedAt }

function bindRatingWidget() {
  const stars = document.querySelectorAll('#ratingStars .star');
  const notesInput = document.getElementById('ratingNotes');
  const status = document.getElementById('ratingStatus');

  stars.forEach((star) => {
    star.addEventListener('click', () => {
      if (!_currentClip) return;
      const rating = Number(star.dataset.rating);
      _currentClip.rating = rating;
      updateStarsDisplay(rating);
      persistCurrentClipRating();
      updateRatingStatus(rating);
    });

    star.addEventListener('mouseenter', () => {
      const r = Number(star.dataset.rating);
      previewStarsDisplay(r);
    });
  });

  document.getElementById('ratingStars').addEventListener('mouseleave', () => {
    updateStarsDisplay(_currentClip?.rating || 0);
  });

  notesInput.addEventListener('input', () => {
    if (!_currentClip) return;
    _currentClip.ratingNotes = notesInput.value;
    persistCurrentClipRating();
  });
}

function previewStarsDisplay(hoverRating) {
  document.querySelectorAll('#ratingStars .star').forEach((s) => {
    const r = Number(s.dataset.rating);
    s.classList.toggle('active', r <= hoverRating);
    s.classList.toggle('below-threshold', hoverRating < 3);
  });
}

function updateStarsDisplay(rating) {
  document.querySelectorAll('#ratingStars .star').forEach((s) => {
    const r = Number(s.dataset.rating);
    s.classList.toggle('active', r <= rating);
    s.classList.toggle('below-threshold', rating > 0 && rating < 3);
  });
}

function updateRatingStatus(rating) {
  const status = document.getElementById('ratingStatus');
  if (!rating) {
    status.textContent = '';
    return;
  }
  if (rating < 3) {
    status.textContent = '↓ below threshold (not in export)';
    status.classList.add('below');
  } else if (rating === 3) {
    status.textContent = '✓ saved · partial use';
    status.classList.remove('below');
  } else if (rating === 4) {
    status.textContent = '✓ saved · strong take';
    status.classList.remove('below');
  } else {
    status.textContent = '✓ saved · final take';
    status.classList.remove('below');
  }
}

function persistCurrentClipRating() {
  if (!_currentClip || !sceneKey()) return;
  appendOrUpdateClipInLog({
    ..._currentClip,
    user: session.user,
  });
}

function showRatingWidget(clip) {
  _currentClip = clip;
  const widget = document.getElementById('ratingWidget');
  const notesInput = document.getElementById('ratingNotes');

  // Restore rating if this clip was already rated in the log
  const log = getSceneLog();
  const existing = log.find((c) => c.taskId === clip.taskId);
  if (existing) {
    _currentClip.rating = existing.rating;
    _currentClip.ratingNotes = existing.ratingNotes || '';
    notesInput.value = existing.ratingNotes || '';
    updateStarsDisplay(existing.rating || 0);
    updateRatingStatus(existing.rating || 0);
  } else {
    _currentClip.rating = 0;
    _currentClip.ratingNotes = '';
    notesInput.value = '';
    updateStarsDisplay(0);
    updateRatingStatus(0);
  }

  widget.hidden = false;
}

// ═══════════════════════════════════════════════════════════════
// EXPORT  ·  build ZIP with markdown + JSON + clips
// ═══════════════════════════════════════════════════════════════

function bindExport() {
  document.getElementById('exportChip').addEventListener('click', exportSceneZip);
}

async function exportSceneZip() {
  if (typeof JSZip === 'undefined') {
    alert('JSZip library not loaded. Cannot export.');
    return;
  }

  const log = getSceneLog().filter((c) => c.rating >= 3);
  if (!log.length) {
    alert('No clips rated ≥ 3 stars yet. Rate some clips first.');
    return;
  }

  const exportBtn = document.getElementById('exportChip');
  const originalLabel = exportBtn.querySelector('.chip-label').textContent;
  exportBtn.disabled = true;
  exportBtn.querySelector('.chip-label').textContent = 'BUILDING…';

  try {
    const zip = new JSZip();

    // Sort takes by rating (best first), then by time
    const sorted = [...log].sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return new Date(a.generatedAt) - new Date(b.generatedAt);
    });

    // Build the README.md
    const md = buildSceneMarkdown(sorted);
    zip.file('README.md', md);

    // Build the scene-data.json (machine-readable)
    const json = buildSceneJSON(sorted);
    zip.file('scene-data.json', JSON.stringify(json, null, 2));

    // Add the actual MP4 clips
    const clipsFolder = zip.folder('clips');
    for (let i = 0; i < sorted.length; i++) {
      const clip = sorted[i];
      const stars = '★'.repeat(clip.rating) + '☆'.repeat(5 - clip.rating);
      const filename = `take-${String(i + 1).padStart(3, '0')}-${stars}.mp4`;
      const url = clip.localUrl || clip.videoUrl;
      if (!url) continue;
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        clipsFolder.file(filename, blob);
      } catch (e) {
        console.warn(`Could not fetch clip ${i + 1}:`, e);
        // Add a placeholder text file noting the missing clip
        clipsFolder.file(
          `take-${String(i + 1).padStart(3, '0')}-MISSING.txt`,
          `Clip URL was unreachable at export time:\n${url}\n\nError: ${e.message}\n`
        );
      }
    }

    // Generate the ZIP
    const blob = await zip.generateAsync({ type: 'blob' });

    // Trigger download
    const filename = buildExportFilename();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    addLog(`✓ Exported ${sorted.length} clips as ${filename}`, 'success');
  } catch (err) {
    console.error(err);
    alert('Export failed: ' + err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.querySelector('.chip-label').textContent = originalLabel;
    refreshExportChip();
  }
}

function buildExportFilename() {
  const norm = (s) => (s || 'untitled').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const date = new Date().toISOString().slice(0, 10);
  const beat = session.beat ? `_B${norm(session.beat)}` : '';
  return `DCS_${norm(session.project)}_${norm(session.scene)}${beat}_${date}.zip`;
}

function buildSceneMarkdown(clips) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# ${session.project} — Scene ${session.scene}`);
  if (session.beat) lines.push(`### Beat ${session.beat}`);
  lines.push('');
  lines.push(`**Operator:** ${session.user || '(unknown)'}  `);
  lines.push(`**Session started:** ${session.startedAt || '(unknown)'}  `);
  lines.push(`**Exported:** ${new Date().toISOString()}  `);
  lines.push(`**Total takes:** ${clips.length}`);
  lines.push('');
  if (session.notes) {
    lines.push('## Director notes');
    lines.push('');
    lines.push('> ' + session.notes.replace(/\n/g, '\n> '));
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## Takes');
  lines.push('');

  clips.forEach((clip, i) => {
    const num = String(i + 1).padStart(3, '0');
    const stars = '★'.repeat(clip.rating) + '☆'.repeat(5 - clip.rating);
    const ratingLabel =
      clip.rating === 5 ? 'FINAL TAKE' :
      clip.rating === 4 ? 'STRONG TAKE' :
      clip.rating === 3 ? 'PARTIAL USE' : '';

    lines.push(`### Take ${num} — ${stars} · ${ratingLabel}`);
    lines.push('');
    lines.push(`- **Generated at:** ${clip.generatedAt || '(unknown)'}`);
    lines.push(`- **Model:** \`${clip.model || '(unknown)'}\``);
    lines.push(`- **Task ID:** \`${clip.taskId}\``);
    lines.push(`- **File:** \`clips/take-${num}-${stars}.mp4\``);
    if (clip.ratingNotes) {
      lines.push(`- **Notes:** ${clip.ratingNotes}`);
    }
    lines.push('');
    lines.push('**Prompt:**');
    lines.push('');
    lines.push('```');
    lines.push(clip.prompt || '(no prompt recorded)');
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  lines.push('');
  lines.push('*Generated by Seedance Studio · Dead Camera Studios*');
  return lines.join('\n');
}

function buildSceneJSON(clips) {
  return {
    schema: 'dcs-scene-log/v1',
    project: session.project,
    scene: session.scene,
    beat: session.beat || null,
    notes: session.notes || null,
    operator: session.user,
    sessionStartedAt: session.startedAt,
    exportedAt: new Date().toISOString(),
    clipCount: clips.length,
    clips: clips.map((clip, i) => ({
      take: i + 1,
      rating: clip.rating,
      ratingLabel:
        clip.rating === 5 ? 'final' :
        clip.rating === 4 ? 'strong' :
        clip.rating === 3 ? 'partial' : 'discarded',
      generatedAt: clip.generatedAt,
      model: clip.model,
      taskId: clip.taskId,
      prompt: clip.prompt,
      ratingNotes: clip.ratingNotes || null,
      filename: `clips/take-${String(i + 1).padStart(3, '0')}-${'★'.repeat(clip.rating)}${'☆'.repeat(5 - clip.rating)}.mp4`,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// HOOK: loadClip is patched directly in its definition above to
// call showRatingWidget() — no wrapper needed.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════
setTimeout(() => {
  loadSessionFromStorage();
  bindSessionModal();
  bindRatingWidget();
  bindExport();
  renderSessionChips();

  // If no session exists yet, force the modal open (not closable until filled)
  if (!session.user || !session.project || !session.scene) {
    openSessionModal({ closable: false });
  }
}, 150);

// ═══════════════════════════════════════════════════════════════
// ASSETS LIBRARY · BytePlus Private Trusted Library
// ───────────────────────────────────────────────────────────────
// Reads/writes via /api/assets/* (which signs requests with AK/SK
// to BytePlus management plane). Uploaded images become "trusted"
// assets that bypass the face filter when used in Seedance via
// asset:// URIs.
// ═══════════════════════════════════════════════════════════════

let _libGroups = [];
let _libAssets = [];
let _libCurrentGroup = null;
let _libUploading = false;

function bindAssetsLibrary() {
  const studio = document.querySelector('.assets-library');
  const header = document.querySelector('.lib-header');
  const body = document.getElementById('libBody');
  const toggle = document.getElementById('libToggleBtn');

  // Collapse / expand
  const setOpen = (open) => {
    studio.dataset.open = String(open);
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      // First open: load groups + assets
      libRefreshGroups();
    }
  };
  setOpen(false);

  header.addEventListener('click', (e) => {
    if (e.target.closest('input, select, textarea, button:not(#libToggleBtn)')) return;
    setOpen(body.hidden);
  });

  // ─── New group button ──────────────────────────────────
  document.getElementById('libNewGroupBtn').addEventListener('click', async () => {
    const name = prompt('New asset group name (e.g. "Dixie character", "Sofia character", "Locations"):');
    if (!name?.trim()) return;
    const description = prompt('Optional description:') || '';

    libSetStatus('Creating group…', 'info');
    try {
      const r = await fetch('/api/assets/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      }).then((r) => r.json());

      if (r.error) {
        libSetStatus(`✗ ${r.error}`, 'error');
        return;
      }
      libSetStatus(`✓ Group "${name}" created → ${r.id}`, 'success');
      await libRefreshGroups();
      // Auto-select the new group
      const select = document.getElementById('libGroupSelect');
      select.value = r.id;
      _libCurrentGroup = r.id;
      libRefreshAssets();
    } catch (err) {
      libSetStatus(`✗ ${err.message}`, 'error');
    }
  });

  // ─── Group select change ───────────────────────────────
  document.getElementById('libGroupSelect').addEventListener('change', (e) => {
    _libCurrentGroup = e.target.value || null;
    libRefreshAssets();
  });

  // ─── Upload ────────────────────────────────────────────
  document.getElementById('libUploadBtn').addEventListener('click', async () => {
    if (_libUploading) {
      libSetStatus('Already uploading. Wait.', 'error');
      return;
    }
    if (!_libCurrentGroup) {
      libSetStatus('Select or create a group first.', 'error');
      return;
    }
    const url = document.getElementById('libAssetUrl').value.trim();
    const name = document.getElementById('libAssetName').value.trim();
    const skipMod = document.getElementById('libSkipModeration').checked;

    if (!url) {
      libSetStatus('Public URL required.', 'error');
      return;
    }
    if (!url.match(/^https?:\/\//)) {
      libSetStatus('URL must start with http:// or https://', 'error');
      return;
    }
    if (skipMod) {
      const ok = confirm(
        '⚠ Skip Moderation requires Secure Mode OFF in BytePlus console.\n\n' +
        'If Secure Mode is still ON, this upload will return an error from BytePlus.\n\n' +
        'Continue?'
      );
      if (!ok) return;
    }

    _libUploading = true;
    const btn = document.getElementById('libUploadBtn');
    btn.disabled = true;
    btn.textContent = 'UPLOADING…';
    libSetStatus('Submitting to BytePlus…', 'info');

    try {
      const body = {
        groupId: _libCurrentGroup,
        url,
        name,
        assetType: 'Image',
      };
      if (skipMod) body.moderationStrategy = 'Skip';

      const r = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json());

      if (r.error) {
        libSetStatus(`✗ ${r.error}`, 'error');
        return;
      }
      libSetStatus(`Asset created → ${r.id}. Polling for processing…`, 'info');

      // Clear the input
      document.getElementById('libAssetUrl').value = '';
      document.getElementById('libAssetName').value = '';

      // Poll until Active or Failed (every 3s, max 3min)
      const started = Date.now();
      const poll = async () => {
        if (Date.now() - started > 3 * 60 * 1000) {
          libSetStatus('✗ Asset processing timeout (3min). Refresh manually later.', 'error');
          libRefreshAssets();
          return;
        }
        try {
          const a = await fetch(`/api/assets/${r.id}`).then((r) => r.json());
          if (a.error) {
            libSetStatus(`✗ ${a.error}`, 'error');
            return;
          }
          if (a.Status === 'Active') {
            libSetStatus(`✓ Asset Active → ${r.id}`, 'success');
            libRefreshAssets();
            return;
          }
          if (a.Status === 'Failed') {
            libSetStatus(`✗ Asset processing failed (${r.id}). Check console.`, 'error');
            libRefreshAssets();
            return;
          }
          // Processing
          const elapsed = Math.round((Date.now() - started) / 1000);
          libSetStatus(`[${elapsed}s] Processing… (${a.Status})`, 'info');
          setTimeout(poll, 3000);
        } catch (e) {
          libSetStatus(`✗ Polling error: ${e.message}`, 'error');
        }
      };
      setTimeout(poll, 2000);
    } catch (err) {
      libSetStatus(`✗ ${err.message}`, 'error');
    } finally {
      _libUploading = false;
      btn.disabled = false;
      btn.textContent = '+ UPLOAD';
    }
  });

  // ─── Refresh button ────────────────────────────────────
  document.getElementById('libRefreshBtn').addEventListener('click', () => {
    libRefreshAssets();
  });
}

function libSetStatus(msg, type = 'info') {
  const el = document.getElementById('libStatus');
  el.textContent = msg ? `> ${msg}` : '';
  el.classList.remove('error', 'success');
  if (type === 'error') el.classList.add('error');
  if (type === 'success') el.classList.add('success');
}

async function libRefreshGroups() {
  // Check if active key has AK/SK first
  try {
    const keys = await fetch('/api/keys').then((r) => r.json());
    const active = keys.keys.find((k) => k.id === keys.active);
    const noAkSkBanner = document.getElementById('libNoAkSk');
    if (!active?.hasAkSk) {
      noAkSkBanner.hidden = false;
      return;
    }
    noAkSkBanner.hidden = true;
  } catch {}

  try {
    const r = await fetch('/api/assets/groups').then((r) => r.json());
    if (r.error) {
      libSetStatus(`✗ ${r.error}`, 'error');
      return;
    }
    _libGroups = r.groups || [];
    const select = document.getElementById('libGroupSelect');
    const currentValue = select.value;
    select.innerHTML = '<option value="">— select / create —</option>';
    _libGroups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.Id;
      opt.textContent = g.Name + (g.Description ? ` — ${g.Description}` : '');
      select.appendChild(opt);
    });
    // Restore selection if possible
    if (currentValue && _libGroups.find((g) => g.Id === currentValue)) {
      select.value = currentValue;
      _libCurrentGroup = currentValue;
      libRefreshAssets();
    }
  } catch (err) {
    libSetStatus(`✗ Could not load groups: ${err.message}`, 'error');
  }
}

async function libRefreshAssets() {
  if (!_libCurrentGroup) {
    _libAssets = [];
    libRenderAssets();
    return;
  }
  try {
    const r = await fetch(
      `/api/assets?groupId=${encodeURIComponent(_libCurrentGroup)}` +
      `&statuses=Active,Processing,Failed`
    ).then((r) => r.json());
    if (r.error) {
      libSetStatus(`✗ ${r.error}`, 'error');
      return;
    }
    _libAssets = r.assets || [];
    libRenderAssets();
  } catch (err) {
    libSetStatus(`✗ ${err.message}`, 'error');
  }
}

function libRenderAssets() {
  const grid = document.getElementById('libGrid');
  const counter = document.getElementById('libAssetCount');
  counter.textContent = `${_libAssets.length}`;

  if (!_libAssets.length) {
    grid.innerHTML = '<div class="lib-grid-empty">No assets in this group yet.</div>';
    return;
  }

  grid.innerHTML = '';
  _libAssets.forEach((asset) => {
    const item = document.createElement('div');
    item.className = 'lib-asset-item';
    item.title = `${asset.Name || '(unnamed)'} · ${asset.Id}`;

    const statusClass = asset.Status === 'Active' ? 'active' :
                        asset.Status === 'Failed' ? 'failed' : 'processing';
    const statusText = asset.Status;

    // Image preview only when URL is available (URL is signed and 12h-valid)
    const imgHtml = asset.URL
      ? `<img src="${asset.URL}" alt="${escapeHtml(asset.Name || '')}" loading="lazy" />`
      : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--ink-muted);">⌛</div>';

    item.innerHTML = `
      ${imgHtml}
      <div class="lib-asset-status-badge ${statusClass}">${statusText}</div>
      ${asset.Name ? `<div class="lib-asset-name">${escapeHtml(asset.Name.slice(0, 30))}</div>` : ''}
      <div class="lib-asset-actions">
        <button data-action="first">→ FIRST FRAME</button>
        <button data-action="last">→ LAST FRAME</button>
        <button data-action="multi">→ MULTI-REF</button>
        <button data-action="delete" class="danger">DELETE</button>
      </div>
    `;

    // Active assets can be assigned; others can only be deleted
    if (asset.Status === 'Active') {
      item.querySelector('[data-action="first"]').addEventListener('click', (e) => {
        e.stopPropagation();
        libAssignToSlot(asset, 'firstFrame');
      });
      item.querySelector('[data-action="last"]').addEventListener('click', (e) => {
        e.stopPropagation();
        libAssignToSlot(asset, 'lastFrame');
      });
      item.querySelector('[data-action="multi"]').addEventListener('click', (e) => {
        e.stopPropagation();
        libAssignToMultiref(asset);
      });
    } else {
      item.querySelectorAll('[data-action="first"], [data-action="last"], [data-action="multi"]').forEach((b) => {
        b.disabled = true;
        b.style.opacity = 0.4;
        b.style.cursor = 'not-allowed';
        b.title = `Cannot use — status is ${asset.Status}`;
      });
    }

    item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete asset ${asset.Id}? This cannot be undone.`)) return;
      try {
        const r = await fetch(`/api/assets/${asset.Id}`, { method: 'DELETE' }).then((r) => r.json());
        if (r.error) { alert(`Failed: ${r.error}`); return; }
        libSetStatus(`✓ Deleted ${asset.Id}`, 'success');
        libRefreshAssets();
      } catch (err) {
        alert(`Failed: ${err.message}`);
      }
    });

    grid.appendChild(item);
  });
}

// Assign a private trusted asset to a Seedance slot.
// Critical: send asset:// URI as dataUrl so buildPayload picks it up.
function libAssignToSlot(asset, slotKey) {
  state.selection[slotKey] = {
    name: asset.Name || `private_${asset.Id}`,
    type: 'image/jpeg',
    dataUrl: `asset://${asset.Id}`,  // Seedance recognizes this URI scheme
    private: true,                    // flag for badge rendering
  };
  renderFrameSlot(slotKey);
  updateAssetCounter();
  updateCompiledPreview();
  libSetStatus(`✓ Assigned ${asset.Id} → ${slotKey}`, 'success');
}

function libAssignToMultiref(asset) {
  if (state.selection.refImages.length >= LIMITS.refImages) {
    alert(`Max ${LIMITS.refImages} multi-ref images.`);
    return;
  }
  state.selection.refImages.push({
    name: asset.Name || `private_${asset.Id}`,
    type: 'image/jpeg',
    dataUrl: `asset://${asset.Id}`,
    category: 'image',
    private: true,
  });
  renderMultiRef();
  updateAssetCounter();
  updateCompiledPreview();
  libSetStatus(`✓ Assigned ${asset.Id} → multi-ref`, 'success');
}

// Bootstrap
setTimeout(bindAssetsLibrary, 250);
