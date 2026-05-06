// ═══════════════════════════════════════════════════════════════
// SEEDANCE STUDIO · Backend
// Dead Camera Studios · powered by BytePlus ModelArk · Seedance 2.0
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { signedFetch } from './byteplus-signer.js';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// JSON limit grande para soportar base64 de imágenes/audios
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

const PORT = process.env.PORT || 3000;
// Catálogo de endpoints — cada API key se asocia a uno
// (BytePlus y Volcengine son cuentas separadas con dominios distintos)
const ENDPOINTS = {
  byteplus_ap: {
    label: 'BytePlus · Singapore (ap-southeast)',
    url: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  },
  volcengine_cn: {
    label: 'Volcengine · China (cn-beijing)',
    url: 'https://ark.cn-beijing.volces.com/api/v3',
  },
};

const DEFAULT_ENDPOINT = 'byteplus_ap';
const DEFAULT_MODEL =
  process.env.DEFAULT_MODEL || 'dreamina-seedance-2-0-fast-260128';

const KEYS_FILE = path.join(__dirname, 'keys.json');

// ═════════════════════════════════════════════════════════════
// API Keys management
// ═════════════════════════════════════════════════════════════

function loadKeys() {
  if (!fs.existsSync(KEYS_FILE)) return { active: null, keys: [] };
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
  } catch {
    return { active: null, keys: [] };
  }
}

function saveKeys(data) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

function getActiveKey() {
  const { active, keys } = loadKeys();
  if (!active) return null;
  const found = keys.find((k) => k.id === active);
  if (!found) return null;
  const endpointId = found.endpoint || DEFAULT_ENDPOINT;
  const endpoint = ENDPOINTS[endpointId] || ENDPOINTS[DEFAULT_ENDPOINT];
  return {
    value: found.value,
    endpoint,
    endpointId,
    ak: found.ak || null,
    sk: found.sk || null,
  };
}

// Devuelve solo metadata (sin exponer el value completo)
function maskedKeys() {
  const { active, keys } = loadKeys();
  return {
    active,
    endpoints: ENDPOINTS,
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      preview: maskKey(k.value),
      endpoint: k.endpoint || DEFAULT_ENDPOINT,
      hasAkSk: !!(k.ak && k.sk),
      akPreview: k.ak ? maskKey(k.ak) : null,
      createdAt: k.createdAt,
    })),
  };
}

function maskKey(v) {
  if (!v) return '';
  if (v.length <= 12) return '••••';
  return v.slice(0, 4) + '••••' + v.slice(-4);
}

// ─── List ────────────────────────────────────────────────────
app.get('/api/keys', (req, res) => {
  res.json(maskedKeys());
});

// ─── Add ─────────────────────────────────────────────────────
app.post('/api/keys', (req, res) => {
  const { name, value, endpoint, ak, sk } = req.body || {};
  if (!value || typeof value !== 'string') {
    return res.status(400).json({ error: 'Missing API key value' });
  }
  const detectedEndpoint = endpoint && ENDPOINTS[endpoint]
    ? endpoint
    : DEFAULT_ENDPOINT;

  const data = loadKeys();
  const id = crypto.randomBytes(6).toString('hex');
  const newKey = {
    id,
    name: name?.trim() || `key-${data.keys.length + 1}`,
    value: value.trim(),
    endpoint: detectedEndpoint,
    // Optional AK/SK for the Assets API (Private Virtual Portrait Library)
    ak: (ak && typeof ak === 'string') ? ak.trim() : null,
    sk: (sk && typeof sk === 'string') ? sk.trim() : null,
    createdAt: new Date().toISOString(),
  };
  data.keys.push(newKey);
  if (!data.active) data.active = id;
  saveKeys(data);
  res.json(maskedKeys());
});

