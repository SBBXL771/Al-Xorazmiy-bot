const fs = require('fs');
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
let startups;
try {
    const data = fs.readFileSync('data.json', 'utf8');
    startups = JSON.parse(data, (key, value) => {
        if (key === 'data' && value) return new Map(Object.entries(value));
        return value;
    });
} catch (error) {
    startups = {
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
    saveData();
}
function saveData() {
    const dataToSave = JSON.parse(JSON.stringify(startups, (key, value) => {
        if (value instanceof Map) {
            return Object.fromEntries(value);
        }
        return value;
    }));
    fs.writeFileSync('data.json', JSON.stringify(dataToSave, null, 2));
}
function isAdmin(chatId) {
    return chatId === ADMIN_CHAT_ID;
}
function sendErrorMessage(chatId, error) {
    bot.sendMessage(chatId, `❌ Xatolik yuz berdi: ${error.message || 'Nomalum xatolik'}. Iltimos, qayta urining.`);
}

app.post('/updateData', (req, res) => {
    const { id, date, newData } = req.body;
    const dateStr = new Date(date).toISOString().split('T')[0];
    if (startups[id]) {
        startups[id].data.set(dateStr, newData[0]);
        saveData();
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
    let changed = false;
    for (let id in startups) {
        const lastDate = Array.from(startups[id].data.keys()).sort((a, b) => new Date(a) - new Date(b)).pop();
        if (lastDate && lastDate < today) {
            const lastPrice = startups[id].data.get(lastDate) || 0;
            startups[id].data.set(today, lastPrice);
            changed = true;
        }
    }
    if (changed) saveData();
    setTimeout(updateDailyData, 24 * 60 * 60 * 1000);
}
updateDailyData();

bot.on('polling_error', (error) => {
    console.log('Polling xatosi:', error.code, error.message);
    if (error.code === 'ETELEGRAM') {
        setTimeout(() => bot.startPolling(), 10000);
    }
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (!userSessions.get(chatId)?.mode === "admin_mode") {
        userSessions.delete(chatId);
    }
    let response = "📋 Kerakli startupni tanlang (masalan 1   2 va hokozo):\n\n";
    for (let i = 1; i <= 10; i++) {
        response += `${i} ${startups[i].name}\n`;
    }
    bot.sendMessage(chatId, response).catch(err => sendErrorMessage(chatId, err));
    userSessions.set(chatId, { mode: "user_mode" });
});
bot.onText(/^\d+(,\d+)*$/, (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    const text = msg.text;

    if (session?.mode === "user_mode") {
        const startupIds = text.split(',').map(id => parseInt(id.trim())).filter(id => startups[id] && id >= 1 && id <= 10);
        if (startupIds.length === 0) {
            bot.sendMessage(chatId, "❌ Notogri raqam kiritdingiz! Iltimos, 1 dan 10 gacha bolgan raqamlarni kiriting.").catch(err => sendErrorMessage(chatId, err));
            return;
        }
        startupIds.forEach(startupId => {
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
            }).catch(err => sendErrorMessage(chatId, err));
        });
        userSessions.set(chatId, { startupIds, mode: "user_mode" });
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
        const recentDates = sortedDates.slice(-days).filter(date => !isNaN(Date.parse(date)));
        if (recentDates.length === 0) {
            bot.sendMessage(chatId, `⚠️ ${startup.name} uchun yetarli ma'lumot topilmadi.`).catch(err => sendErrorMessage(chatId, err));
            return;
        }
        const labels = recentDates.map(date => {
            const d = new Date(date);
            return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
        });
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
                scales: { y: { beginAtZero: false } }
            }
        };
        bot.sendMessage(chatId, `📈 **${startup.name} uchun ${period} kunlik diagrama:**\nMa'lumotlar: ${chartData.data.datasets[0].data.join(', ')}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Orqaga", callback_data: `back_${startupId}` }]
                ]
            }
        }).catch(err => sendErrorMessage(chatId, err));
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
        }).catch(err => sendErrorMessage(chatId, err));
    }
});
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, "❌ Sizda admin huquqi yoq!").catch(err => sendErrorMessage(chatId, err));
        return;
    }
    bot.sendMessage(chatId, "🔑 Iltimos, admin parolini kiriting:").catch(err => sendErrorMessage(chatId, err));
    userSessions.set(chatId, { mode: "awaiting_password" });
});
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    const text = msg.text;

    if (session?.mode === "awaiting_password") {
        if (text === ADMIN_PASSWORD) {
            bot.sendMessage(chatId, "📋 Boshlang'ich ma'lumotlarni yoki bugungi aksiyani kiritish uchun tanlang:\n11. Boshlang'ich ma'lumotlar kiritish\n12. Bugungi aksiya kiritish").catch(err => sendErrorMessage(chatId, err));
            userSessions.set(chatId, { mode: "admin_mode" });
        } else {
            bot.sendMessage(chatId, "❌ Notogri parol! Iltimos, qayta urining yoki /admin dan boshlab sinab koring.").catch(err => sendErrorMessage(chatId, err));
            userSessions.delete(chatId);
        }
    } else if (session?.mode === "admin_mode" && /^\d+$/.test(text) && (text === "11" || text === "12")) {
        const option = parseInt(text);
        let response = "📋 Qaysi startup(lar) uchun kiritmoqchisiz? (Masalan: 1,3,5 yoki bitta raqam 1-10 oraliqda):\n\n";
        for (let i = 1; i <= 10; i++) {
            response += `${i} ${startups[i].name}\n`;
        }
        bot.sendMessage(chatId, response).catch(err => sendErrorMessage(chatId, err));
        userSessions.set(chatId, { mode: option === 11 ? "admin_select_startup_initial" : "admin_select_startup_today" });
    } else if ((session?.mode === "admin_select_startup_initial" || session?.mode === "admin_select_startup_today") && /^\d+(,\d+)*$/.test(text)) {
        const startupIds = text.split(',').map(id => parseInt(id.trim())).filter(id => id >= 1 && id <= 10 && startups[id]);
        if (startupIds.length === 0) {
            bot.sendMessage(chatId, "❌ Notogri raqam kiritdingiz! Iltimos, 1 dan 10 gacha bolgan raqamlarni kiriting.").catch(err => sendErrorMessage(chatId, err));
            return;
        }
        userSessions.set(chatId, { mode: session.mode === "admin_select_startup_initial" ? "admin_set_initial" : "admin_add_today", startupIds });
        if (session.mode === "admin_select_startup_initial") {
            bot.sendMessage(chatId, `📅 Tanlangan startup(larni) uchun 7 kunlik boshlang'ich ma'lumotlarni kiriting (format: 'DD.MM.YYYY,price;DD.MM.YYYY,price', masalan: '11.07.2025,1.9;12.07.2025,1.8'):`).catch(err => sendErrorMessage(chatId, err));
        } else {
            const today = new Date().toISOString().split('T')[0];
            bot.sendMessage(chatId, `💰 Tanlangan startup(larni) uchun ${today} sanasi uchun aksiya narxini kiriting (har biriga alohida, masalan: '1:10,3:15,5:20'):`).catch(err => sendErrorMessage(chatId, err));
        }
    } else if (session?.mode === "admin_set_initial") {
        const dataPairs = text.split(';').map(pair => {
            const [dateStr, price] = pair.split(',');
            const [day, month, year] = dateStr.split('.');
            const date = new Date(`${year}-${month}-${day}`).toISOString().split('T')[0];
            return [date, parseFloat(price)];
        });
        if (dataPairs.every(([date, price]) => !isNaN(Date.parse(date)) && !isNaN(price))) {
            const startupIds = session.startupIds || [];
            startupIds.forEach(startupId => {
                dataPairs.forEach(([date, price]) => {
                    if (!startups[startupId].data.has(date)) {
                        startups[startupId].data.set(date, price);
                    }
                });
            });
            saveData();
            bot.sendMessage(chatId, `✅ Tanlangan startup(larni) uchun boshlang'ich ma'lumotlar muvaffaqiyatli saqlandi!`).catch(err => sendErrorMessage(chatId, err));
            userSessions.set(chatId, { mode: "admin_after_initial" });
        } else {
            bot.sendMessage(chatId, "❌ Notogri format! Iltimos, togri formatda kiriting.").catch(err => sendErrorMessage(chatId, err));
        }
    } else if (session?.mode === "admin_add_today") {
        const today = new Date().toISOString().split('T')[0];
        const startupIds = session.startupIds || [];
        const priceMap = text.split(',').reduce((acc, pair) => {
            const [idPrice, price] = pair.split(':');
            const id = parseInt(idPrice);
            if (startupIds.includes(id) && !isNaN(parseFloat(price))) {
                acc[id] = parseFloat(price);
            }
            return acc;
        }, {});
        let allValid = startupIds.every(id => priceMap[id] !== undefined);
        if (allValid) {
            startupIds.forEach(startupId => {
                startups[startupId].data.set(today, priceMap[startupId]);
            });
            saveData();
            const responses = startupIds.map(startupId => {
                const startup = startups[startupId];
                const currentPrice = startup.data.get(today) || 0;
                const avgPrice = Array.from(startup.data.values()).reduce((a, b) => a + b, 0) / startup.data.size || 0;
                const lastPrice = Array.from(startup.data.values()).pop() || 0;
                return `✅ ${startup.name} yangilandi!\nBugungi aksiya narxi: $${currentPrice.toFixed(2)}\nO'rtacha aksiya narxi: $${avgPrice.toFixed(2)}\n${startup.name} aksiya narxi: $${lastPrice.toFixed(2)}`;
            });
            const inlineKeyboard = [];
            for (let i = 0; i < startupIds.length; i += 2) {
                const row = [];
                if (startupIds[i]) {
                    row.push({ text: `${startups[startupIds[i]].name} (7 kunlik)`, callback_data: `chart_7_${startupIds[i]}` });
                    row.push({ text: `(30 kunlik)`, callback_data: `chart_30_${startupIds[i]}` });
                }
                if (startupIds[i + 1]) {
                    row.push({ text: `${startups[startupIds[i + 1]].name} (7 kunlik)`, callback_data: `chart_7_${startupIds[i + 1]}` });
                    row.push({ text: `(30 kunlik)`, callback_data: `chart_30_${startupIds[i + 1]}` });
                }
                if (row.length > 0) inlineKeyboard.push(row);
            }
            bot.sendMessage(chatId, `📊 ${responses.join('\n\n')}\n\n🔍 Diagrama tanlang:\n1. Istalgan sana uchun yangilash`, {
                reply_markup: { inline_keyboard: inlineKeyboard }
            }).catch(err => sendErrorMessage(chatId, err));
            userSessions.set(chatId, { mode: "admin_after_today" });
        } else {
            bot.sendMessage(chatId, "❌ Notogri format! Har bir startup uchun ID:price formatida kiriting (masalan: '1:10,3:15').").catch(err => sendErrorMessage(chatId, err));
        }
    } else if (session?.mode === "admin_after_today" && text === "1") {
        let response = "📋 Yangilamoqchi bolgan startup(larni) tanlang (masalan: 1,3,5):\n\n";
        for (let i = 1; i <= 10; i++) {
            response += `${i} ${startups[i].name}\n`;
        }
        bot.sendMessage(chatId, response).catch(err => sendErrorMessage(chatId, err));
        userSessions.set(chatId, { mode: "admin_update_select" });
    } else if (session?.mode === "admin_update_select" && /^\d+(,\d+)*$/.test(text)) {
        const startupIds = text.split(',').map(id => parseInt(id.trim())).filter(id => id >= 1 && id <= 10 && startups[id]);
        if (startupIds.length === 0) {
            bot.sendMessage(chatId, "❌ Notogri raqam kiritdingiz! Iltimos, 1 dan 10 gacha bolgan raqamlarni kiriting.").catch(err => sendErrorMessage(chatId, err));
            return;
        }
        userSessions.set(chatId, { mode: "admin_select_date", startupIds });
        bot.sendMessage(chatId, "📅 Iltimos, yangilamoqchi bolgan sanani kiriting (format: DD.MM.YYYY, masalan: 17.07.2025):").catch(err => sendErrorMessage(chatId, err));
    } else if (session?.mode === "admin_select_date" && /^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
        const [day, month, year] = text.split('.');
        const date = new Date(`${year}-${month}-${day}`).toISOString().split('T')[0];
        const startupIds = session.startupIds || [];
        if (!isNaN(Date.parse(date))) {
            userSessions.set(chatId, { mode: "admin_update_price", startupIds, date });
            bot.sendMessage(chatId, `💰 ${startupIds.map(id => startups[id].name).join(', ')} uchun ${text} sanasi uchun aksiya narxini kiriting (masalan: '1:10,3:15'):`).catch(err => sendErrorMessage(chatId, err));
        } else {
            bot.sendMessage(chatId, "❌ Notogri sana format! Iltimos, DD.MM.YYYY formatida kiriting.").catch(err => sendErrorMessage(chatId, err));
        }
    } else if (session?.mode === "admin_update_price" && /^(\d+:\d+(\.\d+)?)(,\d+:\d+(\.\d+)?)*$/.test(text)) {
        const startupIds = session.startupIds || [];
        const priceMap = text.split(',').reduce((acc, pair) => {
            const [id, price] = pair.split(':');
            const startupId = parseInt(id);
            if (startupIds.includes(startupId) && !isNaN(parseFloat(price))) {
                acc[startupId] = parseFloat(price);
            }
            return acc;
        }, {});
        let allValid = startupIds.every(id => priceMap[id] !== undefined);
        if (allValid) {
            startupIds.forEach(startupId => {
                startups[startupId].data.set(session.date, priceMap[startupId]);
            });
            saveData();
            const responses = startupIds.map(startupId => {
                const startup = startups[startupId];
                const currentPrice = startup.data.get(session.date) || 0;
                const avgPrice = Array.from(startup.data.values()).reduce((a, b) => a + b, 0) / startup.data.size || 0;
                const lastPrice = Array.from(startup.data.values()).pop() || 0;
                return `✅ ${startup.name} yangilandi!\n${session.date} sanasi aksiya narxi: $${currentPrice.toFixed(2)}\nO'rtacha aksiya narxi: $${avgPrice.toFixed(2)}\n${startup.name} aksiya narxi: $${lastPrice.toFixed(2)}`;
            });
            const inlineKeyboard = [];
            for (let i = 0; i < startupIds.length; i += 2) {
                const row = [];
                if (startupIds[i]) {
                    row.push({ text: `${startups[startupIds[i]].name} (7 kunlik)`, callback_data: `chart_7_${startupIds[i]}` });
                    row.push({ text: `(30 kunlik)`, callback_data: `chart_30_${startupIds[i]}` });
                }
                if (startupIds[i + 1]) {
                    row.push({ text: `${startups[startupIds[i + 1]].name} (7 kunlik)`, callback_data: `chart_7_${startupIds[i + 1]}` });
                    row.push({ text: `(30 kunlik)`, callback_data: `chart_30_${startupIds[i + 1]}` });
                }
                if (row.length > 0) inlineKeyboard.push(row);
            }
            bot.sendMessage(chatId, `📊 ${responses.join('\n\n')}\n\n🔍 Diagrama tanlang:`, {
                reply_markup: { inline_keyboard: inlineKeyboard }
            }).catch(err => sendErrorMessage(chatId, err));
            userSessions.set(chatId, {});
        } else {
            bot.sendMessage(chatId, "❌ Notogri format! Har bir startup uchun ID:price formatida kiriting (masalan: '1:10,3:15').").catch(err => sendErrorMessage(chatId, err));
        }
    }
});

app.listen(port, () => {
    console.log(`Server http://localhost:${port} da ishga tushdi`);
});