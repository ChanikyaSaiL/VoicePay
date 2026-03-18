import express from 'express';
import multer from 'multer';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import User from '../models/User.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// ─── Cleanup Helper ───────────────────────────────────────────────────────────
const cleanupFiles = (...paths) => {
    for (const p of paths) {
        if (p && fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (_) {}
        }
    }
};

// ─── Audio Conversion: Any browser format → 16kHz mono Float32Array ──────────
const audioToFloat32 = (inputPath) => new Promise((resolve, reject) => {
    const wavPath = `${inputPath}.wav`;

    ffmpeg(inputPath)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('error', (err, _stdout, stderr) => {
            console.error('[VoiceVerify] FFmpeg error:', err.message);
            if (stderr) console.error('[VoiceVerify] FFmpeg stderr:', stderr);
            cleanupFiles(wavPath);
            reject(new Error(`FFmpeg conversion failed: ${err.message}`));
        })
        .on('end', () => {
            try {
                const wavBuffer = fs.readFileSync(wavPath);
                if (!wavBuffer || wavBuffer.length < 44) {
                    throw new Error('FFmpeg produced an empty or invalid WAV file. The recording may be too short.');
                }

                const wav = new WaveFile(wavBuffer);
                wav.toBitDepth('32f');
                wav.toSampleRate(16000);

                let samples = wav.getSamples();

                // getSamples() returns Float64Array (mono) or [Float64Array, Float64Array] (stereo)
                if (Array.isArray(samples)) {
                    if (samples.length > 1) {
                        const len = samples[0].length;
                        const mono = new Float32Array(len);
                        for (let i = 0; i < len; i++) {
                            mono[i] = (samples[0][i] + samples[1][i]) / 2;
                        }
                        samples = mono;
                    } else {
                        samples = samples[0];
                    }
                }

                const float32 = samples instanceof Float32Array ? samples : new Float32Array(samples);

                if (float32.length === 0) {
                    throw new Error('Audio sample array is empty after conversion.');
                }

                console.log(`[VoiceVerify] Audio converted: ${float32.length} samples (~${(float32.length / 16000).toFixed(1)}s)`);
                cleanupFiles(wavPath);
                resolve(float32);
            } catch (e) {
                cleanupFiles(wavPath);
                reject(e);
            }
        })
        .save(wavPath);
});

// ─────────────────────────────────────────────────────────────────────────────
// MFCC Speaker Embedding (Pure JS — no model download required)
// Computes 40 Mel-Frequency Cepstral Coefficients per 25ms frame,
// then mean-pools across all frames → fixed 40-d speaker vector.
// This is the industry-standard lightweight approach for speaker verification.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_RATE   = 16000;
const N_MFCC        = 40;        // number of MFCC coefficients to keep
const N_MELS        = 64;        // Mel filterbank count (more = finer freq resolution)  
const FRAME_LENGTH  = 0.025;     // 25ms window
const FRAME_STEP    = 0.010;     // 10ms hop (75% overlap — standard for speech)
const FFT_SIZE      = 512;       // must be >= frame size in samples

// Precompute Mel filterbank matrix (static, computed once)
const melFilterbank = (() => {
    const frameSize   = Math.floor(FRAME_LENGTH * SAMPLE_RATE); // 400 samples
    const numBins     = FFT_SIZE / 2 + 1;                       // 257 FFT bins

    // Hz ↔ Mel conversions
    const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
    const melToHz = (mel) => 700 * (Math.pow(10, mel / 2595) - 1);

    const lowFreq  = 0;
    const highFreq = SAMPLE_RATE / 2;
    const lowMel   = hzToMel(lowFreq);
    const highMel  = hzToMel(highFreq);

    // N_MELS + 2 evenly spaced Mel-scale points
    const melPoints = Array.from({ length: N_MELS + 2 }, (_, i) =>
        melToHz(lowMel + (i / (N_MELS + 1)) * (highMel - lowMel))
    );

    // Map Mel Hz points to FFT bin indices
    const bins = melPoints.map(hz => Math.floor((hz / (SAMPLE_RATE / 2)) * numBins));

    // Build filterbank: each row is a triangular filter over [bins[m-1], bins[m], bins[m+1]]
    const fb = [];
    for (let m = 1; m <= N_MELS; m++) {
        const filter = new Float64Array(numBins);
        for (let k = bins[m - 1]; k < bins[m]; k++) {
            filter[k] = (k - bins[m - 1]) / (bins[m] - bins[m - 1]);
        }
        for (let k = bins[m]; k < bins[m + 1]; k++) {
            filter[k] = (bins[m + 1] - k) / (bins[m + 1] - bins[m]);
        }
        fb.push(filter);
    }
    return fb;
})();

