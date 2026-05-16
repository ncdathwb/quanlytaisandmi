const { getList, setList, paginate, nextId, ok, created, bad, notFound, handleCors, parseBody } = require('./_lib');

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const reqs = await getList('requests');
    let filtered = reqs;
    const status = url.searchParams.get('status');
    const employeeId = url.searchParams.get('employeeId');
    if (status && status !== 'all') filtered = filtered.filter(r => r.status === status);
    if (employeeId) filtered = filtered.filter(r => r.employeeId === employeeId);
    return ok(paginate(filtered, url.searchParams.get('page'), url.searchParams.get('limit')));
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { employeeId, type, assetId, categoryId, description, reason, performedBy } = body;
    if (!employeeId) return bad('Thiếu employeeId');
    if (!reason || !reason.trim()) return bad('Vui lòng nhập lý do');
    if (type === 'existing' && !assetId) return bad('Vui lòng chọn tài sản');
    if (type === 'new') {
      if (!categoryId) return bad('Vui lòng chọn danh mục');
      if (!description || !description.trim()) return bad('Vui lòng nhập mô tả');
    }
    const reqs = await getList('requests');
    const id = nextId(reqs, 'REQ', 3);
    const r = {
      requestId: id, employeeId, type,
      assetId: type === 'existing' ? assetId : null,
      categoryId: type === 'new' ? categoryId : null,
      description: type === 'new' ? description.trim() : null,
      reason: reason.trim(),
      date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      adminNote: null,
      fulfilledAssetId: null
    };
    reqs.push(r);
    await setList('requests', reqs);

    // Log history
    const hists = await getList('history');
    hists.push({
      id: nextId(hists, 'HIS', 3),
      action: 'approve_request',
      assetId: null,
      employeeId,
      timestamp: new Date().toISOString(),
      performedBy: performedBy || 'employee',
      note: `Tạo yêu cầu ${id} (${type})`
    });
    await setList('history', hists);
    return created(r);
  }

  if (req.method === 'PUT') {
    const body = await parseBody(req);
    const { requestId, status, adminNote, fulfilledAssetId, performedBy } = body;
    if (!requestId) return bad('Thiếu requestId');
    const reqs = await getList('requests');
    const idx = reqs.findIndex(r => r.requestId === requestId);
    if (idx === -1) return notFound('Yêu cầu không tồn tại');
    const r = reqs[idx];

    if (status === 'approved') {
      r.status = 'approved';
      if (adminNote) r.adminNote = adminNote;
      const hists = await getList('history');
      hists.push({
        id: nextId(hists, 'HIS', 3),
        action: 'approve_request',
        assetId: null,
        employeeId: r.employeeId,
        timestamp: new Date().toISOString(),
        performedBy: performedBy || 'admin',
        note: `Duyệt yêu cầu ${requestId}`
      });
      await setList('history', hists);
    } else if (status === 'rejected') {
      if (!adminNote || !adminNote.trim()) return bad('Phải nhập lý do từ chối');
      r.status = 'rejected';
      r.adminNote = adminNote.trim();
      const hists = await getList('history');
      hists.push({
        id: nextId(hists, 'HIS', 3),
        action: 'reject_request',
        assetId: r.assetId,
        employeeId: r.employeeId,
        timestamp: new Date().toISOString(),
        performedBy: performedBy || 'admin',
        note: `Từ chối yêu cầu ${requestId}: ${adminNote.trim()}`
      });
      await setList('history', hists);
    } else if (status === 'fulfilled') {
      r.status = 'fulfilled';
      r.fulfilledAssetId = fulfilledAssetId || r.assetId || null;
      // If type=existing, create assignment automatically
      if (r.type === 'existing' && r.assetId) {
        const asts = await getList('assets');
        const asset = asts.find(a => a.assetId === r.assetId);
        if (!asset || asset.quantity <= 0) return bad('Tài sản đã hết hàng');

        const asgs = await getList('assignments');
        if (asgs.find(a => a.assetId === r.assetId && a.employeeId === r.employeeId)) {
          return bad('Nhân viên đã mượn tài sản này rồi');
        }

        asgs.push({
          id: nextId(asgs, 'ASG', 3),
          assetId: r.assetId,
          employeeId: r.employeeId,
          assignedDate: new Date().toISOString().slice(0, 10),
          reason: r.reason
        });
        asset.quantity -= 1;
        if (asset.quantity > 0) asset.status = 'in_stock';
        else asset.status = 'assigned';
        await setList('assignments', asgs);
        await setList('assets', asts);
      }
      const hists = await getList('history');
      hists.push({
        id: nextId(hists, 'HIS', 3),
        action: 'fulfill_request',
        assetId: r.fulfilledAssetId || r.assetId,
        employeeId: r.employeeId,
        timestamp: new Date().toISOString(),
        performedBy: performedBy || 'admin',
        note: `Fulfill yêu cầu ${requestId}`
      });
      await setList('history', hists);
    }

    await setList('requests', reqs);
    return ok(r);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
};
