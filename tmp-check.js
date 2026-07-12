const http = require('http');
const endpoints = ['/health', '/api/businesses', '/api/products'];

(async () => {
  for (const ep of endpoints) {
    await new Promise((resolve, reject) => {
      http.get({ host: 'localhost', port: 3000, path: ep }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          console.log(ep, res.statusCode, data.slice(0, 120));
          resolve();
        });
      }).on('error', reject);
    });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
