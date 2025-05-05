const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const pidusage = require('pidusage'); // Для мониторинга процессов

dotenv.config();

//#region Константы
// Хранилище данных пользователей с защитой от утечек
const userSessions = new Map();

// Массивы фраз
const phrases = {
  reminders: [
    'Как продвигается работа?',
    'Ты всё ещё в деле?',
    'Не отвлекаешься? Проверь себя!',
    'Прогресс есть?',
    'Время идёт, не расслабляйся!',
    'Фокус! Сколько сделал?',
    'Помни про таймер! Как успехи?',
    'Не забывай, что время идёт!',
    'Работа кипит?',
    'Сколько уже сделал за это время?',
    'Ну как там дела?',
    'Какой прогресс?',
    'В сроки уложимся?',
  ],
  breaks: [
    '🎉 Всё, давай за кофе, покурить и за работу! На всё про всё пара минут!',
    'Отлично поработал! Теперь пара минут отдыха.',
    'Перерыв! Пара минут и снова в бой.',
    'Пора сделать паузу на перекур.',
    'Отдых - важная часть работы! Несколько минут релакса.',
    'Время на душ и чай! Пара минут отдыха.',
    'Внимание! Немножко минут на чай и кофе. И за работу!',
    'Ты молодец! Немного минут отдыха.',
  ],
  longBreaks: [
    'Ты молодец! 4 помидора позади - отдыхай большой перерыв!',
    'Отличная работа! Заработал длинный перерыв на покушать и погулять.',
    '4 цикла завершены! Расслабься, впереди большой отдых.',
    'Заслужил длинный перерыв! Отдохни хорошенечко и снова в бой.',
    'Ты молодец! Приятного аппетита, если на обед.',
  ],
  workStarts: [
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
  ],
};

// Клавиатуры
const keyboards = {
  settings: {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Частота напоминаний ⏰',
            callback_data: 'set_reminder_freq',
          },
        ],
        [
          {
            text: 'Длительность работы 🕒',
            callback_data: 'set_work_duration',
          },
        ],
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
  },
  start: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 За работу!', callback_data: 'start_pomodoro' }],
        [
          {
            text: '⚙️ Пересмотр условий труда',
            callback_data: 'open_settings',
          },
        ],
      ],
    },
  },
};

//#endregion

//#region Утилиты
// Утилиты
function getRandomPhrase(type) {
  const phraseList = phrases[type] || [];
  return phraseList[Math.floor(Math.random() * phraseList.length)] || '';
}

function formatTime(minutes) {
  return minutes > 0 ? `${minutes} мин` : 'не напоминать';
}

function getDefaultSettings() {
  return {
    reminderFrequency: 3,
    workDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    pomodoroCount: 0,
    activeTimers: {},
  };
}

function getReminderRow(reminderFrequency) {
  if (reminderFrequency > 0) {
    return `- А я тебе помогаю отслеживать эти моменты и напоминаю каждые ${formatTime(
      reminderFrequency
    )} 🙋‍♀️`;
  } else {
    return `А я не отсвечиваю, пока не придет пора пить чай ☕`;
  }
}

// Управление таймерами
function clearUserTimers(user) {
  if (user.activeTimers) {
    Object.values(user.activeTimers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    user.activeTimers = {};
  }
}

//#endregion

//#region Конфигурация бота
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Токен бота не найден! Проверьте .env файл');
  process.exit(1);
}

// Конфигурация с защитой от конфликтов
const botConfig = {
  polling: {
    interval: 300,
    timeout: 10,
    autoStart: false, // Важно: отключаем автостарт
  },
  request: {
    timeout: 15000,
  },
};

const bot = new TelegramBot(token, botConfig);

// Блокировка для предотвращения дублирования
let isPollingActive = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;

// Улучшенный обработчик ошибок
bot.on('polling_error', async (error) => {
  console.error(`Polling error (${error.code}):`, error.message);

  if (error.code === 409) {
    // Конфликт polling
    console.log('Обнаружен конфликт polling...');
    await killDuplicateProcesses();
  }

  if (restartAttempts < MAX_RESTART_ATTEMPTS) {
    restartAttempts++;
    const delay = Math.min(5000 * restartAttempts, 30000);
    console.log(`Попытка перезапуска через ${delay / 1000} сек...`);

    setTimeout(async () => {
      await safeStartPolling();
    }, delay);
  } else {
    console.error('Достигнуто максимальное количество попыток перезапуска');
  }
});

