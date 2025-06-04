from datetime import datetime, date
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from app import db  # Replace 'your_app' with your actual app module name

class Ad(db.Model):
    __tablename__ = "reklami" # test 1
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    link = db.Column(db.String(255), nullable=False)
    image_url = db.Column(db.String(255), nullable=True)
    category = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(100), nullable=True)
    date = db.Column(db.Date, default=date.today)  # This line needs the 'date' import
    price = db.Column(db.Float, nullable=True)
    location = db.Column(db.String(100), nullable=True)
    currency = db.Column(db.String(10), nullable=True)
    store = db.Column(db.String(100), nullable=True)

    def __init__(self, title, description, link, image_url, category, phone, date, price, currency, store, location=None):
        self.title = title
        self.description = description
        self.link = link  # Fixed: changed url to link
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
            'adcategory': self.category,  # Need for filter by category check in prod
            'adimage': self.image_url,  # Need for AD images
            'adphone': str(self.phone) if self.phone is not None else "N/A",
            'adlocation': self.location,
            'addate': self.date.strftime("%d.%m.%Y") if self.date else "N/A",
            'addesc': self.description,
            'adstore': self.store
        }

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
    role = db.Column(db.String(20), default='user')
    email_confirmed = db.Column(db.Boolean, default=False)
    
    def __init__(self, username, email, password, language='mkd', role='user'):
        self.username = username
        self.email = email
        self.password_hash = generate_password_hash(password)
        self.language = language
        self.role = role
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def update_last_login(self):
        self.last_login = datetime.utcnow()
        db.session.commit()

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
