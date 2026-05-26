const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BoosterLog = sequelize.define('BoosterLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  booster_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true,
  updatedAt: false // Logs are immutable, we only need createdAt as timestamp
});

module.exports = BoosterLog;
