const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Higher limit to handle bulk Excel uploads

// Serve your static frontend files straight out of the directory root
app.use(express.static(__dirname));

// --- CONNECT TO YOUR MYSQL ENGINE DATABASE ---
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',       // Change this to your database username
    password: '',       // Change this to your database password
    database: 'lgu_laoag_dtr'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database Connection Aborted:', err.message);
        return;
    }
    console.log('🚀 Connected securely to lgu_laoag_dtr Engine.');
});

// =========================================================================
// API ENDPOINT: SYNC AND BULK IMPORT EXCEL DATA ARRAY MAPS
// =========================================================================
app.post('/api/import-workbook', (req, res) => {
    const { logs } = req.body;
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({ success: false, error: 'Malformed or missing data rows payload.' });
    }

    // Step A: Extract and extract unique profiles to seed the parent validation registry first
    const uniqueEmployees = [];
    const seenIds = new Set();

    logs.forEach(item => {
        if (item.userId && !seenIds.has(item.userId)) {
            seenIds.add(item.userId);
            uniqueEmployees.push([item.userId, item.userName]);
        }
    });

    // Step B: Bulk upsert employees into the parent registry table
    const employeeQuery = `INSERT INTO employees (user_id, user_name) VALUES ? 
                           ON DUPLICATE KEY UPDATE user_name = VALUES(user_name)`;

    db.query(employeeQuery, [uniqueEmployees], (empErr) => {
        if (empErr) {
            console.error(empErr);
            return res.status(500).json({ success: false, error: 'Database registry synchronization error.' });
        }

        // Step C: Map out individual logs into a multi-row query matrix array
        const logRows = logs.map(log => [
            log.userId,
            log.date,
            log.time,
            log.type,
            log.mode
        ]);

        const logsQuery = `INSERT INTO attendance_logs (user_id, log_date, log_time, shift_type, duty_mode) VALUES ?`;

        db.query(logsQuery, [logRows], (logErr, result) => {
            if (logErr) {
                console.error(logErr);
                return res.status(500).json({ success: false, error: 'Log transactional streaming failed.' });
            }
            res.json({ success: true, message: `Imported ${result.affectedRows} structural data records successfully.` });
        });
    });
});

// =========================================================================
// API ENDPOINT: FETCH FILTERED LOG ARCHIVES FOR HISTORICAL SHEETS / PDF EXPORT
// =========================================================================
app.get('/api/logs', (req, res) => {
    const { userId, year, month } = req.query;
    
    let query = `SELECT al.*, e.user_name FROM attendance_logs al 
                 JOIN employees e ON al.user_id = e.user_id WHERE 1=1`;
    const queryParams = [];

    if (userId) {
        query += ` AND al.user_id = ?`;
        queryParams.push(userId);
    }
    if (year) {
        query += ` AND YEAR(al.log_date) = ?`;
        queryParams.push(year);
    }
    if (month) {
        query += ` AND MONTH(al.log_date) = ?`;
        queryParams.push(month);
    }

    query += ` ORDER BY al.log_date DESC, al.log_time DESC`;

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error: 'Failed to extract query records context.' });
        }
        
        // Normalize table database rows to match your frontend template variables perfectly
        const normalizedData = results.map(row => ({
            id: row.log_id,
            userId: row.user_id,
            userName: row.user_name,
            date: row.log_date.toISOString().split('T')[0], // strip timezone string elements
            time: row.log_time,
            type: row.shift_type,
            mode: row.duty_mode
        }));

        res.json(normalizedData);
    });
});

// Run application listener
app.listen(3000, () => console.log('🔥 Server active over local portal: http://localhost:3000'));