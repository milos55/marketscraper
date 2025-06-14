// Store data in memory to avoid storage limits
window.adsCache = [];

// Main AdsManager class - orchestrates the other components
class AdsManager {
    constructor() {
        this.allAds = [];
        this.currentPage = this.getInitialPage();
        this.adsPerPage = 48;
        this.selectedCategory = null;
        this.currentSort = null;
        this.filteredAds = [];
        this.matchMethod = "every";
        this.searchTerms = [];
        this.currentCurrency = "MKD";
        
        // CSRF token for POST requests
        const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
        this.csrfToken = csrfToken;

        // CSP nonce
        this.nonce = document.querySelector('meta[name="csp-nonce"]')?.content || '';
        
        // Initialize components
        this.elements = new ElementsManager();
        this.urlManager = new UrlManager();
        this.searchManager = new SearchManager(this);
        this.filterManager = new FilterManager(this);
        this.paginationManager = new PaginationManager(this);
        this.uiManager = new UiManager(this.elements, this);
        
        // Setup and initialize
        this.setupEventListeners();
        this.fetchCategories();
        this.fetchAllAds();
    }
    
    getInitialPage() {
        const params = new URLSearchParams(window.location.search);
        const page = parseInt(params.get('page'));
        return isNaN(page) ? 1 : page;
    }
    
    setupEventListeners() {
        this.uiManager.setupDropdownListeners();
        this.uiManager.setuFilterSidebarListeners();
        this.uiManager.setupPriceRangeListeners();
        this.uiManager.setupCategoryListeners();
        this.uiManager.setupSortListeners();
        this.uiManager.setupSearchListeners();
        this.uiManager.setupCheckboxListeners();
        this.uiManager.setupSearchTypeListeners();
        this.uiManager.setupLocationDropdown();
        this.uiManager.setupViewToggleListeners();
        this.paginationManager.setupPaginationListeners();
        
        // Handle browser back/forward navigation
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.page) {
                this.currentPage = event.state.page;
                this.displayAds();
            }
        });
    }

    precomputePrices(targetCurrency) {
        // Always recompute prices on initial load
        if (targetCurrency === this.currentCurrency && this.initialLoadComplete) return;
    
        this.currentCurrency = targetCurrency; // Update the current currency
        this.initialLoadComplete = true; // Mark initial load as complete
    
        this.allAds.forEach(ad => {
            // Ensure convertedPrices exists
            ad.convertedPrices = ad.convertedPrices || {};
    
            // Convert the ad price to the target currency and store it
            ad.convertedPrices[targetCurrency] = this.filterManager.convertPrice(
                ad.adprice,
                ad.adcurrency,
                targetCurrency
            );
        });
    }

    async fetchAllAds() {
        try {
            if (window.adsCache.length > 0) {
                this.allAds = window.adsCache;
            } else {
                const response = await fetch('/fetch_ads', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.csrfToken,
                        'X-CSP-Nonce': this.nonce
                    },
                    body: JSON.stringify({ 
                        category: null,
                        nonce: this.nonce
                    })
                });
    
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
    
                this.allAds = await response.json();
    
                this.allAds = this.allAds.map(ad => {
                    ad.adprice = Number(ad.adprice);

                    if (typeof ad.adprice !== 'number' /* || !ad.adcurrency */) {
                        console.error("Invalid ad:", ad);
                        return null;
                    }
                    // Initialize convertedPrices if it doesn't exist
                    ad.convertedPrices = ad.convertedPrices || {};
                    return ad;
                }).filter(ad => ad !== null);
    
                // Store ads in memory
                window.adsCache = this.allAds;
            }
    
            // Precompute prices for the default currency
            this.precomputePrices(this.currentCurrency);
            this.handleSearch(true);
        } catch (error) {
            console.error('Error fetching ads:', error);
            this.elements.adsGrid.innerHTML = '<p>Error loading ads. Please try again later.</p>';
        }
    }

    // Need to fetch categories from server-side
    async fetchCategories() {
        try {
            const response = await fetch('/fetch_categories', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken,
                    'X-CSP-Nonce': this.nonce
                },
                body: JSON.stringify({ 
                    nonce: this.nonce
                })
            });
    
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
    
            const categories = await response.json();
            this.populateCategoryDropdown(categories);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }
    
    populateCategoryDropdown(categories) {
        const gridContainer = document.querySelector('.category-list .categories-container');
        
        if (!gridContainer || !categories || categories.length === 0) {
            console.error('No categories found or grid container not available');
            return;
        }
        
        gridContainer.innerHTML = '';  // Clear existing content
        
        categories.forEach(category => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.className = 'category-btn';
            button.dataset.category = category;
            button.textContent = category;
            button.setAttribute('data-fulltext', category);
            li.appendChild(button);
            gridContainer.appendChild(li);
        });
        
        // Re-attach event listeners
        this.uiManager.setupCategoryListeners();
    }
    
    handleSearch(preservePage = false) {
        this.uiManager.showSearchLoading();
        setTimeout(() => {
            this.searchTerms = this.searchManager.parseSearchTerms();
            this.filteredAds = this.filterManager.getFilteredAds(this.allAds, this.searchTerms);

            if (!preservePage) {
                this.currentPage = 1;
            }

            this.displayAds();
            this.uiManager.hideSearchLoading();
        }, 150);
    }
    
    handlePageChange(newPage, shouldScrollToTop = false) {
        this.currentPage = newPage;
        this.urlManager.updateUrl(newPage);
        this.displayAds(); // No need to fetch again

        if (shouldScrollToTop) {
        this.uiManager.scrollToTop();
        }
    }
    
    
    displayAds() {
        const start = (this.currentPage - 1) * this.adsPerPage;
        const end = start + this.adsPerPage;
        const pageAds = this.filteredAds.slice(start, end);
        
        this.elements.adsGrid.innerHTML = pageAds.length ? 
            pageAds.map(ad => this.uiManager.createAdHTML(ad)).join('') : 
            '<p>No ads for this category.</p>';
            
        this.paginationManager.updatePagination();
    }
}

