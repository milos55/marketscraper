# For flask site
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, make_response, g, send_file, Response
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_mail import Mail
# For security implementaton
from flask_wtf.csrf import CSRFProtect, CSRFError, validate_csrf
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, Length
import secrets
# For password hashing
from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import generate_password_hash, check_password_hash
# for DB
from flask_sqlalchemy import SQLAlchemy
# Random utils for site
from datetime import datetime, date, timedelta
from email_utils import send_verification_email, send_reset_email, verify_token # for email verification and reset password
from translation_utils import TranslationManager, init_translation_system, translation_manager, translate
import requests
from io import BytesIO
import os
import yaml
from config import Config

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config.from_object(Config)


init_translation_system(app)

# Security managment
csrf = CSRFProtect(app)
CORS(app, resources={r"/fetch_ads": {"origins": "*"}})  # Allow image loading from any origin

limiter = Limiter(
    key_func=get_remote_address  # Automatically gets the client's IP
)
limiter.init_app(app)  # Attach it to the app separately

# Exempt CSRF for image loading
@csrf.exempt
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

mail = Mail(app)

db = SQLAlchemy(app)

# Model imports ( Ads, Users)

from models import User, Ad

# Initialize LoginManager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.before_request
def generate_nonce():
    # Generate a nonce
    g.nonce = secrets.token_hex(16)


# Security headers
@app.after_request
def add_security_headers(response):
    # Add the Content Security Policy header
    response.headers["Content-Security-Policy"] = (
        f"default-src 'self'; "
        f"script-src 'self' 'nonce-{g.nonce}' https://cdnjs.cloudflare.com; "
        f"style-src 'self' 'nonce-{g.nonce}' https://cdnjs.cloudflare.com ; "
        f"font-src 'self' https://cdnjs.cloudflare.com; "
        f"img-src 'self' data: blob: https://flagcdn.com https://*.com https://reklama5.mk; "
    )
    
    # Other security headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    return response

@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    flash('The form security token has expired. Please try again.', 'danger')
    lang = request.cookies.get('lang', 'en')
    return redirect(url_for('index_lang', lang=lang))

# Password validation
def validate_password(password, username=None):
    # Check password length
    if len(password) < 16:
        return False, "Password must be at least 16 characters long."
    
    # Check if password contains both uppercase and lowercase letters
    if not (any(c.isupper() for c in password) and any(c.islower() for c in password)):
        return False, "Password must contain both uppercase and lowercase letters."
    
    # Check if password contains at least 2 numbers
    if sum(c.isdigit() for c in password) < 2:
        return False, "Password must contain at least 2 numbers."
    
    # Check if password contains at least 1 symbol
    import string
    symbols = set(string.punctuation)
    if not any(c in symbols for c in password):
        return False, "Password must contain at least 1 symbol."
    
    # Check if password is not the same as username (if provided)
    if username and password.lower() == username.lower():
        return False, "Password cannot be the same as your username."
    
    return True, None

# Routes
@app.route('/<lang>/register', methods=['GET', 'POST'])
@limiter.limit("10 per minute")
def register(lang):
    if current_user.is_authenticated:
        lang = request.cookies.get('lang', 'en')
        return redirect(url_for('index_lang', lang=lang))
    
    # Validate language
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'  # Fallback to English if the language is invalid
    
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        # Validation
        error = None
        if not username:
            error = 'Username is required.'
        elif not email:
            error = 'Email is required.'
        elif not password:
            error = 'Password is required.'
        elif password != confirm_password:
            error = 'Passwords do not match.'
        elif User.query.filter_by(username=username).first():
            error = 'Username already exists.'
        elif User.query.filter_by(email=email).first():
            error = 'Email already registered.'
        
        # Password validation
        if error is None:
            is_valid, password_error = validate_password(password, username)
            if not is_valid:
                error = password_error
        
        if error is None:
            # Create new user
            new_user = User(username=username, email=email, password=password, language=lang)
            db.session.add(new_user)
            db.session.commit()

            send_verification_email(email, lang)  # Send verification email
            
            flash(translate('email_confirmation_needed', module='messages', lang=lang), 'success')
            return redirect(url_for('login', lang=lang))
        
        flash(error, 'danger')
    
    return render_template('/routes/register.html')