// ─── Activate ────────────────────────────────────────────────
app.post('/api/keys/:id/activate', (req, res) => {
  const data = loadKeys();
  const exists = data.keys.find((k) => k.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Key not found' });
  data.active = req.params.id;
  saveKeys(data);
  res.json(maskedKeys());
});

// ─── Delete ──────────────────────────────────────────────────
app.delete('/api/keys/:id', (req, res) => {
  const data = loadKeys();
  data.keys = data.keys.filter((k) => k.id !== req.params.id);
  if (data.active === req.params.id) {
    data.active = data.keys[0]?.id || null;
  }
  saveKeys(data);
  res.json(maskedKeys());
});

// ─── Rename / change endpoint ────────────────────────────────
app.patch('/api/keys/:id', (req, res) => {
  const { name, endpoint } = req.body || {};
  const data = loadKeys();
  const k = data.keys.find((x) => x.id === req.params.id);
  if (!k) return res.status(404).json({ error: 'Key not found' });
  if (name !== undefined) k.name = name.trim() || k.name;
  if (endpoint !== undefined && ENDPOINTS[endpoint]) k.endpoint = endpoint;
  saveKeys(data);
  res.json(maskedKeys());
});

// ═════════════════════════════════════════════════════════════
// BytePlus ModelArk client
// ═════════════════════════════════════════════════════════════

async function arkRequest(apiPath, { method = 'GET', body = null } = {}) {
  const active = getActiveKey();
  if (!active) {
    throw new Error(
      'No active API key. Add one from the panel in the top-right corner.'
    );
  }

  const url = `${active.endpoint.url}${apiPath}`;
  const headers = {
    'Authorization': `Bearer ${active.value}`,
    'Content-Type': 'application/json',
  };

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const errMsg =
      json?.error?.message ||
      json?.message ||
      `${active.endpointId} ${res.status}: ${text.slice(0, 400)}`;
    throw new Error(errMsg);
  }
  return json;
}

// ═════════════════════════════════════════════════════════════
// Prompt compiler — multimodal aware
// ═════════════════════════════════════════════════════════════

/**
 * Builds ONLY the cinematographic text block (no technical flags).
 * Per the official BytePlus docs, ratio/duration/etc go as top-level
 * JSON fields, NOT as --flags inside the prompt text.
 */
function compilePromptText(selection) {
  const parts = [];

  // 1. User's scene description
  if (selection.userPrompt?.trim()) parts.push(selection.userPrompt.trim());

  // 2. Cinematographic language (DCS DNA)
  if (selection.camera?.prompt) parts.push(selection.camera.prompt);
  if (selection.lens?.prompt) parts.push(selection.lens.prompt);
  if (selection.cameraMotion?.prompt) parts.push(selection.cameraMotion.prompt);
  if (selection.colorGrading?.prompt) parts.push(selection.colorGrading.prompt);
  if (selection.genre?.prompt) parts.push(selection.genre.prompt);

  let textBlock = parts.filter(Boolean).join('. ');
  if (textBlock && !textBlock.endsWith('.')) textBlock += '.';
  return textBlock;
}

/**
 * Builds the multimodal content array AND extracts top-level fields
 * matching the official BytePlus payload shape:
 *
 *   {
 *     model: "...",
 *     content: [ { type, ..., role: "reference_*" }, ..., { type: "text", text: "..." } ],
 *     ratio: "16:9",
 *     duration: 5,
 *     watermark: false,
 *     generate_audio: true,        // only on Pro
 *     camerafixed: false
 *   }
 *
 * Asset ordering convention:
 *   1. First Frame  → "Image 1"  (role: reference_image)
 *   2. Last Frame   → "Image 2"  (role: reference_image)
 *   3. Multi-ref images → continue numbering (role: reference_image)
 *   4. Multi-ref videos (role: reference_video)
 *   5. Multi-ref audios (role: reference_audio)
 *   6. Final text block
 */
