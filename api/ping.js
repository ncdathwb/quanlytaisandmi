module.exports = async function handler(req) {
  return new Response(JSON.stringify({
    ok: true,
    env: {
      has_upstash_url: !!process.env.UPSTASH_REDIS_REST_URL,
      has_upstash_token: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      has_kv_url: !!process.env.KV_REST_API_URL,
      has_kv_token: !!process.env.KV_REST_API_TOKEN,
      has_kv: !!process.env.KV_URL,
      node_version: process.version
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};
