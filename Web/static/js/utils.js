
export function normalizeCurrency(currency) {
    const currencyMap = {
        "€": "EUR",
        "ден": "MKD",
        "ПоДоговор": "NEGOTIABLE" // Handle special case
    };

    return currencyMap[currency] || currency; // Default to the original value if not found
}