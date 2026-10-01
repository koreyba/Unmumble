# Съёмка интерфейса через Playwright

Читать для запуска браузера и съёмки реальных действий. Основной маршрут: **видимый Chromium + полный профиль устройства + CDP JPEG quality 95 + FFmpeg по временным меткам**. iPhone 16 ниже — пример; URL, устройство и действия берутся из задачи. Это мобильная эмуляция на компьютере, не настоящий iPhone/iOS или Safari.

Перед Computer Use проверь MCP/CLI. Для показа пользователю и управления между вызовами используй persistent Node REPL. Для готового сценария — [capture-session.mjs](../scripts/capture-session.mjs). Открывать DevTools и вручную выбирать телефон не требуется.

## Зависимости и запуск

Из действующего репозитория проверь установленный Playwright, профиль и наличие executable Chromium:

```sh
node -e "const p=require('playwright'); console.log(require.resolve('playwright')); console.log(p.devices['iPhone 16']); console.log(p.chromium.executablePath());"
```

При отсутствии бинарника установи его из того же пакета: `npx --no-install playwright install chromium`. Не устанавливай второй Playwright. При недоступном Node проверь `load_workspace_dependencies`; ошибки установки сообщай явно.

Код для persistent Node REPL; замени абсолютные пути. `createRequire` от `package.json` проекта проверен в этой среде. Прямой импорт `playwright/index.mjs` здесь завершался ошибкой экспорта `default`.

```js
var projectRoot = '/Users/denys.koreiba/Documents/Unmumble.online';
var createRequire = (await import('node:module')).createRequire;
var pw = createRequire(projectRoot + '/package.json')('playwright');
var fs = await import('node:fs/promises');
var output = await fs.mkdtemp('/tmp/product-video-');
var profile = pw.devices['iPhone 16'];
if (!profile) throw new Error('Device profile is unavailable');
var browser = await pw.chromium.launch({
  headless: false,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
var context = await browser.newContext({ ...profile });
context.setDefaultTimeout(5000);
context.setDefaultNavigationTimeout(20000);
var page = await context.newPage();
await page.goto('https://unmumble.online/', { waitUntil: 'domcontentloaded' });
await page.bringToFront();
nodeRepl.write(await page.evaluate(() => ({
  width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
  userAgent: navigator.userAgent, scrollWidth: document.documentElement.scrollWidth,
})));
await nodeRepl.emitImage(await page.screenshot({ scale: 'css' }));
```

Браузер остаётся открытым между вызовами REPL. Полный профиль задаёт UA, viewport, screen, DPR, `isMobile` и `hasTouch`; не добавляй второй viewport и не переключай DevTools поверх профиля. Для desktop используй обычный контекст с требуемым viewport. Финальные 1080×1920 задаются в монтаже, а не CSS-размером страницы.

## Запись и действия

Подготовь нужный экран, затем начни дубль отдельным вызовом:

```js
var recorder = await import(projectRoot + '/.agents/skills/product-video/scripts/recorder.mjs');
var take = await recorder.start(page, output + '/take', {
  audio: false, maxSeconds: 60,
  readState: async p => ({ url: p.url() }),
});
await take.mark('before-action');
nodeRepl.write({ output, device: take.device });
```

CDP-запись можно начать на уже открытой странице Chromium. Новый `recordVideo`-контекст для этого не нужен. По умолчанию дубль автоматически останавливается через 60 секунд; для согласованного сценария можно задать другой `maxSeconds`. После нужных действий или команды пользователя останови запись сразу. Автоостановка заканчивает захват, но оставляет окно доступным; итоговый файл ждёт `await take.stop()`.

Находи кнопки по текущей роли и доступному имени. Для обзора:

```js
nodeRepl.write(await page.locator('a,button,[role="radio"],[role="tab"]').evaluateAll(es =>
  es.map(e => ({ tag: e.tagName, role: e.getAttribute('role'),
    text: e.innerText.trim(), label: e.getAttribute('aria-label'),
    href: e.getAttribute('href') }))
));
```

Каждое действие выполняй коротким отдельным вызовом. Например, после проверки актуального интерфейса Unmumble:

```js
await page.getByRole('link', { name: 'Library', exact: true }).click();
await page.waitForURL('**/library', { timeout: 10000 });
await take.mark('after-library');
await page.waitForTimeout(1500); // пауза для просмотра результата
```

Готовность подтверждай URL, состоянием или видимым результатом. Для touch-сцены используй `tap()` и отдельно проверь её. DOM `button` может иметь роль `radio`; динамический `textContent` со счётчиком ненадёжен. После ошибки перечитай роль/имя. Держи таймауты действий короче лимита REPL: зависшее ожидание может сбросить ядро и потерять управляющие переменные.

### Работающий плеер

Дождись готовности и нажми актуальную кнопку Play. В проверенном Unmumble это `Play playback`; `Pause playback` означает, что плеер уже запущен. На другом экране прочитай имя заново.

Подтверди воспроизведение меняющимися кадрами/субтитрами и растущей позицией. Для HTML video наблюдай `paused`, `readyState`, `currentTime`; для iframe — доступный API провайдера или состояние продукта. Успешный клик и buffering не доказывают воспроизведение. Сохрани метки до действия и после результата. Для Repeat сними два реальных цикла, не копируй фрагмент в монтаже как доказательство функции. Не подменяй недоступный внешний плеер мокапом.

