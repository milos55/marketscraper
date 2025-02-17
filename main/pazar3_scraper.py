# Created by Milos Smiljkovikj
# Github: https://github.com/milos55
# Date: 08/02/2025

import asyncio
import asyncpg
from bs4 import BeautifulSoup
from datetime import datetime
from ad import Ad
from playwright.async_api import async_playwright
import json

# CONFIG
DB_CONFIG = {
    "user": "milos55",
    "password": "smil55",
    "database": "reklami",
    "host": "localhost",
    "port": 5432,
}

START_PAGE = 1
END_PAGE = 2
BATCH_SIZE = 5 + 1  # dirty hack, to not create a secondary variable
URL = "https://www.pazar3.mk/oglasi/"

# MAIN CODE

async def fetch_page(page, URL):
    try:
        await page.goto(URL, timeout=60000)
        await page.wait_for_load_state("load")  # Ensure dynamic content loads
        return await page.content()
    except Exception as e:
        print(f"Failed to load {URL}: {e}")
        return None


def convert_today_date(date_str):
    if date_str.startswith("Денес"):
        today = datetime.now().strftime("%d.%m.%Y")
        return date_str.replace("Денес", today)
    return date_str

async def fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE):
    baseurl = "https://www.pazar3.mk"
    ads = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        for batch_start in range(START_PAGE, END_PAGE + 1, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE - 1, END_PAGE)
            print(f"Scraping pages {batch_start} to {batch_end}")

            for page_num in range(batch_start, batch_end + 1):
                page_url = f"{URL}?Page={page_num}"
                await page.goto(page_url, timeout=60000)
                await page.wait_for_load_state("load")

                ad_elements = await page.locator("div.class_of_ad_container").all()  # Adjust the selector!

                for ad in ad_elements:
                    try:
                        title = await ad.locator("css=selector_for_title").inner_text()
                        price = await ad.locator("css=selector_for_price").inner_text()
                        date = await ad.locator("css=selector_for_date").inner_text()
                        image = await ad.locator("css=selector_for_image").get_attribute("src")
                        category = await ad.locator("css=selector_for_category").inner_text()

                        ads.append({
                            "title": title.strip(),
                            "price": price.strip(),
                            "date": date.strip(),
                            "image": image.strip() if image else None,
                            "category": category.strip()
                        })

                    except Exception as e:
                        print(f"Error extracting ad data: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await save_to_db(ads)
            await asyncio.sleep(2)  # Prevent rate limiting

        await browser.close()

    return ads

def process_ad(item, ads):
    """
    Helper function to extract ad details from JSON-LD data and append to the ads list.
    """
    title = item.get("name", "N/A")
    price = item.get("offers", {}).get("price", "N/A")
    currency = item.get("offers", {}).get("priceCurrency", "N/A")
    image = item.get("image", "N/A")
    if isinstance(image, list):
        image = image[0] if image else "N/A"
    url = item.get("url", "N/A")

    # Create an Ad object (replace with your Ad class)
    ad = Ad(
        title=title,
        price=price,
        currency=currency,
        image_url=image,
        link=url,
        store="pazar3"
    )
    ads.append(ad)

# Updated to work with class ad
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
    ads = await fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE)
    print(f"Scraped {len(ads)} ads.")
    await save_to_db(ads)

if __name__ == "__main__":
    asyncio.run(main(URL, START_PAGE, END_PAGE, BATCH_SIZE))