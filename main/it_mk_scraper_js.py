from datetime import datetime
import aiohttp
import asyncio
from bs4 import BeautifulSoup
import time
from config import Config

# === COLOR CONSTANTS ===
RED = '\033[31m'
YELLOW = '\033[33m'
GREEN = '\033[32m'
RESET = '\033[0m'

# === CONFIGURATION ===
START_PAGE = 1
END_PAGE = 3
BATCH_SIZE = 3
BASE_URL = "https://forum.it.mk"
ASYNC_TIMEOUT = 2
URL_TEMPLATE = "https://forum.it.mk/oglasnik/categories/prodavam.1/?page={page}"


async def fetch_page(session, url, retries=3, delay=2):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.pazar3.mk/",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Connection": "keep-alive"
    }

    for attempt in range(retries):
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    return await response.text()
                print(
                    f"{RED}Attempt {attempt + 1}: Failed to fetch {url} (status {response.status}){RESET}")
        except Exception as e:
            print(f"{RED}Attempt {attempt + 1}: Error fetching {url} - {e}{RESET}")
        if attempt < retries - 1:
            await asyncio.sleep(delay)
    print(f"{RED}Giving up on {url} after {retries} attempts.{RESET}")
    return None


async def scrape_it_ads():
    async with aiohttp.ClientSession() as session:
        for page in range(START_PAGE, END_PAGE + 1):
            current_url = URL_TEMPLATE.format(page=page)
            print(f"{YELLOW}Processing page {page}: {current_url}{RESET}")

            html_content = await fetch_page(session, current_url)
            if not html_content:
                continue

            soup = BeautifulSoup(html_content, 'html.parser')

            # Find all ad containers
            ad_containers = soup.select('div.structItem--listing')
            if not ad_containers:
                print(f"{RED}No ads found on page {page}{RESET}")
                continue

            for ad in ad_containers:
                try:
                    # Title and Link
                    title_link = ad.select_one('div.structItem-title > a')
                    title = title_link.text.strip() if title_link else None
                    link = f"{BASE_URL}{title_link['href']}" if title_link else None

                    # Image
                    img_tag = ad.select_one('div.structItem-cell--icon img')
                    image_url = f"{BASE_URL}{img_tag['src']}" if (img_tag and img_tag.get('src')) else None

                    # Price
                    price_span = ad.select_one('div.structItem-cell--main ul li span')
                    price = price_span.text.strip() if price_span else None

                    # Create test instance
                    ad_data = {
                        'title': sanitize_unicode(title),
                        'link': link,
                        'image_url': image_url,
                        'price': sanitize_unicode(price)
                    }

                    # Validation and reporting
                    if not all([title, link]):
                        print(f"{RED}Missing critical data in ad{RESET}")
                        continue

                    print(f"{GREEN}Extracted ad:{RESET}")
                    print(f"Title: {ad_data['title']}")
                    print(f"Link: {ad_data['link']}")
                    print(f"Image: {ad_data['image_url'] or 'No image'}")
                    print(f"Price: {ad_data['price'] or 'N/A'}")
                    print("-" * 60)

                except Exception as e:
                    print(f"{RED}Error processing ad: {e}{RESET}")


def sanitize_unicode(text):
    return text.encode('utf-8', errors='replace').decode('utf-8') if text else None


async def main():
    start_time = time.time()
    await scrape_it_ads()
    print(f"Total execution time: {time.time() - start_time:.2f} seconds")


if __name__ == "__main__":
    asyncio.run(main())
