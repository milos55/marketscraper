function validatePassword(password, username = null, shouldCheckUsername = false) {
    // Check password length
    if (password.length < 16) {
        return {
            isValid: false,
            errorMessage: "Лозинката мора да има најмалку 16 карактери." /* FIX TRANSLATIONS ALL ERROR MESSAGES */
        };
    }
    
    // Check for mixed case (upper and lower)
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
        return {
            isValid: false,
            errorMessage: "Лозинката мора да содржи големи и мали букви."
        };
    }
    
    // Check for at least 2 numbers
    if ((password.match(/[0-9]/g) || []).length < 2) {
        return {
            isValid: false,
            errorMessage: "Лозинката мора да содржи најмалку 2 броја."
        };
    }
    
    // Check for at least 1 symbol
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return {
            isValid: false,
            errorMessage: "Лозинката мора да содржи најмалку 1 специјален карактер."
        };
    }
    
    // Only check username equality if required and username is provided
    if (shouldCheckUsername && username && password.toLowerCase() === username.toLowerCase()) {
        return {
            isValid: false,
            errorMessage: "Лозинката не смее да биде иста со корисничкото име."
        };
    }
    
    return {
        isValid: true,
        errorMessage: ""
    };
}

// Run when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Password validation script loaded'); // Debug message
    
    let shouldCheckUsername = false;

    // Determine if we should check the username based on the page
    if (window.location.pathname.includes('register')) {
        shouldCheckUsername = true;
    }

    const form = document.querySelector('form');
    if (form && form.getAttribute('data-check-username') === 'true') {
        shouldCheckUsername = true;
    }
    
    console.log('Username check required:', shouldCheckUsername); // Debug message
    
    // Select the correct password field based on the route
    const passwordField = document.querySelector('input[name="password"]') || 
                          document.querySelector('input[name="new_password"]');
    const confirmPasswordField = document.querySelector('input[name="confirm_password"]');
    const usernameField = document.querySelector('input[name="username"]');
    const passwordFeedback = document.getElementById('password-feedback');

    if (passwordField && passwordFeedback) {
        console.log('Password field and feedback element found'); // Debug message

        function validateAndUpdateFeedback() {
            const username = (shouldCheckUsername && usernameField) ? usernameField.value : null;
            const validation = validatePassword(passwordField.value, username, shouldCheckUsername);

            if (!validation.isValid) {
                passwordFeedback.textContent = validation.errorMessage;
                passwordFeedback.className = 'form-text text-danger';
            } else {
                passwordFeedback.textContent = "Лозинката ги исполнува сите барања!";
                passwordFeedback.className = 'form-text text-success';
            }
        }

        passwordField.addEventListener('input', validateAndUpdateFeedback);
        
        if (shouldCheckUsername && usernameField) {
            usernameField.addEventListener('input', validateAndUpdateFeedback);
        }

        if (confirmPasswordField) {
            confirmPasswordField.addEventListener('input', function() {
                if (passwordField.value !== confirmPasswordField.value) {
                    confirmPasswordField.setCustomValidity("Лозинките не се совпаѓаат");
                } else {
                    confirmPasswordField.setCustomValidity("");
                }
            });
        }
    } else {
        console.log('Password field or feedback element not found'); // Debug message
    }
});
