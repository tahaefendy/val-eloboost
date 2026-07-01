const { User, StockKey, Order, BoosterLog } = require('../models');
const { encrypt, decrypt } = require('../utils/encryption');
const { isRankHigherOrEqual, calculateProgress, isPlacementTarget } = require('../utils/rankHelper');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwttokenkey123!';

/**
 * Log booster/admin in
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
      expiresIn: '8h'
    });

    return res.json({
      message: 'Giriş başarılı.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ error: 'Giriş yapılamadı.' });
  }
}

/**
 * Creates booster or manager users. (Admin/Manager only)
 */
async function createUser(req, res) {
  try {
    const { username, email, password, role, max_boost_rank, discord_id } = req.body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'Eksik parametreler.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim(),
      email: email.trim(),
      password: hashedPassword,
      role,
      max_boost_rank: max_boost_rank || 'Radiant',
      discord_id: discord_id || null,
      active_jobs_count: 0
    });

    return res.status(201).json({
      message: 'Kullanıcı başarıyla oluşturuldu.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        max_boost_rank: user.max_boost_rank
      }
    });
  } catch (error) {
    console.error('CreateUser Error:', error);
    return res.status(500).json({ error: 'Kullanıcı oluşturulurken bir hata oluştu.' });
  }
}

/**
 * Deletes a user (booster/manager). (Admin/Manager only)
 */
async function deleteUser(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    if (user.role === 'admin') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Yönetici hesapları silinemez.' });
    }
    if (user.id === req.user.id) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
    }

    if (user.active_jobs_count > 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: `Bu booster'ın aktif ${user.active_jobs_count} siparişi bulunuyor. Silmeden önce siparişleri başka bir booster'a atamalısınız.`
      });
    }

    // Programmatically clear references in orders and delete logs to avoid foreign key violations
    await Order.update({ booster_id: null }, { where: { booster_id: user.id }, transaction });
    await BoosterLog.destroy({ where: { booster_id: user.id }, transaction });

    await user.destroy({ transaction });

    await transaction.commit();
    return res.json({ message: 'Kullanıcı başarıyla silindi.' });
  } catch (error) {
    await transaction.rollback();
    console.error('DeleteUser Error:', error);
    return res.status(500).json({ 
      error: 'Kullanıcı silinirken bir hata oluştu.',
      message: error.message,
      stack: error.stack
    });
  }
}

/**
 * Generates a random secure stock key code (e.g. VAL-KEY-ABCD-1234)
 */
function generateRandomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `VAL-KEY-${segment()}-${segment()}`;
}

/**
 * Creates stock key codes (Admin/Manager only)
 */
async function createStockKey(req, res) {
  try {
    const { key_code: req_key_code, is_fixed_rank, start_rank, target_rank, placement_matches } = req.body;

    let key_code = req_key_code;
    if (!key_code) {
      // Automatically generate unique key code
      key_code = generateRandomKey();
      let keyExists = await StockKey.findOne({ where: { key_code } });
      while (keyExists) {
        key_code = generateRandomKey();
        keyExists = await StockKey.findOne({ where: { key_code } });
      }
    } else {
      // Check if custom key code exists
      const keyExists = await StockKey.findOne({ where: { key_code } });
      if (keyExists) {
        return res.status(400).json({ error: 'Stok kodu zaten mevcut.' });
      }
    }

    const key = await StockKey.create({
      key_code,
      is_fixed_rank: !!is_fixed_rank,
      start_rank: is_fixed_rank ? start_rank : null,
      target_rank: is_fixed_rank ? target_rank : null,
      placement_matches: placement_matches != null ? parseInt(placement_matches) : null,
      is_used: false
    });

    return res.status(201).json({
      message: 'Stok kodu (Key) otomatik olarak oluşturuldu.',
      key
    });
  } catch (error) {
    console.error('CreateStockKey Error:', error);
    return res.status(500).json({ error: 'Stok kodu oluşturulamadı.' });
  }
}