// Manages DOM elements
class ElementsManager {
    constructor() {
        this.mainContainer = document.getElementById('main-container');
        this.searchInput = document.getElementById('search-input');
        this.adsGrid = document.querySelector('.ads-grid');
        this.dateMenu = document.querySelector('.dropdown-date-menu');
        this.searchTypeMenu = document.querySelector('.dropdown-search-type-menu');
        this.categoryBtn = document.querySelector('.dropdown-cat-btn');
        this.searchTypeBtn = document.querySelector('.dropdown-search-btn');
        this.dateBtn = document.querySelector('.dropdown-date-btn');
        this.searchOrderedBtn = document.getElementById('search-ordered');
        this.searchSomeBtn = document.getElementById('search-some');
        this.searchEveryBtn = document.getElementById('search-every');
        this.checkboxes = {
            title: document.getElementById('checkbox-title'),
            desc: document.getElementById('checkbox-desc'),
            podogovor: document.getElementById('checkbox-podogovor'),
            price1: document.getElementById('checkbox-price-1'),
        };
        this.pagination = {
            prevBtns: document.querySelectorAll('.prev-page'),
            nextBtns: document.querySelectorAll('.next-page'),
            pageNumbers: document.querySelectorAll('.page-number'),
            bottomPrevBtn: document.getElementById('bottom-pagination-prev-btn'),
            bottomNextBtn: document.getElementById('bottom-pagination-next-btn'),
        };
        this.priceSelector = {
            minPrice: document.getElementById('min-price'),
            maxPrice: document.getElementById('max-price'),
            currencyToggle: document.querySelector('.currency-toggle-btn'),
        };
        this.filterSidebarBtn = document.getElementById('filter-sidebar-btn');
        this.filterSidebar = document.getElementById('filter-sidebar');

    }
}

// Manages URL operations
class UrlManager {
    constructor() {
        this.currentLanguage = this.getLanguageFromUrl();
    }
    
    getLanguageFromUrl() {
        const path = window.location.pathname;
        const languageMatch = path.match(/\/(mkd|en|al)\//);
        return languageMatch ? languageMatch[1] : 'mkd';
    }
    
    updateUrl(page) {
        const lang = this.getLanguageFromUrl();
        const newUrl = `/${lang}/?page=${page}`;
        history.pushState({ page }, '', newUrl);
    }
}

// Manages search functionality
class SearchManager {
    constructor(adsManager) {
        this.adsManager = adsManager;
        this.elements = adsManager.elements;
    }
    
    parseSearchTerms() {
        return this.elements.searchInput.value.trim().toLowerCase().split(',').map(term => term.trim());
    }
    
    // Transliteration for multilingual search
    transliterate(text) {
        const translitmap = {
            'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д',
            'gj': 'ѓ', 'e': 'е', 'zh': 'ж', 'z': 'з', 'dz': 'ѕ',
            'i': 'и', 'j': 'ј', 'k': 'к', 'l': 'л', 'lj': 'љ',
            'm': 'м', 'n': 'н', 'nj': 'њ', 'o': 'о', 'p': 'п',
            'r': 'р', 's': 'с', 't': 'т', 'kj': 'ќ', 'u': 'у',
            'f': 'ф', 'h': 'х', 'c': 'ц', 'ch': 'ч', 'dj': 'џ',
            'sh': 'ш'
        };
        
        let result = text.toLowerCase();
        
        // First replace multi-character sequences
        Object.entries(translitmap).forEach(([lat, cyr]) => {
            if (lat.length > 1) {
                result = result.replace(new RegExp(lat, 'g'), cyr);
            }
        });
        
        // Then replace single characters
        Object.entries(translitmap).forEach(([lat, cyr]) => {
            if (lat.length === 1) {
                result = result.replace(new RegExp(lat, 'g'), cyr);
            }
        });
        
        return result;
    }


    // FIXME : ALL METHODS don't work too well with current db descriptions
    // Calculate Levenshtein distance between two strings
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        // Initialize matrix
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        // Fill matrix
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    // Subsequence matching - checks if all characters of term appear in text in order
    subsequenceMatch(text, term) {
        text = text.toLowerCase();
        term = term.toLowerCase();
        
        let textIndex = 0;
        let termIndex = 0;
        
        while (textIndex < text.length && termIndex < term.length) {
            if (text[textIndex] === term[termIndex]) {
                termIndex++;
            }
            textIndex++;
        }
        
        return termIndex === term.length;
    }
    
     // Word boundary fuzzy matching for better relevance
    wordBoundaryFuzzy(text, term) {
        const words = text.toLowerCase().split(/\s+/);
        const termLower = term.toLowerCase();
        
        // Check if any word is similar to the search term
        return words.some(word => {
            // Exact match
            if (word === termLower) return true;
            
            // Starts with term
            if (word.startsWith(termLower)) return true;
            
            // Term starts with word (for partial matches)
            if (termLower.startsWith(word) && word.length >= 3) return true;
            
            // Fuzzy match for longer words (avoid matching very short words)
            if (word.length >= 4 && termLower.length >= 4) {
                const distance = this.levenshteinDistance(word, termLower);
                const maxDistance = Math.floor(Math.max(word.length, termLower.length) * 0.3); // 30% error tolerance
                return distance <= maxDistance;
            }
            
            return false;
        });
    }

     // Smart fuzzy matching that combines multiple techniques
    /* /smartFuzzyMatch(text, term) {
        const textLower = text.toLowerCase();
        const termLower = term.toLowerCase();
        
        // Skip fuzzy matching for very short terms to avoid false positives
        if (termLower.length < 3) {
            return textLower.includes(termLower);
        }
        
        // 1. Exact substring match (highest priority) 
        // FIXME ?: Strict word boundary match, if desc extraction method (backend) changes uncomment line below, else keep
        // !!!! DON'T REMOVE COMMENT ABOVE !!!!
        // if (textLower.includes(termLower)) {
        //    return true;
        //} 
        
        const wordBoudaryRegex = new RegExp(`\\b${termLower}\\b`);
        if (wordBoudaryRegex.test(termLower)) {
            return true;
        }
        
        // 2. Transliteration match
        const transliteratedText = this.transliterate(textLower);
        const transliteratedTerm = this.transliterate(termLower);
        if (transliteratedText.includes(transliteratedTerm) || textLower.includes(transliteratedTerm)) {
            return true;
        }
        
        // 3. Word boundary fuzzy matching
        if (this.wordBoundaryFuzzy(text, term)) {
            return true;
        }
        
        // 4. Subsequence matching for very specific cases
        if (termLower.length >= 5 && this.subsequenceMatch(textLower, termLower)) {
            // Additional check: ensure enough characters match
            const matchRatio = termLower.length / textLower.length;
            if (matchRatio >= 0.3) { // At least 30% of the text should be the search term
                return true;
            }
        }
        
        return false;
    } */