// Real FFT via Cooley-Tukey (iterative, in-place, power-of-2 size)
const fft = (re, im) => {
    const n = re.length;
    // Bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    // Butterfly passes
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wRe = Math.cos(ang);
        const wIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let uRe = 1, uIm = 0;
            for (let j = 0; j < len / 2; j++) {
                const tRe = uRe * re[i + j + len / 2] - uIm * im[i + j + len / 2];
                const tIm = uRe * im[i + j + len / 2] + uIm * re[i + j + len / 2];
                re[i + j + len / 2] = re[i + j] - tRe;
                im[i + j + len / 2] = im[i + j] - tIm;
                re[i + j] += tRe;
                im[i + j] += tIm;
                const nextURe = uRe * wRe - uIm * wIm;
                uIm = uRe * wIm + uIm * wRe;
                uRe = nextURe;
            }
        }
    }
};

// Compute DCT-II (used for cepstrum step)
const dct = (x) => {
    const N = x.length;
    const out = new Float64Array(N_MFCC);
    const scale = Math.sqrt(2 / N);
    for (let k = 0; k < N_MFCC; k++) {
        let sum = 0;
        for (let n = 0; n < N; n++) {
            sum += x[n] * Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
        }
        out[k] = scale * sum;
    }
    return out;
};

// Hann window function
const hannWindow = (n, N) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));

/**
 * extractMFCC — computes mean-pooled MFCC vector from a Float32Array audio signal.
 * Returns a Float64Array of length N_MFCC (40).
 */
const extractMFCC = (audio) => {
    const frameLen  = Math.floor(FRAME_LENGTH * SAMPLE_RATE); // 400
    const hopLen    = Math.floor(FRAME_STEP   * SAMPLE_RATE); // 160
    const numBins   = FFT_SIZE / 2 + 1;

    const mfccSum = new Float64Array(N_MFCC);
    let frameCount = 0;

    for (let start = 0; start + frameLen <= audio.length; start += hopLen) {
        // Windowed frame — zero-padded to FFT_SIZE
        const re = new Float64Array(FFT_SIZE);
        const im = new Float64Array(FFT_SIZE);
        for (let i = 0; i < frameLen; i++) {
            re[i] = audio[start + i] * hannWindow(i, frameLen);
        }

        fft(re, im);

        // Power spectrum (single-sided)
        const power = new Float64Array(numBins);
        for (let i = 0; i < numBins; i++) {
            power[i] = re[i] * re[i] + im[i] * im[i];
        }

        // Apply Mel filterbank → log energy per Mel band
        const melEnergies = new Float64Array(N_MELS);
        for (let m = 0; m < N_MELS; m++) {
            let energy = 0;
            const fb = melFilterbank[m];
            for (let k = 0; k < numBins; k++) {
                energy += fb[k] * power[k];
            }
            melEnergies[m] = Math.log(energy + 1e-10); // log for perceptual scaling
        }

        // DCT → MFCC coefficients
        const mfcc = dct(melEnergies);
        for (let k = 0; k < N_MFCC; k++) {
            mfccSum[k] += mfcc[k];
        }
        frameCount++;
    }

    if (frameCount === 0) {
        throw new Error('Audio too short to extract MFCC features (need at least 25ms).');
    }

    // Mean pooling across all frames
    const embedding = new Float64Array(N_MFCC);
    for (let k = 0; k < N_MFCC; k++) {
        embedding[k] = mfccSum[k] / frameCount;
    }

    return embedding;
};

