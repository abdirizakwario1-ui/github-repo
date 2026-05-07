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
const SECRET = process.env.JWT_SECRET || 'abrizak-secret-key-2026';

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============ DATA SETUP ============
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const MODULES_FILE = path.join(DATA_DIR, 'modules.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize data files if they don't exist
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]');
}
if (!fs.existsSync(VIDEOS_FILE)) {
    fs.writeFileSync(VIDEOS_FILE, '[]');
}
if (!fs.existsSync(TRANSACTIONS_FILE)) {
    fs.writeFileSync(TRANSACTIONS_FILE, '[]');
}
if (!fs.existsSync(MODULES_FILE)) {
    const defaultModules = [
        { id: "1", number: 1, title: "Getting Started", description: "Foundation principles and mindset for online success", icon: "🎯", status: "active", videoCount: 0 },
        { id: "2", number: 2, title: "Making Your First $100", description: "Step-by-step methods to get your first income online", icon: "💰", status: "active", videoCount: 0 },
        { id: "3", number: 3, title: "M-Pesa Money Secrets", description: "Kenya-specific strategies using mobile money", icon: "📱", status: "active", videoCount: 0 },
        { id: "4", number: 4, title: "International Freelancing", description: "Earn USD from global platforms while in Kenya", icon: "🌍", status: "active", videoCount: 0 },
        { id: "5", number: 5, title: "AI Money Machines", description: "Using AI tools to scale your online income", icon: "🤖", status: "coming_soon", videoCount: 0 },
        { id: "6", number: 6, title: "Scaling to 6 Figures", description: "Advanced strategies for serious earners", icon: "📈", status: "coming_soon", videoCount: 0 }
    ];
    fs.writeFileSync(MODULES_FILE, JSON.stringify(defaultModules, null, 2));
}

// Helper functions for JSON file operations
function readJSON(file) {
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${file}:`, error);
        return [];
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${file}:`, error);
        return false;
    }
}

// ============ M-PESA SETUP ============
let mpesaToken = null;
let tokenExpiry = null;

/**
 * Get M-Pesa access token from Safaricom
 * Uses Consumer Key and Consumer Secret from environment variables
 */