     matches(text, term) {
        if (!text || !term) return false;
        
        const cleanText = text.toString().trim().toLowerCase();
        const cleanTerm = term.toString().trim().toLowerCase();
        
        if (!cleanText || !cleanTerm) return false;
        
        // Skip very short terms to avoid false positives
        if (cleanTerm.length < 2) {
            return cleanText === cleanTerm;
        }
        
        // 1. Direct substring match
        if (cleanText.includes(cleanTerm)) {
            return true;
        }
        
        // 2. Transliteration match (Latin <-> Cyrillic)
        const transliteratedText = this.transliterate(cleanText);
        const transliteratedTerm = this.transliterate(cleanTerm);
        
        if (transliteratedText.includes(cleanTerm) || cleanText.includes(transliteratedTerm)) {
            return true;
        }
        
        // 3. Word boundary matching for partial matches
        if (cleanTerm.length >= 3) {
            const words = cleanText.split(/\s+/);
            return words.some(word => {
                // Exact word match
                if (word === cleanTerm) return true;
                // Word starts with term
                if (word.startsWith(cleanTerm)) return true;
                // Term starts with word (for partial matches like "iphone" matching "iph")
                if (cleanTerm.startsWith(word) && word.length >= 3) return true;
                return false;
            });
        }
        
        return false;
    }

    findTermInText(text, term, startIndex = 0) {
        const searchText = text.substring(startIndex);
        const cleanTerm = term.toLowerCase();
        
        // Direct search
        let index = searchText.indexOf(cleanTerm);
        if (index !== -1) {
            return startIndex + index;
        }
        
        // Transliteration search
        const transliteratedText = this.transliterate(searchText);
        const transliteratedTerm = this.transliterate(cleanTerm);
        
        index = transliteratedText.indexOf(cleanTerm);
        if (index !== -1) {
            return startIndex + index;
        }
        
        index = searchText.indexOf(transliteratedTerm);
        if (index !== -1) {
            return startIndex + index;
        }
        
        return -1;
    }

    // Additional helper method for scoring matches (for potential future ranking)
    getMatchScore(text, term) {
        if (!this.matches(text, term)) return 0;
        
        const cleanText = text.toLowerCase();
        const cleanTerm = term.toLowerCase();
        
        // Exact match gets highest score
        if (cleanText === cleanTerm) return 100;
        
        // Word boundary match
        const regex = new RegExp(`\\b${cleanTerm}\\b`);
        if (regex.test(cleanText)) return 90;
        
        // Starts with term
        if (cleanText.startsWith(cleanTerm)) return 80;
        
        // Contains term
        if (cleanText.includes(cleanTerm)) return 70;
        
        // Transliteration match
        const transliteratedText = this.transliterate(cleanText);
        if (transliteratedText.includes(cleanTerm)) return 60;
        
        // Partial word match
        return 50;
    }

     // Method to get ranked results (optional enhancement)
    getRankedMatches(ads, searchTerms) {
        if (!searchTerms || searchTerms[0] === '') return ads;
        
        const scoredAds = ads.map(ad => {
            let totalScore = 0;
            let matches = 0;
            
            searchTerms.forEach(term => {
                const titleScore = this.elements.checkboxes.title.checked ? 
                    this.getMatchScore(ad.adtitle, term) : 0;
                const descScore = this.elements.checkboxes.desc.checked ? 
                    this.getMatchScore(ad.addesc, term) : 0;
                
                const maxScore = Math.max(titleScore, descScore);
                if (maxScore > 0) {
                    totalScore += maxScore;
                    matches++;
                }
            });
            
            return {
                ad: ad,
                score: matches > 0 ? totalScore / matches : 0,
                matches: matches
            };
        });
        
        // Filter out non-matches and sort by score
        return scoredAds
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.ad);
    }

    matchesTermsInOrder(text, terms) {
        if (!text || !terms || terms.length === 0) return false;
        
        const cleanText = text.toLowerCase();
        let searchStartIndex = 0;
        
        for (const term of terms) {
            const foundIndex = this.findTermInText(cleanText, term, searchStartIndex);
            if (foundIndex === -1) {
                return false;
            }
            searchStartIndex = foundIndex + term.length;
        }
        
        return true;
    }

    // Helper that tries to find the term using smart fuzzy logic and returns its position
    // UNUSED
    /* _findNextMatchIndex(text, term, fromIndex) {
        const substr = text.slice(fromIndex);
        
        // Use transliterated matching if needed
        const transliteratedSubstr = this.transliterate(substr);
        const transliteratedTerm = this.transliterate(term);

        // Use your fuzzy match logic to scan from `fromIndex`
        for (let i = 0; i < substr.length; i++) {
            const window = substr.slice(i);
            if (
                this.smartFuzzyMatch(window, term) ||
                this.smartFuzzyMatch(window, transliteratedTerm)
            ) {
                return fromIndex + i;
            }
        }

        return -1;
    } */
}

// Manages filtering and sorting
import { normalizeCurrency } from "./utils.js";
class FilterManager {
    constructor(adsManager) {
        this.adsManager = adsManager;
        this.elements = adsManager.elements;
        this.searchManager = adsManager.searchManager;
        this.selectedLocation = null;
    }
    
    getFilteredAds(allAds, searchTerms) {
        let filtered = this.applyBaseFilters(allAds);
        filtered = this.applySearchTerms(filtered, searchTerms);
        filtered = this.applyPriceFilters(filtered);
        filtered = this.applyLocationFilter(filtered);
        return this.sortAds(filtered);
    }
    
    applyBaseFilters(ads) {
        // Apply category filter if selected
        if (this.adsManager.selectedCategory) {
            return ads.filter(ad => ad.adcategory === this.adsManager.selectedCategory);
        }
        return ads;
    }
    
    applySearchTerms(ads, searchTerms) {
        // If no search terms, return all ads
        if (!searchTerms || searchTerms.length === 0 || searchTerms[0] === '') {
            return ads;
        }
        
        return ads.filter(ad => {
            // Check if we should search in title and/or description
            const searchInTitle = this.elements.checkboxes.title.checked;
            const searchInDesc = this.elements.checkboxes.desc.checked;
            
            // If neither is checked, default to searching both
            if (!searchInTitle && !searchInDesc) {
                return this.matchesAllTerms(ad.adtitle, searchTerms) || 
                       this.matchesAllTerms(ad.addesc, searchTerms);
            }
            
            let titleMatch = false;
            let descMatch = false;
            
            if (searchInTitle) {
                titleMatch = this.matchesAllTerms(ad.adtitle, searchTerms);
            }
            
            if (searchInDesc) {
                descMatch = this.matchesAllTerms(ad.addesc, searchTerms);
            }
            
            return titleMatch || descMatch;
        });
    }

