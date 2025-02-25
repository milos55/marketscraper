from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, make_response
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
import os

app = Flask(__name__, static_folder='static')

# Secret key for session management and CSRF protection
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'mytestingsecretkey123')

# Database configuration (same as in main.py)
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://milos55:smil55@localhost/reklami'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_NAME'] = 'smilko'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True for HTTPS # smeni u prod

db = SQLAlchemy(app)

# Define the Ad class here directly, as per your request
class Ad(db.Model):
    __tablename__ = "reklami" #test 1
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    link = db.Column(db.String(255), nullable=False)
    image_url = db.Column(db.String(255), nullable=True)
    category = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(100), nullable=True)
    date = db.Column(db.Date, default=date.today)
    price = db.Column(db.Float, nullable=True)
    location = db.Column(db.String(100), nullable=True)
    currency = db.Column(db.String(10), nullable=True)
    store = db.Column(db.String(100), nullable=True)

    def __init__(self, title, description, link, image_url, category, phone, date, price, currency, store):
        self.title = title
        self.description = description
        self.link = url
        self.image_url = image_url
        self.category = category
        self.location = location
        self.phone = phone
        self.date = date
        self.price = price
        self.currency = currency
        self.store = store

    def to_dict(self):
        return {
            'adlink': self.link,
            'adtitle': self.title,
            'adprice': self.price,
            'adcurrency': self.currency,
            'adcategory': self.category, # Need for filter by category check in prod
            'adimage': self.image_url, # Need for AD images
            'adphone': str(self.phone) if self.phone is not None else "N/A",
            'adlocation': self.location,
            'addate': self.date.strftime("%d.%m.%Y") if self.date else "N/A",
            'addesc': self.description,
            'adstore': self.store
        }

# User Model
class User(db.Model, UserMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    registered_on = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    language = db.Column(db.String(3), default='mkd')
    is_active = db.Column(db.Boolean, default=True)
    
    def __init__(self, username, email, password, language='mkd'):
        self.username = username
        self.email = email
        self.password_hash = generate_password_hash(password)
        self.language = language
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def update_last_login(self):
        self.last_login = datetime.utcnow()
        db.session.commit()

# Initialize LoginManager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Routes
@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    lang = request.cookies.get('lang', 'en')
    
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
        
        if error is None:
            # Create new user
            new_user = User(username=username, email=email, password=password, language=lang)
            db.session.add(new_user)
            db.session.commit()
            
            flash('Registration successful! Please log in.', 'success')
            return redirect(url_for('login'))
        
        flash(error, 'danger')
    
    return render_template(f'{lang}/register.html')

# User login route
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    lang = request.cookies.get('lang', 'en')
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember_me = 'remember_me' in request.form
        
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            login_user(user, remember=remember_me)
            user.update_last_login()
            
            # Set user's preferred language
            response = redirect(request.args.get('next') or url_for('index'))
            response.set_cookie('lang', user.language, max_age=60*60*24*30)
            
            flash('Login successful!', 'success')
            return response
        
        flash('Invalid username or password', 'danger')
    
    return render_template(f'{lang}/login.html')

# User logout route
@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('index'))

# User profile route
@app.route('/profile')
@login_required
def profile():
    lang = request.cookies.get('lang', 'en')
    return render_template(f'{lang}/profile.html')

# Update user profile
@app.route('/profile/update', methods=['POST'])
@login_required
def update_profile():
    lang = request.cookies.get('lang', 'en')
    
    if request.method == 'POST':
        email = request.form.get('email')
        language = request.form.get('language')
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        
        # Validate current password if provided
        if current_password:
            if not current_user.check_password(current_password):
                flash('Current password is incorrect.', 'danger')
                return redirect(url_for('profile'))
            
            if new_password:
                current_user.password_hash = generate_password_hash(new_password)
        
        # Update email if changed
        if email and email != current_user.email:
            if User.query.filter_by(email=email).first():
                flash('Email already in use.', 'danger')
                return redirect(url_for('profile'))
            current_user.email = email
        
        # Update language preference
        if language and language in ['mkd', 'en', 'al']:
            current_user.language = language
            # Update cookie as well
            response = redirect(url_for('profile'))
            response.set_cookie('lang', language, max_age=60*60*24*30)
        
        db.session.commit()
        flash('Profile updated successfully!', 'success')
        
        # If language was changed, redirect with new cookie
        if language and language in ['mkd', 'en', 'al']:
            return response
    
    return redirect(url_for('profile'))

@app.route('/admin/users')
@login_required
def admin_users():
    # Simple check to see if user has admin rights
    # In a real application, you would use a role-based system
    if current_user.username != 'admin':
        flash('You do not have permission to access this page.', 'danger')
        return redirect(url_for('index'))
    
    users = User.query.all()
    lang = request.cookies.get('lang', 'mkd')
    return render_template(f'{lang}/admin_users.html', users=users)

@app.route('/admin/users/toggle/<int:user_id>', methods=['POST'])
@login_required
def toggle_user_status(user_id):
    # Simple admin check
    if current_user.username != 'admin':
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

# Initialize DB
with app.app_context():
    db.create_all()

@app.route('/')
def index():
    lang = request.cookies.get('lang', 'en')
    return redirect(url_for('index_lang', lang=lang))

@app.route('/<lang>/')
@app.route('/<lang>/page/<int:page_number>')
def index_lang(lang, page_number=1):
    if lang not in ['mkd', 'al', 'en']:
        lang = 'en'  # Fallback to Macedonian if the language is invalid

    # Fetch ads for the specified page
    per_page = 48  # Number of ads per page
    ads_pagination = Ad.query.paginate(page=page_number, per_page=per_page, error_out=False)
    ads = ads_pagination.items

    # For locations
    locations = [loc[0] for loc in db.session.query(Ad.location).distinct() if loc[0]]

    # Render the template with ads and pagination data
    return render_template(f'{lang}/index.html', ads=ads,locations=locations, current_page=page_number, pagination=ads_pagination)

@app.route('/set_language/<lang>/')
def set_language(lang):
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'

    response = redirect(url_for('index_lang', lang=lang))
    response.set_cookie('lang', lang, max_age=60*60*24*30) # Store language in a cookie for 30 days
    return response

@app.route('/fetch_ads', methods=['POST'])
def fetch_ads():
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

@app.route('/<lang>/about')
def about(lang):
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'

    return render_template(f'{lang}/about.html')


@app.route('/<lang>/contact')
def contact(lang):
    if lang not in ['mkd', 'en', 'al']:
        lang = 'en'

    return render_template(f'{lang}/contact.html')

@app.route('/clear_cookies')
def clear_cookies():
    plain = "milos55"
    hashed = generate_password_hash(plain)
    response = make_response(hashed)
    return response


if __name__ == '__main__':
    app.debug = True
    app.run(debug=True)
