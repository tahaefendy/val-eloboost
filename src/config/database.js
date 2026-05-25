const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  // Railway production database configuration (PostgreSQL)
  console.log('Production: Railway DATABASE_URL algılandı, PostgreSQL ile bağlanılıyor...');
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    define: {
      timestamps: true,
      underscored: true
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Necessary for Railway's SSL connections
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  // Local development database configuration (MySQL/SQLite)
  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbPort = process.env.DB_PORT || '3306';
  const dbName = process.env.DB_NAME || 'jeakshop';
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD ?? '';
  const dbDialect = process.env.DB_DIALECT || 'mysql';

  const sequelizeOptions = {
    host: dbHost,
    port: dbPort,
    dialect: dbDialect,
    logging: false,
    define: {
      timestamps: true,
      underscored: true
    }
  };

  if (dbDialect !== 'sqlite') {
    sequelizeOptions.pool = {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    };
  } else {
    sequelizeOptions.storage = process.env.DB_STORAGE || './database.sqlite';
  }

  sequelize = new Sequelize(dbName, dbUser, dbPassword, sequelizeOptions);
}

module.exports = sequelize;