async function listBoosters(req, res) {
  try {
    const boosters = await User.findAll({
      where: { role: 'booster' },
      attributes: ['id', 'username', 'email', 'max_boost_rank', 'is_active', 'is_priority', 'discord_id']
    });

    const activeOrders = await Order.findAll({
      where: { status: ['pending', 'processing'] },
      attributes: ['booster_id']
    });

    const boostersWithCounts = boosters.map(booster => {
      const count = activeOrders.filter(o => o.booster_id === booster.id).length;
      return {
        id: booster.id,
        username: booster.username,
        email: booster.email,
        max_boost_rank: booster.max_boost_rank,
        is_active: booster.is_active,
        is_priority: booster.is_priority,
        discord_id: booster.discord_id,
        active_jobs_count: count
      };
    });

    return res.json(boostersWithCounts);
  } catch (error) {
    console.error('ListBoosters Error:', error);
    return res.status(500).json({ error: 'Booster listesi alınamadı.' });
  }
}

/**
 * Manually assign / reassign order to a booster (Admin/Manager only)
 */
async function reassignOrder(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params; // Order ID
    const { booster_id } = req.body; // New Booster ID

    const order = await Order.findByPk(id, { transaction });
    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    }

    const newBooster = await User.findByPk(booster_id, { transaction });
    if (!newBooster || newBooster.role !== 'booster') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Geçersiz booster ID.' });
    }

    const oldBoosterId = order.booster_id;

    // Update old booster jobs count if it was active
    if (oldBoosterId && (order.status === 'processing' || order.status === 'pending')) {
      const oldBooster = await User.findByPk(oldBoosterId, { transaction });
      if (oldBooster && oldBooster.active_jobs_count > 0) {
        oldBooster.active_jobs_count -= 1;
        await oldBooster.save({ transaction });
      }
    }

    // Update order assignment
    order.booster_id = newBooster.id;
    order.status = 'processing';
    await order.save({ transaction });

    // Update new booster jobs count
    newBooster.active_jobs_count += 1;
    await newBooster.save({ transaction });

    let logBoosterId = req.user.id;
    if (logBoosterId === 0) {
      const defaultUser = await User.findOne({ where: { role: 'admin' }, transaction }) || await User.findOne({ transaction });
      logBoosterId = defaultUser ? defaultUser.id : null;
    }

    await BoosterLog.create({
      order_id: order.id,
      booster_id: logBoosterId, // Who did the assignment
      action: `Sipariş manuel olarak '${newBooster.username}' boosterına atandı.`,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();

    // Discord webhook notification
    try {
      const { notifyBoosterAssignment } = require('../utils/discord');
      notifyBoosterAssignment(order, newBooster.username).catch(err => console.error('Discord notify reassign error:', err));
    } catch (discordErr) {
      console.error('Failed to dispatch Discord webhook for reassign:', discordErr);
    }

    return res.json({ message: 'Sipariş başarıyla yeniden atandı.', order });
  } catch (error) {
    await transaction.rollback();
    console.error('ReassignOrder Error:', error);
    return res.status(500).json({ error: 'Yeniden atama işlemi başarısız.' });
  }
}

/**
 * Access Riot account credentials for the assigned booster or managers.
 * Generates audit log.
 */
async function getOrderCredentials(req, res) {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id);

    if (!order) {
      return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    }

    // Check if user is the assigned booster or an administrator
    const isAssignedBooster = order.booster_id === req.user.id;
    const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';

    if (!isAssignedBooster && !isAdminOrManager) {
      return res.status(403).json({ error: 'Bu hesabın şifresini görme yetkiniz yok.' });
    }

    if (!order.customer_riot_password) {
      return res.status(400).json({ error: 'Bu siparişe ait şifre silinmiş veya mevcut değil.' });
    }

    const decryptedPassword = decrypt(order.customer_riot_password);

    let logBoosterId = req.user.id;
    if (logBoosterId === 0) {
      const defaultUser = await User.findOne({ where: { role: 'admin' } }) || await User.findOne();
      logBoosterId = defaultUser ? defaultUser.id : null;
    }

    // Audit log
    await BoosterLog.create({
      order_id: order.id,
      booster_id: logBoosterId,
      action: `Hesap şifresi görüntülendi.`,
      ip_address: req.ip
    });

    return res.json({
      username: order.customer_riot_username,
      password: decryptedPassword
    });
  } catch (error) {
    console.error('GetCredentials Error:', error);
    return res.status(500).json({ error: 'Şifre çözülemedi.' });
  }
}

/**
 * Update order status or current rank.
 * If status changes to completed/canceled, purges credentials and decreases active job load.
 */
