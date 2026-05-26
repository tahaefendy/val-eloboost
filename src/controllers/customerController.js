const { StockKey, Order, User } = require('../models');
const { encrypt } = require('../utils/encryption');
const { autoAssignOrder } = require('../utils/assignment');
const { calculateProgress, translateEnglishRankToTurkish } = require('../utils/rankHelper');
const { getLiveMmr } = require('../utils/valorantApi');
const sequelize = require('../config/database');

/**
 * Validates whether a key is existing and unused.
 */
async function verifyKey(req, res) {
  try {
    const { keyCode } = req.params;

    if (!keyCode) {
      return res.status(400).json({ error: 'Key kodu zorunludur.' });
    }

    const key = await StockKey.findOne({
      where: { key_code: keyCode.trim() }
    });

    if (!key) {
      return res.status(404).json({ error: 'Geçersiz stok kodu (Key).' });
    }

    if (key.is_used) {
      return res.status(400).json({ error: 'Bu stok kodu zaten kullanılmış.' });
    }

    return res.json({
      message: 'Stok kodu geçerli.',
      key: {
        key_code: key.key_code,
        is_fixed_rank: key.is_fixed_rank,
        start_rank: key.start_rank,
        target_rank: key.target_rank
      }
    });
  } catch (error) {
    console.error('VerifyKey Error:', error);
    return res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
}

/**
 * Submits client details and initializes the order.
 */
async function createOrder(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { key_code, customer_riot_id, customer_riot_username, customer_riot_password, start_rank, target_rank, region } = req.body;

    if (!key_code || !customer_riot_id || !customer_riot_username || !customer_riot_password) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Eksik alanlar mevcut.' });
    }

    // 1. Find and lock the stock key
    const key = await StockKey.findOne({
      where: { key_code: key_code.trim(), is_used: false },
      transaction
    });

    if (!key) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Geçersiz veya kullanılmış stok kodu.' });
    }

    // 2. Decide ranks based on key type
    let finalStartRank = start_rank;
    let finalTargetRank = target_rank;

    if (key.is_fixed_rank) {
      finalStartRank = key.start_rank;
      finalTargetRank = key.target_rank;
    } else {
      if (!start_rank || !target_rank) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Bu key için başlangıç ve hedef rank seçilmelidir.' });
      }
    }

    // Fetch current rank from API right away if possible
    let finalCurrentRank = finalStartRank;
    let finalCurrentKp = 0;
    let liveData = null;
    try {
        liveData = await getLiveMmr(region || 'eu', customer_riot_id.trim());
        if (liveData && liveData.current_rank) {
            finalCurrentRank = translateEnglishRankToTurkish(liveData.current_rank);
            finalCurrentKp = liveData.current_kp;
        }
    } catch (apiErr) {
        console.error("Henrik API İlk Çekim Hatası:", apiErr.message);
    }

    // 3. Encrypt the password
    const encryptedPassword = encrypt(customer_riot_password);

    // 4. Create the Order
    const order = await Order.create({
      stock_key_id: key.id,
      customer_riot_id: customer_riot_id.trim(),
      customer_riot_username: customer_riot_username.trim(),
      customer_riot_password: encryptedPassword,
      start_rank: finalStartRank,
      target_rank: finalTargetRank,
      current_rank: finalCurrentRank, // Set from API
      current_kp: finalCurrentKp,
      status: 'pending',
      progress_percentage: 0.0,
      last_api_check: liveData ? new Date() : null,
      api_cache_data: liveData ? JSON.stringify(liveData.raw) : null
    }, { transaction });

    // 5. Mark the key as used
    key.is_used = true;
    key.used_at = new Date();
    await key.save({ transaction });

    // 6. Execute auto-assignment
    const assigned = await autoAssignOrder(order, transaction);

    await transaction.commit();

    return res.status(201).json({
      message: 'Sipariş başarıyla oluşturuldu.',
      order_id: order.id,
      assigned_booster: assigned ? 'Otomatik booster atandı.' : 'Booster bekleme listesinde.'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('CreateOrder Error:', error);
    return res.status(500).json({ error: 'Sipariş oluşturulamadı.' });
  }
}

/**
 * Tracks the order live and fetches from Henrik Dev API with a 15-minute cache fallback.
 */
async function trackOrder(req, res) {
  try {
    const { id } = req.params;
    const { region } = req.query; // Optional region query, defaults to 'eu'

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    }

    const cacheDurationMs = 15 * 60 * 1000; // 15 minutes
    const now = new Date();
    const lastCheck = order.last_api_check;

    let updateSource = 'cache';

    // Only update MMR live from API if the order is not completed
    if (order.status !== 'completed' && (!lastCheck || (now - new Date(lastCheck)) > cacheDurationMs)) {
      try {
        const liveData = await getLiveMmr(region || 'eu', order.customer_riot_id);
        
        order.current_rank = translateEnglishRankToTurkish(liveData.current_rank);
        order.current_kp = liveData.current_kp;
        order.last_api_check = now;
        order.api_cache_data = JSON.stringify(liveData.raw);
        
        // Calculate new progress percentage
        order.progress_percentage = calculateProgress(
          order.start_rank,
          order.target_rank,
          order.current_rank,
          order.current_kp
        );

        await order.save();
        updateSource = 'live_api';
      } catch (apiError) {
        console.error('Henrik Dev API Hatası (Önbellekteki veriler kullanılıyor):', apiError.message);
        updateSource = 'failed_api_fallback_cache';
      }
    }

    const finalLastCheck = order.last_api_check ? new Date(order.last_api_check) : null;
    let minutesAgo = 0;
    if (finalLastCheck) {
      minutesAgo = Math.floor((now - finalLastCheck) / 1000 / 60);
    }

    return res.json({
      order: {
        id: order.id,
        start_rank: order.start_rank,
        target_rank: order.target_rank,
        current_rank: order.current_rank,
        current_kp: order.current_kp,
        status: order.status,
        progress_percentage: order.progress_percentage,
        updated_at: order.updated_at
      },
      cache: {
        last_check: order.last_api_check,
        minutes_ago: minutesAgo,
        source: updateSource
      }
    });
  } catch (error) {
    console.error('TrackOrder Error:', error);
    return res.status(500).json({ error: 'Sipariş takip bilgisi alınamadı.' });
  }
}

module.exports = {
  verifyKey,
  createOrder,
  trackOrder
};
