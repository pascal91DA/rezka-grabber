# Rezka Grabber

React Native приложение для поиска фильмов на сайте rezka.ag

## Функционал

- Поиск фильмов по названию
- Отображение постера, названия, оригинального названия и года выпуска
- Открытие страницы фильма в браузере при нажатии на карточку

## Установка

1. Убедитесь, что у вас установлен Node.js (версия 16 или выше)
2. Установите Expo CLI глобально (если еще не установлен):
```bash
npm install -g expo-cli
```

3. Перейдите в директорию проекта:
```bash
cd RezkaGrabber
```

4. Установите зависимости:
```bash
npm install
```

## Запуск приложения

### Запуск на веб-версии
```bash
npm run web
```

### Запуск на Android
```bash
npm run android
```
Требования: Android Studio и настроенный Android эмулятор или подключенное устройство

### Запуск на iOS
```bash
npm run ios
```
Требования: macOS с установленным Xcode

### Запуск через Expo Go
1. Установите приложение Expo Go на ваш смартфон (доступно в App Store и Google Play)
2. Запустите:
```bash
npm start
```
3. Отсканируйте QR-код в приложении Expo Go

## Структура проекта

```
RezkaGrabber/
├── src/
│   ├── components/        # React компоненты
│   │   └── MovieCard.tsx  # Карточка фильма
│   ├── screens/           # Экраны приложения
│   │   └── SearchScreen.tsx  # Экран поиска
│   ├── services/          # Сервисы для API
│   │   └── rezkaService.ts   # Сервис парсинга rezka.ag
│   └── types/             # TypeScript типы
│       └── Movie.ts       # Тип данных фильма
├── App.js                 # Точка входа в приложение
└── package.json           # Зависимости проекта
```

## Технологии

- React Native
- Expo
- TypeScript
- axios - HTTP клиент
- htmlparser2-without-node-native - парсинг HTML

## Примечание

Приложение использует парсинг HTML-страниц сайта rezka.ag. При изменении структуры сайта может потребоваться обновление логики парсинга в файле `src/services/rezkaService.ts`.
