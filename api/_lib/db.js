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

// Create tables if they don't exist - FIXED VERSION
export async function initDatabase() {
    if (!process.env.DATABASE_URL) {
        console.log('⚠️ No DATABASE_URL found, skipping database initialization');
        return;
    }
    
    const pool = getPool();
    const client = await pool.connect();
    
    try {
        // Create logs table with proper syntax
        await client.query(`
            CREATE TABLE IF NOT EXISTS cookie_logs (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                username VARCHAR(255),
                action VARCHAR(100),
                cookie_hash VARCHAR(255),
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cookie_logs_created_at 
            ON cookie_logs(created_at DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cookie_logs_user_id 
            ON cookie_logs(user_id)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cookie_logs_action 
            ON cookie_logs(action)
        `);
        
        console.log('✅ Database initialized successfully - cookie_logs table created');
        
        // Verify table exists
        const verify = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'cookie_logs'
            )
        `);
        
        if (verify.rows[0].exists) {
            console.log('✅ Table cookie_logs verified');
        } else {
            console.log('❌ Table cookie_logs was not created');
        }
        
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
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
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

// Run initialization when this module loads
initDatabase().catch(console.error);
