import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// @route   POST /api/payment/process
// @desc    Deduct amount from balance and record transaction
router.post('/process', async (req, res) => {
    const { email, amount, recipientName } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const deduction = parseFloat(amount);
        if (isNaN(deduction) || deduction <= 0) {
            return res.status(400).json({ message: 'Invalid payment amount' });
        }

        if (user.balance < deduction) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        // Deduct balance
        user.balance -= deduction;

        // Create transaction record
        const initials = recipientName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        user.transactions.unshift({
            recipientName,
            amount: deduction,
            type: 'sent',
            initial: initials,
            date: new Date() // Add current date for proper analytics filtering
        }); // unshift puts it at the top of the array

        // We could limit the transaction history array size here if we wanted, 
        // e.g., if (user.transactions.length > 50) user.transactions.pop();

        await user.save();

        res.json({
            message: 'Payment processed successfully',
            newBalance: user.balance,
            transaction: user.transactions[0]
        });

    } catch (err) {
        console.error("Payment Processing Error:", err.message);
        res.status(500).json({ message: 'Server Error during payment processing' });
    }
});

export default router;
