// Attribution for the bundled place photos (all from Wikimedia Commons under Creative Commons licences).
export interface PhotoCredit {
  image: string;
  author: string;
  license: string;
  source: string;
}

export const PHOTO_CREDITS: PhotoCredit[] = [
  {
    image: '/images/places/nallur-kandaswamy-kovil.jpg',
    author: 'Gane Kumaraswamy',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Nallur_Kandasamy_front_entrance.jpg'
  },
  {
    image: '/images/places/jaffna-fort.jpg',
    author: 'Rehman Abubakr',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Jaffna_Fort_(1).jpg'
  },
  {
    image: '/images/places/jaffna-public-library.jpg',
    author: 'Anton Croos',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Public_Library,_Jaffna.JPG'
  },
  {
    image: '/images/places/archaeological-museum.jpg',
    author: 'David Stanley from Nanaimo, Canada',
    license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Jaffna_Archaeological_Museum_(43381375530).jpg'
  },
  {
    image: '/images/places/st-marys-cathedral.jpg',
    author: 'Ghostface Buddha',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:St._Mary%27s_Cathedral,_Jaffna.jpg'
  },
  {
    image: '/images/places/jaffna-central-market.jpg',
    author: 'David Brewer',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Jaffna_market_9.jpg'
  },
  {
    image: '/images/places/keerimalai-springs.jpg',
    author: 'Anton Croos',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Keerimalai_Pond,_Jaffna.JPG'
  },
  {
    image: '/images/places/kks-beach.jpg',
    author: 'Hiran66',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Kankesanthurai_Beach.jpg'
  },
  {
    image: '/images/places/casuarina-beach.jpg',
    author: 'Indi Samarajiva',
    license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Casuarina_Beach.jpg'
  },
  {
    image: '/images/places/sangupiddy-bridge.jpg',
    author: 'Swarnamalitha',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Jaffna-Mannar_Sangapitti_bridge.jpg'
  }
];

export function photoCreditFor(imageUrl: string | null | undefined): PhotoCredit | undefined {
  return imageUrl ? PHOTO_CREDITS.find((c) => c.image === imageUrl) : undefined;
}
