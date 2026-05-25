const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  stock_key_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  customer_riot_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  customer_riot_username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  customer_riot_password: {
    type: DataTypes.TEXT, // Store AES-256 encrypted password
    allowNull: true // Becomes null after completion or cancellation
  },
  start_rank: {
    type: DataTypes.STRING,
    allowNull: false
  },
  target_rank: {
    type: DataTypes.STRING,
    allowNull: false
  },
  current_rank: {
    type: DataTypes.STRING,
    allowNull: true
  },
  current_kp: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'canceled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  booster_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  progress_percentage: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0
  },
  last_api_check: {
    type: DataTypes.DATE,
    allowNull: true
  },
  api_cache_data: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

module.exports = Order;
