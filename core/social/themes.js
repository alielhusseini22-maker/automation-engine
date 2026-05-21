// Sélection du thème éditorial du jour selon le calendrier hebdo du projet.

const DAY_MAP = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function getDayTheme(config, date = new Date()) {
  const dayName = DAY_MAP[date.getDay()];
  const slot = config.social?.weeklySchedule?.[dayName];
  if (!slot) return { dayName, theme: "general", format: "single" };
  return { dayName, ...slot };
}

/**
 * Renvoie un pool d'hashtags pyramidal : core brand + high-volume FR + niche catégorie + community.
 * La pyramide booste à la fois la portée (high-volume) et le ciblage (niche).
 */
export function selectHashtags(config, { category = null, count = 7 } = {}) {
  const core = config.social?.hashtagsCore || [];
  const highVolume = config.social?.hashtagsHighVolumeFR || [];
  const categoryPool = category && config.social?.hashtagsCategoryPool?.[category]
    ? config.social.hashtagsCategoryPool[category]
    : [];
  const community = config.social?.hashtagsCommunity || [];

  // Pyramide pour 7 hashtags (par défaut) :
  //   2 core brand
  //   2 high-volume FR
  //   2 niche/catégorie (ciblage qualifié)
  //   1 community
  const picks = [...core.slice(0, 2)];
  const today = new Date().getDate();

  // Shuffle déterministe par date pour varier les hashtags entre les jours
  function pickN(arr, n) {
    const sorted = arr
      .map((tag, i) => ({ tag, sort: (i * 7 + today * 11) % Math.max(arr.length, 1) }))
      .sort((a, b) => a.sort - b.sort);
    return sorted.slice(0, n).map((x) => x.tag);
  }

  picks.push(...pickN(highVolume, 2));
  picks.push(...pickN(categoryPool, 2));
  picks.push(...pickN(community, Math.max(0, count - picks.length)));

  return [...new Set(picks)].slice(0, count);
}
