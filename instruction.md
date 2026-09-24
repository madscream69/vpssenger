# Развёртывание Family Secure Messenger на VPS

## Требования

- VPS с Ubuntu 22.04 или 24.04
- Минимум: 1 CPU, 1 GB RAM, 15 GB SSD
- Публичный IPv4
- Домен, направленный на IP VPS (A-запись)
- Открытые порты: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3478 UDP/TCP, 5349 TCP, 49152-65535 UDP

## Предварительная проверка

### 1. Узнать IP VPS

```bash
curl -s ifconfig.me
```

Запиши — понадобится для `turnserver.conf` и проверки DNS.

### 2. Проверить DNS

С локальной машины:

```powershell
nslookup <Your Domen>
```

Должен вернуть **IP нового VPS**. Если нет — поправь A-запись у регистратора и подожди 5-30 минут.

### 3. Открыть порты у хостера

В панели управления VPS (или через firewall хостера):

- `22/tcp` — SSH
- `80/tcp` — HTTP
- `443/tcp` — HTTPS
- `3478/udp` + `3478/tcp` — TURN
- `5349/tcp` — TURN TLS
- `49152-65535/udp` — TURN relay

**Если хостер не даёт открыть весь диапазон relay** — сузь до `49152-49200` (100 портов) и в `turnserver.conf`, и в firewall.

---

## Установка

### 1. Базовая настройка сервера

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git ufw nano
```

### 2. Firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp
sudo ufw --force enable
sudo ufw status
```

### 3. Docker + Docker Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Проверка
docker --version
docker compose version
```

### 4. Клонировать репозиторий

```bash
cd /root
git clone <URL-репозитория> vpssenger
cd vpssenger
```

### 5. Создать `.env`

Скопируй `.env.example` в `.env` и заполни:

```bash
cp .env.example .env
nano .env
```

**Обязательные поля:**

```
REDIS_URL=redis://redis:6379/0
MESSAGE_TTL_SECONDS=172800
MAX_MESSAGE_SIZE=8192

# VAPID (push-уведомления)
VAPID_PRIVATE_KEY=<base64url приватный ключ>
VAPID_PUBLIC_KEY=<base64url публичный ключ>
VAPID_SUBJECT=mailto:your@email.com

# TURN
TURN_SECRET=<тот же, что static-auth-secret в turnserver.conf>
TURN_REALM=<Your Domen>
TURN_TTL_SECONDS=3600
TURN_HOST=<IP VPS>
```

**Если переносишь с другого сервера** — просто скопируй `.env` целиком со старого VPS:

```bash
# На старом VPS
cat /root/vpssenger/.env

# На новом VPS — вставить содержимое
nano /root/vpssenger/.env
```

⚠️ **`TURN_HOST` нужно поменять на новый IP**, если IP VPS меняется.

### 6. Генерация VAPID (если переносишь впервые)

Если переносишь **существующий** сервер — VAPID-ключи **уже есть в `.env`**, ничего делать не надо.

Если настраиваешь **с нуля**:

```bash
docker compose up -d --build backend
docker compose exec backend python -c "
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64

key = ec.generate_private_key(ec.SECP256R1())
priv_der = key.private_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)
nums = key.public_key().public_numbers()
pub_raw = b'\x04' + nums.x.to_bytes(32, 'big') + nums.y.to_bytes(32, 'big')

b64u = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
print('VAPID_PRIVATE_KEY=' + b64u(priv_der))
print('VAPID_PUBLIC_KEY='  + b64u(pub_raw))
"
```

Скопируй обе строки в `.env`.

### 7. Создать `turnserver.conf`

```bash
nano /root/vpssenger/turnserver.conf
```

**Вставь** (замени `<IP>` и `<SECRET>`):

```
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0

external-ip=<IP>
realm=<Your Domen>

use-auth-secret
static-auth-secret=<SECRET>

min-port=49152
max-port=65535

no-cli
log-file=stdout
simple-log

no-multicast-peers
no-loopback-peers
```

**Где взять `<SECRET>`:**

- **При переезде** — возьми из старого `turnserver.conf`. Он **должен совпадать** с `TURN_SECRET` в `.env`.
- **При первичной настройке** — сгенерируй:
  ```bash
  openssl rand -hex 32
  ```
  И **положи это же значение** в `TURN_SECRET` в `.env`.

⚠️ **`<IP>` должен совпадать с `TURN_HOST` в `.env`.**

### 8. Запустить

```bash
cd /root/vpssenger
docker compose up -d --build
docker compose ps
```

**Ожидаемо:**

- `redis` — `Up (healthy)`
- `backend` — `Up (healthy)`
- `caddy` — `Up`
- `coturn` — `Up`

### 9. Проверить сертификат

```bash
docker compose logs -f caddy
```

**Ожидаемо** через 10-30 секунд:

```
certificate obtained successfully    identifier=<Your Domen>
```

**Если ошибка `acme: error`** — смотри `docker compose logs caddy --tail=50`, чаще всего:

- DNS ещё не разошёлся (подожди).
- Порт 80 закрыт.
- Caddy пытается ZeroSSL и не может — добавь в `Caddyfile` в глобальный блок:
  ```
  acme_ca https://acme-v02.api.letsencrypt.org/directory
  ```

### 10. Проверка

```bash
# 1. Health
curl -s https://<Your Domen>/health
# {"status":"ok","redis":true}

# 2. VAPID
curl -s https://<Your Domen>/push/vapid-public-key
# {"key":"..."}

# 3. TURN endpoint (нужен токен)
curl -s -i https://<Your Domen>/turn/credentials
# HTTP/2 401 (ожидаемо без токена)