async function getMpesaToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    
    console.log('KEY:', consumerKey?.slice(0, 8));
    console.log('SECRET:', consumerSecret?.slice(0, 8));
    console.log(process.env.MPESA_CONSUMER_KEY);
    
    // Check if we have real credentials
    if (!consumerKey || 
        consumerKey === 'YOUR_ACTUAL_CONSUMER_KEY_HERE' || 
        consumerKey === 'YOUR_CONSUMER_KEY_HERE' ||
        consumerKey === '') {
        console.log('⚠️ No valid M-Pesa credentials found');
        return null;
    }
    
    // Return cached token if still valid
    if (mpesaToken && tokenExpiry > Date.now()) {
        console.log('📦 Using cached M-Pesa token');
        return mpesaToken;
    }
    
    try {
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            { 
                headers: { 
                    'Authorization': `Basic ${auth}` 
                },
                timeout: 30000
            }
        );
        
        if (response.data && response.data.access_token) {
            mpesaToken = response.data.access_token;
            tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
            console.log('✅ M-Pesa token obtained successfully');
            return mpesaToken;
        } else {
            console.error('❌ Invalid response from M-Pesa token endpoint');
            return null;
        }
    } catch (error) {
        console.error('❌ M-Pesa token failed:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Generate timestamp in required format (YYYYMMDDHHmmss)
 */
function getTimestamp() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Generate password for STK Push request
 * Combines shortcode, passkey, and timestamp, then SHA256 encrypts
 */
function generatePassword(timestamp) {
    const passkey = process.env.MPESA_PASSKEY;
    const shortcode = process.env.MPESA_SHORTCODE;

    if (!passkey || !shortcode) {
        console.error('Missing MPESA_PASSKEY or MPESA_SHORTCODE');
        return null;
    }

    const str = shortcode + passkey + timestamp;
    return Buffer.from(str).toString('base64');
}

/**
 * Format Kenyan phone number to international format (254XXXXXXXX)
 * Handles various input formats: 07XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX, 7XXXXXXXX
 */
function formatPhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove all non-digit characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    console.log(`📞 Phone formatting - Original: ${phone}, Cleaned: ${cleaned}`);
    
    // Handle different formats
    if (cleaned.length === 10 && cleaned.startsWith('07')) {
        // 0712345678 -> 254712345678
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.length === 10 && cleaned.startsWith('01')) {
        // 0112345678 -> 254112345678
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.length === 9 && cleaned.startsWith('7')) {
        // 712345678 -> 254712345678
        cleaned = '254' + cleaned;
    } else if (cleaned.length === 9 && cleaned.startsWith('1')) {
        // 112345678 -> 254112345678
        cleaned = '254' + cleaned;
    } else if (cleaned.length === 12 && cleaned.startsWith('254')) {
        // 254712345678 -> keep as is
        cleaned = cleaned;
    } else if (cleaned.length === 13 && cleaned.startsWith('254')) {
        // Remove extra digit if accidentally added
        cleaned = cleaned.substring(0, 12);
    } else if (cleaned.length === 13 && cleaned.startsWith('+254')) {
        // +254712345678 -> 254712345678
        cleaned = cleaned.substring(1);
    }
    
    console.log(`📞 Phone formatting - Result: ${cleaned}`);
    return cleaned;
}

/**
 * Validate if phone number is correctly formatted for M-Pesa
 */
function isValidKenyanPhone(phone) {
    const formatted = formatPhoneNumber(phone);
    const isValid = formatted && formatted.length === 12 && formatted.startsWith('254');
    console.log(`📞 Phone validation - Input: ${phone}, Formatted: ${formatted}, Valid: ${isValid}`);
    return isValid;
}

// Store pending transactions for callback handling
const pendingPayments = new Map();

// ============ HEALTH CHECK ENDPOINTS ============
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server running!',
        timestamp: new Date().toISOString(),
        mpesaMode: process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_KEY !== 'YOUR_ACTUAL_CONSUMER_KEY_HERE' ? 'real' : 'simulation'
    });
});

app.get('/api/health/detailed', (req, res) => {
    const hasMpesaCreds = !!(process.env.MPESA_CONSUMER_KEY && 
                             process.env.MPESA_CONSUMER_KEY !== 'YOUR_ACTUAL_CONSUMER_KEY_HERE' &&
                             process.env.MPESA_PASSKEY &&
                             process.env.MPESA_SHORTCODE);
    
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        configuration: {
            mpesaConfigured: hasMpesaCreds,
            mpesaMode: hasMpesaCreds ? 'real' : 'simulation',
            environment: process.env.MPESA_ENVIRONMENT || 'sandbox',
            callbackUrl: process.env.MPESA_CALLBACK_URL || 'not set'
        }
    });
});

// ============ PHONE NUMBER TEST ENDPOINT ============
app.post('/api/mpesa/test-phone', (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    const formatted = formatPhoneNumber(phone);
    const isValid = isValidKenyanPhone(phone);
    
    res.json({ 
        original: phone, 
        formatted: formatted,
        isValid: isValid,
        length: formatted.length,
        startsWith: formatted.substring(0, 3)
    });
});

// ============ AUTHENTICATION ROUTES ============

