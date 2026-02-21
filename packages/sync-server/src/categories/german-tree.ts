// German category tree for seeding Actual Budget categories
// 12 L1 groups, ~70 L2 categories, pre-assigned colors and icons

export const GERMAN_CATEGORY_TREE = [
  {
    name: 'Wohnen',
    color: '#4A90D9',
    icon: 'home',
    is_income: false,
    categories: ['Miete', 'Nebenkosten', 'Strom', 'Gas', 'Internet', 'Hausrat', 'Renovierung'],
  },
  {
    name: 'Mobilität',
    color: '#F5A623',
    icon: 'car',
    is_income: false,
    categories: ['Auto-Versicherung', 'Tanken', 'Werkstatt', 'Leasing', 'ÖPNV', 'Taxi', 'Fahrrad'],
  },
  {
    name: 'Lebensmittel',
    color: '#7ED321',
    icon: 'cart',
    is_income: false,
    categories: ['Supermarkt', 'Restaurant', 'Lieferdienst', 'Kaffee', 'Bäckerei', 'Markt'],
  },
  {
    name: 'Freizeit',
    color: '#BD10E0',
    icon: 'gamepad',
    is_income: false,
    categories: ['Streaming', 'Sport', 'Ausgehen', 'Hobbys', 'Reisen', 'Kultur', 'Bücher'],
  },
  {
    name: 'Versicherungen',
    color: '#9013FE',
    icon: 'shield',
    is_income: false,
    categories: ['Kranken', 'Haftpflicht', 'Hausrat', 'BU', 'Rechtsschutz', 'KFZ', 'Leben'],
  },
  {
    name: 'Finanzen',
    color: '#417505',
    icon: 'bank',
    is_income: false,
    categories: ['Sparen', 'Kredit-Tilgung', 'Zinsen', 'Gebühren', 'Investitionen'],
  },
  {
    name: 'Gesundheit',
    color: '#D0021B',
    icon: 'heart',
    is_income: false,
    categories: ['Apotheke', 'Arzt', 'Brille', 'Zahnarzt', 'Fitness'],
  },
  {
    name: 'Einkäufe',
    color: '#F8E71C',
    icon: 'bag',
    is_income: false,
    categories: ['Kleidung', 'Elektronik', 'Möbel', 'Haushalt', 'Geschenke', 'Online'],
  },
  {
    name: 'Bildung',
    color: '#50E3C2',
    icon: 'book',
    is_income: false,
    categories: ['Kurse', 'Software', 'Abonnements', 'Schule'],
  },
  {
    name: 'Kinder',
    color: '#FF6B6B',
    icon: 'child',
    is_income: false,
    categories: ['Betreuung', 'Kleidung', 'Schule', 'Spielzeug', 'Taschengeld'],
  },
  {
    name: 'Sonstiges',
    color: '#9B9B9B',
    icon: 'dots',
    is_income: false,
    categories: ['Unkategorisiert', 'Bargeldabhebung', 'Gebühren', 'Sonstiges'],
  },
  {
    name: 'Einkommen',
    color: '#7ED321',
    icon: 'wallet',
    is_income: true,
    categories: ['Gehalt', 'Nebeneinkommen', 'Kindergeld', 'Zinserträge', 'Erstattungen'],
  },
];

export type GermanCategoryGroup = (typeof GERMAN_CATEGORY_TREE)[number];

export const DEFAULT_TAGS = [
  'Steuerlich relevant',
  'Urlaub',
  'Geteilt',
  'Einmalig',
  'Geschäftlich',
  'Geschenk',
];

// Finanzguru category name → German tree group/category mapping
// Used to auto-map imported Finanzguru categories to internal categories
export const FINANZGURU_CATEGORY_MAP: Record<string, { group: string; category: string }> = {
  // Wohnen
  'Miete & Nebenkosten': { group: 'Wohnen', category: 'Miete' },
  'Wohnen': { group: 'Wohnen', category: 'Nebenkosten' },
  'Strom & Gas': { group: 'Wohnen', category: 'Strom' },
  'Internet & Telefon': { group: 'Wohnen', category: 'Internet' },

  // Mobilität
  'Auto & KFZ': { group: 'Mobilität', category: 'Tanken' },
  'Öffentliche Verkehrsmittel': { group: 'Mobilität', category: 'ÖPNV' },
  'Taxi & Ridesharing': { group: 'Mobilität', category: 'Taxi' },

  // Lebensmittel
  'Lebensmittel': { group: 'Lebensmittel', category: 'Supermarkt' },
  'Restaurant & Café': { group: 'Lebensmittel', category: 'Restaurant' },
  'Lieferdienste': { group: 'Lebensmittel', category: 'Lieferdienst' },

  // Freizeit
  'Freizeit & Entertainment': { group: 'Freizeit', category: 'Ausgehen' },
  'Streaming & Medien': { group: 'Freizeit', category: 'Streaming' },
  'Sport & Fitness': { group: 'Freizeit', category: 'Sport' },
  'Reisen & Urlaub': { group: 'Freizeit', category: 'Reisen' },

  // Versicherungen
  'Versicherungen': { group: 'Versicherungen', category: 'Haftpflicht' },
  'Krankenversicherung': { group: 'Versicherungen', category: 'Kranken' },

  // Gesundheit
  'Gesundheit': { group: 'Gesundheit', category: 'Arzt' },
  'Apotheke': { group: 'Gesundheit', category: 'Apotheke' },

  // Einkäufe
  'Shopping': { group: 'Einkäufe', category: 'Online' },
  'Kleidung & Mode': { group: 'Einkäufe', category: 'Kleidung' },
  'Elektronik': { group: 'Einkäufe', category: 'Elektronik' },

  // Einkommen
  'Gehalt': { group: 'Einkommen', category: 'Gehalt' },
  'Einnahmen': { group: 'Einkommen', category: 'Nebeneinkommen' },

  // Finanzen
  'Sparen & Investitionen': { group: 'Finanzen', category: 'Investitionen' },
  'Kredit & Schulden': { group: 'Finanzen', category: 'Kredit-Tilgung' },

  // Sonstiges
  'Sonstiges': { group: 'Sonstiges', category: 'Sonstiges' },
  'Gebühren & Abgaben': { group: 'Sonstiges', category: 'Gebühren' },
};
