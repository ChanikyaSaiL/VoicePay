import express from 'express';
import multer from 'multer';
import { pipeline, env } from '@xenova/transformers';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';

// Set fluent-ffmpeg to use the locally installed static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

// Configure transformers stack
// Disable local file checks to allow dynamic model downloading on first run
env.allowLocalModels = false;
env.useBrowserCache = false;

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Cache the Whisper model pipeline singleton for performance
let transcriber = null;

const getTranscriber = async () => {
    if (!transcriber) {
        console.log("Loading Local Whisper Model (Xenova/whisper-tiny.en) into memory... This may take a minute on first boot.");
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        console.log("Local Whisper Model Loaded Successfully!");
    }
    return transcriber;
};

// @route   POST /api/speech/transcribe
// @desc    Accepts an audio file and transcribes it entirely locally using Transformers.js
router.post('/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No audio file provided' });
        }

        // Transformers.js Whisper requires precisely 16kHz, mono-channel PCM Float32 audio.
        // Step 1: Transcode incoming Chrome WebM/MP4 into a 16kHz WAV file.
        const inputPath = req.file.path;
        const wavPath = `${inputPath}.wav`;

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('wav')
                .audioChannels(1)
                .audioFrequency(16000)
                .on('error', (err, stdout, stderr) => {
                    console.error('FFmpeg error:', err);
                    console.error('FFmpeg stdout:', stdout);
                    console.error('FFmpeg stderr:', stderr);
                    reject(err);
                })
                .on('end', () => {
                    resolve();
                })
                .save(wavPath);
        });

        // Step 2: Read the transcoded WAV file
        const wavBuffer = fs.readFileSync(wavPath);

        // Step 3: Parse the WAV into a Float32Array using the WaveFile library
        const wav = new WaveFile(wavBuffer);

        // Ensure standard formatting
        wav.toBitDepth('32f');
        wav.toSampleRate(16000);
        let audioData = wav.getSamples();

        // If stereo was somehow preserved, flatten it to mono
        if (Array.isArray(audioData)) {
            if (audioData.length > 1) {
                const SCALING_FACTOR = Math.sqrt(2);
                for (let i = 0; i < audioData[0].length; ++i) {
                    audioData[0][i] = (SCALING_FACTOR * (audioData[0][i] + audioData[1][i])) / 2;
                }
            }
            audioData = audioData[0];
        }

        // Step 4: Run the Local AI Pipeline
        const whisper = await getTranscriber();
        const result = await whisper(audioData);

        // Clean up the temporary files
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);

        res.json({ transcript: result.text });
    } catch (err) {
        console.error("============= SPEECH RECOGNITION ERROR =============");
        console.error("Name:", err.name);
        console.error("Message:", err.message);
        console.error("Stack:", err.stack);
        if (err.response) {
            console.error("Response Status:", err.response.status);
            console.error("Response Data:", err.response.data);
        }
        console.error("====================================================");

        // Ensure cleanup even on error
        if (req.file) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            if (fs.existsSync(`${req.file.path}.wav`)) fs.unlinkSync(`${req.file.path}.wav`);
        }
        res.status(500).json({ message: 'Failed to transcribe audio' });
    }
});

export default router;
