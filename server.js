require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'abdirizak-super-secret-key-2026';

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// Request logging middleware
app.use(function(req, res, next) {
    console.log(new Date().toISOString() + ' - ' + req.method + ' ' + req.url);
    next();
});

// ============ DATA DIRECTORY SETUP ============
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'backups');
const LOGS_DIR = path.join(__dirname, 'logs');

function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

ensureDirectoryExists(DATA_DIR);
ensureDirectoryExists(BACKUP_DIR);
ensureDirectoryExists(LOGS_DIR);

// Data files
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const MODULES_FILE = path.join(DATA_DIR, 'modules.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');
const CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const COURSES_FILE = path.join(DATA_DIR, 'courses.json');
const QUIZZES_FILE = path.join(DATA_DIR, 'quizzes.json');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'assignments.json');
const FORUM_POSTS_FILE = path.join(DATA_DIR, 'forum_posts.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const COUPONS_FILE = path.join(DATA_DIR, 'coupons.json');
const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.json');

// Initialize data files
function initDataFile(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    }
}

initDataFile(USERS_FILE, []);
initDataFile(VIDEOS_FILE, []);
initDataFile(MODULES_FILE, [
    { id: "mod_1", number: 1, title: "Getting Started", description: "Foundation principles for online success", icon: "🎯", status: "active", order: 1 },
    { id: "mod_2", number: 2, title: "Making Your First $100", description: "Step-by-step methods to get your first income", icon: "💰", status: "active", order: 2 },
    { id: "mod_3", number: 3, title: "M-Pesa Money Secrets", description: "Kenya-specific strategies using mobile money", icon: "📱", status: "active", order: 3 },
    { id: "mod_4", number: 4, title: "International Freelancing", description: "Earn USD from global platforms", icon: "🌍", status: "locked", order: 4 },
    { id: "mod_5", number: 5, title: "AI Money Machines", description: "Using AI tools to scale your income", icon: "🤖", status: "coming_soon", order: 5 }
]);
initDataFile(TRANSACTIONS_FILE, []);
initDataFile(PAYMENTS_FILE, []);
initDataFile(CERTIFICATES_FILE, []);
initDataFile(ACTIVITY_FILE, []);
initDataFile(SETTINGS_FILE, { 
    siteName: "Abdirizak Academy", 
    currency: "KES", 
    paymentAmount: 1000,
    maintenanceMode: false,
    version: "3.0.0",
    allowRegistrations: true
});
initDataFile(COURSES_FILE, []);
initDataFile(QUIZZES_FILE, []);
initDataFile(ASSIGNMENTS_FILE, []);
initDataFile(FORUM_POSTS_FILE, []);
initDataFile(NOTIFICATIONS_FILE, []);
initDataFile(COUPONS_FILE, []);
initDataFile(WEBHOOKS_FILE, []);

// ============ HELPER FUNCTIONS ============
function readJSON(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading ' + filePath + ':', error.message);
        return [];
    }
}

function writeJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing ' + filePath + ':', error.message);
        return false;
    }
}

function logActivity(userId, action, details) {
    const logs = readJSON(ACTIVITY_FILE);
    logs.push({
        id: crypto.randomBytes(16).toString('hex'),
        userId: userId,
        action: action,
        details: details || {},
        timestamp: new Date().toISOString(),
        ip: null
    });
    writeJSON(ACTIVITY_FILE, logs.slice(-10000));
}

function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, 'backup_' + timestamp);
    fs.mkdirSync(backupPath, { recursive: true });
    
    const files = fs.readdirSync(DATA_DIR);
    files.forEach(function(file) {
        const srcPath = path.join(DATA_DIR, file);
        const destPath = path.join(backupPath, file);
        fs.copyFileSync(srcPath, destPath);
    });
    
    const backups = fs.readdirSync(BACKUP_DIR).filter(function(f) {
        return f.startsWith('backup_');
    }).sort().reverse();
    
    backups.slice(10).forEach(function(backup) {
        fs.rmSync(path.join(BACKUP_DIR, backup), { recursive: true, force: true });
    });
    
    console.log('✅ Backup created: ' + backupPath);
    return backupPath;
}

// Auto backup every 24 hours
setInterval(function() {
    createBackup();
}, 24 * 60 * 60 * 1000);

function generateToken(userId, email, role) {
    return jwt.sign({ id: userId, email: email, role: role }, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET);
    } catch (error) {
        return null;
    }
}

function formatPhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().replace(/\D/g, '');
    
    if (cleaned.length === 10 && cleaned.startsWith('07')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.length === 10 && cleaned.startsWith('01')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.length === 9 && cleaned.startsWith('7')) {
        cleaned = '254' + cleaned;
    } else if (cleaned.length === 9 && cleaned.startsWith('1')) {
        cleaned = '254' + cleaned;
    } else if (cleaned.length === 13 && cleaned.startsWith('+254')) {
        cleaned = cleaned.substring(1);
    }
    
    return cleaned;
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    return password && password.length >= 6;
}