     matchesAllTerms(text, terms) {
        if (!text || !terms || terms.length === 0) return false;
        
        const ordered = this.adsManager.matchOrdered || false;  // boolean: is ordered checkbox checked?
        const matchType = this.adsManager.matchMethod || "every"; // "every" or "some"

        if (ordered) {
            // Terms must appear in order
            if (matchType === "every") {
                // ALL terms must appear in order
                return this.searchManager.matchesTermsInOrder(text, terms);
            } else if (matchType === "some") {
                // ANY single term must match (in order doesn't matter for single terms)
                return terms.some(term => this.searchManager.matches(text, term));
            }
        } else {
            // Terms can appear anywhere (unordered)
            if (matchType === "every") {
                // ALL terms must appear somewhere in the text
                // Example: "iphone 15 17" requires text to contain "iphone" AND "15" AND "17"
                return terms.every(term => this.searchManager.matches(text, term));
            } else if (matchType === "some") {
                // ANY term must appear in the text
                // Example: "iphone 15 17" matches if text contains "iphone" OR "15" OR "17"
                return terms.some(term => this.searchManager.matches(text, term));
            }
        }

        // Default to "every" unordered
        return terms.every(term => this.searchManager.matches(text, term));
    }

    
    applyPriceFilters(ads) {
    let filtered = [...ads];

    if (this.elements.checkboxes.price1.checked) {
        filtered = filtered.filter(ad => normalizeCurrency(ad.adprice) !== 1);
    }

    if (this.elements.checkboxes.podogovor && this.elements.checkboxes.podogovor.checked) {
        filtered = filtered.filter(ad => normalizeCurrency(ad.adcurrency) !== "NEGOTIABLE");
    }

    // Get min and max price values
    const minPriceInput = this.elements.priceSelector.minPrice.value;
    const maxPriceInput = this.elements.priceSelector.maxPrice.value;
    const minPrice = minPriceInput ? parseFloat(minPriceInput) : 1;
    const maxPrice = maxPriceInput ? parseFloat(maxPriceInput) : Infinity;

    // Get current currency from UiManager
    const selectedCurrency = this.adsManager.uiManager.currentCurrency;

    // Validate prices
    if (isNaN(minPrice) || isNaN(maxPrice)) {
        console.warn("Invalid price input:", { minPrice, maxPrice });
        return filtered;
    }

    // Filter ads
    return filtered.filter(ad => {
        // Handle "По Договор" case
        if (normalizeCurrency(ad.adcurrency) === "NEGOTIABLE") {
            return minPrice === 1; // Only include negotiable prices if min price is 1
        }

        // Get the converted price for the current currency
        const convertedPrice = ad.convertedPrices?.[selectedCurrency];

        if (convertedPrice === undefined) {
            console.warn(`Missing converted price for ad:`, ad);
            return false; // Skip the ad if no converted price is available
        }

        // Now you can safely check if the price falls within the selected range
        return convertedPrice >= minPrice && convertedPrice <= maxPrice;
    });
    }

    updatePricePlaceholders(currency) {
        try {
            const { minPrice, maxPrice } = this.elements.priceSelector;
            
            if (!minPrice || !maxPrice) {
                throw new Error('Price input elements not found');
            }

            const placeholders = currency === 'MKD' 
                ? { min: '1000', max: '500000' }
                : { min: '15', max: '8000' };

            minPrice.placeholder = placeholders.min;
            maxPrice.placeholder = placeholders.max;
        } catch (error) {
            console.error('Error updating price placeholders:', error);
        }
    }

    convertPrice(price, fromCurrency, toCurrency) {
        const CURRENCY_RATES = {
            MKD: 1, // Base currency
            EUR: 61.5 // 1 EUR = 61.5 MKD (adjust this rate as needed)
        };

        // Normalize currencies using the utility function
        fromCurrency = normalizeCurrency(fromCurrency); // Use the utility function
        toCurrency = normalizeCurrency(toCurrency); // Use the utility function

        // Ensure price is a number
        if (typeof price !== 'number') {
            price = parseFloat(price);
            if (isNaN(price)) {
                console.error("Invalid price:", price);
                return 0; // Default to 0 if price is invalid
            }
        }

        // Convert to MKD first
        let priceInMKD;
        if (fromCurrency === "EUR") {
            priceInMKD = price * CURRENCY_RATES.EUR;
        } else {
            priceInMKD = price; // Assume price is already in MKD
        }

        // Convert to the target currency
        if (toCurrency === "EUR") {
            return priceInMKD / CURRENCY_RATES.EUR;
        } else {
            return priceInMKD; // Return in MKD
        }
    }

    applyLocationFilter(ads) {
        if (!this.selectedLocation || this.selectedLocation === "") {
            return ads;
        }
        return ads.filter(ad => ad.adlocation === this.selectedLocation);
    }
    
    sortAds(ads) {
        const sortedAds = [...ads];
        switch (this.adsManager.currentSort) {
            case 'newest':
                sortedAds.sort((a, b) => new Date(b.addate) - new Date(a.addate));
                break;
            case 'oldest':
                sortedAds.sort((a, b) => new Date(a.addate) - new Date(b.addate));
                break;
            case 'cheapest':
                sortedAds.sort((a, b) => parseFloat(a.adprice) - parseFloat(b.adprice));
                break;
            case 'expensive':
                sortedAds.sort((a, b) => parseFloat(b.adprice) - parseFloat(a.adprice));
                break;
        }
        return sortedAds;
    }
}

// Manages pagination
class PaginationManager {
    constructor(adsManager) {
        this.adsManager = adsManager;
        this.elements = adsManager.elements.pagination;
    }
    
