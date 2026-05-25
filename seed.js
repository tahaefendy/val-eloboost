const { sequelize, User, StockKey } = require('./src/models');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('=== Veritabanı Test Verisi Yükleme Başlıyor ===\n');

  try {
    // Sync models without deleting existing records
    await sequelize.authenticate();
    await sequelize.sync();

    // 1. Create Admin Account if not exists
    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      const hashedPass = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        email: 'admin_account@kodteslimal.com',
        password: hashedPass,
        role: 'admin',
        max_boost_rank: 'Radiant',
        active_jobs_count: 0
      });
      console.log('✓ Admin hesabı oluşturuldu: admin / admin123');
    } else {
      console.log('○ Admin hesabı zaten mevcut.');
    }

    // 2. Create Booster Account if not exists
    const boosterExists = await User.findOne({ where: { username: 'booster' } });
    if (!boosterExists) {
      const hashedPass = await bcrypt.hash('booster123', 10);
      await User.create({
        username: 'booster',
        email: 'booster_account@kodteslimal.com',
        password: hashedPass,
        role: 'booster',
        max_boost_rank: 'Diamond 3',
        active_jobs_count: 0
      });
      console.log('✓ Booster hesabı oluşturuldu: booster / booster123');
    } else {
      console.log('○ Booster hesabı zaten mevcut.');
    }

    // 3. Create Stock Keys if not exists
    const keysToCreate = [
      { key_code: 'VAL-KEY-FIXED', is_fixed_rank: true, start_rank: 'Silver 1', target_rank: 'Gold 1' },
      { key_code: 'VAL-KEY-FLEX', is_fixed_rank: false }
    ];

    for (const keyData of keysToCreate) {
      const keyExists = await StockKey.findOne({ where: { key_code: keyData.key_code } });
      if (!keyExists) {
        await StockKey.create(keyData);
        console.log(`✓ Stok Kodu oluşturuldu: ${keyData.key_code}`);
      }
    }

    console.log('\n=== Test Verileri Başarıyla Yüklendi ===');
  } catch (error) {
    console.error('Seed hatası:', error);
  } finally {
    await sequelize.close();
  }
}

seed();
