import https from 'https';
import jwt from 'jsonwebtoken';

const token = jwt.sign({ userId: '69955b918e07f416331e7f37', role: 'ADMIN' }, 'nvcar-secret-key-change-in-production');

const agent = new https.Agent({ rejectUnauthorized: false });

const req = https.request('https://localhost:4000/gradebook-exports/batches', {
    method: 'GET',
    agent,
    headers: {
        'Authorization': `Bearer ${token}`
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data.substring(0, 500));
    });
});

req.on('error', console.error);
req.end();
