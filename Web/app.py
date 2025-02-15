from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date

app = Flask(__name__, static_folder='static')

# Database configuration (same as in main.py)
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://milos55:smil55@localhost/reklami'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

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
    currency = db.Column(db.String(10), nullable=True)
    store = db.Column(db.String(100), nullable=True)

    def __init__(self, title, description, link, image_url, category, phone, date, price, currency, store):
        self.title = title
        self.description = description
        self.link = url
        self.image_url = image_url
        self.category = category
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
            'addate': self.date.strftime("%d.%m.%Y") if self.date else "N/A",
            'addesc': self.description,
            'adstore': self.store
        }


@app.route('/')
def index():
    lang = request.cookies.get('lang', 'mkd')
    return redirect(url_for('index_lang', lang=lang))

@app.route('/<lang>/')
@app.route('/<lang>/page/<int:page_number>')
def index_lang(lang, page_number=1):
    if lang not in ['mkd', 'al', 'en']:
        lang = 'mkd'  # Fallback to Macedonian if the language is invalid

    # Fetch ads for the specified page
    per_page = 48  # Number of ads per page
    ads_pagination = Ad.query.paginate(page=page_number, per_page=per_page, error_out=False)
    ads = ads_pagination.items

    # Render the template with ads and pagination data
    return render_template(f'{lang}/index.html', ads=ads, current_page=page_number, pagination=ads_pagination)

@app.route('/set_language/<lang>/')
def set_language(lang):
    if lang not in ['mkd', 'en', 'al']:
        lang = 'mkd'

    response = redirect(url_for('index_lang', lang=lang))
    response.set_cookie('lang', lang, max_age=60*60*24*30)  # Store language in a cookie for 30 days
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
        lang = 'mkd'

    return render_template(f'{lang}/about.html')


@app.route('/<lang>/contact')
def contact(lang):
    if lang not in ['mkd', 'en', 'al']:
        lang = 'mkd'

    return render_template(f'{lang}/contact.html')

if __name__ == '__main__':
    app.run(debug=True)
