const { User, Order } = require('../models');
const { isRankHigherOrEqual } = require('./rankHelper');

/**
 * Automatically assigns a pending order to the most suitable booster.
 * @param {Order} order - The Sequelize order instance to assign.
 * @param {object} transaction - Optional database transaction.
 * @returns {Promise<boolean>} True if booster is assigned successfully, false otherwise.
 */
async function autoAssignOrder(order, transaction = null) {
  try {
    // 1. Get all boosters
    const boosters = await User.findAll({
      where: {
        role: 'booster',
        is_active: true
      },
      transaction
    });

    if (boosters.length === 0) {
      console.log(`Otomatik Atama: Sistemde hiç booster tanımlı değil. Sipariş ID: ${order.id}`);
      return false;
    }

    // 2. Filter boosters by capability (booster.max_boost_rank >= order.target_rank)
    const eligibleBoosters = boosters.filter(booster => {
      return isRankHigherOrEqual(booster.max_boost_rank, order.target_rank);
    });

    if (eligibleBoosters.length === 0) {
      console.log(`Otomatik Atama: Hedef rank (${order.target_rank}) için yetkin booster bulunamadı. Sipariş ID: ${order.id}`);
      return false;
    }

    // 3. Select booster with minimum active_jobs_count
    eligibleBoosters.sort((a, b) => a.active_jobs_count - b.active_jobs_count);
    const chosenBooster = eligibleBoosters[0];

    // 4. Assign the order to this booster
    order.booster_id = chosenBooster.id;
    order.status = 'processing';
    order.current_rank = order.start_rank; // Set initial current rank
    await order.save({ transaction });

    // 5. Update booster's active job count
    chosenBooster.active_jobs_count += 1;
    await chosenBooster.save({ transaction });

    console.log(`Otomatik Atama Başarılı: Sipariş ID: ${order.id} -> Booster: ${chosenBooster.username} (${chosenBooster.id})`);
    return true;
  } catch (error) {
    console.error('Otomatik atama sırasında hata oluştu:', error);
    return false;
  }
}

module.exports = {
  autoAssignOrder
};
