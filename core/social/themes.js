// Sélection du thème éditorial du jour selon le calendrier hebdo du projet.

const DAY_MAP = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function getDayTheme(config, date = new Date()) {
  const dayName = DAY_MAP[date.getDay()];
  const slot = config.social?.weeklySchedule?.[dayName];
  if (!slot) return { dayName, theme: "general", format: "single" };
  return { dayName, ...slot };
}

/**
 * Renvoie un pool d'hashtags adapté au projet + au thème du jour.
 */
export function selectHashtags(config, { category = null, count = 7 } = {}) {
  const core = config.social?.hashtagsCore || [];
  const categoryPool = category && config.social?.hashtagsCategoryPool?.[category]
    ? config.social.hashtagsCategoryPool[category]
    : [];
  const community = config.social?.hashtagsCommunity || [];

  // Always include all core, then sample from category + community
  const picks = [...core];
  const sampleCount = Math.max(0, count - picks.length);
  const remainder = [...categoryPool, ...community];
  // Simple shuffle by Date+index for deterministic variation per day
  const today = new Date().getDate();
  const sampled = remainder
    .map((tag, i) => ({ tag, sort: (i * 7 + today) % remainder.length }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, sampleCount)
    .map((x) => x.tag);

  return [...picks, ...sampled].slice(0, count);
}
