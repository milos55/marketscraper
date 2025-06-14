# Created by Milos Smiljkovikj
# Github: https://github.com/milos55
# Date: 08/02/2025

import aiohttp
import asyncio
import asyncpg
from bs4 import BeautifulSoup
from datetime import datetime
from ad import Ad
import time
import re
# Config import from Web
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../Web')))
from config import Config




#CONFIG

DB_HOST = Config.DB_HOST
DB_USER = Config.DB_USER
DB_PASSWORD = Config.DB_PASSWORD
DB_NAME = Config.DB_NAME


DB_CONFIG = {
    "user": Config.DB_USER,
    "password": Config.DB_PASSWORD,
    "database": Config.DB_NAME,
    "host": Config.DB_HOST,
    "port": 5432,
}

# === COLOR CONSTANTS FOR ERROR PRINTS ===
RED = '\033[31m'
RESET = '\033[0m'
YELLOW = '\033[33m'
GREEN = '\033[32m'


#Made config parameters in seperate block for readability and scalability

START_PAGE = 1
END_PAGE = 10
BATCH_SIZE = 5 #dirty hack, to not create a secondary variable
URL = "https://www.reklama5.mk/Search?city=&cat=0&q="
ASYNC_TIMEOUT = 2

ADMIN_NUMBERS = [] # # List of admin numbers to be used for notifications or checks, currently empty, haven't checked



#MAIN CODE

async def fetch_page(session, URL, retries=3, delay=2):
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
    }

    for attempt in range(retries):
        try:
            async with session.get(URL, headers=headers) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    print(f"Attempt {attempt + 1}: Failed to fetch {URL} (status {response.status})")

        except Exception as e:
            print(f"Attempt {attempt + 1}: Error fetching {URL} - {e}")

        if attempt < retries - 1:
            await asyncio.sleep(delay)  # Wait before retrying

    print(f"Giving up on {URL} after {retries} attempts.")
    return None

def convert_today_date(date_str):
    if date_str.startswith("Денес"):
        today = datetime.now().strftime("%d.%m.%Y")
        return date_str.replace("Денес", today)
    return date_str

def normalize_phone_number(phone): #FIXME for retards that have phones like this 078 427 757 078 404 406, aboslute idiots
    phone = phone.strip().replace(' ', '') # TODO add in next update to read description for numbers with regex

    # Collapse multiple leading pluses to one
    while phone.startswith('++'):
        phone = phone[1:]

    # Helper for Macedonian numbers
    def macedonian_local_format(ndigits):
        ndigits = re.sub(r'\D', '', ndigits)
        # Add leading zero if number is 8 digits (e.g., '78326371' -> '078326371')
        if len(ndigits) == 8:
            ndigits = '0' + ndigits
        if len(ndigits) == 9:
            return f"{ndigits[:3]} {ndigits[3:6]} {ndigits[6:]}"
        return None

    # +389 or 00389
    if phone.startswith('+389'):
        return macedonian_local_format(phone[4:])
    if phone.startswith('00389'):
        return macedonian_local_format(phone[5:])

    # Foreign number: starts with + but not +389
    if phone.startswith('+'):
        return phone

    # Local number (possibly with leading zero or just 8 digits)
    return macedonian_local_format(phone)

def format_phone_numbers(phone_numbers):
    """Format and filter phone numbers, removing admin numbers"""
    formatted_numbers = set()
    for num in phone_numbers:
        norm = normalize_phone_number(num)
        if norm and norm not in ADMIN_NUMBERS:
            formatted_numbers.add(norm)
    return list(formatted_numbers)


