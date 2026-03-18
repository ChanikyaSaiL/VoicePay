import Fuse from 'fuse.js';

/**
 * Parses a voice command string to extract currency amount and recipient name.
 * Handles variations like "Send 500 rupees to Rahul".
 * @param {string} text - The transcript from speech-to-text
 * @returns {object} - { amount: Number|null, name: String|null }
 */
export function parsePaymentCommand(text) {
    if (!text) return { amount: null, name: null };

    const normalizedText = text.toLowerCase();

    // Extract Amount (look for numbers)
    // E.g., "500", "500.50", "five hundred" (basic numerical extraction for prototype)
    const amountMatch = normalizedText.match(/\d+([.,]\d+)?/);
    const amount = amountMatch ? parseFloat(amountMatch[0].replace(/,/g, '')) : null;

    // Extract Name (look for words following "to")
    // "send 500 rupees to rahul please" -> captures "rahul please" and we'll fuzzy match the rest 
    const toMatch = normalizedText.match(/to\s+([a-z\s.]+)/i);
    let name = null;
    if (toMatch && toMatch[1]) {
        // Basic cleanup of filler words at the end
        name = toMatch[1].replace(/\b(please|now|urgently)\b/g, '').trim();
    }

    // Fallback: If "to" wasn't caught, just return whatever text we have around the number
    if (!name && amount) {
        const words = normalizedText.split(/\s+/);
        // Try to guess a name (capitalized word or specific string)
        // For this prototype, if it's not following "to", we will rely on Fuse.js to just score the whole remaining string
        name = normalizedText.replace(amountMatch[0], '').replace(/\b(send|rupees|bucks|pay)\b/gi, '').trim();
    }

    return { amount, name };
}

/**
 * Uses fuzzy string matching to find the best contact(s) from a list
 * @param {string} queryName - Extracted name from voice
 * @param {Array} contacts - Array of contact objects { id, name, phone, etc }
 * @returns {object} - { status: 'SINGLE'|'MULTIPLE'|'NONE', matches: Array }
 */
export function resolveContact(queryName, contacts) {
    if (!queryName || !contacts || contacts.length === 0) {
        return { status: 'NONE', matches: [] };
    }

    // Setup Fuse.js for fuzzy searching
    const flexSearch = new Fuse(contacts, {
        keys: ['name'],
        threshold: 0.4, // Lower is more strict. 0.4 allows slight misspellings
        includeScore: true
    });

    const results = flexSearch.search(queryName);

    if (results.length === 0) {
        return { status: 'NONE', matches: [] };
    }

    // Calculate score gaps to determine if we have a tie
    const matches = results.map(r => r.item);
    const bestScore = results[0].score;

    // If the second best is very close to the best score, it's ambiguous
    const ambiguousMatches = results.filter(r => Math.abs(r.score - bestScore) < 0.15);

    if (ambiguousMatches.length > 1) {
        return {
            status: 'MULTIPLE',
            matches: ambiguousMatches.map(r => r.item)
        };
    }

    // Clear single winner
    return { status: 'SINGLE', matches: [matches[0]] };
}

// Mock Contacts Database for Prototype Mapping
export const MOCK_CONTACTS = [
    { id: 'c1', name: 'P. Rahul', phone: '+91 9876543210', upi: 'prahul@okicici', initial: 'PR' },
    { id: 'c2', name: 'L. Rahul', phone: '+91 9876543211', upi: 'lrahul@ybl', initial: 'LR' },
    { id: 'c3', name: 'Ramesh Singh', phone: '+91 9999999999', upi: 'ramesh@sbi', initial: 'RS' },
    { id: 'c4', name: 'Coffee Shop', phone: '+91 8888888888', upi: 'coffee@paytm', initial: 'CS' },
];