/**
 * User Signup
 * Creates a new user account
 */
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, phone, password } = req.body;
    
    console.log(`📝 Signup attempt: ${email}`);
    
    // Validate required fields
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate password strength
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    try {
        const users = readJSON(USERS_FILE);
        
        // Check if user already exists
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Format phone number if provided
        let formattedPhone = '';
        if (phone) {
            formattedPhone = formatPhoneNumber(phone);
        }
        
        // Create new user object
        const newUser = {
            id: Date.now().toString(),
            name: name.trim(),
            email: email.toLowerCase().trim(),
            phone: formattedPhone,
            password: hashedPassword,
            paid: false,
            paymentMethod: null,
            paidAt: null,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        
        users.push(newUser);
        writeJSON(USERS_FILE, users);
        
        // Generate JWT token
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email }, 
            SECRET, 
            { expiresIn: '30d' }
        );
        
        console.log(`✅ User created: ${email}`);
        
        res.json({ 
            success: true, 
            token, 
            user: { 
                id: newUser.id, 
                name: newUser.name, 
                email: newUser.email, 
                paid: false 
            } 
        });
    } catch (error) {
        console.error('❌ Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * User Login
 * Authenticates existing user
 */
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log(`🔐 Login attempt: ${email}`);
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    
    try {
        const users = readJSON(USERS_FILE);
        const user = users.find(u => u.email === email.toLowerCase().trim());
        
        if (!user) {
            console.log(`❌ Login failed: User not found - ${email}`);
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log(`❌ Login failed: Invalid password - ${email}`);
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Update last login timestamp
        user.lastLogin = new Date().toISOString();
        writeJSON(USERS_FILE, users);
        
        const token = jwt.sign(
            { id: user.id, email: user.email }, 
            SECRET, 
            { expiresIn: '30d' }
        );
        
        console.log(`✅ User logged in: ${email}, Paid: ${user.paid}`);
        
        res.json({ 
            success: true, 
            token, 
            paid: user.paid, 
            name: user.name,
            email: user.email
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Verify JWT Token
 * Checks if token is valid and returns user status
 */
app.get('/api/auth/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ valid: false, error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, SECRET);
        const users = readJSON(USERS_FILE);
        const user = users.find(u => u.id === decoded.id);
        
        if (!user) {
            return res.status(401).json({ valid: false, error: 'User not found' });
        }
        
        res.json({ 
            valid: true, 
            paid: user.paid || false,
            email: user.email,
            name: user.name
        });
    } catch (error) {
        console.error('❌ Token verification error:', error.message);
        res.status(401).json({ valid: false, error: 'Invalid token' });
    }
});

// ============ M-PESA STK PUSH ROUTE ============

/**
 * Initiate M-Pesa STK Push payment
 * Sends payment request to customer's phone
 */
app.post('/api/mpesa/stkpush', async (req, res) => {
    const { phone, amount, email, name } = req.body;
    
    console.log('📱 Payment request received:', { phone, amount, email });
    
    // Validate required fields
    if (!phone || !amount) {
        return res.status(400).json({ error: 'Phone number and amount are required' });
    }
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    // Format and validate phone number
    let formattedPhone;
    try {
        formattedPhone = formatPhoneNumber(phone);
        console.log('📞 Formatted phone number:', formattedPhone);
        
        if (!formattedPhone || formattedPhone.length !== 12 || !formattedPhone.startsWith('254')) {
            return res.status(400).json({ 
                error: 'Invalid phone number format. Please use format: 0712345678 or 254712345678',
                hint: 'Example: 254712345678 or 0712345678'
            });
        }
    } catch (err) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }
    
    // Check for real M-Pesa credentials in environment
    const hasRealCreds = process.env.MPESA_CONSUMER_KEY && 
                         process.env.MPESA_CONSUMER_KEY !== 'YOUR_ACTUAL_CONSUMER_KEY_HERE' &&
                         process.env.MPESA_CONSUMER_KEY !== 'YOUR_CONSUMER_KEY_HERE' &&
                         process.env.MPESA_CONSUMER_KEY !== '' &&
                         process.env.MPESA_PASSKEY &&
                         process.env.MPESA_PASSKEY !== '' &&
                         process.env.MPESA_SHORTCODE &&
                         process.env.MPESA_SHORTCODE !== '';
    
    // ============ SIMULATION MODE ============
    if (!hasRealCreds) {
        console.log(`🔵 SIMULATION MODE: Processing payment for ${email} - KES ${amount}`);
        
        // Auto-confirm payment after 3 seconds
        setTimeout(() => {
            const users = readJSON(USERS_FILE);
            const user = users.find(u => u.email === email);
            if (user && !user.paid) {
                user.paid = true;
                user.paidAt = new Date().toISOString();
                user.paymentMethod = 'simulation';
                user.paidAmount = amount;
                writeJSON(USERS_FILE, users);
                console.log(`✅ SIMULATION: User ${email} marked as paid`);
            }
        }, 3000);
        
        return res.json({
            ResponseCode: '0',
            ResponseDescription: 'Success (Simulation Mode)',
            CustomerMessage: '✅ SIMULATION: Payment will auto-confirm in 3 seconds',
            CheckoutRequestID: `SIM_${Date.now()}`
        });
    }
    
    // ============ REAL M-PESA MODE ============
    try {
        // Get M-Pesa access token
        const token = await getMpesaToken();
        if (!token) {
            throw new Error('Failed to obtain M-Pesa access token. Please check your credentials.');
        }
        
        // Prepare STK Push request parameters
        const timestamp = getTimestamp();
        const password = generatePassword(timestamp);
        
        if (!password) {
            throw new Error('Failed to generate password. Check MPESA_PASSKEY and MPESA_SHORTCODE.');
        }
        
        const shortcode = process.env.MPESA_SHORTCODE;
        
        console.log('🔍 DEBUG PASSWORD GENERATION:');
        console.log('Shortcode:', shortcode);
        console.log('Passkey:', process.env.MPESA_PASSKEY?.slice(0, 5) + '...');
        console.log('Timestamp:', timestamp);
        console.log('Generated Password:', password);
        const callbackUrl = process.env.MPESA_CALLBACK_URL || `https://${req.get('host')}/api/mpesa/callback`;
        
        // Generate unique account reference from email
        const accountReference = email.split('@')[0].substring(0, 20) || `ABZ${Date.now()}`;
        
        const requestBody = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.round(amount),
            PartyA: formattedPhone,
            PartyB: shortcode,
            PhoneNumber: formattedPhone,
            CallBackURL: callbackUrl,
            AccountReference: accountReference,
            TransactionDesc: 'Abdirizak Academy Payment'
        };
        
        console.log('📤 Sending STK Push request to Safaricom...');
        console.log('Request details:', {
            phone: formattedPhone,
            amount: amount,
            shortcode: shortcode,
            accountRef: accountReference
        });
        
        // Send STK Push request to Safaricom
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            requestBody,
            { 
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
                timeout: 30000
            }
        );
        
        console.log('📥 Safaricom STK Push response:', response.data);
        
        // Handle successful STK Push
        if (response.data && response.data.ResponseCode === '0') {
            const checkoutId = response.data.CheckoutRequestID;
            
            // Store pending payment for callback
            pendingPayments.set(checkoutId, {
                email: email,
                name: name,
                phone: formattedPhone,
                amount: amount,
                checkoutRequestId: checkoutId,
                timestamp: new Date().toISOString(),
                status: 'pending'
            });
            
            // Also store in transactions file
            const transactions = readJSON(TRANSACTIONS_FILE);
            transactions.push({
                id: checkoutId,
                email: email,
                amount: amount,
                phone: formattedPhone,
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            writeJSON(TRANSACTIONS_FILE, transactions);
            
            console.log(`✅ STK Push sent successfully. CheckoutID: ${checkoutId}`);
            
            res.json({
                ResponseCode: response.data.ResponseCode,
                ResponseDescription: response.data.ResponseDescription,
                CustomerMessage: 'STK Push sent! Check your phone and enter your PIN.',
                CheckoutRequestID: checkoutId
            });
        } else {
            // Handle Safaricom error response
            const errorMsg = response.data?.ResponseDescription || 'STK Push request failed';
            console.error('❌ Safaricom error:', errorMsg);
            res.status(400).json({
                error: errorMsg,
                ResponseCode: response.data?.ResponseCode || '1'
            });
        }
    } catch (error) {
        console.error('❌ M-Pesa STK Push error:', error.response?.data || error.message);
        
        let errorMessage = 'Payment processing failed. ';
        if (error.response?.data?.errorMessage) {
            errorMessage += error.response.data.errorMessage;
        } else if (error.response?.data?.ResponseDescription) {
            errorMessage += error.response.data.ResponseDescription;
        } else if (error.code === 'ECONNABORTED') {
            errorMessage += 'Request timed out. Please try again.';
        } else if (error.message.includes('token')) {
            errorMessage += 'Authentication failed. Please contact support.';
        } else {
            errorMessage += 'Please check your phone number and try again.';
        }
        
        res.status(500).json({ error: errorMessage });
    }
});

// ============ M-PESA CALLBACK ROUTE ============

/**
 * M-Pesa Callback endpoint
 * Safaricom calls this after customer completes payment
 */
app.post('/api/mpesa/callback', (req, res) => {
    console.log('📞 M-Pesa Callback received at:', new Date().toISOString());
    console.log('Callback body:', JSON.stringify(req.body, null, 2));
    
    const { Body } = req.body;
    
    if (Body && Body.stkCallback) {
        const { 
            ResultCode, 
            ResultDesc, 
            CheckoutRequestID, 
            CallbackMetadata 
        } = Body.stkCallback;
        
        console.log(`Callback Result: ${ResultCode} - ${ResultDesc}`);
        console.log(`CheckoutRequestID: ${CheckoutRequestID}`);
        
        if (ResultCode === 0) {
            // Payment successful
            const payment = pendingPayments.get(CheckoutRequestID);
            
            if (payment && payment.email) {
                const users = readJSON(USERS_FILE);
                const user = users.find(u => u.email === payment.email);
                
                if (user && !user.paid) {
                    // Mark user as paid
                    user.paid = true;
                    user.paidAt = new Date().toISOString();
                    user.paymentMethod = 'mpesa';
                    user.paidAmount = payment.amount;
                    
                    // Extract receipt number from callback metadata
                    if (CallbackMetadata && CallbackMetadata.Item) {
                        const receiptItem = CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber');
                        if (receiptItem) {
                            user.mpesaReceipt = receiptItem.Value;
                        }
                        
                        const amountItem = CallbackMetadata.Item.find(i => i.Name === 'Amount');
                        if (amountItem) {
                            user.paidAmount = amountItem.Value;
                        }
                    }
                    
                    writeJSON(USERS_FILE, users);
                    console.log(`✅✅ User ${payment.email} marked as paid via M-Pesa!`);
                    
                    // Update transaction status
                    const transactions = readJSON(TRANSACTIONS_FILE);
                    const transaction = transactions.find(t => t.id === CheckoutRequestID);
                    if (transaction) {
                        transaction.status = 'completed';
                        transaction.completedAt = new Date().toISOString();
                        writeJSON(TRANSACTIONS_FILE, transactions);
                    }
                }
                
                // Remove from pending payments
                pendingPayments.delete(CheckoutRequestID);
            } else {
                console.log(`⚠️ Payment record not found for CheckoutID: ${CheckoutRequestID}`);
            }
        } else {
            // Payment failed
            console.log(`❌ Payment failed: ${ResultDesc}`);
            
            const payment = pendingPayments.get(CheckoutRequestID);
            if (payment) {
                // Update transaction status
                const transactions = readJSON(TRANSACTIONS_FILE);
                const transaction = transactions.find(t => t.id === CheckoutRequestID);
                if (transaction) {
                    transaction.status = 'failed';
                    transaction.failedReason = ResultDesc;
                    writeJSON(TRANSACTIONS_FILE, transactions);
                }
                pendingPayments.delete(CheckoutRequestID);
            }
        }
    } else {
        console.log('⚠️ Invalid callback body received');
    }
    
    // Always respond with success to Safaricom
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
});

// ============ PAYMENT STATUS CHECK ============

/**
 * Check payment status for a user
 */
app.get('/api/mpesa/check-status', (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).json({ error: 'Email required' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    
    res.json({ 
        paid: user?.paid || false,
        paidAt: user?.paidAt || null,
        paymentMethod: user?.paymentMethod || null,
        email: email
    });
});

/**
 * Get transaction details
 */
app.get('/api/mpesa/transaction/:id', (req, res) => {
    const { id } = req.params;
    const transactions = readJSON(TRANSACTIONS_FILE);
    const transaction = transactions.find(t => t.id === id);
    
    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(transaction);
});

// ============ ADMIN ROUTES ============

/**
 * Get all users (Admin only - no auth for simplicity, add auth in production)
 */
app.get('/api/admin/users', (req, res) => {
    const users = readJSON(USERS_FILE);
    const safeUsers = users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        paid: u.paid,
        paymentMethod: u.paymentMethod,
        paidAt: u.paidAt,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
    }));
    res.json(safeUsers);
});

/**
 * Mark a user as paid manually (Admin)
 */
app.post('/api/admin/mark-paid', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email required' });
    }
    
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.paid = true;
    user.paidAt = new Date().toISOString();
    user.paymentMethod = 'admin_manual';
    writeJSON(USERS_FILE, users);
    
    console.log(`👑 Admin marked user as paid: ${email}`);
    res.json({ success: true, message: `User ${email} marked as paid` });
});