// ============ M-PESA INTEGRATION ============
let mpesaToken = null;
let tokenExpiry = null;
const pendingPayments = new Map();

async function getMpesaToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    
    if (!consumerKey || consumerKey === 'YOUR_ACTUAL_CONSUMER_KEY_HERE') {
        console.log('⚠️ No valid M-Pesa credentials found');
        return null;
    }
    
    if (mpesaToken && tokenExpiry > Date.now()) {
        return mpesaToken;
    }
    
    try {
        const auth = Buffer.from(consumerKey + ':' + consumerSecret).toString('base64');
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            { headers: { 'Authorization': 'Basic ' + auth }, timeout: 30000 }
        );
        
        if (response.data.access_token) {
            mpesaToken = response.data.access_token;
            tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
            console.log('✅ M-Pesa token obtained');
            return mpesaToken;
        }
    } catch (error) {
        console.error('❌ M-Pesa token error:', error.response?.data || error.message);
    }
    return null;
}

function getTimestamp() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return year + month + day + hours + minutes + seconds;
}

// ============ AUTHENTICATION SYSTEM ============
app.post('/api/auth/register', async function(req, res) {
    const name = req.body.name;
    const email = req.body.email;
    const phone = req.body.phone;
    const password = req.body.password;
    const confirmPassword = req.body.confirmPassword;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }
    
    if (!validatePassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    try {
        const users = readJSON(USERS_FILE);
        
        const existingUser = users.find(function(u) {
            return u.email === email.toLowerCase();
        });
        
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const formattedPhone = phone ? formatPhoneNumber(phone) : '';
        
        const newUser = {
            id: 'usr_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
            name: name.trim(),
            email: email.toLowerCase(),
            phone: formattedPhone,
            password: hashedPassword,
            paid: false,
            role: 'user',
            createdAt: new Date().toISOString(),
            lastLogin: null,
            profilePicture: null,
            bio: null,
            courseProgress: {},
            certificates: [],
            settings: {
                emailNotifications: true,
                twoFactorEnabled: false
            }
        };
        
        users.push(newUser);
        writeJSON(USERS_FILE, users);
        
        const token = generateToken(newUser.id, newUser.email, 'user');
        logActivity(newUser.id, 'REGISTER', { email: newUser.email });
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            token: token,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                paid: newUser.paid,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async function(req, res) {
    const email = req.body.email;
    const password = req.body.password;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    try {
        const users = readJSON(USERS_FILE);
        const user = users.find(function(u) {
            return u.email === email.toLowerCase();
        });
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        user.lastLogin = new Date().toISOString();
        writeJSON(USERS_FILE, users);
        
        const token = generateToken(user.id, user.email, user.role || 'user');
        logActivity(user.id, 'LOGIN', { email: user.email });
        
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                paid: user.paid,
                role: user.role || 'user'
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/auth/verify', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    if (!token) {
        return res.status(401).json({ valid: false, error: 'No token provided' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ valid: false, error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.id === decoded.id;
    });
    
    if (!user) {
        return res.status(401).json({ valid: false, error: 'User not found' });
    }
    
    res.json({
        valid: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            paid: user.paid,
            role: user.role
        }
    });
});

app.post('/api/auth/change-password', async function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    const currentPassword = req.body.currentPassword;
    const newPassword = req.body.newPassword;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.id === decoded.id;
    });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    if (!validatePassword(newPassword)) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    writeJSON(USERS_FILE, users);
    
    logActivity(user.id, 'CHANGE_PASSWORD', {});
    res.json({ success: true, message: 'Password changed successfully' });
});

app.post('/api/auth/forgot-password', async function(req, res) {
    const email = req.body.email;
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.email === email?.toLowerCase();
    });
    
    if (!user) {
        return res.json({ success: true, message: 'If email exists, reset link will be sent' });
    }
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 3600000).toISOString();
    
    user.resetToken = resetToken;
    user.resetExpiry = resetExpiry;
    writeJSON(USERS_FILE, users);
    
    console.log('Password reset token for ' + email + ': ' + resetToken);
    
    res.json({ success: true, message: 'Password reset link sent to your email' });
});

app.post('/api/auth/reset-password', async function(req, res) {
    const token = req.body.token;
    const newPassword = req.body.newPassword;
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.resetToken === token && new Date(u.resetExpiry) > new Date();
    });
    
    if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    if (!validatePassword(newPassword)) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    delete user.resetToken;
    delete user.resetExpiry;
    writeJSON(USERS_FILE, users);
    
    res.json({ success: true, message: 'Password reset successfully' });
});

