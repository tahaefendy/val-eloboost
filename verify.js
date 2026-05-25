const { sequelize, User, StockKey, Order, BoosterLog } = require('./src/models');
const { encrypt, decrypt } = require('./src/utils/encryption');
const { autoAssignOrder } = require('./src/utils/assignment');
const { calculateProgress } = require('./src/utils/rankHelper');
const { getLiveMmr } = require('./src/utils/valorantApi');
const bcrypt = require('bcryptjs');

async function runSimulation() {
  console.log('=== Elo Boost Otomasyonu Simülasyonu Başlıyor ===\n');

  try {
    // 1. Force Sync Database to clear previous data
    console.log('[1/7] Veritabanı tabloları temizleniyor ve oluşturuluyor...');
    await sequelize.sync({ force: true });
    console.log('Veritabanı hazır.\n');

    // 2. Seed Users (Admin and Boosters with varying max ranks and jobs)
    console.log('[2/7] Örnek çalışanlar (Boosters) ve yöneticiler oluşturuluyor...');
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const hashedBoosterPassword = await bcrypt.hash('booster123', 10);

    const admin = await User.create({
      username: 'taha_admin',
      email: 'admin@kodteslimal.com',
      password: hashedAdminPassword,
      role: 'admin',
      max_boost_rank: 'Radiant',
      active_jobs_count: 0
    });

    // Booster 1: Max Rank Silver 3 (Can do Bronze/Silver boost only)
    const boosterLow = await User.create({
      username: 'booster_low',
      email: 'booster_low@kodteslimal.com',
      password: hashedBoosterPassword,
      role: 'booster',
      max_boost_rank: 'Silver 3',
      active_jobs_count: 0
    });

    // Booster 2: Max Rank Diamond 3 (Can do Gold/Diamond boost), currently has 0 jobs
    const boosterMid = await User.create({
      username: 'booster_mid',
      email: 'booster_mid@kodteslimal.com',
      password: hashedBoosterPassword,
      role: 'booster',
      max_boost_rank: 'Diamond 3',
      active_jobs_count: 0
    });

    // Booster 3: Max Rank Radiant (Can do any boost), but already busy (active_jobs_count = 1)
    const boosterHigh = await User.create({
      username: 'booster_high',
      email: 'booster_high@kodteslimal.com',
      password: hashedBoosterPassword,
      role: 'booster',
      max_boost_rank: 'Radiant',
      active_jobs_count: 1
    });

    console.log(`Boosters oluşturuldu:`);
    console.log(`- ${boosterLow.username} (Max Rank: Silver 3, Aktif İş: 0)`);
    console.log(`- ${boosterMid.username} (Max Rank: Diamond 3, Aktif İş: 0)`);
    console.log(`- ${boosterHigh.username} (Max Rank: Radiant, Aktif İş: 1)\n`);

    // 3. Seed Stock Keys
    console.log('[3/7] İtem satış stok kodları (Keys) üretiliyor...');
    // Fixed rank key: Silver 1 to Gold 1
    const fixedKey = await StockKey.create({
      key_code: 'VAL-KEY-GOLD-FIXED',
      is_fixed_rank: true,
      start_rank: 'Silver 1',
      target_rank: 'Gold 1',
      is_used: false
    });
    console.log(`Stok Kodu Eklendi: ${fixedKey.key_code} (Sabit Rank: Silver 1 -> Gold 1)\n`);

    // 4. Simulate Client Ordering
    console.log('[4/7] Müşteri satın alım ve sipariş oluşturma simülasyonu...');
    console.log(`Müşteri '${fixedKey.key_code}' kodunu giriyor...`);
    
    // Create order logic
    const clientRiotUsername = 'RiotGamer#TR1';
    const clientRiotPasswordRaw = 'gizlisifre123';
    
    // Encrypt password
    const encryptedPass = encrypt(clientRiotPasswordRaw);
    console.log(`Riot şifresi şifrelendi (Plain: '${clientRiotPasswordRaw}' -> DB cipher: '${encryptedPass}')`);

    const order = await Order.create({
      stock_key_id: fixedKey.id,
      customer_riot_username: clientRiotUsername,
      customer_riot_password: encryptedPass,
      start_rank: fixedKey.start_rank,
      target_rank: fixedKey.target_rank,
      current_rank: fixedKey.start_rank,
      current_kp: 0,
      status: 'pending',
      progress_percentage: 0.0
    });

    fixedKey.is_used = true;
    fixedKey.used_at = new Date();
    await fixedKey.save();
    console.log('Stok kodu kullanıldı olarak işaretlendi.');

    // 5. Trigger Auto-Assignment
    console.log('[5/7] Otomatik booster atama algoritması çalıştırılıyor...');
    console.log(`Hedef Rank: ${order.target_rank}`);
    const assigned = await autoAssignOrder(order);
    
    // Reload order to fetch updated assignment
    await order.reload();
    const assignedBooster = await User.findByPk(order.booster_id);
    
    console.log(`Atama sonucu: ${assigned ? 'Başarılı' : 'Başarısız'}`);
    console.log(`Sipariş Atanan Booster: ${assignedBooster ? assignedBooster.username : 'Yok'}`);
    console.log(`Booster iş yükü güncellendi. ${assignedBooster.username} aktif iş sayısı: ${assignedBooster.active_jobs_count}\n`);

    // 6. Simulate Booster Password Viewing & Logs Audit
    console.log('[6/7] Booster hesaba giriş için şifreyi görüntülüyor...');
    const decryptedPass = decrypt(order.customer_riot_password);
    console.log(`Şifre çözüldü: '${decryptedPass}'`);

    // Add log
    await BoosterLog.create({
      order_id: order.id,
      booster_id: assignedBooster.id,
      action: 'Hesap şifresi görüntülendi.',
      ip_address: '127.0.0.1'
    });
    console.log('Güvenlik denetim günlüğü (BoosterLog) oluşturuldu.\n');

    // 7. Simulate Live tracking update & Caching
    console.log('[7/7] Canlı sipariş takibi ve Henrik API önbellek doğrulaması...');
    const liveMmr = await getLiveMmr('eu', order.customer_riot_username);
    console.log(`Henrik Dev API'den gelen veriler: Rank: ${liveMmr.current_rank}, KP: ${liveMmr.current_kp}`);
    
    order.current_rank = liveMmr.current_rank;
    order.current_kp = liveMmr.current_kp;
    order.last_api_check = new Date();
    order.api_cache_data = JSON.stringify(liveMmr.raw);
    order.progress_percentage = calculateProgress(
      order.start_rank,
      order.target_rank,
      order.current_rank,
      order.current_kp
    );
    await order.save();
    console.log(`Sipariş Güncel Rankı: ${order.current_rank} (${order.current_kp} KP)`);
    console.log(`İlerleme Yüzdesi: %${order.progress_percentage}`);

    // Completed & Purge password check
    console.log('\nBooster işi tamamladı olarak işaretliyor...');
    order.status = 'completed';
    order.customer_riot_password = null; // Permanently delete password
    await order.save();

    assignedBooster.active_jobs_count -= 1;
    await assignedBooster.save();

    console.log(`Sipariş durumu: ${order.status}`);
    console.log(`Veritabanındaki Riot Şifresi: ${order.customer_riot_password === null ? 'GÜVENLİ BİR ŞEKİLDE SİLİNDİ (NULL)' : 'HATA'}`);
    console.log(`${assignedBooster.username} aktif iş sayısı güncellendi: ${assignedBooster.active_jobs_count}`);

    console.log('\n=== Simülasyon Başarıyla Tamamlandı ===');
  } catch (error) {
    console.error('Simülasyon Hatası:', error);
  } finally {
    await sequelize.close();
  }
}

runSimulation();