/**
 * Get all videos
 */
app.get('/api/admin/videos', (req, res) => {
    const videos = readJSON(VIDEOS_FILE);
    res.json(videos);
});

/**
 * Add a new video (Admin)
 */
app.post('/api/admin/videos', (req, res) => {
    const { moduleId, title, url, duration, description, order } = req.body;
    
    if (!title || !url) {
        return res.status(400).json({ error: 'Title and URL are required' });
    }
    
    const videos = readJSON(VIDEOS_FILE);
    const newVideo = {
        id: Date.now().toString(),
        moduleId: moduleId || '1',
        title: title,
        url: url,
        duration: duration || 15,
        description: description || '',
        order: order || videos.length + 1,
        createdAt: new Date().toISOString()
    };
    
    videos.push(newVideo);
    writeJSON(VIDEOS_FILE, videos);
    
    console.log(`🎬 Video added: ${title}`);
    res.json(newVideo);
});

/**
 * Delete a video (Admin)
 */
app.delete('/api/admin/videos/:id', (req, res) => {
    const { id } = req.params;
    const videos = readJSON(VIDEOS_FILE);
    const filtered = videos.filter(v => v.id !== id);
    
    if (filtered.length === videos.length) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    writeJSON(VIDEOS_FILE, filtered);
    console.log(`🗑️ Video deleted: ${id}`);
    res.json({ success: true });
});

