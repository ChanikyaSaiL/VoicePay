import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import verifyRoutes from './routes/verify.js';
import speechRoutes from './routes/speech.js';
import paymentRoutes from './routes/payment.js';
import voiceVerifyRoutes from './routes/voiceVerify.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5005;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voicepay', {
            // options not strictly needed for Mongoose 6+, but good practice
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        console.log('Ensure you have provided a valid MONGODB_URI in your .env file!');
        process.exit(1);
    }
};

connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/speech', speechRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/voice', voiceVerifyRoutes);

// Detailed Root Check
app.get('/', (req, res) => {
    res.send('VoicePay API Server is running');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
