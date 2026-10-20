const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// НАСТРОЙКИ АДМИНКИ
// =========================================================================
const ADMIN_LOGIN = 'adminZaVozi';
const ADMIN_PASSWORD = 'nWnFhvfu6sQvWCQRkLFpt';
const SESSION_TTL = 60 * 60 * 1000; // 1 час

// Хранилище сессий в памяти: Map<token, { expiresAt }>
const sessions = new Map();

// =========================================================================
// МИДЛВАЕРЫ
// =========================================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Простой парсер cookies
app.use((req, res, next) => {
    req.cookies = {};
    const header = req.headers.cookie;
    if (header) {
        header.split(';').forEach(part => {
            const [k, ...v] = part.trim().split('=');
            if (k) req.cookies[k] = decodeURIComponent(v.join('='));
        });
    }
    next();
});

// Защита от спама для формы бронирования
const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Слишком много заявок. Попробуйте позже.' }
});

// Защита от брутфорса логина: 5 попыток за 15 минут
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Слишком много попыток входа. Подождите 15 минут.' }
});

// Проверка сессии для защищённых роутов
function requireAuth(req, res, next) {
    const token = req.cookies.sid;
    const session = token && sessions.get(token);

    if (!session || session.expiresAt < Date.now()) {
        if (token) sessions.delete(token);
        return res.status(401).json({ success: false, error: 'Не авторизован' });
    }
    req.session = session;
    next();
}

// =========================================================================
// БАЗА ДАННЫХ
// =========================================================================
const db = new sqlite3.Database('./bookings.db', (err) => {
    if (err) console.error('Ошибка подключения к БД:', err.message);
    else console.log('Подключено к базе данных SQLite (bookings.db).');
});

db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff TEXT NOT NULL,
    route_from TEXT NOT NULL,
    route_to TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// =========================================================================
// АУТЕНТИФИКАЦИЯ
// =========================================================================

// Логин
app.post('/api/admin/login', loginLimiter, (req, res) => {
    const { login, password } = req.body || {};

    if (login !== ADMIN_LOGIN || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
    }

    // Генерируем токен сессии
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { expiresAt: Date.now() + SESSION_TTL, login });

    // HttpOnly cookie — недоступна из JS, защита от XSS-кражи
    res.setHeader(
        'Set-Cookie',
        `sid=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL / 1000}; SameSite=Strict`
    );

    res.json({ success: true, message: 'Вход выполнен' });
});

// Выход
app.post('/api/admin/logout', (req, res) => {
    const token = req.cookies.sid;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
    res.json({ success: true });
});

// Проверка, что сессия жива (используется фронтом при загрузке страницы)
app.get('/api/admin/me', requireAuth, (req, res) => {
    res.json({ success: true, login: req.session.login });
});

// =========================================================================
// API ЗАЯВОК (публичное создание + защищённое управление)
// =========================================================================

// Создание заявки — публичный роут (с сайта)
app.post('/api/booking', bookingLimiter, (req, res) => {
    const { tariff, from, to, date, time, phone } = req.body || {};

    if (!from || !to || !date || !time || !phone) {
        return res.status(400).json({ success: false, error: 'Все поля обязательны' });
    }

    const phoneClean = String(phone).replace(/[^\d+]/g, '');
    if (!/^\+?\d{10,15}$/.test(phoneClean)) {
        return res.status(400).json({ success: false, error: 'Некорректный телефон' });
    }

    const bookingDate = new Date(`${date}T${time || '00:00'}`);
    if (isNaN(bookingDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Некорректная дата/время' });
    }
    if (bookingDate < new Date()) {
        return res.status(400).json({ success: false, error: 'Дата и время уже прошли' });
    }

    const allowedTariffs = ['airport', 'city', 'intercity'];
    const safeTariff = allowedTariffs.includes(tariff) ? tariff : 'airport';

    const sql = `INSERT INTO bookings (tariff, route_from, route_to, date, time, phone)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [safeTariff, from, to, date, time, phoneClean];

    db.run(sql, params, function (err) {
        if (err) {
            console.error('Ошибка записи в БД:', err.message);
            return res.status(500).json({ success: false, error: 'Ошибка базы данных' });
        }
        console.log(`[Заявка #${this.lastID}] ${safeTariff} | ${from} → ${to} | ${date} ${time}`);
        res.status(201).json({ success: true, message: 'Заявка успешно сохранена!', bookingId: this.lastID });
    });
});

// Список всех заявок — только для админа
app.get('/api/bookings', requireAuth, (req, res) => {
    db.all(`SELECT * FROM bookings ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, count: rows.length, data: rows });
    });
});

// Одна заявка
app.get('/api/bookings/:id', requireAuth, (req, res) => {
    db.get(`SELECT * FROM bookings WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!row) return res.status(404).json({ success: false, error: 'Заявка не найдена' });
        res.json({ success: true, data: row });
    });
});

// Смена статуса
app.patch('/api/bookings/:id/status', requireAuth, (req, res) => {
    const { status } = req.body || {};
    const allowed = ['new', 'confirmed', 'done', 'cancelled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: 'Недопустимый статус' });
    }

    db.run(`UPDATE bookings SET status = ? WHERE id = ?`, [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (this.changes === 0) return res.status(404).json({ success: false, error: 'Заявка не найдена' });
        res.json({ success: true, message: 'Статус обновлён' });
    });
});

// Удаление
app.delete('/api/bookings/:id', requireAuth, (req, res) => {
    db.run(`DELETE FROM bookings WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (this.changes === 0) return res.status(404).json({ success: false, error: 'Заявка не найдена' });
        res.json({ success: true, message: 'Заявка удалена' });
    });
});

// Health-check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// =========================================================================
// СТРАНИЦА /admin — отдаём admin.html
// =========================================================================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// =========================================================================
// ЗАПУСК
// =========================================================================
app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(`Админка:        http://localhost:${PORT}/admin`);
});