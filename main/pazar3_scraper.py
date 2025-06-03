from datetime import datetime, timedelta
import aiohttp
import asyncio
from bs4 import BeautifulSoup
import time
import re
from ad import Ad  # Assuming your Ad class is in this module

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

                        # Format currency output
                        if currency == "ЕУР":
                            currency = "€"
                        elif currency == "МКД":
                            currency = "МКД"
                        else:
                            price = "По Договор"
                            currency = ""

                        # Numbers present on every ad for some reason
                        ADMIN_NUMBERS = {"078 377 677", "047 551 166"}

                        # Extracting phone numbers and removing duplicates
                        phone_numbers = set()  # Using a set to store unique numbers

                        if ad_soup:
                            # Extract from the accurate selector
                            span_tags = ad_soup.select("div.seller-contacts a span:nth-child(2)")
                            for tag in span_tags:
                                phone_numbers.add(tag.text.strip())

                            # Extract from <bdi> inside the seller-contacts section (in case it's still relevant)
                            bdi_tags = ad_soup.select("div.seller-contacts bdi")
                            for tag in bdi_tags:
                                phone_numbers.add(tag.text.strip())

                        # Normalize numbers and filter out admin numbers
                        formatted_numbers = {normalize_phone_number(num) for num in phone_numbers if
                                             normalize_phone_number(num) not in ADMIN_NUMBERS}

                        phone_display = ", ".join(formatted_numbers) if formatted_numbers else "Not found"

                        # Extracting description
                        description = None
                        if ad_soup:
                            desc_tag = ad_soup.find('div', class_='description-area')
                            if desc_tag:
                                description = clean_description(desc_tag.text.strip())
                        # Inside your ad processing loop, after fetching ad details

                        # Extracting date
                        date_text = None
                        if ad_soup:
                            date_tag = ad_soup.find('bdi', class_='published-date')
                            if date_tag:
                                date_text = date_tag.text.strip()

                        # Parse and format the date
                        formatted_date = parse_date(date_text) if date_text else None

                        if not location or not formatted_numbers or not description:
                            print(f"Skipping ad (missing location, phone, or description): {link}")
                            continue  # Skip to the next ad

                        # Create Ad instance
                        ad_instance = Ad(
                            title=title,
                            description=description,
                            link=link,
                            image_url=image_url,
                            category=None,  # Not extracting category in this example
                            phone=list(formatted_numbers),
                            date=formatted_date,
                            price=price,
                            currency=currency,
                            location=location,
                            store="pazar3"  # Not extracting store in this example
                        )

                        # Print ad details using the to_tuple method
                        print("=" * 80)
                        print(ad_instance.to_tuple())  # Assuming to_tuple method is implemented in the Ad class
                        print("=" * 30)

                    except Exception as e:
                        print(f"Error processing ad on page {page_num}: {e}")

            print(f"Finished scraping pages {batch_start} to {batch_end}")
            await asyncio.sleep(ASYNC_TIMEOUT)


def split_price_and_currency(price_text):
    """ Extracts numeric price and currency from a price string """
    price_text = price_text.replace(' ', '')  # Remove spaces
    digits = ''.join(c for c in price_text if c.isdigit())
    currency = ''.join(c for c in price_text if not c.isdigit())

    return (int(digits), currency) if digits else (None, None)


def normalize_phone_number(phone):
    phone = re.sub(r'\D', '', phone)  # Remove non-numeric characters

    # Special case: Keep full numbers starting with 00389 or 00306
    if phone.startswith("00389") or phone.startswith("00306"):
        return phone

    # Remove country code (+389 or 00389)
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

    return phone  # Return unchanged if it doesn't match expected formats


def clean_description(description):
    """
    Cleans the description by removing everything after two or more consecutive empty lines.
    """
    # Replace multiple empty lines with a marker
    cleaned_text = re.sub(r'\n\s*\n\s*\n+', '\n\n===CUT===\n\n', description)

    # Keep only the text before the marker
    if '===CUT===' in cleaned_text:
        cleaned_text = cleaned_text.split('===CUT===')[0]

    return cleaned_text.strip()


MONTHS_SHORT = {
    "јан.": "January",
    "фев.": "February",
    "мар.": "March",
    "апр.": "April",
    "мај.": "May",
    "јун.": "June",
    "јул.": "July",
    "авг.": "August",
    "септ.": "September",
    "окт.": "October",
    "ноем.": "November",
    "дек.": "December"
}


# Function to handle the date string and convert to the desired format
def parse_date(date_text):
    try:
        # Split by space and assume the format is "month day year"
        parts = date_text.split()
        month_short = parts[0]  # First part is the short month
        day = int(parts[1])  # The second part is the day
        year = int(parts[2])  # The third part is the year

        # Convert short month name to full month name
        month_full = MONTHS_SHORT.get(month_short.lower(), None)

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
DB_HOST = "localhost"
DB_USER = "nepamtu"
DB_PASSWORD = "nepamtu"
DB_NAME = "ads_database"

def insert_ad_to_db(ad_instance):
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME
        )
        cursor = conn.cursor()

        # Prepare the ad data for insertion
        cursor.execute('''
            INSERT INTO ads (title, description, link, image_url, category, phone, date, price, currency, location, store)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            ad_instance.title,
            ad_instance.description,
            ad_instance.link,
            ad_instance.image_url,
            ad_instance.category,
            ", ".join(ad_instance.phone),  # Assuming it's a list, join as a comma-separated string
            ad_instance.date,
            ad_instance.price,
            ad_instance.currency,
            ad_instance.location,
            ad_instance.store
        ))

        # Commit the transaction
        conn.commit()
        print(f"Ad '{ad_instance.title}' inserted into the database.")

    except psycopg2.Error as e:
        print(f"Error inserting ad: {e}")

    finally:
        if conn:
            conn.close()

async def main():
    start_time = time.time()

    await fetch_ads(URL, START_PAGE, END_PAGE, BATCH_SIZE)

    end_time = time.time()
    total_time = end_time - start_time
    print(f"Total time: {total_time:.2f} seconds")


if __name__ == "__main__":
    asyncio.run(main())
