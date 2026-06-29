const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockKey = sequelize.define('StockKey', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  key_code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  is_fixed_rank: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  start_rank: {
    type: DataTypes.STRING,
    allowNull: true
  },
  target_rank: {
    type: DataTypes.STRING,
    allowNull: true
  },
  placement_matches: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  },
  is_used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  used_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = StockKey;
