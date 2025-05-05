const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, {
  polling: true,
  request: {
    timeout: 10000,
    agent: null,
  },
});

// Обработчик ошибок polling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

bot
  .setChatMenuButton({
    menu_button: {
      type: 'commands',
      text: 'Открыть меню',
    },
  })
  .then()
  .catch((error) => console.error('Ошибка установки команд:', error));

// Хранилище данных пользователей
const userSettings = {};

// Массивы фраз
const reminderPhrases = [
  'Как продвигается работа?',
  'Ты всё ещё в деле?',
  'Не отвлекаешься? Проверь себя!',
  'Прогресс есть?',
  '25 минут идёт, не расслабляйся!',
  'Фокус! Сколько сделал?',
  'Помни про таймер! Как успехи?',
  'Не забывай, что время идёт!',
  'Работа кипит?',
  'Сколько уже сделал за это время?',
  'Ну как там дела?',
  'Какой прогресс?',
  'В сроки уложимся?',
];

const breakPhrases = [
  '🎉 Всё, давай за кофе, покурить и за работу! На всё про всё пара минут!',
  'Отлично поработал! Теперь пара минут отдыха.',
  'Перерыв! Пара минут и снова в бой.',
  'Пора сделать паузу на перекур.',
  'Отдых - важная часть работы! Несколько минут релакса.',
  'Время на душ и чай! Пара минут отдыха.',
  'Внимание! Немножко минут на чай и кофе. И за работу!',
  'Ты молодец! Немного минут отдыха.',
];

const longBreakPhrases = [
  'Ты молодец! 4 помидора позади - отдыхай большой перерыв!',
  'Отличная работа! Заработал длинный перерыв на покушать и погулять.',
  '4 цикла завершены! Расслабься, впереди большой отдых.',
  'Заслужил длинный перерыв! Отдохни хорошенечко и снова в бой.',
  'Ты молодец! Приятного аппетита, если на обед.',
];

const workStartPhrases = [
  '⏰ Ну что, сколько можно отдыхать, дедлайны давно уже сгорели! Давай за работу!',
  'Перерыв окончен! Время работать!',
  'Отдохнули? Теперь за дело!',
  'Пора возвращаться к работе!',
  'Время за работу!',
  'Давай работать!',
  'Продолжаем работать!',
  'Возвращаемся к работе!',
  'Ну что, пора работать!',
  'Таски сами себя не сделают',
];

// Клавиатура для настроек
const settingsKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Частота напоминаний ⏰', callback_data: 'set_reminder_freq' }],
      [{ text: 'Длительность работы 🕒', callback_data: 'set_work_duration' }],
      [
        {
          text: 'Длительность перерыва ☕',
          callback_data: 'set_break_duration',
        },
      ],
      [
        {
          text: 'Длительность длинного перерыва 🏖️',
          callback_data: 'set_long_break',
        },
      ],
    ],
  },
};

const startKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🚀 За работу!', callback_data: 'start_pomodoro' }],
      [{ text: '⚙️ Настройки', callback_data: 'open_settings' }],
    ],
  },
};