@app.route('/<lang>/confirm/<token>')
def confirm_email(lang, token):
    try:
        email = verify_token(token)
    except:
        flash(translate('link_invalid', module='messages', lang=lang), 'danger')
        return redirect(url_for('login', lang=lang))
    
    user = User.query.filter_by(email=email).first_or_404()
    if user.email_confirmed:
        flash(translate('account_confirmed', module='messages', lang=lang), 'info')
    else:
        user.email_confirmed = True
        db.session.add(user)
        db.session.commit()
        flash(translate('account_confirmation_success', module='messages', lang=lang), 'success')
    
    return redirect(url_for('login', lang=lang))

# User login route
@app.route('/<lang>/login', methods=['GET', 'POST'])
@limiter.limit("10 per minute")
def login(lang):
    if current_user.is_authenticated:
        lang = request.cookies.get('lang', 'en')
        return redirect(url_for('index_lang', lang=lang))
    
    lang = request.cookies.get('lang', 'en')
    
    # Validate language
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'  # Fallback to English if the language is invalid
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember_me = 'remember_me' in request.form
        
        user = User.query.filter_by(username=username).first()
        
        if user:
            # Check if the account is deactivated
            if not user.is_active:
                return render_template('/routes/user_deactivated.html')

            if user.check_password(password):
                # Check if email is confirmed
                if not user.email_confirmed:
                    flash(translate('email_confirmation_needed', module='messages', lang=lang), 'warning')
                    return redirect(url_for('login', lang=lang))
                
                login_user(user, remember=remember_me)
                user.update_last_login()
                
                # Set user's preferred language
                response = redirect(request.args.get('next') or url_for('index_lang', lang=user.language or 'en'))
                response.set_cookie('lang', user.language, max_age=60*60*24*30)
                
                flash(translate('login_success', module='messages', lang=lang), 'success')
                return response
            else:
                # Password is incorrect
                flash(translate('login_failed', module='messages', lang=lang), 'danger')
        else:
            # User doesn't exist
            flash(translate('login_failed', module='messages', lang=lang), 'danger') # Need to fix all flash messages not translated
    
    return render_template('/routes/login.html', lang=lang)

# User logout route
@app.route('/logout')
@login_required
def logout():
    logout_user()
    lang = request.cookies.get('lang', 'en')
    flash(translate('logout_success', module='messages', lang=lang), 'info')
    lang = request.cookies.get('lang', 'en')
    return redirect(url_for('index_lang', lang=lang))

# User profile route
@app.route('/<lang>/profile')
@login_required
def profile(lang):
    # Validate language
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'  # Fallback to English if the language is invalid

    return render_template('/routes/profile.html')

# Update user profile
@app.route('/<lang>/profile/update', methods=['POST'])
@limiter.limit("10 per minute")
@login_required
def update_profile(lang):
    # Validate language
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'  # Fallback to English if the language is invalid
    
    if request.method == 'POST':
        email = request.form.get('email')
        language = request.form.get('language')
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        new_password_confirm = request.form.get('new_password_confirm')
        
        # Validate current password if provided
        if current_password:
            if not current_user.check_password(current_password):
                flash(translate('current_password_wrong', module='messages', lang=lang), 'danger')
                return redirect(url_for('profile', lang=lang))
            
            if new_password:
                if new_password != new_password_confirm:
                    flash(translate('passwords_not_match', module='messages', lang=lang), 'danger')
                    return redirect(url_for('profile', lang=lang))
                
                is_valid, password_error = validate_password(new_password, current_user.username)
                if not is_valid:
                    flash(password_error, 'danger')
                    return redirect(url_for('profile', lang=lang))
                
                current_user.password_hash = generate_password_hash(new_password)
        
        # Update email if changed
        if email and email != current_user.email:
            if User.query.filter_by(email=email).first():
                flash(translate('email_in_use', module='messages', lang=lang), 'danger')
                return redirect(url_for('profile', lang=lang))
            current_user.email = email
        
        # Update language preference
        if language and language in ['mkd', 'en', 'al']:
            current_user.language = language
            # Update cookie as well
            response = redirect(url_for('profile', lang=language))
            response.set_cookie('lang', language, max_age=60*60*24*30)
        
        db.session.commit()
        flash(translate('profile_updated', module='messages', lang=lang), 'success')
        
        # If language was changed, redirect with new cookie
        if language and language in ['mkd', 'en', 'al']:
            return response
    
    return redirect(url_for('profile', lang=current_user.language or 'en'))

