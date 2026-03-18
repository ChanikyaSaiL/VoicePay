import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    // Phase 0: Biometric Enrollments
    voiceEmbedding: {
        type: [Number], // Storing vector as array of numbers
        default: null
    },
    faceEmbedding: {
        type: [Number],
        default: null
    },
    fingerprintConfigured: {
        type: Boolean,
        default: false
    },
    // Phase 0: Contacts
    contacts: [{
        name: String,
        phoneNumber: String,
        upiId: String
    }],
    // Phase 3: Payment Processing (Wallet & History)
    balance: {
        type: Number,
        default: 15000 // Give new users 15,000 mock INR for testing
    },
    transactions: [{
        recipientName: String,
        amount: Number,
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ['sent', 'received'], default: 'sent' },
        initial: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('User', userSchema);
