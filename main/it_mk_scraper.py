from datetime import datetime
import asyncio
from bs4 import BeautifulSoup
import time
import re
from ad import Ad
from playwright.async_api import async_playwright
import psycopg2

# CONFIG
START_PAGE = 1
END_PAGE = 1
BATCH_SIZE = 1
BASE_URL = "https://forum.it.mk/oglasnik/"
ASYNC_TIMEOUT = 2

async def fetch_page(page, url):
    try:
        await page.goto(url, timeout=60000)
        #await page.goto("https://forum.it.mk/oglasnik/?page=1")
        await page.wait_for_selector(".structItem.structItem--listing", state="visible")

        return await page.content()
    except Exception as e:
        print(f"Error loading {url}: {e}")
        return None

async def fetch_ads(BASE_URL, START_PAGE, END_PAGE, BATCH_SIZE):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        for batch_start in range(START_PAGE, END_PAGE + 1, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE - 1, END_PAGE)
            print(f"Scraping pages {batch_start} to {batch_end}")

            for page_num in range(batch_start, batch_end + 1):
                url = f"{BASE_URL}?page={page_num}"
                page_content = await fetch_page(page, url)

                if page_content is None:
                    continue

                soup = BeautifulSoup(page_content, "html.parser")
                ad_wrappers = soup.find_all('div', class_='structItem--listing')

                if not ad_wrappers:
                    print(f"No ads found on page {page_num}.")
                    continue

                for wrapper in ad_wrappers:
                    try:
                        title_tag = wrapper.find('div', class_='structItem-title').find('a')
                        print(f"Title tag found: {title_tag}")
                        if not title_tag:
                            continue

                        link = title_tag['href']
                        full_link = link if link.startswith("http") else BASE_URL.rstrip("/") + link.split("/oglasnik")[1]
                        print(f"Processing ad: {full_link} on page {page_num}...")
                        title = title_tag.text.strip()
                        print(f"Title: {title}")

                        


                        # Use a fresh page for detail navigation to avoid interruption
                        detail_page = await context.new_page()
                        await detail_page.goto(full_link, timeout=60000)
                        await asyncio.sleep(1)  # Allow time for the page to load
                        await detail_page.wait_for_selector(".bbWrapper", timeout=40000)
                        ad_page_content = await detail_page.content()
                        await detail_page.close()

                        ad_soup = BeautifulSoup(ad_page_content, "html.parser")

                        """ category = None

                        category_handle = await ad.query_selector('ul.structItem-parts')
                        if category_handle:
                            li_elements = await category_handle.query_selector_all('li')
                            if len(li_elements) > 2:
                                category_text = await li_elements[2].inner_text()
                                category = category_text.strip()
                            else:
                                category = None
                        else:
                            category = None
                        print(f"Category: {category}") """


                        location = None
                        phone = None

                        image_url = None
                        image_tag = wrapper.find('img')
                        if image_tag:
                            image_url = image_tag.get('data-src') or image_tag.get('src')
                            print(f"Image URL: {image_url}")

                        price_text = wrapper.find('span', class_='ribbon ribbon--green')
                        # print(f"Price tag found: {price_text}")
                        price_text = price_text.text.strip() if price_text else None
                        price, currency = split_price_and_currency(price_text) if price_text else (None, None)
                        print(f"Price: {price}, Currency: {currency}")

                        if currency == "ЕУР":
                            currency = "€"
                        elif currency == "Ден.":
                            currency = "МКД"
                        else:
                            price = "По Договор"
                            currency = ""

                        description = None
                        desc_tag = ad_soup.find('div', class_='bbWrapper')
                        if desc_tag:
                            description = clean_description(desc_tag.text.strip())
                            print(f"Description: {description}")

                        date_text = None
                        date_tag = ad_soup.find('time', class_='u-dt')
                        if date_tag:
                            date_text = date_tag.text.strip()
                            print(f"Date text found: {date_text}")
                        formatted_date = parse_date(date_text) if date_text else None

                        phone=[]
                        location=[]

                        ad_instance = Ad(
                            title=title,
                            description=description,
                            link=full_link,
                            image_url=image_url,
                            category=None,
                            phone=phone,  # Phone numbers are not extracted in this version
                            date=formatted_date,
                            price=price,
                            currency=currency,
                            location=location,  # Location is not extracted in this version
                            store="it.mk"
                        )

                        print("Phone field before insert:", ad_instance.phone)

                        #print("=" * 80)
                        print("TUPLE DEBUG:", ad_instance.to_tuple())
                        print("AD DEBUG:", ad_instance)
                        print('\n')
                        #print("=" * 30)
                        insert_ad_to_db(ad_instance)

                    except Exception as e:
                        print(f"Error processing ad on page {page_num}: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await asyncio.sleep(ASYNC_TIMEOUT)

        await browser.close()


def split_price_and_currency(price_text):
    price_text = price_text.replace(' ', '')
    digits = ''.join(c for c in price_text if c.isdigit())
    currency = ''.join(c for c in price_text if not c.isdigit())
    return (int(digits), currency) if digits else (None, None)

def clean_description(description):
    cleaned_text = re.sub(r'(?:\n\s*){3,}', '\n\n===CUT===\n\n', description)
    if '===CUT===' in cleaned_text:
        cleaned_text = cleaned_text.split('===CUT===')[0]
    return cleaned_text.strip()

MONTHS_SHORT = {
    "јануари": "January",
    "февруари": "February",
    "март": "March",
    "април": "April",
    "мај": "May",
    "јуни": "June",
    "јули": "July",
    "август": "August",
    "септември": "September",
    "октомври": "October",
    "ноември": "November",
    "декември": "December"
}

def parse_date(date_text):
    try:
        parts = date_text.split()
        month_short = parts[1]
        day = int(parts[0])
        year = int(parts[2])
        month_full = MONTHS_SHORT.get(month_short.lower(), None)
        if month_full:
            date_str = f"{day:02d}/{datetime.strptime(month_full, '%B').month:02d}/{year}"
            return date_str
        else:
            print(f"Unknown month abbreviation: {month_short}")
            return None
    except Exception as e:
        print(f"Error parsing date '{date_text}': {e}")
        return None

DB_HOST = "localhost"
DB_USER = "milos55"
DB_PASSWORD = "smil55"
DB_NAME = "reklami_pazar"

def insert_ad_to_db(ad_instance):
    conn = None
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME
        )
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO ads (title, description, link, image_url, category, phone, date, price, currency, location, store)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            ad_instance.title,
            ad_instance.description,
            ad_instance.link,
            ad_instance.image_url,
            ad_instance.category,
            ", ".join([p for p in (ad_instance.phone or []) if isinstance(p, str) and p.strip()]),
            ad_instance.date,
            ad_instance.price,
            ad_instance.currency,
            ad_instance.location,
            ad_instance.store
        ))
        conn.commit()
        print(f"Ad '{ad_instance.title}' inserted into the database.")
    except psycopg2.Error as e:
        print(f"Error inserting ad: {e}")
    finally:
        if conn:
            conn.close()

async def main():
    start_time = time.time()
    await fetch_ads(BASE_URL, START_PAGE, END_PAGE, BATCH_SIZE)
    end_time = time.time()
    print(f"Total time: {end_time - start_time:.2f} seconds")
    print(f"Total pages scraped: {END_PAGE - START_PAGE + 1}")
    print(f"Estimated ads scraped: {(END_PAGE - START_PAGE + 1) * BATCH_SIZE}")

if __name__ == "__main__":
    asyncio.run(main())
