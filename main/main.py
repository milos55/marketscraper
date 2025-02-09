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
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
    }

    async with session.get(url, headers=headers) as response:
        if response.status != 200:
            print(f"Page failed to load: {url} (status code {response.status})")
            return None
        return await response.text()

def convert_today_date(date_str):
    if date_str.startswith("Денес"):
        today = datetime.now().strftime("%d.%m.%Y")
        return date_str.replace("Денес", today)
    return date_str

async def fetch_ads(url, start_page, end_page, batch_size):
    baseurl = "https://www.reklama5.mk"
    ads = []
    
    async with aiohttp.ClientSession() as session:
        for batch_start in range(start_page, end_page + 1, batch_size):
            batch_end = min(batch_start + batch_size - 1, end_page)
            print(f"Scraping pages {batch_start} to {batch_end}")

            tasks = [fetch_page(session, f"{url}&page={page}") for page in range(batch_start, batch_end + 1)]
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
                        currency = ad.find('span', class_='search-ad-price')
                        category = ad.find('a', class_='text-secondary').find('small').text if ad.find('a', class_='text-secondary').find('small') else None
                        rk5adlink = baseurl + ad.find('a', class_='SearchAdTitle')['href']

                        image_url = image_ad.find("div", class_="ad-image")["style"].split("url(")[-1].split(")")[0].strip("'\"")
                        image_url = "https:" + image_url if image_url.startswith("//") else image_url

                        price = ''
                        currency = ''
                        for char in price_text:
                            if char.isdigit() or char == '.': 
                                price += char
                            else:
                                currency = price_text[len(price):]
                                break

                        ad_data = {"title": title, "price": price, "currency": currency, "category": category, "link": rk5adlink, "image_url": image_url}

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

                    except Exception as e:
                        print(f"Error processing ad on page {page_num}: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await save_to_db(ads)
            await asyncio.sleep(2)

    return ads

async def save_to_db(ads):
    conn = await asyncpg.connect(**DB_CONFIG)
    
    for ad in ads:
        try:
            if isinstance(ad["date"], str) and ad["date"] != "N/A":
                ad["date"] = datetime.strptime(ad["date"], "%d.%m.%Y %H:%M")
            elif ad["date"] == "N/A":
                ad["date"] = None  
  

            await conn.execute(
                """
                INSERT INTO reklami (title, price, currency, category, link, description, phone, date, image_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (link) DO NOTHING;
                """,
                ad["title"], ad["price"], ad["currency"], ad["category"], ad["link"], 
                ad["description"], ad["phone"], ad["date"], ad["image_url"]
            )
        except Exception as e:
            print(f"Error inserting ad: {e}")

    await conn.close()

async def main(url, start_page, end_page, batch_size):
    ads = await fetch_ads(url, start_page, end_page, batch_size)
    print(f"Scraped {len(ads)} ads.")
    await save_to_db(ads)


# broj na strane tuj !! BITNO !!
start_page = 60
end_page = 65
batch_size = 5
url = "https://www.reklama5.mk/Search?city=&cat=0&q="

if __name__ == "__main__":
    asyncio.run(main(url, start_page, end_page, batch_size))