// ============ USER PROFILE ============
app.get('/api/user/profile', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.id === decoded.id;
    });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        paid: user.paid,
        paidAt: user.paidAt,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        courseProgress: user.courseProgress || {},
        certificates: user.certificates || [],
        bio: user.bio || null,
        profilePicture: user.profilePicture || null
    });
});

app.put('/api/user/profile', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    const name = req.body.name;
    const phone = req.body.phone;
    const bio = req.body.bio;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const userIndex = users.findIndex(function(u) {
        return u.id === decoded.id;
    });
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (name) users[userIndex].name = name;
    if (phone) users[userIndex].phone = phone;
    if (bio !== undefined) users[userIndex].bio = bio;
    
    writeJSON(USERS_FILE, users);
    logActivity(users[userIndex].id, 'PROFILE_UPDATED', {});
    
    res.json({ success: true, user: users[userIndex] });
});

// ============ COURSE MANAGEMENT ============
app.get('/api/courses', function(req, res) {
    const modules = readJSON(MODULES_FILE);
    const videos = readJSON(VIDEOS_FILE);
    
    const coursesWithVideos = modules.map(function(module) {
        const moduleVideos = videos.filter(function(v) {
            return v.moduleId === module.id;
        });
        return {
            id: module.id,
            number: module.number,
            title: module.title,
            description: module.description,
            icon: module.icon,
            status: module.status,
            order: module.order,
            videos: moduleVideos,
            videoCount: moduleVideos.length
        };
    });
    
    res.json(coursesWithVideos);
});

app.get('/api/courses/:moduleId', function(req, res) {
    const moduleId = req.params.moduleId;
    const modules = readJSON(MODULES_FILE);
    const videos = readJSON(VIDEOS_FILE);
    
    const module = modules.find(function(m) {
        return m.id === moduleId;
    });
    
    if (!module) {
        return res.status(404).json({ error: 'Module not found' });
    }
    
    const moduleVideos = videos.filter(function(v) {
        return v.moduleId === moduleId;
    });
    
    res.json({
        id: module.id,
        number: module.number,
        title: module.title,
        description: module.description,
        icon: module.icon,
        status: module.status,
        videos: moduleVideos
    });
});

app.post('/api/courses/progress', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    const videoId = req.body.videoId;
    const completed = req.body.completed;
    const progress = req.body.progress;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const userIndex = users.findIndex(function(u) {
        return u.id === decoded.id;
    });
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (!users[userIndex].courseProgress) {
        users[userIndex].courseProgress = {};
    }
    
    if (!users[userIndex].courseProgress[videoId]) {
        users[userIndex].courseProgress[videoId] = {};
    }
    
    if (completed !== undefined) {
        users[userIndex].courseProgress[videoId].completed = completed;
    }
    if (progress !== undefined) {
        users[userIndex].courseProgress[videoId].progress = progress;
    }
    users[userIndex].courseProgress[videoId].lastWatched = new Date().toISOString();
    
    writeJSON(USERS_FILE, users);
    
    res.json({ success: true, progress: users[userIndex].courseProgress });
});

app.get('/api/courses/progress', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.id === decoded.id;
    });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const videos = readJSON(VIDEOS_FILE);
    const totalVideos = videos.length;
    const userProgress = user.courseProgress || {};
    const completedVideos = Object.values(userProgress).filter(function(p) {
        return p.completed === true;
    }).length;
    const overallProgress = totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0;
    
    res.json({
        success: true,
        progress: userProgress,
        stats: {
            totalVideos: totalVideos,
            completedVideos: completedVideos,
            overallProgress: Math.round(overallProgress)
        }
    });
});

