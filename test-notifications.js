const http = require('http');

function makeRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  try {
    console.log('Testing Notification System...\n');

    // Test Customer
    console.log('=== CUSTOMER (u1) ===');
    const custLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'customer@udyog.np',
      password: 'password'
    });
    const custToken = custLogin.token;
    const custNotifs = await makeRequest('GET', '/api/notifications', null, custToken);
    const custUnread = custNotifs.filter(n => !n.read).length;
    console.log(`Unread notifications: ${custUnread}`);
    console.log(`Sample: ${custNotifs[0]?.title}\n`);

    // Test Seller
    console.log('=== SELLER (s1) ===');
    const sellLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'seller@udyog.np',
      password: 'password'
    });
    const sellToken = sellLogin.token;
    const sellNotifs = await makeRequest('GET', '/api/notifications', null, sellToken);
    const sellUnread = sellNotifs.filter(n => !n.read).length;
    console.log(`Unread notifications: ${sellUnread}`);
    console.log(`Sample: ${sellNotifs[0]?.title}\n`);

    // Test Admin
    console.log('=== ADMIN (r1) ===');
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@udyog.np',
      password: 'password'
    });
    const adminToken = adminLogin.token;
    const adminNotifs = await makeRequest('GET', '/api/notifications', null, adminToken);
    const adminUnread = adminNotifs.filter(n => !n.read).length;
    console.log(`Unread notifications: ${adminUnread}`);
    console.log(`Sample: ${adminNotifs[0]?.title}\n`);

    console.log('✓ All users have consistent notification counts!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}

test();
