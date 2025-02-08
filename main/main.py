import aiohttp
import asyncio
from bs4 import BeautifulSoup
from datetime import datetime

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
        # Replace "Денес" with today's date
        today = datetime.now().strftime("%d.%m.%Y")
        return date_str.replace("Денес", today)
    return date_str

async def fetch_ads(url, max_pages):
    baseurl = "https://www.reklama5.mk"
    ads = []
    
    async with aiohttp.ClientSession() as session:
        tasks = []

        # Loop through page numbers (from 1 to max_pages)
        for page_num in range(1, max_pages + 1):
            paged_url = f"{url}&page={page_num}"
            print(f"Scraping page {page_num}: {paged_url}")
            
            # Create an asynchronous task for fetching the page
            task = fetch_page(session, paged_url)
            tasks.append(task)

            # delay for 1 second
            await asyncio.sleep(1)

        # Run all fetch tasks concurrently
        pages_responses = await asyncio.gather(*tasks)

        for page_num, page_content in zip(range(1, max_pages + 1), pages_responses):
            if page_content is None:
                print(f"Skipping page {page_num} due to an error.")
                continue

            soup = BeautifulSoup(page_content, "html.parser")
            helper = soup.find_all('div', class_='ad-desc-div col-lg-6 text-left')

            if not helper:
                print(f"No ads found on page {page_num}.")
                break  # stop if no ads are found

            for ad in helper:
                title = ad.find('a', class_='SearchAdTitle').text.strip()
                price = ad.find('span', class_='search-ad-price').text.strip()
                category = ad.find('a', class_='text-secondary').find('small').text if ad.find('a', class_='text-secondary').find('small') else None
                rk5adlink = baseurl + ad.find('a', class_='SearchAdTitle')['href']

                ad_data = {"title": title, "price": price, "category": category, "link": rk5adlink}

                if rk5adlink:
                    ad_response = await fetch_page(session, rk5adlink)
                    if ad_response is None:
                        print(f"Skipping ad {title} due to an error.")
                        continue

                    ad_soup = BeautifulSoup(ad_response, "html.parser")

                    description = ad_soup.find('p', class_='mt-3').text.strip() if ad_soup.find('p', class_='mt-3') else None
                    phone = ad_soup.find('h6').get_text(strip=True) if ad_soup.find('h6') else None
                    date_elements = ad_soup.find_all('div', class_='col-4 align-self-center')
                    if len(date_elements) > 2:
                        date_span = date_elements[2].find('span')
                        date = date_span.text.strip() if date_span else 'N/A'
                        date = convert_today_date(date)  # Convert "Денес" to today's date
                    else:
                        date = 'N/A'

                    ad_data["description"] = description
                    ad_data["phone"] = phone
                    ad_data["date"] = date

                ads.append(ad_data)

    return ads, max_pages


# Example usage
async def main(url, max_pages):
    ads, _ = await fetch_ads(url, max_pages)
    print(f"Scraped {len(ads)} ads.")
    # Output the results
    for ad in ads:
        print(ad)

max_pages = 1
url = "https://www.reklama5.mk/Search?city=&cat=0&q="

# Run the async function
if __name__ == "__main__":
    asyncio.run(main(url,max_pages))