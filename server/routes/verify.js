import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// ─── Euclidean Distance ───────────────────────────────────────────────────────
// face-api.js produces L2-normalized 128-d FaceRecognitionNet descriptors.
// The canonical way to compare face-api.js descriptors is Euclidean distance.
// Typical thresholds: < 0.4 = very confident same person, < 0.6 = same person
const euclideanDistance = (a, b) => {
    if (!a || !b || a.length !== b.length || a.length === 0) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
};

// ─── Cosine Similarity ────────────────────────────────────────────────────────
// Used only for voice (Wav2Vec2 embeddings are NOT L2-normalized like face-api.js)
const cosineSimilarity = (a, b) => {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verify/voice
// Legacy route (still used by old verify.js callers), now uses cosine similarity
// ─────────────────────────────────────────────────────────────────────────────
router.post('/voice', async (req, res) => {
    const { email, capturedEmbedding } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !user.voiceEmbedding || user.voiceEmbedding.length === 0) {
            return res.status(400).json({ message: 'No registered voiceprint found for user.' });
        }

        const similarity = cosineSimilarity(user.voiceEmbedding, capturedEmbedding);
        const isMatch = similarity > 0.75;

        res.json({
            isMatch,
            similarityScore: Math.round(similarity * 100),
            message: isMatch ? 'Voiceprint verified' : `Voiceprint did not match (${Math.round(similarity * 100)}% similarity)`
        });
    } catch (err) {
        console.error('Voice Verification Error:', err.message);
        res.status(500).send('Server Error');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verify/face
// Compares face-api.js 128-d FaceRecognitionNet descriptors using Euclidean distance
// face-api.js uses L2-normalized vectors — Euclidean distance < 0.5 means same person
// ─────────────────────────────────────────────────────────────────────────────
router.post('/face', async (req, res) => {
    const { email, capturedEmbedding } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (!user.faceEmbedding || user.faceEmbedding.length === 0) {
            return res.status(400).json({
                message: 'No enrolled face found. Please complete Face Enrollment in Setup first.'
            });
        }

        // Use Euclidean distance — the correct metric for face-api.js L2-normalized descriptors
        const distance = euclideanDistance(user.faceEmbedding, capturedEmbedding);

        // face-api.js recommends threshold 0.6 for real-world data
        // We use 0.5 for extra security (stricter match)
        const THRESHOLD = 0.5;
        const isMatch = distance < THRESHOLD;

        // Convert distance to a confidence percentage for the UI
        // distance=0 → 100%, distance=THRESHOLD → 0%, distance>THRESHOLD → negative (capped at 0)
        const confidence = Math.max(0, Math.round((1 - distance / THRESHOLD) * 100));

        console.log(`[FaceVerify] ${email}: distance=${distance.toFixed(4)}, threshold=${THRESHOLD}, match=${isMatch}, confidence=${confidence}%`);

        res.json({
            isMatch,
            distance: parseFloat(distance.toFixed(4)),
            confidence,
            threshold: THRESHOLD,
            message: isMatch
                ? `Face verified (${confidence}% confidence, distance: ${distance.toFixed(3)})`
                : `Face did not match (distance: ${distance.toFixed(3)}, need < ${THRESHOLD})`
        });

    } catch (err) {
        console.error('Face Verification Error:', err.message);
        res.status(500).send('Server Error');
    }
});

export default router;