// ============ PAYMENT SYSTEM ============
app.post('/api/payments/initiate', async function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    const phone = req.body.phone;
    const amount = req.body.amount;
    const email = req.body.email;
    
    console.log('💰 Payment initiation request:', { phone: phone, amount: amount, email: email, hasToken: !!token });
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.id === decoded.id;
    });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const formattedPhone = formatPhoneNumber(phone || user.phone);
    if (!formattedPhone || formattedPhone.length !== 12) {
        return res.status(400).json({ error: 'Invalid phone number format. Use 2547XXXXXXXX' });
    }
    
    const paymentAmount = amount || 1000;
    const userEmail = email || user.email;
    
    const hasRealCreds = process.env.MPESA_CONSUMER_KEY && 
                         process.env.MPESA_CONSUMER_KEY !== 'YOUR_ACTUAL_CONSUMER_KEY_HERE';
    
    if (!hasRealCreds) {
        const checkoutId = 'SIM_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        
        let payments = readJSON(PAYMENTS_FILE);
        if (!Array.isArray(payments)) {
            payments = [];
        }
        
        const payment = {
            id: checkoutId,
            userId: user.id,
            email: userEmail,
            amount: paymentAmount,
            phone: formattedPhone,
            status: 'processing',
            createdAt: new Date().toISOString()
        };
        
        payments.push(payment);
        writeJSON(PAYMENTS_FILE, payments);
        
        console.log('🔵 SIMULATION: Payment initiated for ' + userEmail + ' - Amount: ' + paymentAmount);
        
        setTimeout(function() {
            let updatePayments = readJSON(PAYMENTS_FILE);
            if (!Array.isArray(updatePayments)) {
                updatePayments = [];
            }
            const foundPayment = updatePayments.find(function(p) {
                return p.id === checkoutId;
            });
            if (foundPayment) {
                foundPayment.status = 'completed';
                foundPayment.completedAt = new Date().toISOString();
                writeJSON(PAYMENTS_FILE, updatePayments);
                
                let updateUsers = readJSON(USERS_FILE);
                if (!Array.isArray(updateUsers)) {
                    updateUsers = [];
                }
                const targetUser = updateUsers.find(function(u) {
                    return u.id === user.id;
                });
                if (targetUser && !targetUser.paid) {
                    targetUser.paid = true;
                    targetUser.paidAt = new Date().toISOString();
                    targetUser.paymentMethod = 'simulation';
                    targetUser.paymentAmount = paymentAmount;
                    writeJSON(USERS_FILE, updateUsers);
                    console.log('✅✅ User ' + user.email + ' marked as PAID! (simulation)');
                }
            }
        }, 3000);
        
        return res.json({
            success: true,
            message: 'Payment initiated (simulation mode)',
            checkoutId: checkoutId,
            amount: paymentAmount,
            status: 'processing'
        });
    }
    
    try {
        const mpesaToken = await getMpesaToken();
        if (!mpesaToken) {
            return res.status(500).json({ error: 'Payment service unavailable' });
        }
        
        const timestamp = getTimestamp();
        const shortcode = process.env.MPESA_SHORTCODE;
        const passkey = process.env.MPESA_PASSKEY;
        const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
        const callbackUrl = (process.env.MPESA_CALLBACK_URL || 'http://localhost:' + PORT) + '/api/payments/callback';
        
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                BusinessShortCode: shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: Math.round(paymentAmount),
                PartyA: formattedPhone,
                PartyB: shortcode,
                PhoneNumber: formattedPhone,
                CallBackURL: callbackUrl,
                AccountReference: userEmail.split('@')[0],
                TransactionDesc: 'Abdirizak Academy Payment'
            },
            {
                headers: { 'Authorization': 'Bearer ' + mpesaToken, 'Content-Type': 'application/json' },
                timeout: 30000
            }
        );
        
        if (response.data.ResponseCode === '0') {
            const checkoutId = response.data.CheckoutRequestID;
            
            let payments = readJSON(PAYMENTS_FILE);
            if (!Array.isArray(payments)) {
                payments = [];
            }
            
            const payment = {
                id: checkoutId,
                userId: user.id,
                email: userEmail,
                amount: paymentAmount,
                phone: formattedPhone,
                status: 'pending',
                createdAt: new Date().toISOString(),
                mpesaResponse: response.data
            };
            
            payments.push(payment);
            writeJSON(PAYMENTS_FILE, payments);
            
            let transactions = readJSON(TRANSACTIONS_FILE);
            if (!Array.isArray(transactions)) {
                transactions = [];
            }
            transactions.push({
                id: checkoutId,
                userId: user.id,
                email: userEmail,
                amount: paymentAmount,
                type: 'mpesa',
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            writeJSON(TRANSACTIONS_FILE, transactions);
            
            console.log('✅ STK Push sent! CheckoutID: ' + checkoutId);
            
            res.json({
                success: true,
                message: 'STK Push sent. Check your phone for the M-Pesa prompt.',
                checkoutId: checkoutId,
                amount: paymentAmount,
                status: 'pending'
            });
        } else {
            throw new Error(response.data.ResponseDescription || 'Payment initiation failed');
        }
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ error: error.message || 'Payment processing failed' });
    }
});

app.get('/api/payments/status/:checkoutId', function(req, res) {
    const checkoutId = req.params.checkoutId;
    
    console.log('🔍 Checking payment status:', checkoutId);
    
    let payments = readJSON(PAYMENTS_FILE);
    if (!Array.isArray(payments)) {
        payments = [];
    }
    const payment = payments.find(function(p) {
        return p.id === checkoutId;
    });
    
    if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.json({
        success: true,
        status: payment.status,
        amount: payment.amount,
        receipt: payment.receipt,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt
    });
});

app.get('/api/payments/history', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    let payments = readJSON(PAYMENTS_FILE);
    if (!Array.isArray(payments)) {
        payments = [];
    }
    const userPayments = payments.filter(function(p) {
        return p.userId === decoded.id;
    });
    
    res.json({
        success: true,
        payments: userPayments.map(function(p) {
            return {
                id: p.id,
                amount: p.amount,
                status: p.status,
                createdAt: p.createdAt,
                completedAt: p.completedAt,
                receipt: p.receipt
            };
        })
    });
});

