const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

async function generate() {
    const attrs = [{ name: 'commonName', value: 'nvcar.local' }];
    const pems = await selfsigned.generate(attrs, {
      days: 365,
      algorithm: 'sha256',
      extensions: [{
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '192.168.17.10' }
        ]
      }]
    });

    console.log('Generated keys:', Object.keys(pems));

    const certDir = path.join(__dirname, '../certs');

    if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
    }

    fs.writeFileSync(path.join(certDir, 'cert.pem'), pems.cert);
    fs.writeFileSync(path.join(certDir, 'key.pem'), pems.private);

    console.log('Certificates generated successfully in ' + certDir);
}

generate().catch(console.error);
