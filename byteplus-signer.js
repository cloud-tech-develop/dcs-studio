// ═══════════════════════════════════════════════════════════════
// BytePlus Signature V4 (AK/SK) signer
// ───────────────────────────────────────────────────────────────
// BytePlus uses a signing scheme almost identical to AWS Sigv4 with
// minor differences (different "request" terminator, different
// scope format). This module implements it from scratch since
// there's no official Node.js SDK for the Assets API.
//
// Reference: https://docs.byteplus.com/en/docs/byteplus-platform/docs-signature-v4
//
// Usage:
//   const { signedFetch } = require('./byteplus-signer.js');
//   const resp = await signedFetch({
//     ak: 'AKLT...',
//     sk: '...',
//     region: 'ap-southeast-1',
//     service: 'ark',
//     action: 'CreateAssetGroup',
//     version: '2024-01-01',
//     body: { Name: 'Dixie', Description: '...' },
//   });
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto';

const HOST = 'open.byteplusapi.com';

function hmac(key, value, encoding = null) {
  return crypto.createHmac('sha256', key).update(value, 'utf-8').digest(encoding);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf-8').digest('hex');
}

function getDerivedKey(secret, date, region, service) {
  const kDate = hmac(secret, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'request');
  return kSigning;
}

function uriEncode(s, encodeSlash = true) {
  // RFC 3986
  const encoded = encodeURIComponent(s)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return encodeSlash ? encoded : encoded.replace(/%2F/g, '/');
}

function buildCanonicalQuery(params) {
  // Sort by key, encode k=v pairs
  const keys = Object.keys(params).sort();
  return keys
    .map((k) => `${uriEncode(k)}=${uriEncode(String(params[k]))}`)
    .join('&');
}

/**
 * Sign and execute an HTTP request to BytePlus OpenAPI.
 *
 * @param {Object} opts
 * @param {string} opts.ak       - Access Key ID
 * @param {string} opts.sk       - Secret Key
 * @param {string} opts.region   - e.g. 'ap-southeast-1'
 * @param {string} opts.service  - e.g. 'ark'
 * @param {string} opts.action   - e.g. 'CreateAssetGroup'
 * @param {string} opts.version  - e.g. '2024-01-01'
 * @param {Object} [opts.body]   - JSON body (for POST)
 * @param {string} [opts.method] - default POST
 * @returns {Promise<Object>}    - { status, body }
 */
export async function signedFetch({
  ak,
  sk,
  region,
  service,
  action,
  version,
  body = null,
  method = 'POST',
}) {
  if (!ak || !sk) {
    throw new Error('AK and SK are both required for signed requests.');
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  // ─── 1. Canonical request ───────────────────────────────
  const canonicalUri = '/';
  const queryParams = { Action: action, Version: version };
  const canonicalQuery = buildCanonicalQuery(queryParams);

  const bodyStr = body ? JSON.stringify(body) : '';
  const payloadHash = sha256Hex(bodyStr);

  const headers = {
    'content-type': 'application/json',
    'host': HOST,
    'x-date': amzDate,
    'x-content-sha256': payloadHash,
  };
  const signedHeadersList = Object.keys(headers).sort();
  const canonicalHeaders =
    signedHeadersList.map((h) => `${h}:${headers[h]}`).join('\n') + '\n';
  const signedHeaders = signedHeadersList.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // ─── 2. String to sign ──────────────────────────────────
  const algorithm = 'HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // ─── 3. Signature ───────────────────────────────────────
  const signingKey = getDerivedKey(sk, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');

  // ─── 4. Authorization header ────────────────────────────
  const authHeader =
    `${algorithm} Credential=${ak}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // ─── 5. Execute ─────────────────────────────────────────
  const url = `https://${HOST}/?${canonicalQuery}`;
  const reqHeaders = {
    'Content-Type': 'application/json',
    'Host': HOST,
    'X-Date': amzDate,
    'X-Content-Sha256': payloadHash,
    'Authorization': authHeader,
  };

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: bodyStr || undefined,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const errMsg =
      json?.ResponseMetadata?.Error?.Message ||
      json?.Error?.Message ||
      json?.message ||
      `BytePlus signed request failed [${res.status}]: ${text.slice(0, 400)}`;
    const err = new Error(errMsg);
    err.statusCode = res.status;
    err.raw = json;
    throw err;
  }

  // BytePlus wraps the actual response inside Result
  return json?.Result ?? json;
}
