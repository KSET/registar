const SECTION_NAME_ALIASES = {
  Bike: ['Bike', 'Biciklistička', 'Biciklisticka', 'Biciklistice'],
  Disco: ['Disco'],
  Dramska: ['Dramska'],
  Foto: ['Foto'],
  Glazbena: ['Glazbena'],
  Media: ['Media'],
  Pi: ['Pi', 'Planinarska'],
  Comp: ['Comp', 'Računarska', 'Racunarska'],
  Tech: ['Tech', 'Tehnička', 'Tehnicka'],
  Video: ['Video'],
};

function normalizeSectionName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase();
}

const CANONICAL_NAME_BY_ALIAS = new Map();
for (const [canonicalName, aliases] of Object.entries(SECTION_NAME_ALIASES)) {
  for (const alias of aliases) {
    CANONICAL_NAME_BY_ALIAS.set(normalizeSectionName(alias), canonicalName);
  }
}

function canonicalSectionName(name) {
  const trimmedName = String(name ?? '').trim();
  return CANONICAL_NAME_BY_ALIAS.get(normalizeSectionName(trimmedName)) || trimmedName;
}

function sectionSheetNames(canonicalName) {
  const aliases = SECTION_NAME_ALIASES[canonicalSectionName(canonicalName)] || [canonicalName];
  return [...new Set(aliases.map((name) => `_${name}`))];
}

function createSectionNameLookup(sections) {
  const lookup = new Map();
  for (const section of sections) {
    const canonicalName = canonicalSectionName(section.name);
    const existing = lookup.get(canonicalName);
    if (!existing || section.name === canonicalName) {
      lookup.set(canonicalName, section);
    }
  }
  return lookup;
}

module.exports = {
  canonicalSectionName,
  createSectionNameLookup,
  sectionSheetNames,
};
