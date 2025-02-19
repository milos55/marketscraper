class AdsManager {
    constructor() {
        this.allAds = [];
        this.currentPage = this.getIntialPage();
        this.adsPerPage = 48;
        this.selectedCategory = null;
        this.currentSort = null;
        this.filteredAds = [];
        this.matchMethod = "every";
        this.searchTerms = [];
        this.isLowMode = true; // start slider in 1 to 50000
        
        this.initializeElements();
        this.setupEventListeners();
        this.fetchAllAds();
        this.staticLines();
        this.initializeBubbles();
    }

    getIntialPage() {
        const path = window.location.pathname;
        const pageMatch = path.match(/\/page\/(\d+)/);
        return pageMatch ? parseInt(pageMatch[1]) : 1;
    }

    updateUrl(page) {
        const lang = this.getLanguageFromUrl();
        const newUrl = page === 1 ? '/${lang}/' : `/${lang}/page/${page}`;
        history.pushState({page: page}, '', newUrl);
    }

    getLanguageFromUrl() {
        const path = window.location.pathname;
        const languageMatch = path.match(/\/(mkd|en|al)\//);
        return languageMatch ? languageMatch[1] : 'mkd';
    }

    initializeElements() {
        this.elements = {
            mainContainer: document.getElementById('main-container'),
            searchInput: document.getElementById('search-input'),
            adsGrid: document.querySelector('.ads-grid'),
            categoryMenu: document.querySelector('.dropdown-cat-menu'),
            dateMenu: document.querySelector('.dropdown-date-menu'),
            categoryBtn: document.querySelector('.dropdown-cat-btn'),
            dateBtn: document.querySelector('.dropdown-date-btn'),
            searchSomeBtn: document.getElementById('search-some'),
            searchEveryBtn: document.getElementById('search-every'),
            checkboxes: {
                title: document.getElementById('checkbox-title'),
                desc: document.getElementById('checkbox-desc'),
                podogovor: document.getElementById('checkbox-podogovor'),
                price1: document.getElementById('checkbox-price-1'),
            },
            pagination: {
                prevBtns: document.querySelectorAll('.prev-page'),
                nextBtns: document.querySelectorAll('.next-page'),
                pageNumbers: document.querySelectorAll('.page-number'),
            },
            priceslider: {
                minSlider: document.getElementById('minSlider'),
                maxSlider: document.getElementById('maxSlider'),
                minBubble: document.getElementById('minBubble'),
                maxBubble: document.getElementById('maxBubble'),
                rangeTrack: document.querySelector('.range-track'),
                minLine: document.getElementById('minLine'),
                maxLine: document.getElementById('maxLine'),
                plusCircle: document.getElementById('plus-circle'),
            }
            // Add new html elemtens here
        };
    }

    // Transliteration new keep
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

    Object.entries(translitmap).forEach(([lat, cyr]) => {
        if (lat.length > 1) {
            result = result.replace(new RegExp(lat, 'g'), cyr); // if is sh or similar will return ш            
        }
    });

    Object.entries(translitmap).forEach(([lat, cyr]) => {
        if (lat.length === 1) {
            result = result.replace(new RegExp(lat, 'g'), cyr);  // if is single element such as t or e or similar will return т, е
        }
    });

    return result;
    }
    

    setupEventListeners() { //New event listeners here click move etc.
        // Dropdowns
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

        // Category selection
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectedCategory = e.target.dataset.category;
                this.elements.categoryMenu.style.display = 'none';
                this.currentPage = 1;
                this.handleSearch();
            });
        });

        // Sort selection
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentSort = e.target.dataset.sort;
                this.elements.dateMenu.style.display = 'none';
                this.handleSearch();
            });
        });

        // Search input
        let debounceTimer;
        this.elements.searchInput.addEventListener('input', () => {
            this.currentPage = 1; // Reset to the first page when input in search bar, maybe a small hack :)
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this.handleSearch(), 300);
        });

        // Checkboxes
        Object.values(this.elements.checkboxes).forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handleSearch());
        });

        // Plus cicrle for price slider
        this.elements.priceslider.plusCircle.addEventListener('click', () => { //FIX THIS
            if (typeof window.isLowMode === "undefined") {
                window.isLowMode = false; // Default to false if undefined
            }
    
            // Toggle the value
            window.isLowMode = !window.isLowMode;
    
            console.log("Low Mode is now:", window.isLowMode ? "ON" : "OFF");
    
            this.updateSliders();
        });

        // Search type every or some
        this.elements.searchSomeBtn.addEventListener('click', () => {
            this.matchMethod = "some";
            this.handleSearch();
        });

        this.elements.searchEveryBtn.addEventListener('click', () => {
            this.matchMethod = "every";
            this.handleSearch();
        });

        // Pagination
        if (this.elements.pagination.prevBtns) {
            this.elements.pagination.prevBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (this.currentPage > 1) {
                        this.handlePageChange(this.currentPage - 1);
                    }
                    this.scrollToTop();
                });
            });
        }

        if (this.elements.pagination.nextBtns) {
            this.elements.pagination.nextBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const maxPages = Math.ceil(this.filteredAds.length / this.adsPerPage);
                    if (this.currentPage < maxPages) {
                        this.handlePageChange(this.currentPage + 1);
                    }
                    this.scrollToTop();
                });
            });
        }

        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.page) {
                this.currentPage = event.state.page;
                this.displayAds();
            }
        });              
        
        // Price slider
        this.elements.priceslider.minSlider.addEventListener('input', () => this.updateSliders());
        this.elements.priceslider.maxSlider.addEventListener('input', () => this.updateSliders());
        this.elements.priceslider.minBubble.addEventListener('keydown', (e) => this.handleBubbleInput(e, 'min'));
        this.elements.priceslider.maxBubble.addEventListener('keydown', (e) => this.handleBubbleInput(e, 'max'));
    
    }

    // Scroll to top for pagiantion
    scrollToTop() {
        document.body.scrollTo({ top: 0, behavior: 'smooth' });
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    }

    handlePageChange(newPage) {
        this.currentPage = newPage;
        this.updateUrl(newPage);
        this.displayAds();
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

    filterAds() {
        this.searchTerms = this.elements.searchInput.value.trim().toLowerCase().split(',').map(term => term.trim());
        
        let filtered = this.allAds;

        // Category filter
        if (this.selectedCategory) {
            filtered = filtered.filter(ad => ad.adcategory === this.selectedCategory);
        }

        // Search terms filter
        if (this.searchTerms[0] !== '') {
            filtered = filtered.filter(ad => {
                const titleMatch = this.elements.checkboxes.title.checked && 
                    (this.matchMethod === "every" ? 
                        this.searchTerms.every(term => {
                            const transliteratedTerm = this.transliterate(term);
                            return ad.adtitle.toLowerCase().includes(term) || 
                                ad.adtitle.toLowerCase().includes(transliteratedTerm);
                        }) :
                        this.searchTerms.some(term => {
                            const transliteratedTerm = this.transliterate(term);
                            return ad.adtitle.toLowerCase().includes(term) || 
                                ad.adtitle.toLowerCase().includes(transliteratedTerm);
                        }));

                const descMatch = this.elements.checkboxes.desc.checked && 
                    (this.matchMethod === "every" ? 
                        this.searchTerms.every(term => {
                            const transliteratedTerm = this.transliterate(term);
                            return ad.addesc.toLowerCase().includes(term) || 
                                ad.addesc.toLowerCase().includes(transliteratedTerm);
                        }) :
                        this.searchTerms.some(term => {
                            const transliteratedTerm = this.transliterate(term);
                            return ad.addesc.toLowerCase().includes(term) || 
                                ad.addesc.toLowerCase().includes(transliteratedTerm);
                        }));

                return titleMatch || descMatch;
            });
        }

        // Price filters
        if (this.elements.checkboxes.podogovor.checked) {
            filtered = filtered.filter(ad => ad.adcurrency !== "ПоДоговор");
        }
        if (this.elements.checkboxes.price1.checked) {
            filtered = filtered.filter(ad => ad.adprice !== 1);
        }

        

        return filtered;
    }

    // Sorting logic
    sortAds(ads) {
        const sortedAds = [...ads];
        switch (this.currentSort) {
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

    // Search
    handleSearch() {
        this.elements.adsGrid.classList.add('hidden');
        setTimeout(() => {
            this.filteredAds = this.sortAds(this.filterAds());
            this.displayAds();
            this.elements.adsGrid.classList.remove('hidden');
        }, 150) // added for smooth transition and beautiful animation but is unnecessary if too slow
        this.updatePagination();
    }

    // Display ads
    displayAds() {
        const start = (this.currentPage - 1) * this.adsPerPage;
        const end = start + this.adsPerPage;
        const pageAds = this.filteredAds.slice(start, end);

        this.elements.adsGrid.innerHTML = pageAds.length ? 
            pageAds.map(ad => this.createAdHTML(ad)).join('') : 
            '<p>No ads for this category.</p>';

        this.updatePagination();
    }

    // Create ad HTML for ad container, anything that needs to be added needs to be added here
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

    // Display price as X MKD/X EUR or Po Dogovor
    formatPrice(price, currency) {
        if (currency === "ПоДоговор") return "По Договор";
        return price === 0 ? currency : `${price} ${currency}`;
    }

    // Format phone to be xxx-xxx-xxx instead of some being xxxxxxxxx or xxx xxx xxx
    formatPhone(phone) {
        if (!phone) return "N/A";

        const cleanedPhone = phone.replace(/\D/g, '');

        if (cleanedPhone.length === 9) {
            return cleanedPhone.replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3');
        }

        return phone;
    }

    // Display image on ad, lazy so images get loaded with less blocked erros best would be high-prio
    getImageHTML(imageUrl) {
        const noImageUrl = window.location.origin + "/static/images/No-image.png"; // Correct static path
    
        // If the image is missing or an API response error is detected
        if (!imageUrl || imageUrl.includes("No HTTP resource was found") || imageUrl.includes("No type was found")) {
            return `<img src="${noImageUrl}" alt="No Image" height="100px" width="100px">`;
        }
    
        // Return the image with onerror fallback to No-image.png
        return `<div class="ad-image">
            <img class="ad-img" src="${imageUrl}" loading="lazy" alt="" 
                 onerror="this.onerror=null; this.src='${noImageUrl}'">
        </div>`;
    }

    // Update pagination when page change
    updatePagination() {
        const totalPages = Math.ceil(this.filteredAds.length / this.adsPerPage);
        const lang = this.getLanguageFromUrl();

        if (this.elements.pagination.prevBtns) {
            this.elements.pagination.prevBtns.forEach(btn => {
                btn.disabled = this.currentPage === 1;
            });
        }
        
        if (this.elements.pagination.nextBtns) {
            this.elements.pagination.nextBtns.forEach(btn => {
                btn.disabled = this.currentPage === totalPages;
            });
        }

        if (this.elements.pagination.pageNumbers) {
            this.elements.pagination.pageNumbers.forEach(pageNumber => {
                pageNumber.innerHTML = `
                    Page <input type="number" class="page-input" value="${this.currentPage}" min="1" max="${totalPages}"> / ${totalPages}
                `;

                const pageInput = pageNumber.querySelector('.page-input');
                if (pageInput) {
                    // Remove any existing event listeners
                    const newPageInput = pageInput.cloneNode(true);
                    pageInput.parentNode.replaceChild(newPageInput, pageInput);
                    
                    newPageInput.addEventListener('change', (e) => {
                        const newPage = parseInt(e.target.value);
                        if (newPage >= 1 && newPage <= totalPages) {
                            this.handlePageChange(newPage);
                        } else {
                            e.target.value = this.currentPage;
                        }
                    });

                    newPageInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            const newPage = parseInt(e.target.value);
                            if (newPage >= 1 && newPage <= totalPages) {
                                this.handlePageChange(newPage);
                            } else {
                                e.target.value = this.currentPage;
                            }
                        }
                    });
                }
            });
        }
    }

    // Intial price slider
    initializePriceSlider() {
        this.updatePriceSlider();
    }

    updateSliders() {
        const { minSlider, maxSlider, minBubble, maxBubble, rangeTrack } = this.elements.priceslider;

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
        const { minSlider, maxSlider, minBubble, maxBubble } = this.elements.priceslider;

        let minValue = parseInt(minSlider.value);
        let maxValue = parseInt(maxSlider.value);
        let sliderMax = parseInt(maxSlider.max);

        const minPercent = (minValue / sliderMax) * 100;
        const maxPercent = (maxValue / sliderMax) * 100;

        minBubble.style.left = minPercent + "%";
        maxBubble.style.left = maxPercent + "%";
    }


    staticLines() {
        const { minSlider, maxSlider, minLine, maxLine } = this.elements.priceslider;

        minLine.style.left = '-0.8%';
        maxLine.style.left = '100%';
    }

    // Handle input directly in the bubble fields
    handleBubbleInput(e, type) {
        if (e.key !== 'Enter') return;

        const { minSlider, maxSlider } = this.elements.priceslider;
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

    // Update the range of the sliders based on mode
    setSliderRange(min, max) {
        const { minSlider, maxSlider } = this.elements.priceslider;
        minSlider.setAttribute('min', min);
        minSlider.setAttribute('max', max);
        maxSlider.setAttribute('min', min);
        maxSlider.setAttribute('max', max);

        // Ensure values are within the new range
        if (parseInt(minSlider.value) < min) minSlider.value = min;
        if (parseInt(maxSlider.value) > max) maxSlider.value = max;
    }

}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => new AdsManager());