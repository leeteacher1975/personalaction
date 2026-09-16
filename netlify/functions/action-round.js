import { getStore } from '@netlify/blobs';

const STORE_NAME = 'za2030-action-round';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'za2030admin';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function loadEntries(store) {
  const data = await store.get('entries', { type: 'json' });
  return Array.isArray(data) ? data : [];
}

async function saveEntries(store, entries) {
  await store.setJSON('entries', entries);
}

function genId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default async (req) => {
  let store;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return json({ error: 'Blobs 스토어를 초기화하지 못했습니다.', detail: String(err) }, 500);
  }

  try {
    if (req.method === 'GET') {
      const entries = await loadEntries(store);
      return json({ entries, total: entries.length });
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: '잘못된 요청 본문입니다.' }, 400);
      }

      const entries = await loadEntries(store);

      switch (body.action) {
        case 'submit': {
          const { deviceToken, name, team, pillarKey, pillarName, actionText } = body;
          if (!deviceToken || !name || !team || !pillarKey || !pillarName || !actionText) {
            return json({ error: '필수 항목이 누락되었습니다.' }, 400);
          }
          const idx = entries.findIndex((e) => e.deviceToken === deviceToken);
          const now = Date.now();
          if (idx >= 0) {
            entries[idx] = {
              ...entries[idx],
              name: String(name).slice(0, 30),
              team: String(team).slice(0, 30),
              pillarKey,
              pillarName,
              actionText: String(actionText).slice(0, 200),
              ts: now,
            };
            await saveEntries(store, entries);
            return json({ ok: true, updated: true, entry: entries[idx] });
          } else {
            const entry = {
              id: genId(),
              deviceToken,
              name: String(name).slice(0, 30),
              team: String(team).slice(0, 30),
              pillarKey,
              pillarName,
              actionText: String(actionText).slice(0, 200),
              ts: now,
              likes: 0,
              likedBy: [],
            };
            entries.push(entry);
            await saveEntries(store, entries);
            return json({ ok: true, updated: false, entry });
          }
        }

        case 'delete': {
          const { id, deviceToken } = body;
          const idx = entries.findIndex((e) => e.id === id);
          if (idx < 0) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
          if (entries[idx].deviceToken !== deviceToken) {
            return json({ error: '본인 항목만 삭제할 수 있습니다.' }, 403);
          }
          entries.splice(idx, 1);
          await saveEntries(store, entries);
          return json({ ok: true });
        }

        case 'like':
        case 'unlike': {
          const { id, deviceToken } = body;
          if (!id || !deviceToken) return json({ error: '필수 항목이 누락되었습니다.' }, 400);
          const idx = entries.findIndex((e) => e.id === id);
          if (idx < 0) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
          const entry = entries[idx];
          entry.likedBy = Array.isArray(entry.likedBy) ? entry.likedBy : [];
          const already = entry.likedBy.includes(deviceToken);
          if (body.action === 'like' && !already) {
            entry.likedBy.push(deviceToken);
          } else if (body.action === 'unlike' && already) {
            entry.likedBy = entry.likedBy.filter((t) => t !== deviceToken);
          }
          entry.likes = entry.likedBy.length;
          await saveEntries(store, entries);
          return json({ ok: true, entry });
        }

        case 'clear-all': {
          const { adminPassword } = body;
          if (adminPassword !== ADMIN_TOKEN) {
            return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
          }
          await saveEntries(store, []);
          return json({ ok: true });
        }

        default:
          return json({ error: '알 수 없는 action입니다.' }, 400);
      }
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: '서버 오류가 발생했습니다.', detail: String(err) }, 500);
  }
};

export const config = { path: '/api/action-round' };
