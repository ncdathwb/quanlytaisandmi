const { Redis } = require('@upstash/redis');
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.KV_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

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
  const raw = await redis.get(key);
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch(e) { return []; }
  }
  return raw;
}

async function setList(key, data) {
  await redis.set(key, JSON.stringify(data));
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