# 4. coturn слушает
sudo ss -tlnup | grep -E "3478|5349"
```

### 11. Открыть в браузере

`https://<Your Domen>` — должен открыться экран логина **без предупреждений сертификата**.

---

## Перенос данных (со старого VPS)

### Что переносить

| Что | Обязательно | Как |
|-----|-------------|-----|
| `.env` | ✅ | `scp` со старого сервера |
| `turnserver.conf` | ✅ | `scp` + правка `external-ip` |
| TLS-сертификаты (`caddy_data`) | ⚠️ опционально | можно не переносить, Caddy получит новые |
| Redis | ❌ | сообщения и так живут 48 ч — переживать не о чем |

### Как перенести `.env` и `turnserver.conf`

**Со старого VPS на локальную машину:**

```powershell
scp root@<OLD_IP>:/root/vpssenger/.env ./env-backup
scp root@<OLD_IP>:/root/vpssenger/turnserver.conf ./turnserver-backup.conf
```

**С локальной машины на новый VPS:**

```powershell
scp ./env-backup root@<NEW_IP>:/root/vpssenger/.env
scp ./turnserver-backup.conf root@<NEW_IP>:/root/vpssenger/turnserver.conf
```

**На новом VPS** — проверь `external-ip` в `turnserver.conf`:

```bash
grep external-ip /root/vpssenger/turnserver.conf
curl -s ifconfig.me
```

Должны совпадать. Если нет — поправь в файле.

### Что проверить в `.env` после переноса

```bash
grep -E "TURN_HOST|TURN_SECRET|VAPID" /root/vpssenger/.env
```

- `TURN_HOST` — новый IP.
- `TURN_SECRET` — совпадает с `static-auth-secret` в `turnserver.conf`.
- `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` — на месте.

---

## Обновление DNS (если домен не меняется)

Если ты **переезжаешь на новый VPS** — A-запись домена `<Your Domen>` **должна указывать на новый IP**.

1. Зайди к регистратору домена.
2. Найди DNS-зону `dolbit.fun`.
3. Измени A-запись `vpssenger`:
   - **Было:** `<OLD_IP>`
   - **Стало:** `<NEW_IP>`
4. Подожди 5-30 минут, проверь:
   ```bash
   nslookup <Your Domen>
   ```
5. **Только после того как DNS обновился** — запускай Caddy на новом VPS.

⚠️ **Если не подождать** — Let's Encrypt увидит старый IP, HTTP-01 challenge не пройдёт, сертификат не получится.

---

## Обновление после `git push`

На локальной машине:

```powershell
git add .
git commit -m "описание"
git push
```

На VPS:

```bash
cd /root/vpssenger
git pull
docker compose up -d --build
docker compose restart caddy   # если менял Caddyfile
```

**Проверь**: если менял frontend — Service Worker в браузере может отдавать старую версию. Подними `CACHE` в `sw.js` или удали данные сайта на клиенте.

---

## Частые проблемы

| Проблема | Причина | Решение |
|----------|---------|---------|
| `failed to fetch` на login | DNS провайдера фильтрует домен | VPN или смена домена |
| Caddy не получает сертификат | DNS не обновился / порт 80 закрыт | Проверь `nslookup` и ufw |
| TURN не выдаёт `relay`-кандидатов | Порт 3478 закрыт / `external-ip` неверный | `ss -tlnup \| grep 3478` + `grep external-ip` |
| 502 Bad Gateway | backend упал | `docker compose logs backend --tail=50` |
| `WS not open` в консоли | WS не подключился | Проверь `wss://.../ws?...` в DevTools → Network |
| Пустой экран после логина | SW отдаёт старый JS | Удали данные сайта, подними `CACHE` в `sw.js` |
| Звонок не соединяется | Firewall, coturn, или **VPN** | Выключи VPN, проверь логи coturn |
| QR не сканируется | Камера занята другим приложением | Закрой Zoom/Skype/OBS |

---

## Резервное копирование

**Что важно бэкапить:**

- `.env` — VAPID, TURN-секрет.
- `turnserver.conf` — `static-auth-secret`.
- **Ничего больше.** Сообщения живут 48 ч, Redis эфемерный, TLS-сертификаты Caddy пересоздаст.

**Как бэкапить:**

```bash
# На VPS — раз в месяц
cd /root/vpssenger
tar czf ~/vpssenger-backup-$(date +%F).tar.gz .env turnserver.conf
```

Скачай на локальную машину:

```powershell
scp root@<IP>:/root/vpssenger-backup-*.tar.gz ./
```

**Восстановление** — распакуй в `/root/vpssenger/`.

---

## Полезные команды

```bash
# Логи всех сервисов
docker compose logs -f

# Логи только backend
docker compose logs -f backend --tail=100

# Проверить Redis (активные сессии)
docker compose exec redis redis-cli KEYS "session:*"

# Проверить TTL сообщения
docker compose exec redis redis-cli TTL "msg:<pubkey>:<id>"

# Проверить подписки push
docker compose exec redis redis-cli SMEMBERS "push:<pubkey>"

# Проверить слушателей coturn
sudo ss -tlnup | grep -E "3478|5349"

# Перезапустить всё
docker compose restart
```

---

## Безопасность

- **Приватные ключи пользователей** не покидают их браузеры. Сервер не может расшифровать переписку.
- **Сид-фраза** — единственный способ восстановления. Потерял — аккаунт потерян.
- **TLS-сертификаты** обновляются автоматически (Caddy + Let's Encrypt).
- **VAPID-ключи** должны быть в `.env`, никогда не коммитить в git.
- **TURN-секрет** — только в `turnserver.conf` и `.env`, не коммитить.
- **Регулярно обновляй систему**: `sudo apt update && sudo apt upgrade -y`.