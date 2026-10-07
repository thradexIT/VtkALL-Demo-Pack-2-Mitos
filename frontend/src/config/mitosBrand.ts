export const mitosBrand = {
  name: 'MITOS RENT A CAR',
  shortName: 'MITOS',
  descriptor: 'RENT A CAR',
  tagline: 'Alquila fácil, viaja seguro.',
  domain: 'www.mitosrentacar.com',
  instagramHandle: '@mitosrentacar',
  instagramUrl: 'https://www.instagram.com/mitosrentacar/',
  whatsappDisplay: '+51 941 368 086',
  whatsappUrl: 'https://wa.me/51941368086',
  market: 'Lima, Perú',
  colors: {
    navy: '#062866',
    navySecondary: '#0b367f',
    blue: '#1556b8',
    ink: '#082b6e',
    body: '#425478',
    muted: '#71809d',
    line: '#dce5f2',
    soft: '#f5f8fc',
    white: '#ffffff',
  },
} as const

export type MitosBrand = typeof mitosBrand