/**
 * Get admin dashboard statistics
 */
app.get('/api/admin/stats', (req, res) => {
    const users = readJSON(USERS_FILE);
    const videos = readJSON(VIDEOS_FILE);
    const transactions = readJSON(TRANSACTIONS_FILE);
    
    const paidUsers = users.filter(u => u.paid);
    const totalRevenue = paidUsers.reduce((sum, u) => sum + (u.paidAmount || 1000), 0);
    
    res.json({
        totalUsers: users.length,
        paidUsers: paidUsers.length,
        totalVideos: videos.length,
        totalRevenue: totalRevenue,
        pendingPayments: pendingPayments.size,
        recentUsers: users.slice(-10).reverse(),
        recentTransactions: transactions.slice(-10).reverse()
    });
});

/**
 * Get all modules
 */
app.get('/api/admin/modules', (req, res) => {
    const modules = readJSON(MODULES_FILE);
    res.json(modules);
});

// ============ USER PROTECTED ROUTES ============

/**
 * Get videos for authenticated users (must be paid)
 */
app.get('/api/user/videos', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    
    try {
        const decoded = jwt.verify(token, SECRET);
        const users = readJSON(USERS_FILE);
        const user = users.find(u => u.id === decoded.id);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        if (!user.paid) {
            return res.status(403).json({ 
                error: 'Payment required. Please complete your payment to access content.',
                paid: false 
            });
        }
        
        const videos = readJSON(VIDEOS_FILE);
        const modules = readJSON(MODULES_FILE);
        
        res.json({
            videos: videos,
            modules: modules,
            user: {
                name: user.name,
                email: user.email,
                paid: true,
                paidAt: user.paidAt
            }
        });
    } catch (error) {
        console.error('❌ Token verification error:', error.message);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

/**
 * Get user profile
 */
app.get('/api/user/profile', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const decoded = jwt.verify(token, SECRET);
        const users = readJSON(USERS_FILE);
        const user = users.find(u => u.id === decoded.id);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            paid: user.paid,
            paidAt: user.paidAt,
            createdAt: user.createdAt
        });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// ============ ADMIN AUTH ============
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@abdirizakacademy.com';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

/**
 * Admin login
 */
app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (email !== ADMIN_EMAIL) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ role: 'admin', email }, SECRET, { expiresIn: '30d' });
    res.json({ token });
});