// ─── Cosine Similarity ────────────────────────────────────────────────────────
const cosineSimilarity = (a, b) => {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot   += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return (normA === 0 || normB === 0) ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/voice/enroll
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/enroll', upload.single('audio'), async (req, res) => {
    const inputPath = req.file?.path;
    const { email }  = req.body;

    if (!email) {
        cleanupFiles(inputPath);
        return res.status(400).json({ message: 'Email is required.' });
    }
    if (!inputPath) {
        return res.status(400).json({ message: 'No audio file received. Please allow microphone access and try again.' });
    }

    console.log(`[VoiceVerify] Enroll request — ${email}, size: ${req.file.size} bytes`);

    if (req.file.size < 1000) {
        cleanupFiles(inputPath);
        return res.status(400).json({ message: 'Recording too short. Please hold the button and speak for at least 3 seconds.' });
    }

    try {
        const audioData = await audioToFloat32(inputPath);
        cleanupFiles(inputPath);

        if (audioData.length < 16000) {
            return res.status(400).json({ message: 'Recording too short. Please speak for at least 2 seconds.' });
        }

        const embedding = Array.from(extractMFCC(audioData));

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found.' });

        user.voiceEmbedding = embedding;
        await user.save();

        console.log(`[VoiceVerify] ✅ Voice enrolled for ${email} — ${embedding.length} MFCC dims`);
        res.json({ message: 'Voice enrolled successfully.', dimensions: embedding.length });

    } catch (err) {
        console.error('[VoiceVerify] ❌ Enrollment error:', err.message);
        console.error(err.stack);
        cleanupFiles(inputPath);
        res.status(500).json({ message: `Failed to enroll voice: ${err.message}` });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/voice/verify
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/verify', upload.single('audio'), async (req, res) => {
    const inputPath = req.file?.path;
    const { email }  = req.body;

    if (!email) {
        cleanupFiles(inputPath);
        return res.status(400).json({ message: 'Email is required.' });
    }
    if (!inputPath) {
        return res.status(400).json({ message: 'No audio file received.' });
    }

    console.log(`[VoiceVerify] Verify request — ${email}, size: ${req.file.size} bytes`);

    try {
        const user = await User.findOne({ email });
        if (!user) {
            cleanupFiles(inputPath);
            return res.status(404).json({ message: 'User not found.' });
        }
        if (!user.voiceEmbedding || user.voiceEmbedding.length === 0) {
            cleanupFiles(inputPath);
            return res.status(400).json({ message: 'No enrolled voice found. Please complete voice enrollment first.' });
        }
        if (req.file.size < 1000) {
            cleanupFiles(inputPath);
            return res.status(400).json({ message: 'Recording too short. Please speak your passphrase clearly.' });
        }

        const audioData = await audioToFloat32(inputPath);
        cleanupFiles(inputPath);

        if (audioData.length < 16000) {
            return res.status(400).json({ message: 'Recording too short. Please speak for at least 2 seconds.' });
        }

        const liveEmbedding   = Array.from(extractMFCC(audioData));
        const storedEmbedding = Array.from(user.voiceEmbedding);
        const similarity      = cosineSimilarity(storedEmbedding, liveEmbedding);

        // MFCC cosine similarity threshold.
        // Typical same-speaker MFCC cosine similarity: > 0.92–0.98
        // Different speaker: 0.70–0.88
        const THRESHOLD = 0.92;
        const isMatch   = similarity >= THRESHOLD;

        console.log(`[VoiceVerify] ${email}: similarity=${similarity.toFixed(4)}, threshold=${THRESHOLD}, match=${isMatch}`);

        res.json({
            isMatch,
            similarityScore: Math.round(similarity * 100),
            threshold: Math.round(THRESHOLD * 100),
            message: isMatch
                ? `Voiceprint matched (${Math.round(similarity * 100)}% similarity)`
                : `Voiceprint did not match (${Math.round(similarity * 100)}% similarity, need ${Math.round(THRESHOLD * 100)}%)`
        });

    } catch (err) {
        console.error('[VoiceVerify] ❌ Verification error:', err.message);
        console.error(err.stack);
        cleanupFiles(inputPath);
        res.status(500).json({ message: `Failed to verify voiceprint: ${err.message}` });
    }
});

export default router;