app.post('/api/payments/callback', function(req, res) {
    console.log('📞 Payment callback received:', JSON.stringify(req.body, null, 2));
    
    const body = req.body;
    
    if (body && body.Body && body.Body.stkCallback) {
        const stkCallback = body.Body.stkCallback;
        const ResultCode = stkCallback.ResultCode;
        const ResultDesc = stkCallback.ResultDesc;
        const CheckoutRequestID = stkCallback.CheckoutRequestID;
        const CallbackMetadata = stkCallback.CallbackMetadata;
        
        let payments = readJSON(PAYMENTS_FILE);
        if (!Array.isArray(payments)) {
            payments = [];
        }
        const paymentIndex = payments.findIndex(function(p) {
            return p.id === CheckoutRequestID;
        });
        
        if (paymentIndex !== -1) {
            payments[paymentIndex].status = ResultCode === 0 ? 'completed' : 'failed';
            payments[paymentIndex].resultDesc = ResultDesc;
            payments[paymentIndex].callbackReceivedAt = new Date().toISOString();
            
            if (ResultCode === 0 && CallbackMetadata) {
                const metadata = {};
                CallbackMetadata.Item.forEach(function(item) {
                    metadata[item.Name] = item.Value;
                });
                payments[paymentIndex].metadata = metadata;
                payments[paymentIndex].receipt = metadata.MpesaReceiptNumber;
                
                let users = readJSON(USERS_FILE);
                if (!Array.isArray(users)) {
                    users = [];
                }
                const userIndex = users.findIndex(function(u) {
                    return u.id === payments[paymentIndex].userId;
                });
                if (userIndex !== -1 && !users[userIndex].paid) {
                    users[userIndex].paid = true;
                    users[userIndex].paidAt = new Date().toISOString();
                    users[userIndex].paymentMethod = 'mpesa';
                    users[userIndex].paymentAmount = payments[paymentIndex].amount;
                    users[userIndex].mpesaReceipt = metadata.MpesaReceiptNumber;
                    writeJSON(USERS_FILE, users);
                    console.log('✅✅ User ' + users[userIndex].email + ' marked as PAID!');
                }
                
                let transactions = readJSON(TRANSACTIONS_FILE);
                if (!Array.isArray(transactions)) {
                    transactions = [];
                }
                const transactionIndex = transactions.findIndex(function(t) {
                    return t.id === CheckoutRequestID;
                });
                if (transactionIndex !== -1) {
                    transactions[transactionIndex].status = 'completed';
                    transactions[transactionIndex].completedAt = new Date().toISOString();
                    transactions[transactionIndex].receipt = metadata.MpesaReceiptNumber;
                    writeJSON(TRANSACTIONS_FILE, transactions);
                }
            }
            
            writeJSON(PAYMENTS_FILE, payments);
        }
    }
    
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
});

// ============ CERTIFICATE SYSTEM ============
app.post('/api/certificates/generate', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    const moduleId = req.body.moduleId;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(function(u) {
        return u.id === decoded.id;
    });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.paid) {
        return res.status(403).json({ error: 'Payment required to generate certificates' });
    }
    
    const modules = readJSON(MODULES_FILE);
    const module = modules.find(function(m) {
        return m.id === moduleId;
    });
    
    if (!module) {
        return res.status(404).json({ error: 'Module not found' });
    }
    
    const certificates = readJSON(CERTIFICATES_FILE);
    
    const existing = certificates.find(function(c) {
        return c.userId === user.id && c.moduleId === moduleId;
    });
    if (existing) {
        return res.json({ success: true, certificate: existing });
    }
    
    const certificate = {
        id: 'cert_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        userId: user.id,
        userName: user.name,
        moduleId: module.id,
        moduleTitle: module.title,
        issuedAt: new Date().toISOString(),
        certificateNumber: 'ABZ-' + Date.now() + '-' + user.id.slice(-6)
    };
    
    certificates.push(certificate);
    writeJSON(CERTIFICATES_FILE, certificates);
    
    if (!user.certificates) {
        user.certificates = [];
    }
    user.certificates.push(certificate.id);
    writeJSON(USERS_FILE, users);
    
    logActivity(user.id, 'CERTIFICATE_GENERATED', { moduleId: moduleId, certificateId: certificate.id });
    
    res.json({ success: true, certificate: certificate });
});

app.get('/api/certificates', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const certificates = readJSON(CERTIFICATES_FILE);
    const userCertificates = certificates.filter(function(c) {
        return c.userId === decoded.id;
    });
    
    res.json({ success: true, certificates: userCertificates });
});

// ============ ADMIN SYSTEM ============
const ADMIN_EMAIL = 'admin@abdirizakacademy.com';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('admin123', 10);

