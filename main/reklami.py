import psycopg2
from config import Config

def connect_to_db():
    conn = psycopg2.connect(
        host=Config.DB_HOST,
        database=Config.DB_NAME,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD
    )
    return conn
#Added store, currency, image_url
def create_table(conn):
    with conn.cursor() as cursor:
        cursor.execute("""
              CREATE TABLE IF NOT EXISTS ads (
                id SERIAL PRIMARY KEY,
                title TEXT,
                description TEXT,
                link TEXT,
                image_url TEXT,
                category TEXT,
                phone TEXT,
                date TEXT
                price TEXT,
                currency TEXT,
                location TEXT,
                store TEXT
            )
        """)
    conn.commit()

def setup_database():
    conn = connect_to_db()
    create_table(conn)
    conn.close()

if __name__ == "__main__":
    setup_database()
