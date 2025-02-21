import psycopg2

def connect_to_db():
    conn = psycopg2.connect(
        host="localhost",
        database="reklami",
        user="boro",
        password="boro1234"
    )
    return conn
#Added store, currency, image_url
def create_table(conn):
    with conn.cursor() as cursor:
        cursor.execute("""
              CREATE TABLE IF NOT EXISTS reklami (
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
