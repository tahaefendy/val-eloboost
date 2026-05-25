const { User, StockKey, Order, BoosterLog } = require('../models');
const { decrypt } = require('../utils/encryption');
const { isRankHigherOrEqual, calculateProgress } = require('../utils/rankHelper');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');

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
    const { username, email, password, role, max_boost_rank } = req.body;
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
 * Generates a random secure stock key code (e.g. VAL-KEY-ABCD-1234)
 */
function generateRandomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `VAL-KEY-${segment()}-${segment()}`;
}

/**
 * Creates stock key codes with automated key code generation (Admin/Manager only)
 */
async function createStockKey(req, res) {
  try {
    const { is_fixed_rank, start_rank, target_rank } = req.body;

    // Automatically generate unique key code
    let key_code = generateRandomKey();
    let keyExists = await StockKey.findOne({ where: { key_code } });
    while (keyExists) {
      key_code = generateRandomKey();
      keyExists = await StockKey.findOne({ where: { key_code } });
    }

    const key = await StockKey.create({
      key_code,
      is_fixed_rank: !!is_fixed_rank,
      start_rank: is_fixed_rank ? start_rank : null,
      target_rank: is_fixed_rank ? target_rank : null,
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

/**
 * Lists boosters for reassignment dropdown list (Admin/Manager only)
 */
async function listBoosters(req, res) {
  try {
    const boosters = await User.findAll({
      where: { role: 'booster' },
      attributes: ['id', 'username', 'email', 'max_boost_rank', 'active_jobs_count']
    });
    return res.json(boosters);
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

    // Check if booster is capable of playing target_rank
    if (!isRankHigherOrEqual(newBooster.max_boost_rank, order.target_rank)) {
      await transaction.rollback();
      return res.status(400).json({
        error: `Bu booster'ın yetkinliği (${newBooster.max_boost_rank}) bu hedef rank (${order.target_rank}) için yeterli değil.`
      });
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

    // Log the reassignment
    await BoosterLog.create({
      order_id: order.id,
      booster_id: req.user.id, // Who did the assignment
      action: `Sipariş manuel olarak '${newBooster.username}' boosterına atandı.`,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();
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

    // Audit log
    await BoosterLog.create({
      order_id: order.id,
      booster_id: req.user.id,
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
    const { status, current_rank, current_kp } = req.body;

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

    await order.save({ transaction });

    // Audit log
    await BoosterLog.create({
      order_id: order.id,
      booster_id: req.user.id,
      action: `Sipariş güncellendi: Durum = ${status || oldStatus}, Rank = ${order.current_rank}, KP = ${order.current_kp}`,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();
    return res.json({ message: 'Sipariş güncellendi.', order });
  } catch (error) {
    await transaction.rollback();
    console.error('UpdateOrderStatus Error:', error);
    return res.status(500).json({ error: 'Sipariş güncellenemedi.' });
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
      queryOptions.where = { booster_id: req.user.id };
    }

    const orders = await Order.findAll(queryOptions);
    return res.json(orders);
  } catch (error) {
    console.error('GetOrders Error:', error);
    return res.status(500).json({ error: 'Sipariş listesi alınamadı.' });
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
  getOrders
};