@app.route('/admin/users')
@login_required
def admin_users():
    # Simple check to see if user has admin rights
    # In a real application, you would use a role-based system
    if current_user.role != 'admin':
        flash('You do not have permission to access this page.', 'danger')
        return redirect(url_for('index'))
    
    users = User.query.all()
    lang = request.cookies.get('lang', 'mkd')
    return render_template('/routes/admin_users.html', users=users)

@app.route('/admin/users/toggle/<int:user_id>', methods=['POST'])
@login_required
def toggle_user_status(user_id):
    # Simple admin check
    if current_user.role != 'admin':
        flash('You do not have permission to perform this action.', 'danger')
        return redirect(url_for('index'))
    
    user = User.query.get_or_404(user_id)
    
    # Don't allow deactivating your own account
    if user.id == current_user.id:
        flash('You cannot deactivate your own account.', 'danger')
        return redirect(url_for('admin_users'))
    
    # Toggle the user's active status
    user.is_active = not user.is_active
    db.session.commit()
    
    status = 'activated' if user.is_active else 'deactivated'
    flash(f'User {user.username} has been {status}.', 'success')
    return redirect(url_for('admin_users'))

@app.route('/admin/users/delete/<int:user_id>', methods=['POST'])
@login_required
def delete_user(user_id):
    if current_user.role != 'admin':
        flash('You do not have permission to perform this action.', 'danger')
        return redirect(url_for('index'))

    user = User.query.get_or_404(user_id)

    if user.id == current_user.id:
        flash('You cannot delete your own account.', 'danger')
        return redirect(url_for('admin_users'))
    
    db.session.delete(user)
    db.session.commit()

    flash(f'User {user.username} has been deleted.', 'success')
    return redirect(url_for('admin_users'))

# Initialize DB
with app.app_context():
    db.create_all()

# Request Password Reset
@app.route('/<lang>/reset_password_request', methods=['GET'])
def reset_password_request(lang):
    # Validate language
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'
    return render_template('/routes/reset_password_request.html')

@app.route('/<lang>/reset_password_request', methods=['POST'])
def reset_password_request_post(lang):
    email = request.form.get('email')
    user = User.query.filter_by(email=email).first()

    if user:
        send_reset_email(email, lang)
    
    flash(translate('password_reset_sent', module='messages', lang=lang), 'info')

    return redirect(url_for('login', lang=lang))  # Redirect to localized login page


# Reset Password
@app.route('/<lang>/reset_password/<token>', methods=['GET', 'POST'])
@limiter.limit("10 per minute")
def reset_password(lang, token):
    email = verify_token(token)
    if not email:
        return 'Invalid or expired token', 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return 'User not found', 404

    if request.method == 'POST':
        new_password = request.form['password']
        confirm_password = request.form['confirm_password']
        
        # Ensure password meets security standards
        if len(new_password) < 6:
            flash(translate('password_length', module='messages', lang=lang), 'danger')
            return render_template('/routes/reset_password.html', lang=lang, token=token)

        if new_password != confirm_password:
            flash(translate('passwords_not_match', module='messages', lang=lang), 'danger')
            return render_template('/routes/reset_password.html', lang=lang, token=token)

        # Ensure password meets security standards
        is_valid, password_error = validate_password(new_password, user.username)
        if not is_valid:
            flash(password_error, 'danger')
            return render_template('/routes/reset_password.html', lang=lang, token=token)

        user.set_password(new_password)  # Hash password before saving
        db.session.commit()

        flash(translate('password_reset_success', module='messages', lang=lang), 'success')
        return redirect(url_for('login', lang=lang))  # Redirect to localized login

    return render_template('/routes/reset_password.html', lang=lang, token=token)

@app.route('/')
def index():
    lang = request.cookies.get('lang', 'en')
    return redirect(url_for('index_lang', lang=lang))

@app.route('/<lang>/')
@app.route('/<lang>/page/<int:page_number>')
def index_lang(lang, page_number=1):
    # Validate language
    if lang not in ['mkd', 'al', 'en']:
        app.logger.warning(f"Invalid language code: {lang}. Defaulting to English.")
        lang = 'en'

    # Load translations for the index module
    try:
        translations = translation_manager.load_translations('index', lang)
        app.logger.info(f"Loaded {len(translations)} translation keys for {lang}")
    except Exception as e:
        app.logger.error(f"Translation loading error: {e}")
        translations = {}

    # Fetch ads for the specified page
    per_page = 48  # Number of ads per page
    ads_pagination = Ad.query.paginate(page=page_number, per_page=per_page, error_out=False)
    ads = ads_pagination.items

    # For locations
    locations = [loc[0] for loc in db.session.query(Ad.location).distinct() if loc[0]]

    # Render the template with ads, pagination, and translations
    return render_template('/routes/index.html', 
                           ads=ads,
                           locations=locations, 
                           current_page=page_number, 
                           pagination=ads_pagination,
                           translations=translations,
                           current_lang=lang)

