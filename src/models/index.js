const sequelize = require('../config/database');
const User = require('./User');
const StockKey = require('./StockKey');
const Order = require('./Order');
const BoosterLog = require('./BoosterLog');

// Define associations
StockKey.hasOne(Order, { foreignKey: 'stock_key_id', as: 'order' });
Order.belongsTo(StockKey, { foreignKey: 'stock_key_id', as: 'stockKey' });

User.hasMany(Order, { foreignKey: 'booster_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'booster_id', as: 'booster' });

Order.hasMany(BoosterLog, { foreignKey: 'order_id', as: 'logs' });
BoosterLog.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

User.hasMany(BoosterLog, { foreignKey: 'booster_id', as: 'boosterLogs' });
BoosterLog.belongsTo(User, { foreignKey: 'booster_id', as: 'booster' });

module.exports = {
  sequelize,
  User,
  StockKey,
  Order,
  BoosterLog
};
