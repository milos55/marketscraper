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

// Helper function to get success message in the correct language
function getSuccessMessage() {
  if (translations.password_valid) {
    return translations.password_valid;
  }
  
  // Fallback based on detected language
  let userLang = navigator.language || navigator.userLanguage || 'en';
  userLang = userLang.split('-')[0];
  
  const cookieLang = document.cookie.match(/lang=([^;]+)/);
  if (cookieLang) {
    userLang = cookieLang[1];
  }
  
  const supportedLangs = ['mkd', 'en', 'al'];
  if (!supportedLangs.includes(userLang)) userLang = 'en';
  
  const fallbackMessages = {
    'mkd': 'Лозинката ги исполнува сите барања!',
    'en': 'Password meets all requirements!',
    'al': 'Fjalëkalimi plotëson të gjitha kërkesat!'
  };
  
  return fallbackMessages[userLang] || fallbackMessages['en'];
}

// Helper function to get password match messages in the correct language
function getPasswordMatchMessages() {
  const userLang = getUserLanguage();
  
  const messages = {
    match: {
      'mkd': translations.passwords_match || 'Лозинките се совпаѓаат!',
      'en': translations.passwords_match || 'Passwords match!',
      'al': translations.passwords_match || 'Fjalëkalimet përputhen!'
    },
    mismatch: {
      'mkd': translations.passwords_mismatch || 'Лозинките не се совпаѓаат',
      'en': translations.passwords_mismatch || 'Passwords do not match',
      'al': translations.passwords_mismatch || 'Fjalëkalimet nuk përputhen'
    }
  };
  
  return {
    match: messages.match[userLang] || messages.match['en'],
    mismatch: messages.mismatch[userLang] || messages.mismatch['en']
  };
}

// Helper function to get user language
function getUserLanguage() {
  let userLang = navigator.language || navigator.userLanguage || 'en';
  userLang = userLang.split('-')[0];
  
  const cookieLang = document.cookie.match(/lang=([^;]+)/);
  if (cookieLang) {
    userLang = cookieLang[1];
  }
  
  const supportedLangs = ['mkd', 'en', 'al'];
  if (!supportedLangs.includes(userLang)) userLang = 'en';
  
  return userLang;
}

function validatePassword(password, username = null, shouldCheckUsername = false) {
    if (!translations || Object.keys(translations).length === 0) {
        // fallback messages if translations are not loaded yet
        translations = {};
    }

    if (password.length < 15) {
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
  
  // Re-validate any existing password values after translations load
  const passwordField = document.querySelector('input[name="password"]') || 
                        document.querySelector('input[name="new_password"]');
  
  if (passwordField && passwordField.value) {
    // Trigger validation for autocompleted passwords
    passwordField.dispatchEvent(new Event('input'));
  }
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
                          document.querySelector('input[name="new_password"]') ||
                          document.querySelector('input[name="current_password"]');
    const confirmPasswordField = document.querySelector('input[name="confirm_password"]') ||
                                document.querySelector('input[name="password_confirmation"]') ||
                                document.querySelector('input[name="confirm_new_password"]') ||
                                document.querySelector('input[name="new_password_confirm"]');
    const usernameField = document.querySelector('input[name="username"]') ||
                         document.querySelector('input[name="email"]');
    const passwordFeedback = document.getElementById('password-feedback');
    const confirmPasswordFeedback = document.getElementById('confirm-password-feedback');

    // Debug logging to help identify issues
    console.log('Found elements:', {
        passwordField: passwordField ? passwordField.name : 'not found',
        confirmPasswordField: confirmPasswordField ? confirmPasswordField.name : 'not found',
        usernameField: usernameField ? usernameField.name : 'not found',
        passwordFeedback: passwordFeedback ? 'found' : 'not found',
        confirmPasswordFeedback: confirmPasswordFeedback ? 'found' : 'not found'
    });

    if (passwordField && passwordFeedback) {
        console.log('Password field and feedback element found'); // Debug message

        function validateAndUpdateFeedback() {
            const username = (shouldCheckUsername && usernameField) ? usernameField.value : null;
            const validation = validatePassword(passwordField.value, username, shouldCheckUsername);

            if (!validation.isValid) {
                passwordFeedback.textContent = validation.errorMessage;
                passwordFeedback.className = 'form-text text-danger';
            } else {
                passwordFeedback.textContent = getSuccessMessage();
                passwordFeedback.className = 'form-text text-success';
            }
        }

        // Add event listeners for the main password field (works for both password and new_password)
        passwordField.addEventListener('input', validateAndUpdateFeedback);
        passwordField.addEventListener('change', validateAndUpdateFeedback);
        passwordField.addEventListener('focus', () => {
            setTimeout(validateAndUpdateFeedback, 100);
        });
        
        if (shouldCheckUsername && usernameField) {
            usernameField.addEventListener('input', validateAndUpdateFeedback);
            usernameField.addEventListener('change', validateAndUpdateFeedback);
        }

        if (confirmPasswordField) {
            function validatePasswordMatch() {
                const matchMessages = getPasswordMatchMessages();
                
                if (!confirmPasswordField.value) {
                    // Clear feedback when confirm field is empty
                    if (confirmPasswordFeedback) {
                        confirmPasswordFeedback.textContent = '';
                        confirmPasswordFeedback.className = 'form-text';
                    }
                    confirmPasswordField.setCustomValidity("");
                    return;
                }
                
                if (passwordField.value !== confirmPasswordField.value) {
                    // Passwords don't match
                    if (confirmPasswordFeedback) {
                        confirmPasswordFeedback.textContent = matchMessages.mismatch;
                        confirmPasswordFeedback.className = 'form-text text-danger';
                    }
                    confirmPasswordField.setCustomValidity(matchMessages.mismatch);
                } else {
                    // Passwords match
                    if (confirmPasswordFeedback) {
                        confirmPasswordFeedback.textContent = matchMessages.match;
                        confirmPasswordFeedback.className = 'form-text text-success';
                    }
                    confirmPasswordField.setCustomValidity("");
                }
            }
            
            confirmPasswordField.addEventListener('input', validatePasswordMatch);
            confirmPasswordField.addEventListener('change', validatePasswordMatch);
            confirmPasswordField.addEventListener('blur', validatePasswordMatch);
            
            // Also validate confirm password when main password changes
            passwordField.addEventListener('input', function() {
                validateAndUpdateFeedback(); // Validate main password
                validatePasswordMatch(); // Validate password match
            });
            passwordField.addEventListener('change', function() {
                validatePasswordMatch();
            });
        }
        
        // Initial validation in case field already has a value (autocomplete)
        if (passwordField.value) {
            setTimeout(validateAndUpdateFeedback, 200);
        }
    } else {
        console.log('Password field or feedback element not found'); // Debug message
    }
});