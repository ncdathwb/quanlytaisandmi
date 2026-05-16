const { getList, setList, DEFAULT_TEAMS, ok, created, bad, notFound, handleCors, parseBody } = require('./_lib');

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;

  if (req.method === 'GET') {
    let teams = await getList('teams');
    if (!teams || teams.length === 0) teams = [...DEFAULT_TEAMS];
    return ok({ teams });
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { name } = body;
    if (!name || !name.trim()) return bad('Tên team không được rỗng');
    if (name.trim().length > 50) return bad('Tên team tối đa 50 ký tự');
    let teams = await getList('teams');
    if (!teams || teams.length === 0) teams = [...DEFAULT_TEAMS];
    if (teams.includes(name.trim())) return bad('Team đã tồn tại');
    teams.push(name.trim());
    await setList('teams', teams);
    return created({ name: name.trim(), teams });
  }

  if (req.method === 'PUT') {
    const body = await parseBody(req);
    const { oldName, newName } = body;
    if (!oldName || !newName || !newName.trim()) return bad('Thiếu tên team');
    if (newName.trim().length > 50) return bad('Tên team tối đa 50 ký tự');
    let teams = await getList('teams');
    if (!teams || teams.length === 0) teams = [...DEFAULT_TEAMS];
    const idx = teams.indexOf(oldName);
    if (idx === -1) return notFound('Team không tồn tại');
    if (newName.trim() !== oldName && teams.includes(newName.trim())) return bad('Team mới đã tồn tại');
    teams[idx] = newName.trim();
    // Cascade update employees
    const emps = await getList('employees');
    let changed = false;
    emps.forEach(e => { if (e.team === oldName) { e.team = newName.trim(); changed = true; } });
    if (changed) await setList('employees', emps);
    await setList('teams', teams);
    return ok({ oldName, newName: newName.trim(), teams });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const name = url.searchParams.get('name');
    if (!name) return bad('Thiếu tên team');
    let teams = await getList('teams');
    if (!teams || teams.length === 0) teams = [...DEFAULT_TEAMS];
    const emps = await getList('employees');
    if (emps.some(e => e.team === name)) return bad('Không thể xóa team đang có nhân viên');
    const idx = teams.indexOf(name);
    if (idx === -1) return notFound('Team không tồn tại');
    teams.splice(idx, 1);
    await setList('teams', teams);
    return ok({ deleted: name, teams });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
};
