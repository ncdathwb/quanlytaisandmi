const { getList, setList, paginate, ok, handleCors } = require('./_lib');

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    let hists = await getList('history');
    // Sort newest first
    hists = [...hists].reverse();
    const action = url.searchParams.get('action');
    const employeeId = url.searchParams.get('employeeId');
    const assetSearch = url.searchParams.get('assetSearch');
    if (action && action !== 'all') hists = hists.filter(h => h.action === action);
    if (employeeId && employeeId !== 'all') hists = hists.filter(h => h.employeeId === employeeId);
    if (assetSearch) hists = hists.filter(h => h.assetId && h.assetId.toLowerCase().includes(assetSearch.toLowerCase()));
    return ok(paginate(hists, url.searchParams.get('page'), url.searchParams.get('limit')));
  }

  if (req.method === 'POST') {
    // Log a history entry — typically called internally, but exposed for edge cases
    const body = await new Response(req.body).json().catch(() => ({}));
    const hists = await getList('history');
    const id = 'HIS' + String(hists.length + 1).padStart(3, '0');
    const entry = { id, ...body, timestamp: body.timestamp || new Date().toISOString() };
    hists.push(entry);
    await setList('history', hists);
    return ok(entry);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
};