/**
 * Verify admin token
 */
app.get('/api/admin/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ valid: false });
    }
    
    try {
        const decoded = jwt.verify(token, SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ valid: false });
        }
        res.json({ valid: true });
    } catch {
        res.status(401).json({ valid: false });
    }
});

// ============ ERROR HANDLING MIDDLEWARE ============
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('✅ Abdirizak Academy Backend Running!');
    console.log('========================================');
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🔐 Admin Login: http://localhost:${PORT}/admin-login.html`);
    console.log(`💚 Health Check: http://localhost:${PORT}/api/health`);
    console.log('========================================');
    
    // Check M-Pesa configuration status
    const hasConsumerKey = process.env.MPESA_CONSUMER_KEY && 
                           process.env.MPESA_CONSUMER_KEY !== 'YOUR_ACTUAL_CONSUMER_KEY_HERE' &&
                           process.env.MPESA_CONSUMER_KEY !== 'YOUR_CONSUMER_KEY_HERE' &&
                           process.env.MPESA_CONSUMER_KEY !== '';
    
    const hasPasskey = process.env.MPESA_PASSKEY && process.env.MPESA_PASSKEY !== '';
    const hasShortcode = process.env.MPESA_SHORTCODE && process.env.MPESA_SHORTCODE !== '';
    
    const hasRealCreds = hasConsumerKey && hasPasskey && hasShortcode;
    
    if (hasRealCreds) {
        console.log('💚 M-Pesa: REAL API MODE (Live payments enabled)');
        console.log('📱 Test with: 254708374149 (PIN: 123456)');
        console.log(`📞 Callback URL: ${process.env.MPESA_CALLBACK_URL || 'not set'}`);
    } else {
        console.log('💛 M-Pesa: SIMULATION MODE (Auto-confirms in 3 seconds)');
        if (!hasConsumerKey) console.log('   ⚠️ Missing MPESA_CONSUMER_KEY');
        if (!hasPasskey) console.log('   ⚠️ Missing MPESA_PASSKEY');
        if (!hasShortcode) console.log('   ⚠️ Missing MPESA_SHORTCODE');
        console.log('📝 Add your M-Pesa credentials to Render Environment Variables for real payments');
    }
    console.log('========================================\n');
});

// Export for testing
module.exports = app;