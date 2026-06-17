const https = require('https');
const { User } = require('../models');

const BOOSTER_DISCORD_IDS = {
  'wm': '762259347430047745',
  'levieen': '557194027632558080',
  'cwrss': '335659090418073603',
  'f4ld3x': '463607826703450122',
  'aybo': '611921148007153686'
};

function getBoosterMention(boosterName) {
  if (!boosterName) return '';
  const key = boosterName.toLowerCase().trim();
  const discordId = BOOSTER_DISCORD_IDS[key];
  return discordId ? `<@${discordId}>` : boosterName;
}

/**
 * Sends a POST request to Discord Webhook with JSON payload.
 */
function sendDiscordWebhook(payload) {
  return new Promise((resolve, reject) => {
    const webhookUrl = process.env.ELOBOOST_DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1516781047482814516/702wbmGXDHa82gGu2Z5t81OIGn9yeHT5ejRV4rk_x2Kz-x0vqYM-X7pgoHS9yPAciR1P';
    
    if (!webhookUrl) {
      return resolve(false);
    }

    try {
      const url = new URL(webhookUrl);
      if (!url.searchParams.has('with_components')) {
        url.searchParams.set('with_components', 'true');
      }
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
      });
      
      req.on('error', (e) => {
        console.error('Elo Boost Discord webhook request error:', e);
        resolve(false);
      });
      
      req.write(data);
      req.end();
    } catch (err) {
      console.error('Elo Boost Discord webhook setup error:', err);
      resolve(false);
    }
  });
}

function translateStatus(status) {
  const mapping = {
    'pending': '⏳ Beklemede',
    'processing': '⚔️ Devam Ediyor',
    'completed': '✅ Tamamlandı',
    'canceled': '❌ İptal Edildi'
  };
  return mapping[status] || status;
}

/**
 * Notifies Discord channel when a new Elo Boost order is created.
 */
async function notifyNewOrder(order) {
  let boosterName = null;
  if (order.booster_id) {
    try {
      const booster = await User.findByPk(order.booster_id);
      if (booster) boosterName = booster.username;
    } catch (err) {
      console.error('Failed to fetch booster for discord notification:', err);
    }
  }

  const fields = [
    { name: 'Sipariş ID', value: `#${order.id}`, inline: true },
    { name: 'Riot ID', value: order.customer_riot_id, inline: true },
    { name: 'Başlangıç Rankı', value: order.start_rank, inline: true },
    { name: 'Hedef Rankı', value: order.target_rank, inline: true },
    { name: 'Sipariş Durumu', value: translateStatus(order.status), inline: true }
  ];

  if (boosterName) {
    fields.push({ name: 'Atanan Booster', value: boosterName, inline: true });
  }

  fields.push({
    name: '🔗 İşlem Paneli',
    value: `[Sipariş Detaylarını Görüntüle](https://kodteslimal.com/booster/dashboard?order_id=${order.id})`,
    inline: false
  });

  const embed = {
    title: '🆕 Yeni Elo Boost Siparişi Alındı! 🎮',
    color: 3447003, // Bright Blue
    timestamp: new Date().toISOString(),
    footer: {
      text: 'kodteslimal.com Elo Boost'
    },
    fields: fields
  };

  const payload = { 
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Sipariş Detaylarını Görüntüle',
            url: `https://kodteslimal.com/booster/dashboard?order_id=${order.id}`
          }
        ]
      }
    ]
  };
  if (boosterName) {
    const mention = getBoosterMention(boosterName);
    if (mention) {
      payload.content = `🔔 Atanan Booster: ${mention}`;
    }
  }

  return sendDiscordWebhook(payload);
}

/**
 * Notifies Discord channel when order status or properties change.
 */
async function notifyOrderStatusUpdate(order, oldStatus, boosterName = null) {
  let color = 10181046; // Purple default
  if (order.status === 'completed') color = 3066993; // Green
  if (order.status === 'canceled') color = 15158332; // Red
  if (order.status === 'processing') color = 15105570; // Orange/Gold

  const fields = [
    { name: 'Sipariş ID', value: `#${order.id}`, inline: true },
    { name: 'Riot ID', value: order.customer_riot_id, inline: true },
    { name: 'Başlangıç Rankı', value: order.start_rank, inline: true },
    { name: 'Güncel Rankı', value: `${order.current_rank || order.start_rank} (${order.current_kp || 0} KP)`, inline: true },
    { name: 'Hedef Rankı', value: order.target_rank, inline: true },
    { name: 'Eski Durum', value: translateStatus(oldStatus), inline: true },
    { name: 'Yeni Durum', value: translateStatus(order.status), inline: true }
  ];

  if (boosterName) {
    fields.push({ name: 'Atanan Booster', value: boosterName, inline: true });
  }

  const embed = {
    title: '🔄 Elo Boost Siparişi Güncellendi!',
    color: color,
    timestamp: new Date().toISOString(),
    footer: {
      text: 'kodteslimal.com Elo Boost'
    },
    fields: fields
  };

  const payload = { 
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Sipariş Detaylarını Görüntüle',
            url: `https://kodteslimal.com/booster/dashboard?order_id=${order.id}`
          }
        ]
      }
    ]
  };
  if (boosterName) {
    const mention = getBoosterMention(boosterName);
    if (mention) {
      payload.content = `🔔 Atanan Booster: ${mention}`;
    }
  }

  return sendDiscordWebhook(payload);
}

/**
 * Notifies Discord channel specifically when a booster is assigned or reassigned to an order.
 */
async function notifyBoosterAssignment(order, boosterName) {
  const mention = getBoosterMention(boosterName);
  
  const embed = {
    title: '⚔️ Sipariş Booster\'a Atandı! 🎮',
    color: 15105570, // Gold/Orange
    timestamp: new Date().toISOString(),
    footer: {
      text: 'kodteslimal.com Elo Boost'
    },
    fields: [
      { name: 'Sipariş ID', value: `#${order.id}`, inline: true },
      { name: 'Riot ID', value: order.customer_riot_id, inline: true },
      { name: 'Başlangıç Rankı', value: order.start_rank, inline: true },
      { name: 'Güncel Rankı', value: `${order.current_rank || order.start_rank} (${order.current_kp || 0} KP)`, inline: true },
      { name: 'Hedef Rankı', value: order.target_rank, inline: true },
      { name: 'Atanan Booster', value: boosterName, inline: true }
    ]
  };

  const payload = { 
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Sipariş Detaylarını Görüntüle',
            url: `https://kodteslimal.com/booster/dashboard?order_id=${order.id}`
          }
        ]
      }
    ]
  };
  if (mention) {
    payload.content = `🔔 ${mention}, bu sipariş sana atandı! Başarılar.`;
  }

  return sendDiscordWebhook(payload);
}

module.exports = {
  notifyNewOrder,
  notifyOrderStatusUpdate,
  notifyBoosterAssignment
};