    setupPaginationListeners() {
        if (this.elements.prevBtns) {
            this.elements.prevBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (this.adsManager.currentPage > 1) {
                        const shouldScrollToTop = btn.id === 'bottom-pagination-prev-btn';
                        this.adsManager.handlePageChange(this.adsManager.currentPage - 1, shouldScrollToTop);
                    }
                });
            });
        }
        
        if (this.elements.nextBtns) {
            this.elements.nextBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const maxPages = Math.ceil(this.adsManager.filteredAds.length / this.adsManager.adsPerPage);
                    if (this.adsManager.currentPage < maxPages) {
                        const shouldScrollToTop = btn.id === 'bottom-pagination-next-btn';
                        this.adsManager.handlePageChange(this.adsManager.currentPage + 1, shouldScrollToTop);
                    }
                });
            });
        }
    }
    
    updatePagination() {
        const totalPages = Math.ceil(this.adsManager.filteredAds.length / this.adsManager.adsPerPage);
        const currentPage = this.adsManager.currentPage;
        
        if (this.elements.prevBtns) {
            this.elements.prevBtns.forEach(btn => {
                btn.disabled = currentPage === 1;
            });
        }
        
        if (this.elements.nextBtns) {
            this.elements.nextBtns.forEach(btn => {
                btn.disabled = currentPage === totalPages;
            });
        }
        
        this.updatePageNumberInputs(currentPage, totalPages);
    }
    
    updatePageNumberInputs(currentPage, totalPages) {
        if (!this.elements.pageNumbers) return;
        
        this.elements.pageNumbers.forEach(pageNumber => {
            pageNumber.innerHTML = `
                Page <input type="number" class="page-input" value="${currentPage}" min="1" max="${totalPages}"> / ${totalPages}
            `;
            
            const pageInput = pageNumber.querySelector('.page-input');
            if (pageInput) {
                // Remove any existing event listeners
                const newPageInput = pageInput.cloneNode(true);
                pageInput.parentNode.replaceChild(newPageInput, pageInput);
                
                newPageInput.addEventListener('change', (e) => this.handlePageInputChange(e, totalPages));
                newPageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.handlePageInputChange(e, totalPages);
                });
            }
        });
    }
    
    handlePageInputChange(e, totalPages) {
        const newPage = parseInt(e.target.value);
        if (newPage >= 1 && newPage <= totalPages) {
            this.adsManager.handlePageChange(newPage);
        } else {
            e.target.value = this.adsManager.currentPage;
        }
    }
}

// Manages UI components and rendering
class UiManager {
    constructor(elements, adsManager) {
        this.elements = elements;
        this.adsManager = adsManager;
        this.currentCurrency = "MKD";
        this.initializeCurrency();
    }

setupCategorySearchListeners() {
    const categorySearchInput = document.querySelector('#category-search');
    const clearBtn = document.querySelector('#clear-category-btn');
    const allCategoryBtn = document.querySelector('#all-category-btn');
    
    if (!categorySearchInput) {
        console.warn('Category search input not found');
        return;
    }

    categorySearchInput.addEventListener('input', () => {
        const query = categorySearchInput.value.trim().toLowerCase();
        const categoryBtns = document.querySelectorAll('.category-btn');

            categoryBtns.forEach(btn => {

                if (btn.id === 'all-category-btn') {
                btn.style.display = '';
                const parentLi = btn.closest('li');
                if (parentLi) {
                    parentLi.style.display = '';
                }
                return;
                }
                
                const categoryText = btn.textContent.trim().toLowerCase();
                const categoryData = btn.dataset.category ? btn.dataset.category.toLowerCase() : '';
                
                // Use the same enhanced matching logic
                const match = this.categoryMatches(query, categoryText, categoryData);
                btn.style.display = match ? '' : 'none';
                
                // Also hide/show parent li if it exists
                const parentLi = btn.closest('li');
                if (parentLi) {
                    parentLi.style.display = match ? '' : 'none';
                }
            });
        });

        // Clear button functionality
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
            categorySearchInput.value = '';
            categorySearchInput.dispatchEvent(new Event('input')); // Trigger the input event to show all categories
            categorySearchInput.focus();
        });
        }

        // Show all categories when clicking the "All Categories" button
        if (allCategoryBtn) {
        allCategoryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Clear the selected category to show all ads
            this.adsManager.selectedCategory = null;
            this.adsManager.currentPage = 1;
            this.adsManager.handleSearch();
            
            // Optional: Update button appearance to show it's selected
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            allCategoryBtn.classList.add('active');
        });
    }
}


categoryMatches(query, categoryText, categoryData = '') {
        if (!query) return true; // Show all if no query
        
        // Split text into words for better matching
        const textWords = categoryText.split(/\s+/);
        const dataWords = categoryData.split(/\s+/);
        const allWords = [...textWords, ...dataWords];
        
        // Check if any word matches using multiple strategies
        return allWords.some(word => 
            word.startsWith(query) || 
            word.includes(query) || 
            this.fuzzyMatch(query, word) ||
            this.transliterateMatch(query, word)
        );
    }

 fuzzyMatch(input, word) {
        input = input.toLowerCase();
        word = word.toLowerCase();
        let i = 0, j = 0;
        while (i < input.length && j < word.length) {
            if (input[i] === word[j]) i++;
            j++;
        }
        return i === input.length;
    }

     transliterateMatch(query, word) {
        // Use the same transliteration logic from SearchManager
        const transliteratedQuery = this.transliterate(query);
        const transliteratedWord = this.transliterate(word);
        
        return transliteratedWord.includes(transliteratedQuery) || 
               word.includes(transliteratedQuery) ||
               transliteratedWord.includes(query);
    }

    transliterate(text) {
        const translitmap = {
            'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д',
            'gj': 'ѓ', 'e': 'е', 'zh': 'ж', 'z': 'з', 'dz': 'ѕ',
            'i': 'и', 'j': 'ј', 'k': 'к', 'l': 'л', 'lj': 'љ',
            'm': 'м', 'n': 'н', 'nj': 'њ', 'o': 'о', 'p': 'п',
            'r': 'р', 's': 'с', 't': 'т', 'kj': 'ќ', 'u': 'у',
            'f': 'ф', 'h': 'х', 'c': 'ц', 'ch': 'ч', 'dj': 'џ',
            'sh': 'ш'
        };

        let result = text.toLowerCase();

        // Replace multi-character sequences first
        Object.entries(translitmap).forEach(([lat, cyr]) => {
            if (lat.length > 1) {
                result = result.replace(new RegExp(lat, 'g'), cyr);
            }
        });
        
        // Then replace single characters
        Object.entries(translitmap).forEach(([lat, cyr]) => {
            if (lat.length === 1) {
                result = result.replace(new RegExp(lat, 'g'), cyr);
            }
        });
        
        return result;
    }

    // Category expand fuctionality
    setupCategoryExpandListeners() {
    const headerWrapper = document.querySelector('.categories-container');
    const expandBtn = document.querySelector('.expand-btn');

    if (!headerWrapper || !expandBtn) {
        console.error('Missing required elements for expand/collapse');
        return;
    }

    const collapsedHeight = 500; // px, height to show when collapsed (adjust as needed)

    // Start collapsed
    let isCollapsed = true;
    headerWrapper.style.maxHeight = `${collapsedHeight}px`;
    headerWrapper.classList.add('collapsed');
    expandBtn.innerHTML = '<i class="fa-solid fa-angle-down"></i>';
    

    expandBtn.addEventListener('click', () => {
        if (isCollapsed) {
            // Expand fully
            headerWrapper.style.maxHeight = 'none';
            headerWrapper.classList.remove('collapsed');
            expandBtn.innerHTML = '<i class="fa-solid fa-angle-up"></i>';
            isCollapsed = false;
        } else {
            // Collapse back
            headerWrapper.style.maxHeight = `${collapsedHeight}px`;
            headerWrapper.classList.add('collapsed');
            expandBtn.innerHTML = '<i class="fa-solid fa-angle-down"></i>';
            isCollapsed = true;
        }
    });
}

    // Set up view toggle buttons
