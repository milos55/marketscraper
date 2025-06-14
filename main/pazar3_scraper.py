from datetime import datetime
import aiohttp
import asyncio
from bs4 import BeautifulSoup
import re
import time
import psycopg2
from ad import Ad

# === COLOR CONSTANTS FOR ERROR PRINTS ===
RED = '\033[31m'
RESET = '\033[0m'
YELLOW = '\033[33m'
GREEN = '\033[32m'

# === CONFIGURATION ===
START_PAGE = 1
END_PAGE = 3
BATCH_SIZE = 3
URL = "https://www.pazar3.mk/oglasi/"
ASYNC_TIMEOUT = 2

DB_HOST = "localhost"
DB_USER = "postgres"
DB_PASSWORD = "1234"
DB_NAME = "ad_db"

ADMIN_NUMBERS = {"078 377 677", "047 551 166"}
BASE_URL = "https://www.pazar3.mk"

MONTHS_SHORT = {
    "јан": "January",
    "фев": "February",
    "мар": "March",
    "апр": "April",
    "мај": "May",
    "јун": "June",
    "јул": "July",
    "авг": "August",
    "септ": "September",
    "окт": "October",
    "ноем": "November",
    "дек": "December"
}


# === HELPER FUNCTIONS ===

def split_price_and_currency(price_text):
    """Extract numeric price and currency from a price string."""
    # CHANGE: Improved regex for robustness and clarity
    match = re.match(r"([\d\s]+)\s*(\w+)", price_text.replace(' ', ''))
    if match:
        price = match.group(1)
        currency = match.group(2)
        return int(price), currency
    return None, None


def normalize_phone_number(phone):
    # CHANGE: Improved normalization for more consistent results
    phone = re.sub(r'\D', '', phone)
    # Special case: Keep full numbers starting with 00389 or 00306
    if phone.startswith("00389") or phone.startswith("00306"):
        return phone
    # Remove country code
    if phone.startswith("389"):
        phone = phone[3:]
    elif phone.startswith("0"):
        phone = phone[1:]
    # Ensure 9 digits by adding leading 0 if needed
    if len(phone) == 8:
        phone = "0" + phone
    # Format into XXX XXX XXX
    if len(phone) == 9:
        return f"{phone[:3]} {phone[3:6]} {phone[6:]}"
    return None


def clean_description(description):
    # CHANGE: Simplified and clarified description cleaning
    cleaned_text = re.sub(r'\n\s*\n\s*\n+', '\n\n===CUT===\n\n', description)
    if '===CUT===' in cleaned_text:
        cleaned_text = cleaned_text.split('===CUT===')[0]
    return cleaned_text.strip()


def parse_date(date_text):
    try:
        # Try "dd.mm.yyyy" first
        if '.' in date_text and date_text.count('.') == 2:
            return datetime.strptime(date_text, "%d.%m.%Y").date()
        # Try "short_month day year"
        parts = date_text.split()
        if len(parts) == 3:
            month_short = parts[0].lower().rstrip('.')  # <-- Remove trailing period if present
            day = int(parts[1])
            year = int(parts[2])
            month_full = MONTHS_SHORT.get(month_short, None)
            if month_full:
                month_num = datetime.strptime(month_full, "%B").month
                return datetime(year, month_num, day).date()
        print(f"{RED}Unknown date format: {date_text}{RESET}")
        return None
    except Exception as e:
        print(f"{RED}Error parsing date '{date_text}': {e}{RESET}")
        return None


# === HELPER FUNCTIONS END ===

# === DATABASE FUNCTION ===

def insert_ad_to_db(ad_instance):
    try:
        with psycopg2.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                dbname=DB_NAME
        ) as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    INSERT INTO ads.ads (title, description, link, image_url, category, phone, date, price, currency, location, store)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    ad_instance.title,
                    ad_instance.description,
                    ad_instance.link,
                    ad_instance.image_url,
                    ad_instance.category,
                    ad_instance.phone,
                    ad_instance.date,
                    ad_instance.price,
                    ad_instance.currency,
                    ad_instance.location,
                    ad_instance.store
                ))
                print(f"{GREEN}Ad '{ad_instance.title}' inserted into the database.{RESET}")
    except psycopg2.Error as e:
        print(f"{RED}Error inserting ad: {e}{RESET}")  # RED ERROR


async def fetch_page(session, url, retries=3, delay=2):
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
    }
    for attempt in range(retries):
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    return await response.text()
                print(
                    f"{RED}Attempt {attempt + 1}: Failed to fetch {url} (status {response.status}){RESET}")  # RED ERROR
        except Exception as e:
            print(f"{RED}Attempt {attempt + 1}: Error fetching {url} - {e}{RESET}")  # RED ERROR
        if attempt < retries - 1:
            await asyncio.sleep(delay)
    print(f"{RED}Giving up on {url} after {retries} attempts.{RESET}")  # RED ERROR
    return None