async def fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE):
    baseurl = "https://www.reklama5.mk"
    ads = []

    async with aiohttp.ClientSession() as session:
        for batch_start in range(START_PAGE, END_PAGE + 1, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE - 1, END_PAGE)
            print(f"Scraping pages {batch_start} to {batch_end}")

            tasks = [fetch_page(session, f"{URL}&page={page}") for page in range(batch_start, batch_end + 1)]
            pages_responses = await asyncio.gather(*tasks)

            for page_num, page_content in zip(range(batch_start, batch_end + 1), pages_responses):
                if page_content is None:
                    continue

                soup = BeautifulSoup(page_content, "html.parser")
                helper = soup.find_all('div', class_='ad-desc-div col-lg-6 text-left')
                image_helper = soup.find_all('div', class_='ad-image-div col-lg-4 text-left')

                if not helper or not image_helper:
                    print(f"No ads found on page {page_num}.")
                    continue

                for ad, image_ad in zip(helper, image_helper):
                    try:
                        title = ad.find('a', class_='SearchAdTitle').text.strip()
                        price_text = ad.find('span', class_='search-ad-price').text.strip().replace('\r\n', '').replace(' ', '')
                        category = ad.find('a', class_='text-secondary').find('small').text if ad.find('a', class_='text-secondary').find('small') else None
                        rk5adlink = baseurl + ad.find('a', class_='SearchAdTitle')['href']

                        image_url = image_ad.find("div", class_="ad-image")["style"].split("url(")[-1].split(")")[0].strip("'\"")
                        image_url = "https:" + image_url if image_url.startswith("//") else image_url

                        location_span = ad.find('span', class_='city-span')
                        if location_span:
                            location_text = location_span.text.strip()  # Extract text from the span
                            location_text = location_text.replace('•', '').strip()  # Remove unwanted characters
                        else:
                            location_text = None

                        # FIXED MISO 10.02.25 proveri za efikasnost
                        pos = next((i for i, c in enumerate(price_text) if not (c.isdigit() or c == '.')), len(price_text))
                        price_str = price_text[:pos].replace('.', '')
                        price = int(price_str) if price_str else 0
                        currency = price_text[pos:]

                        store = "reklama5"  # Script only works for reklama5, other scripts will be needed for other sites (different web structure)

                        #Updated to work with class !! IMPLEMENTRAJ MESTO VAR STORE DA VIKA SAMO REKLAMA5 VIDI ROLLBACK main.py ili nemoze !!
                        ad = Ad(title, None, rk5adlink, image_url, category, None, None, price, currency,location_text , store)

                        #Ti ga 2 put proverues dali postoi link (preko rk5adlink i ad_response), sg ga proverue 1 put
                        #Code reformated to work with class (more readible and functional)
                        ad_response = await fetch_page(session, rk5adlink)
                        if ad_response:
                            ad_soup = BeautifulSoup(ad_response, "html.parser")
                            ad.description = ad_soup.find('p', class_='mt-3').text.strip() if ad_soup.find('p', class_='mt-3') else None

                            # Get raw phone number(s)
                            raw_phone = ad_soup.find('h6').get_text(strip=True) if ad_soup.find('h6') else None
                            
                            # Format and filter phone numbers
                            if raw_phone:
                                # Split multiple phone numbers if they exist (assuming comma or semicolon separated)
                                phone_numbers = [p.strip() for p in re.split(r'[,;]', raw_phone)]
                                ad.phone = format_phone_numbers(phone_numbers)
                            else:
                                ad.phone = []
                                
                            date_element = ad_soup.find_all('div', class_='col-4 align-self-center')
                            ad.date = convert_today_date(date_element[2].find('span').text.strip()) if len(date_element) > 2 else None

                        ads.append(ad)


                    #Check page on which an error occured
                    except Exception as e:
                        print(f"Error processing ad on page {page_num}: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await save_to_db(ads)
            #Test lowest time with no error
            await asyncio.sleep(ASYNC_TIMEOUT)

    return ads

#Updated to work with class ad
async def save_to_db(ads):
    conn = await asyncpg.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

    for ad in ads:
        try:
            if isinstance(ad.date, str) and ad.date != "N/A":
                ad.date = datetime.strptime(ad.date, "%d.%m.%Y %H:%M")
            elif ad.date == "N/A":
                ad.date = None
            # If phone is supposed to be an array:
            if isinstance(ad.phone, str):
                ad.phone = [ad.phone]

            # If phone can be None:
            if ad.phone is None:
                ad.phone = ["NONE FOUND"]

            if ad.price == 0:
                ad.price = "По Договор"
            else:
                ad.price = str(ad.price)

            required_fields = [ad.title, ad.description, ad.link, ad.image_url, ad.category, ad.phone, ad.date, ad.price, ad.currency, ad.store]
            if any(field is None for field in required_fields): # Protection against null values so it doesn't break code, most likely a deleted ad so not important
                print(f"Skipping ad {ad.link} with missing required fields.")
                continue

            await conn.execute(
                """
                INSERT INTO ads.ads (title, description, link, image_url, category, phone, date, price, currency, location, store)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (link) DO NOTHING;
                """,
                ad.title, ad.description, ad.link, ad.image_url, ad.category,
                ad.phone, ad.date, ad.price, ad.currency, ad.location, ad.store
            )
            print(f"{GREEN}Ad '{ad.title}' inserted into the database.{RESET}")
        except Exception as e:
            print(f"{RED}Error inserting ad: {e}{RESET}")

    await conn.close()

            
async def main():
    start_time = time.time()

    ads = await fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE)
    print(f"Scraped {len(ads)} ads.")
    await save_to_db(ads)

    end_time = time.time()
    total_time = end_time - start_time
    print(f"Total time: {total_time:.2f} seconds")


#REMOVED PARAMS IN MAIN BECAUSE THEY ARE GLOBAL
if __name__ == "__main__":
    asyncio.run(main())
