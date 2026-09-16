import { getStore } from '@netlify/blobs';

const STORE_NAME = 'za2030-commitment-board';
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

// 참가자 본인 확인(이름+소속 → PIN) 레지스트리. 기기가 바뀌어도 이름+PIN으로 본인 확인하면
// 그 기기도 owner.deviceTokens에 추가되어, 같은 이름+소속의 모든 이력을 계속 관리할 수 있게 됨.
async function loadOwners(store) {
  const data = await store.get('owners', { type: 'json' });
  return Array.isArray(data) ? data : [];
}

async function saveOwners(store, owners) {
  await store.setJSON('owners', owners);
}

function ownerKeyOf(name, team) {
  return `${String(name).trim()}|${String(team).trim()}`.toLowerCase();
}

async function hashPin(pin) {
  const str = String(pin);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Web Crypto가 없는 경우를 위한 최소 대비책(내부용 도구라 보안 강도보다 가용성 우선)
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `fallback-${h.toString(16)}`;
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

// entry가 이 deviceToken의 소유인지 판단: 원래 등록한 기기이거나(레거시/기본 경로),
// 그 entry의 이름+소속으로 본인 확인을 마친 owner의 기기 목록에 포함되어 있으면 인정.
function isAuthorized(entry, deviceToken, owners) {
  if (entry.deviceToken === deviceToken) return true;
  const owner = owners.find((o) => o.key === ownerKeyOf(entry.name, entry.team));
  return !!(owner && Array.isArray(owner.deviceTokens) && owner.deviceTokens.includes(deviceToken));
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
      const owners = await loadOwners(store);

      switch (body.action) {
        // 매 제출은 항상 새 이력(history) 항목으로 쌓임 — 기존 다짐을 덮어쓰지 않음.
        // 정기 리뷰 시 참가자별 지난 다짐을 모두 조회할 수 있도록 하기 위함.
        case 'submit': {
          const { deviceToken, name, team, pillarKey, pillarName, actionText, supportRequest, pin } = body;
          if (!deviceToken || !name || !team || !pillarKey || !pillarName || !actionText) {
            return json({ error: '필수 항목이 누락되었습니다.' }, 400);
          }

          const key = ownerKeyOf(name, team);
          const ownerIdx = owners.findIndex((o) => o.key === key);
          const now0 = Date.now();

          if (ownerIdx < 0) {
            // 이 이름+소속으로 처음 등록 — 앞으로 쓸 PIN을 반드시 설정
            if (!isValidPin(pin)) {
              return json({ error: 'PIN_REQUIRED', message: '본인 확인을 위해 4자리 PIN을 새로 만들어주세요.' }, 400);
            }
            owners.push({
              key, name: String(name).trim(), team: String(team).trim(),
              pinHash: await hashPin(pin),
              deviceTokens: [deviceToken],
              createdAt: now0, updatedAt: now0,
            });
          } else {
            const owner = owners[ownerIdx];
            if (!owner.deviceTokens.includes(deviceToken)) {
              // 이미 등록된 이름인데 처음 보는 기기 — PIN 확인 필요
              if (!isValidPin(pin)) {
                return json({ error: 'PIN_REQUIRED', message: '이미 등록된 이름이에요. 처음 설정한 PIN을 입력해주세요.' }, 400);
              }
              const hash = await hashPin(pin);
              if (hash !== owner.pinHash) {
                return json({ error: 'PIN_MISMATCH', message: 'PIN이 일치하지 않아요.' }, 403);
              }
              owner.deviceTokens.push(deviceToken);
              owner.updatedAt = now0;
            }
            // 이미 인식된 기기면 pin 없이도 그대로 진행(빠른 경로)
          }
          await saveOwners(store, owners);

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
            comments: [],
          };
          entries.push(entry);
          await saveEntries(store, entries);
          return json({ ok: true, entry });
        }

        // 다른 기기에서 "이름+소속+PIN"으로 본인 확인 — 이 기기를 그 사람의 기존 이력에 연결.
        // 새 다짐을 굳이 쓰지 않아도, 지난 다짐을 관리(수정/완료/삭제)하러 올 때 사용.
        case 'verify-owner': {
          const { name, team, pin, deviceToken } = body;
          if (!name || !team || !deviceToken) {
            return json({ error: '필수 항목이 누락되었습니다.' }, 400);
          }
          const key = ownerKeyOf(name, team);
          const owner = owners.find((o) => o.key === key);
          if (!owner) {
            return json({ error: 'OWNER_NOT_FOUND', message: '등록된 이름을 찾을 수 없어요. 먼저 다짐을 제출해 주세요.' }, 404);
          }
          if (owner.deviceTokens.includes(deviceToken)) {
            return json({ ok: true, alreadyVerified: true });
          }
          if (!isValidPin(pin)) {
            return json({ error: 'PIN_REQUIRED', message: 'PIN을 입력해주세요.' }, 400);
          }
          const hash = await hashPin(pin);
          if (hash !== owner.pinHash) {
            return json({ error: 'PIN_MISMATCH', message: 'PIN이 일치하지 않아요.' }, 403);
          }
          owner.deviceTokens.push(deviceToken);
          owner.updatedAt = Date.now();
          await saveOwners(store, owners);
          return json({ ok: true, alreadyVerified: false });
        }

        // 본인 항목의 내용을 수정(등록일은 유지, 수정일만 갱신). 오탈자 등 정정 용도.
        case 'update': {
          const { id, deviceToken, pillarKey, pillarName, actionText, supportRequest } = body;
          const idx = entries.findIndex((e) => e.id === id);
          if (idx < 0) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
          if (!isAuthorized(entries[idx], deviceToken, owners)) {
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
          if (!isAuthorized(entries[idx], deviceToken, owners)) {
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
          if (!isAuthorized(entries[idx], deviceToken, owners)) {
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

        // 동료 응원·지원 코멘트(Commitment Board Step 4 "Peer Encouragement & Support" 반영).
        // 누구나(본인 항목이 아니어도) 이름·소속을 밝히고 자유 텍스트로 코멘트를 남길 수 있음.
        case 'add-comment': {
          const { id, name, team, text } = body;
          if (!id || !name || !team || !text) {
            return json({ error: '필수 항목이 누락되었습니다.' }, 400);
          }
          const idx = entries.findIndex((e) => e.id === id);
          if (idx < 0) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
          const comment = {
            id: genId(),
            name: String(name).slice(0, 30),
            team: String(team).slice(0, 30),
            text: String(text).slice(0, 200),
            createdAt: Date.now(),
          };
          entries[idx].comments = Array.isArray(entries[idx].comments) ? entries[idx].comments : [];
          entries[idx].comments.push(comment);
          await saveEntries(store, entries);
          return json({ ok: true, entry: entries[idx] });
        }

        // 부적절한 코멘트 삭제 — 관리자만 가능(작성자 본인 삭제는 지원하지 않음, 모더레이션 용도)
        case 'delete-comment': {
          const { adminPassword, id, commentId } = body;
          if (adminPassword !== ADMIN_TOKEN) {
            return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
          }
          const idx = entries.findIndex((e) => e.id === id);
          if (idx < 0) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
          const before = (entries[idx].comments || []).length;
          entries[idx].comments = (entries[idx].comments || []).filter((c) => c.id !== commentId);
          const removed = entries[idx].comments.length !== before;
          await saveEntries(store, entries);
          return json({ ok: true, removed, entry: entries[idx] });
        }

        case 'clear-all': {
          const { adminPassword } = body;
          if (adminPassword !== ADMIN_TOKEN) {
            return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
          }
          await saveEntries(store, []);
          return json({ ok: true });
        }

        // 팀 전체에 보이는 리뷰 기간(시작일 + 총 주차) 설정 — 관리자만 변경 가능.
        // nextReviewDate(선택)는 Commitment Board Step 5 "Next Review 날짜"를 반영한 필드로,
        // W주차 자동 계산과는 별개로 관리자가 명시적으로 못박아두는 날짜(둘 다 상태 바에 함께 표시됨).
        case 'set-config': {
          const { adminPassword, startDate, totalWeeks, nextReviewDate } = body;
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
          let nrd = null;
          if (nextReviewDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(nextReviewDate)) {
              return json({ error: '다음 리뷰 날짜 형식이 올바르지 않습니다.' }, 400);
            }
            nrd = nextReviewDate;
          }
          const config = { startDate, totalWeeks: weeks, nextReviewDate: nrd, updatedAt: Date.now() };
          await saveConfig(store, config);
          return json({ ok: true, config });
        }

        // 참가자가 PIN을 잊었을 때 관리자가 초기화 — 해당 이름+소속의 owner 레코드를 삭제함.
        // (과거 항목 자체는 그대로 남고, 다음 제출 때 새 PIN을 다시 설정하게 됨. 원래 기기에서는
        // deviceToken이 그대로 일치하므로 PIN 없이도 계속 본인 항목을 관리할 수 있음)
        case 'reset-owner-pin': {
          const { adminPassword, name, team } = body;
          if (adminPassword !== ADMIN_TOKEN) {
            return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
          }
          if (!name || !team) {
            return json({ error: '이름과 소속을 입력해주세요.' }, 400);
          }
          const key = ownerKeyOf(name, team);
          const next = owners.filter((o) => o.key !== key);
          const removed = next.length !== owners.length;
          await saveOwners(store, next);
          return json({ ok: true, removed });
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

export const config = { path: '/api/commitment-board' };