async def fetch_ads(url, start_page, end_page, batch_size):
    async with aiohttp.ClientSession() as session:
        for batch_start in range(start_page, end_page + 1, batch_size):
            batch_end = min(batch_start + batch_size - 1, end_page)
            print(f"Scraping pages {batch_start} to {batch_end}")

            tasks = [fetch_page(session, f"{url}&Page={page}") for page in range(batch_start, batch_end + 1)]
            pages_responses = await asyncio.gather(*tasks)

            for page_num, page_content in zip(range(batch_start, batch_end + 1), pages_responses):
                if not page_content:
                    continue

                soup = BeautifulSoup(page_content, "html.parser")
                ad_list = soup.find_all('a', class_='Link_vis')

                if not ad_list:
                    print(f"{RED}No ads found on page {page_num}.{RESET}")  # RED ERROR
                    continue

                # CHANGE: Optionally batch-fetch ad details for more speed (not implemented for simplicity)
                for ad in ad_list:
                    try:
                        # === SKIP PROMOTED ADS ON LISTING PAGE ===
                        ad_container = ad.find_parent('div', class_='goodssearch-item-content')
                        if ad_container and ad_container.select_one(
                                "div.right-side > div > img[src*='toprated-ad-icon.png']"):
                            print(f"{YELLOW}Skipping promoted ad on page {page_num}{RESET}")
                            continue
                        title = ad.text.strip()
                        link = BASE_URL + ad['href']

                        ad_page_content = await fetch_page(session, link)
                        if not ad_page_content:
                            continue
                        ad_soup = BeautifulSoup(ad_page_content, "html.parser")

                        # Location
                        location = None
                        for tag in ad_soup.find_all('a', class_='tag-item'):
                            span_tag = tag.find('span')
                            bdi_tag = tag.find('bdi')
                            if span_tag and "Локација:" in span_tag.text and bdi_tag:
                                location = bdi_tag.text.strip()
                                break

                        # Image
                        image_url = None
                        image_tag = ad_soup.find('img', class_='custom-photo-zoom')
                        if image_tag:
                            image_url = image_tag.get('data-src')

                        # Price
                        price_tag = ad.find_next('p', class_='list-price')
                        price_text = price_tag.text.strip() if price_tag else None
                        price, currency = split_price_and_currency(price_text) if price_text else (None, None)
                        if currency == "ЕУР":
                            currency = "€"
                        elif currency == "МКД":
                            currency = "МКД"
                        else:
                            price = "По Договор"
                            currency = ""

                        # Phone numbers
                        phone_numbers = set()
                        span_tags = ad_soup.select("div.seller-contacts a span:nth-child(2)")
                        for tag in span_tags:
                            phone_numbers.add(tag.text.strip())
                        bdi_tags = ad_soup.select("div.seller-contacts bdi")
                        for tag in bdi_tags:
                            phone_numbers.add(tag.text.strip())
                        formatted_numbers = {normalize_phone_number(num) for num in phone_numbers if
                                             normalize_phone_number(num) not in ADMIN_NUMBERS}

                        # Description
                        description = None
                        desc_tag = ad_soup.find('div', class_='description-area')
                        if desc_tag:
                            description = clean_description(desc_tag.text.strip())

                        # Date
                        date_text = None
                        date_tag = ad_soup.find('bdi', class_='published-date')
                        if date_tag:
                            date_text = date_tag.text.strip()
                        formatted_date = parse_date(date_text) if date_text else None

                        if not location:
                            print(f"{RED}Skipping ad (missing location): {link}{RESET}")  # Location error
                            continue
                        if not formatted_numbers:
                            print(f"{RED}Skipping ad (missing phone numbers): {link}{RESET}")  # Phone error
                            continue
                        if not description:
                            print(f"{RED}Skipping ad (missing description): {link}{RESET}")  # Description error
                            continue

                        ad_instance = Ad(
                            title=title,
                            description=description,
                            link=link,
                            image_url=image_url,
                            category=None,
                            phone=list(formatted_numbers),
                            date=formatted_date,
                            price=price,
                            currency=currency,
                            location=location,
                            store="pazar3"
                        )

                        print("=" * 80)
                        print(ad_instance.to_tuple())
                        print("=" * 30)

                        # CHANGE: Optionally insert to DB
                        insert_ad_to_db(ad_instance)

                    except Exception as e:
                        print(f"{RED}Error processing ad on page {page_num}: {e}{RESET}")  # RED ERRORC

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await asyncio.sleep(ASYNC_TIMEOUT)


async def main():
    start_time = time.time()
    await fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE)
    total_time = time.time() - start_time
    print(f"Total time: {total_time:.2f} seconds")


if __name__ == "__main__":
    asyncio.run(main())