// Функции-утилиты
function getRandomPhrase(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function formatTime(minutes) {
  return minutes > 0 ? `${minutes} мин` : 'не напоминать';
}

function getReminderRow() {
  return formatTime(userSettings[chatId].reminderFrequency)
    ? `- А я тебе помогаю отслеживать эти моменты и напоминаю каждые ${formatTime(
        userSettings[chatId].reminderFrequency
      )} мин 🙋‍♀️`
    : `А я не отсвечиваю, пока не придет пора пить чай ☕`;
}

function getWelcomeMessage() {
  return (
    `👋 *Привет! Я Нелли - твой персональный менеджер проекта!*\n\n` +
    `Сейчас у нас с тобой такие договоренности по формату работы:\n` +
    `- Работаешь ${userSettings[chatId].workDuration} минут 👩‍💻\n` +
    `- Потом делаешь перерыв на ${userSettings[chatId].breakDuration} минут ☕\n` +
    `- Когда сделаны 4 задачи, делаешь перерыв на обед - ${userSettings[chatId].longBreakDuration} минут 🏖️\n\n` +
    getReminderRow() +
    `Нажми /hello чтобы начать работу над таской!`
  );
}

function getDefaultSettings() {
  return {
    reminderFrequency: 3, // каждые 3 минуты
    workDuration: 25, // 25 минут работы
    breakDuration: 5, // 5 минут перерыв
    longBreakDuration: 15, // 15 минут длинный перерыв
    pomodoroCount: 0,
  };
}

// Основная логика Pomodoro
function startPomodoro(chatId) {
  const user = userSettings[chatId] || getDefaultSettings();
  user.pomodoroCount = (user.pomodoroCount || 0) + 1;
  userSettings[chatId] = user;

  const isLongBreak = user.pomodoroCount % 4 === 0;
  const breakDuration = isLongBreak
    ? user.longBreakDuration
    : user.breakDuration;

  // Сообщение о начале работы
  bot.sendMessage(
    chatId,
    `🍅 Поехали! Работаем ${user.workDuration} минут!` +
      (isLongBreak ? '\nПосле этого будет длинный перерыв!' : '')
  );

  // Таймер напоминаний (если частота не 0)
  if (user.reminderFrequency > 0) {
    user.checkTimer = setInterval(() => {
      bot.sendMessage(chatId, getRandomPhrase(reminderPhrases));
    }, user.reminderFrequency * 60 * 1000);
  }

  // Таймер окончания работы
  user.workTimer = setTimeout(() => {
    if (user.checkTimer) clearInterval(user.checkTimer);

    const breakMessage = isLongBreak
      ? getRandomPhrase(longBreakPhrases)
      : getRandomPhrase(breakPhrases);

    bot.sendMessage(chatId, `${breakMessage}`);

    // Таймер окончания перерыва
    user.restTimer = setTimeout(() => {
      bot.sendMessage(chatId, `${getRandomPhrase(workStartPhrases)}`);
      startPomodoro(chatId);
    }, breakDuration * 60 * 1000);
  }, user.workDuration * 60 * 1000);

  userSettings[chatId] = user;
}

// Обработчики команд
// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!userSettings[chatId]) {
    userSettings[chatId] = getDefaultSettings();
  }
  // Красивое приветственное сообщение с кнопкой
  bot.sendMessage(chatId, getWelcomeMessage(), startKeyboard);
});

bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Формат работы (условия труда):', settingsKeyboard);
});

bot.onText(/\/hello/, (msg) => {
  const chatId = msg.chat.id;
  if (!userSettings[chatId]) {
    userSettings[chatId] = getDefaultSettings();
  }
  startPomodoro(chatId);
});

bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  const user = userSettings[chatId];

  if (user) {
    if (user.workTimer) clearTimeout(user.workTimer);
    if (user.checkTimer) clearInterval(user.checkTimer);
    if (user.restTimer) clearTimeout(user.restTimer);

    bot.sendMessage(
      chatId,
      'Ого, я гляжу, уже всё готово! Отлично, когда приступишь к следующей таске, напиши мне /hello'
    );
  } else {
    bot.sendMessage(
      chatId,
      'У тебя нет тасок в работе сейчас. А зря! Нажми /hello, чтобы начать работу над таской.'
    );
  }
});

