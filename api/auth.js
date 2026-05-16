const ADMIN_CODE = '1395';
const ADMIN_PASS = '18062025';

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function ok(data) { return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders() }); }
function bad(msg) { return new Response(JSON.stringify({ error: msg }), { status: 400, headers: corsHeaders() }); }

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: corsHeaders() });

  let body;
  try { body = await req.json(); } catch(e) { body = {}; }
  const { role, userId, password } = body;

  if (role === 'admin') {
    if (userId !== ADMIN_CODE || password !== ADMIN_PASS) {
      return bad('Mã admin hoặc mật khẩu không đúng');
    }
    return ok({ role: 'admin', userId: '1395', name: 'Administrator' });
  }

  if (role === 'employee') {
    // Lazy-load _lib only when needed for employee login
    const { getList } = require('./_lib');
    if (!/^\d{4}$/.test(userId)) return bad('Mã nhân viên phải là 4 chữ số');
    const emps = await getList('employees');
    const emp = emps.find(e => e.id === userId);
    if (!emp) return bad('Mã nhân viên không tồn tại');
    if (emp.status === 'resigned') return bad('Nhân viên đã nghỉ việc, không thể đăng nhập');
    return ok({ role: 'employee', userId: emp.id, name: emp.name });
  }

  return bad('Vai trò không hợp lệ');
};
