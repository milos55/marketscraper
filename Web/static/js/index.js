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
        this.priceSliderManager = new PriceSliderManager(this.elements.priceslider);
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
        this.uiManager.setupCategoryListeners();
        this.uiManager.setupSortListeners();
        this.uiManager.setupSearchListeners();
        this.uiManager.setupCheckboxListeners();
        this.uiManager.setupSearchTypeListeners();
        this.paginationManager.setupPaginationListeners();
        this.priceSliderManager.setupSliderListeners();
        
        // Handle browser back/forward navigation
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.page) {
                this.currentPage = event.state.page;
                this.displayAds();
            }
        });
    }
    
    async fetchAllAds() {
        try {
            const response = await fetch('/fetch_ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: null })
            });
            this.allAds = await response.json();
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
        this.displayAds();
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
        this.priceslider = {
            minSlider: document.getElementById('minSlider'),
            maxSlider: document.getElementById('maxSlider'),
            minBubble: document.getElementById('minBubble'),
            maxBubble: document.getElementById('maxBubble'),
            rangeTrack: document.querySelector('.range-track'),
            minLine: document.getElementById('minLine'),
            maxLine: document.getElementById('maxLine'),
            plusCircle: document.getElementById('plus-circle'),
        };
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
        
        if (this.elements.checkboxes.podogovor.checked) {
            filtered = filtered.filter(ad => ad.adcurrency !== "ПоДоговор");
        }
        
        if (this.elements.checkboxes.price1.checked) {
            filtered = filtered.filter(ad => ad.adprice !== 1);
        }
        
        return filtered;
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

// Manages price slider
class PriceSliderManager {
    constructor(sliderElements) {
        this.elements = sliderElements;
        this.isLowMode = true; // start slider in 1 to 50000
        
        this.initializeBubbles();
        this.staticLines();
    }
    
    setupSliderListeners() {
        this.elements.minSlider.addEventListener('input', () => this.updateSliders());
        this.elements.maxSlider.addEventListener('input', () => this.updateSliders());
        this.elements.minBubble.addEventListener('keydown', (e) => this.handleBubbleInput(e, 'min'));
        this.elements.maxBubble.addEventListener('keydown', (e) => this.handleBubbleInput(e, 'max'));
        
        this.elements.plusCircle.addEventListener('click', () => {
            this.isLowMode = !this.isLowMode;
            console.log("Low Mode is now:", this.isLowMode ? "ON" : "OFF");
            this.updateSliders();
        });
    }
    
    updateSliders() {
        const { minSlider, maxSlider, minBubble, maxBubble, rangeTrack } = this.elements;
        
        // Check if we should switch modes
        if (parseInt(maxSlider.value) > 50000 && this.isLowMode) {
            this.isLowMode = false;
            this.setSliderRange(50001, 50000000); // High mode range
        } else if (parseInt(maxSlider.value) <= 50000 && !this.isLowMode) {
            this.isLowMode = true;
            this.setSliderRange(1, 50000); // Low mode range
        }
        
        let minValue = parseInt(minSlider.value);
        let maxValue = parseInt(maxSlider.value);
        
        // Prevent sliders from overlapping
        if (minValue > maxValue - 1000) minSlider.value = maxValue - 1000;
        if (maxValue < minValue + 1000) maxSlider.value = minValue + 1000;
        
        minValue = parseInt(minSlider.value);
        maxValue = parseInt(maxSlider.value);
        
        const minPercent = (minValue / minSlider.max) * 100;
        const maxPercent = (maxValue / maxSlider.max) * 100;
        
        // Update range track width
        rangeTrack.style.left = minPercent + "%";
        rangeTrack.style.width = (maxPercent - minPercent) + "%";
        
        // Update the bubble values
        minBubble.value = minValue;
        maxBubble.value = maxValue;
        
        // Position minBubble and maxBubble based on the slider values
        minBubble.style.left = minPercent + "%";
        maxBubble.style.left = maxPercent + "%";
        
        // Update the text content of the bubbles
        minBubble.textContent = minValue;
        maxBubble.textContent = maxValue;
    }
    
    initializeBubbles() {
        const { minSlider, maxSlider, minBubble, maxBubble } = this.elements;
        
        let minValue = parseInt(minSlider.value);
        let maxValue = parseInt(maxSlider.value);
        let sliderMax = parseInt(maxSlider.max);
        
        const minPercent = (minValue / sliderMax) * 100;
        const maxPercent = (maxValue / sliderMax) * 100;
        
        minBubble.style.left = minPercent + "%";
        maxBubble.style.left = maxPercent + "%";
    }
    
    staticLines() {
        const { minLine, maxLine } = this.elements;
        minLine.style.left = '-0.8%';
        maxLine.style.left = '100%';
    }
    
    handleBubbleInput(e, type) {
        if (e.key !== 'Enter') return;
        
        const { minSlider, maxSlider } = this.elements;
        const value = parseInt(e.target.value);
        
        if (isNaN(value)) return;
        
        if (type === 'min') {
            // Prevent the min value from being greater than max - 1000
            if (value > maxSlider.value - 1000) {
                minSlider.value = maxSlider.value - 1000;
                e.target.value = minSlider.value;
            } else {
                minSlider.value = value;
            }
        } else if (type === 'max') {
            // Prevent the max value from being less than min + 1000
            if (value < minSlider.value + 1000) {
                maxSlider.value = minSlider.value + 1000;
                e.target.value = maxSlider.value;
            } else {
                maxSlider.value = value;
            }
        }
        
        this.updateSliders(); // Update the sliders and bubbles after input
    }
    
    setSliderRange(min, max) {
        const { minSlider, maxSlider } = this.elements;
        minSlider.setAttribute('min', min);
        minSlider.setAttribute('max', max);
        maxSlider.setAttribute('min', min);
        maxSlider.setAttribute('max', max);
        
        // Ensure values are within the new range
        if (parseInt(minSlider.value) < min) minSlider.value = min;
        if (parseInt(maxSlider.value) > max) maxSlider.value = max;
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