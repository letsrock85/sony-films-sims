# Filmbook — Sony Film Simulations Field Companion

Карманный офлайн-справочник по плёночным симуляциям для камер Sony Alpha.
Все рецепты и фотографии: [Veres Deni Alex](https://www.veresdenialex.com) (PDF-пак + блог).

## Что внутри

- **84 рецепта**: 66 Picture Profile (из PDF) + 18 Creative Look (из блога автора)
- Подбор по условиям: свет / жанр / настроение / тип — нужный рецепт за 2-3 клика
- Карточка рецепта = чеклист в порядке меню камеры с отметками прогресса
- Карта плёнок по осям Saturation × Tonality (как чарты в PDF)
- Гайды: White Balance для симуляций, настройка камеры, калибровка, S-Log
- Избранное и прогресс сохраняются локально; после первого открытия работает офлайн (PWA)

## Запуск

Нужен любой статический сервер (файлы открываются по `fetch`, поэтому просто открыть `index.html` с диска нельзя):

```powershell
py -m http.server 8137 --directory app
```

Открой http://localhost:8137 — готово. На телефоне: открой адрес в Safari/Chrome
и добавь на домашний экран («Add to Home Screen») — приложение будет работать офлайн.

Чтобы пользоваться с телефона в той же Wi-Fi сети, запусти сервер и открой
`http://<IP-компьютера>:8137`. Либо задеплой папку `app/` на любой статический
хостинг (GitHub Pages, Netlify, Cloudflare Pages) — это просто статика.

## Структура

```
app/               готовое приложение (статика + data.json + фото рецептов)
data/              промежуточные данные (парсинг PDF, блог, ручная курация)
scripts/
  extract_pdf.py   парсинг рецептов и картинок из PDF (PyMuPDF)
  extract_chart.py парсинг чартов Saturation×Tonality
  build_data.py    сборка app/data.json из всех источников
docs/              исходный PDF автора
```

## Пересборка данных

```powershell
py -m pip install pymupdf
py scripts\extract_pdf.py
py scripts\extract_chart.py
py scripts\build_data.py
```
