import os
import yaml
import traceback
from flask import Flask, request

class TranslationManager:
    def __init__(self, base_path):
        # Convert to absolute path for reliable debugging
        self.base_path = os.path.abspath(os.path.join("web", "static", "translations"))
        print(f"🔍 TranslationManager initialized")
        print(f"📂 Base Path: {self.base_path}")
        
        # Verify base path exists
        if not os.path.exists(self.base_path):
            print(f"❌ ERROR: Base path does not exist: {self.base_path}")
            print(f"📋 Current Working Directory: {os.getcwd()}")
        
        self.translations_cache = {}

    def load_translations(self, module, lang):
        # Extensive logging and error handling
        print(f"\n🌐 Translation Loading Request:")
        print(f"   Module: {module}")
        print(f"   Language: {lang}")

        # Validate language
        if lang not in ['mkd', 'en', 'al']:
            print(f"⚠️ Invalid language code: {lang}. Defaulting to English.")
            lang = 'en'

        # Check cache first
        cache_key = f"{module}_{lang}"
        if cache_key in self.translations_cache:
            print(f"✅ Returning cached translations for {cache_key}")
            return self.translations_cache[cache_key]

        # Construct translation file path
        translation_file = os.path.join(self.base_path, module, f"{lang}.yaml")
        print(f"🔎 Attempting to load file: {translation_file}")

        # Detailed file system checks
        print("\n📂 File System Diagnostics:")
        print(f"Base path exists: {os.path.exists(self.base_path)}")
        print(f"Module path exists: {os.path.exists(os.path.join(self.base_path, module))}")
        print(f"Translation file exists: {os.path.exists(translation_file)}")

        # If file doesn't exist, list available files
        if not os.path.exists(translation_file):
            print("❌ Translation file NOT found!")
            try:
                available_files = os.listdir(os.path.join(self.base_path, module))
                print(f"Available files in {module} directory: {available_files}")
            except Exception as list_error:
                print(f"Error listing directory contents: {list_error}")
            return {}

        try:
            with open(translation_file, 'r', encoding='utf-8') as file:
                content = file.read()
                
                # Extensive content logging
                print("\n📄 YAML File Content:")
                print(content)

                # Parse YAML with error handling
                try:
                    translations = yaml.safe_load(content) or {}

                    # Remove 'language' key if present
                    translations.pop('language', None)
                except yaml.YAMLError as yaml_error:
                    print(f"❌ YAML Parsing Error: {yaml_error}")
                    print(traceback.format_exc())
                    return {}

                print("\n🧩 Parsed Translations:")
                print(translations)
                
                # Cache and return
                self.translations_cache[cache_key] = translations
                return translations

        except IOError as io_error:
            print(f"❌ File Reading Error: {io_error}")
            print(traceback.format_exc())
            return {}
        except Exception as e:
            print(f"❌ Unexpected Error: {e}")
            print(traceback.format_exc())
            return {}

def init_translation_system(app):
    # More robust path resolution
    base_path = os.path.abspath(os.path.join(app.root_path, 'static', 'translations'))
    print(f"\n🌐 Translation System Initialization")
    print(f"📂 Resolved Base Path: {base_path}")
    print(f"📂 App Root Path: {app.root_path}")
    
    translation_manager = TranslationManager(base_path)

    @app.context_processor
    def inject_translate():
        def translate(key, module='common', lang='en'):
            if not lang:
                lang = request.cookies.get('lang')

            if not lang or lang not in ['mkd', 'en', 'al']:
                lang ='en'

            print(f"🌍 Requested Language: '{lang}'")  # Debugging

            if lang not in ['mkd', 'en', 'al']:
                print(f"⚠️ Invalid language in translation: '{lang}'")  # Debugging
                lang = 'en'

            translations = translation_manager.load_translations(module, lang)
            
            keys = key.split('.')
            current = translations
            for k in keys:
                if isinstance(current, dict):
                    current = current.get(k, key)
                else:
                    return key
            
            return current if current != key else key

        return dict(translate=translate)


    return translation_manager

# Global translation function for non-Jinja2 contexts
translation_manager = TranslationManager('static/translations')

def translate(key, module='common', lang='en'):
    translations = translation_manager.load_translations(module, lang)
    
    # Nested key support
    keys = key.split('.')
    current = translations
    for k in keys:
        if isinstance(current, dict):
            current = current.get(k, key)
        else:
            return key
    
    return current if current != key else key