const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const url = require('url');
const { Buffer } = require('buffer');

const PORT = 3001;
// Зеркала rezka; клиент выбирает хост заголовком X-Rezka-Host (см. mirrorService.ts).
const ALLOWED_HOSTS = ['rezka.ag', 'rezka-ua.tv'];
const DEFAULT_HOST = ALLOWED_HOSTS[0];
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Anubis (https://github.com/TecharoHQ/anubis) выдаёт auth-cookie после проверки
// proof-of-work. Храним её в памяти и подставляем во все запросы к rezka.
// jars: { host: { name: value } } — у каждого зеркала свои cookie.
const cookieJars = {};
const solvingPromises = {}; // «замок» на хост: одновременно решаем challenge только один раз

function jarFor(host) {
  return (cookieJars[host] ??= {});
}

function jarToHeader(host) {
  return Object.entries(jarFor(host))
    .map(([n, v]) => `${n}=${v}`)
    .join('; ');
}

function storeSetCookies(host, setCookie) {
  const cookieJar = jarFor(host);
  for (const c of setCookie || []) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1);
    if (value === '')
      delete cookieJar[name]; // истёкшая cookie — удаляем
    else cookieJar[name] = value;
  }
}

function decompress(buf, encoding) {
  try {
    if (encoding === 'gzip') return zlib.gunzipSync(buf);
    if (encoding === 'deflate') return zlib.inflateSync(buf);
    if (encoding === 'br') return zlib.brotliDecompressSync(buf);
  } catch {
    /* возвращаем как есть */
  }
  return buf;
}

/**
 * Низкоуровневый запрос к rezka. Возвращает {status, headers, buffer (распакованный)}.
 * Cookie из jar подставляется автоматически; Set-Cookie из ответа сохраняется в jar.
 * Редиректы НЕ следуются здесь — этим управляет вызывающий код.
 */
function rezkaRequest(host, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: 443,
      path,
      method,
      headers: {
        host: host,
        origin: `https://${host}`,
        referer: `https://${host}/`,
        'user-agent': USER_AGENT,
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'accept-encoding': 'gzip, deflate, br',
        ...headers,
      },
    };
    const cookie = jarToHeader(host);
    if (cookie) options.headers.cookie = cookie;
    if (body) options.headers['content-length'] = Buffer.byteLength(body);

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        storeSetCookies(host, res.headers['set-cookie']);
        const buffer = decompress(Buffer.concat(chunks), res.headers['content-encoding']);
        resolve({ status: res.statusCode, headers: res.headers, buffer });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function isAnubisChallenge(response) {
  const ct = response.headers['content-type'] || '';
  return ct.includes('text/html') && response.buffer.includes('anubis_challenge');
}

/** Решает proof-of-work Anubis: ищет nonce, при котором sha256(randomData+nonce) имеет
 *  floor(difficulty/2) нулевых байт (+старший полубайт при нечётной сложности). */
function solvePow(randomData, difficulty) {
  const fullZeroBytes = Math.floor(difficulty / 2);
  const halfByte = difficulty % 2 !== 0;
  for (let nonce = 0; ; nonce++) {
    const h = crypto
      .createHash('sha256')
      .update(randomData + nonce)
      .digest();
    let ok = true;
    for (let i = 0; i < fullZeroBytes; i++) {
      if (h[i] !== 0) {
        ok = false;
        break;
      }
    }
    if (ok && halfByte && h[fullZeroBytes] >> 4 !== 0) ok = false;
    if (ok) return { hash: h.toString('hex'), nonce };
  }
}

/**
 * Проходит Anubis-проверку по её challenge-странице: парсит параметры, считает PoW,
 * дёргает pass-challenge и сохраняет выданную auth-cookie в jar.
 * verification-cookie из challenge-ответа уже лежит в jar (сохранена в rezkaRequest).
 */
async function solveAnubis(host, challengeHtml) {
  const m = challengeHtml.match(/<script id="anubis_challenge"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new Error('anubis_challenge не найден на странице проверки');
  const { challenge, rules } = JSON.parse(m[1]);

  const t0 = Date.now();
  const { hash, nonce } = solvePow(challenge.randomData, rules.difficulty);
  const elapsed = Math.max(Date.now() - t0, 1);
  console.log(`[anubis] solved difficulty=${rules.difficulty} nonce=${nonce} in ${elapsed}ms`);

  const qs = new URLSearchParams({
    id: challenge.id,
    response: hash,
    nonce: String(nonce),
    redir: `https://${host}/`,
    elapsedTime: String(elapsed),
  });
  const passPath = `/.within.website/x/cmd/anubis/api/pass-challenge?${qs}`;
  const res = await rezkaRequest(host, passPath, 'GET', { accept: 'text/html' });
  // rezkaRequest уже сохранил Set-Cookie (auth) в jar
  if (!jarFor(host)['techaro.lol-anubis-auth']) {
    throw new Error(`pass-challenge не выдал auth-cookie (status ${res.status})`);
  }
  console.log('[anubis] auth-cookie получена');
}

/**
 * Запрос к rezka с автоматическим прохождением Anubis: если пришла challenge-страница —
 * решаем PoW (под общим замком) и повторяем запрос один раз.
 */
async function fetchWithAnubis(host, path, method, headers, body) {
  let res = await rezkaRequest(host, path, method, headers, body);
  if (isAnubisChallenge(res)) {
    if (!solvingPromises[host]) {
      solvingPromises[host] = solveAnubis(host, res.buffer.toString('utf8')).finally(() => {
        delete solvingPromises[host];
      });
    }
    await solvingPromises[host];
    res = await rezkaRequest(host, path, method, headers, body);
  }
  return res;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Rezka-Host');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const targetPath = parsedUrl.path.replace('/proxy', '');
  const requestedHost = req.headers['x-rezka-host'];
  const host = ALLOWED_HOSTS.includes(requestedHost) ? requestedHost : DEFAULT_HOST;

  const forwardHeaders = {
    accept: req.headers.accept || '*/*',
    'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
    'x-requested-with': 'XMLHttpRequest',
  };

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    try {
      const result = await fetchWithAnubis(
        host,
        targetPath,
        req.method,
        forwardHeaders,
        body || null,
      );

      const headers = { ...result.headers };
      // Тело уже распаковано — убираем заголовки исходной кодировки/длины.
      delete headers['content-encoding'];
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      delete headers['set-cookie']; // cookie управляются прокси, наружу не отдаём
      delete headers['content-security-policy'];
      delete headers['x-frame-options'];
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = 'Content-Type, X-Requested-With, X-Rezka-Host';

      res.writeHead(result.status, headers);
      res.end(result.buffer);
    } catch (err) {
      res.writeHead(502);
      res.end('Proxy error: ' + err.message);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log('[anubis] proof-of-work bypass enabled');
});
