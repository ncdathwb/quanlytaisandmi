// Resolve Redis REST URL & token from any env var naming convention
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
  || process.env.STORAGE_UPSTASH_REDIS_REST_URL
  || process.env.KV_REST_API_URL
  || process.env.KV_URL
  || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
  || process.env.STORAGE_UPSTASH_REDIS_REST_TOKEN
  || process.env.KV_REST_API_TOKEN
  || '';

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  if (!res.ok) throw new Error(`Redis GET failed: ${res.status}`);
  const data = await res.json();
  return data.result;
}

async function redisSet(key, value) {
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'text/plain'
    },
    body: String(value)
  });
  if (!res.ok) throw new Error(`Redis SET failed: ${res.status}`);
}

const KEYS = {
  categories: 'categories',
  employees: 'employees',
  assets: 'assets',
  assignments: 'assignments',
  requests: 'requests',
  history: 'history',
  teams: 'teams'
};

const DEFAULT_TEAMS = ['York','Kiri','Creek','Como','Bud','BO','Scope'];

async function getList(key) {
  const raw = await redisGet('qlts:' + key);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch(e) { return []; }
}

async function setList(key, data) {
  await redisSet('qlts:' + key, JSON.stringify(data));
}

function paginate(arr, page, limit) {
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const total = arr.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = arr.slice(start, start + limit);
  return { data, total, page, totalPages };
}

function nextId(arr, prefix, len) {
  let max = 0;
  arr.forEach(x => {
    const m = parseInt(String(x.id).replace(prefix, ''));
    if (m > max) max = m;
  });
  return prefix + String(max + 1).padStart(len, '0');
}

function ok(data) { return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders() }); }
function created(data) { return new Response(JSON.stringify(data), { status: 201, headers: corsHeaders() }); }
function bad(msg) { return new Response(JSON.stringify({ error: msg }), { status: 400, headers: corsHeaders() }); }
function notFound(msg) { return new Response(JSON.stringify({ error: msg || 'Not found' }), { status: 404, headers: corsHeaders() }); }
function methodNotAllowed() { return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders() }); }

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

async function handleCors(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return null;
}

async function parseBody(req) {
  try { return await req.json(); } catch(e) { return {}; }
}

module.exports = {
  KEYS, DEFAULT_TEAMS,
  getList, setList, paginate, nextId,
  ok, created, bad, notFound, methodNotAllowed,
  corsHeaders, handleCors, parseBody
};
