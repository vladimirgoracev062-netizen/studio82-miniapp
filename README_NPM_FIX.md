# STUDIO 82 npm registry fix

Фикс для ошибки Vercel:

`npm error ETIMEDOUT ... packages.applied-caas-gateway...`

## Что внутри

- `.npmrc` — заставляет Vercel качать зависимости с обычного npm registry.
- `package-lock.json` — чистый lock-файл без внутренних OpenAI/caas-ссылок.
- `fix-npm-registry.bat` — запасной вариант: можно запустить в корне проекта, он создаст `.npmrc` и удалит старый `package-lock.json`.

## Как применить

1. Скопировать `.npmrc` и `package-lock.json` в корень проекта `studio82-miniapp` с заменой.
2. GitHub Desktop → Commit to main.
3. Push origin.
4. Vercel → Redeploy without cache.

Если после копирования всё равно будет ошибка, запусти `fix-npm-registry.bat` в корне проекта, затем снова commit/push.
