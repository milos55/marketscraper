import aiohttp
import asyncio
import asyncpg
from bs4 import BeautifulSoup
from datetime import datetime

DB_CONFIG = {
    "user": "milos55",
    "password": "smil55",
    "database": "reklami",
    "host": "localhost",
    "port": 5432,
}

async def fetch_page(session, url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    }
    async with session.get(url) as response:
        if response.status != 200:
            print(f"Page failed to load: {url} (status code {response.status})")
            return None
        return await response.text()

def convert_today_date(date_str):
    if date_str.startswith("Денес"):
        today = datetime.now().strftime("%d.%m.%Y")
        return date_str.replace("Денес", today)
    return date_str

async def fetch_ads(url, max_pages):
    baseurl = "https://www.reklama5.mk"
    ads = []
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        for page_num in range(1, max_pages + 1):
            paged_url = f"{url}&page={page_num}"
            print(f"Scraping page {page_num}: {paged_url}")
            task = fetch_page(session, paged_url)
            tasks.append(task)
            await asyncio.sleep(1)

        pages_responses = await asyncio.gather(*tasks)

        for page_num, page_content in zip(range(1, max_pages + 1), pages_responses):
            if page_content is None:
                continue

            soup = BeautifulSoup(page_content, "html.parser")
            
            # Existing helper for ad details
            helper = soup.find_all('div', class_='ad-desc-div col-lg-6 text-left')
            
            # New helper for image URLs
            image_helper = soup.find_all('div', class_='ad-image-div col-lg-4 text-left')

            if not helper or not image_helper:
                break

            # Ensure both helpers have the same number of ads
            if len(helper) != len(image_helper):
                print(f"Mismatch in ad count: {len(helper)} vs {len(image_helper)}")
                continue

            for ad, image_ad in zip(helper, image_helper):
                title = ad.find('a', class_='SearchAdTitle').text.strip()
                price = ad.find('span', class_='search-ad-price').text.strip().replace('\r\n', '').replace(' ', '')
                category = ad.find('a', class_='text-secondary').find('small').text if ad.find('a', class_='text-secondary').find('small') else None
                rk5adlink = baseurl + ad.find('a', class_='SearchAdTitle')['href']

                # Extract image URL from the new helper
                image_url = image_ad.find("div", class_="ad-image")["style"].split("url(")[-1].split(")")[0].strip("'\"")
                image_url = "https:" + image_url if image_url.startswith("//") else image_url

                ad_data = {"title": title, "price": price, "category": category, "link": rk5adlink, "image_url": image_url}

                if rk5adlink:
                    ad_response = await fetch_page(session, rk5adlink)
                    if ad_response is None:
                        continue

                    ad_soup = BeautifulSoup(ad_response, "html.parser")

                    description = ad_soup.find('p', class_='mt-3').text.strip() if ad_soup.find('p', class_='mt-3') else None
                    phone = ad_soup.find('h6').get_text(strip=True) if ad_soup.find('h6') else None
                    date_elements = ad_soup.find_all('div', class_='col-4 align-self-center')
                    if len(date_elements) > 2:
                        date_span = date_elements[2].find('span')
                        date = date_span.text.strip() if date_span else 'N/A'
                        date = convert_today_date(date)
                    else:
                        date = 'N/A'

                    ad_data.update({"description": description, "phone": phone, "date": date})

                ads.append(ad_data)

    return ads

async def save_to_db(ads):
    conn = await asyncpg.connect(**DB_CONFIG)
    
    for ad in ads:
        try:
            # Convert date string to a proper datetime object
            if ad["date"] and ad["date"] != "N/A":
                ad["date"] = datetime.strptime(ad["date"], "%d.%m.%Y %H:%M")  
            else:
                ad["date"] = None  # Store NULL if date is invalid

            await conn.execute(
                """
                INSERT INTO reklami (title, price, category, link, description, phone, date, image_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (link) DO NOTHING;
                """,
                ad["title"], ad["price"], ad["category"], ad["link"], 
                ad["description"], ad["phone"], ad["date"], ad["image_url"]
            )
        except Exception as e:
            print(f"Error inserting ad: {e}")

    await conn.close()


async def main(url, max_pages):
    ads = await fetch_ads(url, max_pages)
    print(f"Scraped {len(ads)} ads.")
    
    # Store ads in PostgreSQL
    await save_to_db(ads)

max_pages = 5  # Menjaj za posive ovoj samo test max rk5 sg e 8320
url = "https://www.reklama5.mk/Search?city=&cat=0&q="

if __name__ == "__main__":
    asyncio.run(main(url, max_pages))
