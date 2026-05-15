# Взрастить Pöllö

Telegram-бот-игра про сову Pöllö — кормите, растите и развивайте своего пернатого питомца в группе Telegram.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — запустить сервер + бот (порт 8080)
- `pnpm run typecheck` — проверка типов по всем пакетам
- `pnpm run build` — typecheck + сборка всех пакетов
- `pnpm --filter @workspace/api-spec run codegen` — перегенерировать API хуки из OpenAPI spec
- `pnpm --filter @workspace/db run push` — применить изменения схемы БД (только dev)
- Required env: `DATABASE_URL` — Postgres строка подключения
- Required secret: `TELEGRAM_BOT_TOKEN` — токен Telegram-бота (от @BotFather)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: grammy (Telegram bot framework)
- API: Express 5 (keep-alive сервер)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle) — grammy externalized

## Where things live

- `artifacts/api-server/src/bot/` — весь код Telegram-бота
  - `bot.ts` — инициализация и запуск бота
  - `data.ts` — статические данные (30 карточек, 15 скинов, квесты)
  - `format.ts` — форматирование сообщений, расчёт голода/жажды
  - `dbHelpers.ts` — операции с БД
  - `games.ts` — логика дуэлей (4 режима)
  - `handlers/` — обработчики команд и колбеков
- `lib/db/src/schema/owlBot.ts` — схема БД для бота
- `artifacts/api-server/build.mjs` — esbuild конфиг (grammy в externals!)

## Architecture decisions

- grammy externalized в esbuild (не бандлится) — иначе ломается `platform.node`
- Голод/жажда рассчитывается динамически из timestamp (не хранится в готовом виде)
- Дуэльное состояние хранится в JSONB в БД — позволяет восстанавливать игру после рестарта
- Express сервер = keep-alive endpoint (`/api/healthz`)
- Бот работает в long polling режиме (не webhook)

## Product

- 🦉 Сова Pöllö с системой голода/жажды, уровней (1-50), XP
- 🪶 15 скинов (покупаются за фрагменты, требуют уровень)
- 🃏 30 карточек с шансом выпадения 1.2% при сообщениях
- ⚔️ Дуэли: игра перьев, крестики-нолики, кубик, поединок
- 👨‍👩‍👧 Семейная система (союз 2 сов, совместные вылазки)
- 📜 Квесты для повышения уровня (с 6-го уровня)
- 🏆 Таблица лидеров (XP, фрагменты, уровень)

## User preferences

_Populate as you build_

## Gotchas

- После изменения схемы БД: `pnpm --filter @workspace/db run push`
- После изменения `lib/db`: `pnpm run typecheck:libs` для перестройки
- grammy ДОЛЖЕН быть в externals в `build.mjs` — иначе ошибка `platform.node`
- `ctx.answerCallbackQuery({ text: "...", show_alert: true })` — не двумя аргументами!

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
