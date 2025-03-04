from dotenv import load_dotenv
import os
from datetime import timedelta

# Load environment variables from .env
load_dotenv()

class Config:
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.getenv('MAIL_PORT', 587))  # Convert to int
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'True') == 'True'  # Convert to boolean
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.getenv('MAIL_DEFAULT_SENDER')

     # Secret key for session management and CSRF protection
    SECRET_KEY = os.getenv('SECRET_KEY', 'mytestingsecretkey123')  # Default for testing
    
    # Database configuration
    SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI', 'postgresql://milos55:smil55@localhost/reklami')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Session configurations
    SESSION_COOKIE_NAME = os.getenv('SESSION_COOKIE_NAME', 'smilko')
    SESSION_COOKIE_HTTPONLY = os.getenv('SESSION_COOKIE_HTTPONLY', 'True') == 'True'
    SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'False') == 'True'  # For production with HTTPS

    # Duration settings
    PERMANENT_SESSION_LIFETIME = timedelta(minutes=int(os.getenv('PERMANENT_SESSION_LIFETIME', 30)))
    REMEMBER_COOKIE_DURATION = timedelta(minutes=int(os.getenv('REMEMBER_COOKIE_DURATION', 30)))

    # Translation
    TRANSLATIONS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'translations', 'flask_msg.yaml')
