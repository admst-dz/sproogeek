Положите сюда файл шрифта Lack Regular:

  Lack-Regular.woff2   (рекомендуется)
  Lack-Regular.woff    (опционально, как fallback для старых браузеров)

После размещения файла шрифт автоматически подхватится из index.css
(@font-face → /fonts/Lack-Regular.woff2) и применится ко всем экранам
проекта, кроме главной страницы (Home — остаётся на Zen Kaku Gothic
Antique).

Если файла .woff2 нет, конвертация:
  https://transfonter.org/   — drag-n-drop .ttf/.otf, опции по умолчанию.
