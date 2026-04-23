import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';

async function run() {
    console.log('Generating token...');
    const token = jwt.sign({ userId: '69955b918e07f416331e7f37', role: 'ADMIN' }, 'nvcar-secret-key-change-in-production');
    
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--ignore-certificate-errors']
    });
    const page = await browser.newPage();
    
    // Log console messages
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // Log failed network requests
    page.on('requestfailed', request => {
        console.log(`REQ FAILED: ${request.url()} - ${request.failure()?.errorText}`);
    });
    
    // Log API responses
    page.on('response', async response => {
        if (response.url().includes('gradebook-exports/batches')) {
            console.log(`API RESPONSE [${response.status()}] for ${response.url()}`);
            try {
                const text = await response.text();
                console.log(`API BODY HEAD: ${text.substring(0, 200)}`);
            } catch (e) {
                console.log('Could not read body');
            }
        }
    });

    console.log('Setting localStorage...');
    await page.goto('https://localhost'); // Go to origin to set localStorage
    await page.evaluate((jwtToken) => {
        localStorage.setItem('token', jwtToken);
        localStorage.setItem('role', 'ADMIN');
    }, token);
    
    console.log('Navigating to subadmin/exports...');
    await page.goto('https://localhost/subadmin/exports', { waitUntil: 'networkidle2' });
    
    // Wait for the UI to settle
    await new Promise(r => setTimeout(r, 2000));
    
    const uiText = await page.evaluate(() => document.body.innerText);
    console.log('UI Contains Aucun export?', uiText.includes('Aucun export'));
    console.log('UI First 500 chars:', uiText.substring(0, 500).replace(/\n/g, ' '));
    
    await browser.close();
}

run().catch(console.error);