async function updateOrderStatus(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, current_rank, current_kp, target_rank, start_rank, customer_riot_id, customer_riot_username, customer_riot_password, region } = req.body;

    const order = await Order.findByPk(id, { transaction });
    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    }

    // Validate if the user is authorized to edit this order
    const isAssignedBooster = order.booster_id === req.user.id;
    const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';

    if (!isAssignedBooster && !isAdminOrManager) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Bu siparişi güncelleme yetkiniz yok.' });
    }

    const oldStatus = order.status;

    if (current_rank) order.current_rank = current_rank;
    if (current_kp !== undefined) order.current_kp = Number(current_kp);
    if (target_rank) order.target_rank = target_rank;
    if (start_rank) order.start_rank = start_rank;
    if (customer_riot_id) order.customer_riot_id = customer_riot_id;
    if (customer_riot_username) order.customer_riot_username = customer_riot_username;
    if (customer_riot_password) order.customer_riot_password = encrypt(customer_riot_password);
    if (region) order.region = region;

    if (status && status !== oldStatus) {
      order.status = status;

      // Handle credentials purge when completed or canceled
      if (status === 'completed' || status === 'canceled') {
        order.customer_riot_password = null;

        // Decrement booster active job count
        if (order.booster_id) {
          const booster = await User.findByPk(order.booster_id, { transaction });
          if (booster && booster.active_jobs_count > 0) {
            booster.active_jobs_count -= 1;
            await booster.save({ transaction });
          }
        }
      }
    }

    // Update progress percentage
    order.progress_percentage = calculateProgress(
      order.start_rank,
      order.target_rank,
      order.current_rank,
      order.current_kp
    );

    if (order.progress_percentage >= 100 && order.status !== 'completed' && order.status !== 'canceled' && !isPlacementTarget(order.target_rank)) {
      order.status = 'completed';
      order.customer_riot_password = null;

      // Decrement booster active job count
      if (order.booster_id) {
        const booster = await User.findByPk(order.booster_id, { transaction });
        if (booster && booster.active_jobs_count > 0) {
          booster.active_jobs_count -= 1;
          await booster.save({ transaction });
        }
      }
    }

    await order.save({ transaction });

    let logBoosterId = req.user.id;
    if (logBoosterId === 0) {
      const defaultUser = await User.findOne({ where: { role: 'admin' }, transaction }) || await User.findOne({ transaction });
      logBoosterId = defaultUser ? defaultUser.id : null;
    }

    // Audit log
    await BoosterLog.create({
      order_id: order.id,
      booster_id: logBoosterId,
      action: `Sipariş güncellendi: Durum = ${order.status}, Rank = ${order.current_rank}, KP = ${order.current_kp}`,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();

    // Discord webhook notification
    try {
      const { notifyOrderStatusUpdate } = require('../utils/discord');
      let boosterName = null;
      if (order.booster_id) {
        const booster = await User.findByPk(order.booster_id);
        if (booster) boosterName = booster.username;
      }
      notifyOrderStatusUpdate(order, oldStatus, boosterName).catch(err => console.error('Discord notify update error:', err));
    } catch (discordErr) {
      console.error('Failed to dispatch Discord webhook for update:', discordErr);
    }

    return res.json({ message: 'Sipariş güncellendi.', order });
  } catch (error) {
    await transaction.rollback();
    console.error('UpdateOrderStatus Error:', error);
    return res.status(500).json({ 
      error: 'Sipariş güncellenemedi.', 
      message: error.message, 
      stack: error.stack 
    });
  }
}

/**
 * List all booster logs for audit purposes (Admin/Manager only)
 */
async function getAuditLogs(req, res) {
  try {
    const logs = await BoosterLog.findAll({
      include: [
        { model: User, as: 'booster', attributes: ['id', 'username', 'role'] },
        { model: Order, as: 'order', attributes: ['id', 'customer_riot_username'] }
      ],
      order: [['created_at', 'DESC']]
    });
    return res.json(logs);
  } catch (error) {
    console.error('GetAuditLogs Error:', error);
    return res.status(500).json({ error: 'Denetim günlükleri alınamadı.' });
  }
}

/**
 * List all orders. Admin/Manager sees all, Booster only sees assigned orders.
 */
