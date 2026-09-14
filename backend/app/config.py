from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str = "redis://redis:6379/0"

    # TTL сообщения (жёсткий лимит хранения ciphertext).
    message_ttl_seconds: int = 48 * 60 * 60

    # Сколько живёт challenge (окно на подпись).
    challenge_ttl_seconds: int = 60

    # Сколько живёт сессия (токен).
    session_ttl_seconds: int = 7 * 24 * 60 * 60

    # Максимальный размер ciphertext в байтах.
    max_message_size: int = 8 * 1024

    # Допустимое расхождение по часам (сек) между ts клиента и now.
    max_clock_skew_seconds: int = 300

    # Сколько последних id держать в индексе inbox.
    inbox_max_size: int = 1000

    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_subject: str = ""

settings = Settings()
