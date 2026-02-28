
import { Article, Assortment, AssortmentType, User, UserRole } from './types';

export const ASSORTMENTS: Assortment[] = [
  {
    id: 'as-women-01',
    name: 'Standard Women (4-8)',
    type: AssortmentType.WOMEN,
    totalPairsPerCarton: 24,
    breakup: [
      { size: '4', pairs: 3 },
      { size: '5', pairs: 6 },
      { size: '6', pairs: 6 },
      { size: '7', pairs: 6 },
      { size: '8', pairs: 3 },
    ]
  },
  {
    id: 'as-men-01',
    name: 'Standard Men (6-11)',
    type: AssortmentType.MEN,
    totalPairsPerCarton: 24,
    breakup: [
      { size: '6', pairs: 2 },
      { size: '7', pairs: 4 },
      { size: '8', pairs: 6 },
      { size: '9', pairs: 6 },
      { size: '10', pairs: 4 },
      { size: '11', pairs: 2 },
    ]
  },
  {
    id: 'as-kids-01',
    name: 'Standard Kids (2-5)',
    type: AssortmentType.KIDS,
    totalPairsPerCarton: 24,
    breakup: [
      { size: '2', pairs: 4 },
      { size: '3', pairs: 8 },
      { size: '4', pairs: 8 },
      { size: '5', pairs: 4 },
    ]
  }
];

