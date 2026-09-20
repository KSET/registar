// Field labels and enum options shared across forms and views

export const FIELD_LABELS = {
  firstName: 'Ime',
  lastName: 'Prezime',
  oib: 'OIB',
  dateOfBirth: 'Datum rođenja',
  address: 'Adresa',
  gender: 'Spol',
  faculty: 'Fakultet',
  phone: 'Broj telefona',
  privateEmail: 'Privatni e-mail',
  ksetEmail: 'KSET e-mail',
  memberSince: 'Datum učlanjenja',
  cardNumber: 'Broj iskaznice',
  membershipLevel: 'Razina članstva',
  fullMemberSince: 'Datum punopravnog članstva',
  homeSectionId: 'Matična sekcija',
  sectionIds: 'Pridružene sekcije',
  teamIds: 'Timovi',
  drinkIds: 'Pića',
  allergyIds: 'Alergije',
  dietType: 'Tip prehrane',
  shirtSize: 'Veličina majice',
  acceptedDocuments: 'Prihvaćanje akata',
};

export const GENDER_OPTIONS = [
  { value: 'M', label: 'Muški' },
  { value: 'Z', label: 'Ženski' },
];

export const MEMBERSHIP_LEVEL_OPTIONS = [
  { value: 'PRIDRUZENO', label: 'Pridruženo' },
  { value: 'PUNOPRAVNO', label: 'Punopravno' },
  { value: 'POCASNO', label: 'Počasno' },
  { value: 'STARO', label: 'Staro' },
];

export const DIET_TYPE_OPTIONS = [
  { value: 'MESOJED', label: 'Mesojed' },
  { value: 'VEGETARIJANSTVO', label: 'Vegetarijanstvo' },
  { value: 'VEGANSTVO', label: 'Veganstvo' },
  { value: 'SVEJED', label: 'Svejed' },
];

export const SHIRT_SIZE_OPTIONS = [
  { value: 'XS', label: 'XS' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
  { value: 'XXL', label: 'XXL' },
  { value: 'XXXL', label: 'XXXL' },
];
