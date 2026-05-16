const { getList, setList, paginate, ok, created, bad, notFound, handleCors, parseBody } = require('./_lib');

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const emps = await getList('employees');
    let filtered = emps;
    const status = url.searchParams.get('status');
    if (status && status !== 'all') filtered = emps.filter(e => e.status === status);
    return ok(paginate(filtered, url.searchParams.get('page'), url.searchParams.get('limit')));
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { id, name, team } = body;
    if (!/^\d{4}$/.test(id)) return bad('Mã NV phải là 4 chữ số');
    if (!name || !name.trim()) return bad('Tên không được rỗng');
    const emps = await getList('employees');
    if (emps.find(e => e.id === id)) return bad('Mã NV đã tồn tại');
    const emp = { id, name: name.trim(), team: team || 'York', status: 'active' };
    emps.push(emp);
    await setList('employees', emps);
    return created(emp);
  }

  if (req.method === 'PUT') {
    const body = await parseBody(req);
    const { id, name, team, status } = body;
    if (!id) return bad('Thiếu id');
    const emps = await getList('employees');
    const idx = emps.findIndex(e => e.id === id);
    if (idx === -1) return notFound('Nhân viên không tồn tại');
    if (name !== undefined) {
      if (!name.trim()) return bad('Tên không được rỗng');
      emps[idx].name = name.trim();
    }
    if (team !== undefined) emps[idx].team = team;
    if (status !== undefined) {
      const oldStatus = emps[idx].status;
      emps[idx].status = status;
      // Auto-revoke on resignation
      if (oldStatus === 'active' && status === 'resigned') {
        const asgs = await getList('assignments');
        const asts = await getList('assets');
        const hists = await getList('history');
        const empAsgs = asgs.filter(a => a.employeeId === id);
        for (const asg of empAsgs) {
          const asset = asts.find(a => a.assetId === asg.assetId);
          if (asset) asset.quantity += 1;
          hists.push({
            id: 'HIS' + String(hists.length + 1).padStart(3, '0'),
            action: 'auto_revoke',
            assetId: asg.assetId,
            employeeId: id,
            timestamp: new Date().toISOString(),
            performedBy: 'system',
            note: 'Thu hồi do nhân viên nghỉ việc'
          });
        }
        const remaining = asgs.filter(a => a.employeeId !== id);
        await setList('assignments', remaining);
        await setList('assets', asts);
        await setList('history', hists);
      }
    }
    await setList('employees', emps);
    return ok(emps[idx]);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
};
