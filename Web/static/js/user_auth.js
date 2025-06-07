async function loadTranslations(module = 'messages') {
  // Optionally, detect user language on the client too (fallback)
  let userLang = navigator.language || navigator.userLanguage || 'en';
  userLang = userLang.split('-')[0]; // Just language code, e.g. 'en' from 'en-US'

  // Override with cookie lang if exists
  const cookieLang = document.cookie.match(/lang=([^;]+)/);
  if (cookieLang) {
    userLang = cookieLang[1];
  }

  // Ensure only supported langs:
  const supportedLangs = ['mkd', 'en', 'al'];
  if (!supportedLangs.includes(userLang)) userLang = 'en';

  const response = await fetch(`/api/translations/${module}?lang=${userLang}`);
  if (!response.ok) {
    console.error("Failed to load translations");
    return {};
  }
  return await response.json();
}

let translations = {};

function validatePassword(password, username = null, shouldCheckUsername = false) {
    if (!translations || Object.keys(translations).length === 0) {
        // fallback messages if translations are not loaded yet
        translations = {};
    }

    if (password.length < 16) {
        return {
            isValid: false,
            errorMessage: translations.password_length || "Password must be at least 16 characters."
        };
    }
    
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
        return {
            isValid: false,
            errorMessage: translations.password_uppercase || "Password must contain uppercase and lowercase letters."
        };
    }
    
    if ((password.match(/[0-9]/g) || []).length < 2) {
        return {
            isValid: false,
            errorMessage: translations.password_min_numbers || "Password must contain at least 2 numbers."
        };
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return {
            isValid: false,
            errorMessage: translations.password_special || "Password must contain at least 1 special character."
        };
    }
    
    if (shouldCheckUsername && username && password.toLowerCase() === username.toLowerCase()) {
        return {
            isValid: false,
            errorMessage: translations.password_not_username || "Password cannot be the same as the username."
        };
    }
    
    return {
        isValid: true,
        errorMessage: ""
    };
}


// Load translations when the DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  translations = await loadTranslations();
});


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

