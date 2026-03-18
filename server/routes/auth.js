import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Generate a random realistic-looking balance between 20,000 and 80,000
const randomBalance = () => Math.floor(Math.random() * (80000 - 20000 + 1) + 20000);

const makeDefaultTransactions = () => {
    const now = new Date();
    return [
        {
            recipientName: 'Salary',
            amount: 45000,
            type: 'received',
            initial: 'SA',
            date: new Date(now - 86400000 * 2) // 2 days ago
        },
        {
            recipientName: 'P. Rahul',
            amount: 500,
            type: 'sent',
            initial: 'PR',
            date: new Date(now - 86400000 * 1) // 1 day ago
        },
        {
            recipientName: 'Coffee Shop',
            amount: 140,
            type: 'sent',
            initial: 'CS',
            date: new Date(now - 3600000 * 3) // 3 hours ago
        }
    ];
};

// Helper to backfill missing transaction data on old legacy accounts
const backfillMockData = async (user) => {
    let modified = false;
    if (user.balance === undefined || user.balance === null || user.balance === 0) {
        user.balance = randomBalance();
        modified = true;
    }
    if (!user.transactions || user.transactions.length === 0) {
        user.transactions = makeDefaultTransactions();
        modified = true;
    }
    if (modified) {
        await user.save();
    }
    return user;
};

// @route   POST /api/auth/register
// @desc    Register a user
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        user = new User({
            name,
            email,
            password,
            balance: randomBalance(),
            transactions: makeDefaultTransactions()
        });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        // Create JWT Payload
        const payload = { user: { id: user.id } };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id, name: user.name, email: user.email, contacts: user.contacts,
                        balance: user.balance, transactions: user.transactions,
                        hasVoiceEnrolled: (user.voiceEmbedding?.length > 0),
                        hasFaceEnrolled:  (user.faceEmbedding?.length  > 0)
                    }
                });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        // Backfill legacy accounts that were made before phase 3
        user = await backfillMockData(user);

        const payload = { user: { id: user.id } };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id, name: user.name, email: user.email, contacts: user.contacts,
                        balance: user.balance, transactions: user.transactions,
                        hasVoiceEnrolled: (user.voiceEmbedding?.length > 0),
                        hasFaceEnrolled:  (user.faceEmbedding?.length  > 0)
                    }
                });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/auth/me
// @desc    Get user data
router.get('/me', async (req, res) => {
    try {
        const token = req.header('x-auth-token');
        if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        let user = await User.findById(decoded.user.id).select('-password');

        if (user) {
            user = await backfillMockData(user);
        } else {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Send user data — include enrollment flags but NOT the raw embedding arrays
        // (embeddings can be 40–768 floats; no need to send them to the client)
        res.json({
            ...user.toObject(),
            hasVoiceEnrolled: (user.voiceEmbedding?.length > 0),
            hasFaceEnrolled:  (user.faceEmbedding?.length  > 0),
            voiceEmbedding: undefined,
            faceEmbedding: undefined
        });
    } catch (err) {
        console.error(err.message);
        res.status(401).json({ message: 'Token is not valid' });
    }
});

// @route   POST /api/auth/update-biometrics
// @desc    Update user biometric embeddings
router.post('/update-biometrics', async (req, res) => {
    const { email, voiceEmbedding, faceEmbedding } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (voiceEmbedding) user.voiceEmbedding = voiceEmbedding;
        if (faceEmbedding) user.faceEmbedding = faceEmbedding;

        await user.save();
        res.json({ message: 'Biometrics updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/auth/update-contacts
// @desc    Update user contacts
router.post('/update-contacts', async (req, res) => {
    const { email, contacts } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (contacts) user.contacts = contacts;

        await user.save();
        res.json({ message: 'Contacts updated successfully', contacts: user.contacts });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

export default router;