// Безопасный запуск polling
async function safeStartPolling() {
  if (isPollingActive) {
    console.log('Polling уже активен, пропускаем запуск');
    return;
  }

  try {
    console.log('Запускаем polling...');
    await bot.stopPolling(); // На всякий случай останавливаем предыдущий
    isPollingActive = true;
    await bot.startPolling();
    restartAttempts = 0;
    console.log('Polling успешно запущен');
  } catch (error) {
    isPollingActive = false;
    console.error('Ошибка запуска polling:', error.message);
  }
}

// Поиск и завершение дублирующихся процессов
async function killDuplicateProcesses() {
  try {
    const stats = await pidusage(process.pid);
    const command = `ps aux | grep "node" | grep "bot.js" | grep -v "grep" | grep -v "${stats.pid}" | awk '{print $2}'`;

    const { exec } = require('child_process');
    exec(command, (err, stdout) => {
      if (err) return;

      const pids = stdout.trim().split('\n').filter(Boolean);
      if (pids.length > 0) {
        console.log(`Найдены дублирующиеся процессы: ${pids.join(', ')}`);
        pids.forEach((pid) => {
          process.kill(pid, 'SIGTERM');
          console.log(`Процесс ${pid} завершен`);
        });
      }
    });
  } catch (error) {
    console.error('Ошибка поиска дубликатов:', error);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('Завершение работы бота...');
  isPollingActive = false;

  try {
    await bot.stopPolling();
    console.log('Polling остановлен');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при завершении:', error);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Проверка перед запуском
async function initialize() {
  try {
    await killDuplicateProcesses();
    await safeStartPolling();

    // Здесь инициализация обработчиков команд
    initHandlers();

    console.log('Бот успешно инициализирован');
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    process.exit(1);
  }
}

// Запуск
initialize().catch((error) => {
  console.error('Фатальная ошибка:', error);
  process.exit(1);
});

//#endregion

//#region Команды и обработчики
// Инициализация обработчиков (ваш существующий код)
function initHandlers() {
  // Сюда переносите все ваши обработчики команд:
  // bot.onText, bot.on('callback_query') и т.д.

  // Устанавливаем команды меню
  bot
    .setMyCommands([
      { command: 'start', description: 'Подписать трудовой договор' },
      { command: 'hello', description: 'Взять таску в работу' },
      { command: 'stop', description: 'Остановить работу над таской' },
      { command: 'settings', description: 'Пересмотр условий труда' },
    ])
    .catch((error) => console.error('Ошибка установки команд:', error));

  async function showWelcomeMessage(chatId) {
    let user = userSessions.get(chatId);
    if (!user) {
      user = getDefaultSettings();
      userSessions.set(chatId, user);
    }
    try {
      const welcomeMessage =
        `👋 *Привет! Я Нелли - твой персональный менеджер проекта!*\n\n` +
        `Сейчас у нас с тобой такие договоренности:\n` +
        `- Сперва работаешь ${user.workDuration} мин 👩‍💻\n` +
        `- Потом устраиваешь короткий перерыв: ${user.breakDuration} мин ☕\n` +
        `- После 4-х подходов - идёшь на обед на ${user.longBreakDuration} мин  🏖️\n` +
        `${getReminderRow(user.reminderFrequency)}\n\n` +
        `Нажми /hello чтобы начать или /settings для настроек`;

      await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        ...keyboards.start,
      });
    } catch (error) {
      console.error('Ошибка приветствия:', error);
    }
  }

  // Основная логика Pomodoro
  async function startPomodoroSession(chatId) {
    let user = userSessions.get(chatId);
    if (!user) {
      user = getDefaultSettings();
      userSessions.set(chatId, user);
    }

    clearUserTimers(user);

    user.pomodoroCount++;
    const isLongBreak = user.pomodoroCount % 4 === 0;
    const breakDuration = isLongBreak
      ? user.longBreakDuration
      : user.breakDuration;

    try {
      await bot.sendMessage(
        chatId,
        `🍅 Поехали! Работаем ${user.workDuration} минут!` +
          (isLongBreak ? '\nПосле этого будет длинный перерыв!' : '')
      );

      // Таймер напоминаний
      if (user.reminderFrequency > 0) {
        user.activeTimers.checkTimer = setInterval(() => {
          bot
            .sendMessage(chatId, getRandomPhrase('reminders'))
            .catch((error) =>
              console.error('Ошибка отправки напоминания:', error)
            );
        }, user.reminderFrequency * 60 * 1000);
      }

      // Таймер окончания работы
      user.activeTimers.workTimer = setTimeout(async () => {
        clearInterval(user.activeTimers.checkTimer);

        const breakMessage = isLongBreak
          ? getRandomPhrase('longBreaks')
          : getRandomPhrase('breaks');

        await bot.sendMessage(chatId, breakMessage);

        // Таймер окончания перерыва
        user.activeTimers.restTimer = setTimeout(() => {
          bot
            .sendMessage(chatId, getRandomPhrase('workStarts'))
            .then(() => startPomodoroSession(chatId))
            .catch((error) => console.error('Ошибка запуска сессии:', error));
        }, breakDuration * 60 * 1000);
      }, user.workDuration * 60 * 1000);

      userSessions.set(chatId, user);
    } catch (error) {
      console.error('Ошибка запуска таймера:', error);
      bot.sendMessage(chatId, 'Что-то пошло не так. Попробуйте ещё раз.');
    }
  }

  // Команды бота
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await showWelcomeMessage(chatId);
  });

  bot.onText(/\/hello/, (msg) => {
    startPomodoroSession(msg.chat.id);
  });

  bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const user = userSessions.get(chatId);

    if (user) {
      clearUserTimers(user);
      await bot.sendMessage(
        chatId,
        'Ого, я гляжу, уже всё готово! Отлично, когда приступишь к следующей таске, напиши мне /hello'
      );
    } else {
      await bot.sendMessage(
        chatId,
        'У тебя нет активных задач. Нажми /hello чтобы начать новую сессию.'
      );
    }
  });

  bot.onText(/\/settings/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      'Пересмотр условий труда:',
      keyboards.settings
    );
  });

  // Обработчики inline-кнопок
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    let user = userSessions.get(chatId) || getDefaultSettings();

    try {
      switch (query.data) {
        case 'start_pomodoro':
          await bot.answerCallbackQuery(query.id);
          return startPomodoroSession(chatId);

        case 'open_settings':
          await bot.answerCallbackQuery(query.id);
          return bot.sendMessage(
            chatId,
            'Пересмотр условий труда:',
            keyboards.settings
          );

        case 'set_reminder_freq':
          bot.sendMessage(chatId, 'Выбери частоту напоминаний:', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Не напоминать', callback_data: 'reminder_0' }],
                [{ text: 'Каждые 3 минуты', callback_data: 'reminder_3' }],
                [{ text: 'Каждые 5 минут', callback_data: 'reminder_5' }],
                [
                  {
                    text: 'Свое значение...',
                    callback_data: 'custom_reminder',
                  },
                ],
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
          userSessions.set(chatId, user);
          await bot.answerCallbackQuery(query.id, {
            text: `Частота напоминаний: ${formatTime(freq)}`,
          });
          return showCurrentSettings(chatId);

        // Обработка выбора длительности работы
        case 'work_25':
        case 'work_30':
          const work = parseInt(query.data.split('_')[1]);
          user.workDuration = work;
          userSessions.set(chatId, user);
          await bot.answerCallbackQuery(query.id, {
            text: `Длительность работы установлена: ${work} мин`,
          });
          return showCurrentSettings(chatId);

        // Обработка выбора короткого перерыва
        case 'break_5':
        case 'break_10':
          const brk = parseInt(query.data.split('_')[1]);
          user.breakDuration = brk;
          userSessions.set(chatId, user);
          await bot.answerCallbackQuery(query.id, {
            text: `Длительность короткого перерыва установлена: ${brk} мин`,
          });
          return showCurrentSettings(chatId);

        // Обработка выбора длинного перерыва
        case 'long_15':
        case 'long_30':
          const long = parseInt(query.data.split('_')[1]);
          user.longBreakDuration = long;
          userSessions.set(chatId, user);
          await bot.answerCallbackQuery(query.id, {
            text: `Длительность длинного перерыва установлена: ${long} мин`,
          });
          return showCurrentSettings(chatId);

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

        case 'back_to_menu':
          return showMainMenu(chatId);
      }

      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error('Ошибка обработки callback:', error);
    }
  });

  // Показ текущих настроек с кнопкой возврата
  async function showCurrentSettings(chatId) {
    const user = userSessions.get(chatId) || getDefaultSettings();

    const settingsMessage =
      `⚙️ *Текущие настройки:*\n\n` +
      `🍅 Работа: ${user.workDuration} мин\n` +
      `☕ Короткий перерыв: ${user.breakDuration} мин\n` +
      `🏖️ Длинный перерыв: ${user.longBreakDuration} мин\n` +
      `🔔 Напоминания: ${formatTime(user.reminderFrequency)}`;

    await bot.sendMessage(chatId, settingsMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚙️ Изменить настройки', callback_data: 'open_settings' }],
          [{ text: '🏠 В главное меню', callback_data: 'back_to_menu' }],
        ],
      },
    });
  }

  // Показ главного меню
  async function showMainMenu(chatId) {
    await showWelcomeMessage(chatId);
  }
}
//#endregion