app.post('/api/admin/login', async function(req, res) {
    const email = req.body.email;
    const password = req.body.password;
    
    console.log('🔐 Admin login attempt:', email);
    
    if (email !== ADMIN_EMAIL) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken('admin', email, 'admin');
    console.log('✅ Admin logged in successfully');
    res.json({ token: token });
});

app.get('/api/admin/verify', function(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    if (!token) {
        return res.status(401).json({ valid: false });
    }
    
    const decoded = verifyToken(token);
    res.json({ valid: !!decoded, role: decoded ? decoded.role : null });
});

app.get('/api/admin/users', function(req, res) {
    const users = readJSON(USERS_FILE);
    const safeUsers = users.map(function(u) {
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            paid: u.paid,
            paidAt: u.paidAt,
            paymentMethod: u.paymentMethod,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        };
    });
    res.json(safeUsers);
});

app.get('/api/admin/stats', function(req, res) {
    const users = readJSON(USERS_FILE);
    const payments = readJSON(PAYMENTS_FILE);
    const videos = readJSON(VIDEOS_FILE);
    const certificates = readJSON(CERTIFICATES_FILE);
    const modules = readJSON(MODULES_FILE);
    
    const paidUsers = users.filter(function(u) {
        return u.paid === true;
    });
    const completedPayments = payments.filter(function(p) {
        return p.status === 'completed';
    });
    const totalRevenue = completedPayments.reduce(function(sum, p) {
        return sum + (p.amount || 0);
    }, 0);
    
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    const recentUsers = users.filter(function(u) {
        return new Date(u.createdAt) > last30Days;
    });
    const recentPayments = completedPayments.filter(function(p) {
        return new Date(p.completedAt) > last30Days;
    });
    
    res.json({
        overview: {
            totalUsers: users.length,
            paidUsers: paidUsers.length,
            conversionRate: users.length ? ((paidUsers.length / users.length) * 100).toFixed(2) : 0,
            totalRevenue: totalRevenue,
            averagePayment: paidUsers.length ? (totalRevenue / paidUsers.length).toFixed(2) : 0
        },
        payments: {
            total: payments.length,
            completed: completedPayments.length,
            pending: payments.filter(function(p) { return p.status === 'pending'; }).length,
            failed: payments.filter(function(p) { return p.status === 'failed'; }).length,
            last30DaysRevenue: recentPayments.reduce(function(sum, p) {
                return sum + (p.amount || 0);
            }, 0)
        },
        courses: {
            totalModules: modules.length,
            totalVideos: videos.length,
            totalCertificates: certificates.length
        },
        recent: {
            users: recentUsers.slice(-5).map(function(u) {
                return { name: u.name, email: u.email, createdAt: u.createdAt };
            }),
            payments: recentPayments.slice(-5).map(function(p) {
                return { amount: p.amount, email: p.email, completedAt: p.completedAt };
            })
        }
    });
});

app.put('/api/admin/users/:userId', function(req, res) {
    const userId = req.params.userId;
    const paid = req.body.paid;
    const name = req.body.name;
    const email = req.body.email;
    const phone = req.body.phone;
    
    const users = readJSON(USERS_FILE);
    const userIndex = users.findIndex(function(u) {
        return u.id === userId;
    });
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (paid !== undefined) {
        users[userIndex].paid = paid;
        if (paid === true && !users[userIndex].paidAt) {
            users[userIndex].paidAt = new Date().toISOString();
            users[userIndex].paymentMethod = 'admin_manual';
        }
    }
    if (name) users[userIndex].name = name;
    if (email) users[userIndex].email = email;
    if (phone) users[userIndex].phone = phone;
    
    writeJSON(USERS_FILE, users);
    
    res.json({ success: true, user: users[userIndex] });
});

app.delete('/api/admin/users/:userId', function(req, res) {
    const userId = req.params.userId;
    
    const users = readJSON(USERS_FILE);
    const filteredUsers = users.filter(function(u) {
        return u.id !== userId;
    });
    
    if (filteredUsers.length === users.length) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    writeJSON(USERS_FILE, filteredUsers);
    
    res.json({ success: true, message: 'User deleted successfully' });
});

app.post('/api/admin/mark-paid', function(req, res) {
    const email = req.body.email;
    
    const users = readJSON(USERS_FILE);
    const userIndex = users.findIndex(function(u) {
        return u.email === email;
    });
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    users[userIndex].paid = true;
    users[userIndex].paidAt = new Date().toISOString();
    users[userIndex].paymentMethod = 'admin_manual';
    writeJSON(USERS_FILE, users);
    
    logActivity(users[userIndex].id, 'ADMIN_MARKED_PAID', {});
    res.json({ success: true, message: 'User ' + email + ' marked as paid' });
});

// ============ VIDEO MANAGEMENT (ADMIN) ============
app.get('/api/admin/videos', function(req, res) {
    const videos = readJSON(VIDEOS_FILE);
    res.json(videos);
});

