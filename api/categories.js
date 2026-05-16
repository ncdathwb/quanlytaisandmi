const { getList, setList, paginate, nextId, ok, created, bad, notFound, handleCors, parseBody } = require('./_lib');
const BANNED = ['ADM','SYS','TMP','DEL','ALL','NEW','OLD','TEST'];

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const cats = await getList('categories');
    const filtered = cats.filter(c => {
      if (url.searchParams.get('active') === '1' && !c.isActive) return false;
      return true;
    });
    return ok(paginate(filtered, url.searchParams.get('page'), url.searchParams.get('limit')));
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { name, prefix } = body;
    if (!name || !name.trim()) return bad('Tên danh mục không được rỗng');
    const pf = (prefix || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(pf)) return bad('Prefix phải là 3 chữ cái in hoa');
    if (BANNED.includes(pf)) return bad(`Prefix bị cấm: ${BANNED.join(', ')}`);
    const cats = await getList('categories');
    if (cats.find(c => c.name.toLowerCase() === name.trim().toLowerCase())) return bad('Tên danh mục đã tồn tại');
    if (cats.find(c => c.prefix === pf)) return bad('Prefix đã tồn tại');
    const id = nextId(cats, 'CAT', 3);
    const cat = { id, name: name.trim(), prefix: pf, isActive: true };
    cats.push(cat);
    await setList('categories', cats);
    return created(cat);
  }

  if (req.method === 'PUT') {
    const body = await parseBody(req);
    const { id, name, prefix, isActive } = body;
    if (!id) return bad('Thiếu id');
    const cats = await getList('categories');
    const idx = cats.findIndex(c => c.id === id);
    if (idx === -1) return notFound('Danh mục không tồn tại');
    if (name !== undefined) {
      if (!name.trim()) return bad('Tên không được rỗng');
      if (cats.find(c => c.name.toLowerCase() === name.trim().toLowerCase() && c.id !== id)) return bad('Tên danh mục đã tồn tại');
      cats[idx].name = name.trim();
    }
    if (prefix !== undefined) {
      const pf = prefix.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(pf)) return bad('Prefix phải là 3 chữ in hoa');
      if (BANNED.includes(pf)) return bad('Prefix bị cấm');
      if (cats.find(c => c.prefix === pf && c.id !== id)) return bad('Prefix đã tồn tại');
      const oldPf = cats[idx].prefix;
      cats[idx].prefix = pf;

      // Cascade rename: update all assetIds in other collections
      if (oldPf !== pf) {
        async function cascadeRename(key) {
          const list = await getList(key);
          let changed = false;
          list.forEach(item => {
            ['assetId', 'fulfilledAssetId'].forEach(field => {
              if (item[field] && item[field].startsWith(oldPf)) {
                item[field] = pf + item[field].substring(3);
                changed = true;
              }
            });
          });
          if (changed) await setList(key, list);
        }
        await cascadeRename('assets');
        await cascadeRename('assignments');
        await cascadeRename('requests');
        await cascadeRename('history');
      }
    }
    if (isActive !== undefined) cats[idx].isActive = !!isActive;
    await setList('categories', cats);
    return ok(cats[idx]);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
};