// Обработчики inline-кнопок
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const user = userSettings[chatId] || getDefaultSettings();
  if (query.data === 'start_pomodoro') {
    if (!userSettings[chatId]) {
      userSettings[chatId] = getDefaultSettings();
    }
    startPomodoro(chatId);
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (query.data === 'open_settings') {
    bot.sendMessage(chatId, 'Обсудим условия труда:', settingsKeyboard);
    bot.answerCallbackQuery(query.id);
    return;
  }

  switch (query.data) {
    case 'set_reminder_freq':
      bot.sendMessage(chatId, 'Выбери частоту напоминаний:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Не напоминать', callback_data: 'reminder_0' }],
            [{ text: 'Каждые 3 минуты', callback_data: 'reminder_3' }],
            [{ text: 'Каждые 5 минут', callback_data: 'reminder_5' }],
            [{ text: 'Свое значение...', callback_data: 'custom_reminder' }],
          ],
        },
      });
      break;

    case 'set_work_duration':
      bot.sendMessage(chatId, 'Установи длительность работы (мин):', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '25 мин (стандарт)', callback_data: 'work_25' }],
            [{ text: '30 мин', callback_data: 'work_30' }],
            [{ text: 'Свое значение...', callback_data: 'custom_work' }],
          ],
        },
      });
      break;

    case 'set_break_duration':
      bot.sendMessage(
        chatId,
        'Установи длительность короткого перерыва (мин):',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '5 мин (стандарт)', callback_data: 'break_5' }],
              [{ text: '10 мин', callback_data: 'break_10' }],
              [{ text: 'Свое значение...', callback_data: 'custom_break' }],
            ],
          },
        }
      );
      break;

    case 'set_long_break':
      bot.sendMessage(
        chatId,
        'Установи длительность длинного перерыва (мин):',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '15 мин', callback_data: 'long_15' }],
              [{ text: '30 мин', callback_data: 'long_30' }],
              [{ text: 'Свое значение...', callback_data: 'custom_long' }],
            ],
          },
        }
      );
      break;

    // Обработка выбора частоты напоминаний
    case 'reminder_0':
    case 'reminder_3':
    case 'reminder_5':
      const freq = parseInt(query.data.split('_')[1]);
      user.reminderFrequency = freq;
      bot.sendMessage(
        chatId,
        `Частота напоминаний установлена: ${formatTime(freq)}`
      );
      break;

    // Обработка выбора длительности работы
    case 'work_25':
    case 'work_30':
      const work = parseInt(query.data.split('_')[1]);
      user.workDuration = work;
      bot.sendMessage(chatId, `Длительность работы установлена: ${work} мин`);
      break;

    // Обработка выбора короткого перерыва
    case 'break_5':
    case 'break_10':
      const brk = parseInt(query.data.split('_')[1]);
      user.breakDuration = brk;
      bot.sendMessage(
        chatId,
        `Длительность короткого перерыва установлена: ${brk} мин`
      );
      break;

    // Обработка выбора длинного перерыва
    case 'long_15':
    case 'long_30':
      const long = parseInt(query.data.split('_')[1]);
      user.longBreakDuration = long;
      bot.sendMessage(
        chatId,
        `Длительность длинного перерыва установлена: ${long} мин`
      );
      break;

    // Запрос пользовательских значений
    case 'custom_reminder':
      bot.sendMessage(
        chatId,
        'Введите частоту напоминаний в минутах (от 1 до 25):'
      );
      user.waitingFor = 'reminder';
      break;

    case 'custom_work':
      bot.sendMessage(
        chatId,
        'Введите длительность работы в минутах (от 1 до 60):'
      );
      user.waitingFor = 'work';
      break;

    case 'custom_break':
      bot.sendMessage(
        chatId,
        'Введите длительность короткого перерыва в минутах (от 1 до 30):'
      );
      user.waitingFor = 'break';
      break;

    case 'custom_long':
      bot.sendMessage(
        chatId,
        'Введите длительность длинного перерыва в минутах (от 1 до 60):'
      );
      user.waitingFor = 'long';
      break;
  }

  userSettings[chatId] = user;
});

// Обработка пользовательского ввода
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const user = userSettings[chatId];
  const text = msg.text;

  if (user && user.waitingFor && /^\d+$/.test(text)) {
    const value = parseInt(text);
    let isValid = false;

    switch (user.waitingFor) {
      case 'reminder':
        if (value >= 1 && value <= 25) {
          user.reminderFrequency = value;
          isValid = true;
        }
        break;

      case 'work':
        if (value >= 1 && value <= 60) {
          user.workDuration = value;
          isValid = true;
        }
        break;

      case 'break':
        if (value >= 1 && value <= 30) {
          user.breakDuration = value;
          isValid = true;
        }
        break;

      case 'long':
        if (value >= 1 && value <= 60) {
          user.longBreakDuration = value;
          isValid = true;
        }
        break;
    }

    if (isValid) {
      bot.sendMessage(chatId, `Значение установлено: ${value} мин`);
    } else {
      bot.sendMessage(chatId, 'Недопустимое значение. Попробуйте снова.');
    }

    delete user.waitingFor;
    userSettings[chatId] = user;
  }
});

console.log('Бот Нелли запущен и готов к работе...');
