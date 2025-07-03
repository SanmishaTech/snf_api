import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  const dombivliEast = await prisma.city.upsert({
    where: { name: 'Dombivli (East)' },
    update: {},
    create: { name: 'Dombivli (East)' },
  });

  const dombivliWest = await prisma.city.upsert({
    where: { name: 'Dombivli (West)' },
    update: {},
    create: { name: 'Dombivli (West)' },
  });

  const locations = [
    { name: 'Runwal Garden City', cityId: dombivliEast.id },
    { name: 'Runwal MyCity', cityId: dombivliEast.id },
    { name: 'Palava Phase - 2', cityId: dombivliEast.id },
    { name: 'Casa Bella', cityId: dombivliEast.id },
    { name: 'Casa Rio', cityId: dombivliEast.id },
    { name: 'Lodha Premier', cityId: dombivliEast.id },
    { name: 'Lodha Elite', cityId: dombivliEast.id },
    { name: 'Nilje Gaon', cityId: dombivliEast.id },
    { name: 'Regency, Davdi Village', cityId: dombivliEast.id },
    { name: 'Regency Anantam', cityId: dombivliEast.id },
    { name: 'MIDC area', cityId: dombivliEast.id },
    { name: 'Gograswadi', cityId: dombivliEast.id },
    { name: 'Ajdegaon', cityId: dombivliEast.id },
    { name: 'Gharda Circle', cityId: dombivliEast.id },
    { name: 'Shankeshwar Nagar', cityId: dombivliEast.id },
    { name: 'Sanghvi Garden', cityId: dombivliEast.id },
    { name: 'Lodha Heaven', cityId: dombivliEast.id },
    { name: 'Navneet Nagar', cityId: dombivliEast.id },
    { name: 'Sagaon', cityId: dombivliEast.id },
    { name: 'Gandhi Nagar', cityId: dombivliEast.id },
    { name: 'P & T Colony', cityId: dombivliEast.id },
    { name: 'Nandivli Area', cityId: dombivliEast.id },
    { name: 'Rajaji Path', cityId: dombivliEast.id },
    { name: 'Ayre Village', cityId: dombivliEast.id },
    { name: 'Dattanagar', cityId: dombivliEast.id },
    { name: 'Shrikhandewadi', cityId: dombivliEast.id },
    { name: 'Dombivli East Station Area', cityId: dombivliEast.id },
    { name: 'Sunil Nagar', cityId: dombivliEast.id },
    { name: 'DNC School Area', cityId: dombivliEast.id },
    { name: 'Phadke Road', cityId: dombivliEast.id },
    { name: 'Saraswat Colony', cityId: dombivliEast.id },
    { name: 'Thakurli Station area', cityId: dombivliEast.id },
    { name: 'Tilak Nagar', cityId: dombivliEast.id },
    { name: '90 Feet', cityId: dombivliEast.id },
    { name: 'Koper', cityId: dombivliWest.id },
    { name: 'Station Area', cityId: dombivliWest.id },
    { name: 'Shastri Nagar', cityId: dombivliWest.id },
    { name: 'Vishnu Nagar', cityId: dombivliWest.id },
    { name: 'Kumbarghan Pada', cityId: dombivliWest.id },
    { name: 'Umesh Nagar', cityId: dombivliWest.id },
    { name: 'Motha Gaon', cityId: dombivliWest.id },
    { name: 'Swaminarayn City', cityId: dombivliWest.id },
  ];

  for (const locationData of locations) {
    await prisma.location.create({
      data: locationData,
    });
  }

  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
