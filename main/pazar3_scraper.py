import aiohttp
import asyncio
from bs4 import BeautifulSoup
import time

# CONFIG
START_PAGE = 1
END_PAGE = 3
BATCH_SIZE = 3
URL = "https://www.pazar3.mk/oglasi/"
ASYNC_TIMEOUT = 2


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
            await asyncio.sleep(delay)

    print(f"Giving up on {URL} after {retries} attempts.")
    return None


async def fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE):
    baseurl = "https://www.pazar3.mk"

    async with aiohttp.ClientSession() as session:
        for batch_start in range(START_PAGE, END_PAGE + 1, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE - 1, END_PAGE)
            print(f"Scraping pages {batch_start} to {batch_end}")

            tasks = [fetch_page(session, f"{URL}&Page={page}") for page in range(batch_start, batch_end + 1)]
            pages_responses = await asyncio.gather(*tasks)

            for page_num, page_content in zip(range(batch_start, batch_end + 1), pages_responses):
                if page_content is None:
                    continue

                soup = BeautifulSoup(page_content, "html.parser")
                ad_list = soup.find_all('a', class_='Link_vis')

                if not ad_list:
                    print(f"No ads found on page {page_num}.")
                    continue

                for ad in ad_list:
                    try:
                        title = ad.text.strip()
                        link = baseurl + ad['href']  # Full link

                        # Open the ad detail page to get extra info
                        ad_page_content = await fetch_page(session, link)
                        ad_soup = BeautifulSoup(ad_page_content, "html.parser") if ad_page_content else None

                        # Extracting location
                        location = None
                        if ad_soup:
                            location_tags = ad_soup.find_all('a', class_='tag-item')

                            for tag in location_tags:
                                span_tag = tag.find('span')
                                bdi_tag = tag.find('bdi')

                                if span_tag and "Локација:" in span_tag.text and bdi_tag:
                                    location = bdi_tag.text.strip()
                                    break  # Stop after finding the location

                        # Extracting image URL
                        image_url = None
                        if ad_soup:
                            image_tag = ad_soup.find('img', class_='custom-photo-zoom')
                            if image_tag:
                                image_url = image_tag.get('data-src')

                        # Extracting price
                        price_text = ad.find_next('p', class_='list-price').text.strip() if ad.find_next('p',
                                                                                                         class_='list-price') else None
                        price, currency = split_price_and_currency(price_text) if price_text else (None, None)

                        # Extracting phone numbers
                        phone_numbers = []
                        if ad_soup:
                            phone_tags = ad_soup.find_all('a', href=True)
                            for tag in phone_tags:
                                if "tel:" in tag["href"]:
                                    phone_numbers.append(tag.text.strip())

                        phone_display = ", ".join(phone_numbers) if phone_numbers else "Not found"

                        # Extracting description
                        description = None
                        if ad_soup:
                            desc_tag = ad_soup.find('div', class_='description-area')
                            if desc_tag:
                                description = desc_tag.text.strip()

                        # Print ad details
                        print("=" * 80)
                        print(f"Title: {title}")
                        print(f"Link: {link}")
                        print(f"Location: {location if location else 'Not found'}")
                        print(f"Image URL: {image_url if image_url else 'Not found'}")
                        print(f"Price: {price if price else 'Not found'}")
                        print(f"Currency: {currency if currency else 'Not found'}")
                        print(f"Phone: {phone_display}")
                        print(f"Description: {description if description else 'Not found'}")  # Truncated
                        print("=" * 30)

                    except Exception as e:
                        print(f"Error processing ad on page {page_num}: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await asyncio.sleep(ASYNC_TIMEOUT)


def split_price_and_currency(price_text):
    price_text = price_text.replace(' ', '')  # Remove spaces
    digits = ''.join(c for c in price_text if c.isdigit())
    currency = ''.join(c for c in price_text if not c.isdigit())
    return int(digits), currency


async def main():
    start_time = time.time()

    await fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE)

    end_time = time.time()
    total_time = end_time - start_time
    print(f"Total time: {total_time:.2f} seconds")


if __name__ == "__main__":
    asyncio.run(main())
