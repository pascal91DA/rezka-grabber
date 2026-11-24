import axios from 'axios';
import { sha256Bytes } from '../utils/sha256';

/**
 * Обход anti-bot защиты Anubis (https://github.com/TecharoHQ/anubis) на устройстве.
 *
 * Anubis отдаёт HTML-страницу с proof-of-work challenge вместо контента. Здесь мы
 * повторяем то, что делает браузерный воркер: находим nonce, при котором
 * sha256(randomData + nonce) имеет нужное число ведущих нулевых байт, затем дёргаем
 * pass-challenge — сервер выдаёт auth-cookie. На нативных платформах cookie-jar
 * управляется сетевым слоем (OkHttp/NSURLSession) автоматически, поэтому вручную
 * прокидывать Cookie не нужно: выданная cookie сама подставится в следующие запросы.
 */

const PASS_CHALLENGE_PATH = '/.within.website/x/cmd/anubis/api/pass-challenge';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Отдельный axios без интерцептора rezkaService — чтобы вызов pass-challenge
// не рекурсивно не попадал снова в обработчик challenge.
const rawAxios = axios.create({ headers: { 'User-Agent': USER_AGENT }, timeout: 30000 });

// Одновременно решаем challenge только один раз на зеркало: параллельные запросы ждут общий промис.
const solving = new Map<string, Promise<void>>();

/** Похоже ли тело ответа на challenge-страницу Anubis. */
export function isAnubisChallenge(data: unknown): data is string {
  return typeof data === 'string' && data.includes('anubis_challenge');
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * Ищет nonce, при котором sha256(randomData + nonce) имеет floor(difficulty/2)
 * нулевых байт (+ старший полубайт следующего байта при нечётной сложности).
 * Идентично проверке в sha256-purejs.mjs воркере Anubis.
 */
function solvePow(randomData: string, difficulty: number): { hash: string; nonce: number } {
  const fullZeroBytes = Math.floor(difficulty / 2);
  const halfByte = difficulty % 2 !== 0;
  for (let nonce = 0; ; nonce++) {
    const h = sha256Bytes(randomData + nonce);
    let ok = true;
    for (let i = 0; i < fullZeroBytes; i++) {
      if (h[i] !== 0) {
        ok = false;
        break;
      }
    }
    if (ok && halfByte && h[fullZeroBytes] >> 4 !== 0) ok = false;
    if (ok) return { hash: bytesToHex(h), nonce };
  }
}

async function doSolve(challengeHtml: string, origin: string): Promise<void> {
  const m = challengeHtml.match(/<script id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('anubis_challenge не найден на странице проверки');

  const { challenge, rules } = JSON.parse(m[1]);
  const algorithm: string = rules.algorithm;
  if (algorithm !== 'fast' && algorithm !== 'slow') {
    // fast/slow используют один и тот же PoW; иные алгоритмы нам неизвестны.
    console.warn('[anubis] неизвестный алгоритм:', algorithm);
  }

  const t0 = Date.now();
  const { hash, nonce } = solvePow(challenge.randomData, rules.difficulty);
  const elapsed = Math.max(Date.now() - t0, 1);
  console.log(`[anubis] solved difficulty=${rules.difficulty} nonce=${nonce} in ${elapsed}ms`);

  const params = new URLSearchParams({
    id: challenge.id,
    response: hash,
    nonce: String(nonce),
    redir: `${origin}/`,
    elapsedTime: String(elapsed),
  });

  // Ответ 302 + Set-Cookie(auth); нативный cookie-jar сохранит cookie автоматически.
  await rawAxios.get(`${origin}${PASS_CHALLENGE_PATH}?${params.toString()}`, {
    headers: { Accept: 'text/html' },
  });
  console.log('[anubis] challenge passed, auth-cookie сохранена сетевым слоем');
}

/**
 * Проходит Anubis-проверку по её challenge-странице. Потокобезопасно: при
 * параллельных вызовах реально решает PoW один раз, остальные ждут тот же промис.
 * `origin` — зеркало, выдавшее challenge (например https://rezka.ag).
 */
export function solveAnubisChallenge(challengeHtml: string, origin: string): Promise<void> {
  let promise = solving.get(origin);
  if (!promise) {
    promise = doSolve(challengeHtml, origin).finally(() => {
      solving.delete(origin);
    });
    solving.set(origin, promise);
  }
  return promise;
}