function buildPayload(selection, model) {
  const content = [];

  // 1. First frame
  if (selection.firstFrame?.dataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: selection.firstFrame.dataUrl },
      role: 'reference_image',
    });
  }

  // 2. Last frame
  if (selection.lastFrame?.dataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: selection.lastFrame.dataUrl },
      role: 'reference_image',
    });
  }

  // 3. Multi-ref images
  (selection.refImages || []).forEach((img) => {
    if (img?.dataUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: img.dataUrl },
        role: 'reference_image',
      });
    }
  });

  // 4. Multi-ref videos
  (selection.refVideos || []).forEach((vid) => {
    if (vid?.dataUrl) {
      content.push({
        type: 'video_url',
        video_url: { url: vid.dataUrl },
        role: 'reference_video',
      });
    }
  });

  // 5. Multi-ref audios
  (selection.refAudios || []).forEach((aud) => {
    if (aud?.dataUrl) {
      content.push({
        type: 'audio_url',
        audio_url: { url: aud.dataUrl },
        role: 'reference_audio',
      });
    }
  });

  // 6. Build text — auto-prepend frame instructions
  let textPart = compilePromptText(selection);
  const frameHints = [];
  if (selection.firstFrame?.dataUrl && selection.lastFrame?.dataUrl) {
    frameHints.push('The video starts on Image 1 and ends on Image 2.');
  } else if (selection.firstFrame?.dataUrl) {
    frameHints.push('The video starts on Image 1.');
  }
  if (frameHints.length) {
    textPart = frameHints.join(' ') + ' ' + textPart;
  }

  content.push({ type: 'text', text: textPart });

  // Top-level technical fields per official spec
  const payload = {
    model,
    content,
    ratio: selection.aspectRatio?.value || '16:9',
    duration: Number(selection.duration) || 5,
    camerafixed: selection.cameraMotion?.id === 'static_lockoff',
    watermark: false,
  };

  // Resolution: include only if specified (some models have it implicit)
  if (selection.resolution?.value) {
    payload.resolution = selection.resolution.value;
  }

  // generate_audio: only meaningful on Pro models
  // (Fast doesn't generate audio regardless of this flag)
  const isPro = model && !model.includes('fast');
  if (isPro) {
    payload.generate_audio = selection.soundOn !== false;
  }

  return { payload, compiledText: textPart };
}

// ═════════════════════════════════════════════════════════════
// Asset upload (returns base64 data URL — kept in browser memory only)
// ═════════════════════════════════════════════════════════════

// Note: actually the upload happens entirely client-side — this endpoint exists
// only as a sanity validator for size/type. The frontend converts to base64 directly
// because round-tripping a file through the server adds nothing.

// ═════════════════════════════════════════════════════════════
// Other API endpoints
// ═════════════════════════════════════════════════════════════

app.get('/api/presets', (req, res) => {
  const presets = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'presets.json'), 'utf-8')
  );
  res.json(presets);
});

app.post('/api/compile-prompt', (req, res) => {
  const model = req.body?.model || DEFAULT_MODEL;
  const { compiledText } = buildPayload(req.body, model);
  res.json({ prompt: compiledText });
});

app.get('/api/health', (req, res) => {
  const { active, keys } = loadKeys();
  const activeKey = active ? keys.find((k) => k.id === active) : null;
  const endpointId = activeKey?.endpoint || DEFAULT_ENDPOINT;
  res.json({
    ok: true,
    keysCount: keys.length,
    activeKey: !!active,
    activeEndpoint: endpointId,
    activeEndpointLabel: ENDPOINTS[endpointId]?.label,
    defaultModel: DEFAULT_MODEL,
  });
});

// ─── Debug snapshot (safe to expose: values are masked) ──────
app.get('/api/debug', (req, res) => {
  const { active, keys } = loadKeys();
  const activeKey = active ? keys.find((k) => k.id === active) : null;
  res.json({
    version: 'v1.0',
    keysFile: {
      exists: fs.existsSync(KEYS_FILE),
      path: KEYS_FILE,
      activeId: active,
      activeKeyFound: !!activeKey,
      keysCount: keys.length,
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        valuePreview: maskKey(k.value),
        valueLength: k.value?.length || 0,
        valueStartsWith: k.value?.slice(0, 4) || '',
        endpoint: k.endpoint || '(missing)',
        isActive: k.id === active,
      })),
    },
    activeEndpoint: activeKey
      ? ENDPOINTS[activeKey.endpoint || DEFAULT_ENDPOINT]
      : null,
    endpoints: ENDPOINTS,
    defaultModel: DEFAULT_MODEL,
    nodeVersion: process.version,
  });
});

// ═════════════════════════════════════════════════════════════
// SEEDREAM · Image generation (for trusted character assets)
// ═════════════════════════════════════════════════════════════
// Generated images are automatically "trusted" by Seedance for the next
// 30 days under the same account. This is the official workaround for
// the real-face filter. See:
// https://docs.byteplus.com/en/docs/ModelArk/2291680
//
// Endpoint: POST /images/generations
// Body: { model, prompt, size, response_format: "url", watermark: false }
// Response: { data: [{ url, b64_json? }] }
// ─────────────────────────────────────────────────────────────

// In-memory tracker for trusted assets generated this session.
// Each entry: { id, url, prompt, model, seed?, createdAt, expiresAt }
const _trustedAssets = [];

