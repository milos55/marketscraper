import psycopg2
from psycopg2 import sql

def connect_to_db():
    conn = psycopg2.connect(
        host="localhost",
        database="reklami",
        user="milos55",
        password="smil55"
    )
    return conn

def create_table(conn):
    with conn.cursor() as cursor:
        cursor.execute("""
            CREATE TABLE reklami (
                id SERIAL PRIMARY KEY,
                title TEXT,
                price TEXT,
                category TEXT,
                link TEXT,
                description TEXT,
                phone TEXT,
                date TEXT
            )
        """)
    conn.commit()

def insert_data(conn, data):
    with conn.cursor() as cursor:
        for ad in ads:
            cursor.execute(
                """
                INSERT INTO reklami (title, price, category, link, description, phone, date)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (ad_data['title'], ad_data['price'], ad_data['category'], ad_data['link'], ad_data['description'], ad_data['phone'], ad_data['date'])
            )
    conn.commit()

def store_ads_in_db(ads):
    conn = connect_to_db()
    create_table(conn)
    insert_data(conn, ads)
    conn.close()

store_ads_in_db(ads)