const { getList, setList, paginate, ok, created, bad, notFound, handleCors, parseBody } = require('./_lib');

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const asts = await getList('assets');
    let filtered = asts;
    const catId = url.searchParams.get('categoryId');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    if (catId && catId !== 'all') filtered = filtered.filter(a => a.categoryId === catId);
    if (status && status !== 'all') filtered = filtered.filter(a => a.status === status);
    if (search) filtered = filtered.filter(a => a.assetId.toLowerCase().includes(search.toLowerCase()));
    return ok(paginate(filtered, url.searchParams.get('page'), url.searchParams.get('limit')));
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    let { assetId, categoryId, quantity, addedDate, notes } = body;
    const asts = await getList('assets');
    quantity = parseInt(quantity) || 1;
    if (quantity < 1) return bad('Số lượng phải >= 1');

    // Auto-generate ID if blank
    if (!assetId || !assetId.trim()) {
      const cats = await getList('categories');
      const cat = cats.find(c => c.id === categoryId);
      if (!cat) return bad('Danh mục không tồn tại');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      let max = 0;
      asts.forEach(a => {
        if (a.assetId && a.assetId.startsWith(cat.prefix + today)) {
          const n = parseInt(a.assetId.slice(-3));
          if (n > max) max = n;
        }
      });
      if (max >= 999) return bad('Đã đạt tối đa 999 mã trong ngày');
      assetId = cat.prefix + today + String(max + 1).padStart(3, '0');
    } else {
      assetId = assetId.trim();
      if (!/^[A-Z]{3}\d{8}\d{3}$/.test(assetId)) return bad('Mã tài sản không đúng định dạng (PREFIX+YYYYMMDD+XXX)');
      if (asts.find(a => a.assetId === assetId)) return bad('Mã tài sản đã tồn tại');
    }

    const ast = {
      assetId, categoryId, quantity,
      status: 'in_stock',
      addedDate: addedDate || new Date().toISOString().slice(0, 10),
      notes: notes || ''
    };
    asts.push(ast);
    await setList('assets', asts);
    return created(ast);
  }

  if (req.method === 'PUT') {
    const body = await parseBody(req);
    const { assetId, quantity, status, notes } = body;
    if (!assetId) return bad('Thiếu assetId');
    const asts = await getList('assets');
    const idx = asts.findIndex(a => a.assetId === assetId);
    if (idx === -1) return notFound('Tài sản không tồn tại');
    if (quantity !== undefined) {
      const q = parseInt(quantity);
      if (isNaN(q) || q < 0) return bad('Số lượng phải >= 0');
      asts[idx].quantity = q;
    }
    if (status !== undefined) asts[idx].status = status;
    if (notes !== undefined) asts[idx].notes = notes;
    await setList('assets', asts);
    return ok(asts[idx]);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
};
