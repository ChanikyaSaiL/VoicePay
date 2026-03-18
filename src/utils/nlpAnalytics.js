/**
 * nlpAnalytics.js
 * 
 * Local, regex-based NLP utility to parse spoken queries about transactions.
 * Returns a human-readable string to be spoken/displayed.
 */

// Helper to check if a date string falls within a given day offset range
const isWithinDays = (dateStr, daysAgoStart, daysAgoEnd) => {
    const d = new Date(dateStr);
    const now = new Date();
    
    // Normalize to midnight for accurate day counting
    const stripTime = (dateObj) => new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    
    const targetDate = stripTime(d);
    const today = stripTime(now);
    
    const diffTime = Math.abs(today - targetDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    return diffDays >= daysAgoStart && diffDays <= daysAgoEnd;
};

const isSameMonth = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

// Helper to parse month names and abbreviations
const parseMonthNumber = (text) => {
    const monthMap = {
        january: 0, jan: 0,
        february: 1, feb: 1,
        march: 2, mar: 2,
        april: 3, apr: 3,
        may: 4,
        june: 5, jun: 5,
        july: 6, jul: 6,
        august: 7, aug: 7,
        september: 8, sep: 8, sept: 8,
        october: 9, oct: 9,
        november: 10, nov: 10,
        december: 11, dec: 11
    };
    
    for (const [name, month] of Object.entries(monthMap)) {
        if (text.includes(name)) {
            return month;
        }
    }
    return null;
};

// Helper to check if transaction is in a specific month (current or last year context)
const isInMonth = (dateStr, targetMonth) => {
    const d = new Date(dateStr);
    const transactionMonth = d.getMonth();
    return transactionMonth === targetMonth;
};

// Helper to get month name for display
const getMonthName = (monthNum) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum] || 'that month';
};

export const parseAnalyticsQuery = (transcript, transactions) => {
    const text = transcript.toLowerCase().trim();
    console.log("Analytics Query:", { text, transactionCount: transactions?.length });
    
    if (!text || !transactions || transactions.length === 0) {
        return "I couldn't find any transaction data to analyze.";
    }

    // --- 1. Identify Timeframe Filter ---
    let filteredTxs = [...transactions];
    let timeLabel = "overall";
    let monthName = null;

    // Check for specific month names first (January, February, etc.)
    const specifiedMonth = parseMonthNumber(text);
    if (specifiedMonth !== null) {
        filteredTxs = filteredTxs.filter(t => isInMonth(t.date, specifiedMonth));
        monthName = getMonthName(specifiedMonth);
        timeLabel = `in ${monthName}`;
    } else if (text.includes("today")) {
        filteredTxs = filteredTxs.filter(t => isWithinDays(t.date, 0, 0));
        timeLabel = "today";
    } else if (text.includes("yesterday")) {
        filteredTxs = filteredTxs.filter(t => isWithinDays(t.date, 1, 1));
        timeLabel = "yesterday";
    } else if (text.includes("last 30 days") || text.includes("past 30 days") || text.includes("last month")) {
        filteredTxs = filteredTxs.filter(t => isWithinDays(t.date, 0, 30));
        timeLabel = "in the last 30 days";
    } else if (text.includes("this week") || text.includes("past week") || text.includes("last week")) {
        // Last 7 days including today
        filteredTxs = filteredTxs.filter(t => isWithinDays(t.date, 0, 7));
        timeLabel = "this week";
    } else if (text.includes("this month") || text.includes("current month")) {
        filteredTxs = filteredTxs.filter(t => isSameMonth(t.date));
        timeLabel = "this month";
    }

    // If no matches after filtering by month, return early
    if (filteredTxs.length === 0) {
        const timePhrase = monthName ? `in ${monthName}` : timeLabel === "overall" ? "in your recent history" : timeLabel;
        return `You have no transactions ${timePhrase}.`;
    }

    // --- 2. Identify Recipient Filter ---
    // Extract unique lowered names from filtered transaction history to match against
    const uniqueNames = [...new Set(filteredTxs.map(t => t.recipientName.toLowerCase()))];
    let matchedName = null;
    let actualName = null;

    for (const name of uniqueNames) {
        // Check for exact match or first name match
        const firstName = name.split(' ')[0];
        if (text.includes(name) || text.includes(firstName)) {
            matchedName = name;
            // Get original cased name from one of the txs
            actualName = filteredTxs.find(t => t.recipientName.toLowerCase() === name).recipientName;
            break;
        }
    }

    if (matchedName) {
        filteredTxs = filteredTxs.filter(t => t.recipientName.toLowerCase() === matchedName);
        timeLabel = timeLabel === "overall" ? "" : ` ${timeLabel}`;
    }

    // If we filtered down to nothing after recipient filter
    if (filteredTxs.length === 0) {
        if (matchedName) return `You haven't made any transactions to ${actualName}${timeLabel}.`;
        return `You have no transactions ${timeLabel}.`;
    }

    // --- 3. Identify Aggregation Type ---
    const isMax = text.includes("highest") || text.includes("largest") || text.includes("most") || text.includes("maximum") || text.includes("max");
    const isMin = text.includes("lowest") || text.includes("smallest") || text.includes("least") || text.includes("minimum") || text.includes("min");
    const isCount = text.includes("how many times") || text.includes("number of transactions") || text.includes("frequency") || text.includes("times did i");
    const isAverage = text.includes("average") || text.includes("avg") || text.includes("mean");

    // Default is sum if asking "how much", "total", "spend", etc.

    if (isMax) {
        const maxTx = filteredTxs.reduce((prev, current) => (Number(prev.amount) > Number(current.amount)) ? prev : current);
        if (matchedName) {
            return `The highest amount you sent to ${actualName}${timeLabel} was ₹${Number(maxTx.amount).toLocaleString()}.`;
        }
        return `Your highest transaction ${timeLabel} was ₹${Number(maxTx.amount).toLocaleString()} to ${maxTx.recipientName}.`;
    }

    if (isMin) {
        const minTx = filteredTxs.reduce((prev, current) => (Number(prev.amount) < Number(current.amount)) ? prev : current);
        if (matchedName) {
            return `The lowest amount you sent to ${actualName}${timeLabel} was ₹${Number(minTx.amount).toLocaleString()}.`;
        }
        return `Your lowest transaction ${timeLabel} was ₹${Number(minTx.amount).toLocaleString()} to ${minTx.recipientName}.`;
    }

    if (isCount) {
        if (matchedName) {
            return `You transacted with ${actualName} ${filteredTxs.length} time${filteredTxs.length !== 1 ? 's' : ''}${timeLabel}.`;
        }
        return `You made ${filteredTxs.length} transaction${filteredTxs.length !== 1 ? 's' : ''} ${timeLabel}.`;
    }

    if (isAverage) {
        const totalOutput = filteredTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const avgAmount = Math.round(totalOutput / filteredTxs.length);
        if (matchedName) {
            return `Your average transaction with ${actualName}${timeLabel} was ₹${avgAmount.toLocaleString()}.`;
        }
        return `Your average transaction amount ${timeLabel} was ₹${avgAmount.toLocaleString()}.`;
    }

    // Default: SUM
    const totalOutput = filteredTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    if (matchedName) {
        return `You sent a total of ₹${totalOutput.toLocaleString()} to ${actualName}${timeLabel}.`;
    }
    
    return `You spent a total of ₹${totalOutput.toLocaleString()} ${timeLabel}.`;
};
