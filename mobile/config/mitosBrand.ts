export const mitosBrand = {
  name: 'MITOS RENT A CAR',
  shortName: 'MITOS',
  descriptor: 'RENT A CAR',
  tagline: 'Alquila fácil, viaja seguro.',
  domain: 'www.mitosrentacar.com',
  websiteUrl: 'https://www.mitosrentacar.com',
  instagramHandle: '@mitosrentacar',
  instagramUrl: 'https://www.instagram.com/mitosrentacar/',
  whatsappDisplay: '+51 941 368 086',
  whatsappUrl: 'https://wa.me/51941368086',
  phoneUri: 'tel:+51941368086',
  market: 'Lima, Perú',
  operationalLocation: 'La Molina, Lima',
} as const

export const mitosColors = {
  navy: '#012063',
  navyDeep: '#062866',
  blue: '#1556B8',
  ink: '#082B6E',
  body: '#425478',
  muted: '#71809D',
  line: '#DCE5F2',
  soft: '#F5F8FC',
  white: '#FFFFFF',
} as const

export type MitosBrand = typeof mitosBrand
