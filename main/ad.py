class Ad:
    def __init__(self, title, description, link, image_url, category, phone, date, price, currency, location, store):
        self.title = title
        self.description = description
        self.link = link
        self.image_url = image_url
        self.category = category
        self.phone = phone if isinstance(phone, list) else [phone]  # Ensure phone is always a list
        self.date = date
        self.price = price
        self.currency = currency
        self.location = location
        self.store = store

    def to_tuple(self):
        # Convert the list of phone numbers to a string (comma separated) for storage
        phone_str = ', '.join(self.phone)
        return (
        self.title, self.description, self.link, self.image_url, self.category, phone_str, self.date, self.price,
        self.currency, self.location, self.store)
