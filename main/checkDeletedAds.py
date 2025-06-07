import asyncio
import psycopg2
import aiohttp
from typing import List

# Configuration
DB_HOST = "localhost"
DB_USER = "postgres"
DB_PASSWORD = "1234"
DB_NAME = "ad_db"
BATCH_SIZE = 100  # Adjust based on your server capacity
MAX_RETRIES = 3
TIMEOUT = 10

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "mk-MK,mk;q=0.9"
}


async def check_link(session: aiohttp.ClientSession, url: str) -> bool:
    """Check if URL returns 404 (with retries)"""
    for _ in range(MAX_RETRIES):
        try:
            async with session.head(
                    url,
                    headers=HEADERS,
                    timeout=aiohttp.ClientTimeout(total=TIMEOUT),
                    allow_redirects=True
            ) as response:
                if response.status == 404:
                    return True
                return False
        except (aiohttp.ClientError, asyncio.TimeoutError):
            continue
    return False  # Assume not 404 if retries fail


async def process_batch(session: aiohttp.ClientSession, links: List[str]) -> List[str]:
    tasks = [check_link(session, link) for link in links]
    results = await asyncio.gather(*tasks)
    return [link for link, is_404 in zip(links, results) if is_404]


async def main():
    """Main cleanup routine"""
    loop = asyncio.get_running_loop()

    # Database connection
    conn = await loop.run_in_executor(
        None,
        lambda: psycopg2.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME
        )
    )

    offset = 0
    total_deleted = 0

    async with aiohttp.ClientSession() as session:
        while True:
            # Fetch batch
            def fetch_batch():
                cur = conn.cursor()
                cur.execute(
                    "SELECT link FROM ads.ads ORDER BY id LIMIT %s OFFSET %s",
                    (BATCH_SIZE, offset)
                )
                return [row[0] for row in cur.fetchall()]

            links = await loop.run_in_executor(None, fetch_batch)
            if not links:
                break

            # Check links
            invalid_links = await process_batch(session, links)

            # Delete invalid links
            if invalid_links:
                def delete_links():
                    cur = conn.cursor()
                    placeholders = ','.join(['%s'] * len(invalid_links))
                    cur.execute(
                        f"DELETE FROM ads.ads WHERE link IN ({placeholders})",
                        invalid_links
                    )
                    conn.commit()
                    return cur.rowcount

                deleted_count = await loop.run_in_executor(None, delete_links)
                total_deleted += deleted_count
                print(f"Deleted {deleted_count} invalid links (Total: {total_deleted})")

            offset += BATCH_SIZE

    # Cleanup
    await loop.run_in_executor(None, conn.close)
    print(f"Cleanup complete. Total deleted: {total_deleted}")


if __name__ == "__main__":
    asyncio.run(main())
