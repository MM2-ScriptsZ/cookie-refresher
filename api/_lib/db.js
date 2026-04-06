import pg from 'pg';

const { Pool } = pg;

let pool = null;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false // Required for Neon/Supabase
            }
        });
    }
    return pool;
}

// Create tables if they don't exist
export async function initDatabase() {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
        // Create logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS cookie_logs (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                username VARCHAR(255),
                action VARCHAR(100),
                cookie_hash VARCHAR(255),
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Create index for faster queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cookie_logs_created_at 
            ON cookie_logs(created_at DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cookie_logs_user_id 
            ON cookie_logs(user_id)
        `);
        
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    } finally {
        client.release();
    }
}

// Log to database
export async function logToDatabase(userId, username, action, cookieHash, ipAddress = null, userAgent = null) {
    if (!process.env.DATABASE_URL) {
        console.log(`[LOG] ${action} - User: ${username || userId || 'unknown'}`);
        return;
    }
    
    try {
        const pool = getPool();
        const client = await pool.connect();
        
        await client.query(
            `INSERT INTO cookie_logs (user_id, username, action, cookie_hash, ip_address, user_agent, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [userId, username, action, cookieHash, ipAddress, userAgent]
        );
        
        client.release();
        console.log(`✅ Logged: ${action} for ${username || userId}`);
    } catch (error) {
        console.error('Database log error:', error);
    }
}

// Get statistics
export async function getStats() {
    if (!process.env.DATABASE_URL) return null;
    
    try {
        const pool = getPool();
        const client = await pool.connect();
        
        const result = await client.query(`
            SELECT 
                COUNT(*) as total_requests,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(CASE WHEN action = 'refresh_success' THEN 1 END) as successful_refreshes,
                COUNT(CASE WHEN action = 'refresh_failed' THEN 1 END) as failed_refreshes
            FROM cookie_logs
        `);
        
        client.release();
        return result.rows[0];
    } catch (error) {
        console.error('Stats error:', error);
        return null;
    }
}

// Initialize database on first use
initDatabase().catch(console.error);
