const { getList, setList, nextId } = require('./_lib');

const ADMIN_ID = '1395';
const ADMIN_PASS = '18062025';
const BOT_TOKEN = '8335869262:AAF3Inpq7kBJkHz_9V8AdQ9pa7XwCtOM3OU';

async function sendMessage(chatId, text, opts) {
  const token = BOT_TOKEN;
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') return console.error('Missing TELEGRAM_BOT_TOKEN — update BOT_TOKEN in api/telegram-webhook.js');
  const body = { chat_id: chatId, text, parse_mode: 'HTML', ...opts };
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function esc(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  try {
    const body = await req.json();
    console.log('Telegram update:', JSON.stringify(body));

    if (body.message) {
      const msg = body.message;
      const chatId = msg.chat.id;
      const text = (msg.text || '').trim();

      // Check if user is admin by comparing with env vars or stored mapping
      // For MVP: admin authenticates via /admin command with credentials

      if (text === '/start') {
        const emps = await getList('employees');
        const empList = emps.filter(e => e.status === 'active').map(e => `${e.id} - ${e.name}`).join('\n');
        await sendMessage(chatId,
          `<b>Chào mừng đến với QLTS Bot!</b>\n\n` +
          `<b>Nhân viên:</b>\n` +
          `Để bắt đầu, hãy nhập mã NV 4 số của bạn:\n(VD: <code>1001</code>)\n\n` +
          `<b>Admin:</b>\n` +
          `Nhập: <code>/admin 1395 18062025</code>\n\n` +
          `<b>Danh sách nhân viên active:</b>\n<pre>${esc(empList || '(Chưa có nhân viên)')}</pre>`
        );
      }

      // Employee: link by typing 4-digit code
      else if (/^\d{4}$/.test(text)) {
        const emps = await getList('employees');
        const emp = emps.find(e => e.id === text);
        if (!emp) {
          await sendMessage(chatId, '❌ Mã nhân viên không tồn tại.');
        } else if (emp.status === 'resigned') {
          await sendMessage(chatId, '❌ Nhân viên đã nghỉ việc, không thể đăng nhập.');
        } else {
          // Store employee session mapping (KV key: tg_session_<chatId>)
          await setList('tg_sessions', [...(await getList('tg_sessions')), { chatId: String(chatId), employeeId: text, name: emp.name, role: 'employee' }]);
          await sendMessage(chatId,
            `✅ Đã xác nhận: <b>${esc(emp.name)}</b> (${text})\n\n` +
            `<b>Lệnh:</b>\n` +
            `/muon - Xem tài sản đang mượn\n` +
            `/yeucau - Tạo yêu cầu mới\n` +
            `/xem_yc - Xem yêu cầu đã gửi\n` +
            `/help - Xem hướng dẫn`
          );
        }
      }

      // Employee: view borrowed assets
      else if (text === '/muon') {
        const session = await getSession(chatId);
        if (!session || session.role !== 'employee') {
          await sendMessage(chatId, '⚠️ Vui lòng nhập mã NV để đăng nhập trước.');
          return new Response('OK', { status: 200 });
        }
        const asgs = await getList('assignments');
        const myAsgs = asgs.filter(a => a.employeeId === session.employeeId);
        if (myAsgs.length === 0) {
          await sendMessage(chatId, '📦 Bạn chưa mượn tài sản nào.');
        } else {
          const asts = await getList('assets');
          const cats = await getList('categories');
          let resp = `<b>📦 Tài sản đang mượn (${myAsgs.length}):</b>\n`;
          for (const a of myAsgs) {
            const ast = asts.find(x => x.assetId === a.assetId);
            const cat = ast ? cats.find(c => c.id === ast.categoryId) : null;
            resp += `\n• <code>${a.assetId}</code> - ${cat ? cat.name : 'N/A'} (từ ${a.assignedDate})`;
          }
          await sendMessage(chatId, resp);
        }
      }

      // Employee: create request
      else if (text.startsWith('/yeucau')) {
        const session = await getSession(chatId);
        if (!session || session.role !== 'employee') {
          await sendMessage(chatId, '⚠️ Vui lòng nhập mã NV để đăng nhập trước.');
          return new Response('OK', { status: 200 });
        }
        // Parse: /yeucau existing LAP20250101001 Lý do...
        // or: /yeucau new CAT001 Mô tả | Lý do...
        const parts = text.split(' ').slice(1);
        if (parts.length < 2) {
          const cats = await getList('categories');
          const asts = await getList('assets');
          const available = asts.filter(a => a.quantity > 0 && a.status === 'in_stock');
          let info = '<b>Tạo yêu cầu:</b>\n\n';
          info += '<b>Có sẵn:</b> /yeucau_existing &lt;mã TS&gt; &lt;lý do&gt;\n';
          info += '<b>Mua mới:</b> /yeucau_new &lt;mã DM&gt; &lt;mô tả&gt; | &lt;lý do&gt;\n\n';
          if (available.length > 0) {
            info += `<b>Tài sản còn hàng:</b>\n`;
            available.slice(0, 10).forEach(a => {
              const cat = cats.find(c => c.id === a.categoryId);
              info += `<code>${a.assetId}</code> - ${cat ? cat.name : 'N/A'} (SL: ${a.quantity})\n`;
            });
          }
          if (cats.length > 0) {
            info += `\n<b>Danh mục:</b>\n`;
            cats.filter(c => c.isActive).forEach(c => info += `<code>${c.id}</code> - ${c.name}\n`);
          }
          await sendMessage(chatId, info);
          return new Response('OK', { status: 200 });
        }
        // For now, show usage since complex parsing requires multi-step
        await sendMessage(chatId, '👉 Vui lòng tạo yêu cầu trên Web App để nhập đầy đủ thông tin. Bot hiện hỗ trợ xem và duyệt.');
      }

      // Employee/Admin: view requests
      else if (text === '/xem_yc') {
        const session = await getSession(chatId);
        if (!session) {
          await sendMessage(chatId, '⚠️ Vui lòng đăng nhập trước.');
          return new Response('OK', { status: 200 });
        }
        const reqs = await getList('requests');
        let myReqs;
        if (session.role === 'admin') {
          myReqs = reqs.filter(r => r.status === 'pending');
        } else {
          myReqs = reqs.filter(r => r.employeeId === session.employeeId);
        }
        if (myReqs.length === 0) {
          await sendMessage(chatId, '📋 Không có yêu cầu nào.');
        } else {
          let resp = `<b>📋 Yêu cầu (${myReqs.length}):</b>\n`;
          myReqs.slice(0, 15).forEach(r => {
            const statusEmoji = { pending: '⏳', approved: '✅', rejected: '❌', fulfilled: '🎉' };
            resp += `\n${statusEmoji[r.status] || '•'} <code>${r.requestId}</code> - ${r.type === 'existing' ? 'Có sẵn' : 'Mua mới'} - ${r.status}`;
            if (r.adminNote) resp += `\n   Ghi chú: ${esc(r.adminNote)}`;
          });
          await sendMessage(chatId, resp);
        }
      }

      // Admin: login
      else if (text.startsWith('/admin')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
          await sendMessage(chatId, '⚠️ Cú pháp: /admin &lt;mã&gt; &lt;mật khẩu&gt;');
          return new Response('OK', { status: 200 });
        }
        if (parts[1] !== ADMIN_ID || parts[2] !== ADMIN_PASS) {
          await sendMessage(chatId, '❌ Sai mã admin hoặc mật khẩu.');
          return new Response('OK', { status: 200 });
        }
        // Store admin session
        let sessions = await getList('tg_sessions');
        sessions = sessions.filter(s => s.chatId !== String(chatId));
        sessions.push({ chatId: String(chatId), employeeId: ADMIN_ID, name: 'Admin', role: 'admin' });
        await setList('tg_sessions', sessions);
        await sendMessage(chatId,
          `✅ Đã xác nhận: <b>Admin</b>\n\n` +
          `<b>Lệnh Admin:</b>\n` +
          `/duyet - Xem yêu cầu pending\n` +
          `/duyet &lt;REQ_ID&gt; - Duyệt yêu cầu\n` +
          `/tuchoi &lt;REQ_ID&gt; &lt;lý do&gt; - Từ chối\n` +
          `/thongke - Thống kê nhanh\n` +
          `/xem_yc - Xem tất cả yêu cầu pending`
        );
      }

      // Admin: approve a request
      else if (text.startsWith('/duyet')) {
        const session = await getSession(chatId);
        if (!session || session.role !== 'admin') {
          await sendMessage(chatId, '⚠️ Vui lòng đăng nhập admin: /admin &lt;mã&gt; &lt;mk&gt;');
          return new Response('OK', { status: 200 });
        }
        const parts = text.split(' ');
        const reqId = parts[1];
        if (!reqId) {
          // List pending
          const reqs = await getList('requests');
          const pending = reqs.filter(r => r.status === 'pending');
          if (pending.length === 0) {
            await sendMessage(chatId, '📋 Không có yêu cầu pending.');
          } else {
            let resp = `<b>📋 Pending (${pending.length}):</b>\n`;
            pending.slice(0, 15).forEach(r => {
              resp += `\n<code>${r.requestId}</code> - NV: ${r.employeeId} - ${r.type === 'existing' ? 'Có sẵn:' + (r.assetId || 'N/A') : 'Mới:' + (r.categoryId || 'N/A')}`;
              resp += `\n   Lý do: ${esc(r.reason)}`;
              resp += `\n   /duyet_${r.requestId} | /tuchoi_${r.requestId} &lt;lý do&gt;`;
            });
            await sendMessage(chatId, resp);
          }
          return new Response('OK', { status: 200 });
        }

        // Approve specific request
        const reqs = await getList('requests');
        const r = reqs.find(x => x.requestId === reqId);
        if (!r) { await sendMessage(chatId, '❌ Yêu cầu không tồn tại.'); return new Response('OK', { status: 200 }); }
        if (r.status !== 'pending') { await sendMessage(chatId, '❌ Yêu cầu không ở trạng thái pending.'); return new Response('OK', { status: 200 }); }

        if (r.type === 'existing') {
          const asts = await getList('assets');
          const asset = asts.find(a => a.assetId === r.assetId);
          if (!asset || asset.quantity <= 0) {
            await sendMessage(chatId, '⚠️ Tài sản đã hết hàng. Dùng /tuchoi ' + reqId + ' Hết hàng để từ chối.');
            return new Response('OK', { status: 200 });
          }
          // Fulfill immediately
          const asgs = await getList('assignments');
          asgs.push({
            id: nextId(asgs, 'ASG', 3),
            assetId: r.assetId, employeeId: r.employeeId,
            assignedDate: new Date().toISOString().slice(0, 10), reason: r.reason
          });
          asset.quantity -= 1;
          if (asset.quantity > 0) asset.status = 'in_stock'; else asset.status = 'assigned';
          r.status = 'fulfilled';
          r.fulfilledAssetId = r.assetId;
          await setList('assignments', asgs);
          await setList('assets', asts);
          await sendMessage(chatId, `✅ Đã cấp phát ${r.assetId} cho NV ${r.employeeId}`);
        } else {
          r.status = 'approved';
          await sendMessage(chatId, `✅ Đã duyệt yêu cầu ${reqId}. Dùng Web App để fulfill.`);
        }
        // Log
        const hists = await getList('history');
        hists.push({ id: nextId(hists, 'HIS', 3), action: r.type === 'existing' ? 'fulfill_request' : 'approve_request', assetId: r.assetId, employeeId: r.employeeId, timestamp: new Date().toISOString(), performedBy: 'admin', note: `Duyệt qua Telegram: ${reqId}` });
        await setList('history', hists);
        await setList('requests', reqs);
      }

      // Admin: reject request
      else if (text.startsWith('/tuchoi')) {
        const session = await getSession(chatId);
        if (!session || session.role !== 'admin') {
          await sendMessage(chatId, '⚠️ Vui lòng đăng nhập admin trước.');
          return new Response('OK', { status: 200 });
        }
        const parts = text.split(' ');
        const reqId = parts[1];
        const reason = parts.slice(2).join(' ');
        if (!reqId) { await sendMessage(chatId, '⚠️ /tuchoi &lt;REQ_ID&gt; &lt;lý do&gt;'); return new Response('OK', { status: 200 }); }
        if (!reason || !reason.trim()) { await sendMessage(chatId, '⚠️ Phải nhập lý do từ chối.'); return new Response('OK', { status: 200 }); }

        const reqs = await getList('requests');
        const r = reqs.find(x => x.requestId === reqId);
        if (!r) { await sendMessage(chatId, '❌ Yêu cầu không tồn tại.'); return new Response('OK', { status: 200 }); }
        if (r.status !== 'pending') { await sendMessage(chatId, '❌ Yêu cầu không ở trạng thái pending.'); return new Response('OK', { status: 200 }); }
        r.status = 'rejected';
        r.adminNote = reason.trim();
        const hists = await getList('history');
        hists.push({ id: nextId(hists, 'HIS', 3), action: 'reject_request', assetId: r.assetId, employeeId: r.employeeId, timestamp: new Date().toISOString(), performedBy: 'admin', note: `Từ chối qua Telegram: ${reqId} - ${reason.trim()}` });
        await setList('history', hists);
        await setList('requests', reqs);
        await sendMessage(chatId, `❌ Đã từ chối ${reqId}: ${reason.trim()}`);
      }

      // Admin: stats
      else if (text === '/thongke') {
        const session = await getSession(chatId);
        if (!session || session.role !== 'admin') {
          await sendMessage(chatId, '⚠️ Vui lòng đăng nhập admin trước.');
          return new Response('OK', { status: 200 });
        }
        const asts = await getList('assets');
        const asgs = await getList('assignments');
        const reqs = await getList('requests');
        const totalQty = asts.reduce((s, a) => s + a.quantity, 0);
        const pending = reqs.filter(r => r.status === 'pending').length;
        await sendMessage(chatId,
          `<b>📊 Thống kê nhanh</b>\n\n` +
          `📦 Tổng tài sản: <b>${totalQty}</b>\n` +
          `👤 Đang mượn: <b>${asgs.length}</b>\n` +
          `⏳ Chờ duyệt: <b>${pending}</b>\n` +
          `✅ Đã duyệt: <b>${reqs.filter(r => r.status === 'approved').length}</b>`
        );
      }

      // Help
      else if (text === '/help') {
        await sendMessage(chatId,
          `<b>📖 Hướng dẫn QLTS Bot</b>\n\n` +
          `<b>Nhân viên:</b>\n` +
          `1. Nhập mã NV 4 số để đăng nhập\n` +
          `2. /muon - Xem tài sản đang mượn\n` +
          `3. /xem_yc - Xem yêu cầu đã gửi\n` +
          `4. /yeucau - Hướng dẫn tạo yêu cầu (dùng Web)\n\n` +
          `<b>Admin:</b>\n` +
          `1. /admin 1395 18062025 - Đăng nhập\n` +
          `2. /duyet - Xem pending\n` +
          `3. /duyet &lt;REQ_ID&gt; - Duyệt\n` +
          `4. /tuchoi &lt;REQ_ID&gt; &lt;lý do&gt; - Từ chối\n` +
          `5. /thongke - Thống kê`
        );
      }
    }
  } catch (e) {
    console.error('Telegram handler error:', e);
  }

  return new Response('OK', { status: 200 });
};

async function getSession(chatId) {
  const sessions = await getList('tg_sessions');
  return sessions.find(s => s.chatId === String(chatId)) || null;
}
