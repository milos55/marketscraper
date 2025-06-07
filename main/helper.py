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






#CONFIG

DB_CONFIG = {
    "user": "milos55",
    "password": "smil55",
    "database": "reklami",
    "host": "localhost",
    "port": 5432,
}
#Made config parameters in seperate block for readability and scalability

START_PAGE = 1
END_PAGE = 1
BATCH_SIZE = 5 #dirty hack, to not create a secondary variable
URL = "https://forum.it.mk/oglasnik/"
ASYNC_TIMEOUT = 2






#MAIN CODE

async def fetch_page(session, URL, retries=3, delay=2):
    headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    #"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    #"Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
    "Connection": "keep-alive",
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


# Function to handle the date string and convert to the desired format
def parse_date(date_text):
    try:
        # Space split, format is dd/mm/yyyy
        parts = date_text.split()
        month_short = parts[1]  # First part is the short month
        day = int(parts[0])  # The second part is the day, i'm not moving this
        year = int(parts[2])  # The third part is the year

        # Convert short month name to full month name
        month_full = MONTHS_SHORT.get(month_short.lower(), None) # Does it matter really

        if month_full:
            # Construct the final date string in "dd/mm/yyyy" format
            date_str = f"{day:02d}/{datetime.strptime(month_full, '%B').month:02d}/{year}"
            return date_str

        else:
            print(f"Unknown month abbreviation: {month_short}")
            return None

    except Exception as e:
        print(f"Error parsing date '{date_text}': {e}")
        return None


async def fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE):
    baseurl = URL
    ads = []

    async with aiohttp.ClientSession() as session:
        for batch_start in range(START_PAGE, END_PAGE + 1, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE - 1, END_PAGE)
            print(f"Scraping pages {batch_start} to {batch_end}")

            tasks = [fetch_page(session, f"{URL}?page={page}") for page in range(batch_start, batch_end + 1)]
            pages_responses = await asyncio.gather(*tasks)

            for page_num, page_content in zip(range(batch_start, batch_end + 1), pages_responses):
                if page_content is None:
                    continue

                soup = BeautifulSoup(page_content, "html.parser")
                helper = soup.find_all('div', class_='structItemContainer')
                #image_helper = soup.find_all('div', class_='ad-image-div col-lg-4 text-left')

                if not helper :
                    print(f"No ads found on page {page_num}.")
                    continue

                for ad, image_ad in zip(helper, helper):
                    try:
                        title = ad.find('div', class_='structItem-title').find('a').text.strip()
                        price_text = ad.find('span', class_='ribbon ribbon--green').text.strip().replace('\r\n', '').replace(' ', '')
                        category = ad.find('ul', class_='structItem-parts').find_all('li')[2].text.strip()
                        rk5adlink = baseurl + ad.find('div', class_='structItem-title').find('a')['href']
                        date = ad.find('time', class_='u-dt').text.strip()
                        store = "IT.mk"
                         # Image
                        image_span = soup.find('div', class_='structItem-iconContainer')
                        try:
                            image_url = image_span.find('img')['src']
                        except AttributeError:
                            image_url = 'N/A'

                    
                        location_text = None

                        # FIXED MISO 10.02.25 proveri za efikasnost
                        pos = next((i for i, c in enumerate(price_text) if not (c.isdigit() or c == '.')), len(price_text))
                        price_str = price_text[:pos].replace('.', '')
                        price = int(price_str) if price_str else 0
                        currency = price_text[pos:]

                        # Script only works for reklama5, other scripts will be needed for other sites (different web structure)

                        #Updated to work with class !! IMPLEMENTRAJ MESTO VAR STORE DA VIKA SAMO REKLAMA5 VIDI ROLLBACK main.py ili nemoze !!
                        ad = Ad(title, None, rk5adlink, image_url, category, None, None, price, currency,location_text , store)

                        #Ti ga 2 put proverues dali postoi link (preko rk5adlink i ad_response), sg ga proverue 1 put
                        #Code reformated to work with class (more readible and functional)
                        ad_response = await fetch_page(session, rk5adlink)
                        if ad_response:
                            ad_soup = BeautifulSoup(ad_response, "html.parser")
                            ad.description = ad_soup.find('p', class_='mt-3').text.strip() if ad_soup.find('p', class_='mt-3') else None
                            ad.phone = ad_soup.find('h6').get_text(strip=True) if ad_soup.find('h6') else None
                            date_element = ad_soup.find_all('div', class_='col-4 align-self-center')
                            ad.date = convert_today_date(date_element[2].find('span').text.strip()) if len(date_element) > 2 else None

                        ads.append(ad)
                        print(f"Scraped ad: {ad.title} - {ad.link} - {ad.price} {ad.currency} - {ad.date} - {ad.store}")
                        print(ad)  # Print the ad object for debugging


                    #Check page on which an error occured
                    except Exception as e:
                        print(f"Error processing ad on page {page_num}: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            #await save_to_db(ads) # Uncomment to save to DB after each batch, but it will be slow
            #Test lowest time with no error
            await asyncio.sleep(ASYNC_TIMEOUT)

    return ads

#Updated to work with class ad
""" async def save_to_db(ads):
    conn = await asyncpg.connect(**DB_CONFIG)

    for ad in ads:
        try:
            if isinstance(ad.date, str) and ad.date != "N/A":
                ad.date = datetime.strptime(ad.date, "%d.%m.%Y %H:%M")
            elif ad.date == "N/A":
                ad.date = None

            required_fields = [ad.title, ad.description, ad.link, ad.image_url, ad.category, ad.phone, ad.date, ad.price, ad.currency, ad.store]
            if any(field is None for field in required_fields): # Protection agaiisnt null values so it doesn't break code, most liklley a deleted ad so not important
                print(f"Skipping ad {ad.link} with missing required fields.")
                continue

            await conn.execute(
                
                #INSERT INTO reklami (title, description, link, image_url, category, phone, date, price, currency,location ,store)
                #VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                #ON CONFLICT (link) DO NOTHING;
                ,
                ad.title, ad.description, ad.link, ad.image_url, ad.category,
                ad.phone, ad.date, ad.price, ad.currency,ad.location ,ad.store
            )
        except Exception as e:
            print(f"Error inserting ad: {e}")

    await conn.close() """

async def main():
    start_time = time.time()

    ads = await fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE)
    print(f"Scraped {len(ads)} ads.")
    #await save_to_db(ads) # Uncomment to save to DB after scraping all ads

    end_time = time.time()
    total_time = end_time - start_time
    print(f"Total time: {total_time:.2f} seconds")


#REMOVED PARAMS IN MAIN BECAUSE THEY ARE GLOBAL
if __name__ == "__main__":
    asyncio.run(main())