setupViewToggleListeners() {
    const gridButton = document.querySelector('#grid-view-btn');
    const slidesButton = document.querySelector('#list-view-btn');
    
    if (!gridButton || !slidesButton) {
        console.warn('View toggle buttons not found');
        return;
    }
    
    // Set initial state - slides (list) view is default
    this.currentView = 'slides';
    this.elements.adsGrid.classList.add('slides-view');
    slidesButton.classList.add('active');
    
    // Grid view button click handler
    gridButton.addEventListener('click', () => {
        this.currentView = 'grid';
        this.elements.adsGrid.classList.remove('slides-view');
        this.elements.adsGrid.classList.add('grid-view');
        
        // Update button states
        gridButton.classList.add('active');
        slidesButton.classList.remove('active');
        
        // Re-render ads in the current page with grid layout
        this.adsManager.displayAds();
    });
    
    // Slides (list) view button click handler
    slidesButton.addEventListener('click', () => {
        this.currentView = 'slides';
        this.elements.adsGrid.classList.remove('grid-view');
        this.elements.adsGrid.classList.add('slides-view');
        
        // Update button states
        slidesButton.classList.add('active');
        gridButton.classList.remove('active');
        
        // Re-render ads in the current page with list layout
        this.adsManager.displayAds();
    });
    }
    
    setupDropdownListeners() {
        // Toggle dropdowns on button clicks
        this.elements.searchTypeBtn.addEventListener('click', () => {
            this.elements.searchTypeMenu.style.display = 
                this.elements.searchTypeMenu.style.display === 'block' ? 'none' : 'block';
        });
        
        this.elements.dateBtn.addEventListener('click', () => {
            this.elements.dateMenu.style.display = 
                this.elements.dateMenu.style.display === 'block' ? 'none' : 'block';
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (
                !this.elements.searchTypeBtn.contains(e.target) &&
                !this.elements.searchTypeMenu.contains(e.target)
            ) {
                this.elements.searchTypeMenu.style.display = 'none';
            }
            if (!e.target.matches('.dropdown-date-btn')) {
                this.elements.dateMenu.style.display = 'none';
            }
        });
    }

    setuFilterSidebarListeners() {
        const openFilterBtn = this.elements.filterSidebarBtn;
        const closeFilterBtn = document.querySelector('.close-filter-btn');
        const filterSidebar = this.elements.filterSidebar;

        if (openFilterBtn && filterSidebar) {
            openFilterBtn.addEventListener('click', () => {
                filterSidebar.classList.add('open');
            });
        }

        if (closeFilterBtn && filterSidebar) {
            closeFilterBtn.addEventListener('click', () => {
                filterSidebar.classList.remove('open');
            });
        }

        // Close sidebar when clicking outside of it
        document.addEventListener('click', (event) => {
            if (filterSidebar && !filterSidebar.contains(event.target) && !openFilterBtn.contains(event.target)) {
                filterSidebar.classList.remove('open');
            }
        });
    }

    initializeCurrency() {
        // Set the initial currency in the UI
        const currencyToggleBtn = this.elements.priceSelector.currencyToggle;
        if (currencyToggleBtn) {
            const currencyText = currencyToggleBtn.querySelector('.currency-text');
            if (currencyText) {
                currencyText.textContent = this.currentCurrency;
            }
        }
    }

    setupPriceRangeListeners() {
        const { minPrice: minPriceInput, maxPrice: maxPriceInput, currencyToggle: currencyToggleBtn } = this.elements.priceSelector;

        if (!minPriceInput || !maxPriceInput || !currencyToggleBtn) {
            console.warn('Price range elements not found:', { minPriceInput, maxPriceInput, currencyToggleBtn });
            return;
        }

        // Debounce function for price changes
        const debounce = (func, delay) => {
            let timer;
            return function (...args) {
                clearTimeout(timer);
                timer = setTimeout(() => func.apply(this, args), delay);
            };
        };

        const handlePriceChange = debounce(() => {
            this.adsManager.handleSearch();
        }, 300);

        // Remove any existing listeners
        const newMinInput = minPriceInput.cloneNode(true);
        const newMaxInput = maxPriceInput.cloneNode(true);
        minPriceInput.parentNode.replaceChild(newMinInput, minPriceInput);
        maxPriceInput.parentNode.replaceChild(newMaxInput, maxPriceInput);

        // Add new listeners
        newMinInput.addEventListener('input', handlePriceChange);
        newMaxInput.addEventListener('input', handlePriceChange);

        // Update references
        this.elements.priceSelector.minPrice = newMinInput;
        this.elements.priceSelector.maxPrice = newMaxInput;

        // Currency toggle handler
        currencyToggleBtn.addEventListener('click', () => {
            // Toggle between currencies
            this.currentCurrency = this.currentCurrency === 'MKD' ? 'EUR' : 'MKD';
            
            // Update button text
            const currencyText = currencyToggleBtn.querySelector('.currency-text');
            if (currencyText) {
                currencyText.textContent = this.currentCurrency;
            }
            
            // Animate icon
            const icon = currencyToggleBtn.querySelector('i');
            if (icon) {
                icon.style.transform = 'rotate(180deg)';
                setTimeout(() => {
                    icon.style.transform = 'rotate(0deg)';
                }, 200);
            }
            
            // Update prices and refresh results
            this.adsManager.precomputePrices(this.currentCurrency);
            this.adsManager.handleSearch();
            
            // Update placeholders
            this.adsManager.filterManager.updatePricePlaceholders(this.currentCurrency);
        });
    }
    
    setupLocationDropdown() {
        const locationBtn = document.querySelector('.dropdown-location-btn');
        const locationMenu = document.querySelector('.dropdown-location-menu');
        const locationBtns = document.querySelectorAll('.location-btn');
        
        if (locationBtn && locationMenu) {
            // Toggle dropdown on button click
            locationBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                locationMenu.classList.toggle('show');
                
                // Close other dropdowns
                const otherDropdowns = document.querySelectorAll('.dropdown-cat-menu, .dropdown-date-menu');
                otherDropdowns.forEach(dropdown => {
                    dropdown.style.display = 'none';
                });
            });
            
            // Handle location selection
            locationBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const selectedLocation = e.target.dataset.location;
                    const buttonText = selectedLocation || 'Сите градови';
                    
                    // Update button text
                    locationBtn.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${buttonText}`;
                    
                    // Update filter and refresh results
                    this.adsManager.filterManager.selectedLocation = selectedLocation;
                    this.adsManager.currentPage = 1;
                    this.adsManager.handleSearch();
                    
                    // Close dropdown
                    locationMenu.classList.remove('show');
                });
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!locationMenu.contains(e.target) && !locationBtn.contains(e.target)) {
                    locationMenu.classList.remove('show');
                }
            });

            // Setup initial location search listeners
            this.setupLocationSearchListeners();
        }
    }

    setupLocationClickHandlers() {
        const locationBtns = document.querySelectorAll('.location-btn');
        const locationBtn = document.querySelector('.dropdown-location-btn');
        const locationMenu = document.querySelector('.dropdown-location-menu');

        locationBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selectedLocation = e.target.dataset.location;
                const buttonText = selectedLocation || 'Сите градови';

                locationBtn.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${buttonText}`;
                this.adsManager.filterManager.selectedLocation = selectedLocation;
                this.adsManager.currentPage = 1;
                this.adsManager.handleSearch();
                locationMenu.classList.remove('show');
            });
        });
    }

    setupLocationSearchListeners() {
    const searchInput = document.querySelector('.location-search-input');
    const clearBtn = document.querySelector('#clear-location-btn');
    const allLocationBtn = document.querySelector('#all-location-btn');

    if (!searchInput) {
        console.warn('Location search input not found');
        return;
    }

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        const locationBtns = document.querySelectorAll('.location-btn');

        locationBtns.forEach(btn => {
            // Always show "All Locations" button
            if (btn.id === 'all-location-btn') {
                btn.style.display = '';
                const parentLi = btn.closest('li');
                if (parentLi) {
                    parentLi.style.display = '';
                }
                return;
            }
            
            const locationText = btn.textContent.trim().toLowerCase();
            const locationData = btn.dataset.location ? btn.dataset.location.toLowerCase() : '';
            
            // Use the same enhanced matching logic
            const match = this.locationMatches(query, locationText, locationData);
            btn.style.display = match ? '' : 'none';
            
            // Also hide/show parent li if it exists
            const parentLi = btn.closest('li');
            if (parentLi) {
                parentLi.style.display = match ? '' : 'none';
            }
        });
    });

    // Clear button functionality
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input')); // Trigger the input event to show all locations
            searchInput.focus();
        });
    }

    // Show all locations when clicking the "All Locations" button
    if (allLocationBtn) {
        allLocationBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Clear the selected location to show all ads
            this.adsManager.selectedLocation = null;
            this.adsManager.currentPage = 1;
            this.adsManager.handleSearch();
            
            // Optional: Update button appearance to show it's selected
            document.querySelectorAll('.location-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            allLocationBtn.classList.add('active');
        });
    }
}

