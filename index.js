require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

app.use(express.static('public'));
app.use(express.json());

const userSessions = new Map();

const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID) || 0;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

let startups = {
    1: { name: "AL Xorazmiy", pm: "Afro'z", data: new Map() },
    2: { name: "AgronomAI", pm: "Amirxon", data: new Map() },
    3: { name: "BiznesAI", pm: "Azamat", data: new Map() },
    4: { name: "Logistica AI", pm: "Azamat", data: new Map() },
    5: { name: "Do'kon", pm: "Shamsiddin", data: new Map() },
    6: { name: "Orzu-Lab", pm: "Zaynabbegim", data: new Map() },
    7: { name: "Beauty app", pm: "Zaynabbegim", data: new Map() },
    8: { name: "VetPro", pm: "Xurshid", data: new Map() },
    9: { name: "NetSecureAI", pm: "Suhrob", data: new Map() },
    10: { name: "Ko'chat Bozor", pm: "Diyorbek", data: new Map() }
};

function isAdmin(chatId) {
    return chatId === ADMIN_CHAT_ID;
}

app.post('/updateData', (req, res) => {
    const { id, date, newData } = req.body;
    const dateStr = new Date(date).toISOString().split('T')[0];
    if (startups[id]) {
        startups[id].data.set(dateStr, newData[0]);
        res.json({ success: true, message: `Startup ${id} uchun ${date} kuni yangilandi` });
    } else {
        res.status(404).json({ success: false, message: "Startup topilmadi" });
    }
});

app.get('/getData', (req, res) => {
    const result = {};
    for (let id in startups) {
        result[id] = {
            name: startups[id].name,
            pm: startups[id].pm,
            data: Array.from(startups[id].data.entries()).map(([date, price]) => ({ date, price }))
        };
    }
    res.json(result);
});

function updateDailyData() {
    const today = new Date().toISOString().split('T')[0];
    for (let id in startups) {
        const lastDate = Array.from(startups[id].data.keys()).sort((a, b) => new Date(a) - new Date(b)).pop();
        if (lastDate && lastDate < today) {
            const lastPrice = startups[id].data.get(lastDate) || 0;
            startups[id].data.set(today, lastPrice);
        }
    }
    setTimeout(updateDailyData, 24 * 60 * 60 * 1000);
}
updateDailyData();

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    let response = "📋 Kerakli startupni tanlang:\n\n";
    for (let i = 1; i <= 10; i++) {
        response += `${i} ${startups[i].name}\n`;
    }
    bot.sendMessage(chatId, response);
    userSessions.set(chatId, { mode: "user_mode" });
});

bot.onText(/^\d+$/, (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);

    if (session?.mode === "user_mode" && startups[parseInt(msg.text)]) {
        const startupId = parseInt(msg.text);
        const startup = startups[startupId];
        const today = new Date().toISOString().split('T')[0];
        const currentPrice = startup.data.get(today) || 0;
        const avgPrice = Array.from(startup.data.values()).reduce((a, b) => a + b, 0) / startup.data.size || 0;
        const lastPrice = Array.from(startup.data.values()).pop() || 0;
        let response = `Startup Nomi: ${startup.name}\nPM ismi: ${startup.pm}\nBugungi aksiya narxi: $${currentPrice.toFixed(2)}\nO'rtacha aksiya narxi: $${avgPrice.toFixed(2)}\n${startup.name} aksiya narxi: $${lastPrice.toFixed(2)}\n\n🔍 Diagrama tanlang:`;
        bot.sendMessage(chatId, response, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "7 kunlik", callback_data: `chart_7_${startupId}` }],
                    [{ text: "30 kunlik", callback_data: `chart_30_${startupId}` }]
                ]
            }
        });
        userSessions.set(chatId, { startupId, mode: "user_mode" });
    }
});

bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data.split('_');
    const period = data[1];
    const startupId = parseInt(data[2]);
    const startup = startups[startupId];

    if (data[0] === "chart") {
        const days = period === '7' ? 7 : 30;
        const sortedDates = Array.from(startup.data.keys()).sort((a, b) => new Date(a) - new Date(b));
        const recentDates = sortedDates.slice(-days);
        const labels = recentDates.map(date => new Date(date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }));
        const chartData = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Aksiya narxi ($)',
                    data: recentDates.map(date => startup.data.get(date) || 0),
                    borderColor: '#36A2EB',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: false }
                }
            }
        };
        bot.sendMessage(chatId, `📈 **${startup.name} uchun ${period} kunlik diagrama:**\nMa'lumotlar: ${chartData.data.datasets[0].data.join(', ')}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Orqaga", callback_data: `back_${startupId}` }]
                ]
            }
        });
        userSessions.set(chatId, { startupId, mode: "user_mode" });
    } else if (data[0] === "back") {
        const startupId = parseInt(data[1]);
        const startup = startups[startupId];
        const today = new Date().toISOString().split('T')[0];
        const currentPrice = startup.data.get(today) || 0;
        const avgPrice = Array.from(startup.data.values()).reduce((a, b) => a + b, 0) / startup.data.size || 0;
        const lastPrice = Array.from(startup.data.values()).pop() || 0;
        let response = `Startup Nomi: ${startup.name}\nPM ismi: ${startup.pm}\nBugungi aksiya narxi: $${currentPrice.toFixed(2)}\nO'rtacha aksiya narxi: $${avgPrice.toFixed(2)}\n${startup.name} aksiya narxi: $${lastPrice.toFixed(2)}\n\n🔍 Diagrama tanlang:`;
        bot.sendMessage(chatId, response, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "7 kunlik", callback_data: `chart_7_${startupId}` }],
                    [{ text: "30 kunlik", callback_data: `chart_30_${startupId}` }]
                ]
            }
        });
    }
});

bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, "❌ Sizda admin huquqi yoq!");
        return;
    }
    bot.sendMessage(chatId, "🔑 Iltimos, admin parolini kiriting:");
    userSessions.set(chatId, { mode: "awaiting_password" });
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    const text = msg.text;

    if (session?.mode === "awaiting_password") {
        if (text === ADMIN_PASSWORD) {
            bot.sendMessage(chatId, "📋 Boshlang'ich ma'lumotlarni yoki bugungi aksiyani kiritish uchun tanlang:\n1. Boshlang'ich ma'lumotlar kiritish\n2. Bugungi aksiya kiritish");
            userSessions.set(chatId, { mode: "admin_mode" });
        } else {
            bot.sendMessage(chatId, "❌ Noto'g'ri parol! Iltimos, qayta urining yoki /admin dan boshlab sinab ko'ring.");
            userSessions.delete(chatId);
        }
    } else if (session?.mode === "admin_mode" && /^\d+$/.test(text) && (text === "1" || text === "2")) {
        const option = parseInt(text);
        let response = "📋 Qaysi startup uchun kiritmoqchisiz?\n\n";
        for (let i = 1; i <= 10; i++) {
            response += `${i} ${startups[i].name}\n`;
        }
        bot.sendMessage(chatId, response);
        userSessions.set(chatId, { mode: option === 1 ? "admin_select_startup_initial" : "admin_select_startup_today" });
    } else if (session?.mode === "admin_select_startup_initial" && /^\d+$/.test(text)) {
        const startupId = parseInt(text);
        if (startups[startupId]) {
            bot.sendMessage(chatId, `📅 ${startups[startupId].name} uchun 7 kunlik boshlang'ich ma'lumotlarni kiriting (format: 'DD.MM.YYYY,price;DD.MM.YYYY,price', masalan: '11.07.2025,1.9;12.07.2025,1.8'):`);
            userSessions.set(chatId, { mode: "admin_set_initial", startupId });
        } else {
            bot.sendMessage(chatId, "Notogri raqam 1 dan 10 gacha raqam kiriting");
        }
    } else if (session?.mode === "admin_set_initial") {
        const dataPairs = text.split(';').map(pair => {
            const [dateStr, price] = pair.split(',');
            const [day, month, year] = dateStr.split('.');
            const date = new Date(`${year}-${month}-${day}`).toISOString().split('T')[0];
            return [date, parseFloat(price)];
        });
        if (dataPairs.every(([date, price]) => !isNaN(Date.parse(date)) && !isNaN(price))) {
            const startupId = session.startupId;
            dataPairs.forEach(([date, price]) => {
                startups[startupId].data.set(date, price);
            });
            bot.sendMessage(chatId, `✅ ${startups[startupId].name} uchun boshlang'ich ma'lumotlar muvaffaqiyatli saqlandi!`);
            userSessions.set(chatId, { mode: "admin_after_initial", startupId });
        } else {
            bot.sendMessage(chatId, "❌ Noto'g'ri format! Iltimos, to'g'ri formatda kiriting.");
        }
    } else if (session?.mode === "admin_select_startup_today" && /^\d+$/.test(text)) {
        const startupId = parseInt(text);
        if (startups[startupId]) {
            const today = new Date().toISOString().split('T')[0];
            bot.sendMessage(chatId, `💰 ${startups[startupId].name} uchun ${today} sanasi uchun aksiya narxini kiriting (Hozirgi: $${startups[startupId].data.get(today) || 0}):`);
            userSessions.set(chatId, { mode: "admin_add_today", startupId });
        } else {
            bot.sendMessage(chatId, "Notogri raqam 1 dan 10 gacha raqam kiriting");
        }
    } else if (session?.mode === "admin_add_today" && !isNaN(parseFloat(text))) {
        const startupId = session.startupId;
        const today = new Date().toISOString().split('T')[0];
        const newPrice = parseFloat(text);
        const startup = startups[startupId];
        startup.data.set(today, newPrice);
        const currentPrice = startup.data.get(today) || 0;
        const avgPrice = Array.from(startup.data.values()).reduce((a, b) => a + b, 0) / startup.data.size || 0;
        const lastPrice = Array.from(startup.data.values()).pop() || 0;
        let response = `✅ Yangilandi!\nStartup Nomi: ${startup.name}\nPM ismi: ${startup.pm}\nBugungi aksiya narxi: $${currentPrice.toFixed(2)}\nO'rtacha aksiya narxi: $${avgPrice.toFixed(2)}\n${startup.name} aksiya narxi: $${lastPrice.toFixed(2)}\n\n🔍 Diagrama tanlang:\n1. Istalgan sana uchun yangilash`;
        bot.sendMessage(chatId, response, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "7 kunlik", callback_data: `chart_7_${startupId}` }],
                    [{ text: "30 kunlik", callback_data: `chart_30_${startupId}` }]
                ]
            }
        });
        userSessions.set(chatId, { mode: "admin_after_today", startupId });
    } else if (session?.mode === "admin_after_today" && text === "1") {
        let response = "📋 Yangilamoqchi bo'lgan startupni tanlang:\n\n";
        for (let i = 1; i <= 10; i++) {
            response += `${i} ${startups[i].name}\n`;
        }
        bot.sendMessage(chatId, response);
        userSessions.set(chatId, { mode: "admin_update_select" });
    } else if (session?.mode === "admin_update_select" && /^\d+$/.test(text)) {
        const startupId = parseInt(text);
        if (startups[startupId]) {
            bot.sendMessage(chatId, "📅 Iltimos, yangilamoqchi bo'lgan sanani kiriting (format: DD.MM.YYYY, masalan: 17.07.2025):");
            userSessions.set(chatId, { mode: "admin_select_date", startupId });
        } else {
            bot.sendMessage(chatId, "Notogri raqam 1 dan 10 gacha raqam kiriting");
        }
    } else if (session?.mode === "admin_select_date" && /^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
        const [day, month, year] = text.split('.');
        const date = new Date(`${year}-${month}-${day}`).toISOString().split('T')[0];
        const startupId = session.startupId;
        if (!isNaN(Date.parse(date))) {
            bot.sendMessage(chatId, `💰 ${text} uchun aksiya narxini kiriting (Hozirgi: $${startups[startupId].data.get(date) || 0}):`);
            userSessions.set(chatId, { mode: "admin_update_price", startupId, date });
        } else {
            bot.sendMessage(chatId, "❌ Noto'g'ri sana format! Iltimos, DD.MM.YYYY formatida kiriting.");
        }
    } else if (session?.mode === "admin_update_price" && !isNaN(parseFloat(text))) {
        const startupId = session.startupId;
        const date = session.date;
        const newPrice = parseFloat(text);
        const startup = startups[startupId];
        startup.data.set(date, newPrice);
        const today = new Date().toISOString().split('T')[0];
        const currentPrice = startup.data.get(today) || 0;
        const avgPrice = Array.from(startup.data.values()).reduce((a, b) => a + b, 0) / startup.data.size || 0;
        const lastPrice = Array.from(startup.data.values()).pop() || 0;
        let response = `✅ Yangilandi!\nStartup Nomi: ${startup.name}\nPM ismi: ${startup.pm}\nBugungi aksiya narxi: $${currentPrice.toFixed(2)}\nO'rtacha aksiya narxi: $${avgPrice.toFixed(2)}\n${startup.name} aksiya narxi: $${lastPrice.toFixed(2)}\n\n🔍 Diagrama tanlang:`;
        bot.sendMessage(chatId, response, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "7 kunlik", callback_data: `chart_7_${startupId}` }],
                    [{ text: "30 kunlik", callback_data: `chart_30_${startupId}` }]
                ]
            }
        });
        userSessions.set(chatId, {});
    }
});

// Veb-server
app.listen(port, () => {
    console.log(`Server http://localhost:${port} da ishga tushdi`);
});