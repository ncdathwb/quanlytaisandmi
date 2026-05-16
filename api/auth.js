const { getList, ok, bad, handleCors, parseBody } = require('./_lib');

const ADMIN_CODE = '1395';
const ADMIN_PASS = '18062025';

module.exports = async function handler(req) {
  const cors = await handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });

  const body = await parseBody(req);
  const { role, userId, password } = body;

  if (role === 'admin') {
    if (userId !== ADMIN_CODE || password !== ADMIN_PASS) {
      return bad('Mã admin hoặc mật khẩu không đúng');
    }
    return ok({ role: 'admin', userId: '1395', name: 'Administrator' });
  }

  if (role === 'employee') {
    if (!/^\d{4}$/.test(userId)) return bad('Mã nhân viên phải là 4 chữ số');
    const emps = await getList('employees');
    const emp = emps.find(e => e.id === userId);
    if (!emp) return bad('Mã nhân viên không tồn tại');
    if (emp.status === 'resigned') return bad('Nhân viên đã nghỉ việc, không thể đăng nhập');
    return ok({ role: 'employee', userId: emp.id, name: emp.name });
  }

  return bad('Vai trò không hợp lệ');
};
