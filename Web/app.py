from flask import Flask, render_template, request, jsonify, redirect
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
            'addate': self.date.strftime("%d.%m.%Y") if self.date else "N/A",
            'addesc': self.description,
            'adstore': self.store
        }


@app.route('/')
def index():
    # Fetch unique categories from the database
    categories = db.session.query(Ad.category).distinct().all()
    categories = [category[0] for category in categories if category[0]]  # Filter out None values

    return render_template('index.html', categories=categories)


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


# Redundant? Boro advise
@app.route('/search_ads', methods=['POST'])
def search_ads():
    data = request.json
    ads = data.get('ads')
    keywords = data.get('keywords')
    search_title = data.get('search_title', False)
    search_desc = data.get('search_desc', False)

    results = search_ads_and_update_progress(ads, keywords, search_title, search_desc)
    return jsonify(results)

# Redundant? Boro advise
def search_ads_and_update_progress(ads, keywords, search_title=True, search_desc=True):
    results = []
    for ad in ads:
        match_found = False
        if search_title:
            for keyword in keywords:
                if keyword.lower() in ad.get("adtitle", "").lower():
                    match_found = True
                    break
        if not match_found and search_desc:
            for keyword in keywords:
                if keyword.lower() in ad.get("addesc", "").lower():
                    match_found = True
                    break
        if match_found:
            results.append(ad)
    return results


@app.route('/about')
def about():
    return render_template('about.html')


@app.route('/contact')
def contact():
    return render_template('contact.html')

@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static','images','logo', 'favicon.ico', mimetype='image/vnd.microsoft.icon')


if __name__ == '__main__':
    app.run(debug=True)
