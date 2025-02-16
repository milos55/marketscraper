
import requests
from bs4 import BeautifulSoup
import re

# Define site-specific scraping functions

url = "https://www.pazar3.mk/oglasi/"
response = requests.get(url)
soup = BeautifulSoup(response.text, "html.parser")



baseurl = "https://www.pazar3.mk"
ads = []
phone = []

# For outide of ads on main page
for ad in soup.find_all('div', class_='new row row-listing'):
    title = ad.find('a', class_='Link_vis').text.strip()
    price_text = ad.find('p', class_='list-price').text.strip().replace('\r\n', '').replace(' ', '')
    category = ad.find('a', class_='link-html5 nobold').text.strip()
    rk5adlink = baseurl + ad.find('a', class_='Link_vis')['href']
    
    store = "pazar3.mk"
    
    # for price currency split
    pos = next((i for i, c in enumerate(price_text) if not (c.isdigit() or c == '.')), len(price_text))
    price_str = price_text[:pos].replace('.', '')
    price = int(price_str) if price_str else 0
    currency = price_text[pos:]

    # Image
    image_span = ad.find('div', class_='img-shimmer-container')
    try:
        image_url = image_span.find('img', class_='ProductionImg')['data-src']
    except AttributeError:
        image_url = 'N/A'
    
    # For inside of ads
    ad_response = requests.get(rk5adlink)
    ad_soup = BeautifulSoup(ad_response.text, "html.parser")

    # Description
    description_tag=ad_soup.find('div', class_='description-area')
    if description_tag:
        span_tag = description_tag.find('span')
        description = span_tag.get_text(separator=' ', strip=True) if span_tag else 'N/A'
    else:
        description = 'N/A'

    # Phone
    try:
        phone = ad_soup.find('a', class_='btn-icon-left new-btn btn-default btn-block btn-lg ci-margin-b-5 ci-text-center').text.strip() if phone else 'N/A'
    except AttributeError:
        phone = 'N/A'

    ads.append([title, price_text, category, rk5adlink, description, phone, date, image_url, store])

    
for ad in ads:
    print(ad[0])  # ad[0] is the title
    print(ad[1])  # ad[1] is the price
    print(ad[2])  # ad[2] is the category
    print(ad[3])  # ad[3] is the link
    print(ad[4])  # ad[4] is the description
    print(ad[5])  # ad[5] is the phone
    print(ad[6])  # ad[6] is the date
    print(ad[7])  # ad[7] is the image_url
    print(ad[8])  # ad[8] is the store
    print("------------------ \n")