app.post('/api/admin/videos', function(req, res) {
    const moduleId = req.body.moduleId;
    const title = req.body.title;
    const url = req.body.url;
    const duration = req.body.duration;
    const description = req.body.description;
    const order = req.body.order;
    
    if (!title || !url) {
        return res.status(400).json({ error: 'Title and URL are required' });
    }
    
    const videos = readJSON(VIDEOS_FILE);
    const newVideo = {
        id: 'vid_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        moduleId: moduleId || 'mod_1',
        title: title.trim(),
        url: url,
        duration: duration || 0,
        description: description || '',
        order: order || videos.length + 1,
        createdAt: new Date().toISOString()
    };
    
    videos.push(newVideo);
    writeJSON(VIDEOS_FILE, videos);
    
    res.json({ success: true, video: newVideo });
});

app.put('/api/admin/videos/:videoId', function(req, res) {
    const videoId = req.params.videoId;
    const updates = req.body;
    
    const videos = readJSON(VIDEOS_FILE);
    const videoIndex = videos.findIndex(function(v) {
        return v.id === videoId;
    });
    
    if (videoIndex === -1) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    videos[videoIndex] = Object.assign({}, videos[videoIndex], updates);
    writeJSON(VIDEOS_FILE, videos);
    
    res.json({ success: true, video: videos[videoIndex] });
});

app.delete('/api/admin/videos/:videoId', function(req, res) {
    const videoId = req.params.videoId;
    
    const videos = readJSON(VIDEOS_FILE);
    const filteredVideos = videos.filter(function(v) {
        return v.id !== videoId;
    });
    
    if (filteredVideos.length === videos.length) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    writeJSON(VIDEOS_FILE, filteredVideos);
    
    res.json({ success: true, message: 'Video deleted successfully' });
});

// ============ MODULE MANAGEMENT (ADMIN) ============
app.get('/api/admin/modules', function(req, res) {
    const modules = readJSON(MODULES_FILE);
    res.json(modules);
});

app.post('/api/admin/modules', function(req, res) {
    const number = req.body.number;
    const title = req.body.title;
    const description = req.body.description;
    const icon = req.body.icon;
    const status = req.body.status;
    
    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }
    
    const modules = readJSON(MODULES_FILE);
    const newModule = {
        id: 'mod_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        number: number || modules.length + 1,
        title: title.trim(),
        description: description || '',
        icon: icon || '📚',
        status: status || 'active',
        order: modules.length + 1,
        createdAt: new Date().toISOString()
    };
    
    modules.push(newModule);
    writeJSON(MODULES_FILE, modules);
    
    res.json({ success: true, module: newModule });
});

app.put('/api/admin/modules/:moduleId', function(req, res) {
    const moduleId = req.params.moduleId;
    const updates = req.body;
    
    const modules = readJSON(MODULES_FILE);
    const moduleIndex = modules.findIndex(function(m) {
        return m.id === moduleId;
    });
    
    if (moduleIndex === -1) {
        return res.status(404).json({ error: 'Module not found' });
    }
    
    modules[moduleIndex] = Object.assign({}, modules[moduleIndex], updates);
    writeJSON(MODULES_FILE, modules);
    
    res.json({ success: true, module: modules[moduleIndex] });
});

app.delete('/api/admin/modules/:moduleId', function(req, res) {
    const moduleId = req.params.moduleId;
    
    const modules = readJSON(MODULES_FILE);
    const filteredModules = modules.filter(function(m) {
        return m.id !== moduleId;
    });
    
    if (filteredModules.length === modules.length) {
        return res.status(404).json({ error: 'Module not found' });
    }
    
    writeJSON(MODULES_FILE, filteredModules);
    
    res.json({ success: true, message: 'Module deleted successfully' });
});

// ============ BACKUP AND EXPORT ============
app.post('/api/admin/backup', function(req, res) {
    const backupPath = createBackup();
    res.json({ success: true, backupPath: backupPath });
});

