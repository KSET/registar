const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const sections = [
    'Biciklistička',
    'Disco',
    'Dramska',
    'Foto',
    'Glazbena',
    'Media',
    'Planinarska',
    'Računarska',
    'Tehnička',
    'Video',
  ];
  for (const name of sections) {
    await prisma.section.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${sections.length} sections`);


  const teams = ['Kulinarski', 'Projektni', 'Program'];
  for (const name of teams) {
    await prisma.team.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${teams.length} teams`);


  const allergies = [
    'Gluten',
    'Laktoza',
    'Kikiriki',
  ];
  for (const name of allergies) {
    await prisma.allergy.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${allergies.length} allergies`);


  const drinks = ['Voda', 'Pivo', 'Sok', 'Kava'];
  for (const name of drinks) {
    await prisma.drink.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${drinks.length} drinks`);

  const faculties = [
    'FER', 'FSB', 'PMF', 'FFZG', 'TVZ',
  ];
  for (const name of faculties) {
    await prisma.faculty.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${faculties.length} faculties`);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@udruga.hr';
  await prisma.member.upsert({
    where: { ksetEmail: adminEmail },
    update: { appRole: 'ADMINISTRATOR' },
    create: {
      firstName: 'KSET',
      lastName: 'Admin',
      oib: '00000000000',
      dateOfBirth: new Date('1990-01-01'),
      address: 'Admin adresa',
      gender: 'M',
      phone: '0000000000',
      privateEmail: adminEmail,
      ksetEmail: adminEmail,
      memberSince: new Date(),
      cardNumber: 'ADMIN-001',
      membershipLevel: 'PUNOPRAVNO',
      dietType: 'SVEJED',
      shirtSize: 'M',
      acceptedDocuments: true,
      appRole: 'ADMINISTRATOR',
      homeSectionId: 1,
    },
  });
  console.log(`Seeded admin user: ${adminEmail}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
