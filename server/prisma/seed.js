const prisma = require('../src/lib/prisma');
const { isKsetEmail } = require('../src/utils/email');

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


  // Matches the categories used in the real KSET registration form / Excel export.
  const drinks = [
    'Alkoholno (piva, vodka itd.)',
    'Gazirano (radenska, cola, fanta)',
    'Negazirano (sok, voda, cedevita)',
    'Čaj (topli, ledeni)',
    'Kava (s mlijekom, bez mlijeka)',
  ];
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

  // ADMIN_EMAIL can be either a @kset.org address or a personal one (e.g. a
  // Gmail the person actually logs in with) - matched against whichever
  // field it actually lives in, not assumed to be ksetEmail. Runs every
  // seed, so this account can never be permanently locked out of admin.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@udruga.hr';
  const existingAdmin = await prisma.member.findFirst({
    where: { OR: [{ ksetEmail: adminEmail }, { privateEmail: adminEmail }] },
  });

  if (existingAdmin) {
    await prisma.member.update({
      where: { id: existingAdmin.id },
      data: { appRole: 'ADMINISTRATOR', managedSectionId: null },
    });
  } else {
    await prisma.member.create({
      data: {
        firstName: 'KSET',
        lastName: 'Admin',
        oib: '00000000000',
        dateOfBirth: new Date('1990-01-01'),
        address: 'Admin adresa',
        gender: 'M',
        phone: '0000000000',
        privateEmail: adminEmail,
        ksetEmail: isKsetEmail(adminEmail) ? adminEmail : null,
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
  }
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
