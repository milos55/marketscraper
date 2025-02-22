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
        
        // Initialize components
        this.elements = new ElementsManager();
        this.urlManager = new UrlManager();
        this.searchManager = new SearchManager(this);
        this.filterManager = new FilterManager(this);
        this.paginationManager = new PaginationManager(this);
        this.uiManager = new UiManager(this.elements, this);
        
        // Setup and initialize
        this.setupEventListeners();
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
        // Only recompute if the currency has changed
        if (targetCurrency === this.currentCurrency) return;

        this.currentCurrency = targetCurrency; // Update the current currency

        this.allAds.forEach(ad => {
            // Convert the ad price to the target currency and store it
            ad.convertedPrices = ad.convertedPrices || {}; // Initialize if not exists
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: null })
                });
                this.allAds = await response.json();

                this.allAds = this.allAds.map(ad => {
                    if (typeof ad.adprice !== 'number' || !ad.adcurrency) {
                        console.error("Invalid ad:", ad);
                        return null;
                    }
                    return { ...ad, convertedPrices: {} };
                }).filter(ad => ad !== null);

                // Store ads in memory
                window.adsCache = this.allAds;
            }

            this.precomputePrices("MKD");
            this.handleSearch();
        } catch (error) {
            console.error('Error fetching ads:', error);
            this.elements.adsGrid.innerHTML = '<p>Error loading ads. Please try again later.</p>';
        }
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
            currencySelect: document.getElementById('currency-select'),
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
    }
    
    getFilteredAds(allAds, searchTerms) {
        let filtered = this.applyBaseFilters(allAds);
        filtered = this.applySearchTerms(filtered, searchTerms);
        filtered = this.applyPriceFilters(filtered);
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
    
        // Get min and max price values
        const minPriceInput = this.elements.priceSelector.minPrice.value;
        const minPrice = minPriceInput ? parseFloat(minPriceInput) : 1;
        const maxPrice = parseFloat(this.elements.priceSelector.maxPrice.value) || Infinity;
        const selectedCurrency = normalizeCurrency(this.elements.priceSelector.currencySelect.value);
    
        // Validate minPrice and maxPrice
        if (isNaN(minPrice)) {
            console.log("Invalid minPrice:", minPrice);
            return filtered;
        }
        if (isNaN(maxPrice)) {
            return filtered;
        }
    
        // Filter ads
        filtered = filtered.filter(ad => {
            const convertedPrice = ad.convertedPrices[selectedCurrency];
    
            // **If min price is 1, include "По Договор" ads**
            if (minPrice === 1 && normalizeCurrency(ad.adcurrency) === "NEGOTIABLE") {
                return true;
            }
    
            // **If min price is set by the user, exclude "По Договор" ads**
            if (minPrice > 1 && normalizeCurrency(ad.adcurrency) === "NEGOTIABLE") {
                return false;
            }
    
            return convertedPrice >= minPrice && convertedPrice <= maxPrice;
        });
    
        return filtered;
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

    setupPriceRangeListeners() {
        const minPriceInput = this.elements.priceSelector.minPrice;
        const maxPriceInput = this.elements.priceSelector.maxPrice;
        const currencySelect = this.elements.priceSelector.currencySelect;

        if (minPriceInput && maxPriceInput && currencySelect) {
            // Debounce function to limit how often the filter is triggered
            const debounce = (func, delay) => {
                let timer;
                return function (...args) {
                    clearTimeout(timer);
                    timer = setTimeout(() => func.apply(this, args), delay);
                };
            };

            const handlePriceChange = debounce(() => {
                this.adsManager.handleSearch();
            }, 300); // Adjust the delay as needed

            minPriceInput.addEventListener('input', handlePriceChange);
            maxPriceInput.addEventListener('input', handlePriceChange);

            // Precompute prices when currency changes
            currencySelect.addEventListener('change', () => {
                const selectedCurrency = normalizeCurrency(currencySelect.value);
                this.adsManager.precomputePrices(selectedCurrency);
                this.adsManager.handleSearch();
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
                        <div class="ad-phone">Phone: ${this.formatPhone(ad.adphone)}</div>
                    </div>
                    <div class="ad-description">
                        <div class="ad-description-text">${ad.addesc}</div>
                        ${this.getImageHTML(ad.adimage)}
                    </div>
                </div>
            </a>
        `;
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
        const noImageUrl = window.location.origin + "/static/images/No-image.png";
        
        // If the image is missing or an API response error is detected
        if (!imageUrl || imageUrl.includes("No HTTP resource was found") || imageUrl.includes("No type was found")) {
            return `<img src="${noImageUrl}" alt="No Image" height="100px" width="100px">`;
        }
        
        // Return the image with onerror fallback
        return `<div class="ad-image">
            <img class="ad-img" src="${imageUrl}" loading="lazy" alt="" 
                 onerror="this.onerror=null; this.src='${noImageUrl}'">
        </div>`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => new AdsManager());