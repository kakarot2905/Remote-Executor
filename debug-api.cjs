const http = require('http');

console.log('='.repeat(60));
console.log('BACKEND CONNECTION DEBUG TEST');
console.log('='.repeat(60));

const tests = [
    { name: 'Backend Root', path: '/', expectedStatus: [200, 404, 301, 302] },
    { name: 'Health Check', path: '/api/health', expectedStatus: [200] },
    { name: 'Workers List (no auth)', path: '/api/workers/list', expectedStatus: [401] },
    { name: 'Jobs Create (no auth)', path: '/api/jobs/create', expectedStatus: [401, 405] },
];

async function testEndpoint(name, path, expectedStatus) {
    return new Promise((resolve) => {
        console.log(`\n[${name}] GET http://localhost:3000${path}`);

        const req = http.get(`http://localhost:3000${path}`, (res) => {
            const status = res.statusCode;
            const expected = expectedStatus.includes(status);
            const icon = expected ? '✅' : '⚠️';

            console.log(`${icon} Status: ${status} ${res.statusMessage}${expected ? '' : ` (expected ${expectedStatus.join(' or ')})`}`);
            console.log(`   Content-Type: ${res.headers['content-type'] || 'none'}`);

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data && data.length < 500) {
                    try {
                        const json = JSON.parse(data);
                        console.log(`   Response:`, JSON.stringify(json, null, 2));
                    } catch {
                        console.log(`   Response: ${data.substring(0, 200)}`);
                    }
                } else if (data) {
                    console.log(`   Response: ${data.length} bytes`);
                }
                resolve({ ok: true, status, expected });
            });
        });

        req.on('error', (err) => {
            console.log(`❌ Error: ${err.message}`);
            console.log(`   Code: ${err.code}`);
            if (err.code === 'ECONNREFUSED') {
                console.log(`   → Backend not running on port 3000`);
            }
            resolve({ ok: false, error: err.message });
        });

        req.setTimeout(5000, () => {
            console.log(`❌ Timeout after 5 seconds`);
            req.destroy();
            resolve({ ok: false, error: 'Timeout' });
        });
    });
}

async function testWorkerRegister() {
    return new Promise((resolve) => {
        console.log(`\n[Worker Registration] POST http://localhost:3000/api/workers/register`);

        const postData = JSON.stringify({
            workerId: `debug-test-${Date.now()}`,
            hostname: 'debug-host',
            os: 'Windows_NT',
            cpuCount: 4,
            ramTotalMb: 8192
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/workers/register',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'x-worker-token': 'test-token-will-fail'
            }
        };

        const req = http.request(options, (res) => {
            console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
            console.log(`   (Expected 401 without valid token)`);

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data) {
                    try {
                        console.log(`   Response:`, JSON.parse(data));
                    } catch {
                        console.log(`   Response:`, data);
                    }
                }
                resolve({ ok: true, status: res.statusCode });
            });
        });

        req.on('error', (err) => {
            console.log(`❌ Error: ${err.message}`);
            resolve({ ok: false, error: err.message });
        });

        req.write(postData);
        req.end();
    });
}

(async () => {
    const results = {};

    for (const test of tests) {
        results[test.name] = await testEndpoint(test.name, test.path, test.expectedStatus);
    }

    results['Worker Register'] = await testWorkerRegister();

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    Object.entries(results).forEach(([name, result]) => {
        const icon = result.ok ? (result.expected !== false ? '✅' : '⚠️') : '❌';
        const status = result.status ? `[${result.status}]` : '';
        const error = result.error ? ` - ${result.error}` : '';
        console.log(`${icon} ${name.padEnd(30)} ${status}${error}`);
    });

    console.log('='.repeat(60));

    const backendUp = Object.values(results).some(r => r.ok);
    if (backendUp) {
        console.log('✅ Backend is running and responding');
    } else {
        console.log('❌ Backend appears to be down');
        console.log('   Run: npm run dev');
    }

    console.log('='.repeat(60));
})();