const generateArticles = (): Article[] => {
  const data = [
    // Men Armour
    { name: 'Armour', desc: 'Fabrication', col: 'Navy', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    { name: 'Armour', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    { name: 'Armour', desc: 'Fabrication', col: 'Grey', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    // Men Bermuda
    { name: 'Bermuda', desc: 'Slide', col: 'Lime', gen: 'Men', cat: AssortmentType.MEN, price: 850 },
    { name: 'Bermuda', desc: 'Slide', col: 'Red', gen: 'Men', cat: AssortmentType.MEN, price: 850 },
    { name: 'Bermuda', desc: 'Slide', col: 'White', gen: 'Men', cat: AssortmentType.MEN, price: 850 },
    // Women Bounce
    { name: 'Bounce', desc: 'Slide', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 950 },
    { name: 'Bounce', desc: 'Slide', col: 'Lilac', gen: 'Women', cat: AssortmentType.WOMEN, price: 950 },
    { name: 'Bounce', desc: 'Slide', col: 'Navy', gen: 'Women', cat: AssortmentType.WOMEN, price: 950 },
    { name: 'Bounce', desc: 'Slide', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 950 },
    // Women Braid
    { name: 'Braid', desc: 'Slide', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1150 },
    { name: 'Braid', desc: 'Slide', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1150 },
    { name: 'Braid', desc: 'Slide', col: 'Peach', gen: 'Women', cat: AssortmentType.WOMEN, price: 1150 },
    // Women Breeze
    { name: 'Breeze', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1550 },
    { name: 'Breeze', desc: 'Fabrication', col: 'Grey', gen: 'Women', cat: AssortmentType.WOMEN, price: 1550 },
    { name: 'Breeze', desc: 'Fabrication', col: 'Navy', gen: 'Women', cat: AssortmentType.WOMEN, price: 1550 },
    { name: 'Breeze', desc: 'Fabrication', col: 'Purple', gen: 'Women', cat: AssortmentType.WOMEN, price: 1550 },
    { name: 'Breeze', desc: 'Fabrication', col: 'Sage', gen: 'Women', cat: AssortmentType.WOMEN, price: 1550 },
    // Women Cloud
    { name: 'Cloud', desc: 'Fabrication', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1350 },
    { name: 'Cloud', desc: 'Fabrication', col: 'Lilac', gen: 'Women', cat: AssortmentType.WOMEN, price: 1350 },
    { name: 'Cloud', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1350 },
    { name: 'Cloud', desc: 'Fabrication', col: 'Navy', gen: 'Women', cat: AssortmentType.WOMEN, price: 1350 },
    // Women Crystal
    { name: 'Crystal', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1650 },
    { name: 'Crystal', desc: 'Fabrication', col: 'Grey', gen: 'Women', cat: AssortmentType.WOMEN, price: 1650 },
    { name: 'Crystal', desc: 'Fabrication', col: 'Navy', gen: 'Women', cat: AssortmentType.WOMEN, price: 1650 },
    // Women Cuddle
    { name: 'CUDDLE', desc: 'Slide', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1050 },
    { name: 'CUDDLE', desc: 'Slide', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1050 },
    { name: 'CUDDLE', desc: 'Slide', col: 'Pink', gen: 'Women', cat: AssortmentType.WOMEN, price: 1050 },
    // Men Formula
    { name: 'Formula', desc: 'Slide', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1250 },
    { name: 'Formula', desc: 'Slide', col: 'White', gen: 'Men', cat: AssortmentType.MEN, price: 1250 },
    // Men Glitch
    { name: 'Glitch', desc: 'Slide', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1350 },
    { name: 'Glitch', desc: 'Slide', col: 'White', gen: 'Men', cat: AssortmentType.MEN, price: 1350 },
    { name: 'Glitch', desc: 'Slide', col: 'Olive', gen: 'Men', cat: AssortmentType.MEN, price: 1350 },
    { name: 'Glitch', desc: 'Slide', col: 'Beige', gen: 'Men', cat: AssortmentType.MEN, price: 1350 },
    // Men Halo
    { name: 'Halo', desc: 'Slide', col: 'Beige', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    { name: 'Halo', desc: 'Slide', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    { name: 'Halo', desc: 'Slide', col: 'Olive', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    { name: 'Halo', desc: 'Slide', col: 'Navy', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    // Women Iceberg
    { name: 'Iceberg', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1750 },
    { name: 'Iceberg', desc: 'Fabrication', col: 'Grey', gen: 'Women', cat: AssortmentType.WOMEN, price: 1750 },
    { name: 'Iceberg', desc: 'Fabrication', col: 'Navy', gen: 'Women', cat: AssortmentType.WOMEN, price: 1750 },
    { name: 'Iceberg', desc: 'Fabrication', col: 'Purple', gen: 'Women', cat: AssortmentType.WOMEN, price: 1750 },
    // Women Palm
    { name: 'Palm', desc: 'Slide', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 950 },
    { name: 'Palm', desc: 'Slide', col: 'Mint', gen: 'Women', cat: AssortmentType.WOMEN, price: 950 },
    { name: 'Palm', desc: 'Slide', col: 'Peach', gen: 'Women', cat: AssortmentType.WOMEN, price: 950 },
    // Kids Panda
    { name: 'Panda', desc: 'Slide', col: 'Navy', gen: 'Kids', cat: AssortmentType.KIDS, price: 550 },
    { name: 'Panda', desc: 'Slide', col: 'Lt. Pink', gen: 'Kids', cat: AssortmentType.KIDS, price: 550 },
    // Women Plush
    { name: 'Plush', desc: 'Slide', col: 'Sage-Blue', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    { name: 'Plush', desc: 'Slide', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    { name: 'Plush', desc: 'Slide', col: 'Navy', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    // Women Shimmer
    { name: 'Shimmer', desc: 'PVC', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1350 },
    { name: 'Shimmer', desc: 'PVC', col: 'Grey', gen: 'Women', cat: AssortmentType.WOMEN, price: 1350 },
    { name: 'Shimmer', desc: 'PVC', col: 'Lilac', gen: 'Women', cat: AssortmentType.WOMEN, price: 1350 },
    // Kids Street
    { name: 'Street', desc: 'Slide', col: 'Red', gen: 'Kids', cat: AssortmentType.KIDS, price: 650 },
    { name: 'Street', desc: 'Slide', col: 'Black', gen: 'Kids', cat: AssortmentType.KIDS, price: 650 },
    // Kids Torque
    { name: 'Torque', desc: 'Slide', col: 'J. Navy', gen: 'Kids', cat: AssortmentType.KIDS, price: 750 },
    { name: 'Torque', desc: 'Slide', col: 'Grey', gen: 'Kids', cat: AssortmentType.KIDS, price: 750 },
    // Men Vance
    { name: 'Vance', desc: 'Fabrication', col: 'Beige', gen: 'Men', cat: AssortmentType.MEN, price: 1850 },
    { name: 'Vance', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1850 },
    { name: 'Vance', desc: 'Fabrication', col: 'Brown', gen: 'Men', cat: AssortmentType.MEN, price: 1850 },
    // Men Kore
    { name: 'Kore', desc: 'Slide', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1150 },
    { name: 'Kore', desc: 'Slide', col: 'Grey', gen: 'Men', cat: AssortmentType.MEN, price: 1150 },
    { name: 'Kore', desc: 'Slide', col: 'Olive', gen: 'Men', cat: AssortmentType.MEN, price: 1150 },
    // Men Zorro
    { name: 'Zorro', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1950 },
    { name: 'Zorro', desc: 'Fabrication', col: 'Grey', gen: 'Men', cat: AssortmentType.MEN, price: 1950 },
    { name: 'Zorro', desc: 'Fabrication', col: 'Olive', gen: 'Men', cat: AssortmentType.MEN, price: 1950 },
    // Men Echo
    { name: 'Echo', desc: 'PVC', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1050 },
    { name: 'Echo', desc: 'PVC', col: 'Navy', gen: 'Men', cat: AssortmentType.MEN, price: 1050 },
    { name: 'Echo', desc: 'PVC', col: 'Teal', gen: 'Men', cat: AssortmentType.MEN, price: 1050 },
    { name: 'Echo', desc: 'PVC', col: 'Tan', gen: 'Men', cat: AssortmentType.MEN, price: 1050 },
    // Women Lumia
    { name: 'Lumia', desc: 'PVC', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    { name: 'Lumia', desc: 'PVC', col: 'Brown', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    { name: 'Lumia', desc: 'PVC', col: 'Rose.Gold', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    // Women Plim
    { name: 'Plim', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1450 },
    { name: 'Plim', desc: 'Fabrication', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1450 },
    { name: 'Plim', desc: 'Fabrication', col: 'Rose.Gold', gen: 'Women', cat: AssortmentType.WOMEN, price: 1450 },
    // Women Riva
    { name: 'Riva', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1650 },
    { name: 'Riva', desc: 'Fabrication', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1650 },
    { name: 'Riva', desc: 'Fabrication', col: 'Rose.Gold', gen: 'Women', cat: AssortmentType.WOMEN, price: 1650 },
    // Women Tropica
    { name: 'Tropica', desc: 'PVC', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1150 },
    // Men LaidBack
    { name: 'LaidBack', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 2150 },
    { name: 'LaidBack', desc: 'Fabrication', col: 'Navy', gen: 'Men', cat: AssortmentType.MEN, price: 2150 },
    // Men Ridge
    { name: 'Ridge', desc: 'Fabrication', col: 'Brown', gen: 'Men', cat: AssortmentType.MEN, price: 2250 },
    // Men Floam
    { name: 'Floam', desc: 'Slide', col: 'Black/Grey', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    { name: 'Floam', desc: 'Slide', col: 'Brown/Beige', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    { name: 'Floam', desc: 'Slide', col: 'Grey/Navy', gen: 'Men', cat: AssortmentType.MEN, price: 1450 },
    // Men Phantom
    { name: 'Phantom', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 2350 },
    { name: 'Phantom', desc: 'Fabrication', col: 'Navy', gen: 'Men', cat: AssortmentType.MEN, price: 2350 },
    { name: 'Phantom', desc: 'Fabrication', col: 'Grey', gen: 'Men', cat: AssortmentType.MEN, price: 2350 },
    // Women Lust Sandal
    { name: 'Lust Sandal', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1850 },
    { name: 'Lust Sandal', desc: 'Fabrication', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1850 },
    { name: 'Lust Sandal', desc: 'Fabrication', col: 'Pink', gen: 'Women', cat: AssortmentType.WOMEN, price: 1850 },
    // Women Shine Sandal
    { name: 'Shine Sandal', desc: 'Fabrication', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1950 },
    { name: 'Shine Sandal', desc: 'Fabrication', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1950 },
    { name: 'Shine Sandal', desc: 'Fabrication', col: 'Pink', gen: 'Women', cat: AssortmentType.WOMEN, price: 1950 },
    // Women Silk
    { name: 'Silk', desc: 'Slide', col: 'Black', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    { name: 'Silk', desc: 'Slide', col: 'Beige', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    { name: 'Silk', desc: 'Slide', col: 'Rose.Gold', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    { name: 'Silk', desc: 'Slide', col: 'Lilac', gen: 'Women', cat: AssortmentType.WOMEN, price: 1250 },
    // Men Galaxy
    { name: 'Galaxy', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 2450 },
    { name: 'Galaxy', desc: 'Fabrication', col: 'Olive', gen: 'Men', cat: AssortmentType.MEN, price: 2450 },
    { name: 'Galaxy', desc: 'Fabrication', col: 'Dove Grey', gen: 'Men', cat: AssortmentType.MEN, price: 2450 },
    // Men Arizona
    { name: 'Arizona', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 2550 },
    { name: 'Arizona', desc: 'Fabrication', col: 'Grey', gen: 'Men', cat: AssortmentType.MEN, price: 2550 },
    { name: 'Arizona', desc: 'Fabrication', col: 'Brown', gen: 'Men', cat: AssortmentType.MEN, price: 2550 },
    // Men Boston
    { name: 'Boston', desc: 'Fabrication', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 2650 },
    { name: 'Boston', desc: 'Fabrication', col: 'Grey', gen: 'Men', cat: AssortmentType.MEN, price: 2650 },
    { name: 'Boston', desc: 'Fabrication', col: 'Brown', gen: 'Men', cat: AssortmentType.MEN, price: 2650 },
    // Men Madrid
    { name: 'Madrid', desc: 'Slide', col: 'Black', gen: 'Men', cat: AssortmentType.MEN, price: 1550 },
    { name: 'Madrid', desc: 'Slide', col: 'Grey', gen: 'Men', cat: AssortmentType.MEN, price: 1550 },
    { name: 'Madrid', desc: 'Slide', col: 'Brown', gen: 'Men', cat: AssortmentType.MEN, price: 1550 },
  ];

  return data.map((item, idx) => ({
    id: `art-${idx.toString().padStart(3, '0')}`,
    sku: `KK-${item.gen.charAt(0)}-${item.name.replace(/\s+/g, '').toUpperCase()}-${item.col.replace(/\s+/g, '').toUpperCase()}`,
    name: `${item.name} (${item.col})`,
    category: item.cat,
    assortmentId: item.gen === 'Men' ? 'as-men-01' : item.gen === 'Women' ? 'as-women-01' : 'as-kids-01',
    pricePerPair: item.price,
    imageUrl: `https://picsum.photos/seed/${item.name}${item.col}/400/400`
  }));
};

export const INITIAL_ARTICLES: Article[] = generateArticles();

export const MOCK_DISTRIBUTORS: User[] = [
  {
    id: 'dist-1',
    email: 'star.sales@kore.com',
    name: 'Star sales',
    role: UserRole.DISTRIBUTOR,
    location: 'Jaipur, Rajasthan',
    companyName: 'Star sales & Co.'
  },
  {
    id: 'dist-2',
    email: 'neerav.sales@kore.com',
    name: 'Neerav sales',
    role: UserRole.DISTRIBUTOR,
    location: 'Rohtak, Haryana',
    companyName: 'Neerav sales'
  },
  {
    id: 'dist-3',
    email: 'mittal.footwear@kore.com',
    name: 'Mittal footwear',
    role: UserRole.DISTRIBUTOR,
    location: 'Bangalore, Karnataka',
    companyName: 'Mittal footwear'
  },
  {
    id: 'dist-4',
    email: 'mk.footwear@kore.com',
    name: 'Mk Footwear',
    role: UserRole.DISTRIBUTOR,
    location: 'Uttar Pradesh',
    companyName: 'Mk Footwear'
  },
  {
    id: 'dist-5',
    email: 'veda.sales@kore.com',
    name: 'Veda sales',
    role: UserRole.DISTRIBUTOR,
    location: 'Ernakulam, Kerala',
    companyName: 'Veda sales'
  },
  {
    id: 'dist-admin',
    email: 'admin@kore.com',
    name: 'Super Admin',
    role: UserRole.ADMIN,
  }
];
