const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;
const TARGET_HOST = 'rezka.ag';

function makeRequest(options, body, res, maxRedirects = 5) {
  if (maxRedirects <= 0) {
    res.writeHead(502);
    res.end('Too many redirects');
    return;
  }

  const proxyReq = https.request(options, (proxyRes) => {
    if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      const redirectUrl = new URL(proxyRes.headers.location, `https://${options.hostname}`);

      const newOptions = {
        ...options,
        hostname: redirectUrl.hostname || options.hostname,
        path: redirectUrl.pathname + (redirectUrl.search || ''),
        headers: {
          ...options.headers,
          host: redirectUrl.hostname || options.hostname,
        },
      };

      makeRequest(newOptions, body, res, maxRedirects - 1);
      return;
    }

    const headers = { ...proxyRes.headers };
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, X-Requested-With';
    delete headers['content-security-policy'];
    delete headers['x-frame-options'];

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502);
    res.end('Proxy error: ' + err.message);
  });

  if (body) {
    proxyReq.write(body);
  }
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  let targetPath = parsedUrl.path.replace('/proxy', '');

  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: targetPath,
    method: req.method,
    headers: {
      'host': TARGET_HOST,
      'origin': `https://${TARGET_HOST}`,
      'referer': `https://${TARGET_HOST}/`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': req.headers.accept || '*/*',
      'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'accept-encoding': 'identity',
      'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
      'x-requested-with': 'XMLHttpRequest',
    },
  };

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });

  req.on('end', () => {
    if (body) {
      options.headers['content-length'] = Buffer.byteLength(body);
    }
    makeRequest(options, body || null, res);
  });
});

server.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