app.get('/api/admin/export/:type', function(req, res) {
    const type = req.params.type;
    let data;
    
    switch(type) {
        case 'users':
            data = readJSON(USERS_FILE);
            break;
        case 'payments':
            data = readJSON(PAYMENTS_FILE);
            break;
        case 'transactions':
            data = readJSON(TRANSACTIONS_FILE);
            break;
        case 'certificates':
            data = readJSON(CERTIFICATES_FILE);
            break;
        default:
            return res.status(400).json({ error: 'Invalid export type' });
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=' + type + '_export_' + Date.now() + '.json');
    res.json(data);
});

app.get('/api/admin/logs', function(req, res) {
    const limit = parseInt(req.query.limit) || 100;
    const userId = req.query.userId;
    const action = req.query.action;
    
    let logs = readJSON(ACTIVITY_FILE);
    
    if (userId) {
        logs = logs.filter(function(l) {
            return l.userId === userId;
        });
    }
    if (action) {
        logs = logs.filter(function(l) {
            return l.action === action;
        });
    }
    
    res.json(logs.slice(-limit));
});

// ============ COUPON SYSTEM ============
app.post('/api/admin/coupons', function(req, res) {
    const code = req.body.code;
    const discountPercent = req.body.discountPercent;
    const expiryDate = req.body.expiryDate;
    
    const coupons = readJSON(COUPONS_FILE);
    const newCoupon = {
        id: crypto.randomBytes(8).toString('hex'),
        code: code.toUpperCase(),
        discountPercent: discountPercent,
        expiryDate: expiryDate,
        active: true,
        createdAt: new Date().toISOString()
    };
    
    coupons.push(newCoupon);
    writeJSON(COUPONS_FILE, coupons);
    
    res.json({ success: true, coupon: newCoupon });
});

app.get('/api/coupons/validate/:code', function(req, res) {
    const code = req.params.code;
    const coupons = readJSON(COUPONS_FILE);
    const coupon = coupons.find(function(c) {
        return c.code === code.toUpperCase() && c.active && new Date(c.expiryDate) > new Date();
    });
    
    if (!coupon) {
        return res.status(404).json({ valid: false, error: 'Invalid or expired coupon' });
    }
    
    res.json({ valid: true, discountPercent: coupon.discountPercent });
});

// ============ HEALTH CHECKS ============
app.get('/api/health', function(req, res) {
    const settings = readJSON(SETTINGS_FILE);
    
    res.json({
        status: settings.maintenanceMode ? 'maintenance' : 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '3.0.0',
        services: {
            mpesa: process.env.MPESA_CONSUMER_KEY ? 'configured' : 'not_configured',
            database: 'connected',
            storage: 'healthy'
        }
    });
});

app.get('/api/health/detailed', function(req, res) {
    const users = readJSON(USERS_FILE);
    const payments = readJSON(PAYMENTS_FILE);
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        system: {
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            uptime: process.uptime(),
            nodeVersion: process.version
        },
        database: {
            users: users.length,
            payments: payments.length,
            backups: fs.readdirSync(BACKUP_DIR).length
        }
    });
});

// ============ MAINTENANCE MODE ============
app.get('/api/settings', function(req, res) {
    const settings = readJSON(SETTINGS_FILE);
    res.json(settings);
});

app.post('/api/admin/maintenance', function(req, res) {
    const enabled = req.body.enabled;
    const settings = readJSON(SETTINGS_FILE);
    settings.maintenanceMode = enabled;
    writeJSON(SETTINGS_FILE, settings);
    
    res.json({ success: true, maintenanceMode: enabled });
});

// Maintenance mode middleware
app.use(function(req, res, next) {
    const settings = readJSON(SETTINGS_FILE);
    if (settings.maintenanceMode && !req.path.includes('/api/health') && !req.path.includes('/api/admin')) {
        return res.status(503).json({ error: 'System under maintenance. Please try again later.' });
    }
    next();
});

// ============ 404 AND ERROR HANDLING ============
app.use(function(req, res) {
    res.status(404).json({ error: 'Endpoint not found', path: req.url });
});

app.use(function(err, req, res, next) {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============ START SERVER ============
app.listen(PORT, function() {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    🚀 ABDIRIZAK ACADEMY - PRODUCTION SERVER v3.0               ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📍 Server URL: http://localhost:' + PORT);
    console.log('💚 Health Check: http://localhost:' + PORT + '/api/health');
    console.log('🔐 Admin Login: http://localhost:' + PORT + '/admin-login.html');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SYSTEM STATUS:');
    console.log('   • Users: ' + readJSON(USERS_FILE).length);
    console.log('   • Modules: ' + readJSON(MODULES_FILE).length);
    console.log('   • Videos: ' + readJSON(VIDEOS_FILE).length);
    console.log('   • Payments: ' + readJSON(PAYMENTS_FILE).length);
    console.log('   • Certificates: ' + readJSON(CERTIFICATES_FILE).length);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const hasRealCreds = process.env.MPESA_CONSUMER_KEY && 
                         process.env.MPESA_CONSUMER_KEY !== 'YOUR_ACTUAL_CONSUMER_KEY_HERE';
    
    if (hasRealCreds) {
        console.log('💚 M-PESA: LIVE MODE (Real payments enabled)');
        console.log('📞 Callback URL: ' + (process.env.MPESA_CALLBACK_URL || 'http://localhost:' + PORT) + '/api/payments/callback');
    } else {
        console.log('💛 M-PESA: SIMULATION MODE (Auto-confirms in 3 seconds)');
        console.log('📝 Add M-Pesa credentials to .env for real payments');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 API READY - ACCEPTING REQUESTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
});

module.exports = app;