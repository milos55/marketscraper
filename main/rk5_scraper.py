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
END_PAGE = 1000
BATCH_SIZE = 5 + 1 #dirty hack, to not create a secondary variable
URL = "https://www.reklama5.mk/Search?city=&cat=0&q="







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

                        # FIXED MISO 10.02.25 proveri za efikasnost
                        pos = next((i for i, c in enumerate(price_text) if not (c.isdigit() or c == '.')), len(price_text))
                        price_str = price_text[:pos].replace('.', '')
                        price = int(price_str) if price_str else 0
                        currency = price_text[pos:]

                        store = "reklama5"  # Script only works for reklama5, other scripts will be needed for other sites (different web structure)

                        #Updated to work with class !! IMPLEMENTRAJ MESTO VAR STORE DA VIKA SAMO REKLAMA5 VIDI ROLLBACK main.py ili nemoze !!
                        ad = Ad(title, None, rk5adlink, image_url, category, None, None, price, currency, store)

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


                    #Check page on which an error occured
                    except Exception as e:
                        print(f"Error processing ad on page {page_num}: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await save_to_db(ads)
            #Test lowest time with no error
            await asyncio.sleep(2)

    return ads

#Updated to work with class ad
async def save_to_db(ads):
    conn = await asyncpg.connect(**DB_CONFIG)
    
    for ad in ads:
        try:
            if isinstance(ad.date, str) and ad.date != "N/A":
                ad.date = datetime.strptime(ad.date, "%d.%m.%Y %H:%M")
            elif ad.date == "N/A":
                ad.date = None  
  
            await conn.execute(
                """
                INSERT INTO reklami (title, description, link, image_url, category, phone, date, price, currency, store)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (link) DO NOTHING;
                """,
                ad.title, ad.description, ad.link, ad.image_url, ad.category, 
                ad.phone, ad.date, ad.price, ad.currency, ad.store
            )
        except Exception as e:
            print(f"Error inserting ad: {e}")

    await conn.close()

async def main(URL, START_PAGE, END_PAGE, BATCH_SIZE):
    start_time = time.time()

    ads = await fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE)
    print(f"Scraped {len(ads)} ads.")
    await save_to_db(ads)

    end_time = time.time()
    total_time = end_time - start_time
    print(f"Total time: {total_time:.2f} seconds")



if __name__ == "__main__":
    asyncio.run(main(URL, START_PAGE, END_PAGE, BATCH_SIZE))
