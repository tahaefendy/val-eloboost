const VALORANT_RANKS = [
  'Unranked',
  'Demir 1', 'Demir 2', 'Demir 3',
  'Bronz 1', 'Bronz 2', 'Bronz 3',
  'Gümüş 1', 'Gümüş 2', 'Gümüş 3',
  'Altın 1', 'Altın 2', 'Altın 3',
  'Plat 1', 'Plat 2', 'Plat 3',
  'Elmas 1', 'Elmas 2', 'Elmas 3',
  'Yücelik 1', 'Yücelik 2', 'Yücelik 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radyant'
];

const ENGLISH_TO_TURKISH_RANKS = {
  'unranked': 'Unranked',
  'iron 1': 'Demir 1', 'iron 2': 'Demir 2', 'iron 3': 'Demir 3',
  'bronze 1': 'Bronz 1', 'bronze 2': 'Bronz 2', 'bronze 3': 'Bronz 3',
  'silver 1': 'Gümüş 1', 'silver 2': 'Gümüş 2', 'silver 3': 'Gümüş 3',
  'gold 1': 'Altın 1', 'gold 2': 'Altın 2', 'gold 3': 'Altın 3',
  'platinum 1': 'Plat 1', 'platinum 2': 'Plat 2', 'platinum 3': 'Plat 3',
  'diamond 1': 'Elmas 1', 'diamond 2': 'Elmas 2', 'diamond 3': 'Elmas 3',
  'ascendant 1': 'Yücelik 1', 'ascendant 2': 'Yücelik 2', 'ascendant 3': 'Yücelik 3',
  'immortal 1': 'Immortal 1', 'immortal 2': 'Immortal 2', 'immortal 3': 'Immortal 3',
  'radiant': 'Radyant'
};

/**
 * Maps English rank strings returned by Valorant MMR API to Turkish localized strings.
 */
function translateEnglishRankToTurkish(englishRank) {
  if (!englishRank) return 'Unranked';
  const key = englishRank.toLowerCase().trim();
  return ENGLISH_TO_TURKISH_RANKS[key] || englishRank;
}

/**
 * Gets the base integer index of a rank name.
 * @param {string} rankName 
 * @returns {number} Index weight
 */
function getRankWeight(rankName) {
  if (!rankName) return 0;
  const translated = translateEnglishRankToTurkish(rankName);
  const index = VALORANT_RANKS.findIndex(r => r.toLowerCase() === translated.toLowerCase().trim());
  return index === -1 ? 0 : index;
}

/**
 * Gets a precise weight incorporating the current KP (Rating within tier).
 * @param {string} rankName 
 * @param {number} kp - Rating from 0 to 100
 * @returns {number} Detailed numeric weight
 */
function getDetailedRankWeight(rankName, kp = 0) {
  const baseWeight = getRankWeight(rankName);
  const normalizedKp = Math.max(0, Math.min(100, Number(kp) || 0)) / 100;
  
  // Radiant does not have standard divisions, but we can treat it similarly
  return baseWeight + normalizedKp;
}

/**
 * Compares two ranks to see if rankA is greater than or equal to rankB.
 * @param {string} rankA 
 * @param {string} rankB 
 * @returns {boolean} True if rankA >= rankB
 */
function isRankHigherOrEqual(rankA, rankB) {
  return getRankWeight(rankA) >= getRankWeight(rankB);
}

/**
 * Calculates progress percentage between start, current, and target ranks.
 * @param {string} startRank 
 * @param {string} targetRank 
 * @param {string} currentRank 
 * @param {number} currentKp 
 * @returns {number} Percentage formatted to 2 decimal places (0 - 100)
 */
function calculateProgress(startRank, targetRank, currentRank, currentKp = 0) {
  const startWeight = getDetailedRankWeight(startRank, 0);
  const targetWeight = getDetailedRankWeight(targetRank, 0);
  const currentWeight = getDetailedRankWeight(currentRank || startRank, currentKp);

  if (targetWeight <= startWeight) return 100;
  if (currentWeight <= startWeight) return 0;
  if (currentWeight >= targetWeight) return 100;

  const totalDiff = targetWeight - startWeight;
  const progressDiff = currentWeight - startWeight;
  const percentage = (progressDiff / totalDiff) * 100;

  return Math.round(percentage * 100) / 100;
}

module.exports = {
  VALORANT_RANKS,
  getRankWeight,
  getDetailedRankWeight,
  isRankHigherOrEqual,
  calculateProgress,
  translateEnglishRankToTurkish
};
