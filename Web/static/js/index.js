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
        const path = window.location.pathname;
        const pageMatch = path.match(/\/page\/(\d+)/);
        return pageMatch ? parseInt(pageMatch[1]) : 1;
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
                    if (typeof ad.adprice !== 'number' || !ad.adcurrency) {
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
            this.handleSearch();
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
        const gridContainer = document.querySelector('.dropdown-cat-menu .grid-container');
        
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
            li.appendChild(button);
            gridContainer.appendChild(li);
        });
        
        // Re-attach event listeners
        this.uiManager.setupCategoryListeners();
    }
    
    handleSearch() {
        this.uiManager.showSearchLoading();
        setTimeout(() => {
            this.searchTerms = this.searchManager.parseSearchTerms();
            this.filteredAds = this.filterManager.getFilteredAds(this.allAds, this.searchTerms);
            this.currentPage = 1;
            this.displayAds();
            this.uiManager.hideSearchLoading();
        }, 150);
    }
    
    handlePageChange(newPage) {
        this.currentPage = newPage;
        this.urlManager.updateUrl(newPage);
        this.displayAds(); // No need to fetch again
        this.uiManager.scrollToTop();
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
        this.categoryMenu = document.querySelector('.dropdown-cat-menu');
        this.dateMenu = document.querySelector('.dropdown-date-menu');
        this.categoryBtn = document.querySelector('.dropdown-cat-btn');
        this.dateBtn = document.querySelector('.dropdown-date-btn');
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
        const newUrl = page === 1 ? `/${lang}/` : `/${lang}/page/${page}`;
        history.pushState({page: page}, '', newUrl);
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
    
    matches(text, term, matchMethod) {
        const transliteratedTerm = this.transliterate(term);
        return text.toLowerCase().includes(term) || text.toLowerCase().includes(transliteratedTerm);
    }
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
        if (searchTerms[0] === '') return ads;
        
        return ads.filter(ad => {
            const titleMatch = this.elements.checkboxes.title.checked && 
                this.matchesAllTerms(ad.adtitle, searchTerms);
                
            const descMatch = this.elements.checkboxes.desc.checked && 
                this.matchesAllTerms(ad.addesc, searchTerms);
                
            return titleMatch || descMatch;
        });
    }
    
    matchesAllTerms(text, terms) {
        if (this.adsManager.matchMethod === "every") {
            return terms.every(term => this.searchManager.matches(text, term));
        } else {
            return terms.some(term => this.searchManager.matches(text, term));
        }
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
                        this.adsManager.handlePageChange(this.adsManager.currentPage - 1);
                    }
                });
            });
        }
        
        if (this.elements.nextBtns) {
            this.elements.nextBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const maxPages = Math.ceil(this.adsManager.filteredAds.length / this.adsManager.adsPerPage);
                    if (this.adsManager.currentPage < maxPages) {
                        this.adsManager.handlePageChange(this.adsManager.currentPage + 1);
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

    // Add this to your UiManager class
setupViewToggleListeners() {
    const gridButton = document.querySelector('.selector-img[src*="grid_1.png"]');
    const slidesButton = document.querySelector('.selector-img[src*="slides_1.png"]');
    
    if (!gridButton || !slidesButton) {
        console.warn('View toggle buttons not found');
        return;
    }
    
    // Set initial state - slides (list) view is default
    this.currentView = 'slides';
    this.elements.adsGrid.classList.add('slides-view');
    slidesButton.classList.add('active-view');
    
    // Grid view button click handler
    gridButton.addEventListener('click', () => {
        this.currentView = 'grid';
        this.elements.adsGrid.classList.remove('slides-view');
        this.elements.adsGrid.classList.add('grid-view');
        
        // Update button states
        gridButton.classList.add('active-view');
        slidesButton.classList.remove('active-view');
        
        // Re-render ads in the current page with grid layout
        this.adsManager.displayAds();
    });
    
    // Slides (list) view button click handler
    slidesButton.addEventListener('click', () => {
        this.currentView = 'slides';
        this.elements.adsGrid.classList.remove('grid-view');
        this.elements.adsGrid.classList.add('slides-view');
        
        // Update button states
        slidesButton.classList.add('active-view');
        gridButton.classList.remove('active-view');
        
        // Re-render ads in the current page with list layout
        this.adsManager.displayAds();
    });
    }
    
    setupDropdownListeners() {
        this.elements.categoryBtn.addEventListener('click', () => {
            this.elements.categoryMenu.style.display = 
                this.elements.categoryMenu.style.display === 'block' ? 'none' : 'block';
        });
        
        this.elements.dateBtn.addEventListener('click', () => {
            this.elements.dateMenu.style.display = 
                this.elements.dateMenu.style.display === 'block' ? 'none' : 'block';
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.matches('.dropdown-cat-btn')) {
                this.elements.categoryMenu.style.display = 'none';
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
        }
    }

    setupCategoryListeners() {
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.adsManager.selectedCategory = e.target.dataset.category;
                this.elements.categoryMenu.style.display = 'none';
                this.adsManager.currentPage = 1;
                this.adsManager.handleSearch();
            });
        });
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
        this.elements.searchSomeBtn.addEventListener('click', () => {
            this.adsManager.matchMethod = "some";
            this.adsManager.handleSearch();
        });
        
        this.elements.searchEveryBtn.addEventListener('click', () => {
            this.adsManager.matchMethod = "every";
            this.adsManager.handleSearch();
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
        // Check the current view mode
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
                            <div class="ad-email">Град: ${ad.adlocation}</div>
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
                            <div class="ad-email">Град: ${ad.adlocation}</div>
                            <div class="ad-phone">Тел: ${this.formatPhone(ad.adphone)}</div>
                        </div>
                        <div class="ad-description">
                            <div class="ad-description-text">${ad.addesc}</div>
                            ${this.getImageHTML(ad.adimage)} 
                        </div>
                        <div class="ad-category">${ad.adcategory}</div>
                    </div>
                </a>
            `;
        }
    }
    
    formatPrice(price, currency) {
        if (currency === "ПоДоговор") return "По Договор";
        return price === 0 ? currency : `${price} ${currency}`;
    }
    
    formatPhone(phone) {
        if (!phone) return "N/A";
        
        const cleanedPhone = phone.replace(/\D/g, '');
        
        if (cleanedPhone.length === 9) {
            return cleanedPhone.replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3');
        }
        
        return phone;
    }
    
    getImageHTML(imageUrl) {
    const noImageUrl = window.location.origin + "/static/images/icons/noimage/no_image_2x.png";
    
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