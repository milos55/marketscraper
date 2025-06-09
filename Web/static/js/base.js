document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.querySelector('.toggle-btn');
    const mobileMenu = document.querySelector('.mobile-menu');

    if (!toggleBtn || !mobileMenu) return;

    toggleBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('open');
    });

    document.addEventListener('click', (event) => {
        if (!toggleBtn.contains(event.target) && !mobileMenu.contains(event.target)) {
            mobileMenu.classList.remove('open');
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 992) {
            mobileMenu.classList.remove('open');
        }
    });
});
