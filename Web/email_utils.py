from flask_mail import Message
from itsdangerous import URLSafeTimedSerializer
from flask import url_for, current_app


# Generate & Verify Token
def generate_token(email):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])  # Use current_app directly
    return serializer.dumps(email, salt='email-confirmation')

def verify_token(token, expiration=3600):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        email = serializer.loads(token, salt='email-confirmation', max_age=expiration)
        return email
    except:
        return None
# Send Verification Email
def send_verification_email(email, lang):
    from app import mail
    token = generate_token(email)
    confirm_url = url_for('confirm_email', lang=lang, token=token, _external=True)
    
    # Create language-specific subject and body
    if lang == 'mkd':
        subject = 'Потврдете ја вашата е-пошта'
        body = f'Кликнете на следниот линк за да ја потврдите вашата е-пошта: {confirm_url}'
    elif lang == 'al':
        subject = 'Konfirmoni emailin tuaj'
        body = f'Klikoni në lidhjen e mëposhtme për të konfirmuar emailin tuaj: {confirm_url}'
    else:  # Default to English
        subject = 'Confirm Your Email'
        body = f'Click the following link to confirm your email: {confirm_url}'
    
    msg = Message(subject, recipients=[email])
    msg.body = body

    try:
        mail.send(msg)
    except Exception as e:
        print(f"Error sending email: {e}")

# Send Password Reset Email
def send_reset_email(email, lang):
    from app import mail
    token = generate_token(email)
    reset_url = url_for('reset_password', lang=lang, token=token, _external=True)
    
    # Language-specific email content
    if lang == 'en':
        subject = 'Reset Your Password'
        body = f'Hello, \n\nClick the link to reset your password: {reset_url}'
    elif lang == 'mkd':
        subject = 'Ресетирајте ја вашата лозинка'
        body = f'Здраво, \n\nКликнете на линкот за да ја ресетирате вашата лозинка: {reset_url}'
    elif lang == 'al':
        subject = 'Rivendosni Fjalëkalimin Tuaj'
        body = f'Përshendetje, \n\nKlikoni në lidhjen për të rivendosur fjalëkalimin tuaj: {reset_url}'
    else:
        # Default to English
        subject = 'Reset Your Password'
        body = f'Hello, \n\nClick the link to reset your password: {reset_url}'

    msg = Message(subject, recipients=[email])
    msg.body = body

    try:
        mail.send(msg)
    except Exception as e:
        print(f"Error sending email: {e}")
