export async function logToDatabase(userId, username, action, cookieHash) {
    if (!process.env.DATABASE_URL) {
        console.log(`[LOG] ${action} - User: ${username || userId || 'unknown'}`);
        return;
    }
    
    try {
        const { sql } = await import('@vercel/postgres');
        await sql`
            CREATE TABLE IF NOT EXISTS cookie_logs (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                username VARCHAR(255),
                action VARCHAR(100),
                cookie_hash VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;
        await sql`
            INSERT INTO cookie_logs (user_id, username, action, cookie_hash, created_at)
            VALUES (${userId || null}, ${username || null}, ${action}, ${cookieHash || null}, NOW())
        `;
    } catch (error) {
        console.error('Database log error:', error);
    }
}