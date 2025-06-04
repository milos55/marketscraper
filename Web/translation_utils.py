import os
import yaml
from flask import Flask, request

class TranslationManager:
    def __init__(self, base_path):
        self.base_path = os.path.abspath(base_path)
        self.translations_cache = {}

    def load_translations(self, module, lang):
        cache_key = f"{module}_{lang}"
        if cache_key in self.translations_cache:
            return self.translations_cache[cache_key]

        if lang not in ['mkd', 'en', 'al']:
            lang = 'en'

        translation_file = os.path.join(self.base_path, module, f"{lang}.yaml")

        if not os.path.exists(translation_file):
            return {}

        try:
            with open(translation_file, 'r', encoding='utf-8') as file:
                content = file.read()
                translations = yaml.safe_load(content) or {}
                translations.pop('language', None)
                self.translations_cache[cache_key] = translations
                return translations
        except (IOError, yaml.YAMLError):
            return {}

def init_translation_system(app):
    base_path = os.path.abspath(os.path.join(app.root_path, 'static', 'translations'))
    translation_manager = TranslationManager(base_path)

    @app.context_processor
    def inject_translate():
        def translate(key, module='common', lang='en'):
            if not lang:
                lang = request.cookies.get('lang')

            if not lang or lang not in ['mkd', 'en', 'al']:
                lang ='en'

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
    keys = key.split('.')
    current = translations
    for k in keys:
        if isinstance(current, dict):
            current = current.get(k, key)
        else:
            return key
    return current if current != key else key
