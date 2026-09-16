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

async function loadConfig(store) {
  const data = await store.get('config', { type: 'json' });
  return data && typeof data === 'object' ? data : null;
}

async function saveConfig(store, config) {
  await store.setJSON('config', config);
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
      const config = await loadConfig(store);
      return json({ entries, total: entries.length, config });
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
        // 매 제출은 항상 새 이력(history) 항목으로 쌓임 — 기존 다짐을 덮어쓰지 않음.
        // 정기 리뷰 시 참가자별 지난 다짐을 모두 조회할 수 있도록 하기 위함.
        case 'submit': {
          const { deviceToken, name, team, pillarKey, pillarName, actionText, supportRequest } = body;
          if (!deviceToken || !name || !team || !pillarKey || !pillarName || !actionText) {
            return json({ error: '필수 항목이 누락되었습니다.' }, 400);
          }
          const now = Date.now();
          const entry = {
            id: genId(),
            deviceToken,
            name: String(name).slice(0, 30),
            team: String(team).slice(0, 30),
            pillarKey,
            pillarName,
            actionText: String(actionText).slice(0, 200),
            supportRequest: supportRequest ? String(supportRequest).slice(0, 200) : '',
            createdAt: now,
            updatedAt: now,
            done: false,
            doneAt: null,
            likes: 0,
            likedBy: [],
          };
          entries.push(entry);
          await saveEntries(store, entries);
          return json({ ok: true, entry });
        }

        // 본인 항목의 내용을 수정(등록일은 유지, 수정일만 갱신). 오탈자 등 정정 용도.
        case 'update': {
          const { id, deviceToken, pillarKey, pillarName, actionText, supportRequest } = body;
          const idx = entries.findIndex((e) => e.id === id);
          if (idx < 0) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
          if (entries[idx].deviceToken !== deviceToken) {
            return json({ error: '본인 항목만 수정할 수 있습니다.' }, 403);
          }
          if (!pillarKey || !pillarName || !actionText) {
            return json({ error: '필수 항목이 누락되었습니다.' }, 400);
          }
          entries[idx] = {
            ...entries[idx],
            pillarKey,
            pillarName,
            actionText: String(actionText).slice(0, 200),
            supportRequest: supportRequest ? String(supportRequest).slice(0, 200) : '',
            updatedAt: Date.now(),
          };
          await saveEntries(store, entries);
          return json({ ok: true, entry: entries[idx] });
        }

        // 본인 항목의 실천 완료 여부 토글
        case 'toggle-done': {
          const { id, deviceToken } = body;
          const idx = entries.findIndex((e) => e.id === id);
          if (idx < 0) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
          if (entries[idx].deviceToken !== deviceToken) {
            return json({ error: '본인 항목만 변경할 수 있습니다.' }, 403);
          }
          const nowDone = !entries[idx].done;
          entries[idx].done = nowDone;
          entries[idx].doneAt = nowDone ? Date.now() : null;
          await saveEntries(store, entries);
          return json({ ok: true, entry: entries[idx] });
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

        // 팀 전체에 보이는 리뷰 기간(시작일 + 총 주차) 설정 — 관리자만 변경 가능
        case 'set-config': {
          const { adminPassword, startDate, totalWeeks } = body;
          if (adminPassword !== ADMIN_TOKEN) {
            return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
          }
          if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return json({ error: '시작일 형식이 올바르지 않습니다.' }, 400);
          }
          const weeks = parseInt(totalWeeks, 10);
          if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
            return json({ error: '총 주차는 1~52 사이 숫자여야 합니다.' }, 400);
          }
          const config = { startDate, totalWeeks: weeks, updatedAt: Date.now() };
          await saveConfig(store, config);
          return json({ ok: true, config });
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
