import { useState, useRef, useCallback } from 'react';

export default function useSpeechRecognition() {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const startListening = useCallback(async () => {
        try {
            setError(null);
            setTranscript('');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // HuggingFace fal-ai provider explicitly rejects webm. 
            // We must try to force mp4 or a supported codec.
            const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : 'audio/webm';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                setIsProcessing(true);
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());

                // Send to our HF Whisper proxy
                const formData = new FormData();
                const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
                formData.append('audio', audioBlob, `recording.${extension}`);

                try {
                    const response = await fetch('http://127.0.0.1:5005/api/speech/transcribe', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.message || 'Failed to transcribe');
                    }

                    // Whisper returns the full text
                    setTranscript(data.transcript.trim());

                } catch (err) {
                    console.error("Transcription error:", err);
                    setError(err.message || "Could not transcribe audio. Please try again.");
                } finally {
                    setIsProcessing(false);
                }
            };

            mediaRecorder.start();
            setIsListening(true);
        } catch (err) {
            console.error("Microphone error:", err);
            setError("Microphone access denied or unavailable.");
            setIsListening(false);
        }
    }, []);

    const resetTranscript = useCallback(() => {
        setTranscript('');
        setError(null);
    }, []);

    const stopListening = useCallback((abort = false) => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            if (abort) {
                // Intercept and destroy the onstop handler so the Blob isn't uploaded to HF
                mediaRecorderRef.current.onstop = null;
                // Stop tracks immediately
                mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
                setIsListening(false);
                resetTranscript();
            } else {
                mediaRecorderRef.current.stop();
                setIsListening(false);
            }
        } else if (abort) {
            setIsListening(false);
            resetTranscript();
        }
    }, [resetTranscript]);

    return {
        isListening,
        isProcessing, // Expose this so UI can show a spinner during HF inference
        transcript,
        error,
        startListening,
        stopListening,
        resetTranscript
    };
}