@app.route('/set_language/<lang>/')
def set_language(lang):
    # Add detailed logging
    app.logger.info(f"Language switch attempt: {lang}")
    app.logger.info(f"Referrer: {request.referrer}")
    
    # Validate the language code
    if lang not in ['mkd', 'en', 'al']:
        app.logger.warning(f"Invalid language code: {lang}. Defaulting to English.")
        lang = 'en'
    
    # Check if the next parameter exists
    next_page = request.args.get('next', None)
    
    if not next_page:
        # Get the referrer (current page) if no next param
        referrer = request.referrer
        
        if not referrer:
            app.logger.info(f"No referrer, redirecting to index with language: {lang}")
            response = redirect(url_for('index_lang', lang=lang))
        else:
            # Parse the URL
            from urllib.parse import urlparse
            parsed_url = urlparse(referrer)
            path_parts = parsed_url.path.strip('/').split('/')
            
            app.logger.info(f"Path parts: {path_parts}")
            
            # Check if the path starts with a language code
            if path_parts and path_parts[0] in ['mkd', 'en', 'al']:
                # Replace the language code
                path_parts[0] = lang
                
                # Reconstruct the URL
                new_path = '/' + '/'.join(path_parts)
                
                # If there was a query string, preserve it
                if parsed_url.query:
                    new_path += '?' + parsed_url.query
                
                app.logger.info(f"Redirecting to: {new_path}")
                response = redirect(new_path)
            else:
                # No language in URL path, redirect to index
                app.logger.info(f"No language in path, redirecting to index with language: {lang}")
                response = redirect(url_for('index_lang', lang=lang))
    else:
        # If 'next' exists, just redirect to the next page with the language
        app.logger.info(f"Redirecting to next page: {next_page}")
        response = redirect(next_page)
    
    # Set language cookie
    response.set_cookie('lang', lang, max_age=60*60*24*30, path='/')
    app.logger.info(f"Language cookie set to: {lang}")
    
    return response


@app.route('/fetch_ads', methods=['POST'])
def fetch_ads():
    try:
        validate_csrf(request.headers.get('X-CSRFToken'))
    except:
        abort(400, description="CSRF token is missing or invalid")

    data = request.json
    category = data.get('category')
    sort_type = data.get('sort')

    query = Ad.query

    if category:
        category = category.strip()
        query = query.filter_by(category=category)
        

    # Sorting logic
    if sort_type == "Најнови":
        query = query.order_by(Ad.date.desc())
    elif sort_type == "Најстари":
        query = query.order_by(Ad.date.asc())
    elif sort_type == "Најефтини":
        query = query.order_by(Ad.price.asc())
    elif sort_type == "Најскапи":
        query = query.order_by(Ad.price.desc())

    ads = query.all()

    ads_list = [ad.to_dict() for ad in ads]

    return jsonify(ads_list)

@app.route('/fetch_categories', methods=['POST'])
def fetch_categories():
    # Get all unique categories from your database
    categories = db.session.query(Ad.category).distinct().all()
    # Convert from tuple format to list
    category_list = [cat[0] for cat in categories if cat[0]]
    return jsonify(category_list)

""" @app.route('/proxy_image')
def proxy_image():
    image_url = request.args.get("url")
    if not image_url:
        return "No URL provided", 400

    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        image_response = requests.get(image_url, timeout=10, headers=headers, stream=True)
        image_response.raise_for_status()

        # Ensure CORS headers are included
        response = Response(image_response.content, content_type=image_response.headers["Content-Type"])
        response.headers['Access-Control-Allow-Origin'] = 'https://reklama5.mk'  # Allow all origins to access
        return response
    except requests.exceptions.RequestException as e:
        print("Proxy Error:", e)
        return "Error fetching image", 404 """
    # For future use maybe no need now

@app.route('/<lang>/about')
def about(lang):
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'

    return render_template('/routes/about.html')


@app.route('/<lang>/contact')
def contact(lang):
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'

    return render_template('/routes/contact.html')

if __name__ == '__main__':
    app.debug = True
    app.run(debug=True)