app.get('/api/seedream/assets', (req, res) => {
  // Filter expired (>30 days)
  const now = Date.now();
  const valid = _trustedAssets.filter((a) => a.expiresAt > now);
  res.json({ assets: valid });
});

app.post('/api/seedream/generate', async (req, res) => {
  try {
    const {
      prompt,
      model = 'seedream-4-0-250828',
      size = '2K',
      seed = null,
      referenceImages = [], // optional: array of dataUrls or asset:// URIs
    } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    // Build payload following the official spec.
    const payload = {
      model,
      prompt: prompt.trim(),
      size,
      response_format: 'url',
      watermark: false,
    };
    if (seed !== null && seed !== undefined && seed !== '') {
      payload.seed = Number(seed);
    }
    // Multi-image input (image-to-image / multi-reference)
    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
      // Seedream accepts a single image string OR an array of images.
      // We pass an array; if there's only one, that still works.
      payload.image = referenceImages.length === 1
        ? referenceImages[0]
        : referenceImages;
    }

    console.log(`[seedream] model=${model} size=${size} seed=${seed || 'random'} refs=${referenceImages.length}`);

    const resp = await arkRequest('/images/generations', {
      method: 'POST',
      body: payload,
    });

    // Standard OpenAI-compatible response: { data: [{ url }] }
    const url = resp?.data?.[0]?.url;
    if (!url) {
      return res.status(500).json({
        error: 'Seedream returned no image URL.',
        raw: resp,
      });
    }

    // Track as trusted asset (30-day window starts now)
    const now = Date.now();
    const asset = {
      id: crypto.randomBytes(6).toString('hex'),
      url,
      prompt: prompt.trim(),
      model,
      seed: payload.seed ?? null,
      size,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    };
    _trustedAssets.unshift(asset);
    // Cap to last 50 in memory
    if (_trustedAssets.length > 50) _trustedAssets.length = 50;

    res.json({ ...asset, raw: resp });
  } catch (err) {
    console.error('\n╔════════════════════════════════════════════════════════════');
    console.error('║  [seedream] FAILED');
    console.error('╠════════════════════════════════════════════════════════════');
    console.error('║  ' + err.message);
    console.error('╚════════════════════════════════════════════════════════════\n');
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// ASSETS API · Private Virtual Portrait Library
// ─────────────────────────────────────────────────────────────
// Uses AK/SK signed requests (NOT Bearer API key) to talk to
// open.byteplusapi.com — the BytePlus management plane endpoint.
// Documented at: https://docs.byteplus.com/en/docs/ModelArk/2333565
//
// Why a separate auth scheme? The Assets API is part of the
// management plane (account-level resources), while inference
// (Seedance, Seedream) is on the inference plane with simple
// Bearer auth. This is consistent with how AWS works too.
// ═════════════════════════════════════════════════════════════

const ASSETS_REGION = 'ap-southeast-1';
const ASSETS_SERVICE = 'ark';
const ASSETS_VERSION = '2024-01-01';

function requireAkSk(req, res) {
  const active = getActiveKey();
  if (!active) {
    res.status(400).json({ error: 'No active API key.' });
    return null;
  }
  if (!active.ak || !active.sk) {
    res.status(400).json({
      error: 'Active key has no AK/SK configured. Add them in the API panel to use the Assets API.',
    });
    return null;
  }
  return active;
}

async function callAssetsApi(action, body, active) {
  return signedFetch({
    ak: active.ak,
    sk: active.sk,
    region: ASSETS_REGION,
    service: ASSETS_SERVICE,
    action,
    version: ASSETS_VERSION,
    body,
  });
}

// ─── Create asset group ──────────────────────────────────────
app.post('/api/assets/groups', async (req, res) => {
  const active = requireAkSk(req, res);
  if (!active) return;
  try {
    const { name, description, projectName = 'default' } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Group name required.' });

    const result = await callAssetsApi('CreateAssetGroup', {
      Name: name.trim(),
      Description: description?.trim() || '',
      GroupType: 'AIGC',
      ProjectName: projectName,
    }, active);

    console.log(`[assets] created group "${name}" → ${result.Id}`);
    res.json({ id: result.Id, name, description, projectName });
  } catch (err) {
    console.error('[assets:createGroup]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── List asset groups ───────────────────────────────────────
app.get('/api/assets/groups', async (req, res) => {
  const active = requireAkSk(req, res);
  if (!active) return;
  try {
    const result = await callAssetsApi('ListAssetGroups', {
      Filter: { GroupType: 'AIGC' },
      PageNumber: 1,
      PageSize: 50,
    }, active);
    res.json({ groups: result.Items || [], total: result.TotalCount || 0 });
  } catch (err) {
    console.error('[assets:listGroups]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── Create asset (upload) ───────────────────────────────────
app.post('/api/assets', async (req, res) => {
  const active = requireAkSk(req, res);
  if (!active) return;
  try {
    const {
      groupId,
      url,
      name = '',
      assetType = 'Image',
      moderationStrategy = null,  // null = default (Pre-filter on); 'Skip' requires Secure Mode off
      projectName = 'default',
    } = req.body || {};

    if (!groupId) return res.status(400).json({ error: 'groupId required.' });
    if (!url) return res.status(400).json({ error: 'url required (publicly accessible image URL).' });

    const payload = {
      GroupId: groupId,
      URL: url,
      AssetType: assetType,
      Name: name,
      ProjectName: projectName,
    };
    if (moderationStrategy === 'Skip') {
      payload.Moderation = { Strategy: 'Skip' };
    }

    const result = await callAssetsApi('CreateAsset', payload, active);
    console.log(`[assets] uploaded asset "${name || '(unnamed)'}" → ${result.Id} (group ${groupId})`);

    res.json({ id: result.Id, groupId, name, status: 'Processing', assetType });
  } catch (err) {
    console.error('[assets:create]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── Get single asset (for polling status) ───────────────────
app.get('/api/assets/:id', async (req, res) => {
  const active = requireAkSk(req, res);
  if (!active) return;
  try {
    const result = await callAssetsApi('GetAsset', {
      Id: req.params.id,
      ProjectName: req.query.projectName || 'default',
    }, active);
    res.json(result);
  } catch (err) {
    console.error('[assets:get]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── List assets in a group ──────────────────────────────────
app.get('/api/assets', async (req, res) => {
  const active = requireAkSk(req, res);
  if (!active) return;
  try {
    const filter = { GroupType: 'AIGC' };
    if (req.query.groupId) filter.GroupIds = [req.query.groupId];
    if (req.query.statuses) filter.Statuses = req.query.statuses.split(',');

    const result = await callAssetsApi('ListAssets', {
      Filter: filter,
      PageNumber: 1,
      PageSize: 100,
      SortBy: 'CreateTime',
      SortOrder: 'Desc',
    }, active);

    res.json({ assets: result.Items || [], total: result.TotalCount || 0 });
  } catch (err) {
    console.error('[assets:list]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── Delete asset ────────────────────────────────────────────
app.delete('/api/assets/:id', async (req, res) => {
  const active = requireAkSk(req, res);
  if (!active) return;
  try {
    await callAssetsApi('DeleteAsset', {
      Id: req.params.id,
      ProjectName: req.query.projectName || 'default',
    }, active);
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    console.error('[assets:delete]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── Submit generation task ──────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const selection = req.body;
    const model = selection.model || DEFAULT_MODEL;
    const { payload, compiledText } = buildPayload(selection, model);

    // Log un resumen útil sin volcar el base64 entero
    const summary = payload.content.map((c) => {
      if (c.type === 'text') return `text(${c.text.length} chars)`;
      const url = c.image_url?.url || c.video_url?.url || c.audio_url?.url || '';
      const size = url.startsWith('data:') ? `~${Math.round(url.length / 1024)}KB` : 'url';
      return `${c.type}[${c.role || '-'}](${size})`;
    }).join(', ');
    console.log(`[generate] model=${model} ratio=${payload.ratio} duration=${payload.duration} content=[${summary}]`);

    const resp = await arkRequest('/contents/generations/tasks', {
      method: 'POST',
      body: payload,
    });

    const taskId = resp?.id || resp?.task_id;
    if (!taskId) {
      return res.status(500).json({
        error: 'No task ID returned from BytePlus',
        raw: resp,
      });
    }

    res.json({ taskId, prompt: compiledText, model });
  } catch (err) {
    console.error('\n╔════════════════════════════════════════════════════════════');
    console.error('║  [generate] FAILED');
    console.error('╠════════════════════════════════════════════════════════════');
    console.error('║  ' + err.message);
    console.error('╚════════════════════════════════════════════════════════════\n');
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: find video URL anywhere in the response object ──
// BytePlus returns the URL in different shapes depending on model/version.
// We search recursively for any string value that looks like a video URL.
function findVideoUrl(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'string') {
    // Heuristic: it's a video URL if it's an http URL ending in .mp4
    // or contains "video" / known BytePlus storage patterns
    if (/^https?:\/\//.test(obj) && (
      /\.mp4(\?|$)/i.test(obj) ||
      /tos-/.test(obj) ||
      /bytepluses\.com|volces\.com|byteimg\.com/.test(obj)
    )) {
      return obj;
    }
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findVideoUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    // Direct hits on known keys first
    const directKeys = ['video_url', 'videoUrl', 'url', 'video'];
    for (const k of directKeys) {
      if (typeof obj[k] === 'string' && /^https?:\/\//.test(obj[k])) {
        return obj[k];
      }
    }
    // Recurse
    for (const k of Object.keys(obj)) {
      const found = findVideoUrl(obj[k], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// ─── Poll task status ────────────────────────────────────────
// Track which task IDs we've already fully logged the response for
// (to avoid spamming the console on every poll)
const _loggedTasks = new Set();

app.get('/api/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const resp = await arkRequest(`/contents/generations/tasks/${taskId}`);

    const status = resp?.status || 'unknown';
    const videoUrl = findVideoUrl(resp);

    // First time we see succeeded for this task: dump the whole response
    // so the user can see where the URL really lives
    if (status === 'succeeded' && !_loggedTasks.has(taskId)) {
      _loggedTasks.add(taskId);
      console.log('\n╔════════════════════════════════════════════════════════════');
      console.log(`║  [status] Task ${taskId} succeeded`);
      console.log(`║  videoUrl found: ${videoUrl || '(NOT FOUND)'}`);
      console.log('║  Full response:');
      console.log('║  ' + JSON.stringify(resp, null, 2).split('\n').join('\n║  '));
      console.log('╚════════════════════════════════════════════════════════════\n');
    }

    if (status === 'succeeded' && videoUrl) {
      const localName = `seedance_${Date.now()}_${taskId.slice(-8)}.mp4`;
      const localPath = path.join(__dirname, 'outputs', localName);
      try {
        const videoRes = await fetch(videoUrl);
        const buf = Buffer.from(await videoRes.arrayBuffer());
        fs.writeFileSync(localPath, buf);

        return res.json({
          status,
          videoUrl,
          localUrl: `/outputs/${localName}`,
          raw: resp,
        });
      } catch (e) {
        return res.json({
          status,
          videoUrl,
          localUrl: null,
          warn: `Could not save locally: ${e.message}`,
        });
      }
    }

    // If succeeded but we couldn't extract a URL, surface that as an error
    // so the frontend stops polling and shows the raw response.
    if (status === 'succeeded' && !videoUrl) {
      return res.json({
        status: 'succeeded_no_url',
        raw: resp,
        error: 'Job succeeded but no video URL was found in the response. See server console for full payload.',
      });
    }

    res.json({ status, raw: resp });
  } catch (err) {
    console.error('[status]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const resp = await arkRequest(`/contents/generations/tasks/${taskId}`, {
      method: 'DELETE',
    });
    res.json(resp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('\n┌─────────────────────────────────────────────────┐');
  console.log('│  SEEDANCE STUDIO v1.0 · Dead Camera Studios     │');
  console.log('│  Reinvented Cinema · Absolute Creative Control  │');
  console.log('└─────────────────────────────────────────────────┘');
  console.log(`\n  ▸ http://localhost:${PORT}`);
  console.log(`  ▸ Engine: ModelArk (multi-endpoint)`);
  console.log(`  ▸ Endpoints available:`);
  Object.entries(ENDPOINTS).forEach(([id, ep]) => {
    console.log(`      · ${id} — ${ep.label}`);
  });
  console.log(`  ▸ Default model: ${DEFAULT_MODEL}`);

  const { keys, active } = loadKeys();
  if (!keys.length) {
    console.log('\n  ⚠️  No API keys yet.');
    console.log('     Add one from the top-right panel in the UI.');
    console.log('     Get yours at: https://console.byteplus.com/ark/region:ark+ap-southeast-1/apikey\n');
  } else {
    console.log(`  ✓ ${keys.length} key(s) loaded · active: ${keys.find(k=>k.id===active)?.name || 'none'}\n`);
  }
});
