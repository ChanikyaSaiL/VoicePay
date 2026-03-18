/**
 * VoicePay Text-to-Speech Utility
 * Wraps the browser Web Speech API SpeechSynthesis for consistent voice feedback.
 * No API keys, no costs - works entirely client-side.
 */

let currentUtterance = null;

/**
 * Speak a message aloud. Cancels any currently-speaking utterance first.
 * @param {string} text - The text to speak
 * @param {object} options - Optional configuration
 * @param {number} options.rate - Speaking rate (0.5 - 2.0, default 1.0)
 * @param {number} options.pitch - Pitch (0 - 2, default 1.0)
 * @param {number} options.volume - Volume (0 - 1, default 1.0)
 * @param {string} options.lang - Language code, default 'en-IN' for Indian English
 * @returns {Promise<void>} Resolves when speech finishes, rejects on error
 */
export const speak = (text, options = {}) => {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            console.warn('[TTS] SpeechSynthesis not supported in this browser');
            resolve();
            return;
        }

        // Stop any pending speech immediately
        window.speechSynthesis.cancel();

        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = options.rate ?? 1.0;
        utter.pitch = options.pitch ?? 1.0;
        utter.volume = options.volume ?? 1.0;
        utter.lang = options.lang ?? 'en-IN';

        // Pick an English voice preferring Indian accent if available
        const voices = window.speechSynthesis.getVoices();
        const preferred =
            voices.find(v => v.lang === 'en-IN') ||
            voices.find(v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('india')) ||
            voices.find(v => v.lang.startsWith('en'));
        if (preferred) utter.voice = preferred;

        utter.onend = () => resolve();
        utter.onerror = (e) => {
            // 'interrupted' is not a real error — it means we just called cancel()
            if (e.error === 'interrupted') resolve();
            else reject(e);
        };

        currentUtterance = utter;
        window.speechSynthesis.speak(utter);
    });
};

/**
 * Stop any currently-playing speech immediately.
 */
export const stopSpeaking = () => {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
};

/**
 * Preload voices (some browsers load them asynchronously on first use).
 * Call this early in the app lifecycle for best voice selection.
 */
export const preloadVoices = () => {
    if (!window.speechSynthesis) return;
    // Trigger the browser to populate the voices list
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices(); // cache
    };
};

// ─── Pre-built Payment Flow Phrases ──────────────────────────────────────────

export const TTS = {
    // VoiceOverlay / Contact disambiguation
    multipleContacts: (names) =>
        `I found multiple contacts: ${names.join(', and ')}. Please say the full name of the recipient you want to send to.`,

    noContact: (name) =>
        `Sorry, I couldn't find any contact named ${name}. Please try again.`,

    singleContact: (name, amount) =>
        `Sending ₹${amount} to ${name}. Proceeding to authentication.`,

    // PaymentAuth - Voice step
    voicePrompt: (amount, name) =>
        `Please confirm your payment. Say clearly: I confirm payment of ₹${amount} to ${name}.`,

    voicePhrase: (amount, name) =>
        `I confirm payment of ${amount} rupees to ${name}.`,

    voiceFailed: (attemptsLeft) =>
        attemptsLeft > 0
            ? `Voice verification failed. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining. Please try again.`
            : `Voice verification failed 3 times. Switching to face verification.`,

    // PaymentAuth - Face step
    facePrompt: () =>
        `Face verification required. Please look directly at the camera and click Scan Face.`,

    faceFailed: (attemptsLeft) =>
        attemptsLeft > 0
            ? `Face did not match. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining. Please look directly at the camera and try again.`
            : `Face verification failed. Transaction has been halted for security.`,

    // Success
    paymentSuccess: (amount, name) =>
        `Payment of ₹${amount} to ${name} was successful. Your updated balance is being reflected.`,

    // Halted
    halted: () =>
        `Transaction halted due to multiple failed authentication attempts. Please contact support if needed.`,
};
