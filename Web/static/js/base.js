document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.querySelector('.toggle_btn'); // Select the toggle button
    const dropdownMenu = document.querySelector('.dropdown_menu'); // Select the dropdown menu

    if (toggleBtn && dropdownMenu) { // Ensure elements exist before adding event listeners
        toggleBtn.addEventListener('click', () => {
            dropdownMenu.classList.toggle('active'); // Toggle active class
        });

        // Optional: Close dropdown when clicking outside
        document.addEventListener('click', (event) => {
            if (!toggleBtn.contains(event.target) && !dropdownMenu.contains(event.target)) {
                dropdownMenu.classList.remove('active');
            }
        });

        // Close menu when resizing back to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 992) {
                dropdownMenu.classList.remove('active');
            }
        });
    }
});