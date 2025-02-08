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
                description TEXT,   
                phone TEXT,
                link TEXT
            )
        """)