Основная запись немая. Если заказан звук продукта, прочитай [capture-cdp.md](capture-cdp.md), сделай отдельную аудиопробу и синхронизируй дорожку. Музыка и озвучка независимы от звука вкладки.

## Остановить, собрать, проверить

```js
nodeRepl.write(await take.stop()); // безопасно и после автоматического лимита
await browser.close(); // если пользователь не просит оставить окно
```

Нельзя закрывать страницу/контекст раньше остановки recorder. Если окно нужно оставить, после `take.stop()` оно уже доступно без записи; следующий дубль начинай в новой папке после завершения предыдущего. После изменения recorder перезапусти Node-процесс, чтобы не использовать кеш старого модуля.

Выход: JPEG в `take/frames/`, `take/capture.json`, снимки меток, совместимый `frames.txt`. Основной сборщик читает **capture.json**:

```sh
python3 .agents/skills/product-video/scripts/render-capture.py /absolute/take/capture.json /absolute/result.mp4 --fps 30 --crf 16
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration -of json /absolute/result.mp4
```

Для фрагмента добавь `--start 0 --duration 10`. Сборщик выбирает последний захваченный кадр не позже каждого выходного таймкода и повторяет его при паузах. Длительность округляется вверх максимум на один кадр. Это сохраняет темп действий; 30 fps контейнера не означает 30 уникальных исходных кадров в секунду. Не собирай плотные кадры обычным concat по `frames.txt`: округление интервалов на timebase изображений в нашей пробе сократило 60 секунд до примерно 35.

Проверь ненулевую длительность, реальные размеры и кадры до/после действий. Посмотри воспроизведение видео, особенно плеер, мелкий текст и момент перехода. Существующий MP4 сборщик не перезаписывает. При ошибке неполный результат не объявляй готовым. Для дальнейшего монтажа и экспорта см. [delivery.md](delivery.md).

## Качество и курсор

Проверено 1 октября 2026: Playwright 1.62.1, видимый Chromium, профиль iPhone 16, CSS 393×659, DPR 3; CDP JPEG quality 95 дал реальные **786×1318**. Пользователь просмотрел и принял 60-секундный H.264 MP4 с действующим встроенным плеером и взаимодействиями. Эти размеры относятся к этой среде; `maxWidth:1170/maxHeight:2532` — верхние границы, не гарантия разрешения.

В той же среде нативный WebKit `recordVideo` давал **392×658, 25 fps** и чёрный участок встроенного видео. Увеличение `recordVideo.size` до 1179×1977 добавляло поля вокруг маленького изображения. Поэтому нативный маршрут оставлен лишь для явно выбранной диагностики/совместимости (`recording:"native"`, нужный `browserType`), а не как основной способ съёмки продукта. В нём запись начинается с `newPage`, завершается закрытием контекста и `video.saveAs`; звук вкладки отсутствует.

Для мастера 1080×1920 желательно реальное изображение интерфейса шириной от 1080 пикселей с запасом для приближения. Проверенный CDP-исходник меньше: upscale не добавляет деталей. DPR-скриншот 1179×1977 был чётким, но плавная запись таких скриншотов на 30/60 fps не подтверждена. При необходимости большего качества нужна новая короткая проба с измерением actual frames, а не увеличение CSS viewport.

Системный курсор в захват не попадает. Добавляй курсор/касание, подсветку клика и зум в Remotion по проверенным меткам и `boundingBox()` фактической кнопки после прокрутки. Координаты переводи из CSS viewport в реальные размеры кадра. DOM-маркер с `pointer-events:none` возможен, но требует отдельной пробы и повторной установки после навигации.

## CLI для повторяемого сценария

Скопируй [capture-config.json](../assets/capture-config.json) в папку ролика, заполни абсолютный `playwrightModule` (`playwright/index.js`), URL и новую `output`. Остальные пути разрешаются относительно конфига.

```sh
node .agents/skills/product-video/scripts/capture-session.mjs /absolute/capture-config.json
```

По умолчанию Chromium/CDP, видимое окно, немая короткая проба, лимит дубля 60 секунд. После сценария процесс останавливает запись и закрывает браузер. Без `scenario` результат находится в `output/probe/`; `session.json` и `probe.png` описывают запуск. Для действий укажи доверенный локальный `.mjs`:

```js
export async function run({ page, startRecording }) {
  // Подготовь экран до начала дубля.
  const take = await startRecording('library');
  await take.mark('before-library');
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.waitForURL('**/library');
  await take.mark('after-library');
  await page.waitForTimeout(1500);
  await take.stop();
}
```

Метки `take.mark` имеют шкалу кадров; общий `mark` helper — ISO-время процесса, не точный видеотаймкод. Не делай действий для дубля после `take.stopped`; автоостановка не прерывает сам сценарий. При ошибке helper завершает доступные записи, закрывает браузер и выходит с ошибкой. Успех сценария и качество полученного изображения проверяются отдельно.

Передай в монтаж исходные кадры/видео и manifest с URL, устройством/движком, фактическим разрешением, действиями и результатами. Для локального приложения добавь commit/dirty-состояние; локальный SHA не доказывает версию удалённого deployment.