async function getOrders(req, res) {
  try {
    const isBooster = req.user.role === 'booster';
    const queryOptions = {
      include: [
        { model: User, as: 'booster', attributes: ['id', 'username'] }
      ],
      order: [['id', 'DESC']]
    };

    if (isBooster) {
      queryOptions.where = {
        booster_id: req.user.id,
        status: { [Op.ne]: 'canceled' }
      };
    }

    const orders = await Order.findAll(queryOptions);

    // Decrypt passwords for the response
    const decryptedOrders = orders.map(order => {
      const orderJson = order.toJSON();
      if (orderJson.customer_riot_password) {
        orderJson.customer_riot_password = decrypt(orderJson.customer_riot_password);
      }
      return orderJson;
    });

    return res.json(decryptedOrders);
  } catch (error) {
    console.error('GetOrders Error:', error);
    return res.status(500).json({ error: 'Sipariş listesi alınamadı.' });
  }
}

/**
 * Update user fields (like active/inactive status, max_boost_rank)
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { is_active, max_boost_rank, is_priority, discord_id, username, password } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    if (is_active !== undefined) {
      user.is_active = !!is_active;
    }
    if (max_boost_rank !== undefined) {
      user.max_boost_rank = max_boost_rank;
    }
    if (is_priority !== undefined) {
      user.is_priority = !!is_priority;
    }
    if (discord_id !== undefined) {
      user.discord_id = discord_id || null;
    }
    if (username !== undefined && username.trim()) {
      user.username = username.trim();
    }
    if (password !== undefined && password.trim()) {
      const bcrypt = require('bcryptjs');
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();
    return res.json({ message: 'Kullanıcı başarıyla güncellendi.', user });
  } catch (error) {
    console.error('UpdateUser Error:', error);
    return res.status(500).json({ error: 'Kullanıcı güncellenemedi.' });
  }
}

/**
 * Bulk cancel selected orders
 */
async function bulkCancelOrders(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Eksik veya geçersiz sipariş ID listesi.' });
    }

    const orders = await Order.findAll({
      where: { id: ids },
      transaction
    });

    for (const order of orders) {
      const oldStatus = order.status;
      if (oldStatus !== 'canceled' && oldStatus !== 'completed') {
        order.status = 'canceled';
        order.customer_riot_password = null;
        await order.save({ transaction });

        // Decrement booster active job count if assigned
        if (order.booster_id) {
          const booster = await User.findByPk(order.booster_id, { transaction });
          if (booster && booster.active_jobs_count > 0) {
            booster.active_jobs_count -= 1;
            await booster.save({ transaction });
          }
        }

        // Audit log
        let logBoosterId = req.user.id;
        if (logBoosterId === 0) {
          const defaultUser = await User.findOne({ where: { role: 'admin' }, transaction }) || await User.findOne({ transaction });
          logBoosterId = defaultUser ? defaultUser.id : null;
        }

        await BoosterLog.create({
          order_id: order.id,
          booster_id: logBoosterId,
          action: `Sipariş toplu işlemle iptal edildi.`,
          ip_address: req.ip
        }, { transaction });
      }
    }

    await transaction.commit();
    return res.json({ message: `${orders.length} sipariş başarıyla iptal edildi.` });
  } catch (error) {
    await transaction.rollback();
    console.error('BulkCancelOrders Error:', error);
    return res.status(500).json({ error: 'Toplu iptal işlemi başarısız oldu.' });
  }
}

async function testDiscordWebhook(req, res) {
  try {
    const { notifyNewOrder } = require('../utils/discord');
    const dummyOrder = {
      id: 9999,
      customer_riot_id: 'TestPlayer#TR1',
      start_rank: 'Gold 1',
      target_rank: 'Platinum 1',
      status: 'pending'
    };
    const success = await notifyNewOrder(dummyOrder);
    if (success) {
      return res.json({ success: true, message: 'Discord webhook test mesajı başarıyla gönderildi.' });
    } else {
      return res.status(500).json({ error: 'Discord webhook test mesajı gönderilemedi.' });
    }
  } catch (error) {
    console.error('testDiscordWebhook error:', error);
    return res.status(500).json({ error: 'İşlem sırasında hata oluştu.', message: error.message });
  }
}

module.exports = {
  login,
  createUser,
  createStockKey,
  listBoosters,
  reassignOrder,
  getOrderCredentials,
  updateOrderStatus,
  getAuditLogs,
  getOrders,
  deleteUser,
  updateUser,
  bulkCancelOrders,
  testDiscordWebhook
};