locationMatches(query, locationText, locationData = '') {
    if (!query) return true; // Show all if no query
    
    // Split text into words for better matching
    const textWords = locationText.split(/\s+/);
    const dataWords = locationData.split(/\s+/);
    const allWords = [...textWords, ...dataWords];
    
    // Check if any word matches using multiple strategies
    return allWords.some(word => 
        word.startsWith(query) || 
        word.includes(query) || 
        this.fuzzyMatch(query, word) ||
        this.transliterateMatch(query, word)
    );
}

fuzzyMatch(input, word) {
    input = input.toLowerCase();
    word = word.toLowerCase();
    let i = 0, j = 0;
    while (i < input.length && j < word.length) {
        if (input[i] === word[j]) i++;
        j++;
    }
    return i === input.length;
}

transliterateMatch(query, word) {
    // Use the same transliteration logic from SearchManager
    const transliteratedQuery = this.transliterate(query);
    const transliteratedWord = this.transliterate(word);
    
    return transliteratedWord.includes(transliteratedQuery) || 
           word.includes(transliteratedQuery) ||
           transliteratedWord.includes(query);
}

transliterate(text) {
    const translitmap = {
        'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д',
        'gj': 'ѓ', 'e': 'е', 'zh': 'ж', 'z': 'з', 'dz': 'ѕ',
        'i': 'и', 'j': 'ј', 'k': 'к', 'l': 'л', 'lj': 'љ',
        'm': 'м', 'n': 'н', 'nj': 'њ', 'o': 'о', 'p': 'п',
        'r': 'р', 's': 'с', 't': 'т', 'kj': 'ќ', 'u': 'у',
        'f': 'ф', 'h': 'х', 'c': 'ц', 'ch': 'ч', 'dj': 'џ',
        'sh': 'ш'
    };

    let result = text.toLowerCase();

    // Replace multi-character sequences first
    Object.entries(translitmap).forEach(([lat, cyr]) => {
        if (lat.length > 1) {
            result = result.replace(new RegExp(lat, 'g'), cyr);
        }
    });
    
    // Then replace single characters
    Object.entries(translitmap).forEach(([lat, cyr]) => {
        if (lat.length === 1) {
            result = result.replace(new RegExp(lat, 'g'), cyr);
        }
    });
    
    return result;
}

    setupCategoryListeners() {
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.adsManager.selectedCategory = e.target.dataset.category;
                this.adsManager.currentPage = 1;
                this.adsManager.handleSearch();
            });
        });

        // Initialize category search input
        this.setupCategorySearchListeners();

        // Initialize category expand functionality
        this.setupCategoryExpandListeners();
    }
    
    setupSortListeners() {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.adsManager.currentSort = e.target.dataset.sort;
                this.elements.dateMenu.style.display = 'none';
                this.adsManager.handleSearch();
            });
        });
    }
    
    setupSearchListeners() {
        let debounceTimer;
        this.elements.searchInput.addEventListener('input', () => {
            this.adsManager.currentPage = 1; // Reset to first page on search
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this.adsManager.handleSearch(), 300);
        });
    }
    
    setupCheckboxListeners() {
        Object.values(this.elements.checkboxes).forEach(checkbox => {
            checkbox.addEventListener('change', () => this.adsManager.handleSearch());
        });
    }
    
    setupSearchTypeListeners() {
        this.elements.searchOrderedBtn.addEventListener('click', () => {
            this.adsManager.matchMethod = "ordered";
            this.adsManager.handleSearch();
            //this.elements.searchTypeMenu.style.display = 'none';
        });

        this.elements.searchSomeBtn.addEventListener('click', () => {
            this.adsManager.matchMethod = "some";
            this.adsManager.handleSearch();
            this.elements.searchTypeMenu.style.display = 'none';
        });
        
        this.elements.searchEveryBtn.addEventListener('click', () => {
            this.adsManager.matchMethod = "every";
            this.adsManager.handleSearch();
            this.elements.searchTypeMenu.style.display = 'none';
        });
    }
    
    showSearchLoading() {
        this.elements.adsGrid.classList.add('hidden');
    }
    
    hideSearchLoading() {
        this.elements.adsGrid.classList.remove('hidden');
    }
    
    scrollToTop() {
        document.body.scrollTo({ top: 0, behavior: 'smooth' });
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    createAdHTML(ad) {
        // Check the current view mode FIXME: update to new site
        if (this.currentView === 'grid') {
            return `
                <a href="${ad.adlink}" target="_blank" class="ad-link">
                    <div class="ad-block">
                        <div class="ad-header">
                            <div class="ad-title-info">
                                <div class="ad-title">${ad.adtitle}</div>
                                <div class="ad-info">
                                    <time datetime="${ad.addate}">${ad.addate}</time>
                                    <span class="ad-price">
                                        ${this.formatPrice(ad.adprice, ad.adcurrency)}
                                    </span>
                                </div>
                            </div>
                            <div class="ad-location">Град: ${ad.adlocation}</div>
                        </div>
                        ${this.getImageHTML(ad.adimage)}
                        <div class="ad-category">${ad.adcategory}</div>
                    </div>
                </a>
            `;
        } else {
            // Original list view HTML
            return `
                <a href="${ad.adlink}" target="_blank" class="ad-link">
                    <div class="ad-block">
                        <div class="ad-content-wrapper">
                        
                        <!-- LEFT COLUMN -->
                        <div class="ad-meta">
                            <div class="ad-title">${ad.adtitle}</div>
                            <div class="ad-info">
                                <time datetime="${ad.addate}">${ad.addate}</time>
                                <div class="ad-price">
                                    ${this.formatPrice(ad.adprice, ad.adcurrency)}
                                </div>
                            </div>
                                <div class="ad-location">Град: ${ad.adlocation}</div>
                                <div class="ad-phone">Тел: ${/* this.formatPhone */ad.adphone}</div>
                                <div class="ad-category">${ad.adcategory}</div>
                        </div>

                        <!-- MIDDLE COLUMN -->
                        <div class="ad-description">
                            <div class="ad-description-text">${ad.addesc}</div>
                        </div>

                        <!-- RIGHT COLUMN -->
                        <div class="ad-image">
                            ${this.getImageHTML(ad.adimage)}
                        </div>
                        
                        </div>
                    </div>
                </a>
            `;
        }
    }
    
    formatPrice(price, currency) {
        if (currency === "ПоДоговор") return "По Договор";
        return price === 0 ? currency : `${price} ${currency}`;
    }
    
    /* formatPhone(phone) {
        if (!phone) return "N/A";
        
        const cleanedPhone = phone.replace(/\D/g, '');
        
        if (cleanedPhone.length === 9) {
            return cleanedPhone.replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3');
        }
        
        return phone;
    }
     */
    getImageHTML(imageUrl) {
    const noImageUrl = window.location.origin + "/static/images/icons/noimage/no_image_2x.png";
    const noImage2 = "noImage2.jpg";

        if (typeof imageUrl === 'string' && typeof noImage2 === 'string' && imageUrl.includes(noImage2)) {
        return `<div class="ad-image">
            <img class="ad-img" src="${noImageUrl}" loading="lazy" alt="No image available">
        </div>`;
    }
    
    // Create a unique ID for this image
    const imgId = 'img_' + Math.random().toString(36).substring(2, 15);
    
    // Setup error handler with JavaScript instead of inline
    setTimeout(() => {
        const img = document.getElementById(imgId);
        if (img) {
            img.addEventListener('error', function() {
                this.src = noImageUrl;
            });
        }
    }, 0);
    
    return `<div class="ad-image">
        <img id="${imgId}" class="ad-img" src="${imageUrl}" loading="lazy" alt="">
    </div>`;
    }

    /* getImageHTML(imageUrl) {
        const noImageUrl = window.location.origin + "/static/images/icons/noimage/no_image_2x.png";
        const proxyUrl = window.location.origin + "/proxy_image?url=" + encodeURIComponent(imageUrl);
    
        // Create a unique ID for this image
        const imgId = "img_" + Math.random().toString(36).substring(2, 15);
    
        // Setup error handler with JavaScript instead of inline `onerror`
        setTimeout(() => {
            const img = document.getElementById(imgId);
            if (img) {
                img.addEventListener("error", function () {
                    console.warn("Image failed to load:", imageUrl);
                    this.src = noImageUrl;
                });
            }
        }, 0);
    
        return `<div class="ad-image">
            <img id="${imgId}" class="ad-img" src="${proxyUrl}" loading="lazy" alt="">
        </div>`;
    } */ /* Maybe for future use but no use now */
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => new AdsManager());