const { getList, setList, paginate, nextId, ok, created, bad, notFound, handleCors, parseBody } = require('./_lib');

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const asgs = await getList('assignments');
    let filtered = asgs;
    const empId = url.searchParams.get('employeeId');
    const assetId = url.searchParams.get('assetId');
    if (empId) filtered = filtered.filter(a => a.employeeId === empId);
    if (assetId) filtered = filtered.filter(a => a.assetId === assetId);
    return ok(paginate(filtered, url.searchParams.get('page'), url.searchParams.get('limit')));
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { assetId, employeeId, assignedDate, reason } = body;
    if (!assetId || !employeeId) return bad('Thiếu assetId hoặc employeeId');
    if (!reason || !reason.trim()) return bad('Vui lòng nhập lý do cấp phát');

    const asts = await getList('assets');
    const asset = asts.find(a => a.assetId === assetId);
    if (!asset) return notFound('Tài sản không tồn tại');
    if (asset.quantity <= 0) return bad('Tài sản đã hết hàng');

    const asgs = await getList('assignments');
    if (asgs.find(a => a.assetId === assetId && a.employeeId === employeeId)) {
      return bad('Nhân viên này đã mượn tài sản này rồi');
    }

    const id = nextId(asgs, 'ASG', 3);
    const asg = { id, assetId, employeeId, assignedDate: assignedDate || new Date().toISOString().slice(0, 10), reason: reason.trim() };
    asgs.push(asg);

    asset.quantity -= 1;
    if (asset.quantity > 0) asset.status = 'in_stock';
    else asset.status = 'assigned';

    // Log history
    const hists = await getList('history');
    const emps = await getList('employees');
    const emp = emps.find(e => e.id === employeeId);
    hists.push({
      id: nextId(hists, 'HIS', 3),
      action: 'assign',
      assetId,
      employeeId,
      timestamp: new Date().toISOString(),
      performedBy: body.performedBy || 'admin',
      note: `Cấp phát cho ${emp ? emp.name : employeeId}`
    });

    await setList('assignments', asgs);
    await setList('assets', asts);
    await setList('history', hists);
    return created(asg);
  }

  // DELETE: Revoke an assignment
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const asgId = url.searchParams.get('id');
    const revokeAll = url.searchParams.get('revokeAll');
    const performedBy = url.searchParams.get('performedBy') || 'admin';

    if (revokeAll) {
      // Revoke all assignments for an employee
      const asgs = await getList('assignments');
      const asts = await getList('assets');
      const hists = await getList('history');
      const emps = await getList('employees');
      const emp = emps.find(e => e.id === revokeAll);
      if (!emp) return notFound('Nhân viên không tồn tại');

      const empAsgs = asgs.filter(a => a.employeeId === revokeAll);
      for (const asg of empAsgs) {
        const asset = asts.find(a => a.assetId === asg.assetId);
        if (asset) { asset.quantity += 1; asset.status = 'in_stock'; }
        hists.push({
          id: nextId(hists, 'HIS', 3),
          action: 'revoke_all',
          assetId: null,
          employeeId: revokeAll,
          timestamp: new Date().toISOString(),
          performedBy,
          note: `${performedBy === 'system' ? 'Hệ thống' : 'Admin'} thu hồi tất cả tài sản của ${emp.name}`
        });
      }
      const remaining = asgs.filter(a => a.employeeId !== revokeAll);
      await setList('assignments', remaining);
      await setList('assets', asts);
      await setList('history', hists);
      return ok({ revoked: empAsgs.length });
    }

    if (!asgId) return bad('Thiếu id assignment');
    const asgs = await getList('assignments');
    const idx = asgs.findIndex(a => a.id === asgId);
    if (idx === -1) return notFound('Assignment không tồn tại');
    const asg = asgs[idx];

    const asts = await getList('assets');
    const asset = asts.find(a => a.assetId === asg.assetId);
    if (asset) { asset.quantity += 1; asset.status = 'in_stock'; }

    // Log history
    const hists = await getList('history');
    hists.push({
      id: nextId(hists, 'HIS', 3),
      action: 'revoke',
      assetId: asg.assetId,
      employeeId: asg.employeeId,
      timestamp: new Date().toISOString(),
      performedBy,
      note: 'Admin thu hồi tài sản'
    });

    asgs.splice(idx, 1);
    await setList('assignments', asgs);
    await setList('assets', asts);
    await setList('history', hists);
    return ok({ revoked: asg });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
};
