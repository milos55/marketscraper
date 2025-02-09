class Ad:
    def __init__(self, title, description, url, image_url, category, phone, date, price, currency,store):
        self.title = title
        self.description = description
        self.url = url
        self.image_url = image_url
        self.category = category
        self.phone = phone
        self.date = date
        self.price = price
        self.currency = currency
        self.store = store
        
    def to_tuple(self):
        return (self.title, self.description, self.url, self.image_url, self.category, self.phone, self.date, self.price, self.currency, self.store)